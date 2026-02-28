<template>
  <Tabs default-value="indices" class="tabs-container" @update:model-value="refresh">
    <div class="tabs-header">
      <TabsList>
        <TabsTrigger value="indices">INDICES</TabsTrigger>
        <TabsTrigger value="templates">TEMPLATES</TabsTrigger>
      </TabsList>
      <div class="tab-action-group">
        <Button variant="ghost" @click="handleRefresh">
          <Icon class="mr-2">
            <Renew />
          </Icon>
          Refresh
        </Button>
        <Button variant="secondary" @click="toggleModal('index')">
          <Icon class="mr-2">
            <Add />
          </Icon>
          New Index
        </Button>
        <Button variant="secondary" @click="toggleModal('alias')">
          <Icon class="mr-2">
            <Add />
          </Icon>
          New Alias
        </Button>
        <Button variant="secondary" @click="toggleModal('template')">
          <Icon class="mr-2">
            <Add />
          </Icon>
          New Template
        </Button>
      </div>
    </div>
    <TabsContent value="indices" class="tabs-tab-pane-container">
      <div class="table-container">
        <div class="table-scroll-container">
          <ScrollArea class="h-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead
                    v-for="col in indexTableColumns"
                    :key="col.key"
                    class="whitespace-nowrap"
                  >
                    <div class="flex items-center gap-1">
                      {{ col.title }}
                      <Popover v-if="col.filterable">
                        <PopoverTrigger as-child>
                          <Button variant="ghost" size="icon" class="h-6 w-6">
                            <span
                              class="i-carbon-search h-3.5 w-3.5"
                              :style="{
                                color: filterState[col.key] ? 'hsl(var(--primary))' : undefined,
                              }"
                            />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent class="w-48 p-2">
                          <Input
                            :model-value="filterState[col.key]"
                            :placeholder="`type to filter ${col.key}`"
                            class="h-8"
                            @update:model-value="val => (filterState[col.key] = String(val))"
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="(row, rowIndex) in indexTable.data" :key="rowIndex">
                  <TableCell>{{ row.index }}</TableCell>
                  <TableCell>{{ row.uuid }}</TableCell>
                  <TableCell>
                    {{
                      (row.health === 'green' ? '🟢' : row.health === 'yellow' ? '🟡' : '🔴') +
                      ` ${row.health}`
                    }}
                  </TableCell>
                  <TableCell>{{ row.status }}</TableCell>
                  <TableCell>{{ row.docs?.count }}</TableCell>
                  <TableCell>{{ row.storage }}</TableCell>
                  <TableCell>
                    {{
                      row.shards && Array.isArray(row.shards)
                        ? `${row.shards.filter((s: any) => s.prirep === 'p').length}p/${row.shards.filter((s: any) => s.prirep === 'r').length}r`
                        : '0p/0r'
                    }}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu v-for="alias in row.aliases" :key="alias.alias">
                      <DropdownMenuTrigger as-child>
                        <Button variant="ghost" size="sm" class="m-0.5">
                          <span class="i-carbon-settings-adjust h-3.5 w-3.5 mr-1" />
                          {{ alias.alias }}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem
                          class="text-destructive"
                          @click="handleAction('removeAlias', alias.index, alias.alias)"
                        >
                          <span class="i-carbon-unlink h-4 w-4 mr-2" style="color: red" />
                          {{ lang.t('manage.index.actions.removeAlias') }}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          @click="handleAction('switchAlias', alias.index, alias.alias)"
                        >
                          <span class="i-carbon-arrows-horizontal h-4 w-4 mr-2" />
                          {{ lang.t('manage.index.actions.switchAlias') }}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger as-child>
                        <Button variant="ghost" size="icon">
                          <span class="i-carbon-overflow-menu-horizontal h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem
                          class="text-destructive"
                          @click="handleAction('deleteIndex', row.index)"
                        >
                          <span class="i-carbon-delete h-4 w-4 mr-2" style="color: red" />
                          {{ lang.t('manage.index.actions.deleteIndex') }}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          v-if="row.status === 'open'"
                          @click="handleAction('closIndex', row.index)"
                        >
                          <span class="i-carbon-locked h-4 w-4 mr-2" style="color: yellow" />
                          {{ lang.t('manage.index.actions.closeIndex') }}
                        </DropdownMenuItem>
                        <DropdownMenuItem v-else @click="handleAction('openIndex', row.index)">
                          <span class="i-carbon-unlocked h-4 w-4 mr-2" style="color: green" />
                          {{ lang.t('manage.index.actions.openIndex') }}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </ScrollArea>
        </div>
      </div>
    </TabsContent>
    <TabsContent value="templates" class="tabs-tab-pane-container">
      <div class="table-container">
        <div class="table-scroll-container">
          <ScrollArea class="h-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead
                    v-for="col in templateTableColumns"
                    :key="col.key"
                    class="whitespace-nowrap"
                  >
                    <div class="flex items-center gap-1">
                      {{ col.title }}
                      <Popover v-if="col.filterable">
                        <PopoverTrigger as-child>
                          <Button variant="ghost" size="icon" class="h-6 w-6">
                            <span
                              class="i-carbon-search h-3.5 w-3.5"
                              :style="{
                                color: filterState[col.key] ? 'hsl(var(--primary))' : undefined,
                              }"
                            />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent class="w-48 p-2">
                          <Input
                            :model-value="filterState[col.key]"
                            :placeholder="`type to filter ${col.key}`"
                            class="h-8"
                            @update:model-value="val => (filterState[col.key] = String(val))"
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="(row, rowIndex) in templateTable.data" :key="rowIndex">
                  <TableCell>{{ (row as any).name }}</TableCell>
                  <TableCell>{{ (row as any).type }}</TableCell>
                  <TableCell>{{ (row as any).order }}</TableCell>
                  <TableCell>{{ (row as any).version }}</TableCell>
                  <TableCell>{{ (row as any).mapping_count }}</TableCell>
                  <TableCell>{{ (row as any).settings_count }}</TableCell>
                  <TableCell>{{ (row as any).alias_count }}</TableCell>
                  <TableCell>{{ (row as any).metadata }}</TableCell>
                  <TableCell>
                    <Badge
                      v-for="included in (row as any).included_in || []"
                      :key="included"
                      class="m-0.5"
                    >
                      {{ included }}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      v-for="pattern in (row as any).index_patterns || []"
                      :key="pattern"
                      class="m-0.5"
                    >
                      {{ pattern }}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      v-for="composed in (row as any).composed_of || []"
                      :key="composed"
                      class="m-0.5"
                    >
                      {{ composed }}
                    </Badge>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </ScrollArea>
        </div>
      </div>
    </TabsContent>
  </Tabs>
  <index-dialog ref="indexDialogRef" />
  <alias-dialog ref="aliasDialogRef" />
  <template-dialog ref="templateDialogRef" />
  <switch-alias-dialog ref="switchAliasDialogRef" />
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { get } from 'lodash';
import { useClusterManageStore } from '../../../store';
import { useMessageService, useDialogService } from '@/composables';
import IndexDialog from './index-dialog.vue';
import AliasDialog from './alias-dialog.vue';
import TemplateDialog from './template-dialog.vue';
import { useLang } from '../../../lang';
import { CustomError } from '../../../common';
import SwitchAliasDialog from './switch-alias-dialog.vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const message = useMessageService();
const dialog = useDialogService();
const lang = useLang();

