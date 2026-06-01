<template>
  <div class="result-panel">
    <!-- Error state -->
    <Card v-if="errorMessage" class="error-card">
      <CardHeader class="p-3 flex flex-row items-center justify-between">
        <CardTitle class="text-base">{{ $t('editor.mongo.resultTitle') }}</CardTitle>
        <Button
          variant="ghost"
          size="icon"
          class="close-btn"
          :aria-label="$t('editor.mongo.closePanel')"
          @click="$emit('close')"
        >
          <span class="i-carbon-close h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent class="p-3">
        <p class="text-destructive">{{ errorMessage }}</p>
      </CardContent>
    </Card>

    <!-- Data state -->
    <template v-else-if="hasData">
      <!-- Single toolbar row: tabs left, status + actions right -->
      <div class="result-toolbar">
        <Tabs v-model="activeView" class="shrink-0">
          <TabsList class="h-7">
            <TabsTrigger value="table" class="text-xs h-6 px-2">
              {{ $t('editor.mongo.viewTable') }}
            </TabsTrigger>
            <TabsTrigger value="tree" class="text-xs h-6 px-2">
              {{ $t('editor.mongo.viewTree') }}
            </TabsTrigger>
            <TabsTrigger value="json" class="text-xs h-6 px-2">
              {{ $t('editor.mongo.viewJson') }}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div class="toolbar-right">
          <span v-if="total !== undefined && total >= 0" class="status-text">
            {{ $t('editor.mongo.totalDocuments', { count: total }) }}
          </span>
          <span v-if="queryTime !== undefined" class="status-text dimmed">({{ queryTime }}ms)</span>
          <div class="toolbar-divider" />
          <Button
            v-if="collection"
            size="sm"
            variant="ghost"
            class="h-6 px-2 text-xs"
            @click="handleInsertClick"
          >
            <span class="i-carbon-add h-3.5 w-3.5 mr-1" />
            {{ $t('editor.mongo.insertDocument') }}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="h-6 w-6"
            :aria-label="$t('editor.mongo.closePanel')"
            @click="$emit('close')"
          >
            <span class="i-carbon-close h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <!-- TABLE VIEW -->
      <template v-if="activeView === 'table'">
        <div class="table-scroll-area">
          <table class="data-table">
            <thead class="sticky-header">
              <tr>
                <th
                  v-for="col in tableColumnsWithActions"
                  :key="col.key"
                  :class="{ 'sticky-action-header': col.key === 'actions' }"
                  :style="{
                    minWidth: col.key === 'actions' ? '44px' : '140px',
                    width: col.key === 'actions' ? '44px' : undefined,
                  }"
                >
                  {{ col.title }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td :colspan="tableColumnsWithActions.length" class="text-center py-8">
                  <Spinner class="mx-auto" />
                </td>
              </tr>
              <tr v-else-if="documents.length === 0">
                <td :colspan="tableColumnsWithActions.length" class="text-center py-8">
                  <Empty :description="$t('editor.mongo.noDocuments')" />
                </td>
              </tr>
              <tr
                v-for="(row, rowIndex) in paginatedDocuments"
                v-else
                :key="rowIndex"
                :class="['data-row', { 'data-row--selected': selectedRowIndex === rowIndex }]"
                @click="selectedRowIndex = rowIndex"
              >
                <td
                  v-for="col in tableColumnsWithActions"
                  :key="col.key"
                  :class="{ 'sticky-action-cell': col.key === 'actions' }"
                >
                  <template v-if="col.key === 'actions'">
                    <DropdownMenu>
                      <DropdownMenuTrigger as-child>
                        <Button variant="ghost" size="icon" class="h-7 w-7">
                          <span class="i-carbon-overflow-menu-horizontal h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" class="w-36">
                        <DropdownMenuItem
                          :disabled="!getDocumentId(row)"
                          @click="handleEditClick(row)"
                        >
                          <span class="i-carbon-edit h-3.5 w-3.5 mr-2" />
                          {{ $t('editor.mongo.editDocument') }}
                        </DropdownMenuItem>
                        <DropdownMenuItem @click="handleCloneClick(row)">
                          <span class="i-carbon-copy h-3.5 w-3.5 mr-2" />
                          {{ $t('editor.mongo.cloneDocument') }}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          :disabled="!getDocumentId(row)"
                          class="text-destructive focus:text-destructive"
                          @click="handleDeleteClick(row)"
                        >
                          <span class="i-carbon-trash-can h-3.5 w-3.5 mr-2" />
                          {{ $t('editor.mongo.deleteDocument') }}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </template>
                  <template v-else>
                    <span class="cell-value">{{ formatCellValue(row[col.key]) }}</span>
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div v-if="totalPages > 1 || documents.length > 0" class="result-pagination">
          <span class="text-xs text-muted-foreground">
            {{ $t('editor.mongo.pageInfo', { page: currentPage, total: totalPages }) }}
          </span>
          <div class="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              class="h-6 w-6"
              :disabled="currentPage <= 1"
              @click="handlePageChange(1)"
            >
              <span class="i-carbon-skip-back h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              class="h-6 w-6"
              :disabled="currentPage <= 1"
              @click="handlePageChange(currentPage - 1)"
            >
              <span class="i-carbon-chevron-left h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              class="h-6 w-6"
              :disabled="currentPage >= totalPages"
              @click="handlePageChange(currentPage + 1)"
            >
              <span class="i-carbon-chevron-right h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              class="h-6 w-6"
              :disabled="currentPage >= totalPages"
              @click="handlePageChange(totalPages)"
            >
              <span class="i-carbon-skip-forward h-3 w-3" />
            </Button>
          </div>
          <Select :model-value="String(pageSize)" @update:model-value="handlePageSizeChange">
            <SelectTrigger class="h-6 w-auto min-w-[80px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="size in pageSizeOptions" :key="size" :value="String(size)">
                {{ size }} / page
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </template>

      <!-- TREE VIEW -->
      <template v-else-if="activeView === 'tree'">
        <ScrollArea class="tree-scroll-area">
          <div class="tree-container">
            <div v-if="loading" class="flex justify-center py-8">
              <Spinner />
            </div>
            <Empty
              v-else-if="documents.length === 0"
              :description="$t('editor.mongo.noDocuments')"
              class="py-8"
            />
            <template v-else>
              <div
                v-for="(doc, docIndex) in paginatedDocuments"
                :key="docIndex"
                class="tree-document"
              >
                <button class="tree-doc-header" @click="toggleDocExpand(docIndex)">
                  <span
                    :class="
                      expandedDocs.has(docIndex)
                        ? 'i-carbon-chevron-down'
                        : 'i-carbon-chevron-right'
                    "
                    class="h-3.5 w-3.5 shrink-0"
                  />
                  <span class="tree-doc-label">
                    Document {{ (currentPage - 1) * pageSize + docIndex + 1 }}
                  </span>
                  <span class="text-muted-foreground text-xs ml-2">{{ getDocumentId(doc) }}</span>
                </button>
                <div v-if="expandedDocs.has(docIndex)" class="tree-doc-body">
                  <tree-node
                    v-for="(fieldValue, key) in doc"
                    :key="String(key)"
                    :field-key="String(key)"
                    :value="fieldValue"
                    :depth="0"
                  />
                </div>
              </div>
            </template>
          </div>
        </ScrollArea>

        <!-- Pagination (tree) -->
        <div v-if="totalPages > 1" class="result-pagination">
          <span class="text-xs text-muted-foreground">
            {{ $t('editor.mongo.pageInfo', { page: currentPage, total: totalPages }) }}
          </span>
          <div class="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              class="h-6 w-6"
              :disabled="currentPage <= 1"
              @click="handlePageChange(1)"
            >
              <span class="i-carbon-skip-back h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              class="h-6 w-6"
              :disabled="currentPage <= 1"
              @click="handlePageChange(currentPage - 1)"
            >
              <span class="i-carbon-chevron-left h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              class="h-6 w-6"
              :disabled="currentPage >= totalPages"
              @click="handlePageChange(currentPage + 1)"
            >
              <span class="i-carbon-chevron-right h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              class="h-6 w-6"
              :disabled="currentPage >= totalPages"
              @click="handlePageChange(totalPages)"
            >
              <span class="i-carbon-skip-forward h-3 w-3" />
            </Button>
          </div>
        </div>
      </template>

      <!-- JSON VIEW -->
      <template v-else-if="activeView === 'json'">
        <div ref="jsonEditorRef" class="json-editor-area" />
      </template>
    </template>

    <!-- Empty success state (query ran, 0 results) -->
    <Card v-else-if="hasData === false && executed" class="success-card">
      <CardHeader class="p-3 flex flex-row items-center justify-between">
        <CardTitle class="text-base">{{ $t('editor.mongo.resultTitle') }}</CardTitle>
        <Button
          variant="ghost"
          size="icon"
          class="close-btn"
          :aria-label="$t('editor.mongo.closePanel')"
          @click="$emit('close')"
        >
          <span class="i-carbon-close h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent class="p-3">
        <Empty>
          <template #icon>
            <div class="text-green-500 mb-4">✓</div>
          </template>
          <p class="font-medium">{{ $t('editor.mongo.executionSuccess') }}</p>
        </Empty>
      </CardContent>
    </Card>
  </div>

  <!-- Modals -->
  <InsertDocument
    ref="insertDocumentRef"
    v-model:show="showInsertModal"
    :initial-value="cloneDocumentValue"
    :mode="insertMode"
    @insert="handleInsertSubmit"
  />
  <EditDocument
    ref="editDocumentRef"
    v-model:show="showEditModal"
    :initial-value="editDocumentValue"
    :document-id="editDocumentId"
    @save="handleEditSubmit"
  />
  <DeleteConfirmModal
    ref="deleteConfirmRef"
    v-model:show="showDeleteModal"
    :document-id="deletingId"
    @confirm="handleDeleteConfirm"
  />
</template>

<script setup lang="ts">
import {
  computed,
  ref,
  watch,
  onUnmounted,
  nextTick,
  defineComponent,
  h,
  markRaw,
  type Component,
} from 'vue';
import { storeToRefs } from 'pinia';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Empty } from '@/components/ui/empty';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Editor, monaco } from '../../../../common/monaco';
import { useAppStore, useTabStore, MongoDBConnection } from '../../../../store';
import { mongoApi } from '../../../../datasources';
import { useMessageService } from '../../../../composables';
import { useLang } from '../../../../lang';
import InsertDocument from './insert-document.vue';
import EditDocument from './edit-document.vue';
import DeleteConfirmModal from './delete-confirm-modal.vue';

