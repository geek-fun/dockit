<template>
  <Card class="step-card">
    <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-4">
      <div class="step-header">
        <span class="i-carbon-data-structured h-5 w-5" style="color: #18a058" />
        <div class="step-title-container">
          <span class="step-title">{{ $t('export.schemaStructure') }}</span>
          <span v-if="selectedIndex" class="step-subtitle">{{ selectedIndex }} schema</span>
        </div>
      </div>
      <div class="header-extra">
        <Button variant="link" :disabled="loading" @click="handleRefresh">
          <Spinner v-if="loading" class="mr-2 h-4 w-4" />
          {{ $t('export.refresh') }}
        </Button>
        <span class="step-badge">{{ $t('export.step') }} 02</span>
      </div>
    </CardHeader>
    <CardContent>
      <div v-if="fields.length === 0" class="empty-state">
        <Empty :description="$t('export.selectSourceFirst')">
          <template #icon>
            <span class="i-carbon-data-structured h-12 w-12" />
          </template>
        </Empty>
      </div>

      <div v-else class="schema-table">
        <div class="schema-header">
          <span class="col-field">{{ $t('export.field') }}</span>
          <span class="col-type">{{ $t('export.type') }}</span>
          <span class="col-sample">{{ $t('export.sampleValue') }}</span>
          <span class="col-include">{{ $t('export.includeInExport') }}</span>
        </div>
        <div class="schema-body">
          <div v-for="field in fields" :key="field.name" class="schema-row">
            <span class="col-field">{{ field.name }}</span>
            <span class="col-type">
              <Badge :variant="getTypeColor(field.type)">
                {{ field.type }}
              </Badge>
            </span>
            <span class="col-sample">{{ field.sampleValue || '-' }}</span>
            <span class="col-include">
              <Switch
                :checked="field.includeInExport"
                @update:checked="() => toggleField(field.name)"
              />
            </span>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Empty } from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import { useImportExportStore } from '../../../store';
import { CustomError } from '../../../common';
import { useLang } from '../../../lang';
import { useMessageService } from '@/composables';

const message = useMessageService();
const lang = useLang();

const exportStore = useImportExportStore();
const { fields, selectedIndex, connection } = storeToRefs(exportStore);

const loading = ref(false);

const handleRefresh = async () => {
  if (!connection.value || !selectedIndex.value) {
    message.warning(lang.t('export.selectSourceFirst'));
    return;
  }

  loading.value = true;
  try {
    await exportStore.fetchSchemaAndSamples();
    message.success(lang.t('export.schemaLoaded'));
  } catch (err) {
    const error = err as CustomError;
    message.error(`status: ${error.status}, details: ${error.details}`, {
      closable: true,
      keepAliveOnHover: true,
      duration: 3000,
    });
  } finally {
    loading.value = false;
  }
};

const toggleField = (fieldName: string) => {
  exportStore.toggleFieldInclusion(fieldName);
};

const getTypeColor = (type: string): 'success' | 'info' | 'warning' | 'destructive' | 'default' => {
  const typeColors: { [key: string]: 'success' | 'info' | 'warning' | 'destructive' | 'default' } =
    {
      TEXT: 'success',
      STRING: 'success',
      KEYWORD: 'success',
      NUMBER: 'info',
      INTEGER: 'info',
      LONG: 'info',
      FLOAT: 'info',
      DOUBLE: 'info',
      BOOLEAN: 'warning',
      DATE: 'warning',
      OBJECT: 'destructive',
      NESTED: 'destructive',
      ARRAY: 'destructive',
    };
  return typeColors[type] || 'default';
};

// Auto-fetch schema when index changes
watch(
  [connection, selectedIndex],
  async ([newConnection, newIndex]) => {
    if (newConnection && newIndex) {
      loading.value = true;
      try {
        await exportStore.fetchSchemaAndSamples();
      } catch (err) {
        const error = err as CustomError;
        message.error(`status: ${error.status}, details: ${error.details}`, {
          closable: true,
          keepAliveOnHover: true,
          duration: 3000,
        });
      } finally {
        loading.value = false;
      }
    }
  },
  { immediate: false },
);
</script>

<style scoped>
.step-card .step-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.step-card .step-header .step-title-container {
  display: flex;
  flex-direction: column;
}

.step-card .step-header .step-title-container .step-title {
  font-size: 16px;
  font-weight: 600;
}

.step-card .step-header .step-title-container .step-subtitle {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.step-card .header-extra {
  display: flex;
  align-items: center;
  gap: 16px;
}

.step-card .header-extra .step-badge {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  font-weight: 500;
}

.step-card .empty-state {
  padding: 40px 0;
}

.step-card .schema-table .schema-header {
  display: flex;
  padding: 12px 0;
  border-bottom: 1px solid hsl(var(--border));
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  text-transform: uppercase;
  font-weight: 500;
}

.step-card .schema-table .schema-body {
  max-height: 300px;
  overflow-y: auto;
}

.step-card .schema-table .schema-row {
  display: flex;
  padding: 12px 0;
  border-bottom: 1px solid hsl(var(--border));
  align-items: center;
}

.step-card .schema-table .schema-row:last-child {
  border-bottom: none;
}

.step-card .schema-table .col-field {
  flex: 2;
  font-weight: 500;
}

.step-card .schema-table .col-type {
  flex: 1;
}

.step-card .schema-table .col-sample {
  flex: 2;
  color: hsl(var(--muted-foreground));
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.step-card .schema-table .col-include {
  flex: 1;
  text-align: right;
}
</style>
