<template>
  <slot v-if="entitlementStore.isLocalUltimate" />
  <div v-else class="paid-gate" :class="{ 'paid-gate--compact': compact }">
    <AuroraBackground v-if="!hasPoster || compact" />
    <template v-if="!compact">
      <div class="paid-gate__stage">
        <component :is="posterComponent" v-if="hasPoster" class="paid-gate__poster">
          <template #cta>
            <div class="paid-gate__unlock" :class="{ 'paid-gate__unlock--pulse': autoPrompt }">
              <ShimmerButton
                class="paid-gate__unlock-btn"
                @click="openUpgradeDialog(feature, { coverCta: true })"
              >
                <span class="unlock-copy">
                  <span class="unlock-copy__main">
                    <Sparkles class="unlock-copy__icon" />
                    {{ $t('plan.gate.cta.unlock') }}
                  </span>
                  <span class="unlock-copy__sub">{{ $t('plan.gate.cta.unlockSub') }}</span>
                </span>
              </ShimmerButton>
            </div>
          </template>
        </component>
      </div>
    </template>
    <div v-if="compact" class="paid-gate__scene">
      <div class="gate-card gate-card--compact">
        <component
          :is="posterComponent"
          v-if="hasPoster"
          class="gate-card__bg"
          data-poster-context="card"
        />
        <ProgressiveBlur v-if="hasPoster" class="gate-card__scrim-blur" height="72%" />
        <div v-if="hasPoster" class="gate-card__scrim-tint" />
        <div class="gate-card__content">
          <div class="gate-card__heading">
            <h3 class="gate-card__title">{{ $t(`plan.gate.headline.${feature}`) }}</h3>
            <p class="gate-card__sub">{{ $t('plan.gate.additive') }}</p>
          </div>
          <div class="gate-card__tiles">
            <div v-for="tile in tiles" :key="tile.titleKey" class="gate-tile">
              <span class="gate-tile__icon">
                <component :is="tile.icon" class="h-4 w-4" />
              </span>
              <span class="gate-tile__text">
                <b>{{ $t(tile.titleKey) }}</b>
                <i>{{ $t(tile.descKey) }}</i>
              </span>
            </div>
          </div>
          <div v-if="providerGroups.length" class="gate-card__providers">
            <p class="prov-title">{{ $t(provTitleKey) }}</p>
            <div v-for="group in providerGroups" :key="group.labelKey" class="prov-group">
              <span class="prov-group__label">{{ $t(group.labelKey) }}</span>
              <div class="prov-group__chips">
                <span v-for="p in group.items" :key="p.label" class="prov-chip">
                  <span :class="p.icon" />
                  {{ p.label }}
                </span>
              </div>
            </div>
          </div>
          <div class="gate-card__actions">
            <Button
              v-if="userStore.isLoggedIn"
              variant="outline"
              size="sm"
              :disabled="refreshing"
              @click="handleRefresh"
            >
              <RefreshCw v-if="refreshing" class="mr-2 h-4 w-4 animate-spin" />
              {{ $t('plan.upgrade.refresh') }}
            </Button>
            <ShimmerButton
              v-if="userStore.isLoggedIn"
              size="sm"
              @click="openUpgradeDialog(feature)"
            >
              {{ $t('plan.upgrade.cta') }}
            </ShimmerButton>
            <template v-else>
              <Button variant="outline" size="sm" @click="handleSubscribe">
                {{ $t('plan.gate.cta.subscribe') }}
              </Button>
              <ShimmerButton size="sm" @click="handleStartFree">
                {{ $t('plan.gate.cta.trial') }}
              </ShimmerButton>
            </template>
          </div>
          <p class="gate-card__trust-line">{{ $t('plan.gate.trustLine') }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { Bot, Plug, RefreshCw, Server, Sparkles, WandSparkles } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { type PaidFeature, UPGRADE_URL } from '../../common';
import { useEntitlementStore, useUserStore } from '../../store';
import { open } from '@tauri-apps/plugin-shell';
import { authService } from '../../datasources';
import { openUpgradeDialog } from './upgradeDialogService';
import { AuroraBackground, ProgressiveBlur, ShimmerButton } from './effects';
import { posterFor } from './FeaturePoster';

const props = withDefaults(
  defineProps<{ feature: PaidFeature; compact?: boolean; autoPrompt?: boolean }>(),
  { compact: false, autoPrompt: true },
);

const entitlementStore = useEntitlementStore();
const userStore = useUserStore();
const refreshing = ref(false);

const posterComponent = computed(() => posterFor(props.feature));
const hasPoster = computed(() => !!posterFor(props.feature));

const tiles = computed(() => {
  if (props.feature === 'ai') {
    return [
      {
        icon: WandSparkles,
        titleKey: 'plan.gate.tiles.aiQueryT',
        descKey: 'plan.gate.tiles.aiQueryD',
      },
      { icon: Bot, titleKey: 'plan.gate.tiles.aiAgentT', descKey: 'plan.gate.tiles.aiAgentD' },
    ];
  }
  if (props.feature === 'mcp_bridge') {
    return [
      {
        icon: Server,
        titleKey: 'plan.gate.tiles.mcpServerT',
        descKey: 'plan.gate.tiles.mcpServerD',
      },
      {
        icon: Plug,
        titleKey: 'plan.gate.tiles.mcpClientsT',
        descKey: 'plan.gate.tiles.mcpClientsD',
      },
    ];
  }
  return [];
});

const provTitleKey = computed(() =>
  props.feature === 'mcp_bridge' ? 'plan.gate.detail.mcp' : 'plan.gate.detail.ai',
);

const providerGroups = computed(() => {
  if (props.feature === 'ai') {
    return [
      {
        labelKey: 'plan.gate.groups.cloud',
        items: [
          { label: 'OpenAI', icon: 'i-simple-icons-openai' },
          { label: 'Anthropic', icon: 'i-simple-icons-anthropic' },
          { label: 'Gemini', icon: 'i-simple-icons-googlegemini' },
          { label: 'DeepSeek', icon: 'i-simple-icons-deepseek' },
          { label: 'Grok', icon: 'i-simple-icons-x' },
          { label: 'Mistral', icon: 'i-simple-icons-mistralai' },
          { label: 'Azure', icon: 'i-simple-icons-microsoftazure' },
        ],
      },
      {
        labelKey: 'plan.gate.groups.local',
        items: [
          { label: 'Ollama', icon: 'i-simple-icons-ollama' },
          { label: 'LM Studio', icon: 'i-lucide-cpu' },
        ],
      },
      {
        labelKey: 'plan.gate.groups.custom',
        items: [
          { label: 'OpenAI-compatible', icon: 'i-lucide-plug' },
          { label: 'Anthropic-compatible', icon: 'i-lucide-plug' },
        ],
      },
    ];
  }
  if (props.feature === 'mcp_bridge') {
    return [
      {
        labelKey: 'plan.gate.groups.clients',
        items: [
          { label: 'Claude Desktop', icon: 'i-simple-icons-claude' },
          { label: 'Cursor', icon: 'i-simple-icons-cursor' },
          { label: 'Windsurf', icon: 'i-simple-icons-windsurf' },
          { label: 'Any MCP client', icon: 'i-lucide-plug' },
        ],
      },
    ];
  }
  return [];
});

let promptTimer: ReturnType<typeof setTimeout> | undefined;

onMounted(() => {
  if (userStore.isLoggedIn) {
    entitlementStore.refreshEntitlement(false);
  }
  // Entrance sequence: poster settles (0.7s) → CTA enters (~1.2s) → CTA
  // pulses for attention (1.9s) → modal opens (2.8s). The poster's scenario
  // animation stays visible behind the modal, so the flow is never skipped.
  if (!props.compact && props.autoPrompt) {
    promptTimer = setTimeout(() => {
      if (!entitlementStore.isLocalUltimate) {
        openUpgradeDialog(props.feature, { coverCta: true });
      }
    }, 2700);
  }
});

onBeforeUnmount(() => {
  clearTimeout(promptTimer);
});

const handleRefresh = async () => {
  refreshing.value = true;
  try {
    await entitlementStore.refreshEntitlement(true);
  } finally {
    refreshing.value = false;
  }
};

const handleStartFree = async () => {
  await authService.openRegisterUrl();
};

const handleSubscribe = async () => {
  await open(UPGRADE_URL);
};
</script>

<style scoped>
.paid-gate {
  position: relative;
  height: 100%;
  width: 100%;
  overflow: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: hsl(var(--background));
}

.paid-gate--compact {
  padding: 28px;
  overflow: hidden;
}

/* The stage wraps the poster window and keeps the unlock CTA inside its
   footprint; aurora shows through the gaps around it. */
.paid-gate__stage {
  position: relative;
  z-index: 1;
  width: min(78%, 1180px);
  height: min(76%, 720px);
  margin: auto;
}

.paid-gate__poster {
  width: 100%;
  height: 100%;
}

/* The CTA is slotted into the poster's own flex column (poster__cta) — its
   position is structural, not absolutely positioned, so no containing-block
   resolution can ever move it. */
.paid-gate__unlock {
  animation: gate-rise 0.55s cubic-bezier(0.22, 1, 0.36, 1) 1.15s backwards;
}

.paid-gate__unlock--pulse {
  animation:
    gate-rise 0.55s cubic-bezier(0.22, 1, 0.36, 1) 1.15s backwards,
    unlock-pulse 0.55s ease-in-out 1 1.9s;
}

.paid-gate__unlock-btn {
  min-width: 240px;
}

.unlock-copy {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 3px 0;
}

.unlock-copy__main {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 14px;
}

.unlock-copy__icon {
  width: 15px;
  height: 15px;
}

.unlock-copy__sub {
  font-size: 10px;
  font-weight: 500;
  opacity: 0.85;
  font-variant-numeric: tabular-nums;
}

@keyframes unlock-pulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.045);
  }
}

