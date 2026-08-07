// Pure scroll-decision logic for the chat panel.
// Extracted to a testable module (no DOM access) so the sticky-to-bottom
// contract can be unit-tested without mounting the Vue component.

export const STICKY_THRESHOLD_PX = 32;
export const SCROLL_UP_THRESHOLD_PX = 2;

export type ScrollStickDecision = 'stick' | 'release' | 'keep';

export type ScrollableMessage = {
  content?: string;
  thinking?: string;
  status?: string;
  toolCalls?: Array<{
    status: string;
    result?: string;
    requiresConfirmation: boolean;
  }>;
};

export const isNearBottom = (
  scrollHeight: number,
  scrollTop: number,
  clientHeight: number,
  threshold: number = STICKY_THRESHOLD_PX,
): boolean => scrollHeight - (scrollTop + clientHeight) <= threshold;

// Decides the next sticky state from a scroll event.
// - 'stick'   when the viewport is near the bottom (resume auto-scroll)
// - 'release' only on genuine upward scroll while NOT near the bottom.
//             virtua's programmatic corrections (item-add pinning, estimate→
//             measured size adjustments) produce stationary, downward, or
//             micro-upward movement — those return 'keep' so stickToBottom
//             is never falsely released by library-internal scrolling.
// - 'keep'    otherwise — leave the current state unchanged.
export const decideStickOnScroll = (
  currentScrollTop: number,
  lastScrollTop: number,
  nearBottom: boolean,
  scrollUpThreshold: number = SCROLL_UP_THRESHOLD_PX,
): ScrollStickDecision => {
  if (nearBottom) return 'stick';
  if (currentScrollTop < lastScrollTop - scrollUpThreshold) return 'release';
  return 'keep';
};

// Re-stick only when messages are APPENDED (n > old). Decreases (compaction
// trim, orphaned-streaming-message removal) must not yank the viewport.
export const shouldRestickOnLengthChange = (newLen: number, oldLen: number): boolean =>
  newLen > oldLen;

// Watch-key signature for the last message. Covers every source of visual
// growth: content/thinking length, status (streaming → done = answer ready),
// and per-tool-call state (status, result length, confirmation card).
export const computeStreamingSignature = (message: ScrollableMessage | undefined): string => {
  if (!message) return '';
  const toolCallsSig = (message.toolCalls ?? [])
    .map(tc => `${tc.status}:${tc.result?.length ?? 0}:${tc.requiresConfirmation ? 1 : 0}`)
    .join(',');
  return `${message.content?.length ?? 0}:${message.thinking?.length ?? 0}:${message.status ?? ''}:${toolCallsSig}`;
};

export const isStatusDoneTransition = (
  oldStatus: string | undefined,
  newStatus: string | undefined,
): boolean => oldStatus !== 'done' && newStatus === 'done';
