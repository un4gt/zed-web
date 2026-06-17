import { useEffect, useMemo, useRef } from 'react';
import {
  createKeybindingIndex,
  isEditableKeyboardTarget,
  isModifierOnlyKeystroke,
  isPlainTextKeystroke,
  keyboardEventToKeystroke,
  KEYBINDING_SEQUENCE_TIMEOUT_MS,
  resolveKeybinding,
} from '../lib/keybindings';

function useWorkbenchKeybindings({ bindings, context, onCommand }) {
  const index = useMemo(() => createKeybindingIndex(bindings), [bindings]);
  const contextRef = useLatestRef(context);
  const onCommandRef = useLatestRef(onCommand);
  const pendingSequenceRef = useRef([]);
  const pendingCommandRef = useRef(null);
  const timeoutRef = useRef(0);

  useEffect(() => {
    function clearPending() {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = 0;
      pendingSequenceRef.current = [];
      pendingCommandRef.current = null;
    }

    function schedulePending(sequence, deferredCommandId = null) {
      window.clearTimeout(timeoutRef.current);
      pendingSequenceRef.current = sequence;
      pendingCommandRef.current = deferredCommandId;
      timeoutRef.current = window.setTimeout(() => {
        const commandId = pendingCommandRef.current;
        clearPending();

        if (commandId) {
          onCommandRef.current(commandId, { source: 'keybinding' });
        }
      }, KEYBINDING_SEQUENCE_TIMEOUT_MS);
    }

    function handleKeyDown(event) {
      if (event.defaultPrevented || event.isComposing || event.repeat) {
        return;
      }

      if (contextRef.current?.suppressKeybindings) {
        clearPending();
        return;
      }

      const keystroke = keyboardEventToKeystroke(event);

      if (!keystroke) {
        return;
      }

      if (
        isEditableKeyboardTarget(event.target) &&
        isPlainTextKeystroke(keystroke) &&
        !isModifierOnlyKeystroke(keystroke)
      ) {
        clearPending();
        return;
      }

      const currentPending = pendingSequenceRef.current;
      const inputSequence = currentPending.length ? [...currentPending, keystroke] : [keystroke];
      const resolved = resolveKeybinding(index, inputSequence, contextRef.current);

      if (resolved.exactBinding && !resolved.hasPending) {
        event.preventDefault();
        event.stopPropagation();
        clearPending();
        onCommandRef.current(resolved.exactBinding.commandId, { source: 'keybinding' });
        return;
      }

      if (resolved.hasPending) {
        event.preventDefault();
        event.stopPropagation();
        schedulePending(inputSequence, resolved.exactBinding?.commandId ?? null);
        return;
      }

      if (!currentPending.length) {
        return;
      }

      clearPending();

      const restarted = resolveKeybinding(index, [keystroke], contextRef.current);

      if (restarted.exactBinding && !restarted.hasPending) {
        event.preventDefault();
        event.stopPropagation();
        onCommandRef.current(restarted.exactBinding.commandId, { source: 'keybinding' });
        return;
      }

      if (restarted.hasPending) {
        event.preventDefault();
        event.stopPropagation();
        schedulePending([keystroke], restarted.exactBinding?.commandId ?? null);
      }
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true });

    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      clearPending();
    };
  }, [contextRef, index, onCommandRef]);
}

function useLatestRef(value) {
  const ref = useRef(value);

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref;
}

export default useWorkbenchKeybindings;
