<template>
  <div class="cluster-manage-container">
    <div :class="{ 'pointer-events-none': loading }">
      <!-- Metrics Cards Section -->
      <section class="metrics-section">
        <div v-if="loading" class="metrics-grid">
          <Card v-for="i in 5" :key="i" class="metric-card">
            <CardContent class="p-4 flex flex-col gap-2">
              <div class="skeleton skeleton-label"></div>
              <div class="skeleton skeleton-value"></div>
            </CardContent>
          </Card>
        </div>
        <div v-else class="metrics-grid">
          <!-- Cluster Card -->
          <Card class="metric-card cluster-card" :class="statusCardClass">
            <CardContent class="p-4">
              <div class="cluster-header">
                <span class="metric-label">{{ $t('manage.cluster') }}</span>
                <div class="cluster-status-badge">
                  <span class="status-indicator" :class="statusClass"></span>
                  <span class="status-badge-text" :class="statusClass">
                    {{ cluster?.status || '-' }}
                  </span>
                </div>
              </div>
              <div class="cluster-info">
                <div class="cluster-info-row">
                  <span class="info-label">NAME</span>
                  <span class="info-value">{{ cluster?.cluster_name || '-' }}</span>
                </div>
                <div class="cluster-info-row">
                  <span class="info-label">VERSION</span>
                  <span class="info-value">{{ cluster?.nodes.versions?.join(', ') || '-' }}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <!-- Nodes Card -->
          <Card class="metric-card">
            <CardContent class="p-4 flex flex-col gap-2">
              <span class="metric-label">{{ $t('manage.nodes') }}</span>
              <span class="metric-value">{{ cluster?.nodes.count.total || 0 }}</span>
            </CardContent>
          </Card>

          <!-- Indices Card -->
          <Card class="metric-card">
            <CardContent class="p-4 flex flex-col gap-2">
              <span class="metric-label">{{ $t('manage.indices') }}</span>
              <span class="metric-value">{{ cluster?.indices.count || 0 }}</span>
            </CardContent>
          </Card>

          <!-- Shards Card -->
          <Card class="metric-card shards-card">
            <CardContent class="p-4">
              <span class="metric-label">{{ $t('manage.shards') }}</span>
              <div class="shards-info">
                <div class="shards-info-item">
                  <span class="info-label">TOTAL</span>
                  <span class="info-value">{{ cluster?.indices.shards.total || 0 }}</span>
                </div>
                <div class="shards-info-item">
                  <span class="info-label">PRIMARY</span>
                  <span class="info-value">{{ cluster?.indices.shards.primaries || 0 }}</span>
                </div>
                <div class="shards-info-item">
                  <span class="info-label">REPLICA</span>
                  <span class="info-value">{{ shardReplicas }}</span>
                </div>
                <div class="shards-info-item">
                  <span class="info-label">UNASSIGNED</span>
                  <span class="info-value" :class="{ 'shard-unassigned': shardUnassigned > 0 }">
                    {{ shardUnassigned }}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <!-- Docs Card -->
          <Card class="metric-card docs-card">
            <CardContent class="p-4">
              <span class="metric-label">DOCS</span>
              <div class="docs-info">
                <div class="docs-info-item">
                  <span class="info-label">COUNT</span>
                  <span class="info-value">{{ formatNumber(cluster?.indices.docs.count) }}</span>
                </div>
                <div class="docs-info-item">
                  <span class="info-label">SIZE</span>
                  <span class="info-value">
                    {{ prettyBytes(cluster?.indices.store.size_in_bytes || 0) }}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <!-- Nodes Section -->
      <section class="nodes-section">
        <Card class="nodes-card">
          <CardHeader>
            <div class="section-header">
              <div class="section-title">
                <span class="i-carbon-datacenter h-4 w-4" />
                <span>{{ $t('manage.nodes') }}</span>
              </div>
              <span class="node-count">{{ nodes.length }} nodes</span>
            </div>
          </CardHeader>
          <CardContent>
            <div v-if="nodesLoading" class="flex justify-center py-4">
              <Spinner size="md" />
            </div>
            <div v-else-if="nodes.length === 0" class="empty-nodes">
              <Empty :description="$t('manage.emptyNoConnection')" />
            </div>
            <div v-else class="nodes-grid">
              <div v-for="node in nodes" :key="node.name" class="node-card">
                <div class="node-header">
                  <div class="node-roles">
                    <TooltipProvider v-if="node.master">
                      <Tooltip>
                        <TooltipTrigger as-child>
                          <span class="i-carbon-star-filled node-role-icon master" />
                        </TooltipTrigger>
                        <TooltipContent>{{ $t('manage.masterNode') }}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider
                      v-if="node.roles.includes(NodeRoleEnum.MASTER_ELIGIBLE) && !node.master"
                    >
                      <Tooltip>
                        <TooltipTrigger as-child>
                          <span class="i-carbon-star node-role-icon" />
                        </TooltipTrigger>
                        <TooltipContent>{{ $t('manage.masterEligible') }}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider v-if="node.roles.includes(NodeRoleEnum.DATA)">
                      <Tooltip>
                        <TooltipTrigger as-child>
                          <span class="i-carbon-vmdk-disk node-role-icon data" />
                        </TooltipTrigger>
                        <TooltipContent>{{ $t('manage.dataNode') }}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider v-if="node.roles.includes(NodeRoleEnum.INGEST)">
                      <Tooltip>
                        <TooltipTrigger as-child>
                          <span class="i-carbon-folder-move-to node-role-icon" />
                        </TooltipTrigger>
                        <TooltipContent>{{ $t('manage.ingestNode') }}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <span class="node-name-title">{{ node.name }}</span>
                </div>
                <div class="node-stats-row">
                  <div class="node-stat">
                    <span class="stat-label">{{ $t('manage.node.ip') }}</span>
                    <span class="stat-text">{{ node.ip }}</span>
                  </div>
                  <div class="node-stat">
                    <span class="stat-label">{{ $t('manage.node.shards') }}</span>
                    <span class="stat-text">{{ node.shard.total || 0 }}</span>
                  </div>
                  <div class="node-stat">
                    <span class="stat-label">{{ $t('manage.node.mappings') }}</span>
                    <span class="stat-text">{{ node.mapping.total || 0 }}</span>
                  </div>
                </div>
                <div class="node-gauges">
                  <div class="gauge-item">
                    <div class="gauge-mini">
                      <svg class="gauge-svg-mini" viewBox="0 0 36 36">
                        <path
                          class="gauge-bg"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none"
                          stroke-width="3"
                        />
                        <path
                          class="gauge-fill"
                          :class="metricColorClass(node.heap.percent)"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none"
                          stroke-width="3"
                          :stroke-dasharray="`${node.heap.percent || 0}, 100`"
                        />
                      </svg>
                      <span class="gauge-value-mini" :class="metricColorClass(node.heap.percent)">
                        {{ node.heap.percent || 0 }}%
                      </span>
                    </div>
                    <span class="gauge-label">HEAP</span>
                  </div>
                  <div class="gauge-item">
                    <div class="gauge-mini">
                      <svg class="gauge-svg-mini" viewBox="0 0 36 36">
                        <path
                          class="gauge-bg"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none"
                          stroke-width="3"
                        />
                        <path
                          class="gauge-fill"
                          :class="metricColorClass(node.ram.percent)"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none"
                          stroke-width="3"
                          :stroke-dasharray="`${node.ram.percent || 0}, 100`"
                        />
                      </svg>
                      <span class="gauge-value-mini" :class="metricColorClass(node.ram.percent)">
                        {{ node.ram.percent || 0 }}%
                      </span>
                    </div>
                    <span class="gauge-label">RAM</span>
                  </div>
                  <div class="gauge-item">
                    <div class="gauge-mini">
                      <svg class="gauge-svg-mini" viewBox="0 0 36 36">
                        <path
                          class="gauge-bg"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none"
                          stroke-width="3"
                        />
                        <path
                          class="gauge-fill"
                          :class="metricColorClass(node.disk.percent)"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none"
                          stroke-width="3"
                          :stroke-dasharray="`${node.disk.percent || 0}, 100`"
                        />
                      </svg>
                      <span class="gauge-value-mini" :class="metricColorClass(node.disk.percent)">
                        {{ node.disk.percent || 0 }}%
                      </span>
                    </div>
                    <span class="gauge-label">DISK</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <!-- Indices Section -->
      <section class="indices-section">
        <Card class="indices-card">
          <CardHeader>
            <div class="section-header">
              <div class="section-title">
                <span class="i-carbon-data-table h-4 w-4" />
                <span>{{ $t('manage.indices') }}</span>
              </div>
              <div class="section-actions">
                <Input
                  v-model="indexFilter"
                  placeholder="Filter indices…"
                  class="h-7 text-xs filter-input"
                />
                <Button size="sm" @click="toggleModal('index')">
                  <span class="i-carbon-add h-3.5 w-3.5 mr-1" />
                  {{ $t('manage.actions.newIndex') }}
                </Button>
                <Button variant="outline" size="sm" @click="toggleModal('alias')">
                  <span class="i-carbon-add h-3.5 w-3.5 mr-1" />
                  {{ $t('manage.actions.newAlias') }}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent class="p-0">
            <div class="table-container indices-table-container">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Index</TableHead>
                    <TableHead>Health</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Docs</TableHead>
                    <TableHead>Storage</TableHead>
                    <TableHead>Shards</TableHead>
                    <TableHead>Aliases</TableHead>
                    <TableHead class="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="(row, i) in filteredIndices" :key="i">
                    <TableCell class="font-medium font-mono text-xs">{{ row.index }}</TableCell>
                    <TableCell>
                      <span
                        :class="[
                          'health-dot',
                          row.health === 'green'
                            ? 'health-green'
                            : row.health === 'yellow'
                              ? 'health-yellow'
                              : 'health-red',
                        ]"
                      />
                      <span
                        :class="[
                          'health-text',
                          row.health === 'green'
                            ? 'health-green'
                            : row.health === 'yellow'
                              ? 'health-yellow'
                              : 'health-red',
                        ]"
                      >
                        {{ row.health }}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        :variant="row.status === 'open' ? 'outline' : 'secondary'"
                        class="text-xs"
                      >
                        {{ row.status }}
                      </Badge>
                    </TableCell>
                    <TableCell class="text-xs">{{ formatNumber(row.docs?.count) }}</TableCell>
                    <TableCell class="text-xs">{{ formatStorage(row.storage) }}</TableCell>
                    <TableCell>
                      <div class="shard-boxes">
                        <template
                          v-if="row.shards && Array.isArray(row.shards) && row.shards.length"
                        >
                          <div class="shard-stats">
                            <span class="i-carbon-data-enrichment h-3.5 w-3.5 shard-stats-icon" />
                            <span class="shard-stat">
                              {{ row.shards.filter((s: ClusterShard) => s.node).length }}/{{
                                row.shards.length
                              }}
                            </span>
                            <span class="shard-stat-separator">|</span>
                            <span class="shard-stat-primary">
                              Primary:
                              {{ row.shards.filter((s: ClusterShard) => s.prirep === 'p').length }}
                            </span>
                            <span class="shard-stat-replica">
                              Replica:
                              {{ row.shards.filter((s: ClusterShard) => s.prirep === 'r').length }}
                            </span>
                          </div>
                          <div
                            v-for="group in groupShardsByNode(row.shards)"
                            :key="group.node || '__unassigned__'"
                            class="shard-node-group"
                          >
                            <div
                              :class="[
                                'shard-node-label',
                                !group.node ? 'shard-node-unassigned' : '',
                              ]"
                            >
                              {{ group.node || 'UNASSIGNED' }}
                            </div>
                            <div class="shard-node-content">
                              <Button
                                v-for="shard in group.shards"
                                :key="`${shard.prirep}${shard.shard}`"
                                :variant="'outline'"
                                :class="[
                                  'shard-box',
                                  shard.prirep === 'r' ? 'shard-replica-btn' : '',
                                  !shard.node
                                    ? 'shard-unassigned-btn'
                                    : shardStateClass(shard.state),
                                ]"
                                :title="`${shard.prirep === 'p' ? 'Primary' : 'Replica'} shard ${shard.shard} — ${shard.state}${!shard.node ? ' (unassigned)' : ''}`"
                                @click="openShardDetail(row.index, shard)"
                              >
                                {{ shard.prirep }}{{ shard.shard }}
                              </Button>
                            </div>
                          </div>
                        </template>
                        <span v-else class="shard-empty">—</span>
                      </div>
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
                            @click="handleIndexAction('removeAlias', alias.index, alias.alias)"
                          >
                            <span class="i-carbon-unlink h-4 w-4 mr-2 text-destructive" />
                            {{ lang.t('manage.index.actions.removeAlias') }}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            @click="handleIndexAction('switchAlias', alias.index, alias.alias)"
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
                            @click="handleIndexAction('deleteIndex', row.index)"
                          >
                            <span class="i-carbon-trash-can h-4 w-4 mr-2 text-destructive" />
                            {{ lang.t('manage.index.actions.deleteIndex') }}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            v-if="row.status === 'open'"
                            @click="handleIndexAction('closeIndex', row.index)"
                          >
                            <span
                              class="i-carbon-locked h-4 w-4 mr-2"
                              style="color: hsl(var(--method-put))"
                            />
                            {{ lang.t('manage.index.actions.closeIndex') }}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            v-else
                            @click="handleIndexAction('openIndex', row.index)"
                          >
                            <span class="i-carbon-unlocked h-4 w-4 mr-2 text-primary" />
                            {{ lang.t('manage.index.actions.openIndex') }}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </section>

      <!-- Templates Section -->
      <section class="templates-section">
        <Card class="templates-card">
          <CardHeader>
            <div class="section-header">
              <div class="section-title">
                <span class="i-carbon-template h-4 w-4" />
                <span>{{ $t('manage.tabs.templates') }}</span>
              </div>
              <div class="section-actions">
                <Input
                  v-model="templateFilter"
                  placeholder="Filter templates…"
                  class="h-7 text-xs filter-input"
                />
                <Button size="sm" @click="toggleModal('template')">
                  <span class="i-carbon-add h-3.5 w-3.5 mr-1" />
                  {{ $t('manage.actions.newTemplate') }}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent class="p-0">
            <div class="table-container templates-table-container">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>{{ templatePrecedenceLabel }}</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Mappings</TableHead>
                    <TableHead>Settings</TableHead>
                    <TableHead>Aliases</TableHead>
                    <TableHead>Index Patterns</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="(row, i) in filteredTemplates" :key="i">
                    <TableCell class="font-medium text-xs">{{ (row as any).name }}</TableCell>
                    <TableCell class="text-xs">{{ (row as any).type }}</TableCell>
                    <TableCell class="text-xs">{{ row.precedence }}</TableCell>
                    <TableCell class="text-xs">{{ (row as any).version }}</TableCell>
                    <TableCell class="text-xs">{{ row.mapping_count }}</TableCell>
                    <TableCell class="text-xs">{{ row.settings_count }}</TableCell>
                    <TableCell class="text-xs">{{ row.alias_count }}</TableCell>
                    <TableCell>
                      <Badge
                        v-for="pattern in row.index_patterns || []"
                        :key="pattern"
                        variant="outline"
                        class="m-0.5 text-xs"
                      >
                        {{ pattern }}
                      </Badge>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </section>

      <!-- Dialogs -->
      <index-dialog ref="indexDialogRef" />
      <alias-dialog ref="aliasDialogRef" />
      <template-dialog ref="templateDialogRef" />
      <switch-alias-dialog ref="switchAliasDialogRef" />

      <!-- Shard Detail Modal -->
      <Dialog
        :open="!!shardDetailState"
        @update:open="
          val => {
            if (!val) {
              shardDetailState = undefined;
              allocationExplain = undefined;
            }
          }
        "
      >
        <DialogContent class="shard-modal-content">
          <DialogHeader>
            <DialogTitle class="shard-modal-title">
              <span>{{ shardDetailState?.indexName }}</span>
              <div class="shard-modal-meta">
                <span
                  :class="[
                    'shard-modal-badge',
                    shardDetailState?.shard.prirep === 'p' ? 'badge-primary' : 'badge-replica',
                  ]"
                >
                  {{ shardDetailState?.shard.prirep === 'p' ? 'PRIMARY' : 'REPLICA' }}
                </span>
                <span
                  v-if="!shardDetailState?.shard.node"
                  class="shard-modal-badge badge-unassigned"
                >
                  UNASSIGNED
                </span>
                <template v-else>
                  <span class="shard-modal-num">Shard {{ shardDetailState?.shard.shard }}</span>
                  <span class="shard-modal-node">{{ shardDetailState?.shard.node }}</span>
                </template>
              </div>
            </DialogTitle>
          </DialogHeader>

          <!-- Unassigned Shard Alert Banner -->
          <div v-if="shardDetailState?.shard.unassigned?.reason" class="shard-unassigned-alert">
            <span class="i-carbon-warning-alt h-4 w-4 shard-unassigned-icon" />
            <span class="shard-unassigned-reason-text">
              {{ shardDetailState?.shard.unassigned.reason }}
            </span>
            <Popover v-if="allocationExplain" class="shard-explain-popover">
              <PopoverTrigger as-child>
                <Button variant="ghost" size="xs" class="shard-explain-btn">
                  <span class="i-carbon-information h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent class="shard-explain-popover-content">
                <div class="shard-explain-popover-header">
                  <span class="shard-explain-popover-title">
                    {{ $t('manage.shard.allocationExplanation') }}
                  </span>
                  <span
                    :class="[
                      'shard-can-allocate-badge',
                      allocationExplain.can_allocate === 'yes'
                        ? 'can-allocate-yes'
                        : 'can-allocate-no',
                    ]"
                  >
                    {{ allocationExplain.can_allocate }}
                  </span>
                </div>
                <div
                  v-if="allocationExplain.allocate_explanation"
                  class="shard-explain-popover-text"
                >
                  {{ allocationExplain.allocate_explanation }}
                </div>
                <div
                  v-if="allocationExplain.node_allocation_decisions?.length"
                  class="shard-explain-popover-deciders"
                >
                  <div
                    v-for="nodeAllocDecision in allocationExplain.node_allocation_decisions"
                    :key="nodeAllocDecision.node_id"
                    class="shard-decider-node"
                  >
                    <div class="shard-decider-node-header">
                      <span class="shard-decider-node-name">{{ nodeAllocDecision.node_name }}</span>
                      <span
                        :class="[
                          'shard-decider-badge',
                          nodeAllocDecision.node_decision === 'yes'
                            ? 'decision-yes'
                            : 'decision-no',
                        ]"
                      >
                        {{ nodeAllocDecision.node_decision }}
                      </span>
                    </div>
                    <div
                      v-if="
                        nodeAllocDecision.node_decision === 'no' &&
                        nodeAllocDecision.deciders?.find(
                          (d: AllocationDecider) =>
                            d.decision?.toUpperCase() === 'NO' && d.explanation,
                        )
                      "
                      class="shard-node-errors"
                    >
                      {{
                        nodeAllocDecision.deciders.find(
                          (d: AllocationDecider) =>
                            d.decision?.toUpperCase() === 'NO' && d.explanation,
                        )?.explanation
                      }}
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <span
              v-if="allocationExplainLoading"
              class="i-carbon-circle-dash h-3.5 w-3.5 animate-spin shard-loading-icon"
            />
          </div>

          <div v-if="shardDetailState" class="shard-modal-body">
            <div class="shard-badges">
              <Popover
                v-for="(detail, idx) in buildShardDetails(shardDetailState.shard)"
                :key="idx"
              >
                <PopoverTrigger as-child>
                  <Badge
                    :variant="detail.tagType === 'warning' ? 'warning' : 'outline'"
                    class="cursor-pointer shard-detail-badge"
                  >
                    <span :class="[detail.iconClass, 'h-3 w-3 mr-1']" />
                    {{ detail.content }}
                  </Badge>
                </PopoverTrigger>
                <PopoverContent class="w-auto">
                  <span>{{ detail.desc }}</span>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  </div>
