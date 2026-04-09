/**
 * DOM-level keyboard shortcut handler for Monaco Editor.
 *
 * Monaco standalone uses `USLayoutResolvedKeybinding` which maps KeyCode values
 * to physical US key positions. This breaks shortcuts like Ctrl+/ and Ctrl+- on
 * non-US layouts (French AZERTY, German QWERTZ, etc.) where `/` and `-` are at
 * different physical key positions.
 *
 * This module intercepts `keydown` events on the editor DOM and checks `event.key`
 * (logical character) instead of `event.keyCode` (physical position), which works
 * correctly regardless of keyboard layout.
 */

import type { Editor } from '../common/monaco';

interface StrokeSpec {
  key: string | string[];
  ctrlOrMeta: boolean;
  shift?: boolean;
  alt?: boolean;
}

interface ShortcutBinding extends StrokeSpec {
  handler: () => void;
}

interface ChordBinding {
  first: StrokeSpec;
  second: StrokeSpec;
  handler: () => void;
}

interface EditorShortcutOptions {
  shortcuts?: ShortcutBinding[];
  chords?: ChordBinding[];
}

function hasCtrlOrMeta(e: KeyboardEvent): boolean {
  return e.ctrlKey || e.metaKey;
}

function matchesStroke(e: KeyboardEvent, stroke: StrokeSpec): boolean {
  if (stroke.ctrlOrMeta && !hasCtrlOrMeta(e)) return false;
  if (!stroke.ctrlOrMeta && hasCtrlOrMeta(e)) return false;
  if ((stroke.shift ?? false) !== e.shiftKey) return false;
  if ((stroke.alt ?? false) !== e.altKey) return false;
  const keys = Array.isArray(stroke.key) ? stroke.key : [stroke.key];
  return keys.some(k => e.key.toLowerCase() === k.toLowerCase());
}

const CHORD_TIMEOUT_MS = 2000;

export function setupEditorKeyboardShortcuts(
  editor: Editor,
  options: EditorShortcutOptions,
): () => void {
  const { shortcuts = [], chords = [] } = options;

  let chordState: {
    chord: ChordBinding;
    timeoutId: ReturnType<typeof setTimeout>;
  } | null = null;

  function clearChordState() {
    if (chordState) {
      clearTimeout(chordState.timeoutId);
      chordState = null;
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (chordState) {
      const { chord } = chordState;
      if (matchesStroke(e, chord.second)) {
        e.preventDefault();
        e.stopPropagation();
        clearChordState();
        chord.handler();
        return;
      }
      clearChordState();
    }

    for (const chord of chords) {
      if (matchesStroke(e, chord.first)) {
        // Chord prefixes take precedence over single-stroke shortcuts.
        // Example: when Ctrl/Cmd+K starts a chord, we consume it immediately
        // so Monaco never sees that first stroke. If we later introduce a
        // standalone Ctrl/Cmd+K binding, this ordering must be revisited.
        e.preventDefault();
        e.stopPropagation();
        clearChordState();
        chordState = {
          chord,
          timeoutId: setTimeout(clearChordState, CHORD_TIMEOUT_MS),
        };
        return;
      }
    }

    for (const shortcut of shortcuts) {
      if (matchesStroke(e, shortcut)) {
        e.preventDefault();
        e.stopPropagation();
        shortcut.handler();
        return;
      }
    }
  }

  const domNode = editor.getDomNode();
  if (domNode) {
    domNode.addEventListener('keydown', handleKeyDown, true);
  }

  return () => {
    clearChordState();
    if (domNode) {
      domNode.removeEventListener('keydown', handleKeyDown, true);
    }
  };
}
