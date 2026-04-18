<template>
  <Card class="step-card">
    <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-4">
      <div class="step-header">
        <span class="i-carbon-data-structured h-5 w-5" style="color: #18a058" />
        <div class="step-title-container">
          <span class="step-title">{{ $t('import.schemaStructure') }}</span>
          <span v-if="hasSchemaData" class="step-subtitle">
            {{
              isNewCollection ? $t('import.schemaFromMetadata') : $t('import.schemaFromExisting')
            }}
          </span>
        </div>
      </div>
      <div class="header-extra">
        <Button
          v-if="hasDataFile"
          variant="ghost"
          size="sm"
          :disabled="loading"
          @click="handleRefreshSchema"
        >
          {{ $t('export.refresh') }}
        </Button>
        <span class="step-badge">{{ $t('export.step') }} 03</span>
      </div>
    </CardHeader>
    <CardContent>
      <!-- Empty State: No data file selected -->
      <div v-if="!hasDataFile" class="empty-state">
        <Empty :description="$t('import.selectDataFirst')">
          <template #icon>
            <span class="i-carbon-data-structured h-12 w-12" />
          </template>
        </Empty>
      </div>

      <!-- Schema Info -->
      <div v-else class="schema-info">
        <!-- Source Info + Creation Plan (side by side: source → target) -->
        <div v-if="isNewCollection && importMetadata" class="info-section">
          <div class="source-target-row">
            <!-- SOURCE INFORMATION (left) -->
            <div class="source-panel">
              <h4 class="section-title">{{ $t('import.sourceInfo') }}</h4>
              <div class="panel-card source-card">
                <div class="panel-grid">
                  <div class="panel-item">
                    <span class="panel-label">{{ $t('import.databaseType') }}</span>
                    <span class="panel-value">
                      <Badge :variant="getDbTypeVariant(importMetadata.source.dbType)">
                        {{ importMetadata.source.dbType.toUpperCase() }}
                      </Badge>
                    </span>
                  </div>
                  <div class="panel-item">
                    <span class="panel-label">{{ $t('import.sourceName') }}</span>
                    <span class="panel-value" :title="importMetadata.source.sourceName">
                      {{ importMetadata.source.sourceName }}
                    </span>
                  </div>
                  <div class="panel-item">
                    <span class="panel-label">{{ $t('import.exportedAt') }}</span>
                    <span class="panel-value" :title="formatDate(importMetadata.export.exportedAt)">
                      {{ formatDate(importMetadata.export.exportedAt) }}
                    </span>
                  </div>
                  <div class="panel-item">
                    <span class="panel-label">{{ $t('import.rowCount') }}</span>
                    <span class="panel-value">
                      {{ formatNumber(importMetadata.export.rowCount) }}
                    </span>
                  </div>
                  <div class="panel-item">
                    <span class="panel-label">{{ $t('import.schemaVersion') }}</span>
                    <span class="panel-value">{{ importMetadata.version }}</span>
                  </div>
                  <div class="panel-item">
                    <span class="panel-label">{{ $t('import.format') }}</span>
                    <span class="panel-value">
                      {{ importMetadata.export.format.toUpperCase() }}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Arrow separator -->
            <div class="flow-arrow">
              <span class="i-carbon-arrow-right h-5 w-5" />
            </div>

            <!-- CREATION PLAN (right) -->
            <div v-if="hasSchemaData" class="target-panel">
              <h4 class="section-title">{{ $t('import.creationPlan') }}</h4>
              <div class="panel-card plan-card">
                <!-- ES Plan -->
                <div
                  v-if="importConnection?.type === DatabaseType.ELASTICSEARCH"
                  class="panel-grid"
                >
                  <div class="panel-item">
                    <span class="panel-label">{{ $t('export.index') }}</span>
                    <span class="panel-value" :title="importTargetIndex">
                      {{ importTargetIndex }}
                    </span>
                  </div>
                  <div class="panel-item">
                    <span class="panel-label">{{ $t('export.field') }}</span>
                    <span class="panel-value">{{ importSchemaFields.length }}</span>
                  </div>
                  <div class="panel-item">
                    <span class="panel-label">{{ $t('import.rowCount') }}</span>
                    <span class="panel-value">{{ importMetadata?.export.rowCount || 0 }}</span>
                  </div>
                  <div class="panel-item">
                    <span class="panel-label">{{ $t('import.strategy') }}</span>
                    <Badge variant="success">{{ $t('import.willBeCreated') }}</Badge>
                  </div>
                  <!-- Shards + Replicas in their own full-width row -->
                  <div class="panel-item-editable-row">
                    <div class="capacity-sub-row">
                      <div class="panel-item-editable">
                        <span class="panel-label">{{ $t('import.shards') }}</span>
                        <input
                          v-model.number="importCreationOptions.shards"
                          type="number"
                          class="plan-input"
                          min="1"
                        />
                      </div>
                      <div class="panel-item-editable">
                        <span class="panel-label">{{ $t('import.replicas') }}</span>
                        <input
                          v-model.number="importCreationOptions.replicas"
                          type="number"
                          class="plan-input"
                          min="0"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <!-- DynamoDB Plan -->
                <div
                  v-else-if="importConnection?.type === DatabaseType.DYNAMODB"
                  class="panel-grid"
                >
                  <div class="panel-item">
                    <span class="panel-label">{{ $t('import.table') }}</span>
                    <span class="panel-value" :title="importTargetIndex">
                      {{ importTargetIndex }}
                    </span>
                  </div>
                  <div class="panel-item">
                    <span class="panel-label">{{ $t('import.strategy') }}</span>
                    <Badge variant="success">{{ $t('import.willBeCreated') }}</Badge>
                  </div>
                  <!-- PK (left) + SK (right) on their own row -->
                  <div class="panel-item">
                    <span class="panel-label">{{ $t('import.partitionKey') }}</span>
                    <span class="panel-value" :title="getDynamoPartitionKey() ?? undefined">
                      {{ getDynamoPartitionKey() }}
                    </span>
                  </div>
                  <div class="panel-item">
                    <span v-if="getDynamoSortKey()" class="panel-label">
                      {{ $t('import.sortKey') }}
                    </span>
                    <span
                      v-if="getDynamoSortKey()"
                      class="panel-value"
                      :title="getDynamoSortKey() ?? undefined"
                    >
                      {{ getDynamoSortKey() }}
                    </span>
                  </div>
                  <!-- Billing Mode + Capacity in their own full-width row -->
                  <div class="panel-item-editable-row">
                    <div class="panel-item-editable panel-item-editable--radio">
                      <span class="panel-label">{{ $t('import.billingMode') }}</span>
                      <RadioGroup v-model="importCreationOptions.billingMode" class="flex gap-3">
                        <div class="flex items-center gap-1.5">
                          <RadioGroupItem id="dynamo-pay" value="PAY_PER_REQUEST" />
                          <label for="dynamo-pay" class="plan-radio-label">
                            {{ $t('import.payPerRequest') }}
                          </label>
                        </div>
                        <div class="flex items-center gap-1.5">
                          <RadioGroupItem id="dynamo-prov" value="PROVISIONED" />
                          <label for="dynamo-prov" class="plan-radio-label">
                            {{ $t('import.provisioned') }}
                          </label>
                        </div>
                      </RadioGroup>
                    </div>
                    <div
                      v-if="importCreationOptions.billingMode === 'PROVISIONED'"
                      class="capacity-sub-row"
                    >
                      <div class="panel-item-editable">
                        <span class="panel-label">{{ $t('import.readCapacity') }}</span>
                        <input
                          v-model.number="importCreationOptions.readCapacity"
                          type="number"
                          class="plan-input"
                          min="1"
                        />
                      </div>
                      <div class="panel-item-editable">
                        <span class="panel-label">{{ $t('import.writeCapacity') }}</span>
                        <input
                          v-model.number="importCreationOptions.writeCapacity"
                          type="number"
                          class="plan-input"
                          min="1"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Schema Comparison Table -->
        <div v-if="importSchemaFields.length > 0" class="schema-section">
          <h4 class="section-title">{{ $t('import.schemaComparison') }}</h4>
          <div class="schema-table">
            <div class="schema-header">
              <span class="col-field">{{ $t('export.field') }}</span>
              <span class="col-source-type">{{ $t('import.sourceType') }}</span>
              <span v-if="!isNewCollection" class="col-target-type">
                {{ $t('import.targetType') }}
              </span>
              <span v-if="isNewCollection" class="col-target-type">
                {{ $t('import.willBeCreated') }}
              </span>
              <span class="col-match">{{ $t('import.matchStatus') }}</span>
              <span class="col-exclude">{{ $t('import.exclude') }}</span>
            </div>
            <div class="schema-body">
              <div
                v-for="field in importSchemaFields"
                :key="field.name"
                :class="[
                  'schema-row',
                  {
                    'row-excluded': field.exclude,
                    'row-mismatch': !field.matched && !isNewCollection,
                  },
                ]"
              >
                <span class="col-field">{{ field.name }}</span>
                <span class="col-source-type">
                  <Badge :variant="getTypeVariant(field.sourceType)" class="text-xs">
                    {{ field.sourceType }}
                  </Badge>
                </span>
                <span class="col-target-type">
                  <Badge
                    v-if="!isNewCollection && field.targetType !== '-'"
                    :variant="getTypeVariant(field.targetType)"
                    class="text-xs"
                  >
                    {{ field.targetType }}
                  </Badge>
                  <Badge v-else-if="isNewCollection" variant="success" class="text-xs">
                    {{ getWillCreateType(field) }}
                  </Badge>
                  <span v-else class="no-match">-</span>
                </span>
                <span class="col-match">
                  <Badge v-if="isNewCollection" variant="success" class="text-xs">
                    {{ $t('import.notMatched') }}
                  </Badge>
                  <Badge v-else-if="field.matched" variant="success" class="text-xs">
                    {{ $t('import.matched') }}
                  </Badge>
                  <Badge v-else variant="warning" class="text-xs">
                    {{ $t('import.notMatched') }}
                  </Badge>
                </span>
                <span class="col-exclude">
                  <Checkbox
                    :checked="field.exclude"
                    @update:checked="toggleFieldExclude(field.name)"
                  />
                </span>
              </div>
            </div>
          </div>
          <p class="schema-hint">{{ $t('import.excludeFieldsHint') }}</p>
        </div>

        <!-- Comments (only for new collection with metadata) -->
        <div v-if="isNewCollection && importMetadata?.comments" class="comments-section">
          <h4 class="section-title">{{ $t('import.comments') }}</h4>
          <p class="comments-text">{{ importMetadata.comments }}</p>
        </div>
      </div>
    </CardContent>
  </Card>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Empty } from '@/components/ui/empty';
