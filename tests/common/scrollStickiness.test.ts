import {
  isNearBottom,
  decideStickOnScroll,
  shouldRestickOnLengthChange,
  computeStreamingSignature,
  isStatusDoneTransition,
  STICKY_THRESHOLD_PX,
  SCROLL_UP_THRESHOLD_PX,
  type ScrollableMessage,
} from '../../src/common/scrollStickiness';

describe('isNearBottom', () => {
  it('returns true when exactly at the bottom (distance 0)', () => {
    expect(isNearBottom(1000, 600, 400)).toBe(true);
  });

  it('returns false when scrolled up far from the bottom', () => {
    expect(isNearBottom(1000, 100, 400)).toBe(false);
  });

  it('returns true when within the sticky threshold (distance 32)', () => {
    expect(isNearBottom(1000, 568, 400)).toBe(true);
  });

  it('returns false just past the sticky threshold (distance 33)', () => {
    expect(isNearBottom(1000, 567, 400)).toBe(false);
  });

  it('honors a custom threshold', () => {
    expect(isNearBottom(1000, 550, 400, 100)).toBe(true);
    expect(isNearBottom(1000, 490, 400, 100)).toBe(false);
  });

  it('exposes the sticky threshold constant', () => {
    expect(STICKY_THRESHOLD_PX).toBe(32);
  });
});

describe('decideStickOnScroll', () => {
  it("returns 'stick' when near the bottom (scroll back resumes auto-scroll)", () => {
    expect(decideStickOnScroll(568, 100, true)).toBe('stick');
  });

  it("returns 'release' on genuine upward scroll while not near the bottom", () => {
    expect(decideStickOnScroll(100, 500, false)).toBe('release');
  });

  it("returns 'keep' when stationary and not near the bottom (virtua churn)", () => {
    expect(decideStickOnScroll(500, 500, false)).toBe('keep');
  });

  it("returns 'keep' on downward scroll while not near the bottom (virtua correction)", () => {
    expect(decideStickOnScroll(510, 500, false)).toBe('keep');
  });

  it("returns 'keep' on micro-upward scroll within the threshold (virtua jitter)", () => {
    expect(decideStickOnScroll(498, 500, false)).toBe('keep');
  });

  it("gives 'stick' priority over upward movement when near the bottom", () => {
    expect(decideStickOnScroll(100, 500, true)).toBe('stick');
  });

  it('honors a custom scroll-up threshold', () => {
    expect(decideStickOnScroll(490, 500, false, 5)).toBe('release');
    expect(decideStickOnScroll(490, 500, false, 20)).toBe('keep');
  });

  it('exposes the scroll-up threshold constant', () => {
    expect(SCROLL_UP_THRESHOLD_PX).toBe(2);
  });
});

describe('shouldRestickOnLengthChange', () => {
  it('returns true when a message is added', () => {
    expect(shouldRestickOnLengthChange(5, 4)).toBe(true);
  });

  it('returns true for the first message', () => {
    expect(shouldRestickOnLengthChange(1, 0)).toBe(true);
  });

  it('returns false when a message is removed (compaction/trim)', () => {
    expect(shouldRestickOnLengthChange(3, 4)).toBe(false);
  });

  it('returns false when length is unchanged', () => {
    expect(shouldRestickOnLengthChange(4, 4)).toBe(false);
  });
});

describe('computeStreamingSignature', () => {
  const msg = (partial: Partial<ScrollableMessage>): ScrollableMessage => ({
    content: '',
    thinking: '',
    status: 'streaming',
    toolCalls: [],
    ...partial,
  });

  it('changes when content length grows (streaming)', () => {
    const before = computeStreamingSignature(msg({ content: 'a'.repeat(10) }));
    const after = computeStreamingSignature(msg({ content: 'a'.repeat(20) }));
    expect(after).not.toBe(before);
  });

  it('changes when thinking length grows', () => {
    const before = computeStreamingSignature(msg({ thinking: 'a'.repeat(5) }));
    const after = computeStreamingSignature(msg({ thinking: 'a'.repeat(15) }));
    expect(after).not.toBe(before);
  });

  it('changes when a tool result is set (toolCall.result grows)', () => {
    const before = computeStreamingSignature(
      msg({ toolCalls: [{ status: 'executing', requiresConfirmation: false }] }),
    );
    const after = computeStreamingSignature(
      msg({
        toolCalls: [{ status: 'executing', result: 'x'.repeat(100), requiresConfirmation: false }],
      }),
    );
    expect(after).not.toBe(before);
  });

  it('changes when a tool call status transitions', () => {
    const before = computeStreamingSignature(
      msg({ toolCalls: [{ status: 'executing', requiresConfirmation: false }] }),
    );
    const after = computeStreamingSignature(
      msg({ toolCalls: [{ status: 'done', requiresConfirmation: false }] }),
    );
    expect(after).not.toBe(before);
  });

  it('changes when a tool call requires confirmation (confirmation card)', () => {
    const before = computeStreamingSignature(
      msg({ toolCalls: [{ status: 'pending', requiresConfirmation: false }] }),
    );
    const after = computeStreamingSignature(
      msg({ toolCalls: [{ status: 'pending', requiresConfirmation: true }] }),
    );
    expect(after).not.toBe(before);
  });

  it('changes when status transitions to done (answer available)', () => {
    const before = computeStreamingSignature(msg({ status: 'streaming' }));
    const after = computeStreamingSignature(msg({ status: 'done' }));
    expect(after).not.toBe(before);
  });

  it('includes every tool call in the signature', () => {
    const one = computeStreamingSignature(
      msg({ toolCalls: [{ status: 'done', requiresConfirmation: false }] }),
    );
    const two = computeStreamingSignature(
      msg({
        toolCalls: [
          { status: 'done', requiresConfirmation: false },
          { status: 'executing', requiresConfirmation: false },
        ],
      }),
    );
    expect(two).not.toBe(one);
  });

  it('returns empty string for undefined message', () => {
    expect(computeStreamingSignature(undefined)).toBe('');
  });

  it('handles a message without tool calls', () => {
    expect(computeStreamingSignature(msg({ content: 'hi', status: 'done' }))).toBe('2:0:done:');
  });

  it('handles an empty message', () => {
    expect(computeStreamingSignature(msg({}))).toBe('0:0:streaming:');
  });
});

describe('isStatusDoneTransition', () => {
  it('detects streaming → done', () => {
    expect(isStatusDoneTransition('streaming', 'done')).toBe(true);
  });

  it('detects pending → done', () => {
    expect(isStatusDoneTransition('pending', 'done')).toBe(true);
  });

  it('detects undefined → done (initial load of a done message)', () => {
    expect(isStatusDoneTransition(undefined, 'done')).toBe(true);
  });

  it('returns false when already done', () => {
    expect(isStatusDoneTransition('done', 'done')).toBe(false);
  });

  it('returns false when transitioning to error', () => {
    expect(isStatusDoneTransition('streaming', 'error')).toBe(false);
  });

  it('returns false when staying streaming', () => {
    expect(isStatusDoneTransition('streaming', 'streaming')).toBe(false);
  });

  it('returns false when entering streaming from undefined', () => {
    expect(isStatusDoneTransition(undefined, 'streaming')).toBe(false);
  });
});