type DataColumn = { key: string; title: string };

const props = withDefaults(
  defineProps<{
    documents?: Record<string, unknown>[];
    total?: number;
    queryTime?: number;
    collection?: string;
    errorMessage?: string | null;
    hasData?: boolean;
    executed?: boolean;
    loading?: boolean;
  }>(),
  {
    documents: () => [],
    total: undefined,
    queryTime: undefined,
    collection: undefined,
    errorMessage: null,
    hasData: false,
    executed: false,
    loading: false,
  },
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'refresh'): void;
}>();

const appStore = useAppStore();
const tabStore = useTabStore();
const { getEditorTheme, getEditorOptions } = appStore;
const { themeType } = storeToRefs(appStore);
const message = useMessageService();
const lang = useLang();

const activeView = ref<'table' | 'tree' | 'json'>('table');
const currentPage = ref(1);
const pageSize = ref(25);
const pageSizeOptions = [25, 50, 100, 200];

const expandedDocs = ref(new Set<number>());

const showInsertModal = ref(false);
const showEditModal = ref(false);
const showDeleteModal = ref(false);
const editDocumentValue = ref('');
const editDocumentId = ref('');

type InsertDocumentExposed = { setLoading: (v: boolean) => void; setError: (msg: string) => void };
type EditDocumentExposed = { setLoading: (v: boolean) => void; setError: (msg: string) => void };
type DeleteConfirmExposed = {
  setLoading: (v: boolean) => void;
  setResult: (type: 'success' | 'error', message: string) => void;
};
const insertDocumentRef = ref<InsertDocumentExposed>();
const editDocumentRef = ref<EditDocumentExposed>();
const deleteConfirmRef = ref<DeleteConfirmExposed>();
const deletingId = ref('');
const selectedRowIndex = ref<number | null>(null);
const cloneDocumentValue = ref<string | undefined>(undefined);
const insertMode = ref<'insert' | 'clone'>('insert');