const clusterManageStore = useClusterManageStore();
const { refreshStates, deleteIndex, closeIndex, openIndex, removeAlias } = clusterManageStore;
const { indexWithAliases, templates } = storeToRefs(clusterManageStore);

const indexDialogRef = ref();
const aliasDialogRef = ref();
const templateDialogRef = ref();
const switchAliasDialogRef = ref();

const filterState = ref<{ [key: string]: string }>({
  index: '',
  uuid: '',
  health: '',
  status: '',
  name: '',
  type: '',
});

const indexTableColumns = [
  { title: 'Index', key: 'index', filterable: true },
  { title: 'UUID', key: 'uuid', filterable: true },
  { title: 'Health', key: 'health', filterable: true },
  { title: 'Status', key: 'status', filterable: true },
  { title: 'Docs', key: 'docs', filterable: false },
  { title: 'Storage', key: 'storage', filterable: false },
  { title: 'Shards', key: 'shards', filterable: false },
  { title: 'Aliases', key: 'aliases', filterable: false },
  { title: 'Actions', key: 'actions', filterable: false },
];

const templateTableColumns = [
  { title: 'Name', key: 'name', filterable: true },
  { title: 'Type', key: 'type', filterable: true },
  { title: 'Order', key: 'order', filterable: false },
  { title: 'Version', key: 'version', filterable: false },
  { title: 'Mappings', key: 'mapping_count', filterable: false },
  { title: 'Settings', key: 'settings_count', filterable: false },
  { title: 'Aliases', key: 'alias_count', filterable: false },
  { title: 'Metadata', key: 'metadata', filterable: false },
  { title: 'Included In', key: 'included_in', filterable: false },
  { title: 'Index Patterns', key: 'index_patterns', filterable: false },
  { title: 'Composed Of', key: 'composed_of', filterable: false },
];

