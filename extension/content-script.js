(function initializeAutocompleteBridgeContentScript() {
  'use strict';

  const shared = globalThis.AutocompleteBridgeShared;
  const ASSISTANT_SELECTOR = '[data-message-author-role="assistant"]';
  const SETTINGS_MESSAGE_SOURCE = 'fetch-trends-autocomplete-bridge';
  const processedMessages = new WeakSet();
  const messageStates = new WeakMap();
  const candidateMessages = new Set();
  let connected = false;
  let mode = 'inactive';
  let scanTimer;
  let overlay;
  let overlayLabel;
  let settingsBackdrop;
  let settingsFrame;
  let currentUrl = location.href;
  let suppressNewMessagesUntil = 0;
  let stateLoaded = false;

  for (const message of document.querySelectorAll(ASSISTANT_SELECTOR)) {
    processedMessages.add(message);
  }

  const observer = new MutationObserver((mutations) => {
    detectNavigation();

    for (const mutation of mutations) {
      collectAssistantMessage(mutation.target);
      for (const node of mutation.addedNodes) {
        collectAssistantMessage(node);
      }
    }

    scheduleScan();
  });

  observer.observe(document.documentElement, {
    childList: true,
    characterData: true,
    subtree: true,
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message !== 'object') {
      return undefined;
    }

    if (message.type === 'bridge:state') {
      applyBridgeState(message);
      sendResponse({ ok: true });
      return undefined;
    }

    if (message.type === 'overlay:show') {
      showOverlay(message.status || 'Working on autocomplete research...');
      sendResponse({ ok: true });
      return undefined;
    }

    if (message.type === 'overlay:hide') {
      hideOverlay();
      sendResponse({ ok: true });
      return undefined;
    }

    if (message.type === 'settings:show') {
      showSettingsPanel(Number(message.tabId));
      sendResponse({ ok: true });
      return undefined;
    }

    if (message.type === 'settings:hide') {
      hideSettingsPanel();
      sendResponse({ ok: true });
      return undefined;
    }

    if (message.type === 'result:auto') {
      void runMessageAction(async () => {
        hideOverlay();
        hideSettingsPanel();
        await deliverComposerPayload(message.markdown, '', true, true);
      }, sendResponse);
      return true;
    }

    if (message.type === 'bundle:deliver') {
      void runMessageAction(async () => {
        hideSettingsPanel();
        await deliverComposerPayload(
          message.markdown || '',
          message.imageDataUrl || '',
          Boolean(message.send),
          true,
        );
        hideOverlay();
      }, sendResponse);
      return true;
    }

    if (message.type === 'composer:insert') {
      void runMessageAction(async () => {
        hideSettingsPanel();
        await deliverComposerPayload(message.text, '', Boolean(message.send));
      }, sendResponse);
      return true;
    }

    return undefined;
  });

  window.addEventListener('message', (event) => {
    if (event.source !== settingsFrame?.contentWindow) {
      return;
    }
    if (event.data?.source === SETTINGS_MESSAGE_SOURCE && event.data?.type === 'settings:close') {
      hideSettingsPanel();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && settingsBackdrop?.isConnected) {
      hideSettingsPanel();
    }
  }, true);

  void chrome.runtime.sendMessage({ type: 'content:ready' }).then((response) => {
    if (response) {
      applyBridgeState(response);
    }
  }).catch(() => {
    stateLoaded = true;
    connected = false;
    scheduleScan();
  });

  function applyBridgeState(nextState) {
    connected = Boolean(nextState.connected);
    mode = nextState.mode || 'inactive';
    stateLoaded = true;
    if (!connected || mode !== 'automatic') {
      hideOverlay();
    }
    scheduleScan();
  }

  function detectNavigation() {
    if (location.href === currentUrl) {
      return;
    }

    currentUrl = location.href;
    hideSettingsPanel();
    suppressNewMessagesUntil = Date.now() + 1_500;
    candidateMessages.clear();
    for (const message of document.querySelectorAll(ASSISTANT_SELECTOR)) {
      processedMessages.add(message);
    }
  }

  function collectAssistantMessage(node) {
    const element = node instanceof Element ? node : node.parentElement;
    if (!element) {
      return;
    }

    const closest = element.closest(ASSISTANT_SELECTOR);
    if (closest) {
      registerCandidate(closest);
    }

    for (const message of element.querySelectorAll?.(ASSISTANT_SELECTOR) || []) {
      registerCandidate(message);
    }
  }

  function registerCandidate(message) {
    if (processedMessages.has(message)) {
      return;
    }

    if (Date.now() < suppressNewMessagesUntil) {
      processedMessages.add(message);
      return;
    }

    candidateMessages.add(message);
  }

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      void scanCandidates();
    }, 200);
  }

  async function scanCandidates() {
    if (!stateLoaded) {
      scheduleScan();
      return;
    }

    if (!connected || !['automatic', 'semi'].includes(mode)) {
      for (const message of candidateMessages) {
        processedMessages.add(message);
      }
      candidateMessages.clear();
      return;
    }

    for (const message of [...candidateMessages]) {
      if (!message.isConnected || processedMessages.has(message)) {
        candidateMessages.delete(message);
        continue;
      }

      const messageState = ensureMessageState(message);
      const classification = messageState.autocompleteHandled
        ? { kind: 'none' }
        : shared.classifyCodeBlocks(readCodeBlocks(message));

      if (classification.kind === 'valid') {
        messageState.autocompleteHandled = true;
        messageState.hasAutocomplete = true;
        await chrome.runtime.sendMessage({
          type: 'request:detected',
          responseKey: messageState.responseKey,
          request: classification.request,
        }).catch(() => undefined);
      }

      if (isChatGenerating()) {
        continue;
      }

      if (classification.kind === 'malformed') {
        messageState.autocompleteHandled = true;
        await chrome.runtime.sendMessage({
          type: 'request:malformed',
          reason: classification.reason,
        }).catch(() => undefined);
      }

      const trends = findGoogleTrendsUrl(message);
      await chrome.runtime.sendMessage({
        type: 'response:finalized',
        responseKey: messageState.responseKey,
        trendsUrl: trends?.url || null,
      }).catch(() => undefined);
      processedMessages.add(message);
      candidateMessages.delete(message);
    }
  }

  function ensureMessageState(message) {
    let messageState = messageStates.get(message);
    if (!messageState) {
      messageState = {
        responseKey: crypto.randomUUID(),
        autocompleteHandled: false,
        hasAutocomplete: false,
      };
      messageStates.set(message, messageState);
    }
    return messageState;
  }

  function readCodeBlocks(message) {
    return [...message.querySelectorAll('pre')]
      .map((pre) => (pre.querySelector('code') || pre).textContent || '')
      .filter(Boolean);
  }

  function findGoogleTrendsUrl(message) {
    const candidates = [];
    const walker = document.createTreeWalker(message, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node instanceof HTMLAnchorElement) {
        candidates.push(node.href);
      } else if (node.nodeType === Node.TEXT_NODE && node.textContent) {
        candidates.push(node.textContent);
      }
    }
    const classification = shared.findFirstGoogleTrendsUrl(candidates);
    return classification.kind === 'valid' ? classification : undefined;
  }

  function isChatGenerating() {
    return Boolean(document.querySelector([
      '[data-testid="stop-button"]',
      'button[aria-label*="Stop generating" i]',
      'button[aria-label="Stop" i]',
    ].join(',')));
  }

  function showOverlay(status) {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'fetch-trends-autocomplete-overlay';
      Object.assign(overlay.style, {
        alignItems: 'center',
        backdropFilter: 'blur(2px)',
        background: 'rgba(15, 23, 42, 0.72)',
        color: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'system-ui, sans-serif',
        gap: '18px',
        inset: '0',
        justifyContent: 'center',
        position: 'fixed',
        zIndex: '2147483646',
      });

      const spinner = document.createElement('div');
      Object.assign(spinner.style, {
        animation: 'fetch-trends-spin 1s linear infinite',
        border: '5px solid rgba(255,255,255,.35)',
        borderRadius: '50%',
        borderTopColor: '#ffffff',
        height: '42px',
        width: '42px',
      });

      const style = document.createElement('style');
      style.textContent = '@keyframes fetch-trends-spin { to { transform: rotate(360deg); } }';
      overlayLabel = document.createElement('div');
      overlayLabel.style.fontSize = '17px';
      overlayLabel.style.fontWeight = '650';

      const stopButton = document.createElement('button');
      stopButton.type = 'button';
      stopButton.textContent = 'Stop automatic work';
      Object.assign(stopButton.style, {
        background: '#ffffff',
        border: '0',
        borderRadius: '10px',
        color: '#111827',
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: '650',
        padding: '11px 16px',
      });
      stopButton.addEventListener('click', () => {
        void chrome.runtime.sendMessage({ type: 'mode:set', mode: 'semi' });
        hideOverlay();
      });

      overlay.append(style, spinner, overlayLabel, stopButton);
    }

    overlayLabel.textContent = status;
    if (!overlay.isConnected) {
      document.documentElement.append(overlay);
    }
  }

  function hideOverlay() {
    overlay?.remove();
  }

  function showSettingsPanel(tabId) {
    if (!Number.isInteger(tabId) || tabId <= 0) {
      return;
    }

    hideSettingsPanel();
    settingsBackdrop = document.createElement('div');
    settingsBackdrop.id = 'fetch-trends-settings-backdrop';
    settingsBackdrop.setAttribute('role', 'dialog');
    settingsBackdrop.setAttribute('aria-label', 'Fetch Trends Autocomplete Bridge settings');
    settingsBackdrop.setAttribute('aria-modal', 'true');
    Object.assign(settingsBackdrop.style, {
      alignItems: 'stretch',
      backdropFilter: 'blur(2px)',
      background: 'rgba(15, 23, 42, 0.42)',
      display: 'flex',
      inset: '0',
      justifyContent: 'flex-end',
      position: 'fixed',
      zIndex: '2147483647',
    });

    settingsFrame = document.createElement('iframe');
    settingsFrame.id = 'fetch-trends-settings-frame';
    settingsFrame.title = 'Fetch Trends Autocomplete Bridge settings';
    settingsFrame.allow = 'clipboard-write';
    settingsFrame.src = chrome.runtime.getURL(`popup.html?embedded=1&tabId=${tabId}`);
    Object.assign(settingsFrame.style, {
      background: '#f4f6fa',
      border: '0',
      boxShadow: '-18px 0 48px rgba(15, 23, 42, 0.24)',
      height: '100%',
      maxWidth: '100%',
      width: 'min(440px, calc(100vw - 16px))',
    });

    settingsBackdrop.addEventListener('click', (event) => {
      if (event.target === settingsBackdrop) {
        hideSettingsPanel();
      }
    });
    settingsFrame.addEventListener('load', () => settingsFrame?.focus(), { once: true });
    settingsBackdrop.append(settingsFrame);
    document.documentElement.append(settingsBackdrop);
  }

  function hideSettingsPanel() {
    settingsBackdrop?.remove();
    settingsBackdrop = undefined;
    settingsFrame = undefined;
  }

  async function deliverComposerPayload(text, imageDataUrl, shouldSend, respectAutomaticMode = false) {
    if (!text && !imageDataUrl) {
      throw new Error('There is no result to insert.');
    }
    await waitForValue(
      () => isChatGenerating() ? undefined : true,
      60 * 60 * 1_000,
      'ChatGPT did not finish its current response.',
    );
    const composer = await waitForValue(findComposer, 30_000, 'ChatGPT composer was not found.');
    await clearComposerAttachments(composer);
    replaceComposerText(composer, text || '');
    if (imageDataUrl) {
      await attachImage(composer, imageDataUrl);
    }

    if (!shouldSend) {
      return;
    }
    if (respectAutomaticMode && mode !== 'automatic') {
      return;
    }

    const sendButton = await waitForValue(() => {
      if (isChatGenerating()) {
        return undefined;
      }
      const button = findSendButton();
      return button && !button.disabled ? button : undefined;
    }, 60 * 60 * 1_000, 'ChatGPT Send button did not become ready.');
    if (respectAutomaticMode && mode !== 'automatic') {
      return;
    }
    sendButton.click();
  }

  async function attachImage(composer, imageDataUrl) {
    const response = await fetch(imageDataUrl);
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) {
      throw new Error('The Google Trends result is not an image.');
    }

    const file = new File([blob], 'google-trends.png', { type: blob.type || 'image/png' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const existingPreviews = new Set(findAttachmentPreviews(composer));
    const input = findFileInput();
    if (input) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files')?.set;
      setter?.call(input, transfer.files);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      composer.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer: transfer }));
      composer.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: transfer }));
      composer.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }));
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_000));
    await waitForValue(() => {
      return findAttachmentPreviews(composer).some((preview) => !existingPreviews.has(preview))
        ? true
        : undefined;
    }, 60_000, 'ChatGPT did not attach the Google Trends screenshot.');
  }

  function findFileInput() {
    const selectors = [
      'form input[type="file"][accept*="image"]',
      'form input[type="file"]',
      'input[type="file"][accept*="image"]',
    ];
    return selectors.map((selector) => document.querySelector(selector)).find(Boolean);
  }

  async function clearComposerAttachments(composer) {
    const form = composer.closest('form') || composer.parentElement;
    const buttons = [...(form?.querySelectorAll([
      'button[aria-label*="remove attachment" i]',
      'button[aria-label*="remove file" i]',
    ].join(',')) || [])];
    for (const button of buttons) {
      button.click();
    }
    if (buttons.length > 0) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
    }
  }

  function findAttachmentPreviews(composer) {
    const form = composer.closest('form') || composer.parentElement;
    return [...(form?.querySelectorAll([
      '[data-testid*="attachment" i]',
      '[data-testid*="file" i]',
      'button[aria-label*="remove attachment" i]',
      'button[aria-label*="remove file" i]',
      'img[alt*="uploaded" i]',
      'img[src^="blob:"]',
      '[class*="attachment" i] img',
      '[class*="file" i] img',
    ].join(',')) || [])];
  }

  function findComposer() {
    const selectors = [
      '#prompt-textarea',
      'textarea[data-testid="prompt-textarea"]',
      'form textarea',
      'form [contenteditable="true"]',
    ];

    return selectors.map((selector) => document.querySelector(selector)).find((element) => {
      return element && !element.closest('#fetch-trends-autocomplete-overlay');
    });
  }

  function findSendButton() {
    const selectors = [
      'button[data-testid="send-button"]',
      'button[data-testid="composer-submit-button"]',
      'button[aria-label="Send prompt"]',
      'button[aria-label="Send message"]',
      'button[aria-label="Send"]',
    ];

    return selectors.map((selector) => document.querySelector(selector)).find(Boolean);
  }

  function replaceComposerText(composer, text) {
    composer.focus();

    if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
      const prototype = composer instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      setter?.call(composer, text);
      composer.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        data: text,
        inputType: 'insertText',
      }));
      return;
    }

    if (!text) {
      composer.replaceChildren();
      composer.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        data: null,
        inputType: 'deleteContentBackward',
      }));
      return;
    }

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(composer);
    selection?.removeAllRanges();
    selection?.addRange(range);

    const inserted = document.execCommand('insertText', false, text);
    if (!inserted) {
      composer.replaceChildren(document.createTextNode(text));
      composer.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        data: text,
        inputType: 'insertText',
      }));
    }
  }

  async function waitForValue(getValue, timeoutMs, timeoutMessage) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const value = getValue();
      if (value) {
        return value;
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
    }

    throw new Error(timeoutMessage);
  }

  async function runMessageAction(action, sendResponse) {
    try {
      await action();
      sendResponse({ ok: true });
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
})();