// Monaco JSON editor
const jsonEditorRef = ref<HTMLElement>();
let jsonEditor: Editor | null = null;

const activeConnection = computed(
  () => tabStore.activePanel.connection as MongoDBConnection | undefined,
);

const tableColumns = computed<DataColumn[]>(() => {
  const keys = new Set<string>();
  const sample = props.documents.slice(0, 20);
  for (const doc of sample) {
    for (const key of Object.keys(doc)) {
      keys.add(key);
    }
  }
  return Array.from(keys).map(k => ({ key: k, title: k }));
});

const actionColumn = computed<DataColumn>(() => ({
  key: 'actions',
  title: lang.t('editor.mongo.actions'),
}));

const tableColumnsWithActions = computed(() =>
  props.collection ? [...tableColumns.value, actionColumn.value] : tableColumns.value,
);

const totalPages = computed(() =>
  Math.max(1, Math.ceil((props.total ?? props.documents.length) / pageSize.value)),
);

const paginatedDocuments = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return props.documents.slice(start, start + pageSize.value);
});

const formatCellValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const handlePageChange = (page: number) => {
  currentPage.value = page;
  expandedDocs.value = new Set();
  selectedRowIndex.value = null;
};

const handlePageSizeChange = (value: string) => {
  pageSize.value = Number(value);
  currentPage.value = 1;
  expandedDocs.value = new Set();
};