</template>

<script setup lang="ts">
import { get } from 'lodash';
import prettyBytes from 'pretty-bytes';
import { storeToRefs } from 'pinia';
import { useClusterManageStore, RawClusterStats } from '../../../store';
import {
  NodeRoleEnum,
  ClusterShard,
  ShardStateEnum,
  TemplateApiMode,
  ClusterAllocationExplain,
  AllocationDecider,
  esApi,
} from '../../../datasources';
import { useLang } from '../../../lang';
import { CustomError, debug, withLoadingDelay } from '../../../common';
import { ElasticsearchConnection, DatabaseType } from '../../../store';
import { useMessageService, useDialogService } from '@/composables';
import IndexDialog from './index-dialog.vue';
import AliasDialog from './alias-dialog.vue';
import TemplateDialog from './template-dialog.vue';
import SwitchAliasDialog from './switch-alias-dialog.vue';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';

import { Empty } from '@/components/ui/empty';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const props = defineProps<{ cluster: RawClusterStats | undefined }>();

const lang = useLang();
const message = useMessageService();
const dialog = useDialogService();

const clusterManageStore = useClusterManageStore();
const { fetchNodes, refreshStates, deleteIndex, closeIndex, openIndex, removeAlias } =
  clusterManageStore;
const { nodes, indices, indexWithAliases, templates, templateApiMode, connection } =
  storeToRefs(clusterManageStore);

