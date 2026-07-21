(function initializeAutocompleteBridgePopup() {
  'use strict';

  const params = new URLSearchParams(location.search);
  const tabId = Number(params.get('tabId')) || undefined;
  const embedded = params.get('embedded') === '1';
  document.documentElement.classList.toggle('embedded', embedded);
  const elements = {
    statusDot: document.querySelector('#status-dot'),
    statusText: document.querySelector('#status-text'),
    message: document.querySelector('#message'),
    endpoint: document.querySelector('#endpoint'),
    username: document.querySelector('#username'),
    password: document.querySelector('#password'),
    connect: document.querySelector('#connect'),
    disconnect: document.querySelector('#disconnect'),
    check: document.querySelector('#check'),
    modes: document.querySelector('#modes'),
    inject: document.querySelector('#inject'),
    trendsPermission: document.querySelector('#trends-permission'),
    trendsPermissionStatus: document.querySelector('#trends-permission-status'),
    bundles: document.querySelector('#bundles'),
    refresh: document.querySelector('#refresh'),
    jobs: document.querySelector('#jobs'),
    close: document.querySelector('#close'),
  };
  let snapshot;

  elements.connect.addEventListener('click', () => void withBusy(elements.connect, connect));
  elements.disconnect.addEventListener('click', () => void withBusy(elements.disconnect, disconnect));
  elements.check.addEventListener('click', () => void withBusy(elements.check, checkConnection));
  elements.inject.addEventListener('click', () => void withBusy(elements.inject, injectInstructions));
  elements.trendsPermission.addEventListener('click', () => void withBusy(
    elements.trendsPermission,
    allowTrendsScreenshots,
  ));
  elements.refresh.addEventListener('click', () => void withBusy(elements.refresh, refreshJobs));
  elements.close.addEventListener('click', closePanel);
  elements.modes.addEventListener('change', (event) => {
    if (event.target instanceof HTMLInputElement && event.target.name === 'mode') {
      void setMode(event.target.value);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (embedded && event.key === 'Escape') {
      closePanel();
    }
  });

  void load();

  async function load() {
    snapshot = await send({ type: 'popup:get', tabId });
    render();
  }

  async function connect() {
    clearMessage();
    const endpoint = elements.endpoint.value.trim();
    await requestEndpointPermission(endpoint);
    snapshot = await send({
      type: 'auth:connect',
      endpoint,
      username: elements.username.value.trim(),
      password: elements.password.value,
      tabId,
    });
    elements.password.value = '';
    showMessage('Connected. The password was discarded.', 'success');
    render();
  }

  async function disconnect() {
    clearMessage();
    snapshot = await send({ type: 'auth:disconnect', tabId });
    elements.password.value = '';
    showMessage('Disconnected and removed the token from Chrome.', 'success');
    render();
  }

  async function checkConnection() {
    clearMessage();
    snapshot = await send({ type: 'auth:check', tabId });
    showMessage('Backend connection is healthy.', 'success');
    render();
  }

  async function setMode(mode) {
    try {
      snapshot = await send({ type: 'mode:set', mode, tabId });
      render();
    } catch (error) {
      showMessage(error.message, 'error');
      render();
    }
  }

  async function injectInstructions() {
    clearMessage();
    await send({ type: 'instruction:inject', tabId });
    showMessage('Instructions were inserted and sent.', 'success');
  }

  async function refreshJobs() {
    clearMessage();
    snapshot = await send({ type: 'jobs:refresh', tabId });
    render();
  }

  async function allowTrendsScreenshots() {
    clearMessage();
    const granted = await chrome.permissions.request({ origins: ['<all_urls>'] });
    if (!granted) {
      throw new Error('Chrome screenshot permission was not granted.');
    }
    snapshot = await send({ type: 'trends:permission-changed', tabId });
    showMessage('Google Trends screenshots are enabled.', 'success');
    render();
  }

  function render() {
    elements.statusDot.classList.toggle('connected', Boolean(snapshot.connected));
    elements.statusText.textContent = snapshot.connected ? 'Connected' : 'Disconnected';
    elements.endpoint.value = snapshot.endpoint || elements.endpoint.value;
    elements.username.value = snapshot.username || elements.username.value;
    elements.connect.disabled = Boolean(snapshot.connected);
    elements.disconnect.disabled = !snapshot.connected;
    elements.check.disabled = !snapshot.connected;
    elements.modes.disabled = !snapshot.connected;
    elements.inject.disabled = !tabId;
    elements.trendsPermission.hidden = Boolean(snapshot.trendsCaptureAllowed);
    elements.trendsPermissionStatus.textContent = snapshot.trendsCaptureAllowed
      ? 'Enabled. The extension captures only its temporary Google Trends tab.'
      : 'Allow once so Chrome can capture the temporary Google Trends tab.';

    const selectedMode = document.querySelector(`input[name="mode"][value="${snapshot.mode}"]`);
    if (selectedMode) {
      selectedMode.checked = true;
    }

    renderBundles(snapshot.bundles || []);
    renderJobs(snapshot.jobs || []);
  }

  function renderBundles(bundles) {
    const trendsBundles = bundles.filter((bundle) => bundle.trends?.requested);
    elements.bundles.replaceChildren();
    if (trendsBundles.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = 'No Google Trends requests.';
      elements.bundles.append(empty);
      return;
    }

    for (const bundle of trendsBundles.slice(0, 10)) {
      const container = document.createElement('article');
      container.className = 'job';
      const top = document.createElement('div');
      top.className = 'job-top';
      const title = document.createElement('p');
      title.className = 'job-title';
      title.title = bundle.trends.url;
      title.textContent = trendsLabel(bundle.trends.url);
      const status = bundleStatus(bundle);
      const badge = document.createElement('span');
      badge.className = `badge ${status}`;
      badge.textContent = status;
      top.append(title, badge);
      container.append(top);

      const errorMessage = bundle.deliveryError || bundle.trends.errorMessage || bundle.autocomplete.errorMessage;
      if (errorMessage) {
        const error = document.createElement('p');
        error.className = 'job-error';
        error.textContent = errorMessage;
        container.append(error);
      }

      if (!bundle.delivered && (
        bundle.deliveryError
        || bundle.autocomplete.status === 'failed'
        || ['failed', 'attention', 'permission'].includes(bundle.trends.status)
      )) {
        const actions = document.createElement('div');
        actions.className = 'job-actions';
        actions.append(makeButton('Retry', async () => {
          snapshot = await send({ type: 'bundle:retry', bundleKey: bundle.key, tabId });
          snapshot = await send({ type: 'popup:get', tabId });
          render();
        }));
        container.append(actions);
      }
      elements.bundles.append(container);
    }
  }

  function trendsLabel(urlValue) {
    try {
      const values = new URL(urlValue).searchParams.get('q') || '';
      return values || 'Google Trends request';
    } catch {
      return 'Google Trends request';
    }
  }

  function bundleStatus(bundle) {
    if (bundle.delivered) {
      return 'delivered';
    }
    if (bundle.deliveryError || bundle.autocomplete.status === 'failed' || bundle.trends.status === 'failed') {
      return 'failed';
    }
    if (['attention', 'permission'].includes(bundle.trends.status)) {
      return bundle.trends.status;
    }
    const requested = [bundle.autocomplete, bundle.trends].filter((operation) => operation.requested);
    if (bundle.finalized && requested.length > 0 && requested.every((operation) => operation.status === 'completed')) {
      return 'ready';
    }
    if (requested.some((operation) => ['processing', 'loading', 'capturing'].includes(operation.status))) {
      return 'processing';
    }
    return 'queued';
  }

  function renderJobs(jobs) {
    elements.jobs.replaceChildren();
    if (jobs.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = 'No saved jobs.';
      elements.jobs.append(empty);
      return;
    }

    for (const job of jobs) {
      const container = document.createElement('article');
      container.className = 'job';
      const top = document.createElement('div');
      top.className = 'job-top';
      const title = document.createElement('p');
      title.className = 'job-title';
      title.title = (job.seeds || []).join(' | ');
      title.textContent = `#${job.id} ${(job.seeds || []).join(' | ') || 'Autocomplete request'}`;
      const badge = document.createElement('span');
      badge.className = `badge ${job.status}`;
      badge.textContent = job.status;
      top.append(title, badge);

      const meta = document.createElement('p');
      meta.className = 'job-meta';
      const modifierText = job.modifiers?.length ? ` · modifiers: ${job.modifiers.join(', ')}` : '';
      meta.textContent = `${job.orphaned ? 'Saved result' : 'ChatGPT tab attached'}${modifierText}`;
      container.append(top, meta);

      if (job.errorMessage) {
        const error = document.createElement('p');
        error.className = 'job-error';
        error.textContent = job.errorMessage;
        container.append(error);
      }

      const actions = document.createElement('div');
      actions.className = 'job-actions';
      if (job.status === 'failed') {
        actions.append(makeButton('Retry', async () => {
          snapshot = await send({ type: 'job:retry', jobId: job.id, tabId });
          snapshot = await send({ type: 'popup:get', tabId });
          render();
        }));
      }
      if (job.status === 'completed' && job.orphaned && job.resultMarkdown) {
        actions.append(makeButton('Copy saved result', async () => {
          await navigator.clipboard.writeText(job.resultMarkdown);
          showMessage(`Copied job ${job.id} Markdown.`, 'success');
        }));
      }
      if (actions.childElementCount > 0) {
        container.append(actions);
      }
      elements.jobs.append(container);
    }
  }

  function makeButton(label, handler) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => void withBusy(button, handler));
    return button;
  }

  async function requestEndpointPermission(endpoint) {
    const url = new URL(endpoint);
    const originPattern = `${url.protocol}//${url.hostname}/*`;
    const permissions = { origins: [originPattern] };
    const granted = await chrome.permissions.request(permissions);
    if (!granted) {
      throw new Error('Chrome permission for the backend endpoint was not granted.');
    }
  }

  async function send(message) {
    const response = await chrome.runtime.sendMessage(message);
    if (!response?.ok) {
      throw new Error(response?.error || 'Extension request failed.');
    }
    return response;
  }

  async function withBusy(button, operation) {
    const previousDisabled = button.disabled;
    button.disabled = true;
    try {
      await operation();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      button.disabled = previousDisabled;
    }
  }

  function showMessage(text, type) {
    elements.message.textContent = text;
    elements.message.className = `message ${type}`;
    elements.message.hidden = false;
  }

  function clearMessage() {
    elements.message.hidden = true;
    elements.message.textContent = '';
  }

  function closePanel() {
    if (!embedded) {
      return;
    }
    window.parent.postMessage({
      source: 'fetch-trends-autocomplete-bridge',
      type: 'settings:close',
    }, '*');
  }
})();
