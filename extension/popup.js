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
    refresh: document.querySelector('#refresh'),
    jobs: document.querySelector('#jobs'),
    close: document.querySelector('#close'),
  };
  let snapshot;

  elements.connect.addEventListener('click', () => void withBusy(elements.connect, connect));
  elements.disconnect.addEventListener('click', () => void withBusy(elements.disconnect, disconnect));
  elements.check.addEventListener('click', () => void withBusy(elements.check, checkConnection));
  elements.inject.addEventListener('click', () => void withBusy(elements.inject, injectInstructions));
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

    const selectedMode = document.querySelector(`input[name="mode"][value="${snapshot.mode}"]`);
    if (selectedMode) {
      selectedMode.checked = true;
    }

    renderJobs(snapshot.jobs || []);
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
