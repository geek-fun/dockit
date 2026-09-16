<template>
  <slot v-if="entitlementStore.isLocalUltimate"></slot>
  <div v-else class="paid-gate flex flex-col items-center justify-center gap-4 py-16">
    <div class="flex h-14 w-14 items-center justify-center rounded-full bg-accent">
      <Lock class="h-6 w-6 text-primary" />
    </div>
    <div class="space-y-1 text-center">
      <h3 class="text-base font-semibold">{{ $t('plan.upgrade.title') }}</h3>
      <p class="max-w-md text-sm text-muted-foreground">
        {{ $t(`plan.features.${feature}`) }}
      </p>
      <p class="text-xs text-muted-foreground">{{ $t('plan.pricing') }}</p>
    </div>
    <div class="flex items-center gap-2">
      <Button variant="outline" size="sm" :disabled="refreshing" @click="handleRefresh">
        <RefreshCw v-if="refreshing" class="mr-2 h-4 w-4 animate-spin" />
        {{ $t('plan.upgrade.refresh') }}
      </Button>
      <Button size="sm" @click="openUpgradeDialog(feature)">
        {{ $t('plan.upgrade.cta') }}
      </Button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import { Lock, RefreshCw } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { type PaidFeature } from '../../common';
import { useEntitlementStore } from '../../store';
import { openUpgradeDialog } from './upgradeDialogService';

defineProps<{ feature: PaidFeature }>();

const entitlementStore = useEntitlementStore();
const refreshing = ref(false);

onMounted(() => {
  entitlementStore.refreshEntitlement(false);
});

const handleRefresh = async () => {
  refreshing.value = true;
  try {
    await entitlementStore.refreshEntitlement(true);
  } finally {
    refreshing.value = false;
  }
};
</script>