const toggleDocExpand = (index: number) => {
  if (expandedDocs.value.has(index)) {
    expandedDocs.value.delete(index);
  } else {
    expandedDocs.value.add(index);
  }
  expandedDocs.value = new Set(expandedDocs.value);
};

watch(
  () => props.documents,
  () => {
    currentPage.value = 1;
    expandedDocs.value = new Set();
    selectedRowIndex.value = null;
    if (activeView.value === 'json') {
      updateJsonEditor();
    }
  },
);

watch(currentPage, () => {
  selectedRowIndex.value = null;
});

watch(activeView, newView => {
  if (newView === 'json') {
    nextTick(() => initJsonEditor());
  }
});

watch(themeType, () => jsonEditor?.updateOptions({ theme: getEditorTheme() }));

const initJsonEditor = () => {
  if (!jsonEditorRef.value) return;
  if (jsonEditor) {
    updateJsonEditor();
    return;
  }
  const options = getEditorOptions();
  jsonEditor = monaco.editor.create(jsonEditorRef.value, {
    theme: getEditorTheme(),
    value: JSON.stringify(props.documents, null, 2),
    language: 'json',
    automaticLayout: true,
    readOnly: true,
    scrollBeyondLastLine: false,
    ...options,
    minimap: { enabled: false },
  });
};

const updateJsonEditor = () => {
  jsonEditor?.setValue(JSON.stringify(props.documents, null, 2));
};

onUnmounted(() => jsonEditor?.dispose());

const handleInsertClick = () => {
  cloneDocumentValue.value = undefined;
  insertMode.value = 'insert';
  showInsertModal.value = true;
};

const handleCloneClick = (row: Record<string, unknown>) => {
  const clone = { ...row };
  delete clone._id;
  cloneDocumentValue.value = JSON.stringify(clone, null, 2);
  insertMode.value = 'clone';
  showInsertModal.value = true;
};

const getDocumentId = (doc: Record<string, unknown>): string => {
  const id = doc._id;
  if (!id) return '';
  if (typeof id === 'object') {
    // Extended JSON: {$oid: "66e5..."} — extract the hex string
    const oid = (id as Record<string, unknown>).$oid;
    if (typeof oid === 'string') return oid;
    return JSON.stringify(id);
  }
  return String(id);
};

const handleEditClick = (row: Record<string, unknown>) => {
  // Pre-stringify to avoid Vue reactive proxy issues with Monaco init
  editDocumentValue.value = JSON.stringify(row, null, 2);
  editDocumentId.value = getDocumentId(row);
  showEditModal.value = true;
};

