import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveFallbackExecutablePath } from './collector.js';

describe('resolveFallbackExecutablePath', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses an explicit PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH when present', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fetch-trends-autocomplete-collector-'));
    const executablePath = join(dir, 'chrome');
    await writeFile(executablePath, '');
    vi.stubEnv('PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH', executablePath);

    await expect(resolveFallbackExecutablePath(true)).resolves.toBe(executablePath);
  });

  it('finds the newest installed headless shell in PLAYWRIGHT_BROWSERS_PATH', async () => {
    const cacheRoot = await mkdtemp(join(tmpdir(), 'fetch-trends-autocomplete-cache-'));
    const shell = platformExecutableFixture('shell');
    const olderDir = join(cacheRoot, 'chromium_headless_shell-1223', shell.directory);
    const newerDir = join(cacheRoot, 'chromium_headless_shell-1228', shell.directory);
    await mkdir(olderDir, { recursive: true });
    await mkdir(newerDir, { recursive: true });
    await writeFile(join(olderDir, shell.executable), '');
    await writeFile(join(newerDir, shell.executable), '');
    vi.stubEnv('PLAYWRIGHT_BROWSERS_PATH', cacheRoot);

    await expect(resolveFallbackExecutablePath(true)).resolves.toBe(join(newerDir, shell.executable));
  });

  it('falls back to a full Chromium executable for headless mode when no shell is installed', async () => {
    const cacheRoot = await mkdtemp(join(tmpdir(), 'fetch-trends-autocomplete-browser-'));
    const browser = platformExecutableFixture('browser');
    const browserDir = join(cacheRoot, 'chromium-1228', browser.directory);
    await mkdir(browserDir, { recursive: true });
    await writeFile(join(browserDir, browser.executable), '');
    vi.stubEnv('PLAYWRIGHT_BROWSERS_PATH', cacheRoot);

    await expect(resolveFallbackExecutablePath(true)).resolves.toBe(join(browserDir, browser.executable));
  });
});

function platformExecutableFixture(kind: 'browser' | 'shell'): { directory: string; executable: string } {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';

  if (process.platform === 'darwin') {
    return kind === 'shell'
      ? { directory: `chrome-headless-shell-mac-${arch}`, executable: 'chrome-headless-shell' }
      : {
          directory: join('chrome-mac-' + arch, 'Google Chrome for Testing.app', 'Contents', 'MacOS'),
          executable: 'Google Chrome for Testing',
        };
  }

  if (process.platform === 'win32') {
    return kind === 'shell'
      ? { directory: 'chrome-headless-shell-win64', executable: 'chrome-headless-shell.exe' }
      : { directory: 'chrome-win', executable: 'chrome.exe' };
  }

  return kind === 'shell'
    ? { directory: 'chrome-headless-shell-linux64', executable: 'chrome-headless-shell' }
    : { directory: 'chrome-linux', executable: 'chrome' };
}
