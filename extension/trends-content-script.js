(function initializeGoogleTrendsCapture() {
  'use strict';

  const READY_TIMEOUT_MS = 60_000;
  const POLL_INTERVAL_MS = 1_000;
  let tracked = false;
  let startedAt = Date.now();
  let lastReport = '';
  let scanTimer;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message !== 'object') {
      return undefined;
    }
    if (message.type === 'trends:scan') {
      lastReport = '';
      scheduleScan(0);
      sendResponse({ ok: true });
      return undefined;
    }
    if (message.type === 'trends:prepare') {
      void prepareCapture().then(sendResponse, (error) => {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
      });
      return true;
    }
    return undefined;
  });

  void chrome.runtime.sendMessage({ type: 'trends:content-ready' }).then((response) => {
    tracked = Boolean(response?.tracked);
    if (tracked) {
      scheduleScan(0);
    }
  }).catch(() => undefined);

  function scheduleScan(delay = POLL_INTERVAL_MS) {
    clearTimeout(scanTimer);
    if (tracked) {
      scanTimer = setTimeout(() => void scan(), delay);
    }
  }

  async function scan() {
    const attentionReason = detectManualAttention();
    if (attentionReason) {
      await report('attention', { type: 'trends:attention', reason: attentionReason });
      scheduleScan();
      return;
    }

    const cards = findCaptureCards();
    if (cards) {
      await report('ready', { type: 'trends:page-ready' });
      scheduleScan();
      return;
    }

    if (Date.now() - startedAt >= READY_TIMEOUT_MS) {
      await report('attention', {
        type: 'trends:attention',
        reason: 'The Interest over time chart did not become ready. Finish any Google prompt, then use Retry if needed.',
      });
    }
    scheduleScan();
  }

  async function report(kind, message) {
    if (lastReport === kind) {
      return;
    }
    lastReport = kind;
    await chrome.runtime.sendMessage(message).catch(() => undefined);
  }

  async function prepareCapture() {
    const cards = findCaptureCards();
    if (!cards) {
      throw new Error('The Google Trends controls or Interest over time chart were not found.');
    }

    const documentRect = unionRects(cards.map((card) => absoluteRect(card)));
    const targetTop = Math.max(0, documentRect.top - 8);
    window.scrollTo({ top: targetTop, left: 0, behavior: 'instant' });
    await nextPaint();
    await document.fonts?.ready?.catch(() => undefined);
    await nextPaint();

    const viewportRect = unionRects(cards.map((card) => card.getBoundingClientRect()));
    if (
      viewportRect.top < 0
      || viewportRect.left < 0
      || viewportRect.right > window.innerWidth
      || viewportRect.bottom > window.innerHeight
    ) {
      throw new Error('The selected Google Trends cards do not fit in the visible window. Enlarge the Chrome window and retry.');
    }

    return {
      ok: true,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      rect: viewportRect,
    };
  }

  function findCaptureCards() {
    const controls = firstVisible([
      document.querySelector('explore-pickers'),
      document.querySelector('[class*="explore-pickers"]'),
      findCardFromLabel('Explore search trends', (element) => {
        return element.querySelectorAll('button, [role="button"], input').length >= 2;
      }),
    ]);
    const chart = firstVisible([
      document.querySelector('widget[type="fe_line"]'),
      document.querySelector('line-chart-widget'),
      document.querySelector('[class*="fe-line-chart"]'),
      findCardFromLabel('Interest over time', (element) => {
        return Boolean(element.querySelector('svg, canvas'));
      }),
    ]);
    const controlsCard = controls && expandToCard(controls, 'controls');
    const chartCard = chart && expandToCard(chart, 'chart');
    if (!controlsCard || !chartCard || !chartCard.querySelector('svg, canvas')) {
      return undefined;
    }
    return [controlsCard, chartCard];
  }

  function findCardFromLabel(label, predicate) {
    const labels = [...document.querySelectorAll('h1, h2, h3, div, span')]
      .filter((element) => element.childElementCount <= 3 && element.textContent?.trim() === label);
    for (const labelElement of labels) {
      let candidate = labelElement;
      for (let depth = 0; candidate && depth < 9; depth += 1, candidate = candidate.parentElement) {
        const rect = candidate.getBoundingClientRect();
        if (
          rect.width >= window.innerWidth * 0.7
          && rect.height >= 100
          && rect.height <= window.innerHeight
          && predicate(candidate)
        ) {
          return candidate;
        }
      }
    }
    return undefined;
  }

  function expandToCard(element, kind) {
    let best = element;
    for (let candidate = element; candidate && candidate !== document.body; candidate = candidate.parentElement) {
      const rect = candidate.getBoundingClientRect();
      if (rect.width < window.innerWidth * 0.65 || rect.height <= 0) {
        continue;
      }
      const heightLimit = kind === 'controls' ? 420 : 650;
      if (rect.height > heightLimit || rect.height > window.innerHeight) {
        break;
      }
      best = candidate;
      const style = getComputedStyle(candidate);
      if (style.borderRadius !== '0px' && style.backgroundColor !== 'rgba(0, 0, 0, 0)') {
        break;
      }
    }
    return isVisible(best) ? best : undefined;
  }

  function detectManualAttention() {
    const text = document.body?.innerText || '';
    if (document.querySelector('iframe[src*="recaptcha"], [class*="captcha" i], [id*="captcha" i]')) {
      return 'Complete the CAPTCHA in Google Trends to continue.';
    }
    if (/unusual traffic|verify you are human|not a robot/i.test(text)) {
      return 'Complete Google verification to continue.';
    }
    if (/before you continue to google|agree and continue|accept all/i.test(text)) {
      return 'Complete the Google consent screen to continue.';
    }
    return '';
  }

  function firstVisible(elements) {
    return elements.find((element) => element && isVisible(element));
  }

  function isVisible(element) {
    const rect = element?.getBoundingClientRect();
    const style = element && getComputedStyle(element);
    return Boolean(
      rect
      && rect.width > 20
      && rect.height > 20
      && style?.display !== 'none'
      && style?.visibility !== 'hidden'
    );
  }

  function absoluteRect(element) {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left + window.scrollX,
      top: rect.top + window.scrollY,
      right: rect.right + window.scrollX,
      bottom: rect.bottom + window.scrollY,
    };
  }

  function unionRects(rects) {
    return rects.reduce((result, rect) => ({
      left: Math.min(result.left, rect.left),
      top: Math.min(result.top, rect.top),
      right: Math.max(result.right, rect.right),
      bottom: Math.max(result.bottom, rect.bottom),
    }));
  }

  function nextPaint() {
    return new Promise((resolvePromise) => {
      requestAnimationFrame(() => requestAnimationFrame(resolvePromise));
    });
  }
})();
