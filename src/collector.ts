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

    this.browser = await chromium.launch({ headless: this.headless });
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
