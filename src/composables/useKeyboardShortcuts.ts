import type { Editor } from '../common/monaco';

type StrokeSpec = {
  key: string | string[];
  ctrlOrMeta: boolean;
  shift?: boolean;
  alt?: boolean;
};

type ShortcutBinding = StrokeSpec & {
  handler: () => void;
};

type ChordBinding = {
  first: StrokeSpec;
  second: StrokeSpec;
  handler: () => void;
};

type EditorShortcutOptions = {
  shortcuts?: ShortcutBinding[];
  chords?: ChordBinding[];
};

type ChordState = {
  candidates: ChordBinding[];
  timeoutId: ReturnType<typeof setTimeout>;
};

const CHORD_TIMEOUT_MS = 2000;

let activeChordOwner: symbol | null = null;

const hasCtrlOrMeta = (e: KeyboardEvent): boolean => e.ctrlKey || e.metaKey;

const matchesStroke = (e: KeyboardEvent, stroke: StrokeSpec): boolean => {
  if (stroke.ctrlOrMeta !== hasCtrlOrMeta(e)) return false;
  if ((stroke.shift ?? false) !== e.shiftKey) return false;
  if ((stroke.alt ?? false) !== e.altKey) return false;
  const keys = Array.isArray(stroke.key) ? stroke.key : [stroke.key];
  return keys.some(k => e.key.toLowerCase() === k.toLowerCase());
};

export const setupEditorKeyboardShortcuts = (
  editor: Editor,
  options: EditorShortcutOptions,
): (() => void) => {
  const { shortcuts = [], chords = [] } = options;
  const ownerId = Symbol();

  let chordState: ChordState | null = null;

  const clearChordState = () => {
    if (chordState) {
      clearTimeout(chordState.timeoutId);
      chordState = null;
    }
    if (activeChordOwner === ownerId) {
      activeChordOwner = null;
    }
  };

  const handleChordKeyDown = (e: KeyboardEvent) => {
    if (chordState) {
      if (activeChordOwner !== ownerId) return;
      const matched = chordState.candidates.find(c => matchesStroke(e, c.second));
      clearChordState();
      if (matched) {
        e.preventDefault();
        e.stopPropagation();
        matched.handler();
      }
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
  };

  const handleSingleKeyDown = (e: KeyboardEvent) => {
    if (chordState) return;
    const matched = shortcuts.find(s => matchesStroke(e, s));
    if (matched) {
      e.preventDefault();
      e.stopPropagation();
      matched.handler();
    }
  };

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
};
