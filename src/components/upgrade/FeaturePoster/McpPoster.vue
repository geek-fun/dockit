<template>
  <div class="poster" aria-hidden="true">
    <div class="poster__bar">
      <span class="poster__dot" />
      <span class="poster__dot" />
      <span class="poster__dot" />
      <span class="poster__pill">MCP</span>
      <span class="p-status">
        <span class="p-status-dot" />
        {{ $t('setting.mcp.running', { port: 7878 }) }}
      </span>
    </div>

    <div class="poster__body">
      <div class="p-grid">
        <div class="p-col">
          <div class="p-card">
            <span class="p-label">{{ $t('setting.mcp.port') }}</span>
            <div class="p-port">
              <span class="p-port-value">7878</span>
              <span class="p-port-btn">{{ $t('setting.mcp.restart') }}</span>
            </div>
            <div class="p-autostart">
              <span class="p-toggle"><i /></span>
              <span>{{ $t('setting.mcp.autoStart') }}</span>
            </div>
          </div>

          <div class="p-card">
            <span class="p-label">{{ $t('plan.poster.mcp.clients') }}</span>
            <div class="p-clients">
              <span class="p-client">Claude Desktop</span>
              <span class="p-client">Cursor</span>
              <span class="p-client">Any MCP client</span>
            </div>
          </div>
        </div>

        <div class="p-col">
          <div class="p-card p-card--code">
            <span class="p-label">{{ $t('plan.poster.mcp.config') }}</span>
            <pre class="p-code">
{
  "mcpServers": {
    "dockit": {
      "url": "http://localhost:7878/mcp"
    }
  }
}</pre
            >
          </div>
          <div class="p-tools">
            <span v-for="tool in tools" :key="tool" class="p-tool">
              <Wrench class="p-tool-ic" />
              {{ tool }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <div class="poster__cta">
      <slot name="cta" />
    </div>

    <ProgressiveBlur />
    <div class="poster__lock">
      <Lock class="poster__lock-icon" />
      {{ $t('plan.state.ultimate') }}
    </div>
  </div>
</template>

<script lang="ts" setup>
import { Lock, Wrench } from 'lucide-vue-next';
import { ProgressiveBlur } from '../effects';

const tools = [
  'search',
  'count',
  'indexDoc',
  'getDoc',
  'bulk',
  'catIndices',
  'catHealth',
  'clusterHealth',
] as const;
</script>

<style scoped>
.poster {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  border-radius: 14px;
  border: 1px solid hsl(var(--border));
  background-color: hsl(var(--card));
  box-shadow: 0 24px 64px -20px rgba(0, 0, 0, 0.28);
}

.poster__bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  border-bottom: 1px solid hsl(var(--border));
  background-color: hsl(var(--muted) / 0.5);
}

.poster__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: hsl(var(--border));
}

.poster__pill {
  margin-left: 8px;
  padding: 2px 11px;
  border-radius: 999px;
  border: 1px solid hsl(var(--border));
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: hsl(var(--muted-foreground));
}

.p-status {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  font-weight: 600;
  color: hsl(var(--method-post));
}

.p-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background-color: hsl(var(--method-post));
  animation: p-pulse 2.2s ease-in-out infinite;
}

.poster__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  padding: 14px;
  background-color: hsl(var(--background));
}

.p-grid {
  display: grid;
  flex: 1;
  min-height: 0;
  grid-template-columns: 0.9fr 1.1fr;
  gap: 12px;
}

.p-col {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 12px;
}

.p-card {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  border: 1px solid hsl(var(--border) / 0.7);
  border-radius: 10px;
  background-color: hsl(var(--card));
  padding: 12px 14px;
  gap: 9px;
}

.p-card--code {
  justify-content: flex-start;
}

.p-label {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: hsl(var(--muted-foreground));
}

.p-port {
  display: flex;
  align-items: center;
  gap: 8px;
}

.p-port-value {
  flex: 1;
  padding: 5px 10px;
  border: 1px solid hsl(var(--border));
  border-radius: 7px;
  background-color: hsl(var(--background));
  font-size: 11px;
  font-weight: 600;
  color: hsl(var(--foreground));
  font-variant-numeric: tabular-nums;
}

.p-port-btn {
  padding: 5px 10px;
  border: 1px solid hsl(var(--border));
  border-radius: 7px;
  font-size: 10px;
  color: hsl(var(--foreground));
  white-space: nowrap;
}

.p-autostart {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 10.5px;
  color: hsl(var(--muted-foreground));
}

.p-toggle {
  display: inline-flex;
  width: 26px;
  height: 15px;
  border-radius: 999px;
  background-color: hsl(var(--primary));
  padding: 2px;
}

.p-toggle i {
  display: block;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background-color: hsl(var(--background));
  margin-left: auto;
}

.p-clients {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.p-client {
  padding: 3px 9px;
  border: 1px solid hsl(var(--border));
  border-radius: 999px;
  background-color: hsl(var(--background));
  font-size: 9.5px;
  font-weight: 600;
  color: hsl(var(--foreground));
}

.p-code {
  margin: 0;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid hsl(var(--border));
  background-color: hsl(var(--muted) / 0.55);
  font-family: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace;
  font-size: 10.5px;
  line-height: 1.55;
  color: hsl(var(--foreground));
  overflow: hidden;
}

.p-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.p-tool {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: 1px solid hsl(var(--border) / 0.7);
  border-radius: 6px;
  background-color: hsl(var(--muted) / 0.4);
  font-family: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace;
  font-size: 9px;
  color: hsl(var(--muted-foreground));
}

.p-tool-ic {
  width: 9px;
  height: 9px;
}

@keyframes p-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}

@media (prefers-reduced-motion: reduce) {
  .p-status-dot {
    animation: none;
  }
}

/* CTA slot: laid out inside the poster's own flex column so the button is
   structurally pinned to the window bottom — immune to containing-block
   resolution and content height changes. */
.poster__cta {
  position: relative;
  z-index: 2;
  display: flex;
  justify-content: center;
  padding: 18px 0 20px;
}

.poster__lock {
  position: absolute;
  left: 24px;
  bottom: 24px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 13px;
  border-radius: 999px;
  border: 1px solid hsl(var(--primary) / 0.4);
  background-color: hsl(var(--background) / 0.75);
  backdrop-filter: blur(8px);
  font-size: 11.5px;
  font-weight: 600;
  color: hsl(var(--primary));
}

.poster__lock-icon {
  width: 12px;
  height: 12px;
}
</style>
