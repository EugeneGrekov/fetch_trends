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

describe('extension Google Trends capture', () => {
  it('registers the Trends detector and keeps broad capture access optional', async () => {
    const manifest = JSON.parse(
      await readFile(resolve(extensionPath, 'manifest.json'), 'utf8'),
    ) as {
      host_permissions?: string[];
      optional_host_permissions?: string[];
      content_scripts?: Array<{ matches: string[]; js: string[] }>;
    };

    expect(manifest.host_permissions).toContain('https://trends.google.com/*');
    expect(manifest.optional_host_permissions).toContain('<all_urls>');
    expect(manifest.content_scripts).toContainEqual(expect.objectContaining({
      matches: ['https://trends.google.com/*'],
      js: ['trends-content-script.js'],
    }));
  });

  it('captures one temporary Trends tab and delivers an image through ChatGPT', async () => {
    const [serviceWorker, contentScript, trendsScript, popup] = await Promise.all([
      readFile(resolve(extensionPath, 'service-worker.js'), 'utf8'),
      readFile(resolve(extensionPath, 'content-script.js'), 'utf8'),
      readFile(resolve(extensionPath, 'trends-content-script.js'), 'utf8'),
      readFile(resolve(extensionPath, 'popup.js'), 'utf8'),
    ]);

    expect(serviceWorker).toContain('chrome.tabs.captureVisibleTab');
    expect(serviceWorker).toContain("active: false");
    expect(serviceWorker).toContain('activeTrendsKey');
    expect(serviceWorker).not.toContain("apiRequest('/api/trends");
    expect(contentScript).toContain("new File([blob], 'google-trends.png'");
    expect(contentScript).toContain("message.type === 'bundle:deliver'");
    expect(trendsScript).toContain('Interest over time');
    expect(trendsScript).toContain('Explore search trends');
    expect(popup).toContain("chrome.permissions.request({ origins: ['<all_urls>'] })");
  });
});