const indexTable = computed(() => {
  const data = indexWithAliases.value
    .filter(item =>
      filterState.value.uuid
        ? get(item, 'uuid', '').toLowerCase().includes(filterState.value.uuid.toLowerCase())
        : true,
    )
    .filter(item =>
      filterState.value.index
        ? get(item, 'index', '').toLowerCase().includes(filterState.value.index.toLowerCase())
        : true,
    )
    .filter(item =>
      filterState.value.health
        ? get(item, 'health', '').toLowerCase().includes(filterState.value.health.toLowerCase())
        : true,
    )
    .filter(item =>
      filterState.value.status
        ? get(item, 'status', '').toLowerCase().includes(filterState.value.status.toLowerCase())
        : true,
    );

  return { data };
});

const templateTable = computed(() => {
  const data = templates.value
    .filter(item =>
      filterState.value.name
        ? get(item, 'name', '').toLowerCase().includes(filterState.value.name.toLowerCase())
        : true,
    )
    .filter(item =>
      filterState.value.type
        ? get(item, 'type', '').toLowerCase().includes(filterState.value.type.toLowerCase())
        : true,
    );

  return { data };
});

const refresh = async () => {
  await refreshStates();
};

const handleRefresh = async () => {
  try {
    await refresh();
  } catch (err) {
    message.error(
      `status: ${(err as CustomError).status}, details: ${(err as CustomError).details}`,
      {
        closable: true,
        keepAliveOnHover: true,
        duration: 3000,
      },
    );
  }
};

const toggleModal = (target: string) => {
  if (target === 'index') indexDialogRef.value.toggleModal();
  if (target === 'alias') aliasDialogRef.value.toggleModal();
  if (target === 'template') templateDialogRef.value.toggleModal();
};

const handleAction = async (action: string, indexName: string, aliasName?: string) => {
  if (action === 'deleteIndex') {
    dialog.warning({
      title: lang.t('dialogOps.warning'),
      content: lang.t('manage.index.actions.deleteIndexWarning') + `:${indexName} ?`,
      positiveText: lang.t('dialogOps.confirm'),
      negativeText: lang.t('dialogOps.cancel'),
      onPositiveClick: async () => {
        try {
          await deleteIndex(indexName);
          await refresh();
          message.success(lang.t('dialogOps.deleteSuccess'));
        } catch (err) {
          message.error((err as CustomError).details, {
            closable: true,
            keepAliveOnHover: true,
          });
        }
      },
    });
  } else if (action === 'closIndex') {
    dialog.warning({
      title: lang.t('dialogOps.warning'),
      content: lang.t('manage.index.actions.closeIndexWarning') + `:${indexName} ?`,
      positiveText: lang.t('dialogOps.confirm'),
      negativeText: lang.t('dialogOps.cancel'),
      onPositiveClick: async () => {
        try {
          await closeIndex(indexName);
          await refresh();
          message.success(lang.t('dialogOps.closeSuccess'));
        } catch (err) {
          message.error((err as CustomError).details, {
            closable: true,
            keepAliveOnHover: true,
          });
        }
      },
    });
  } else if (action === 'openIndex') {
    try {
      await openIndex(indexName);
      await refresh();
      message.success(lang.t('dialogOps.openSuccess'));
    } catch (err) {
      message.error((err as CustomError).details, {
        closable: true,
        keepAliveOnHover: true,
      });
    }
  } else if (action === 'removeAlias') {
    dialog.warning({
      title: lang.t('dialogOps.warning'),
      content: lang.t('manage.index.actions.removeAliasWarning') + ` ${indexName}@${aliasName} ?`,
      positiveText: lang.t('dialogOps.confirm'),
      negativeText: lang.t('dialogOps.cancel'),
      onPositiveClick: async () => {
        try {
          await removeAlias(indexName, aliasName as string);
          await refresh();
          message.success(lang.t('dialogOps.removeSuccess'));
        } catch (err) {
          message.error((err as CustomError).details, {
            closable: true,
            keepAliveOnHover: true,
            duration: 7200,
          });
        }
      },
    });
  } else if (action === 'switchAlias') {
    switchAliasDialogRef.value.toggleModal(aliasName, indexName);
  }
};

onMounted(async () => {
  await handleRefresh();
});
</script>

<style scoped>
.tabs-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.tabs-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.tabs-tab-pane-container {
  width: 100%;
  flex: 1;
  height: 0;
}

.table-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.table-scroll-container {
  flex: 1;
  height: 0;
}

.tab-action-group {
  display: flex;
  gap: 8px;
}
</style>
