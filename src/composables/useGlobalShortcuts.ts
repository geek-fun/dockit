/**
 * Global keyboard shortcut handler for app-wide shortcuts.
 *
 * Some shortcuts like "show all shortcuts dialog" should work when the editor tab
 * is open, regardless of whether the Monaco editor DOM has focus. This module
 * attaches document-level listeners to handle these app-wide shortcuts.
 *
 * Uses capture phase (third argument `true`) to intercept events before
 * browser shortcuts (like Ctrl+J for Downloads on Windows) can fire.
 */

interface GlobalShortcutSpec {
  key: string | string[];
  ctrlOrMeta: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: () => void;
}

interface GlobalShortcutOptions {
  shortcuts: GlobalShortcutSpec[];
  isActive: () => boolean; // Returns true if the editor tab/view is currently active
}

function hasCtrlOrMeta(e: KeyboardEvent): boolean {
  return e.ctrlKey || e.metaKey;
}

function matchesGlobalStroke(e: KeyboardEvent, spec: GlobalShortcutSpec): boolean {
  if (spec.ctrlOrMeta && !hasCtrlOrMeta(e)) return false;
  if (!spec.ctrlOrMeta && hasCtrlOrMeta(e)) return false;
  if (spec.shift !== undefined && spec.shift !== e.shiftKey) return false;
  if (spec.alt !== undefined && spec.alt !== e.altKey) return false;
  const keys = Array.isArray(spec.key) ? spec.key : [spec.key];
  return keys.some(k => e.key.toLowerCase() === k.toLowerCase());
}

export function setupGlobalShortcuts(options: GlobalShortcutOptions): () => void {
  const { shortcuts, isActive } = options;

  function handleKeyDown(e: KeyboardEvent) {
    // Only handle shortcuts when the editor tab/view is active
    if (!isActive()) return;

    for (const shortcut of shortcuts) {
      if (matchesGlobalStroke(e, shortcut)) {
        e.preventDefault();
        e.stopPropagation();
        shortcut.handler();
        return;
      }
    }
  }

  // Use capture phase to intercept before browser shortcuts
  document.addEventListener('keydown', handleKeyDown, true);

  return () => {
    document.removeEventListener('keydown', handleKeyDown, true);
  };
}
