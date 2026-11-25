import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sfc = readFileSync(join(__dirname, '../../src/components/agent-message-bubble.vue'), 'utf8');

describe('agent-message-bubble layout contract', () => {
  it('does not apply pre-wrap whitespace to rendered thinking markdown', () => {
    const activityBodyBlock = sfc.match(/\.activity-body\s*\{([^}]*)\}/)?.[1] ?? '';
    const thinkingBodyBlock = sfc.match(/\.activity-body\.thinking-body\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(activityBodyBlock).not.toContain('white-space: pre-wrap');
    expect(activityBodyBlock).not.toContain('word-break: break-all');
    expect(thinkingBodyBlock).toContain('white-space: normal');
    expect(thinkingBodyBlock).toContain('word-break: normal');
  });

  it('keeps tool call details closed by default without an :open binding', () => {
    const toolCallsLoop =
      sfc.match(/<template v-for="tc in message\.toolCalls"[\s\S]*?<details([^>]*)>/)?.[1] ?? '';

    expect(toolCallsLoop).toContain('class="activity-item-details"');
    expect(toolCallsLoop).not.toContain('open');
  });
});