const handleDeleteClick = (row: Record<string, unknown>) => {
  deletingId.value = getDocumentId(row);
  showDeleteModal.value = true;
};

const handleInsertSubmit = async (document: string) => {
  if (!activeConnection.value || !props.collection) return;
  insertDocumentRef.value?.setLoading(true);
  const result = await mongoApi.insertDocument(activeConnection.value, props.collection, document);
  insertDocumentRef.value?.setLoading(false);
  if (!result.error) {
    showInsertModal.value = false;
    message.success(lang.t('editor.mongo.insertSuccess'));
    emit('refresh');
  } else {
    insertDocumentRef.value?.setError(result.error ?? lang.t('editor.mongo.insertError'));
  }
};

const handleEditSubmit = async (id: string, document: string) => {
  if (!activeConnection.value || !props.collection) return;
  editDocumentRef.value?.setLoading(true);
  const result = await mongoApi.updateDocument(
    activeConnection.value,
    props.collection,
    id,
    document,
  );
  editDocumentRef.value?.setLoading(false);
  if (!result.error) {
    showEditModal.value = false;
    if (result.modified_count != null && result.modified_count === 0) {
      message.info(lang.t('editor.mongo.updateNoChanges'));
    } else {
      message.success(lang.t('editor.mongo.updateSuccess'));
    }
    emit('refresh');
  } else {
    editDocumentRef.value?.setError(result.error ?? lang.t('editor.mongo.updateError'));
  }
};

const handleDeleteConfirm = async () => {
  if (!activeConnection.value || !props.collection || !deletingId.value) return;
  deleteConfirmRef.value?.setLoading(true);
  const result = await mongoApi.deleteDocument(
    activeConnection.value,
    props.collection,
    deletingId.value,
  );
  if (!result.error) {
    showDeleteModal.value = false;
    message.success(lang.t('editor.mongo.deleteDocumentSuccess'));
    emit('refresh');
  } else {
    deleteConfirmRef.value?.setResult('error', result.error ?? lang.t('editor.mongo.deleteError'));
  }
};

// TreeNode inline component
const TreeNode: Component = markRaw(
  defineComponent({
    name: 'TreeNode',
    props: {
      fieldKey: { type: String, required: true },
      value: { type: [String, Number, Boolean, Object, Array], default: null },
      depth: { type: Number, default: 0 },
    },
    setup(nodeProps) {
      const expanded = ref(false);
      const isObject = computed(
        () => nodeProps.value !== null && typeof nodeProps.value === 'object',
      );
      const indent = computed(() => nodeProps.depth * 16);

      return (): ReturnType<typeof h> => {
        const children: ReturnType<typeof h>[] = isObject.value
          ? Object.entries(nodeProps.value as Record<string, unknown>).map(([k, v]) =>
              h(TreeNode, { fieldKey: k, value: v, depth: nodeProps.depth + 1 }),
            )
          : [];

        return h('div', { class: 'tree-node', style: { paddingLeft: `${indent.value}px` } }, [
          h(
            isObject.value ? 'button' : 'div',
            {
              class: 'tree-node-row',
              ...(isObject.value
                ? {
                    type: 'button',
                    onClick: () => (expanded.value = !expanded.value),
                    onKeydown: (e: KeyboardEvent) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        expanded.value = !expanded.value;
                      }
                    },
                  }
                : {}),
            },
            [
              isObject.value
                ? h('span', {
                    class: expanded.value
                      ? 'i-carbon-chevron-down h-3 w-3 mr-1'
                      : 'i-carbon-chevron-right h-3 w-3 mr-1',
                  })
                : h('span', { class: 'w-4 inline-block' }),
              h('span', { class: 'tree-key' }, nodeProps.fieldKey),
              h('span', { class: 'tree-colon' }, ': '),
              !isObject.value || !expanded.value
                ? h(
                    'span',
                    { class: `tree-value type-${typeof nodeProps.value}` },
                    isObject.value
                      ? Array.isArray(nodeProps.value)
                        ? `Array(${(nodeProps.value as unknown[]).length})`
                        : `{…}`
                      : String(nodeProps.value ?? 'null'),
                  )
                : null,
            ],
          ),
          expanded.value && isObject.value ? h('div', { class: 'tree-children' }, children) : null,
        ]);
      };
    },
  }),
);
</script>

