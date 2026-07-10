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
    const olderDir = join(cacheRoot, 'chromium_headless_shell-1223', 'chrome-headless-shell-mac-x64');
    const newerDir = join(cacheRoot, 'chromium_headless_shell-1228', 'chrome-headless-shell-mac-x64');
    await mkdir(olderDir, { recursive: true });
    await mkdir(newerDir, { recursive: true });
    await writeFile(join(olderDir, 'chrome-headless-shell'), '');
    await writeFile(join(newerDir, 'chrome-headless-shell'), '');
    vi.stubEnv('PLAYWRIGHT_BROWSERS_PATH', cacheRoot);

    await expect(resolveFallbackExecutablePath(true)).resolves.toBe(join(newerDir, 'chrome-headless-shell'));
  });

  it('falls back to a full Chromium executable for headless mode when no shell is installed', async () => {
    const cacheRoot = await mkdtemp(join(tmpdir(), 'fetch-trends-autocomplete-browser-'));
    const browserDir = join(
      cacheRoot,
      'chromium-1228',
      'chrome-mac-x64',
      'Google Chrome for Testing.app',
      'Contents',
      'MacOS',
    );
    await mkdir(browserDir, { recursive: true });
    await writeFile(join(browserDir, 'Google Chrome for Testing'), '');
    vi.stubEnv('PLAYWRIGHT_BROWSERS_PATH', cacheRoot);

    await expect(resolveFallbackExecutablePath(true)).resolves.toBe(join(browserDir, 'Google Chrome for Testing'));
  });
});
