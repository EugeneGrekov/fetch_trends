/* global AutocompleteBridgeShared */
'use strict';

importScripts('shared.js');

const STORAGE_KEY = 'autocompleteBridgeState';
const RECONNECT_ALARM = 'autocomplete-bridge-reconnect';
const DEFAULT_ENDPOINT = 'http://127.0.0.1:3099';
const CHATGPT_URL = /^https:\/\/chatgpt\.com\//i;
const activePolls = new Set();
let connected = false;
let connectionGeneration = 0;
let state;

const ready = initialize();

chrome.runtime.onInstalled.addListener((details) => {
  void ready.then(async () => {
    if (details.reason === 'install') {
      await openMenu();
    }
  });
});

chrome.runtime.onStartup.addListener(() => {
  void ready;
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void ready.then(() => handleMessage(message, sender)).then(
    (result) => sendResponse(result),
    (error) => sendResponse({ ok: false, error: errorMessage(error) }),
  );
  return true;
});

chrome.action.onClicked.addListener((tab) => {
  void ready.then(() => handleActionClick(tab));
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void ready.then(() => updateIcon(tabId));
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' || changeInfo.url) {
    void ready.then(async () => {
      await updateIcon(tabId);
      if (CHATGPT_URL.test(tab.url || '')) {
        await sendTabMessage(tabId, bridgeStateMessage()).catch(() => undefined);
      }
    });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void ready.then(() => orphanTab(tabId));
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === RECONNECT_ALARM) {
    void ready.then(() => reconnectAndResume());
  }
});

chrome.notifications.onClicked.addListener((notificationId) => {
  void ready.then(async () => {
    const match = /^autocomplete-job-(\d+)-tab-(\d+)$/.exec(notificationId);
    if (!match) {
      return;
    }

    const tabId = Number(match[2]);
    const tab = await chrome.tabs.get(tabId).catch(() => undefined);
    if (tab) {
      await chrome.tabs.update(tabId, { active: true });
      if (tab.windowId !== undefined) {
        await chrome.windows.update(tab.windowId, { focused: true });
      }
    }
    await chrome.notifications.clear(notificationId);
  });
});

async function initialize() {
  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => undefined);
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  state = normalizeStoredState(stored[STORAGE_KEY]);
  await validateStoredTargets();
  await chrome.alarms.create(RECONNECT_ALARM, { periodInMinutes: 0.5 });

  if (state.token) {
    await reconnectAndResume();
  } else {
    await broadcastState();
  }
}

async function handleMessage(message, sender) {
  if (!message || typeof message !== 'object') {
    return { ok: false, error: 'Invalid extension message.' };
  }

  const tabId = sender.tab?.id;

  switch (message.type) {
    case 'content:ready':
      if (tabId !== undefined) {
        ensureTabState(tabId);
        await updateIcon(tabId);
        await restoreTabPresentation(tabId);
      }
      return bridgeStateMessage();

    case 'popup:get':
      return popupSnapshot(Number(message.tabId) || undefined);

    case 'auth:connect':
      return connect(message.endpoint, message.username, message.password);

    case 'auth:disconnect':
      return disconnect();

    case 'auth:check':
      await checkStoredToken(true);
      return popupSnapshot(Number(message.tabId) || undefined);

    case 'mode:set':
      await setMode(message.mode);
      return popupSnapshot(Number(message.tabId) || tabId);

    case 'request:detected':
      if (tabId === undefined) {
        return { ok: false, error: 'No source tab.' };
      }
      return submitDetectedRequest(tabId, message.request);

    case 'request:malformed':
      if (tabId === undefined) {
        return { ok: false, error: 'No source tab.' };
      }
      return handleMalformedRequest(tabId, message.reason);

    case 'instruction:inject':
      return injectInstruction(Number(message.tabId), AutocompleteBridgeShared.AUTOCOMPLETE_INSTRUCTION, true);

    case 'job:retry':
      return retryJob(Number(message.jobId));

    case 'jobs:refresh':
      await synchronizeJobs();
      return popupSnapshot(Number(message.tabId) || undefined);

    default:
      return { ok: false, error: `Unknown extension message: ${message.type}` };
  }
}