<style scoped>
.result-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.result-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  border-bottom: 1px solid hsl(var(--border));
  flex-shrink: 0;
  gap: 8px;
  min-height: 0;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.status-text {
  font-size: 0.75rem;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.status-text.dimmed {
  opacity: 0.65;
}

.toolbar-divider {
  width: 1px;
  height: 14px;
  background: hsl(var(--border));
  margin: 0 2px;
}

.table-scroll-area {
  flex: 1;
  overflow: auto;
  min-height: 0;
}

.data-table {
  width: 100%;
  caption-side: bottom;
  font-size: 0.875rem;
  border-collapse: separate;
  border-spacing: 0;
}

.data-table th {
  height: 2rem;
  padding: 0 0.5rem;
  text-align: left;
  vertical-align: middle;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.data-table td {
  padding: 0.375rem 0.5rem;
  vertical-align: middle;
}

.data-row {
  border-bottom: 1px solid hsl(var(--border));
  transition: background-color 0.15s;
  cursor: pointer;
}

.data-row:hover {
  background: hsl(var(--muted) / 0.7);
}

.data-row--selected {
  background: hsl(var(--primary) / 0.08);
  outline: 2px solid hsl(var(--primary) / 0.3);
  outline-offset: -2px;
}

.data-row--selected:hover {
  background: hsl(var(--primary) / 0.12);
}

.tree-scroll-area {
  flex: 1;
  min-height: 0;
}

.tree-container {
  padding: 8px;
}

.tree-document {
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
  margin-bottom: 8px;
  overflow: hidden;
}

.tree-doc-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  width: 100%;
  text-align: left;
  background: hsl(var(--muted) / 0.4);
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
}

.tree-doc-header:hover {
  background: hsl(var(--muted) / 0.7);
}

.tree-doc-body {
  padding: 4px 0;
}

.json-editor-area {
  flex: 1;
  min-height: 0;
  height: 100%;
}

.result-pagination {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-top: 1px solid hsl(var(--border));
  flex-shrink: 0;
}

.sticky-header {
  position: sticky;
  top: 0;
  z-index: 10;
  background: hsl(var(--background));
}

.sticky-action-header,
.sticky-action-cell {
  position: sticky;
  right: 0;
  background: hsl(var(--background));
  z-index: 5;
  box-shadow: -4px 0 6px -2px hsl(var(--border));
}

.sticky-action-header {
  z-index: 11;
}

.data-row:hover .sticky-action-cell {
  background: hsl(var(--muted) / 0.5);
}

.sticky-action-header,
.sticky-action-cell {
  position: sticky;
  right: 0;
  background: hsl(var(--background));
  z-index: 5;
  box-shadow: -4px 0 6px -2px hsl(var(--border));
}

tr:hover .sticky-action-cell {
  background: hsl(var(--muted) / 0.5);
}

.sticky-action-header {
  z-index: 11;
}

.cell-value {
  display: block;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.8125rem;
}

.error-card,
.success-card {
  margin: 12px;
}

:deep(.tree-node-row) {
  display: flex;
  align-items: center;
  padding: 2px 8px;
  cursor: default;
  font-size: 0.8125rem;
  font-family: monospace;
  border-radius: 3px;
}

:deep(.tree-node-row:hover) {
  background: hsl(var(--muted) / 0.5);
}

:deep(.tree-key) {
  color: hsl(var(--primary));
  font-weight: 500;
}

:deep(.tree-colon) {
  margin: 0 4px;
  color: hsl(var(--muted-foreground));
}

:deep(.tree-value) {
  color: hsl(var(--foreground));
}

:deep(.tree-value.type-string) {
  color: #16a34a;
}

:deep(.tree-value.type-number) {
  color: #2563eb;
}

:deep(.tree-value.type-boolean) {
  color: #9333ea;
}
</style>
