<template>
  <div class="mongo-cluster-container">
    <div class="cluster-header">
      <Button size="sm" variant="outline" :disabled="loading" @click="fetchClusterStatus">
        <span class="i-carbon-renew h-4 w-4 mr-1" />
        {{ $t('manage.mongo.refreshCluster') }}
      </Button>
    </div>
    <div v-if="loading" class="metrics-grid">
      <Card v-for="i in 5" :key="i" class="metric-card">
        <CardContent class="p-4 flex flex-col gap-2">
          <div class="skeleton skeleton-label" />
          <div class="skeleton skeleton-value" />
        </CardContent>
      </Card>
    </div>
    <div v-else class="metrics-grid">
      <Card class="metric-card">
        <CardContent class="p-4 flex flex-col gap-2">
          <span class="metric-label">{{ $t('manage.mongo.server') }}</span>
          <span class="metric-value-small">{{ serverStatus?.host || '-' }}</span>
          <span class="metric-label text-xs">
            {{ $t('manage.mongo.version') }}: {{ serverStatus?.version || '-' }}
          </span>
        </CardContent>
      </Card>

      <Card class="metric-card">
        <CardContent class="p-4 flex flex-col gap-2">
          <span class="metric-label">{{ $t('manage.mongo.uptime') }}</span>
          <span class="metric-value">{{ formatUptime(serverStatus?.uptime || 0) }}</span>
        </CardContent>
      </Card>

      <Card class="metric-card">
        <CardContent class="p-4 flex flex-col gap-2">
          <span class="metric-label">{{ $t('manage.mongo.connections') }}</span>
          <span class="metric-value">
            {{ serverStatus?.connections.current || 0 }}/{{
              serverStatus?.connections.available || 0
            }}
          </span>
        </CardContent>
      </Card>

      <Card class="metric-card">
        <CardContent class="p-4 flex flex-col gap-2">
          <span class="metric-label">{{ $t('manage.mongo.network') }}</span>
          <div class="metric-info">
            <div class="metric-info-item">
              <span class="info-label">IN</span>
              <span class="info-value">{{ formatBytes(serverStatus?.network.bytes_in || 0) }}</span>
            </div>
            <div class="metric-info-item">
              <span class="info-label">OUT</span>
              <span class="info-value">
                {{ formatBytes(serverStatus?.network.bytes_out || 0) }}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card class="metric-card">
        <CardContent class="p-4 flex flex-col gap-2">
          <span class="metric-label">{{ $t('manage.mongo.memory') }}</span>
          <span class="metric-value">{{ serverStatus?.memory.resident || 0 }} MB</span>
        </CardContent>
      </Card>
    </div>

    <section v-if="replSetStatus && replSetStatus.members.length > 0" class="replica-section">
      <Card class="replica-card">
        <CardHeader>
          <div class="section-header">
            <div class="section-title">
              <span class="i-carbon-data-center h-4 w-4" />
              <span>{{ $t('manage.mongo.replicaSet') }}: {{ replSetStatus.set }}</span>
            </div>
            <span class="replica-status">
              {{ $t('manage.mongo.members') }}: {{ replSetStatus.members.length }}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div class="members-grid">
            <div v-for="member in replSetStatus.members" :key="member.name" class="member-card">
              <div class="member-header">
                <div class="member-role">
                  <TooltipProvider v-if="member.state_str === 'PRIMARY'">
                    <Tooltip>
                      <TooltipTrigger as-child>
                        <span class="i-carbon-star-filled member-role-icon primary" />
                      </TooltipTrigger>
                      <TooltipContent>{{ $t('manage.mongo.primary') }}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider v-else-if="member.state_str === 'SECONDARY'">
                    <Tooltip>
                      <TooltipTrigger as-child>
                        <span class="i-carbon-star member-role-icon secondary" />
                      </TooltipTrigger>
                      <TooltipContent>{{ $t('manage.mongo.secondary') }}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider v-else-if="member.state_str === 'ARBITER'">
                    <Tooltip>
                      <TooltipTrigger as-child>
                        <span class="i-carbon-flash member-role-icon arbiter" />
                      </TooltipTrigger>
                      <TooltipContent>{{ $t('manage.mongo.arbiter') }}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <span class="member-name">{{ member.name }}</span>
                <span
                  class="member-state"
                  :class="{ healthy: member.health === 1, unhealthy: member.health === 0 }"
                >
                  {{ member.state_str }}
                </span>
              </div>
              <div class="member-stats">
                <div class="member-stat">
                  <span class="stat-label">{{ $t('manage.mongo.uptime') }}</span>
                  <span class="stat-value">{{ formatUptime(member.uptime) }}</span>
                </div>
                <div v-if="member.lag_time != null" class="member-stat">
                  <span class="stat-label">{{ $t('manage.mongo.lag') }}</span>
                  <span class="stat-value">{{ member.lag_time }}s</span>
                </div>
                <div v-if="member.ping_ms != null" class="member-stat">
                  <span class="stat-label">{{ $t('manage.mongo.ping') }}</span>
                  <span class="stat-value">{{ member.ping_ms }}ms</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>

    <section v-if="shardCluster && shardCluster.is_sharding_enabled" class="shard-section">
      <Card class="shard-card">
        <CardHeader>
          <div class="section-header">
            <div class="section-title">
              <span class="i-carbon-network h-4 w-4" />
              <span>{{ $t('manage.mongo.shardedCluster') }}</span>
            </div>
            <span class="shard-count">
              {{ $t('manage.mongo.shards') }}: {{ shardCluster.shards.length }}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div class="shards-grid">
            <div v-for="shard in shardCluster.shards" :key="shard.id" class="shard-card-item">
              <span class="shard-id">{{ shard.id }}</span>
              <span class="shard-host">{{ shard.host }}</span>
              <span class="shard-state">{{ $t('manage.mongo.state') }}: {{ shard.state }}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useClusterManageStore } from '@/store';
