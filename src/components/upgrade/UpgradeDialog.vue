<template>
  <Dialog :open="showModal" @update:open="handleClose">
    <DialogContent
      class="upgrade-dialog w-[680px] max-w-[calc(100vw-64px)] p-0 gap-0 overflow-hidden"
    >
      <div class="upgrade-layout">
        <div class="upgrade-visual" data-poster-context="dialog">
          <AuroraBackground />
          <component :is="posterComponent" v-if="posterComponent" class="upgrade-visual__poster" />
          <div v-else class="upgrade-visual__medallion">
            <div class="upgrade-visual__orb">
              <Sparkles class="h-6 w-6" />
            </div>
            <ProBadge size="sm" />
          </div>
        </div>

        <div class="upgrade-panel">
          <div class="upgrade-heading">
            <h2 class="upgrade-title">
              {{ feature ? $t(`plan.gate.headline.${feature}`) : $t('plan.upgrade.title') }}
            </h2>
            <p class="upgrade-sub">{{ $t('plan.gate.additive') }}</p>
          </div>

          <ul class="upgrade-stack">
            <li
              v-for="item in featureStack"
              :key="item.id"
              :class="{ 'upgrade-stack__item--current': item.id === feature }"
            >
              <Check class="upgrade-stack__check" />
              <span>{{ $t(item.labelKey) }}</span>
              <span v-if="item.id === feature" class="upgrade-stack__now">
                {{ $t('plan.gate.currentFeature') }}
              </span>
            </li>
          </ul>

          <div class="upgrade-pricing">
            <button
              type="button"
              :class="['upgrade-price', { 'upgrade-price--active': billing === 'yearly' }]"
              @click="billing = 'yearly'"
            >
              <span class="upgrade-price__value">{{ $t('plan.gate.price.yearly') }}</span>
              <span class="upgrade-price__save">{{ $t('plan.gate.price.save') }}</span>
            </button>
            <button
              type="button"
              :class="['upgrade-price', { 'upgrade-price--active': billing === 'monthly' }]"
              @click="billing = 'monthly'"
            >
              <span class="upgrade-price__value">{{ $t('plan.gate.price.monthly') }}</span>
            </button>
          </div>

          <div v-if="userStore.isLoggedIn && versionLockedPermanently" class="upgrade-state">
            <Badge variant="secondary">{{ $t('plan.upgrade.versionPermanent') }}</Badge>
          </div>
          <div v-else-if="userStore.isLoggedIn && versionLockedOut" class="upgrade-state">
            <Badge variant="outline">{{ $t('plan.upgrade.versionLockedOut') }}</Badge>
          </div>

          <div class="upgrade-actions">
            <template v-if="userStore.isLoggedIn">
              <Button variant="outline" size="sm" :disabled="refreshing" @click="handleRefresh">
                <RefreshCw v-if="refreshing" class="mr-2 h-4 w-4 animate-spin" />
                {{ $t('plan.upgrade.refresh') }}
              </Button>
              <ShimmerButton size="sm" class="flex-1" @click="handleUpgrade">
                {{ $t('plan.upgrade.cta') }}
              </ShimmerButton>
            </template>
            <template v-else>
              <Button variant="outline" size="sm" @click="handleLogin">
                {{ $t('plan.gate.cta.login') }}
              </Button>
              <ShimmerButton size="sm" class="flex-1" @click="handleStartFree">
                {{ $t('plan.gate.cta.trial') }}
              </ShimmerButton>
            </template>
          </div>

          <ul class="upgrade-trust">
            <li>
              <ShieldCheck class="upgrade-trust__icon" />
              {{ $t('plan.gate.trust.versionLock') }}
            </li>
            <li>
              <KeyRound class="upgrade-trust__icon" />
              {{ $t('plan.gate.trust.byok') }}
            </li>
            <li>
              <CircleSlash class="upgrade-trust__icon" />
              {{ $t('plan.gate.trust.cancel') }}
            </li>
          </ul>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { open } from '@tauri-apps/plugin-shell';
import { storeToRefs } from 'pinia';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Check, CircleSlash, KeyRound, RefreshCw, ShieldCheck, Sparkles } from 'lucide-vue-next';
import { type PaidFeature, UPGRADE_URL } from '../../common';
import { useEntitlementStore, useUserStore } from '../../store';
import { authService } from '../../datasources';
import { registerUpgradeDialog } from './upgradeDialogService';
import { AuroraBackground, ShimmerButton } from './effects';
import { posterFor } from './FeaturePoster';
import ProBadge from './ProBadge.vue';

const entitlementStore = useEntitlementStore();
const userStore = useUserStore();
const { view } = storeToRefs(entitlementStore);

const showModal = ref(false);
const refreshing = ref(false);
const billing = ref<'yearly' | 'monthly'>('yearly');
const feature = ref<PaidFeature | undefined>(undefined);

const versionLockedPermanently = computed(() => view.value?.versionLocked ?? false);

