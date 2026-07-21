/* global AutocompleteBridgeShared */
'use strict';

importScripts('shared.js');

const STORAGE_KEY = 'autocompleteBridgeState';
const RECONNECT_ALARM = 'autocomplete-bridge-reconnect';
const DEFAULT_ENDPOINT = 'http://127.0.0.1:3099';
const CHATGPT_URL = /^https:\/\/chatgpt\.com\//i;
const GOOGLE_TRENDS_URL = /^https:\/\/trends\.google\.com\//i;
const TRENDS_CAPTURE_PERMISSION = { origins: ['<all_urls>'] };
const activePolls = new Set();
const activeDeliveries = new Set();
const closingTrendsTabs = new Set();
let connected = false;
let connectionGeneration = 0;
let activeTrendsKey = '';
let capturingTrendsKey = '';
let state;

const ready = initialize();

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
      await handleTrackedTrendsUpdate(tabId, changeInfo, tab);
    });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void ready.then(() => handleTabRemoved(tabId));
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === RECONNECT_ALARM) {
    void ready.then(() => reconnectAndResume());
  }
});

chrome.notifications.onClicked.addListener((notificationId) => {
  void ready.then(async () => {
    const legacyMatch = /^autocomplete-job-(\d+)-tab-(\d+)$/.exec(notificationId);
    const bundleMatch = /^research-bundle-tab-(\d+)-/.exec(notificationId);
    const tabId = legacyMatch ? Number(legacyMatch[2]) : Number(bundleMatch?.[1]);
    if (!Number.isInteger(tabId)) {
      return;
    }

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
  void resumeTrendsQueue();
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
      return submitDetectedRequest(tabId, message.request, message.responseKey);

    case 'response:finalized':
      if (tabId === undefined) {
        return { ok: false, error: 'No source tab.' };
      }
      return finalizeResponseBundle(tabId, message.responseKey, message.trendsUrl);

    case 'request:malformed':
      if (tabId === undefined) {
        return { ok: false, error: 'No source tab.' };
      }
      return handleMalformedRequest(tabId, message.reason);

    case 'instruction:inject':
      return injectInstruction(Number(message.tabId), AutocompleteBridgeShared.AUTOCOMPLETE_INSTRUCTION, true);

    case 'job:retry':
      return retryJob(Number(message.jobId));

    case 'bundle:retry':
      return retryResponseBundle(String(message.bundleKey || ''));

    case 'trends:permission-changed':
      await resumePermissionBlockedTrends();
      return popupSnapshot(Number(message.tabId) || undefined);

    case 'trends:content-ready':
      return trackedTrendsContentReady(tabId);

    case 'trends:page-ready':
      return handleTrendsPageReady(tabId);

    case 'trends:attention':
      return handleTrendsAttention(tabId, message.reason);

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
  void resumeTrendsQueue();
  for (const bundle of orderedBundles()) {
    await maybeDeliverBundle(bundle);
  }
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
    void resumeTrendsQueue();
    for (const bundle of orderedBundles()) {
      await maybeDeliverBundle(bundle);
    }
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
    for (const bundle of orderedBundles()) {
      await maybeDeliverBundle(bundle);
    }
    void resumeTrendsQueue();
  }
}

async function submitDetectedRequest(tabId, request, responseKey) {
  if (!connected || state.mode === 'inactive') {
    return { ok: true, ignored: true };
  }

  const bundle = responseKey ? ensureResponseBundle(tabId, responseKey) : undefined;
  if (bundle) {
    bundle.autocomplete = {
      ...bundle.autocomplete,
      requested: true,
      status: 'queued',
      request,
      errorMessage: '',
    };
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
    attachTarget(job, tabId, bundle?.key);
    if (bundle) {
      bundle.autocomplete.jobId = job.id;
    }
    tabState.jobId = job.id;
    applyJobStatusToTarget(job, findJobTarget(job, tabId, bundle?.key));
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
    if (bundle) {
      bundle.autocomplete.status = 'failed';
      bundle.autocomplete.errorMessage = errorMessage(error);
    }
    tabState.status = 'error';
    tabState.errorMessage = errorMessage(error);
    await sendTabMessage(tabId, { type: 'overlay:hide' }).catch(() => undefined);
    await handleConnectionError(error);
    await persist();
    await updateIcon(tabId);
    return { ok: false, error: tabState.errorMessage };
  }
}

async function finalizeResponseBundle(tabId, responseKey, trendsUrlValue) {
  if (state.mode === 'inactive') {
    return { ok: true, ignored: true };
  }
  if (!responseKey) {
    return { ok: false, error: 'The ChatGPT response has no identifier.' };
  }

  const bundle = ensureResponseBundle(tabId, responseKey);
  if (bundle.finalized) {
    return { ok: true, duplicate: true, bundleKey: bundle.key };
  }

  bundle.finalized = true;
  const trendsClassification = AutocompleteBridgeShared.classifyGoogleTrendsUrl(trendsUrlValue);
  if (trendsClassification.kind === 'valid') {
    bundle.trends = {
      ...bundle.trends,
      requested: true,
      url: trendsClassification.url,
      status: await hasTrendsCapturePermission() ? 'queued' : 'permission',
      errorMessage: '',
    };
    if (bundle.trends.status === 'permission') {
      bundle.trends.errorMessage = 'Allow Google Trends screenshots in the extension settings.';
    } else {
      enqueueTrendsBundle(bundle.key);
    }
  }

  if (!bundle.autocomplete.requested && !bundle.trends.requested) {
    delete state.bundles[bundle.key];
    await persist();
    return { ok: true, ignored: true };
  }

  await persist();
  await refreshTabFromWork(tabId);
  await maybeDeliverBundle(bundle);
  void resumeTrendsQueue();
  return { ok: true, bundleKey: bundle.key };
}

async function retryResponseBundle(bundleKey) {
  const bundle = state.bundles[bundleKey];
  if (!bundle || bundle.delivered || bundle.cancelled) {
    throw new Error('This response bundle is no longer available.');
  }

  bundle.deliveryError = '';
  if (bundle.autocomplete.requested && bundle.autocomplete.status === 'failed') {
    if (bundle.autocomplete.jobId) {
      await retryJob(bundle.autocomplete.jobId);
    } else if (bundle.autocomplete.request) {
      await submitDetectedRequest(bundle.tabId, bundle.autocomplete.request, bundle.responseKey);
    }
  }

  if (bundle.trends.requested && ['failed', 'attention', 'permission'].includes(bundle.trends.status)) {
    if (!await hasTrendsCapturePermission()) {
      bundle.trends.status = 'permission';
      bundle.trends.errorMessage = 'Allow Google Trends screenshots in the extension settings.';
    } else {
      await resetTrendsOperation(bundle);
      bundle.trends.status = 'queued';
      bundle.trends.errorMessage = '';
      enqueueTrendsBundle(bundle.key);
    }
  }

  await persist();
  await refreshTabFromWork(bundle.tabId);
  await maybeDeliverBundle(bundle);
  void resumeTrendsQueue();
  return { ok: true, bundle: publicResponseBundle(bundle) };
}

async function resumePermissionBlockedTrends() {
  if (!await hasTrendsCapturePermission()) {
    return;
  }
  for (const bundle of orderedBundles()) {
    if (!bundle.cancelled && bundle.trends.requested && bundle.trends.status === 'permission') {
      bundle.trends.status = 'queued';
      bundle.trends.errorMessage = '';
      enqueueTrendsBundle(bundle.key);
      await refreshTabFromWork(bundle.tabId);
    }
  }
  await persist();
  void resumeTrendsQueue();
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
    const bundle = target.bundleKey ? state.bundles[target.bundleKey] : undefined;
    if (bundle) {
      bundle.autocomplete.status = job.status;
      bundle.autocomplete.errorMessage = '';
      bundle.deliveryError = '';
    } else {
      const tabState = ensureTabState(target.tabId);
      tabState.jobId = job.id;
    }
    applyJobStatusToTarget(job, target);
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
    applyJobStatusToTarget(job, target);
    await refreshTabFromWork(target.tabId);
    if (state.mode === 'automatic') {
      const label = job.status === 'queued'
        ? 'Research queued...'
        : 'Research is running...';
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
      deleteJobTarget(job, target);
      continue;
    }

    const bundle = target.bundleKey ? state.bundles[target.bundleKey] : undefined;
    if (bundle) {
      bundle.autocomplete.status = 'completed';
      bundle.autocomplete.markdown = job.resultMarkdown || '';
      bundle.autocomplete.errorMessage = '';
      await maybeDeliverBundle(bundle);
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
    const bundle = target.bundleKey ? state.bundles[target.bundleKey] : undefined;
    if (bundle) {
      bundle.autocomplete.status = 'failed';
      bundle.autocomplete.errorMessage = job.errorMessage || 'Autocomplete job failed.';
      await sendTabMessage(target.tabId, { type: 'overlay:hide' }).catch(() => undefined);
      await refreshTabFromWork(target.tabId);
      continue;
    }
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

async function maybeDeliverBundle(bundle) {
  if (!bundle || bundle.cancelled || bundle.deliveryError || !connected) {
    return;
  }
  if (!AutocompleteBridgeShared.isResponseBundleReady(bundle)) {
    await refreshTabFromWork(bundle?.tabId);
    return;
  }

  if (state.mode === 'semi') {
    const tabState = ensureTabState(bundle.tabId);
    tabState.status = 'ready';
    tabState.pendingAction = 'bundle';
    tabState.pendingBundleKey = bundle.key;
    await sendTabMessage(bundle.tabId, { type: 'overlay:hide' }).catch(() => undefined);
    await persist();
    await updateIcon(bundle.tabId);
    if (!bundle.notifiedAt) {
      bundle.notifiedAt = new Date().toISOString();
      await persist();
      await notifyBundleIfBackground(bundle);
    }
    return;
  }
  if (state.mode !== 'automatic' || activeDeliveries.has(String(bundle.tabId))) {
    return;
  }

  const deliveryKey = String(bundle.tabId);
  activeDeliveries.add(deliveryKey);
  try {
    const tabState = ensureTabState(bundle.tabId);
    tabState.status = 'processing';
    tabState.errorMessage = '';
    await persist();
    await updateIcon(bundle.tabId);
    await sendTabMessage(bundle.tabId, {
      type: 'overlay:show',
      status: 'Waiting to return all results to ChatGPT...',
    }).catch(() => undefined);
    const response = await sendTabMessage(bundle.tabId, {
      type: 'bundle:deliver',
      markdown: bundle.autocomplete.markdown || '',
      imageDataUrl: bundle.trends.imageDataUrl || '',
      send: true,
    }).catch((error) => ({ ok: false, error: errorMessage(error) }));
    if (!state.bundles[bundle.key]) {
      return;
    }
    if (!response?.ok) {
      bundle.deliveryError = response?.error || 'Could not deliver the research result to ChatGPT.';
    } else {
      markBundleDelivered(bundle);
    }
    await persist();
    await refreshTabFromWork(bundle.tabId);
  } finally {
    activeDeliveries.delete(deliveryKey);
    const next = orderedBundles().find((candidate) => (
      candidate.tabId === bundle.tabId
      && !candidate.deliveryError
      && AutocompleteBridgeShared.isResponseBundleReady(candidate)
    ));
    if (next && state.mode === 'automatic') {
      void maybeDeliverBundle(next);
    }
  }
}

function markBundleDelivered(bundle) {
  bundle.delivered = true;
  bundle.deliveredAt = new Date().toISOString();
  bundle.deliveryError = '';
  bundle.trends.imageDataUrl = '';
  if (bundle.autocomplete.jobId) {
    const job = state.jobs[String(bundle.autocomplete.jobId)];
    const target = job && findJobTarget(job, bundle.tabId, bundle.key);
    if (target) {
      target.delivered = true;
    }
  }
}

async function notifyBundleIfBackground(bundle) {
  const tab = await chrome.tabs.get(bundle.tabId).catch(() => undefined);
  if (!tab) {
    return;
  }
  const window = tab.windowId === undefined
    ? undefined
    : await chrome.windows.get(tab.windowId).catch(() => undefined);
  if (tab.active && window?.focused) {
    return;
  }
  const resultLabel = bundle.autocomplete.requested && bundle.trends.requested
    ? 'Autocomplete report and Google Trends screenshot'
    : bundle.trends.requested ? 'Google Trends screenshot' : 'Autocomplete report';
  await chrome.notifications.create(`research-bundle-tab-${bundle.tabId}-${Date.now()}`, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon.png'),
    title: 'Research result ready',
    message: `${resultLabel} is ready in a ChatGPT tab.`,
    priority: 1,
  });
}

async function handleActionClick(tab) {
  const tabId = tab.id;
  if (tabId === undefined || !CHATGPT_URL.test(tab.url || '')) {
    await showSettingsPanel(tabId);
    return;
  }

  const tabState = ensureTabState(tabId);
  if (connected && state.mode === 'semi' && tabState.pendingAction === 'bundle') {
    const bundle = state.bundles[tabState.pendingBundleKey];
    if (bundle && AutocompleteBridgeShared.isResponseBundleReady(bundle)) {
      const response = await sendTabMessage(tabId, {
        type: 'bundle:deliver',
        markdown: bundle.autocomplete.markdown || '',
        imageDataUrl: bundle.trends.imageDataUrl || '',
        send: false,
      }).catch((error) => ({ ok: false, error: errorMessage(error) }));
      if (response?.ok) {
        markBundleDelivered(bundle);
      } else {
        bundle.deliveryError = response?.error || 'Could not prepare the research result.';
      }
      await persist();
      await refreshTabFromWork(tabId);
      return;
    }
  }

  if (connected && state.mode === 'semi' && tabState.pendingAction === 'result') {
    const job = state.jobs[String(tabState.jobId)];
    if (job?.resultMarkdown) {
      const response = await sendTabMessage(tabId, {
        type: 'composer:insert',
        text: job.resultMarkdown,
        send: false,
      }).catch((error) => ({ ok: false, error: errorMessage(error) }));
      if (response?.ok) {
        const target = findJobTarget(job, tabId);
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

  await showSettingsPanel(tabId);
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

async function resumeTrendsQueue() {
  if (!connected) {
    return;
  }

  state.trendsQueue = [...new Set(state.trendsQueue)].filter((bundleKey) => {
    const bundle = state.bundles[bundleKey];
    return Boolean(
      bundle
      && !bundle.cancelled
      && !bundle.delivered
      && bundle.trends.requested
      && bundle.trends.status !== 'completed'
    );
  });

  if (activeTrendsKey) {
    const activeBundle = state.bundles[activeTrendsKey];
    if (activeBundle && activeBundle.trends.tempTabId) {
      const tab = await chrome.tabs.get(activeBundle.trends.tempTabId).catch(() => undefined);
      if (tab) {
        if (activeBundle.trends.status === 'capturing') {
          activeBundle.trends.status = 'loading';
        }
        if (GOOGLE_TRENDS_URL.test(tab.url || '') && activeBundle.trends.status !== 'attention') {
          await sendTabMessage(tab.id, { type: 'trends:scan' }).catch(() => undefined);
        } else if (!GOOGLE_TRENDS_URL.test(tab.url || '') && activeBundle.trends.status !== 'attention') {
          await handleTrendsAttention(tab.id, 'Google Trends requires manual attention.');
        }
        await persist();
        return;
      }
      activeBundle.trends.tempTabId = null;
      activeBundle.trends.status = 'queued';
    }
    activeTrendsKey = '';
  }

  for (const bundleKey of state.trendsQueue) {
    const bundle = state.bundles[bundleKey];
    if (!bundle || bundle.trends.status === 'completed') {
      continue;
    }

    if (bundle.trends.tempTabId) {
      const existingTab = await chrome.tabs.get(bundle.trends.tempTabId).catch(() => undefined);
      if (existingTab) {
        activeTrendsKey = bundle.key;
        if (bundle.trends.status === 'capturing') {
          bundle.trends.status = 'loading';
        }
        await persist();
        if (bundle.trends.status !== 'attention') {
          await sendTabMessage(existingTab.id, { type: 'trends:scan' }).catch(() => undefined);
        }
        return;
      }
      bundle.trends.tempTabId = null;
      bundle.trends.status = 'queued';
    }

    if (bundle.trends.status !== 'queued') {
      continue;
    }
    if (!await hasTrendsCapturePermission()) {
      bundle.trends.status = 'permission';
      bundle.trends.errorMessage = 'Allow Google Trends screenshots in the extension settings.';
      await persist();
      await refreshTabFromWork(bundle.tabId);
      return;
    }

    const sourceTab = await chrome.tabs.get(bundle.tabId).catch(() => undefined);
    if (!sourceTab || !CHATGPT_URL.test(sourceTab.url || '')) {
      await cancelSourceTab(bundle.tabId);
      continue;
    }

    activeTrendsKey = bundle.key;
    bundle.trends.status = 'loading';
    bundle.trends.errorMessage = '';
    const trendsTab = await chrome.tabs.create({
      url: bundle.trends.url,
      active: false,
      windowId: sourceTab.windowId,
      index: sourceTab.index + 1,
    });
    bundle.trends.tempTabId = trendsTab.id || null;
    await persist();
    await refreshTabFromWork(bundle.tabId);
    return;
  }

  await persist();
}

function trackedTrendsContentReady(tabId) {
  const bundle = findBundleByTrendsTabId(tabId);
  return {
    ok: true,
    tracked: Boolean(bundle),
    bundleKey: bundle?.key,
  };
}

function handleTrendsPageReady(tabId) {
  const bundle = findBundleByTrendsTabId(tabId);
  if (!bundle || !connected) {
    return { ok: true, ignored: true };
  }
  if (!capturingTrendsKey && ['loading', 'attention'].includes(bundle.trends.status)) {
    void captureTrendsBundle(bundle.key);
  }
  return { ok: true, accepted: true };
}

async function handleTrendsAttention(tabId, reason) {
  const bundle = findBundleByTrendsTabId(tabId);
  if (!bundle) {
    return { ok: true, ignored: true };
  }

  bundle.trends.status = 'attention';
  bundle.trends.errorMessage = String(reason || 'Google Trends needs manual attention before capture can continue.');
  await persist();
  await refreshTabFromWork(bundle.tabId);
  const tab = await chrome.tabs.get(tabId).catch(() => undefined);
  if (tab) {
    await chrome.tabs.update(tabId, { active: true }).catch(() => undefined);
    if (tab.windowId !== undefined) {
      await chrome.windows.update(tab.windowId, { focused: true }).catch(() => undefined);
    }
  }
  return { ok: true };
}

async function handleTrackedTrendsUpdate(tabId, changeInfo, tab) {
  const bundle = findBundleByTrendsTabId(tabId);
  if (!bundle) {
    return;
  }
  if (changeInfo.url && !GOOGLE_TRENDS_URL.test(changeInfo.url)) {
    await handleTrendsAttention(tabId, 'Complete the Google login, consent, or verification page to continue.');
    return;
  }
  if (changeInfo.status === 'complete' && GOOGLE_TRENDS_URL.test(tab.url || '')) {
    await sendTabMessage(tabId, { type: 'trends:scan' }).catch(() => undefined);
  }
}

async function captureTrendsBundle(bundleKey) {
  const bundle = state.bundles[bundleKey];
  if (!bundle || bundle.cancelled || capturingTrendsKey || !connected) {
    return;
  }
  const tempTabId = bundle.trends.tempTabId;
  if (!tempTabId) {
    return;
  }

  capturingTrendsKey = bundleKey;
  try {
    if (!await hasTrendsCapturePermission()) {
      throw new Error('Allow Google Trends screenshots in the extension settings.');
    }
    const [sourceTab, trendsTab] = await Promise.all([
      chrome.tabs.get(bundle.tabId).catch(() => undefined),
      chrome.tabs.get(tempTabId).catch(() => undefined),
    ]);
    if (!sourceTab || !CHATGPT_URL.test(sourceTab.url || '')) {
      await cancelSourceTab(bundle.tabId);
      return;
    }
    if (!trendsTab || trendsTab.windowId === undefined) {
      throw new Error('The temporary Google Trends tab was closed.');
    }

    bundle.trends.status = 'capturing';
    bundle.trends.errorMessage = '';
    await persist();
    await refreshTabFromWork(bundle.tabId);

    await chrome.tabs.setZoom(tempTabId, 0.67).catch(() => undefined);
    await chrome.tabs.update(tempTabId, { active: true });
    await chrome.windows.update(trendsTab.windowId, { focused: true });
    await delay(500);

    const prepared = await sendTabMessage(tempTabId, { type: 'trends:prepare' });
    if (!prepared?.ok || !prepared.rect) {
      throw new Error(prepared?.error || 'The Google Trends chart area could not be prepared.');
    }
    await delay(350);
    const activeTab = (await chrome.tabs.query({ active: true, windowId: trendsTab.windowId }))[0];
    if (activeTab?.id !== tempTabId) {
      await chrome.tabs.update(tempTabId, { active: true });
      await delay(250);
    }

    const screenshot = await chrome.tabs.captureVisibleTab(trendsTab.windowId, { format: 'png' });
    const croppedScreenshot = await cropScreenshot(screenshot, prepared);
    if (!state.bundles[bundleKey]) {
      return;
    }

    bundle.trends.imageDataUrl = croppedScreenshot;
    bundle.trends.status = 'completed';
    bundle.trends.errorMessage = '';
    bundle.trends.tempTabId = null;
    removeFromTrendsQueue(bundleKey);
    activeTrendsKey = '';

    await chrome.tabs.update(bundle.tabId, { active: true }).catch(() => undefined);
    if (sourceTab.windowId !== undefined) {
      await chrome.windows.update(sourceTab.windowId, { focused: true }).catch(() => undefined);
    }
    await closeTrackedTrendsTab(tempTabId);
    await persist();
    await refreshTabFromWork(bundle.tabId);
    await maybeDeliverBundle(bundle);
  } catch (error) {
    const current = state.bundles[bundleKey];
    if (current && !current.cancelled) {
      current.trends.status = 'attention';
      current.trends.errorMessage = errorMessage(error);
      await persist();
      await refreshTabFromWork(current.tabId);
      const tab = await chrome.tabs.get(tempTabId).catch(() => undefined);
      if (tab) {
        await chrome.tabs.update(tempTabId, { active: true }).catch(() => undefined);
        if (tab.windowId !== undefined) {
          await chrome.windows.update(tab.windowId, { focused: true }).catch(() => undefined);
        }
      }
    }
  } finally {
    capturingTrendsKey = '';
    void resumeTrendsQueue();
  }
}

async function cropScreenshot(dataUrl, prepared) {
  const sourceBlob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(sourceBlob);
  try {
    const crop = AutocompleteBridgeShared.calculateCropRegion({
      imageWidth: bitmap.width,
      imageHeight: bitmap.height,
      viewportWidth: prepared.viewportWidth,
      viewportHeight: prepared.viewportHeight,
      rect: prepared.rect,
      padding: 6,
    });
    const canvas = new OffscreenCanvas(crop.width, crop.height);
    const context = canvas.getContext('2d');
    context.drawImage(
      bitmap,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      crop.width,
      crop.height,
    );
    return blobToDataUrl(await canvas.convertToBlob({ type: 'image/png' }));
  } finally {
    bitmap.close();
  }
}

async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return `data:${blob.type || 'image/png'};base64,${btoa(binary)}`;
}

async function resetTrendsOperation(bundle) {
  const tempTabId = bundle.trends.tempTabId;
  bundle.trends.tempTabId = null;
  bundle.trends.imageDataUrl = '';
  removeFromTrendsQueue(bundle.key);
  if (activeTrendsKey === bundle.key) {
    activeTrendsKey = '';
  }
  if (tempTabId) {
    await closeTrackedTrendsTab(tempTabId);
  }
}

async function closeTrackedTrendsTab(tabId) {
  closingTrendsTabs.add(tabId);
  await chrome.tabs.remove(tabId).catch(() => undefined);
  setTimeout(() => closingTrendsTabs.delete(tabId), 1_000);
}

function enqueueTrendsBundle(bundleKey) {
  if (!state.trendsQueue.includes(bundleKey)) {
    state.trendsQueue.push(bundleKey);
  }
}

function removeFromTrendsQueue(bundleKey) {
  state.trendsQueue = state.trendsQueue.filter((candidate) => candidate !== bundleKey);
}

async function hasTrendsCapturePermission() {
  return chrome.permissions.contains(TRENDS_CAPTURE_PERMISSION);
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

async function handleTabRemoved(tabId) {
  if (closingTrendsTabs.has(tabId)) {
    closingTrendsTabs.delete(tabId);
    return;
  }

  const trendsBundle = findBundleByTrendsTabId(tabId);
  if (trendsBundle) {
    trendsBundle.trends.tempTabId = null;
    trendsBundle.trends.status = 'failed';
    trendsBundle.trends.errorMessage = 'The temporary Google Trends tab was closed. Use Retry to run it again.';
    removeFromTrendsQueue(trendsBundle.key);
    if (activeTrendsKey === trendsBundle.key) {
      activeTrendsKey = '';
    }
    await persist();
    await refreshTabFromWork(trendsBundle.tabId);
    void resumeTrendsQueue();
    return;
  }

  await cancelSourceTab(tabId);
}

async function cancelSourceTab(tabId) {
  delete state.tabs[String(tabId)];
  const tempTabs = [];
  for (const bundle of Object.values(state.bundles)) {
    if (bundle.tabId !== tabId) {
      continue;
    }
    bundle.cancelled = true;
    if (bundle.trends.tempTabId) {
      tempTabs.push(bundle.trends.tempTabId);
    }
    removeFromTrendsQueue(bundle.key);
    if (activeTrendsKey === bundle.key) {
      activeTrendsKey = '';
    }
    delete state.bundles[bundle.key];
  }
  for (const job of Object.values(state.jobs)) {
    for (const target of Object.values(job.targets)) {
      if (target.tabId === tabId) {
        deleteJobTarget(job, target);
      }
    }
    job.orphaned = Object.keys(job.targets).length === 0;
  }
  await persist();
  await Promise.all(tempTabs.map(closeTrackedTrendsTab));
  void resumeTrendsQueue();
}

async function validateStoredTargets() {
  const abandonedTrendsTabs = [];
  for (const job of Object.values(state.jobs)) {
    job.targets ||= {};
    for (const target of Object.values(job.targets)) {
      const tab = await chrome.tabs.get(target.tabId).catch(() => undefined);
      if (
        !tab
        || !CHATGPT_URL.test(tab.url || '')
        || (target.bundleKey && !state.bundles[target.bundleKey])
      ) {
        deleteJobTarget(job, target);
      }
    }
    job.orphaned = Object.keys(job.targets).length === 0;
  }
  for (const bundle of Object.values(state.bundles)) {
    const tab = await chrome.tabs.get(bundle.tabId).catch(() => undefined);
    if (!tab || !CHATGPT_URL.test(tab.url || '')) {
      if (bundle.trends.tempTabId) {
        abandonedTrendsTabs.push(bundle.trends.tempTabId);
      }
      removeFromTrendsQueue(bundle.key);
      delete state.bundles[bundle.key];
    }
  }
  await persist();
  await Promise.all(abandonedTrendsTabs.map(closeTrackedTrendsTab));
}

function attachTarget(job, tabId, bundleKey) {
  const targetKey = bundleKey ? `bundle:${bundleKey}` : String(tabId);
  job.targets[targetKey] = {
    tabId,
    bundleKey: bundleKey || null,
    delivered: false,
  };
  job.orphaned = false;
}

function applyJobStatusToTarget(job, target) {
  if (!target) {
    return;
  }
  const bundle = target.bundleKey ? state.bundles[target.bundleKey] : undefined;
  if (bundle) {
    bundle.autocomplete.jobId = job.id;
    if (job.status === 'queued' || job.status === 'processing') {
      bundle.autocomplete.status = job.status;
    }
    return;
  }
  const tabState = ensureTabState(target.tabId);
  tabState.jobId = job.id;
  if (job.status === 'queued') {
    tabState.status = 'queued';
  } else if (job.status === 'processing') {
    tabState.status = 'processing';
  }
}

function findJobTarget(job, tabId, bundleKey) {
  return Object.values(job?.targets || {}).find((target) => (
    target.tabId === tabId && (bundleKey === undefined || target.bundleKey === bundleKey)
  ));
}

function deleteJobTarget(job, target) {
  const key = Object.entries(job.targets).find(([, candidate]) => candidate === target)?.[0];
  if (key) {
    delete job.targets[key];
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
  await refreshTabFromWork(tabId, false);
  const tabState = ensureTabState(tabId);
  if (connected && state.mode === 'automatic' && ['queued', 'processing'].includes(tabState.status)) {
    const label = tabState.status === 'queued'
      ? 'Research queued...'
      : 'Research is running...';
    await sendTabMessage(tabId, { type: 'overlay:show', status: label }).catch(() => undefined);
  }
}

async function refreshTabFromWork(tabId, persistState = true) {
  const tabState = ensureTabState(tabId);
  const bundles = orderedBundles().filter((bundle) => (
    bundle.tabId === tabId && !bundle.cancelled && !bundle.delivered
  ));
  const readyBundle = bundles.find((bundle) => (
    !bundle.deliveryError && AutocompleteBridgeShared.isResponseBundleReady(bundle)
  ));
  const errorBundle = bundles.find((bundle) => bundle.deliveryError || [
    'failed',
    'attention',
    'permission',
  ].includes(bundle.autocomplete.status) || [
    'failed',
    'attention',
    'permission',
  ].includes(bundle.trends.status));
  const processingBundle = bundles.find((bundle) => [
    bundle.autocomplete.status,
    bundle.trends.status,
  ].some((status) => ['processing', 'loading', 'capturing'].includes(status)));
  const queuedBundle = bundles.find((bundle) => [
    bundle.autocomplete.status,
    bundle.trends.status,
  ].includes('queued'));

  if (state.mode === 'semi' && readyBundle) {
    tabState.status = 'ready';
    tabState.pendingAction = 'bundle';
    tabState.pendingBundleKey = readyBundle.key;
    tabState.errorMessage = '';
  } else if (errorBundle) {
    tabState.status = 'error';
    tabState.pendingAction = null;
    tabState.pendingBundleKey = null;
    tabState.errorMessage = bundleErrorMessage(errorBundle);
  } else if (processingBundle) {
    tabState.status = 'processing';
    tabState.pendingAction = null;
    tabState.pendingBundleKey = null;
    tabState.errorMessage = '';
  } else if (queuedBundle) {
    tabState.status = 'queued';
    tabState.pendingAction = null;
    tabState.pendingBundleKey = null;
    tabState.errorMessage = '';
  } else if (!['correction', 'result'].includes(tabState.pendingAction)) {
    tabState.status = 'idle';
    tabState.pendingAction = null;
    tabState.pendingBundleKey = null;
    tabState.errorMessage = '';
  }

  if (state.mode === 'automatic') {
    if (['queued', 'processing'].includes(tabState.status)) {
      const status = tabState.status === 'queued' ? 'Research queued...' : 'Research is running...';
      await sendTabMessage(tabId, { type: 'overlay:show', status }).catch(() => undefined);
    } else {
      await sendTabMessage(tabId, { type: 'overlay:hide' }).catch(() => undefined);
    }
  }
  if (persistState) {
    await persist();
  }
  await updateIcon(tabId);
}

function bundleErrorMessage(bundle) {
  return bundle.deliveryError
    || bundle.trends.errorMessage
    || bundle.autocomplete.errorMessage
    || 'Research work needs attention.';
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

async function popupSnapshot(tabId) {
  return {
    ok: true,
    connected,
    endpoint: state.endpoint,
    username: state.username,
    mode: state.mode,
    tabState: tabId ? ensureTabState(tabId) : undefined,
    trendsCaptureAllowed: await hasTrendsCapturePermission(),
    bundles: orderedBundles().slice(-50).reverse().map(publicResponseBundle),
    jobs: Object.values(state.jobs)
      .sort((left, right) => right.id - left.id)
      .slice(0, 50)
      .map(publicStoredJob),
  };
}

function publicResponseBundle(bundle) {
  return {
    key: bundle.key,
    tabId: bundle.tabId,
    createdAt: bundle.createdAt,
    finalized: bundle.finalized,
    delivered: bundle.delivered,
    deliveryError: bundle.deliveryError || '',
    autocomplete: {
      requested: bundle.autocomplete.requested,
      status: bundle.autocomplete.status,
      jobId: bundle.autocomplete.jobId,
      errorMessage: bundle.autocomplete.errorMessage || '',
    },
    trends: {
      requested: bundle.trends.requested,
      status: bundle.trends.status,
      url: bundle.trends.url,
      errorMessage: bundle.trends.errorMessage || '',
    },
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

async function showSettingsPanel(tabId) {
  const tab = tabId === undefined
    ? undefined
    : await chrome.tabs.get(tabId).catch(() => undefined);
  if (!tab || !CHATGPT_URL.test(tab.url || '')) {
    await showSettingsNotification('Open a chatgpt.com tab, then click the extension icon again.');
    return;
  }

  const response = await sendTabMessage(tabId, {
    type: 'settings:show',
    tabId,
  }).catch(() => undefined);
  if (!response?.ok) {
    await showSettingsNotification('Reload this ChatGPT tab, then click the extension icon again.');
  }
}

async function showSettingsNotification(message) {
  await chrome.notifications.create('autocomplete-settings-help', {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon.png'),
    title: 'Autocomplete Bridge',
    message,
    priority: 1,
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
    pendingBundleKey: null,
    errorMessage: '',
    correctionUsed: false,
  };
  state.tabs[key].pendingBundleKey ||= null;
  return state.tabs[key];
}

function ensureResponseBundle(tabId, responseKey) {
  const key = `${tabId}:${String(responseKey)}`;
  state.bundles[key] ||= normalizeResponseBundle({
    key,
    tabId,
    responseKey: String(responseKey),
    createdAt: new Date().toISOString(),
  }, key);
  return state.bundles[key];
}

function normalizeResponseBundle(value, fallbackKey) {
  const source = value && typeof value === 'object' ? value : {};
  const autocomplete = source.autocomplete && typeof source.autocomplete === 'object'
    ? source.autocomplete
    : {};
  const trends = source.trends && typeof source.trends === 'object' ? source.trends : {};
  return {
    key: String(source.key || fallbackKey),
    tabId: Number(source.tabId),
    responseKey: String(source.responseKey || ''),
    createdAt: source.createdAt || new Date().toISOString(),
    finalized: Boolean(source.finalized),
    delivered: Boolean(source.delivered),
    deliveredAt: source.deliveredAt || null,
    notifiedAt: source.notifiedAt || null,
    cancelled: Boolean(source.cancelled),
    deliveryError: String(source.deliveryError || ''),
    autocomplete: {
      requested: Boolean(autocomplete.requested),
      status: String(autocomplete.status || 'none'),
      request: autocomplete.request || null,
      jobId: autocomplete.jobId || null,
      markdown: String(autocomplete.markdown || ''),
      errorMessage: String(autocomplete.errorMessage || ''),
    },
    trends: {
      requested: Boolean(trends.requested),
      status: String(trends.status || 'none'),
      url: String(trends.url || ''),
      tempTabId: Number.isInteger(trends.tempTabId) ? trends.tempTabId : null,
      imageDataUrl: String(trends.imageDataUrl || ''),
      errorMessage: String(trends.errorMessage || ''),
    },
  };
}

function orderedBundles() {
  return Object.values(state.bundles).sort((left, right) => (
    String(left.createdAt).localeCompare(String(right.createdAt))
  ));
}

function findBundleByTrendsTabId(tabId) {
  if (!Number.isInteger(tabId)) {
    return undefined;
  }
  return Object.values(state.bundles).find((bundle) => bundle.trends.tempTabId === tabId);
}

function normalizeStoredState(value) {
  const source = value && typeof value === 'object' ? value : {};
  const bundles = {};
  for (const [key, bundle] of Object.entries(
    source.bundles && typeof source.bundles === 'object' ? source.bundles : {},
  )) {
    bundles[key] = normalizeResponseBundle(bundle, key);
  }
  return {
    endpoint: typeof source.endpoint === 'string' ? source.endpoint : DEFAULT_ENDPOINT,
    username: typeof source.username === 'string' ? source.username : '',
    token: typeof source.token === 'string' ? source.token : '',
    mode: ['inactive', 'automatic', 'semi'].includes(source.mode) ? source.mode : 'inactive',
    preferredMode: ['inactive', 'automatic', 'semi'].includes(source.preferredMode) ? source.preferredMode : 'inactive',
    everConnected: Boolean(source.everConnected),
    jobs: source.jobs && typeof source.jobs === 'object' ? source.jobs : {},
    tabs: source.tabs && typeof source.tabs === 'object' ? source.tabs : {},
    bundles,
    trendsQueue: Array.isArray(source.trendsQueue) ? source.trendsQueue.map(String) : [],
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

function delay(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
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