import { DatabaseType, MongoDBConnection } from '@/store/connectionStore';
import {
  mongoApi,
  MongoServerStatus,
  MongoReplicaSetStatus,
  MongoShardCluster,
} from '@/datasources';

const clusterManageStore = useClusterManageStore();
const { connection } = storeToRefs(clusterManageStore);

const loading = ref(true);
const serverStatus = ref<MongoServerStatus | undefined>();
const replSetStatus = ref<MongoReplicaSetStatus | undefined>();
const shardCluster = ref<MongoShardCluster | undefined>();

const formatUptime = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400)
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.floor(bytes / 1024)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${Math.floor(bytes / (1024 * 1024))}MB`;
  return `${Math.floor(bytes / (1024 * 1024 * 1024))}GB`;
};

const fetchClusterStatus = async () => {
  if (!connection.value || connection.value.type !== DatabaseType.MONGODB) {
    loading.value = false;
    return;
  }

  loading.value = true;
  const mongoConn = connection.value as MongoDBConnection;

  try {
    const [serverResult, replResult, shardResult] = await Promise.all([
      mongoApi.serverStatus(mongoConn),
      mongoApi.replSetStatus(mongoConn),
      mongoApi.shardStatus(mongoConn),
    ]);

    if (serverResult.success && serverResult.status) {
      serverStatus.value = serverResult.status;
    }

    if (replResult.success && replResult.status) {
      replSetStatus.value = replResult.status;
    }

    if (shardResult.success && shardResult.cluster) {
      shardCluster.value = shardResult.cluster;
    }
  } catch (_err) {
    // Silently handle errors - cluster status may not be available for all MongoDB instances
  }

  loading.value = false;
};

watch(connection, fetchClusterStatus);
onMounted(fetchClusterStatus);
</script>

<style scoped>
.mongo-cluster-container {
  padding: 1rem;
}

.cluster-header {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 0.5rem;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
  margin-bottom: 1rem;
}

.metric-card {
  min-height: 80px;
}

.metric-label {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.metric-value {
  font-size: 1.25rem;
  font-weight: 600;
}

.metric-value-small {
  font-size: 1rem;
  font-weight: 500;
}

.metric-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.metric-info-item {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
}

.info-label {
  font-size: 0.625rem;
  color: var(--text-muted);
}

.info-value {
  font-size: 0.75rem;
}

.replica-section,
.shard-section {
  margin-top: 1.5rem;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
}

.replica-status,
.shard-count {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.members-grid,
.shards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0.75rem;
}

.member-card,
.shard-card-item {
  padding: 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 0.5rem;
}

.member-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.member-role {
  display: flex;
  align-items: center;
}

.member-role-icon {
  height: 1rem;
  width: 1rem;
}

.member-role-icon.primary {
  color: #fbbf24;
}

.member-role-icon.secondary {
  color: #9ca3af;
}

.member-role-icon.arbiter {
  color: #60a5fa;
}

.member-name {
  font-size: 0.875rem;
  font-weight: 500;
  flex: 1;
}

.member-state {
  font-size: 0.75rem;
  padding: 0.125rem 0.25rem;
  border-radius: 0.25rem;
}

.member-state.healthy {
  background: #dcfce7;
  color: #166534;
}

.member-state.unhealthy {
  background: #fee2e2;
  color: #991b1b;
}

.member-stats {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.member-stat {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
}

.stat-label {
  font-size: 0.625rem;
  color: var(--text-muted);
}

.stat-value {
  font-size: 0.75rem;
}

.shard-id {
  font-size: 0.875rem;
  font-weight: 500;
}

.shard-host {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.shard-state {
  font-size: 0.75rem;
}

.skeleton {
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: skeleton-loading 1.5s infinite;
}

.skeleton-label {
  height: 0.75rem;
  width: 60%;
  border-radius: 0.25rem;
}

.skeleton-value {
  height: 1.25rem;
  width: 80%;
  border-radius: 0.25rem;
}

@keyframes skeleton-loading {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
</style>
