<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <div
        v-if="!userStore.isLoggedIn"
        class="user-nav-item"
        role="button"
        tabindex="0"
        :title="$t('aside.user')"
      >
        <span class="i-carbon-user-avatar nav-icon h-6 w-6" />
      </div>
      <div
        v-else
        class="user-nav-item user-avatar-item"
        role="button"
        tabindex="0"
        :title="userStore.displayName"
      >
        <img v-if="isSafeAvatar" :src="userStore.avatar" class="user-avatar" alt="" />
        <span v-else class="user-avatar user-initials">{{ initials }}</span>
        <span class="plan-dot" :class="planDotClass" />
      </div>
    </PopoverTrigger>
    <PopoverContent side="right" align="end" class="w-72 p-0">
      <div class="user-panel">
        <div class="user-panel-header">
          <img
            v-if="userStore.isLoggedIn && isSafeAvatar"
            :src="userStore.avatar"
            class="user-panel-avatar"
            alt=""
          />
          <span v-else-if="userStore.isLoggedIn" class="user-panel-avatar user-initials">
            {{ initials }}
          </span>
          <div class="user-panel-identity">
            <p class="user-panel-name">
              {{ userStore.isLoggedIn ? userStore.displayName : $t('plan.section.notLoggedIn') }}
            </p>
            <p v-if="userStore.isLoggedIn && userStore.email" class="user-panel-email">
              {{ userStore.email }}
            </p>
          </div>
        </div>

        <template v-if="userStore.isLoggedIn">
          <div class="user-panel-plan">
            <div class="flex items-center justify-between gap-2">
              <Badge :variant="badgeVariant">
                {{ $t(`plan.state.${entitlementStore.planState}`) }}
              </Badge>
              <span v-if="cancelScheduled" class="user-panel-note">
                {{ $t('plan.section.cancelScheduled') }}
              </span>
            </div>
            <p v-if="planLine" class="user-panel-note">{{ planLine }}</p>
          </div>

          <div class="user-panel-actions">
            <Button variant="outline" size="sm" class="w-full" @click="handleManage">
              <span class="i-carbon-launch mr-2 h-3.5 w-3.5" />
              {{ $t('plan.nav.manage') }}
            </Button>
            <Button
              v-if="!entitlementStore.isLocalUltimate"
              size="sm"
              class="w-full user-upgrade-cta"
              @click="handleUpgrade"
            >
              <Sparkles class="mr-1.5 h-3.5 w-3.5" />
              {{ $t('plan.upgrade.cta') }}
            </Button>
            <Button variant="ghost" size="sm" class="w-full" @click="handleLogout">
              <span class="i-carbon-logout mr-2 h-3.5 w-3.5" />
              {{ $t('plan.section.logout') }}
            </Button>
          </div>
        </template>

        <div v-else class="user-panel-actions">
          <Button size="sm" class="w-full" @click="handleStartFree">
            {{ $t('plan.upgrade.startFree') }}
          </Button>
          <Button variant="outline" size="sm" class="w-full" @click="handleLogin">
            {{ $t('plan.section.loginLink') }}
          </Button>
        </div>
      </div>
    </PopoverContent>
  </Popover>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { Sparkles } from 'lucide-vue-next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { openUpgradeDialog } from '@/components/upgrade';
import { authService, isSafeAvatarUrl } from '../../datasources/authService';
import { useDeviceStore, useEntitlementStore, useUserStore } from '../../store';

const { t } = useI18n();
const userStore = useUserStore();
const entitlementStore = useEntitlementStore();
const deviceStore = useDeviceStore();
const { view } = storeToRefs(entitlementStore);

const open = ref(false);

const isSafeAvatar = computed(() => isSafeAvatarUrl(userStore.avatar));

const badgeVariant = computed(() => {
  if (entitlementStore.planState === 'ultimate') return 'default' as const;
  if (entitlementStore.planState === 'unknown') return 'outline' as const;
  return 'secondary' as const;
});

const planDotClass = computed(() =>
  entitlementStore.planState === 'unknown' ? 'unknown' : entitlementStore.planState,
);

const initials = computed(() => {
  const source = (userStore.displayName || 'U').trim();
  return source.slice(0, 2).toUpperCase();
});

const cancelScheduled = computed(() => entitlementStore.cancelScheduled);

const planLine = computed(() => {
  const release = view.value?.appReleaseDate;
  if (entitlementStore.isCloudUltimate && view.value?.ultimateExpiresAt) {
    return t('plan.section.expiresAt', {
      time: new Date(view.value.ultimateExpiresAt).toLocaleDateString(),
    });
  }
  if (entitlementStore.isLocalUltimate) {
    return t('plan.section.versionPermanent');
  }
  if (entitlementStore.hasEntitlementError) {
    return t('plan.section.checkFailed');
  }
  return t('plan.section.versionLockedOut', { date: release ?? '' });
});

const handleManage = async () => {
  open.value = false;
  await authService.openConsoleUrl();
};

const handleUpgrade = () => {
  open.value = false;
  openUpgradeDialog();
};

// Entitlements are account-scoped: the cached view and the device lease must
// never outlive the account session on this machine.
const handleLogout = async () => {
  open.value = false;
  await entitlementStore.clearCachedEntitlement();
  userStore.resetToken();
  deviceStore.$reset();
};

const handleLogin = async () => {
  open.value = false;
  await authService.openLoginUrl();
};

const handleStartFree = async () => {
  open.value = false;
  await authService.openRegisterUrl();
};
</script>

<style scoped>
.user-nav-item {
  height: 40px;
  margin: 10px 0;
  display: flex;
  box-sizing: border-box;
  justify-content: center;
  align-items: center;
  color: hsl(var(--foreground));
  cursor: pointer;
}

.user-nav-item .nav-icon {
  opacity: 0.4;
  transition: 0.3s;
}

.user-nav-item:hover .nav-icon {
  opacity: 0.9;
}

.user-avatar-item {
  position: relative;
}

.user-avatar {
  height: 26px;
  width: 26px;
  border-radius: 50%;
  object-fit: cover;
}

.user-initials {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  color: hsl(var(--foreground));
  background: hsl(var(--accent));
  letter-spacing: 0.02em;
}

.plan-dot {
  position: absolute;
  right: 4px;
  bottom: 4px;
  height: 9px;
  width: 9px;
  border-radius: 50%;
  border: 2px solid hsl(var(--background));
  box-sizing: content-box;
}

.plan-dot.ultimate {
  background: hsl(var(--primary));
}

.plan-dot.community {
  background: hsl(var(--muted-foreground));
}

.plan-dot.unknown {
  background: rgb(245 158 11);
}

.user-panel {
  display: flex;
  flex-direction: column;
}

.user-panel-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid hsl(var(--border));
}

.user-panel-avatar {
  height: 38px;
  width: 38px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid hsl(var(--border));
  flex-shrink: 0;
}

.user-panel-identity {
  min-width: 0;
}

.user-panel-name {
  font-size: 13px;
  font-weight: 600;
  color: hsl(var(--foreground));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-panel-email {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-panel-plan {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 14px;
  border-bottom: 1px solid hsl(var(--border));
}

.user-panel-note {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.user-panel-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
}

.user-upgrade-cta {
  border: 1px solid hsl(var(--primary) / 0.55);
  background-color: hsl(var(--primary) / 0.08);
  color: hsl(var(--primary));
  font-weight: 600;
}

.user-upgrade-cta:hover {
  background-color: hsl(var(--primary) / 0.15);
  color: hsl(var(--primary));
}
</style>
