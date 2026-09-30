<template>
  <div class="space-y-4">
    <div>
      <h3 class="text-lg font-semibold">{{ $t('plan.section.title') }}</h3>
      <p class="text-sm text-muted-foreground mt-1">{{ $t('plan.section.desc') }}</p>
    </div>
    <Card>
      <CardContent class="p-5 space-y-4">
        <div class="flex items-center justify-between gap-4 flex-wrap">
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <Badge :variant="entitlementStore.isLocalUltimate ? 'default' : 'secondary'">
                {{ $t(`plan.state.${planState}`) }}
              </Badge>
              <span v-if="userStore.isLoggedIn" class="text-sm text-muted-foreground">
                {{ userStore.email || userStore.username }}
              </span>
            </div>
            <p class="text-xs text-muted-foreground">{{ versionStateText }}</p>
            <p v-if="expiryText" class="text-xs text-muted-foreground">{{ expiryText }}</p>
            <p v-if="entitlementStore.cancelScheduled" class="text-xs text-amber-600">
              {{ $t('plan.section.cancelScheduled') }}
            </p>
            <p
              v-if="entitlementStore.hasEntitlementError && userStore.isLoggedIn"
              class="text-xs text-destructive"
            >
              {{ $t('plan.section.checkFailed') }}
            </p>
          </div>
          <div class="flex items-center gap-2">
            <Button
              v-if="userStore.isLoggedIn"
              variant="outline"
              size="sm"
              :disabled="refreshing"
              @click="handleRefresh"
            >
              <RefreshCw v-if="refreshing" class="mr-2 h-4 w-4 animate-spin" />
              {{ $t('plan.section.refresh') }}
            </Button>
            <Button
              v-if="userStore.isLoggedIn && !entitlementStore.isLocalUltimate"
              size="sm"
              @click="handleUpgrade"
            >
              {{ $t('plan.upgrade.cta') }}
            </Button>
            <template v-if="!userStore.isLoggedIn">
              <Button variant="outline" size="sm" @click="handleUpgrade">
                {{ $t('plan.upgrade.cta') }}
              </Button>
              <Button size="sm" @click="handleStartFree">
                {{ $t('plan.upgrade.startFree') }}
              </Button>
            </template>
            <Button v-if="userStore.isLoggedIn" variant="outline" size="sm" @click="handleLogout">
              {{ $t('plan.section.logout') }}
            </Button>
          </div>
        </div>
        <p v-if="!userStore.isLoggedIn" class="text-xs text-muted-foreground">
          {{ $t('plan.section.notLoggedIn') }}
          <button class="underline text-primary hover:opacity-80" @click="handleGeekfunLogin">
            {{ $t('plan.section.loginLink') }}
          </button>
        </p>
      </CardContent>
    </Card>

    <Card>
      <CardContent class="p-0">
        <div class="compare-grid">
          <div class="compare-head compare-cell">
            {{ $t('plan.gate.additive') }}
          </div>
          <div class="compare-head compare-cell compare-cell--plan">
            {{ $t('plan.state.community') }}
          </div>
          <div class="compare-head compare-cell compare-cell--plan compare-cell--ultimate">
            <span>{{ $t('plan.state.ultimate') }}</span>
            <span class="compare-recommend">{{ $t('plan.gate.recommended') }}</span>
          </div>
          <template v-for="row in compareRows" :key="row.key">
            <div class="compare-cell compare-label">{{ $t(row.key) }}</div>
            <div class="compare-cell compare-cell--plan">
              <X class="h-3.5 w-3.5 compare-no" />
            </div>
            <div class="compare-cell compare-cell--plan compare-cell--ultimate">
              <Check class="h-3.5 w-3.5 compare-yes" />
            </div>
          </template>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { Check, RefreshCw, X } from 'lucide-vue-next';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { authService } from '../../../datasources';
import { useDeviceStore, useEntitlementStore, useUserStore } from '../../../store';
import { lang } from '../../../lang';
import { openUpgradeDialog } from '@/components/upgrade';

const entitlementStore = useEntitlementStore();
const userStore = useUserStore();
const deviceStore = useDeviceStore();
const { view } = storeToRefs(entitlementStore);

const refreshing = ref(false);

const compareRows = [
  { key: 'plan.compare.ai' },
  { key: 'plan.compare.cluster' },
  { key: 'plan.compare.importExport' },
  { key: 'plan.compare.ssh' },
  { key: 'plan.compare.proxy' },
  { key: 'plan.compare.aws' },
  { key: 'plan.compare.mcp' },
  { key: 'plan.compare.versionLock' },
] as const;

const planState = computed(() => (entitlementStore.isLocalUltimate ? 'ultimate' : 'community'));

const versionStateText = computed(() => {
  const release = view.value?.appReleaseDate;
  if (entitlementStore.isLocalUltimate) {
    return view.value?.versionLocked
      ? lang.global.t('plan.section.versionPermanent')
      : lang.global.t('plan.section.subscriptionActive');
  }
  return lang.global.t('plan.section.versionLockedOut', { date: release ?? '' });
});

const expiryText = computed(() => {
  const expiresAt = view.value?.ultimateExpiresAt;
  if (!expiresAt || !entitlementStore.isCloudUltimate) return '';
  return lang.global.t('plan.section.expiresAt', {
    time: new Date(expiresAt).toLocaleString(),
  });
});

const handleRefresh = async () => {
  refreshing.value = true;
  try {
    await entitlementStore.refreshEntitlement(true);
  } finally {
    refreshing.value = false;
  }
};

const handleUpgrade = () => {
  openUpgradeDialog();
};

// Entitlements are account-scoped: the cached view and the device lease must
// never outlive the account session on this machine.
const handleLogout = async () => {
  await entitlementStore.clearCachedEntitlement();
  userStore.resetToken();
  deviceStore.$reset();
};

const handleGeekfunLogin = async () => {
  await authService.openLoginUrl();
};

const handleStartFree = async () => {
  await authService.openRegisterUrl();
};
</script>

<style scoped>
.compare-grid {
  display: grid;
  grid-template-columns: 1fr 92px 112px;
}

.compare-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 14px;
  font-size: 13px;
  color: hsl(var(--foreground));
  border-top: 1px solid hsl(var(--border) / 0.7);
}

.compare-head {
  border-top: none;
  font-size: 12px;
  font-weight: 600;
  color: hsl(var(--muted-foreground));
}

.compare-head.compare-cell:first-child {
  font-weight: 500;
}

.compare-cell--plan {
  justify-content: center;
}

.compare-cell--ultimate {
  background-color: hsl(var(--primary) / 0.05);
}

.compare-recommend {
  padding: 0 7px;
  border-radius: 999px;
  background-color: hsl(var(--primary) / 0.12);
  color: hsl(var(--primary));
  font-size: 10px;
  font-weight: 700;
}

.compare-yes {
  color: hsl(var(--primary));
}

.compare-no {
  color: hsl(var(--muted-foreground) / 0.55);
}
</style>