// --- Cluster metrics ---

const shardReplicas = computed(() => {
  const total = props.cluster?.indices.shards.total ?? 0;
  const primaries = props.cluster?.indices.shards.primaries ?? 0;
  return total - primaries;
});

const shardUnassigned = computed(
  () => indices.value.flatMap(idx => idx.shards ?? []).filter(s => !s.node).length,
);

const loading = ref(false);
const nodesLoading = ref(false);

const statusClass = computed(() => {
  const status = props.cluster?.status?.toLowerCase();
  return {
    'status-green': status === 'green',
    'status-yellow': status === 'yellow',
    'status-red': status === 'red',
  };
});

const statusCardClass = computed(() => {
  const status = props.cluster?.status?.toLowerCase();
  return {
    'card-green': status === 'green',
    'card-yellow': status === 'yellow',
    'card-red': status === 'red',
  };
});

const formatNumber = (num: number | undefined | null) => {
  if (num === undefined || num === null) return '-';
  return num.toLocaleString();
};

const formatStorage = (storage: string | undefined | null) => {
  if (!storage) return '-';
  return storage.replace(/([0-9.]+)([a-zA-Z]+)/, (_, val, unit) => `${val} ${unit.toUpperCase()}`);
};

const loadNodes = async () => {
  nodesLoading.value = true;
  try {
    await fetchNodes();
  } catch {
    nodesLoading.value = false;
    return;
  }

  nodesLoading.value = false;
};