.paid-gate__scene {
  position: relative;
  z-index: 1;
  display: flex;
  width: min(100%, 1040px);
  height: min(100%, 560px);
  margin: auto;
  padding: 0;
}

.gate-card.gate-card--compact {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  width: 100%;
  height: 100%;
  padding: 0;
  overflow: hidden;
  animation: gate-rise 0.55s cubic-bezier(0.22, 1, 0.36, 1) 0.15s backwards;
}

/* The poster IS the card background; the copy sits on the blurred fold. */
.gate-card__bg {
  position: absolute;
  inset: 0;
}

.gate-card__bg :deep(.poster) {
  border: none;
  border-radius: 0;
  box-shadow: none;
}

/* the poster's own fold/chip would double up under the content scrim */
.gate-card__bg :deep(.progressive-blur),
.gate-card__bg :deep(.poster__lock),
.gate-card__bg :deep(.poster__cta) {
  display: none;
}

.gate-card__scrim-blur {
  z-index: 1;
}

.gate-card__scrim-tint {
  position: absolute;
  inset-inline: 0;
  bottom: 0;
  z-index: 1;
  height: 72%;
  background: linear-gradient(
    to top,
    hsl(var(--background) / 0.97) 40%,
    hsl(var(--background) / 0.82) 62%,
    hsl(var(--background) / 0.35) 86%,
    transparent
  );
}