// A non-null horizon proves a paid period existed: a release above it while
// the subscription lapsed is a renewal pitch, not a first upgrade.
const versionLockedOut = computed(
  () =>
    !!view.value &&
    !view.value.ultimateActive &&
    !view.value.versionLocked &&
    view.value.versionLockHorizon !== null,
);

const posterComponent = computed(() => (feature.value ? posterFor(feature.value) : null));

const featureStack: ReadonlyArray<{ id: PaidFeature; labelKey: string }> = [
  { id: 'ai', labelKey: 'plan.compare.ai' },
  { id: 'cluster_manage', labelKey: 'plan.compare.cluster' },
  { id: 'import_export', labelKey: 'plan.compare.importExport' },
  { id: 'ssh_tunnel', labelKey: 'plan.compare.ssh' },
  { id: 'proxy', labelKey: 'plan.compare.proxy' },
  { id: 'aws_profile', labelKey: 'plan.compare.aws' },
  { id: 'mcp_bridge', labelKey: 'plan.compare.mcp' },
];

const show = (paidFeature?: PaidFeature) => {
  feature.value = paidFeature;
  showModal.value = true;
};

const hide = () => {
  showModal.value = false;
};

const handleClose = (openState: boolean) => {
  if (!openState) {
    hide();
  }
};

const handleUpgrade = async () => {
  await open(UPGRADE_URL);
};

const handleStartFree = async () => {
  await authService.openRegisterUrl();
};

const handleLogin = async () => {
  await authService.openLoginUrl();
};

const handleRefresh = async () => {
  refreshing.value = true;
  try {
    await entitlementStore.refreshEntitlement(true);
    if (entitlementStore.isLocalUltimate) {
      hide();
    }
  } finally {
    refreshing.value = false;
  }
};

onMounted(() => {
  registerUpgradeDialog(show);
});

onUnmounted(() => {
  registerUpgradeDialog(null);
});
</script>

<style scoped>
.upgrade-layout {
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr);
  min-height: 420px;
  max-height: min(80vh, 640px);
}

.upgrade-visual {
  position: relative;
  overflow: hidden;
  border-right: 1px solid hsl(var(--border));
  background-color: hsl(var(--muted) / 0.3);
}

.upgrade-visual__poster {
  position: relative;
  z-index: 1;
  margin: 18px;
  width: calc(100% - 36px);
  transform-origin: top center;
  box-shadow: none;
  border-radius: 10px;
}

.upgrade-visual__medallion {
  position: relative;
  z-index: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
}

.upgrade-visual__orb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 18px;
  border: 1px solid hsl(var(--primary) / 0.35);
  background-color: hsl(var(--background) / 0.7);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  color: hsl(var(--primary));
}

.upgrade-panel {
  display: flex;
  flex-direction: column;
  gap: 13px;
  padding: 22px 24px;
  min-width: 0;
  overflow-y: auto;
}

.upgrade-heading {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.upgrade-title {
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: hsl(var(--foreground));
}

.upgrade-sub {
  font-size: 12.5px;
  color: hsl(var(--muted-foreground));
}

.upgrade-stack {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid hsl(var(--border) / 0.8);
  border-radius: 10px;
  overflow: hidden;
}

.upgrade-stack li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  font-size: 12.5px;
  color: hsl(var(--foreground));
}

.upgrade-stack li + li {
  border-top: 1px solid hsl(var(--border) / 0.55);
}

.upgrade-stack__check {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
  color: hsl(var(--primary));
}

.upgrade-stack__item--current {
  background-color: hsl(var(--primary) / 0.08);
}

.upgrade-stack__now {
  margin-left: auto;
  padding: 0 7px;
  border-radius: 999px;
  background-color: hsl(var(--primary) / 0.14);
  color: hsl(var(--primary));
  font-size: 10px;
  font-weight: 700;
}

.upgrade-pricing {
  display: flex;
  gap: 8px;
}

.upgrade-price {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid hsl(var(--border));
  background-color: transparent;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;
}

.upgrade-price--active {
  border-color: hsl(var(--primary) / 0.65);
  background-color: hsl(var(--primary) / 0.06);
}

.upgrade-price__value {
  font-size: 13.5px;
  font-weight: 700;
  color: hsl(var(--foreground));
  font-variant-numeric: tabular-nums;
}

.upgrade-price__save {
  padding: 1px 7px;
  border-radius: 999px;
  background-color: hsl(var(--primary) / 0.12);
  color: hsl(var(--primary));
  font-size: 10.5px;
  font-weight: 700;
}

.upgrade-state {
  display: flex;
}

.upgrade-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.upgrade-trust {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin: 0;
  padding: 10px 0 0;
  border-top: 1px solid hsl(var(--border) / 0.6);
  list-style: none;
}

.upgrade-trust li {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  color: hsl(var(--muted-foreground));
}

.upgrade-trust__icon {
  width: 11px;
  height: 11px;
  flex-shrink: 0;
  color: hsl(var(--primary) / 0.8);
}
</style>