// --- Index management ---

const indexDialogRef = ref();
const aliasDialogRef = ref();
const templateDialogRef = ref();
const switchAliasDialogRef = ref();

const indexFilter = ref('');
const templateFilter = ref('');

type ShardGroup = {
  node: string;
  shards: ClusterShard[];
};

const groupShardsByNode = (shards: ClusterShard[] | undefined): ShardGroup[] => {
  if (!shards || shards.length === 0) return [];

  const groups: Map<string, ClusterShard[]> = new Map();

  for (const shard of shards) {
    const nodeKey = shard.node || '__unassigned__';
    if (!groups.has(nodeKey)) {
      groups.set(nodeKey, []);
    }
    groups.get(nodeKey)!.push(shard);
  }

  return Array.from(groups.entries())
    .map(([node, nodeShards]) => ({
      node: node === '__unassigned__' ? '' : node,
      shards: nodeShards.sort((a, b) => {
        if (a.prirep !== b.prirep) return a.prirep === 'p' ? -1 : 1;
        return parseInt(a.shard) - parseInt(b.shard);
      }),
    }))
    .sort((a, b) => {
      if (!a.node && b.node) return 1;
      if (a.node && !b.node) return -1;
      return a.node.localeCompare(b.node);
    });
};

const filteredIndices = computed(() =>
  indexFilter.value
    ? indexWithAliases.value.filter(item =>
        get(item, 'index', '').toLowerCase().includes(indexFilter.value.toLowerCase()),
      )
    : indexWithAliases.value,
);

