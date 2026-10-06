<template>
  <div class="space-y-4">
    <div>
      <h3 class="text-lg font-semibold">{{ $t('plan.section.title') }}</h3>
      <p class="text-sm text-muted-foreground mt-1">{{ $t('plan.section.desc') }}</p>
    </div>
    <Card>
      <CardContent class="px-5 py-4 space-y-4">
        <div class="flex items-center gap-3 flex-wrap">
          <Badge :variant="entitlementStore.isLocalUltimate ? 'default' : 'secondary'">
            {{ $t(`plan.state.${planState}`) }}
          </Badge>
          <span v-if="userStore.isLoggedIn" class="text-sm text-muted-foreground">
            {{ userStore.email || userStore.username }}
          </span>
          <span class="text-xs text-muted-foreground">{{ versionStateText }}</span>
          <span v-if="expiryText" class="text-xs text-muted-foreground">{{ expiryText }}</span>
          <span v-if="entitlementStore.cancelScheduled" class="text-xs text-amber-600">
            {{ $t('plan.section.cancelScheduled') }}
          </span>
          <span v-if="entitlementStore.sessionExpired" class="text-xs text-amber-600">
            {{ $t('plan.section.sessionExpired') }}
          </span>
          <span
            v-else-if="
              userStore.isLoggedIn && !userStore.refreshToken && deviceStore.activationError
            "
            class="text-xs text-amber-600"
          >
            {{ $t('plan.section.deviceActivationFailed') }}
          </span>
          <span
            v-else-if="entitlementStore.hasEntitlementError && userStore.isLoggedIn"
            class="text-xs text-destructive"
          >
            {{ $t('plan.section.checkFailed') }}
          </span>
          <span v-if="!userStore.isLoggedIn" class="text-xs text-muted-foreground">
            {{ $t('plan.section.notLoggedIn') }}
            <button class="underline text-primary hover:opacity-80" @click="handleGeekfunLogin">
              {{ $t('plan.section.loginLink') }}
            </button>
          </span>
          <div class="flex items-center gap-2 ml-auto">
            <Button v-if="entitlementStore.sessionExpired" size="sm" @click="handleGeekfunLogin">
              {{ $t('plan.section.loginLink') }}
            </Button>
            <Button
              v-else-if="userStore.isLoggedIn"
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
              <Button variant="outline" size="sm" @click="handleGeekfunLogin">
                {{ $t('plan.section.loginLink') }}
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
        <div class="compare-wrap">
          <div class="compare-grid">
            <div class="compare-head compare-cell">
              {{ $t('plan.gate.additive') }}
            </div>
            <div class="compare-head compare-cell compare-cell--plan">
              {{ $t('plan.state.community') }}
            </div>
            <div
              class="compare-head compare-cell compare-cell--plan compare-cell--ultimate compare-cell--stack"
            >
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
        </div>
      </CardContent>
    </Card>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
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

const planState = computed(() => entitlementStore.planState);

const versionStateText = computed(() => {
  const release = view.value?.appReleaseDate;
  if (entitlementStore.isLocalUltimate) {
    return view.value?.versionLocked
      ? lang.global.t('plan.section.versionPermanent')
      : lang.global.t('plan.section.subscriptionActive');
  }
  // A failed check must not borrow the version-locked-out copy — that text
  // asserts a server-side fact the client could not verify. The same applies
  // when no check has answered yet (view === null): say nothing rather than
  // render a sentence with an empty date placeholder.
  if (entitlementStore.sessionExpired) {
    return lang.global.t('plan.section.sessionExpired');
  }
  if (entitlementStore.hasEntitlementError || view.value === null) {
    return '';
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
// never outlive the account session on this machine. Server-side revocation
// is best-effort — the local session clears even when the network or an
// older backend says no.
const handleLogout = async () => {
  await invoke('revoke_session', { refreshToken: userStore.refreshToken || null }).catch(() => {});
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
.compare-wrap {
  margin: 0 -20px -16px;
  overflow: hidden;
}

.compare-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 84px 108px;
}

.compare-cell--stack {
  flex-direction: column;
  justify-content: center;
  gap: 3px;
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
  padding: 1px 8px;
  border-radius: 999px;
  background-color: hsl(var(--primary) / 0.12);
  color: hsl(var(--primary));
  font-size: 9px;
  font-weight: 700;
  white-space: nowrap;
}

.compare-yes {
  color: hsl(var(--primary));
}

.compare-no {
  color: hsl(var(--muted-foreground) / 0.55);
}
</style>
