/**
 * DOM-level keyboard shortcut handler for Monaco Editor.
 *
 * Monaco standalone uses `USLayoutResolvedKeybinding` which maps KeyCode values
 * to physical US key positions. This breaks shortcuts like Ctrl+/ and Ctrl+- on
 * non-US layouts (French AZERTY, German QWERTZ, etc.) where `/` and `-` are at
 * different physical key positions.
 *
 * This module intercepts `keydown` events and checks `event.key` (logical
 * character) instead of `event.keyCode` (physical position), which works
 * correctly regardless of keyboard layout.
 *
 * Single-stroke shortcuts are attached to the editor DOM node (capture phase).
 * Chord shortcuts are attached to `document` (capture phase) because on
 * macOS/WKWebView the second stroke's keydown event may be retargeted after the
 * first stroke's stopPropagation, causing it to miss the editor DOM node
 * listener. Document-level capture ensures the second stroke is always caught.
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

let activeChordOwner: symbol | null = null;

export function setupEditorKeyboardShortcuts(
  editor: Editor,
  options: EditorShortcutOptions,
): () => void {
  const { shortcuts = [], chords = [] } = options;
  const ownerId = Symbol();

  let chordState: {
    candidates: ChordBinding[];
    timeoutId: ReturnType<typeof setTimeout>;
  } | null = null;

  function clearChordState() {
    if (chordState) {
      clearTimeout(chordState.timeoutId);
      chordState = null;
    }
    if (activeChordOwner === ownerId) {
      activeChordOwner = null;
    }
  }

  function handleChordKeyDown(e: KeyboardEvent) {
    if (chordState) {
      if (activeChordOwner !== ownerId) return;
      for (const candidate of chordState.candidates) {
        if (matchesStroke(e, candidate.second)) {
          e.preventDefault();
          e.stopPropagation();
          clearChordState();
          candidate.handler();
          return;
        }
      }
      clearChordState();
      return;
    }

    if (activeChordOwner !== null) return;
    if (!editor.hasTextFocus()) return;

    const candidates = chords.filter(chord => matchesStroke(e, chord.first));
    if (candidates.length > 0) {
      e.preventDefault();
      e.stopPropagation();
      activeChordOwner = ownerId;
      chordState = {
        candidates,
        timeoutId: setTimeout(clearChordState, CHORD_TIMEOUT_MS),
      };
    }
  }

  // Single-stroke handler on editor DOM node — unaffected by the chord bug.
  function handleSingleKeyDown(e: KeyboardEvent) {
    if (chordState) return;

    for (const shortcut of shortcuts) {
      if (matchesStroke(e, shortcut)) {
        e.preventDefault();
        e.stopPropagation();
        shortcut.handler();
        return;
      }
    }
  }

  if (chords.length > 0) {
    document.addEventListener('keydown', handleChordKeyDown, true);
  }

  const domNode = editor.getDomNode();
  if (domNode && shortcuts.length > 0) {
    domNode.addEventListener('keydown', handleSingleKeyDown, true);
  }

  return () => {
    clearChordState();
    document.removeEventListener('keydown', handleChordKeyDown, true);
    if (domNode) {
      domNode.removeEventListener('keydown', handleSingleKeyDown, true);
    }
  };
}