const filteredTemplates = computed(() =>
  templateFilter.value
    ? templates.value.filter(item =>
        get(item, 'name', '').toLowerCase().includes(templateFilter.value.toLowerCase()),
      )
    : templates.value,
);

const templatePrecedenceLabel = computed(() => {
  return templateApiMode.value === TemplateApiMode.LEGACY
    ? lang.t('manage.index.newTemplateForm.orderLabel')
    : lang.t('manage.index.newTemplateForm.priorityLabel');
});

const toggleModal = (target: string) => {
  if (target === 'index') indexDialogRef.value.toggleModal();
  if (target === 'alias') aliasDialogRef.value.toggleModal();
  if (target === 'template') templateDialogRef.value.toggleModal();
};

const handleIndexAction = async (action: string, indexName: string, aliasName?: string) => {
  if (action === 'deleteIndex') {
    dialog.warning({
      title: lang.t('dialogOps.warning'),
      content: lang.t('manage.index.actions.deleteIndexWarning') + `:${indexName} ?`,
      positiveText: lang.t('dialogOps.confirm'),
      negativeText: lang.t('dialogOps.cancel'),
      onPositiveClick: async () => {
        try {
          await withLoadingDelay(deleteIndex(indexName));
          await refreshStates();
          message.success(lang.t('dialogOps.deleteSuccess'));
        } catch (err) {
          message.error((err as CustomError).details, { closable: true, keepAliveOnHover: true });
        }
      },
    });
  } else if (action === 'closeIndex') {
    dialog.warning({
      title: lang.t('dialogOps.warning'),
      content: lang.t('manage.index.actions.closeIndexWarning') + `:${indexName} ?`,
      positiveText: lang.t('dialogOps.confirm'),
      negativeText: lang.t('dialogOps.cancel'),
      onPositiveClick: async () => {
        try {
          await withLoadingDelay(closeIndex(indexName));
          await refreshStates();
          message.success(lang.t('dialogOps.closeSuccess'));
        } catch (err) {
          message.error((err as CustomError).details, { closable: true, keepAliveOnHover: true });
        }
      },
    });
  } else if (action === 'openIndex') {
    try {
      await withLoadingDelay(openIndex(indexName));
      await refreshStates();
      message.success(lang.t('dialogOps.openSuccess'));
    } catch (err) {
      message.error((err as CustomError).details, { closable: true, keepAliveOnHover: true });
    }
  } else if (action === 'removeAlias') {
    dialog.warning({
      title: lang.t('dialogOps.warning'),
      content: lang.t('manage.index.actions.removeAliasWarning') + ` ${indexName}@${aliasName} ?`,
      positiveText: lang.t('dialogOps.confirm'),
      negativeText: lang.t('dialogOps.cancel'),
      onPositiveClick: async () => {
        try {
          await withLoadingDelay(removeAlias(indexName, aliasName as string));
          await refreshStates();
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

// --- Shard detail ---

type ShardDetailTag = {
  iconClass: string;
  content: string;
  desc: string;
  tagType: 'default' | 'primary' | 'info' | 'success' | 'warning' | 'error';
};

const shardDetailState = ref<{ indexName: string; shard: ClusterShard } | undefined>();
const allocationExplain = ref<ClusterAllocationExplain | undefined>();
const allocationExplainLoading = ref(false);

const metricColorClass = (percent: number | null | undefined) => {
  const p = percent ?? 0;
  if (p >= 85) return 'metric-danger';
  if (p >= 65) return 'metric-warning';
  return 'metric-safe';
};

const shardStateClass = (state: string) => {
  if (state === ShardStateEnum.STARTED) return 'shard-state-started';
  if (state === ShardStateEnum.RELOCATING) return 'shard-state-relocating';
  if (state === ShardStateEnum.INITIALIZING) return 'shard-state-initializing';
  return '';
};

const openShardDetail = async (indexName: string, shard: ClusterShard) => {
  shardDetailState.value = { indexName, shard };
  allocationExplain.value = undefined;

  if (!shard.node && connection.value && connection.value.type === DatabaseType.ELASTICSEARCH) {
    allocationExplainLoading.value = true;
    try {
      allocationExplain.value = await esApi.allocationExplain(
        connection.value as ElasticsearchConnection,
        {
          index: indexName,
          shard: parseInt(shard.shard, 10),
          primary: shard.prirep === 'p',
        },
      );
    } catch (err) {
      debug(`Failed to fetch allocation explain: ${err}`);
    } finally {
      allocationExplainLoading.value = false;
    }
  }
};

const buildShardDetails = (shard: ClusterShard): ShardDetailTag[] =>
  [
    {
      iconClass: 'i-carbon-document',
      content: `docs: ${shard.docs.count ?? '-'}`,
      desc: 'docs',
      tagType: 'success',
    },
    {
      iconClass: 'i-carbon-vmdk-disk',
      content: `size: ${shard.store.size ? prettyBytes(shard.store.size) : '-'}, dataset: ${shard.dataset.size ? prettyBytes(shard.dataset.size) : '-'}`,
      desc: 'store',
      tagType: 'success',
    },
    {
      iconClass: 'i-carbon-chip',
      content: `size: ${shard.completion.size ? prettyBytes(shard.completion.size) : '-'}`,
      desc: 'completion',
      tagType: 'success',
    },
    {
      iconClass: 'i-carbon-chip',
      content: `memory_size: ${shard.fielddata.memorySize ? prettyBytes(shard.fielddata.memorySize) : '-'}, evictions: ${shard.fielddata.evictions ?? '-'}`,
      desc: 'fielddata',
      tagType: 'success',
    },
    {
      iconClass: 'i-carbon-layers',
      content: `memory_size: ${shard.queryCache.memorySize ? prettyBytes(shard.queryCache.memorySize) : '-'}, evictions: ${shard.queryCache.evictions ?? '-'}`,
      desc: 'query_cache',
      tagType: 'success',
    },
    {
      iconClass: 'i-carbon-query-queue',
      content: `success: ${shard.get.existsTotal}, ${shard.get.existsTime} failure: ${shard.get.missingTotal}, ${shard.get.missingTime}`,
      desc: 'GET OPERATION',
      tagType: 'success',
    },
    {
      iconClass: 'i-carbon-insert',
      content: `index: ${shard.indexing.indexTime} delete: ${shard.indexing.deleteTotal}, ${shard.indexing.deleteTime} failures: ${shard.indexing.indexFailed}`,
      desc: 'INDEXING OPERATION',
      tagType: 'success',
    },
    {
      iconClass: 'i-carbon-search-locate',
      content: `fetch: ${shard.search.fetchTotal}/${shard.search.fetchTime}, query: ${shard.search.queryTotal}/${shard.search.queryTime}, scroll: ${shard.search.scrollTotal}/${shard.search.scrollTime}`,
      desc: 'SEARCH OPERATION',
      tagType: 'success',
    },
    {
      iconClass: 'i-carbon-shape-except',
      content: `total: ${shard.merges.total}, size: ${shard.merges.totalSize ? prettyBytes(shard.merges.totalSize) : '-'}, docs: ${shard.merges.totalDocs} time: ${shard.merges.totalTime}`,
      desc: 'MERGES OPERATION',
      tagType: 'success',
    },
    {
      iconClass: 'i-carbon-application',
      content: `count: ${shard.segments.count}/${prettyBytes(shard.segments.memory ?? 0)}, writer: ${shard.segments.indexWriterMemory ? prettyBytes(shard.segments.indexWriterMemory) : '-'}`,
      desc: 'segments',
      tagType: 'success',
    },
    {
      iconClass: 'i-carbon-rotate-360',
      content: `total: ${shard.refresh.total}, time: ${shard.refresh.time}`,
      desc: 'refresh',
      tagType: 'success',
    },
    {
      iconClass: 'i-carbon-launch-study-1',
      content: `total: ${shard.flush.total}, time: ${shard.flush.totalTime}`,
      desc: 'flush',
      tagType: 'success',
    },
    {
      iconClass: 'i-carbon-version',
      content: `max: ${shard.seqNo.max}, global: ${shard.seqNo.globalCheckpoint}, local: ${shard.seqNo.localCheckpoint}`,
      desc: 'seq_no',
      tagType: 'success',
    },
  ].filter((d): d is ShardDetailTag => d !== undefined);

// --- Lifecycle ---

onMounted(async () => {
  await loadNodes();
});
</script>

<style scoped>
.cluster-manage-container {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 24px;
  padding-right: 32px;
  background-color: hsl(var(--background));
  box-sizing: border-box;
  position: relative;
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.cluster-manage-container::-webkit-scrollbar {
  display: none;
}

@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

.skeleton {
  border-radius: 4px;
  background: linear-gradient(
    90deg,
    hsl(var(--muted) / 0.6) 25%,
    hsl(var(--muted) / 0.9) 50%,
    hsl(var(--muted) / 0.6) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  .skeleton {
    animation: none;
  }
}

.skeleton-label {
  height: 10px;
  width: 60%;
}
.skeleton-value {
  height: 24px;
  width: 80%;
}

/* ---- Metrics ---- */
.metrics-section {
  margin-bottom: 24px;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}

.metric-card {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
}

.metric-card.cluster-card {
  min-width: 280px;
}
.metric-card.docs-card {
  min-width: 200px;
}
.metric-card.shards-card {
  min-width: 220px;
}

.metric-card.card-green {
  border-color: hsl(var(--primary) / 0.3);
}
.metric-card.card-yellow {
  border-color: hsl(var(--method-put) / 0.3);
}
.metric-card.card-red {
  border-color: hsl(var(--destructive) / 0.3);
}

.metric-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: hsl(var(--muted-foreground));
}

.metric-value {
  font-size: 20px;
  font-weight: 700;
  color: hsl(var(--foreground));
}

.cluster-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.cluster-status-badge {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: hsl(var(--muted-foreground));
}

.status-indicator.status-green {
  background-color: hsl(var(--primary));
  animation: pulse 2s infinite;
}

.status-indicator.status-yellow {
  background-color: hsl(var(--method-put));
}
.status-indicator.status-red {
  background-color: hsl(var(--destructive));
}

.status-badge-text {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}

.status-badge-text.status-green {
  color: hsl(var(--primary));
}
.status-badge-text.status-yellow {
  color: hsl(var(--method-put));
}
.status-badge-text.status-red {
  color: hsl(var(--destructive));
}

.cluster-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cluster-info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.shards-info {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px 16px;
  margin-top: 8px;
}

.shards-info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.shard-unassigned {
  color: hsl(var(--destructive));
}

.docs-info {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  margin-top: 8px;
}

.docs-info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-label {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: hsl(var(--muted-foreground));
}

.info-value {
  font-size: 14px;
  font-weight: 600;
  color: hsl(var(--foreground));
}

/* ---- Nodes ---- */
.nodes-section {
  margin-bottom: 24px;
}

.nodes-card {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: hsl(var(--foreground));
}

.section-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.node-count {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: hsl(var(--primary));
}

.nodes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.node-card {
  background: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.node-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.node-roles {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.node-role-icon {
  width: 16px;
  height: 16px;
  color: hsl(var(--muted-foreground));
}
.node-role-icon.master {
  color: hsl(var(--primary));
}
.node-role-icon.data {
  color: hsl(var(--method-get));
}

.node-name-title {
  font-size: 13px;
  font-weight: 600;
  color: hsl(var(--foreground));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
}

.node-stats-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.node-stat {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.stat-label {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: hsl(var(--muted-foreground));
}

.stat-text {
  font-size: 11px;
  font-weight: 500;
  color: hsl(var(--foreground));
}

.node-gauges {
  display: flex;
  justify-content: space-around;
  padding-top: 4px;
}
.gauge-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.gauge-mini {
  position: relative;
  width: 40px;
  height: 40px;
}

.gauge-svg-mini {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.gauge-bg {
  stroke: hsl(var(--border));
}
.gauge-fill.metric-safe {
  stroke: hsl(142 71% 45%);
}
.gauge-fill.metric-warning {
  stroke: hsl(38 92% 50%);
}
.gauge-fill.metric-danger {
  stroke: hsl(var(--destructive));
}

.gauge-value-mini {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 9px;
  font-weight: 700;
  color: hsl(var(--foreground));
}
.gauge-value-mini.metric-safe {
  color: hsl(142 71% 38%);
}
.gauge-value-mini.metric-warning {
  color: hsl(38 92% 42%);
}
.gauge-value-mini.metric-danger {
  color: hsl(var(--destructive));
}

.gauge-label {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: hsl(var(--muted-foreground));
}

.empty-nodes {
  display: flex;
  justify-content: center;
  padding: 24px;
}

/* ---- Indices ---- */
.indices-section {
  margin-bottom: 24px;
}

.indices-card {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
  overflow: hidden;
}

/* ---- Templates ---- */
.templates-section {
  margin-bottom: 24px;
}

.templates-card {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
  overflow: hidden;
}

/* ---- Shared table/section ---- */
.filter-input {
  max-width: 220px;
}

.table-container {
  overflow-x: auto;
}

.indices-table-container {
  min-height: 300px;
  max-height: 400px;
  overflow-y: auto;
}

.templates-table-container {
  min-height: 200px;
  max-height: 300px;
  overflow-y: auto;
}

/* Health dot */
.health-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  margin-right: 5px;
  vertical-align: middle;
}

.health-green {
  background: hsl(var(--primary));
}
.health-yellow {
  background: hsl(var(--method-put));
}
.health-red {
  background: hsl(var(--destructive));
}

.health-text {
  font-size: 12px;
  vertical-align: middle;
  text-transform: capitalize;
}
.health-text.health-green {
  color: hsl(var(--primary));
  background: transparent;
}
.health-text.health-yellow {
  color: hsl(var(--method-put));
  background: transparent;
}
.health-text.health-red {
  color: hsl(var(--destructive));
  background: transparent;
}

/* ---- Shard boxes ---- */
.shard-boxes {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 280px;
  padding: 4px 6px;
  background: hsl(var(--muted) / 0.4);
  border: 1px solid hsl(var(--border) / 0.6);
  border-radius: 8px;
}

.shard-node-group {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 6px 3px 6px;
  margin-top: 7px;
  background: hsl(var(--background) / 0.6);
  border: 1px solid hsl(var(--border) / 0.4);
  border-radius: 6px;
}

.shard-node-label {
  position: absolute;
  top: -5px;
  left: 6px;
  font-size: 9px;
  font-weight: 600;
  padding: 0 5px;
  height: 10px;
  line-height: 10px;
  background: hsl(var(--muted));
  border-radius: 999px;
  white-space: nowrap;
  overflow: hidden;
  color: hsl(var(--muted-foreground));
}

.shard-node-unassigned {
  background: hsl(var(--destructive) / 0.2);
  color: hsl(var(--destructive));
}

.shard-node-content {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
}

.shard-box {
  cursor: pointer;
  flex-shrink: 0;
  border-radius: 4px !important;
  font-size: 10px !important;
  height: 18px !important;
  padding: 0 4px !important;
  line-height: 1;
}

.shard-replica-btn {
  border-color: hsl(var(--primary) / 0.7) !important;
  border-style: dotted !important;
  color: hsl(var(--primary)) !important;
}

.shard-unassigned-btn {
  opacity: 0.55;
  border-color: hsl(var(--destructive) / 0.7) !important;
  color: hsl(var(--destructive)) !important;
}

.shard-state-started {
  border-color: hsl(var(--primary) / 0.5);
}
.shard-state-relocating {
  border-color: hsl(var(--method-put) / 0.7);
}
.shard-state-initializing {
  border-color: hsl(var(--method-get) / 0.7);
}

.shard-stats {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 500;
  margin-bottom: 2px;
}

.shard-stats-icon {
  color: hsl(var(--muted-foreground));
}

.shard-stat {
  color: hsl(var(--muted-foreground));
}

.shard-stat-separator {
  color: hsl(var(--border));
}

.shard-stat-primary {
  color: hsl(var(--primary));
}

.shard-stat-replica {
  color: hsl(var(--method-get));
}

.shard-empty {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

/* ---- Shard detail modal ---- */
.shard-modal-content {
  max-width: 680px;
  max-height: 80vh;
  overflow-y: auto;
}

.shard-modal-title {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 15px;
  padding-right: 2.5rem;
}

.shard-modal-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.shard-modal-badge {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 2px 7px;
  border-radius: 4px;
}

.badge-primary {
  background: hsl(var(--primary) / 0.15);
  color: hsl(var(--primary));
  border: 1px solid hsl(var(--primary) / 0.4);
}

.badge-replica {
  background: hsl(var(--method-get) / 0.15);
  color: hsl(var(--method-get));
  border: 1px solid hsl(var(--method-get) / 0.4);
}

.badge-unassigned {
  background: hsl(var(--destructive) / 0.15);
  color: hsl(var(--destructive));
  border: 1px solid hsl(var(--destructive) / 0.4);
}

.shard-modal-num {
  font-size: 13px;
  font-weight: 600;
  color: hsl(var(--foreground));
}

.shard-modal-node {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  font-family: monospace;
}

.shard-unassigned-alert {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 8px 12px;
  background-color: hsl(var(--destructive) / 0.1);
  border: 1px solid hsl(var(--destructive) / 0.3);
  border-radius: 6px;
}

.shard-unassigned-icon {
  color: hsl(var(--destructive));
}

.shard-unassigned-reason-text {
  font-size: 13px;
  font-weight: 500;
  color: hsl(var(--destructive));
}

.shard-explain-btn {
  padding: 2px;
  margin-left: auto;
}

.shard-loading-icon {
  color: hsl(var(--muted-foreground));
  margin-left: auto;
}

.shard-explain-popover-content {
  width: 400px;
  max-width: 400px;
  padding: 12px;
}

.shard-explain-popover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.shard-explain-popover-title {
  font-size: 12px;
  font-weight: 500;
  color: hsl(var(--foreground));
}

.shard-can-allocate-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  text-transform: uppercase;
}

.can-allocate-yes {
  background-color: hsl(var(--success) / 0.15);
  color: hsl(var(--success));
}

.can-allocate-no {
  background-color: hsl(var(--destructive) / 0.15);
  color: hsl(var(--destructive));
}

.shard-explain-popover-text {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  line-height: 1.4;
  margin-bottom: 8px;
}

.shard-explain-popover-deciders {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 200px;
  overflow-y: auto;
}

.shard-decider-node {
  padding: 8px;
  background-color: hsl(var(--muted) / 0.3);
  border-radius: 6px;
}

.shard-decider-node-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.shard-decider-node-name {
  font-size: 11px;
  font-family: monospace;
  color: hsl(var(--foreground));
}

.shard-node-errors {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  line-height: 1.4;
  margin-top: 6px;
  word-break: break-word;
}

.shard-decider-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 4px;
  border-radius: 3px;
}

.decision-yes {
  background-color: hsl(var(--success) / 0.15);
  color: hsl(var(--success));
}

.decision-no {
  background-color: hsl(var(--destructive) / 0.15);
  color: hsl(var(--destructive));
}

.shard-modal-body {
  padding-top: 12px;
}
.shard-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.shard-detail-badge {
  cursor: pointer;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>
