import { access, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { AutocompleteCollector, CollectContext } from './types.js';

export class CaptchaDetectedError extends Error {
  constructor(message = 'Google showed a CAPTCHA or unusual-traffic page.') {
    super(message);
    this.name = 'CaptchaDetectedError';
  }
}

export class PlaywrightAutocompleteCollector implements AutocompleteCollector {
  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;

  constructor(private readonly headless: boolean) {}

  async collect(prefix: string, context: CollectContext): Promise<string[]> {
    const page = await this.getPage(context);

    await assertNotBlocked(page);
    await focusSearchBox(page);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.type(prefix, { delay: 18 });
    await page.waitForTimeout(350);
    await assertNotBlocked(page);

    await page
      .waitForSelector('[role="listbox"], ul[role="listbox"], div[role="presentation"]', {
        timeout: 2500,
        state: 'visible',
      })
      .catch(() => undefined);

    return extractPredictions(page);
  }

  async close(): Promise<void> {
    await this.context?.close().catch(() => undefined);
    await this.browser?.close().catch(() => undefined);
    this.page = undefined;
    this.context = undefined;
    this.browser = undefined;
  }

  private async getPage(context: CollectContext): Promise<Page> {
    if (this.page && !this.page.isClosed()) {
      return this.page;
    }

    this.browser = await launchChromiumWithFallback(this.headless);
    this.context = await this.browser.newContext({
      locale: `${context.language}-${context.country}`,
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    this.page = await this.context.newPage();

    const url = new URL('https://www.google.com/search');
    url.searchParams.set('hl', context.language);
    url.searchParams.set('gl', context.country);
    url.searchParams.set('q', '');

    await this.page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await acceptConsentIfPresent(this.page);
    await assertNotBlocked(this.page);
    await focusSearchBox(this.page);

    return this.page;
  }
}

async function launchChromiumWithFallback(headless: boolean): Promise<Browser> {
  try {
    return await chromium.launch({ headless });
  } catch (error) {
    if (!isMissingExecutableError(error)) {
      throw error;
    }

    const executablePath = await resolveFallbackExecutablePath(headless);
    if (!executablePath) {
      throw error;
    }

    return chromium.launch({ executablePath, headless });
  }
}

function isMissingExecutableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Executable doesn't exist");
}

export async function resolveFallbackExecutablePath(headless: boolean): Promise<string | undefined> {
  const explicitPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (explicitPath && (await pathExists(explicitPath))) {
    return explicitPath;
  }

  const cacheRoot = resolvePlaywrightCacheRoot();
  if (!cacheRoot) {
    return undefined;
  }

  const directoryEntries = await readdir(cacheRoot, { withFileTypes: true }).catch(() => []);
  const revisions = directoryEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .map(parseInstalledRevision)
    .filter((entry): entry is InstalledRevision => Boolean(entry))
    .sort((left, right) => right.revision - left.revision);

  for (const entry of revisions) {
    const relativePaths = getExecutableRelativePaths(entry.kind, headless);
    for (const relativePath of relativePaths) {
      const executablePath = join(cacheRoot, entry.directoryName, relativePath);
      if (await pathExists(executablePath)) {
        return executablePath;
      }
    }
  }

  return undefined;
}

interface InstalledRevision {
  directoryName: string;
  kind: 'chromium' | 'chromium_headless_shell';
  revision: number;
}

function parseInstalledRevision(directoryName: string): InstalledRevision | undefined {
  const match = /^(chromium|chromium_headless_shell)-(\d+)$/.exec(directoryName);
  if (!match) {
    return undefined;
  }

  return {
    directoryName,
    kind: match[1] as InstalledRevision['kind'],
    revision: Number(match[2]),
  };
}

function resolvePlaywrightCacheRoot(): string | undefined {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH && process.env.PLAYWRIGHT_BROWSERS_PATH !== '0') {
    return process.env.PLAYWRIGHT_BROWSERS_PATH;
  }

  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Caches', 'ms-playwright');
  }

  if (process.platform === 'linux') {
    return join(homedir(), '.cache', 'ms-playwright');
  }

  if (process.platform === 'win32') {
    return join(homedir(), 'AppData', 'Local', 'ms-playwright');
  }

  return undefined;
}

