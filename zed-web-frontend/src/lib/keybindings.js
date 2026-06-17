const MODIFIER_KEYS = new Set(['alt', 'ctrl', 'cmd', 'shift']);
const NAMED_KEYS = new Map([
  [' ', 'space'],
  ['arrowdown', 'down'],
  ['arrowleft', 'left'],
  ['arrowright', 'right'],
  ['arrowup', 'up'],
  ['control', 'ctrl'],
  ['esc', 'escape'],
  ['meta', 'cmd'],
]);

export const KEYBINDING_SEQUENCE_TIMEOUT_MS = 1000;

export function createKeybindingIndex(bindings) {
  const indexedBindings = bindings.map((binding, index) => ({
    ...binding,
    index,
    sequenceParts: parseKeybindingSequence(binding.sequence),
  }));
  const byFirstStroke = new Map();

  for (const binding of indexedBindings) {
    const firstStroke = binding.sequenceParts[0];

    if (!firstStroke) {
      continue;
    }

    if (!byFirstStroke.has(firstStroke)) {
      byFirstStroke.set(firstStroke, []);
    }

    byFirstStroke.get(firstStroke).push(binding);
  }

  return byFirstStroke;
}

export function resolveKeybinding(index, inputSequence, context) {
  const candidates = index.get(inputSequence[0]) ?? [];
  const exactBindings = [];
  let hasPending = false;

  for (const binding of candidates) {
    if (!bindingIsActive(binding, context) || !sequenceMatchesPrefix(binding.sequenceParts, inputSequence)) {
      continue;
    }

    if (binding.sequenceParts.length === inputSequence.length) {
      exactBindings.push(binding);
    } else {
      hasPending = true;
    }
  }

  exactBindings.sort((left, right) => right.index - left.index);

  return {
    exactBinding: exactBindings[0] ?? null,
    hasPending,
  };
}

export function keyboardEventToKeystroke(event) {
  const key = normalizeEventKey(event.key);

  if (!key || key === 'dead' || key === 'process') {
    return '';
  }

  const parts = [];

  if (event.ctrlKey && key !== 'ctrl') {
    parts.push('ctrl');
  }

  if (event.metaKey && key !== 'cmd') {
    parts.push('cmd');
  }

  if (event.altKey && key !== 'alt') {
    parts.push('alt');
  }

  if (event.shiftKey && key !== 'shift' && shouldKeepShiftModifier(event.key, key)) {
    parts.push('shift');
  }

  parts.push(key);

  return parts.join('-');
}

export function isEditableKeyboardTarget(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

export function isPlainTextKeystroke(keystroke) {
  const parts = keystroke.split('-');
  const key = parts[parts.length - 1];

  return parts.length === 1 && (key.length === 1 || MODIFIER_KEYS.has(key) || key === 'space');
}

export function isModifierOnlyKeystroke(keystroke) {
  return MODIFIER_KEYS.has(keystroke);
}

function parseKeybindingSequence(sequence) {
  if (Array.isArray(sequence)) {
    return sequence.map(normalizeKeystroke).filter(Boolean);
  }

  return String(sequence).split(/\s+/).map(normalizeKeystroke).filter(Boolean);
}

function normalizeKeystroke(keystroke) {
  return String(keystroke).trim().toLowerCase().replace(/\+/g, '-');
}

function normalizeEventKey(key) {
  const normalized = String(key).toLowerCase();

  if (NAMED_KEYS.has(normalized)) {
    return NAMED_KEYS.get(normalized);
  }

  return normalized;
}

function shouldKeepShiftModifier(rawKey, normalizedKey) {
  if (normalizedKey.length > 1) {
    return true;
  }

  return /^[A-Z]$/.test(rawKey);
}

function bindingIsActive(binding, context) {
  if (context?.suppressKeybindings && !binding.global) {
    return false;
  }

  if (typeof binding.when !== 'function') {
    return true;
  }

  return binding.when(context);
}

function sequenceMatchesPrefix(targetSequence, inputSequence) {
  if (targetSequence.length < inputSequence.length) {
    return false;
  }

  for (let index = 0; index < inputSequence.length; index += 1) {
    if (targetSequence[index] !== inputSequence[index]) {
      return false;
    }
  }

  return true;
}