import { Badge, type BadgeVariants } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useImportExportStore, DatabaseType } from '../../../store';
import { inferredTypeToEsType } from '../utils/schemaMapping';

const importExportStore = useImportExportStore();
const {
  importMetadata,
  importDataFile,
  importSchemaFields,
  importIsNewCollection,
  importConnection,
  importTargetIndex,
  importCreationOptions,
  importSchemaOverrides,
} = storeToRefs(importExportStore);

const loading = ref(false);

const hasDataFile = computed(() => !!importDataFile.value);
const isNewCollection = computed(() => importIsNewCollection.value);
const hasSchemaData = computed(() => importSchemaFields.value.length > 0);

const getDynamoPartitionKey = () => {
  const schema = importMetadata.value?.schema as any;
  const keySchema = schema?.keySchema;
  const attrDefs = schema?.attributeDefinitions;
  const hashKey = keySchema?.find((k: any) => k.keyType?.toUpperCase() === 'HASH');
  if (!hashKey) return '-';
  const hashAttr = attrDefs?.find((a: any) => a.attributeName === hashKey.attributeName);
  return `${hashKey.attributeName} (${hashAttr?.attributeType ?? 'S'})`;
};

const getDynamoSortKey = () => {
  const schema = importMetadata.value?.schema as any;
  const keySchema = schema?.keySchema;
  const attrDefs = schema?.attributeDefinitions;
  const rangeKey = keySchema?.find((k: any) => k.keyType?.toUpperCase() === 'RANGE');
  if (!rangeKey) return null;
  const rangeAttr = attrDefs?.find((a: any) => a.attributeName === rangeKey.attributeName);
  return `${rangeKey.attributeName} (${rangeAttr?.attributeType ?? 'S'})`;
};

