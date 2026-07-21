import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const extensionPath = resolve(process.cwd(), 'extension');

describe('extension settings drawer', () => {
  it('exposes only the drawer resources to chatgpt.com', async () => {
    const manifest = JSON.parse(
      await readFile(resolve(extensionPath, 'manifest.json'), 'utf8'),
    ) as {
      web_accessible_resources?: Array<{ resources: string[]; matches: string[] }>;
    };

    expect(manifest.web_accessible_resources).toEqual([
      {
        resources: ['popup.html', 'popup.css', 'popup.js'],
        matches: ['https://chatgpt.com/*'],
      },
    ]);
  });

  it('opens an in-page iframe instead of a separate Chrome window', async () => {
    const [serviceWorker, contentScript, popup] = await Promise.all([
      readFile(resolve(extensionPath, 'service-worker.js'), 'utf8'),
      readFile(resolve(extensionPath, 'content-script.js'), 'utf8'),
      readFile(resolve(extensionPath, 'popup.html'), 'utf8'),
    ]);

    expect(serviceWorker).not.toContain('chrome.windows.create');
    expect(serviceWorker).toContain("type: 'settings:show'");
    expect(contentScript).toContain("message.type === 'settings:show'");
    expect(contentScript).toContain("document.createElement('iframe')");
    expect(popup).toContain('id="close"');
  });
});