function getExecutableRelativePaths(
  kind: InstalledRevision['kind'],
  headless: boolean,
): string[] {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';

  if (process.platform === 'darwin') {
    const fullBrowser = `chrome-mac-${arch}/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
    const headlessShell = `chrome-headless-shell-mac-${arch}/chrome-headless-shell`;

    if (headless) {
      return kind === 'chromium_headless_shell' ? [headlessShell, fullBrowser] : [fullBrowser];
    }

    return kind === 'chromium' ? [fullBrowser] : [];
  }

  if (process.platform === 'linux') {
    const fullBrowser = `chrome-linux/chrome`;
    const headlessShell = `chrome-headless-shell-linux64/chrome-headless-shell`;

    if (headless) {
      return kind === 'chromium_headless_shell' ? [headlessShell, fullBrowser] : [fullBrowser];
    }

    return kind === 'chromium' ? [fullBrowser] : [];
  }

  if (process.platform === 'win32') {
    const fullBrowser = `chrome-win/chrome.exe`;
    const headlessShell = `chrome-headless-shell-win64/chrome-headless-shell.exe`;

    if (headless) {
      return kind === 'chromium_headless_shell' ? [headlessShell, fullBrowser] : [fullBrowser];
    }

    return kind === 'chromium' ? [fullBrowser] : [];
  }

  return [];
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function focusSearchBox(page: Page): Promise<void> {
  const selectors = ['textarea[name="q"]', 'input[name="q"]'];

  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) > 0) {
      await locator.focus();
      return;
    }
  }

  throw new Error('Could not find the Google search box.');
}

async function acceptConsentIfPresent(page: Page): Promise<void> {
  const buttons = [
    page.getByRole('button', { name: /accept all/i }).first(),
    page.getByRole('button', { name: /i agree/i }).first(),
    page.locator('button:has-text("Accept all")').first(),
    page.locator('button:has-text("I agree")').first(),
  ];

  for (const button of buttons) {
    try {
      if ((await button.count()) > 0 && (await button.isVisible({ timeout: 800 }))) {
        await button.click({ timeout: 1500 });
        await page.waitForTimeout(500);
        return;
      }
    } catch {
      // Consent UI differs by region. If one selector fails, try the next.
    }
  }
}

async function assertNotBlocked(page: Page): Promise<void> {
  const url = page.url().toLowerCase();
  if (url.includes('/sorry/') || url.includes('captcha')) {
    throw new CaptchaDetectedError();
  }

  const pageText = await page.locator('body').innerText({ timeout: 1500 }).catch(() => '');
  const normalized = pageText.toLowerCase();

  if (
    normalized.includes('unusual traffic') ||
    normalized.includes('our systems have detected') ||
    normalized.includes('to continue, please type the characters') ||
    normalized.includes('captcha')
  ) {
    throw new CaptchaDetectedError();
  }
}

async function extractPredictions(page: Page): Promise<string[]> {
  const predictions = await page.evaluate<string[]>(`(() => {
    const normalize = (value) => value.trim().replace(/\\s+/g, ' ');
    const candidates = new Set();
    const listboxes = Array.from(document.querySelectorAll('[role="listbox"], ul[role="listbox"]'));

    for (const listbox of listboxes) {
      const focusedNodes = Array.from(
        listbox.querySelectorAll('[role="option"], li, .sbct, .wM6W7d, [aria-label]'),
      );

      for (const node of focusedNodes) {
        const ariaLabel = node.getAttribute('aria-label');
        if (ariaLabel) {
          candidates.add(normalize(ariaLabel));
        }

        const text = normalize(node.innerText ?? node.textContent ?? '');
        if (text) {
          candidates.add(text);
        }
      }
    }

    return Array.from(candidates);
  })()`);

  return predictions
    .map((prediction) => prediction.replace(/\bremove\b$/i, '').trim())
    .filter((prediction) => prediction.length > 0 && prediction.length < 220);
}