const getWillCreateType = (field: any) => {
  if (importConnection.value?.type === DatabaseType.ELASTICSEARCH) {
    return inferredTypeToEsType(field.sourceType, importSchemaOverrides.value[field.name]);
  }
  return field.sourceType;
};

const handleRefreshSchema = async () => {
  loading.value = true;
  try {
    await importExportStore.buildSchemaComparison();
  } finally {
    loading.value = false;
  }
};

const toggleFieldExclude = (fieldName: string) => {
  importExportStore.toggleSchemaFieldExclude(fieldName);
};

const formatDate = (dateStr: string): string => {
  try {
    return new Date(dateStr).toLocaleString();
  } catch {
    return dateStr;
  }
};

const formatNumber = (num: number): string => {
  return num.toLocaleString();
};

const getDbTypeVariant = (type: string): BadgeVariants['variant'] => {
  const typeVariants: { [key: string]: BadgeVariants['variant'] } = {
    elasticsearch: 'success',
    dynamodb: 'info',
  };
  return typeVariants[type.toLowerCase()] || 'secondary';
};

const getTypeVariant = (type: string): BadgeVariants['variant'] => {
  const typeVariants: { [key: string]: BadgeVariants['variant'] } = {
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
  return typeVariants[type] || 'secondary';
};
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

.step-card .empty-state-small {
  padding: 24px 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.step-card .empty-state-small .loading-text {
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

.step-card .schema-info .info-section {
  margin-bottom: 24px;
}

.step-card .schema-info .info-section .section-title {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  text-transform: uppercase;
  font-weight: 600;
  margin-bottom: 12px;
}

/* Source → Target horizontal layout */
.step-card .schema-info .source-target-row {
  display: flex;
  gap: 0;
  align-items: stretch;
}

.step-card .schema-info .source-panel,
.step-card .schema-info .target-panel {
  flex: 1;
  min-width: 0;
}

.step-card .schema-info .flow-arrow {
  display: flex;
  align-items: center;
  padding: 24px 12px 0;
  color: hsl(var(--muted-foreground));
  flex-shrink: 0;
}

.step-card .schema-info .panel-card {
  padding: 14px;
  border-radius: 8px;
  border: 1px solid hsl(var(--border));
}

.step-card .schema-info .source-card {
  background: hsl(var(--card));
}

.step-card .schema-info .plan-card {
  background-color: rgba(24, 160, 88, 0.05);
  border-color: rgba(24, 160, 88, 0.2);
  border-left: 4px solid #18a058;
}

.step-card .schema-info .panel-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px 16px;
}

.step-card .schema-info .panel-item {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.step-card .schema-info .panel-label {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  text-transform: uppercase;
  white-space: nowrap;
  flex-shrink: 0;
}

.step-card .schema-info .panel-label::after {
  content: ':';
}

.step-card .schema-info .panel-value {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.step-card .schema-info .panel-item-editable-row {
  grid-column: 1 / -1;
  display: flex;
  gap: 16px;
  padding-top: 8px;
  margin-top: 4px;
  border-top: 1px dashed hsl(var(--border));
  flex-wrap: wrap;
}

.step-card .schema-info .panel-item-editable {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
}

.step-card .schema-info .panel-item-editable--radio {
  flex: 2;
}

.step-card .schema-info .capacity-sub-row {
  display: flex;
  gap: 16px;
  flex: 1;
  padding: 6px 10px;
  background: rgba(0, 0, 0, 0.03);
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
}

.step-card .schema-info .plan-radio-label {
  font-size: 12px;
  color: hsl(var(--foreground));
  cursor: pointer;
}

.step-card .schema-info .plan-input {
  width: 60px;
  padding: 2px 6px;
  font-size: 13px;
  font-weight: 600;
  color: hsl(var(--foreground));
  background: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  border-radius: 4px;
  text-align: center;
  outline: none;
}

.step-card .schema-info .plan-input:focus {
  border-color: #18a058;
}

.step-card .schema-info .schema-section .section-title {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  text-transform: uppercase;
  font-weight: 600;
  margin-bottom: 12px;
}

.step-card .schema-info .schema-section .schema-table {
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  overflow: hidden;
}

.step-card .schema-info .schema-section .schema-table .schema-header {
  display: flex;
  padding: 12px 16px;
  background: hsl(var(--card));
  border-bottom: 1px solid hsl(var(--border));
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  text-transform: uppercase;
  font-weight: 600;
}

.step-card .schema-info .schema-section .schema-table .schema-body {
  max-height: 300px;
  overflow-y: auto;
}

.step-card .schema-info .schema-section .schema-table .schema-row {
  display: flex;
  padding: 10px 16px;
  border-bottom: 1px solid hsl(var(--border));
  align-items: center;
}

.step-card .schema-info .schema-section .schema-table .schema-row:last-child {
  border-bottom: none;
}

.step-card .schema-info .schema-section .schema-table .schema-row:hover {
  background: rgba(0, 0, 0, 0.02);
}

.step-card .schema-info .schema-section .schema-table .schema-row.row-excluded {
  opacity: 0.5;
  text-decoration: line-through;
}

.step-card .schema-info .schema-section .schema-table .schema-row.row-mismatch {
  background: rgba(250, 173, 20, 0.05);
}

.step-card .schema-info .schema-section .schema-table .col-field {
  flex: 2;
  font-family: monospace;
  font-size: 12px;
}

.step-card .schema-info .schema-section .schema-table .col-source-type,
.step-card .schema-info .schema-section .schema-table .col-target-type {
  flex: 1;
}

.step-card .schema-info .schema-section .schema-table .col-match {
  flex: 1;
}

.step-card .schema-info .schema-section .schema-table .col-exclude {
  flex: 0.5;
  text-align: center;
}

.step-card .schema-info .schema-section .schema-table .no-match {
  color: hsl(var(--muted-foreground));
}

.step-card .schema-info .schema-section .schema-hint {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  margin-top: 8px;
  margin-bottom: 0;
}

.step-card .schema-info .comments-section {
  margin-top: 24px;
}

.step-card .schema-info .comments-section .section-title {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  text-transform: uppercase;
  font-weight: 600;
  margin-bottom: 8px;
}

.step-card .schema-info .comments-section .comments-text {
  font-size: 13px;
  color: hsl(var(--muted-foreground));
  padding: 12px;
  background: hsl(var(--card));
  border-radius: 8px;
  margin: 0;
}
</style>