.gate-card__content {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  padding: 0 24px 20px;
}

.gate-card > * {
  animation: gate-rise 0.55s cubic-bezier(0.22, 1, 0.36, 1) backwards;
}

.gate-card > *:nth-child(2) {
  animation-delay: 0.06s;
}

.gate-card > *:nth-child(3) {
  animation-delay: 0.12s;
}

.gate-card > *:nth-child(4) {
  animation-delay: 0.18s;
}

.gate-card > *:nth-child(5) {
  animation-delay: 0.24s;
}

.gate-card {
  position: relative;
  z-index: 2;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 13px;
  padding: 22px 24px;
  border-radius: 16px;
  border: 1px solid hsl(var(--border) / 0.7);
  background-color: hsl(var(--background) / 0.78);
  backdrop-filter: blur(20px) saturate(1.4);
  -webkit-backdrop-filter: blur(20px) saturate(1.4);
  box-shadow: 0 18px 44px -16px rgba(0, 0, 0, 0.28);
}

.gate-card__heading {
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: center;
}

.gate-card__title {
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: hsl(var(--foreground));
}

.gate-card--compact .gate-card__title {
  font-size: 23px;
  letter-spacing: -0.03em;
}

.gate-card__sub {
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

.gate-card__bullets {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.gate-card--compact .gate-card__bullets {
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px 16px;
}

.gate-card__bullets li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: hsl(var(--foreground));
}

.gate-card__check {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: hsl(var(--primary));
}

.gate-card__tiles {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.gate-tile {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 9px 11px;
  border: 1px solid hsl(var(--border) / 0.6);
  border-radius: 10px;
  background-color: hsl(var(--background) / 0.75);
}

.gate-tile__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  border-radius: 8px;
  background-color: hsl(var(--primary) / 0.12);
  color: hsl(var(--primary));
}

.gate-tile__text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.gate-tile__text b {
  font-size: 11.5px;
  font-weight: 650;
  color: hsl(var(--foreground));
}

.gate-tile__text i {
  font-style: normal;
  font-size: 10px;
  color: hsl(var(--muted-foreground));
}

.gate-card__providers {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.prov-title {
  margin: 0;
  font-size: 11.5px;
  font-weight: 650;
  color: hsl(var(--foreground));
}

.prov-group {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.prov-group__label {
  width: 52px;
  flex-shrink: 0;
  padding-top: 3px;
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: hsl(var(--muted-foreground) / 0.8);
}

.prov-group__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.prov-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 9px 2px 6px;
  border-radius: 999px;
  border: 1px solid hsl(var(--border) / 0.8);
  background-color: hsl(var(--background) / 0.85);
  color: hsl(var(--foreground));
  font-size: 10px;
  font-weight: 600;
}

.prov-chip > span {
  width: 11px;
  height: 11px;
  flex-shrink: 0;
  color: hsl(var(--foreground) / 0.85);
}

.gate-card__actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.gate-card__trust-line {
  text-align: center;
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}

@keyframes gate-rise {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .gate-card > *,
  .paid-gate__poster {
    animation: none;
  }
}

@media (max-width: 880px) {
  .paid-gate__scene {
    width: calc(100% - 32px);
  }
}
</style>