async function connect(endpointValue, usernameValue, password) {
  const endpoint = normalizeEndpoint(endpointValue);
  const username = String(usernameValue || '').trim();
  if (!username || typeof password !== 'string' || !password) {
    throw new Error('Endpoint, username, and password are required.');
  }

  const response = await fetchJson(`${endpoint}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  }, 15_000);

  const firstConnection = !state.everConnected;
  state.endpoint = endpoint;
  state.username = response.username;
  state.token = response.token;
  state.everConnected = true;
  state.mode = firstConnection ? 'inactive' : state.preferredMode;
  connected = true;
  connectionGeneration += 1;
  await persist();
  await synchronizeJobs();
  await broadcastState();
  resumeAllPolls();
  return popupSnapshot();
}

async function disconnect() {
  state.preferredMode = state.mode;
  state.token = '';
  connected = false;
  connectionGeneration += 1;
  await persist();
  await broadcastState();
  return popupSnapshot();
}

async function checkStoredToken(reportErrors = false) {
  if (!state.token) {
    connected = false;
    if (reportErrors) {
      throw new Error('The extension is disconnected.');
    }
    return false;
  }

  try {
    const result = await apiRequest('/api/auth/check', {}, 12_000);
    state.username = result.username || state.username;
    if (!connected) {
      connectionGeneration += 1;
    }
    connected = true;
    await persist();
    return true;
  } catch (error) {
    await handleConnectionError(error);
    if (reportErrors) {
      throw error;
    }
    return false;
  }
}

async function reconnectAndResume() {
  if (!state.token) {
    connected = false;
    await broadcastState();
    return;
  }

  if (await checkStoredToken(false)) {
    await synchronizeJobs();
    await broadcastState();
    resumeAllPolls();
  }
}

async function setMode(nextMode) {
  if (!['inactive', 'automatic', 'semi'].includes(nextMode)) {
    throw new Error('Invalid extension mode.');
  }

  state.mode = nextMode;
  state.preferredMode = nextMode;
  await persist();
  await broadcastState();

  if (nextMode === 'automatic' || nextMode === 'semi') {
    for (const job of Object.values(state.jobs)) {
      if (job.status === 'completed') {
        await deliverCompletedJob(job);
      }
    }
  }
}

async function submitDetectedRequest(tabId, request) {
  if (!connected || state.mode === 'inactive') {
    return { ok: true, ignored: true };
  }

  const tabState = ensureTabState(tabId);
  tabState.correctionUsed = false;
  tabState.status = 'queued';
  tabState.pendingAction = null;
  tabState.errorMessage = '';
  await persist();
  await updateIcon(tabId);

  if (state.mode === 'automatic') {
    await sendTabMessage(tabId, { type: 'overlay:show', status: 'Autocomplete job queued...' }).catch(() => undefined);
  }

  try {
    const response = await apiRequest('/api/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    }, 15_000);
    const job = mergeServerJob(response.job);
    attachTarget(job, tabId);
    tabState.jobId = job.id;
    applyJobStatusToTarget(job, tabId);
    await persist();
    await updateIcon(tabId);

    if (job.status === 'completed') {
      await deliverCompletedJob(job);
    } else if (job.status === 'failed') {
      await failTargets(job);
    } else {
      pollJob(job.id);
    }

    return { ok: true, cached: Boolean(response.cached), jobId: job.id };
  } catch (error) {
    tabState.status = 'error';
    tabState.errorMessage = errorMessage(error);
    await sendTabMessage(tabId, { type: 'overlay:hide' }).catch(() => undefined);
    await handleConnectionError(error);
    await persist();
    await updateIcon(tabId);
    return { ok: false, error: tabState.errorMessage };
  }
}

async function handleMalformedRequest(tabId, reason) {
  if (!connected || state.mode === 'inactive') {
    return { ok: true, ignored: true };
  }

  const tabState = ensureTabState(tabId);
  if (tabState.correctionUsed) {
    return { ok: true, ignored: true };
  }

  tabState.correctionUsed = true;
  tabState.status = 'error';
  tabState.errorMessage = String(reason || 'Malformed autocomplete request.');

  if (state.mode === 'automatic') {
    const response = await sendTabMessage(tabId, {
      type: 'composer:insert',
      text: AutocompleteBridgeShared.CORRECTION_INSTRUCTION,
      send: true,
    }).catch((error) => ({ ok: false, error: errorMessage(error) }));
    if (response?.ok) {
      tabState.status = 'idle';
      tabState.pendingAction = null;
      tabState.errorMessage = '';
    }
  } else {
    tabState.pendingAction = 'correction';
  }

  await persist();
  await updateIcon(tabId);
  return { ok: true };
}

async function retryJob(jobId) {
  requireConnected();
  const response = await apiRequest(`/api/jobs/${jobId}/retry`, {
    method: 'POST',
  }, 15_000);
  const job = mergeServerJob(response.job);
  for (const target of Object.values(job.targets)) {
    target.delivered = false;
    const tabState = ensureTabState(target.tabId);
    tabState.jobId = job.id;
    applyJobStatusToTarget(job, target.tabId);
  }
  await updateJobTargets(job);
  await persist();
  await refreshAllIcons();
  pollJob(job.id);
  return { ok: true, job: publicStoredJob(job) };
}

async function synchronizeJobs() {
  if (!connected) {
    return;
  }

  try {
    const response = await apiRequest('/api/jobs?limit=50', {}, 15_000);
    for (const serverJob of response.jobs || []) {
      const job = mergeServerJob(serverJob);
      if (job.status === 'completed') {
        await deliverCompletedJob(job);
      } else if (job.status === 'failed') {
        await failTargets(job);
      }
    }
    await persist();
    resumeAllPolls();
  } catch (error) {
    await handleConnectionError(error);
  }
}

function resumeAllPolls() {
  if (!connected) {
    return;
  }
  for (const job of Object.values(state.jobs)) {
    if (job.status === 'queued' || job.status === 'processing') {
      pollJob(job.id);
    }
  }
}

function pollJob(jobId) {
  const key = String(jobId);
  if (!connected || activePolls.has(key)) {
    return;
  }
  activePolls.add(key);
  const generation = connectionGeneration;

  void (async () => {
    try {
      while (connected && generation === connectionGeneration) {
        const response = await apiRequest(`/api/jobs/${jobId}/wait?timeout=30`, {}, 35_000);
        const job = mergeServerJob(response.job);
        await updateJobTargets(job);
        await persist();

        if (job.status === 'completed') {
          await deliverCompletedJob(job);
          return;
        }
        if (job.status === 'failed') {
          await failTargets(job);
          return;
        }
      }
    } catch (error) {
      if (generation === connectionGeneration) {
        await handleConnectionError(error);
      }
    } finally {
      activePolls.delete(key);
      const job = state.jobs[key];
      if (connected && job && ['queued', 'processing'].includes(job.status)) {
        pollJob(jobId);
      }
    }
  })();
}

async function updateJobTargets(job) {
  for (const target of Object.values(job.targets)) {
    applyJobStatusToTarget(job, target.tabId);
    await updateIcon(target.tabId);
    if (state.mode === 'automatic') {
      const label = job.status === 'queued'
        ? 'Autocomplete job queued...'
        : 'Autocomplete research is running...';
      await sendTabMessage(target.tabId, { type: 'overlay:show', status: label }).catch(() => undefined);
    }
  }
}

async function deliverCompletedJob(job) {
  for (const target of Object.values(job.targets)) {
    if (target.delivered) {
      continue;
    }

    const tab = await chrome.tabs.get(target.tabId).catch(() => undefined);
    if (!tab) {
      delete job.targets[String(target.tabId)];
      continue;
    }

    const tabState = ensureTabState(target.tabId);
    tabState.jobId = job.id;

    if (state.mode === 'automatic') {
      const response = await sendTabMessage(target.tabId, {
        type: 'result:auto',
        markdown: job.resultMarkdown,
      }).catch((error) => ({ ok: false, error: errorMessage(error) }));

      if (response?.ok) {
        target.delivered = true;
        tabState.status = 'idle';
        tabState.pendingAction = null;
        tabState.errorMessage = '';
      } else {
        tabState.status = 'error';
        tabState.errorMessage = response?.error || 'Could not insert the autocomplete report.';
      }
    } else if (state.mode === 'semi') {
      tabState.status = 'ready';
      tabState.pendingAction = 'result';
      await notifyIfBackground(job, target.tabId);
    } else {
      tabState.status = 'idle';
      tabState.pendingAction = null;
    }

    await sendTabMessage(target.tabId, { type: 'overlay:hide' }).catch(() => undefined);
    await updateIcon(target.tabId);
  }

  job.orphaned = Object.keys(job.targets).length === 0;
  await persist();
}

async function failTargets(job) {
  for (const target of Object.values(job.targets)) {
    const tabState = ensureTabState(target.tabId);
    tabState.jobId = job.id;
    tabState.status = 'error';
    tabState.pendingAction = null;
    tabState.errorMessage = job.errorMessage || 'Autocomplete job failed.';
    await sendTabMessage(target.tabId, { type: 'overlay:hide' }).catch(() => undefined);
    await updateIcon(target.tabId);
  }
  await persist();
}

async function handleActionClick(tab) {
  const tabId = tab.id;
  if (tabId === undefined || !CHATGPT_URL.test(tab.url || '')) {
    await openMenu(tabId);
    return;
  }

  const tabState = ensureTabState(tabId);
  if (connected && state.mode === 'semi' && tabState.pendingAction === 'result') {
    const job = state.jobs[String(tabState.jobId)];
    if (job?.resultMarkdown) {
      const response = await sendTabMessage(tabId, {
        type: 'composer:insert',
        text: job.resultMarkdown,
        send: false,
      }).catch((error) => ({ ok: false, error: errorMessage(error) }));
      if (response?.ok) {
        const target = job.targets[String(tabId)];
        if (target) {
          target.delivered = true;
        }
        tabState.status = 'idle';
        tabState.pendingAction = null;
        tabState.errorMessage = '';
      } else {
        tabState.status = 'error';
        tabState.errorMessage = response?.error || 'Could not insert the report.';
      }
      await persist();
      await updateIcon(tabId);
      return;
    }
  }

  if (connected && state.mode === 'semi' && tabState.pendingAction === 'correction') {
    const response = await sendTabMessage(tabId, {
      type: 'composer:insert',
      text: AutocompleteBridgeShared.CORRECTION_INSTRUCTION,
      send: false,
    }).catch((error) => ({ ok: false, error: errorMessage(error) }));
    if (response?.ok) {
      tabState.status = 'idle';
      tabState.pendingAction = null;
      tabState.errorMessage = '';
    }
    await persist();
    await updateIcon(tabId);
    return;
  }

  await openMenu(tabId);
}

async function injectInstruction(tabId, text, send) {
  const tab = await chrome.tabs.get(tabId).catch(() => undefined);
  if (!tab || !CHATGPT_URL.test(tab.url || '')) {
    throw new Error('Choose a chatgpt.com tab first.');
  }

  const response = await sendTabMessage(tabId, { type: 'composer:insert', text, send });
  if (!response?.ok) {
    throw new Error(response?.error || 'Could not insert the instruction.');
  }
  return { ok: true };
}

async function notifyIfBackground(job, tabId) {
  const tab = await chrome.tabs.get(tabId).catch(() => undefined);
  if (!tab) {
    return;
  }
  const window = tab.windowId === undefined
    ? undefined
    : await chrome.windows.get(tab.windowId).catch(() => undefined);
  if (tab.active && window?.focused) {
    return;
  }

  await chrome.notifications.create(`autocomplete-job-${job.id}-tab-${tabId}`, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon.png'),
    title: 'Autocomplete report ready',
    message: `Job ${job.id} is ready in a ChatGPT tab.`,
    priority: 1,
  });
}

async function orphanTab(tabId) {
  delete state.tabs[String(tabId)];
  for (const job of Object.values(state.jobs)) {
    if (job.targets[String(tabId)]) {
      delete job.targets[String(tabId)];
      job.orphaned = Object.keys(job.targets).length === 0;
    }
  }
  await persist();
}

async function validateStoredTargets() {
  for (const job of Object.values(state.jobs)) {
    job.targets ||= {};
    for (const target of Object.values(job.targets)) {
      const tab = await chrome.tabs.get(target.tabId).catch(() => undefined);
      if (!tab || !CHATGPT_URL.test(tab.url || '')) {
        delete job.targets[String(target.tabId)];
      }
    }
    job.orphaned = Object.keys(job.targets).length === 0;
  }
  await persist();
}

function attachTarget(job, tabId) {
  job.targets[String(tabId)] = {
    tabId,
    delivered: false,
  };
  job.orphaned = false;
}

function applyJobStatusToTarget(job, tabId) {
  const tabState = ensureTabState(tabId);
  tabState.jobId = job.id;
  if (job.status === 'queued') {
    tabState.status = 'queued';
  } else if (job.status === 'processing') {
    tabState.status = 'processing';
  }
}

function mergeServerJob(serverJob) {
  const key = String(serverJob.id);
  const existing = state.jobs[key] || { targets: {}, orphaned: true };
  const job = {
    ...existing,
    ...serverJob,
    targets: existing.targets || {},
  };
  job.orphaned = Object.keys(job.targets).length === 0;
  state.jobs[key] = job;
  return job;
}

async function handleConnectionError(error) {
  if (error instanceof ApiError && error.status !== 401 && error.status < 500) {
    return;
  }

  if (error instanceof ApiError && error.status === 401) {
    state.token = '';
  }
  if (connected) {
    connectionGeneration += 1;
  }
  connected = false;
  await persist();
  await broadcastState();
}

async function apiRequest(path, options = {}, timeoutMs = 15_000) {
  requireConnectedToken();
  const headers = new Headers(options.headers || {});
  headers.set('authorization', `Bearer ${state.token}`);
  return fetchJson(`${state.endpoint}${path}`, { ...options, headers }, timeoutMs);
}

async function fetchJson(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ApiError(response.status, body.error || `Backend returned HTTP ${response.status}.`);
    }
    return body;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new NetworkError('Backend request timed out.');
    }
    if (error instanceof ApiError) {
      throw error;
    }
    throw new NetworkError(errorMessage(error));
  } finally {
    clearTimeout(timer);
  }
}

function requireConnected() {
  if (!connected) {
    throw new Error('The extension is disconnected.');
  }
}

function requireConnectedToken() {
  if (!state.token) {
    throw new Error('The extension has no stored token.');
  }
}

async function restoreTabPresentation(tabId) {
  const tabState = ensureTabState(tabId);
  if (connected && state.mode === 'automatic' && ['queued', 'processing'].includes(tabState.status)) {
    const label = tabState.status === 'queued'
      ? 'Autocomplete job queued...'
      : 'Autocomplete research is running...';
    await sendTabMessage(tabId, { type: 'overlay:show', status: label }).catch(() => undefined);
  }
}

async function broadcastState() {
  const tabs = await chrome.tabs.query({ url: 'https://chatgpt.com/*' });
  await Promise.all(tabs.map(async (tab) => {
    if (tab.id === undefined) {
      return;
    }
    await sendTabMessage(tab.id, bridgeStateMessage()).catch(() => undefined);
    await updateIcon(tab.id);
  }));
}

function bridgeStateMessage() {
  return {
    type: 'bridge:state',
    connected,
    mode: state.mode,
  };
}

function popupSnapshot(tabId) {
  return {
    ok: true,
    connected,
    endpoint: state.endpoint,
    username: state.username,
    mode: state.mode,
    tabState: tabId ? ensureTabState(tabId) : undefined,
    jobs: Object.values(state.jobs)
      .sort((left, right) => right.id - left.id)
      .slice(0, 50)
      .map(publicStoredJob),
  };
}

function publicStoredJob(job) {
  return {
    id: job.id,
    status: job.status,
    seeds: job.seeds || [],
    modifiers: job.modifiers || [],
    resultMarkdown: job.resultMarkdown || null,
    errorMessage: job.errorMessage || null,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    orphaned: Boolean(job.orphaned),
  };
}

async function openMenu(tabId) {
  const query = tabId ? `?tabId=${tabId}` : '?onboarding=1';
  await chrome.windows.create({
    url: chrome.runtime.getURL(`popup.html${query}`),
    type: 'popup',
    width: 430,
    height: 680,
    focused: true,
  });
}

async function updateIcon(tabId) {
  const tab = await chrome.tabs.get(tabId).catch(() => undefined);
  if (!tab) {
    return;
  }
  const visual = resolveIconVisual(tabId, tab.url || '');

  try {
    const canvas = new OffscreenCanvas(32, 32);
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, 32, 32);
    context.fillStyle = visual.color;
    context.beginPath();
    context.arc(16, 16, 14, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#ffffff';
    context.fillRect(9, 10, 14, 3);
    context.fillRect(9, 15, 14, 3);
    context.fillRect(9, 20, 9, 3);
    await chrome.action.setIcon({ tabId, imageData: context.getImageData(0, 0, 32, 32) });
  } catch {
    await chrome.action.setBadgeBackgroundColor({ tabId, color: visual.color });
    await chrome.action.setBadgeText({ tabId, text: ' ' });
  }
  await chrome.action.setTitle({ tabId, title: visual.title });
}

async function refreshAllIcons() {
  const tabs = await chrome.tabs.query({ url: 'https://chatgpt.com/*' });
  await Promise.all(tabs.map((tab) => tab.id === undefined ? undefined : updateIcon(tab.id)));
}

function resolveIconVisual(tabId, url) {
  if (!CHATGPT_URL.test(url) || !connected) {
    return { color: '#4b5563', title: 'Autocomplete Bridge: disconnected' };
  }
  if (state.mode === 'inactive') {
    return { color: '#cbd5e1', title: 'Autocomplete Bridge: connected, inactive' };
  }

  const tabState = ensureTabState(tabId);
  const active = {
    queued: { color: '#eab308', title: 'Autocomplete Bridge: queued' },
    processing: { color: '#f97316', title: 'Autocomplete Bridge: processing' },
    ready: { color: '#9333ea', title: 'Autocomplete Bridge: result ready' },
    error: { color: '#dc2626', title: 'Autocomplete Bridge: error' },
  }[tabState.status];
  if (active) {
    return active;
  }

  return state.mode === 'automatic'
    ? { color: '#16a34a', title: 'Autocomplete Bridge: automatic' }
    : { color: '#2563eb', title: 'Autocomplete Bridge: semi-automatic' };
}

function ensureTabState(tabId) {
  const key = String(tabId);
  state.tabs[key] ||= {
    status: 'idle',
    jobId: null,
    pendingAction: null,
    errorMessage: '',
    correctionUsed: false,
  };
  return state.tabs[key];
}

function normalizeStoredState(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    endpoint: typeof source.endpoint === 'string' ? source.endpoint : DEFAULT_ENDPOINT,
    username: typeof source.username === 'string' ? source.username : '',
    token: typeof source.token === 'string' ? source.token : '',
    mode: ['inactive', 'automatic', 'semi'].includes(source.mode) ? source.mode : 'inactive',
    preferredMode: ['inactive', 'automatic', 'semi'].includes(source.preferredMode) ? source.preferredMode : 'inactive',
    everConnected: Boolean(source.everConnected),
    jobs: source.jobs && typeof source.jobs === 'object' ? source.jobs : {},
    tabs: source.tabs && typeof source.tabs === 'object' ? source.tabs : {},
  };
}

function normalizeEndpoint(value) {
  const url = new URL(String(value || '').trim());
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Backend endpoint must use http or https.');
  }
  url.hash = '';
  url.search = '';
  return url.toString().replace(/\/$/, '');
}

async function persist() {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

async function sendTabMessage(tabId, message) {
  return chrome.tabs.sendMessage(tabId, message);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

class NetworkError extends Error {}
