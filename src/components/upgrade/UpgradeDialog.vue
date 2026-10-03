<template>
  <Dialog :open="showModal" @update:open="handleClose">
    <DialogContent
      class="upgrade-dialog w-[580px] max-w-[calc(100vw-64px)] p-0 gap-0 overflow-hidden"
    >
      <div class="upgrade-layout">
        <div class="upgrade-visual">
          <AuroraBackground />
          <div class="upgrade-visual__medallion">
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
              <Button variant="outline" size="sm" @click="handleUpgrade">
                {{ $t('plan.gate.cta.subscribe') }}
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
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { open } from '@tauri-apps/plugin-shell';
import { storeToRefs } from 'pinia';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Check, CircleSlash, KeyRound, RefreshCw, ShieldCheck, Sparkles } from 'lucide-vue-next';
import { type PaidFeature, UPGRADE_URL } from '../../common';
import { useEntitlementStore, useUserStore } from '../../store';
import { authService } from '../../datasources';
import { registerUpgradeDialog, type UpgradeDialogOptions } from './upgradeDialogService';
import { AuroraBackground, ShimmerButton } from './effects';
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

const featureStack: ReadonlyArray<{ id: PaidFeature; labelKey: string }> = [
  { id: 'ai', labelKey: 'plan.compare.ai' },
  { id: 'cluster_manage', labelKey: 'plan.compare.cluster' },
  { id: 'import_export', labelKey: 'plan.compare.importExport' },
  { id: 'ssh_tunnel', labelKey: 'plan.compare.ssh' },
  { id: 'proxy', labelKey: 'plan.compare.proxy' },
  { id: 'aws_profile', labelKey: 'plan.compare.aws' },
  { id: 'mcp_bridge', labelKey: 'plan.compare.mcp' },
];

const show = (paidFeature?: PaidFeature, options?: UpgradeDialogOptions) => {
  feature.value = paidFeature;
  showModal.value = true;
  if (options?.coverCta) {
    void alignToCta();
  }
};

const alignToCta = async () => {
  // wait for the portal content to exist (timing differs per app weight)
  for (let i = 0; i < 60; i++) {
    if (document.querySelector('.upgrade-dialog')) break;
    await nextTick();
    await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
  }
  const dialog = document.querySelector('.upgrade-dialog') as HTMLElement | null;
  const cta = document.querySelector('.paid-gate__unlock-btn');
  if (!dialog || !cta) {
    return;
  }
  // The dialog centers on the viewport (top-1/2 + -translate-y-1/2). Margin
  // shifts that center; offsetHeight is layout height — both independent of
  // the entrance animation's transform, so this is exact the moment the
  // element mounts and the dialog enters at its final position (no snap).
  // NOTE: the margin must be set on the DOM element directly — DialogContent's
  // root is a Teleport fragment, Vue does not forward :style there.
  const ctaBottom = cta.getBoundingClientRect().bottom;
  const margin = Math.max(
    0,
    Math.round(ctaBottom + 16 - (window.innerHeight + dialog.offsetHeight) / 2),
  );
  if (margin > 0) {
    dialog.style.marginTop = `${margin}px`;
  }
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
  grid-template-columns: 190px minmax(0, 1fr);
  min-height: 420px;
  max-height: min(80vh, 640px);
}

.upgrade-visual {
  position: relative;
  overflow: hidden;
  border-right: 1px solid hsl(var(--border));
  background-color: hsl(var(--muted) / 0.3);
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
  padding: 26px 28px;
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
  white-space: nowrap;
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

<style>
/* Bottom-to-top entrance for the pricing modal. Unscoped: the dialog element
   is Teleport-mounted and receives no parent scope attribute. Custom keyframes
   animate `transform` only — the horizontal centering lives in the separate
   `translate` property, so the motion is purely vertical. */
.upgrade-dialog.upgrade-dialog[data-state='open'] {
  animation: modal-rise 0.5s cubic-bezier(0.22, 1, 0.36, 1) backwards;
}

.upgrade-dialog.upgrade-dialog[data-state='closed'] {
  animation: modal-sink 0.18s ease-in backwards;
}

@keyframes modal-rise {
  from {
    opacity: 0;
    transform: translateY(46vh) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes modal-sink {
  from {
    opacity: 1;
    transform: translateY(0);
  }
  to {
    opacity: 0;
    transform: translateY(14px);
  }
}
</style>
