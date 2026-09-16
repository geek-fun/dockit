<template>
  <Dialog :open="showModal" @update:open="handleClose">
    <DialogContent class="upgrade-dialog">
      <div class="upgrade-content">
        <div class="upgrade-icon">
          <Lock class="h-8 w-8 text-primary" />
        </div>
        <h2 class="upgrade-title">{{ $t('plan.upgrade.title') }}</h2>
        <p class="upgrade-desc">
          {{ feature ? $t(`plan.features.${feature}`) : $t('plan.upgrade.description') }}
        </p>
        <div class="upgrade-version-state">
          <Badge :variant="versionLockedPermanently ? 'secondary' : 'outline'">
            {{
              versionLockedPermanently
                ? $t('plan.upgrade.versionPermanent')
                : $t('plan.upgrade.versionLockedOut')
            }}
          </Badge>
        </div>
        <div class="upgrade-actions">
          <Button variant="outline" size="sm" :disabled="refreshing" @click="handleRefresh">
            <RefreshCw v-if="refreshing" class="mr-2 h-4 w-4 animate-spin" />
            {{ $t('plan.upgrade.refresh') }}
          </Button>
          <Button size="sm" @click="handleUpgrade">
            {{ $t('plan.upgrade.cta') }}
          </Button>
        </div>
        <p class="upgrade-price">{{ $t('plan.pricing') }}</p>
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
import { Lock, RefreshCw } from 'lucide-vue-next';
import { type PaidFeature, UPGRADE_URL } from '../../common';
import { useEntitlementStore } from '../../store';
import { registerUpgradeDialog } from './upgradeDialogService';

const entitlementStore = useEntitlementStore();
const { view } = storeToRefs(entitlementStore);

const showModal = ref(false);
const refreshing = ref(false);
const feature = ref<PaidFeature | undefined>(undefined);

const versionLockedPermanently = computed(() => view.value?.versionLocked ?? false);

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
.upgrade-dialog {
  width: 400px;
  padding: 24px;
}

.upgrade-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
}

.upgrade-title {
  font-size: 18px;
  font-weight: 600;
}

.upgrade-desc {
  color: var(--muted-foreground);
  font-size: 14px;
}

.upgrade-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.upgrade-price {
  color: var(--muted-foreground);
  font-size: 12px;
}
</style>
