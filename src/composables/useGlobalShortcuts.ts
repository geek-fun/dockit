type GlobalShortcutSpec = {
  key: string | string[];
  ctrlOrMeta: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: () => void;
};

type GlobalShortcutOptions = {
  shortcuts: GlobalShortcutSpec[];
  isActive: () => boolean;
};

const hasCtrlOrMeta = (e: KeyboardEvent): boolean => e.ctrlKey || e.metaKey;

const matchesGlobalStroke = (e: KeyboardEvent, spec: GlobalShortcutSpec): boolean => {
  if (spec.ctrlOrMeta !== hasCtrlOrMeta(e)) return false;
  if (spec.shift !== undefined && spec.shift !== e.shiftKey) return false;
  if (spec.alt !== undefined && spec.alt !== e.altKey) return false;
  const keys = Array.isArray(spec.key) ? spec.key : [spec.key];
  return keys.some(k => e.key.toLowerCase() === k.toLowerCase());
};

export const setupGlobalShortcuts = (options: GlobalShortcutOptions): (() => void) => {
  const { shortcuts, isActive } = options;

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!isActive()) return;
    const matched = shortcuts.find(s => matchesGlobalStroke(e, s));
    if (matched) {
      e.preventDefault();
      e.stopPropagation();
      matched.handler();
    }
  };

  document.addEventListener('keydown', handleKeyDown, true);

  return () => {
    document.removeEventListener('keydown', handleKeyDown, true);
  };
};
