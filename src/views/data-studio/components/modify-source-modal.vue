<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="sm:max-w-[500px]">
      <DialogHeader>
        <div class="flex items-center gap-3">
          <div
            class="w-10 h-10 bg-muted rounded-xl border border-border flex items-center justify-center shrink-0"
          >
            <span class="i-carbon-data-base h-5 w-5" />
          </div>
          <div>
            <DialogTitle>{{ $t('dataStudio.modifySource.title') }}</DialogTitle>
            <p class="text-sm text-muted-foreground mt-0.5">{{ source?.name }}</p>
          </div>
        </div>
      </DialogHeader>
      <div class="py-4">
        <div class="bg-muted/30 border border-border rounded-xl overflow-hidden">
          <div
            class="px-4 py-3 flex items-center justify-between border-b border-border bg-muted/50"
          >
            <div class="flex items-center gap-2">
              <span class="i-carbon-security h-4 w-4" />
              <span class="font-semibold text-sm">
                {{ $t('dataStudio.modifySource.accessPermissions') }}
              </span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs font-medium text-muted-foreground">
                {{ $t('dataStudio.modifySource.unifiedAccessConfig') }}
              </span>
              <Switch v-model:checked="localUnifiedAccess" />
            </div>
          </div>
          <div class="p-4">
            <div class="grid grid-cols-2 gap-3">
              <label
                v-for="perm in permissionList"
                :key="perm.key"
                class="flex items-center space-x-3 cursor-pointer select-none p-2 rounded-lg hover:bg-background transition-colors"
              >
                <Checkbox
                  :checked="localPermissions[perm.key as keyof typeof localPermissions]"
                  @update:checked="
                    (val: boolean) =>
                      (localPermissions[perm.key as keyof typeof localPermissions] = val)
                  "
                />
                <span class="text-sm font-medium">{{ perm.label }}</span>
              </label>
            </div>
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" @click="$emit('update:open', false)">
          {{ $t('dialogOps.cancel') }}
        </Button>
        <Button @click="handleSave">
          {{ $t('dataStudio.modifySource.saveChanges') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  useDataStudioStore,
  type ConnectedSource,
  type DataSourcePermissions,
} from '@/store/dataStudioStore';

const props = defineProps<{
  open: boolean;
  source: ConnectedSource | null;
  sourceIndex: number;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
}>();

const { t } = useI18n();
const dataStudioStore = useDataStudioStore();

const localPermissions = ref<DataSourcePermissions>({
  read: true,
  create: false,
  update: false,
  delete: false,
});

const localUnifiedAccess = ref(true);

const permissionList = [
  { key: 'read', label: t('dataStudio.modifySource.read') },
  { key: 'create', label: t('dataStudio.modifySource.create') },
  { key: 'update', label: t('dataStudio.modifySource.update') },
  { key: 'delete', label: t('dataStudio.modifySource.delete') },
];

watch(
  () => props.open,
  newVal => {
    if (newVal && props.source) {
      localPermissions.value = { ...props.source.permissions };
      localUnifiedAccess.value = props.source.unifiedAccess;
    }
  },
);

const handleSave = () => {
  dataStudioStore.updateSource(props.sourceIndex, {
    permissions: { ...localPermissions.value },
    unifiedAccess: localUnifiedAccess.value,
  });
  emit('update:open', false);
};
</script>
