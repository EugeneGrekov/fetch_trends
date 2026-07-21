(function initializeAutocompleteBridgeShared(globalObject) {
  'use strict';

  const ALLOWED_KEYS = new Set(['type', 'seeds', 'modifiers']);

  const AUTOCOMPLETE_INSTRUCTION = [
    'Use autocomplete research when it would help validate the exact language people type into Google, rather than relying only on abstract wording or assumptions.',
    '',
    'To request this research from my browser extension, return exactly one fenced JSON block in this format:',
    '',
    '```json',
    '{',
    '  "type": "autocomplete_check",',
    '  "seeds": ["first phrase to check", "second phrase to check"],',
    '  "modifiers": ["optional modifier"]',
    '}',
    '```',
    '',
    '`seeds` is required. `modifiers` is optional. When modifiers are included, list only the exact modifiers to probe. Do not add a version, request ID, metadata, comments, or any other keys. The extension will run the long autocomplete check and return its Markdown report to this chat.',
  ].join('\n');

  const CORRECTION_INSTRUCTION = [
    'The autocomplete request could not be read by my browser extension. Please resend it as exactly one fenced JSON block:',
    '',
    '```json',
    '{',
    '  "type": "autocomplete_check",',
    '  "seeds": ["first phrase to check", "second phrase to check"],',
    '  "modifiers": ["optional modifier"]',
    '}',
    '```',
    '',
    '`seeds` is required and `modifiers` is optional. Use strings only and do not add any other keys.',
  ].join('\n');

  function classifyCodeBlock(text) {
    const source = String(text || '').trim();
    if (!source.includes('autocomplete_check')) {
      return { kind: 'none' };
    }

    let value;
    try {
      value = JSON.parse(source);
    } catch (error) {
      return { kind: 'malformed', reason: 'The autocomplete_check block is not complete valid JSON.' };
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { kind: 'malformed', reason: 'The autocomplete_check request must be a JSON object.' };
    }

    const unknownKey = Object.keys(value).find((key) => !ALLOWED_KEYS.has(key));
    if (unknownKey) {
      return { kind: 'malformed', reason: `Unknown request field: ${unknownKey}.` };
    }

    if (value.type !== 'autocomplete_check') {
      return { kind: 'malformed', reason: 'type must be exactly autocomplete_check.' };
    }

    const seeds = validateRows(value.seeds, false);
    if (!seeds.ok) {
      return { kind: 'malformed', reason: `Invalid seeds: ${seeds.reason}` };
    }

    let modifiers;
    if (value.modifiers !== undefined) {
      modifiers = validateRows(value.modifiers, true);
      if (!modifiers.ok) {
        return { kind: 'malformed', reason: `Invalid modifiers: ${modifiers.reason}` };
      }
    }

    return {
      kind: 'valid',
      request: {
        type: 'autocomplete_check',
        seeds: seeds.values,
        ...(modifiers ? { modifiers: modifiers.values } : {}),
      },
    };
  }

  function classifyCodeBlocks(texts) {
    for (const text of texts) {
      const classification = classifyCodeBlock(text);
      if (classification.kind !== 'none') {
        return classification;
      }
    }

    return { kind: 'none' };
  }

  function validateRows(value, allowEmpty) {
    if (!Array.isArray(value)) {
      return { ok: false, reason: 'expected an array of strings.' };
    }

    const values = [];
    for (const row of value) {
      if (typeof row !== 'string') {
        return { ok: false, reason: 'every row must be a string.' };
      }

      const normalized = row.normalize('NFKC').trim().replace(/\s+/g, ' ');
      if (!normalized) {
        return { ok: false, reason: 'rows may not be empty.' };
      }
      values.push(normalized);
    }

    if (!allowEmpty && values.length === 0) {
      return { ok: false, reason: 'at least one row is required.' };
    }

    return { ok: true, values };
  }

  globalObject.AutocompleteBridgeShared = Object.freeze({
    AUTOCOMPLETE_INSTRUCTION,
    CORRECTION_INSTRUCTION,
    classifyCodeBlock,
    classifyCodeBlocks,
  });
})(globalThis);
