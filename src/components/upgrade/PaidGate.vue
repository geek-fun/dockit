<template>
  <slot v-if="entitlementStore.isLocalUltimate" />
  <div v-else class="paid-gate" :class="{ 'paid-gate--compact': compact }">
    <AuroraBackground />
    <div class="paid-gate__scene">
      <component
        :is="posterComponent"
        v-if="posterComponent && !compact"
        class="paid-gate__poster"
      />
      <div class="gate-card" :class="{ 'gate-card--compact': compact }">
        <div class="gate-card__heading">
          <h3 class="gate-card__title">{{ $t(`plan.gate.headline.${feature}`) }}</h3>
          <p class="gate-card__sub">{{ $t('plan.gate.additive') }}</p>
        </div>
        <ul class="gate-card__bullets">
          <li v-for="key in bullets" :key="key">
            <Check class="gate-card__check" />
            <span>{{ $t(key) }}</span>
          </li>
        </ul>
        <div class="gate-card__pricing">
          <span class="gate-card__price">{{ $t('plan.gate.price.yearly') }}</span>
          <span class="gate-card__save">{{ $t('plan.gate.price.save') }}</span>
          <span class="gate-card__alt">{{ $t('plan.gate.price.monthly') }}</span>
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
          <ShimmerButton v-if="userStore.isLoggedIn" size="sm" @click="openUpgradeDialog(feature)">
            {{ $t('plan.upgrade.cta') }}
          </ShimmerButton>
          <template v-else>
            <Button variant="outline" size="sm" @click="openUpgradeDialog(feature)">
              {{ $t('plan.upgrade.cta') }}
            </Button>
            <ShimmerButton size="sm" @click="handleStartFree">
              {{ $t('plan.gate.cta.trial') }}
            </ShimmerButton>
          </template>
        </div>
        <p v-if="compact" class="gate-card__trust-line">{{ $t('plan.gate.trustLine') }}</p>
        <ul v-else class="gate-card__trust">
          <li>
            <ShieldCheck class="gate-card__trust-icon" />
            {{ $t('plan.gate.trust.versionLock') }}
          </li>
          <li>
            <KeyRound class="gate-card__trust-icon" />
            {{ $t('plan.gate.trust.byok') }}
          </li>
          <li>
            <CircleSlash class="gate-card__trust-icon" />
            {{ $t('plan.gate.trust.cancel') }}
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import { Check, CircleSlash, KeyRound, RefreshCw, ShieldCheck } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { type PaidFeature } from '../../common';
import { useEntitlementStore, useUserStore } from '../../store';
import { authService } from '../../datasources';
import { openUpgradeDialog } from './upgradeDialogService';
import { AuroraBackground, ShimmerButton } from './effects';
import { posterFor } from './FeaturePoster';

const props = withDefaults(defineProps<{ feature: PaidFeature; compact?: boolean }>(), {
  compact: false,
});

const entitlementStore = useEntitlementStore();
const userStore = useUserStore();
const refreshing = ref(false);

const posterComponent = computed(() => posterFor(props.feature));

const featureBullets: Record<PaidFeature, readonly string[]> = {
  ai: ['plan.gate.bullets.nlq', 'plan.gate.bullets.agent'],
  cluster_manage: ['plan.gate.bullets.monitor', 'plan.gate.bullets.manage'],
  import_export: ['plan.gate.bullets.batch', 'plan.gate.bullets.formats'],
  ssh_tunnel: ['plan.gate.bullets.tunnel'],
  proxy: ['plan.gate.bullets.proxyEgress'],
  aws_profile: ['plan.gate.bullets.aws'],
  mcp_bridge: ['plan.gate.bullets.mcp'],
};

const bullets = computed(() => featureBullets[props.feature]);

onMounted(() => {
  if (userStore.isLoggedIn) {
    entitlementStore.refreshEntitlement(false);
  }
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

.paid-gate__scene {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: min(620px, calc(100% - 48px));
  padding: 40px 0;
}

.paid-gate__poster {
  width: min(600px, 100%);
  margin-bottom: -44px;
  z-index: 1;
  animation: gate-poster-in 0.7s cubic-bezier(0.22, 1, 0.36, 1) backwards;
}

.gate-card {
  position: relative;
  z-index: 2;
  width: min(520px, 100%);
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 24px 28px;
  border-radius: 16px;
  border: 1px solid hsl(var(--border) / 0.7);
  background-color: hsl(var(--background) / 0.72);
  backdrop-filter: blur(20px) saturate(1.4);
  -webkit-backdrop-filter: blur(20px) saturate(1.4);
  box-shadow: 0 18px 48px -16px rgba(0, 0, 0, 0.25);
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

.gate-card--compact {
  width: 100%;
  padding: 20px 24px;
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

.gate-card__pricing {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 8px;
  padding-top: 2px;
}

.gate-card__price {
  font-size: 20px;
  font-weight: 700;
  color: hsl(var(--foreground));
  font-variant-numeric: tabular-nums;
}

.gate-card__save {
  padding: 1px 8px;
  border-radius: 999px;
  background-color: hsl(var(--primary) / 0.12);
  color: hsl(var(--primary));
  font-size: 11px;
  font-weight: 700;
}

.gate-card__alt {
  font-size: 12.5px;
  color: hsl(var(--muted-foreground));
  font-variant-numeric: tabular-nums;
}

.gate-card__actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.gate-card__trust {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin: 2px 0 0;
  padding: 10px 0 0;
  border-top: 1px solid hsl(var(--border) / 0.6);
  list-style: none;
}

.gate-card__trust li {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}

.gate-card__trust-icon {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  color: hsl(var(--primary) / 0.8);
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

@keyframes gate-poster-in {
  from {
    opacity: 0;
    transform: translateY(18px) scale(0.985);
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
</style>
