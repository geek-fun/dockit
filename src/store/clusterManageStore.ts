import { defineStore } from 'pinia';
import { loadHttpClient } from '../datasources';
import { lang } from '../lang';
import { Connection, useConnectionStore } from './connectionStore.ts';
import { CustomError, optionalToNullableInt } from '../common';

export enum IndexHealth {
  GREEN = 'green',
  YELLOW = 'yellow',
  RED = 'red',
}

export enum IndexStatus {
  OPEN = 'open',
  CLOSED = 'closed',
  HIDDEN = 'hidden',
}

export type ClusterIndex = {
  index: string;
  uuid: string;
  health: IndexHealth;
  status: IndexStatus;
  storage: string;
  shards: {
    primary: number;
    replica: number;
  };
  docs: {
    count: number;
    deleted: number;
  };
};
export type ClusterAlias = {
  alias: string;
  index: string;
  filter: string;
  routing: {
    index: string;
    search: string;
  };
  isWriteIndex: boolean;
};

export enum NodeRoleEnum {
  DATA = 'DATA',
  INGEST = 'INGEST',
  MASTER_ELIGIBLE = 'MASTER_ELIGIBLE',
  ML = 'ML',
  REMOTE_CLUSTER_CLIENT = 'REMOTE_CLUSTER_CLIENT',
  TRANSFORM = 'TRANSFORM',
  COORDINATING = 'COORDINATING',
}

export enum ShardStateEnum {
  UNASSIGNED = 'UNASSIGNED',
  INITIALIZING = 'INITIALIZING',
  STARTED = 'STARTED',
  RELOCATING = 'RELOCATING',
}

export type Shard = {
  ip: string;
  index: string;
  shard: string;
  node: string;
  docs: string;
  store: string;
  prirep: string;
  state: ShardStateEnum;
  unassigned: {
    reason: string;
  };
};

export type ShardState = {
  index: string;
  shard: string;
  prirep: string;
  state: ShardStateEnum;
  docs: {
    count: number;
  };
  store: {
    size: number;
  };
  dataset: {
    size: number;
  };
  ip: string;
  id: string;
  node: string;
  completion: {
    size: number;
  };
  denseVector: {
    valueCount: string;
  };
  fielddata: {
    memorySize: number;
    evictions: number;
  };
  flush: {
    total: string;
    totalTime: string;
  };
  get: {
    current: string;
    time: string;
    total: string;
    existsTime: string;
    existsTotal: string;
    missingTime: string;
    missingTotal: string;
  };
  indexing: {
    deleteCurrent: string;
    deleteTime: string;
    deleteTotal: string;
    indexCurrent: string;
    indexTime: string;
    indexTotal: string;
    indexFailed: string;
  };
  merges: {
    current: string;
    currentDocs: string;
    currentSize: string;
    total: number;
    totalDocs: number;
    totalSize: number;
    totalTime: string;
  };
  queryCache: {
    memorySize: number;
    evictions: number;
  };
  refresh: {
    total: string;
    time: string;
  };
  search: {
    fetchCurrent: string;
    fetchTime: string;
    fetchTotal: string;
    openContexts: string;
    queryCurrent: string;
    queryTime: string;
    queryTotal: string;
    scrollCurrent: string;
    scrollTime: string;
    scrollTotal: string;
  };
  segments: {
    count: number;
    memory: number;
    indexWriterMemory: number;
    versionMapMemory: number;
    fixedBitsetMemory: number;
  };
  seqNo: {
    globalCheckpoint: string;
    localCheckpoint: string;
    max: string;
  };
  suggest: {
    current: string;
    time: string;
    total: string;
  };
  unassigned: {
    at: string;
    details: string;
    for: string;
    reason: string;
  };
};
export type SearchNode = {
  ip: string;
  name: string;
  roles: Array<string>;
  master: string;
  heap: {
    percent: string;
  };
  ram: {
    percent: string;
  };
  cpu: string;
};

export enum TemplateType {
  INDEX_TEMPLATE = 'INDEX_TEMPLATE',
  COMPONENT_TEMPLATE = 'COMPONENT_TEMPLATE',
}

type ComponentTemplate = {
  name: string;
  type: TemplateType;
  version: number | null;
  alias_count: number | null;
  mapping_count: number | null;
  settings_count: number | null;
  metadata_count: number | null;
  included_in: Array<string>;
};
type IndexTemplate = {
  name: string;
  type: TemplateType;
  index_patterns: Array<string>;
  order: number | null;
  version: number | null;
  composed_of: Array<string>;
};

export type RawClusterStats = {
  cluster_name: string;
  cluster_uuid: string;
  status: string;
  nodes: {
    count: {
      total: number;
      master: number;
      data: number;
    };
    instances: Array<SearchNode>;
    versions: Array<string>;
  };
  indices: {
    count: number;
    shards: {
      total: number;
      primaries: number;
    };
    docs: {
      count: number;
    };
    store: {
      size_in_bytes: number;
    };
  };
};

export type ClusterTemplate = ComponentTemplate | IndexTemplate;

export const useClusterManageStore = defineStore('clusterManageStore', {
  state: (): {
    cluster: RawClusterStats | null;
    nodes: Array<SearchNode>;
    shards: Array<Shard>;
    indices: Array<ClusterIndex>;
    aliases: Array<ClusterAlias>;
    templates: Array<ClusterTemplate>;
  } => ({
    cluster: null,
    nodes: [],
    shards: [],
    indices: [],
    aliases: [],
    templates: [],
  }),
  getters: {
    aliasesWithIndices(): Array<{ alias: string; indices: Array<ClusterAlias> }> {
      return Array.from(new Set(this.aliases.map(alias => alias.alias))).map(alias => ({
        alias,
        indices: this.aliases.filter(a => a.alias === alias),
      }));
    },
    indexWithAliases(): Array<ClusterIndex & { aliases: Array<ClusterAlias> }> {
      return this.indices.map(index => ({
        ...index,
        aliases: this.aliases.filter(alias => alias.index === index.index),
      }));
    },
  },
  actions: {
    async fetchCluster() {
      const { established } = useConnectionStore();
      if (!established) throw new Error(lang.global.t('connection.selectConnection'));
      const client = loadHttpClient(established as Connection);
      this.cluster = (await client.get('/_cluster/stats', 'format=json')) as RawClusterStats;
    },
    async fetchNodes() {
      const { established } = useConnectionStore();
      if (!established) throw new Error(lang.global.t('connection.selectConnection'));
      const client = loadHttpClient(established as Connection);
      try {
        const data = await client.get('/_cat/nodes', 'format=json');
        this.nodes = data
          .map(
            (node: {
              ip: string;
              name: string;
              'node.role': string;
              master: string;
              'heap.percent': string;
              'ram.percent': string;
              cpu: string;
            }) => ({
              ip: node.ip,
              name: node.name,
              roles: node['node.role']
                .split('')
                .map((char: string) => {
                  switch (char) {
                    case 'd':
                      return NodeRoleEnum.DATA;
                    case 'i':
                      return NodeRoleEnum.INGEST;
                    case 'm':
                      return NodeRoleEnum.MASTER_ELIGIBLE;
                    case 'l':
                      return NodeRoleEnum.ML;
                    case 'r':
                      return NodeRoleEnum.REMOTE_CLUSTER_CLIENT;
                    case 't':
                      return NodeRoleEnum.TRANSFORM;
                    case '-':
                      return NodeRoleEnum.COORDINATING;
                    default:
                      return '';
                  }
                })
                .filter((role: string) => role !== ''),
              master: node.master === '*',
              heap: {
                percent: node['heap.percent'],
              },
              ram: {
                percent: node['ram.percent'],
              },
              cpu: node.cpu,
            }),
          )
          .sort((a: SearchNode, b: SearchNode) => a.name.localeCompare(b.name));
      } catch (err) {}
    },
    async fetchNodeState(nodeName: string) {
      const { established } = useConnectionStore();
      if (!established) throw new Error(lang.global.t('connection.selectConnection'));
      const client = loadHttpClient(established as Connection);
      const data = await client.get(
        `/_cat/nodes`,
        'format=json&bytes=b&h=ip,id,name,heap.percent,heap.current,heap.max,ram.percent,ram.current,ram.max,node.role,master,cpu,load_1m,load_5m,load_15m,disk.used_percent,disk.used,disk.total,shard_stats.total_count,mappings.total_count&full_id=true',
      );
      return Object.entries<{
        ip: string;
        name: string;
        version: string;
        'heap.percent': string;
        'heap.current': string;
        'heap.max': string;
        'ram.percent': string;
        'ram.current': string;
        'ram.max': string;
        'disk.used_percent': string;
        'disk.used': string;
        'disk.total': string;
        'shard_stats.total_count': string;
        'mappings.total_count': string;
        cpu: string;
      }>(data)
        .map(([id, node]) => ({
          id,
          version: node.version,
          ip: node.ip,
          cpu: node.cpu,
          name: node.name,
          heap: {
            percent: parseInt(node['heap.percent']),
            current: parseInt(node['heap.current']),
            max: parseInt(node['heap.max']),
          },
          ram: {
            percent: parseInt(node['ram.percent']),
            current: parseInt(node['ram.current']),
            max: parseInt(node['ram.max']),
          },
          disk: {
            percent: parseInt(node['disk.used_percent']),
            current: parseInt(node['disk.used']),
            max: parseInt(node['disk.total']),
          },
          shard: {
            total: parseInt(node['shard_stats.total_count']),
          },
          mapping: {
            total: parseInt(node['mappings.total_count']),
          },
        }))
        .find(({ name }) => name === nodeName);
    },
    async fetchShards(includeHidden: boolean = false) {
      const { established } = useConnectionStore();
      if (!established) throw new Error(lang.global.t('connection.selectConnection'));
      const client = loadHttpClient(established as Connection);
      try {
        const data = (
          await client.get(
            '/_cat/shards',
            'format=json&h=ip,index,shard,node,docs,store,prirep,state,unassigned.reason&s=index:asc&bytes=b',
          )
        ).sort((a: { prirep: string }, b: { prirep: string }) => a.prirep.localeCompare(b.prirep));

        this.shards = includeHidden
          ? data
          : data.filter((shard: Shard) => !shard.index.startsWith('.'));
      } catch (err) {}
    },
    async getShardState(indexName: string) {
      const { established } = useConnectionStore();
      if (!established) throw new Error(lang.global.t('connection.selectConnection'));
      const client = loadHttpClient(established as Connection);
      try {
        const data = await client.get(
          `/_cat/shards/${indexName}`,
          'format=json&h=index,shard,prirep,state,docs,store,dataset.size,ip,id,node,completion.size,dense_vector.value_count,fielddata.memory_size,fielddata.evictions,flush.total,flush.total_time,get.current,get.time,get.total,get.exists_time,get.exists_total,get.missing_time,get.missing_total,indexing.delete_current,indexing.delete_time,indexing.delete_total,indexing.index_current,indexing.index_time,indexing.index_total,indexing.index_failed,merges.current,merges.current_docs,merges.current_size,merges.total,merges.total_docs,merges.total_size,merges.total_time,query_cache.memory_size,query_cache.evictions,recoverysource.type,refresh.total,refresh.time,search.fetch_current,search.fetch_time,search.fetch_total,search.open_contexts,search.query_current,search.query_time,search.query_total,search.scroll_current,search.scroll_time,search.scroll_total,segments.count,segments.memory,segments.index_writer_memory,segments.version_map_memory,segments.fixed_bitset_memory,seq_no.global_checkpoint,seq_no.local_checkpoint,seq_no.max,suggest.current,suggest.time,suggest.total,sync_id,unassigned.at,unassigned.details,unassigned.for,unassigned.reason&s=index:asc&bytes=b',
        );

        const result = data
          .map(
            ({
              'dataset.size': dataSetSize,
              'completion.size': completionSize,
              'dense_vector.value_count': denseVectorValueCount,
              'fielddata.memory_size': fielddataMemorySize,
              'fielddata.evictions': fielddataEvictions,
              'flush.total': flushTotal,
              'flush.total_time': flushTotalTime,
              'get.current': getCurrent,
              'get.time': getTime,
              'get.total': getTotal,
              'get.exists_time': getExistsTime,
              'get.exists_total': getExistsTotal,
              'get.missing_time': getMissingTime,
              'get.missing_total': getMissingTotal,
              'indexing.delete_current': indexingDeleteCurrent,
              'indexing.delete_time': indexingDeleteTime,
              'indexing.delete_total': indexingDeleteTotal,
              'indexing.index_current': indexingIndexCurrent,
              'indexing.index_time': indexingIndexTime,
              'indexing.index_total': indexingIndexTotal,
              'indexing.index_failed': indexingIndexFailed,
              'merges.current': mergesCurrent,
              'merges.current_docs': mergesCurrentDocs,
              'merges.current_size': mergesCurrentSize,
              'merges.total': mergesTotal,
              'merges.total_docs': mergesTotalDocs,
              'merges.total_size': mergesTotalSize,
              'merges.total_time': mergesTotalTime,
              'query_cache.memory_size': queryCacheMemorySize,
              'query_cache.evictions': queryCacheEvictions,
              'refresh.total': refreshTotal,
              'refresh.time': refreshTime,
              'search.fetch_current': searchFetchCurrent,
              'search.fetch_time': searchFetchTime,
              'search.fetch_total': searchFetchTotal,
              'search.open_contexts': searchOpenContexts,
              'search.query_current': searchQueryCurrent,
              'search.query_time': searchQueryTime,
              'search.query_total': searchQueryTotal,
              'search.scroll_current': searchScrollCurrent,
              'search.scroll_time': searchScrollTime,
              'search.scroll_total': searchScrollTotal,
              'segments.count': segmentsCount,
              'segments.memory': segmentsMemory,
              'segments.index_writer_memory': segmentsIndexWriterMemory,
              'segments.version_map_memory': segmentsVersionMapMemory,
              'segments.fixed_bitset_memory': segmentsFixedBitsetMemory,
              'seq_no.global_checkpoint': seqNoGlobalCheckpoint,
              'seq_no.local_checkpoint': seqNoLocalCheckpoint,
              'seq_no.max': seqNoMax,
              'suggest.current': suggestCurrent,
              'suggest.time': suggestTime,
              'suggest.total': suggestTotal,
              'unassigned.at': unassignedAt,
              'unassigned.details': unassignedDetails,
              'unassigned.for': unassignedFor,
              'unassigned.reason': unassignedReason,
              'recoverysource.type': recoverysourceType,
              ...others
            }: {
              [key: string]: string;
            }) => ({
              ...others,
              dataset: {
                size: parseInt(dataSetSize || '0'),
              },
              completion: {
                size: parseInt(completionSize || '0'),
              },
              denseVector: {
                valueCount: denseVectorValueCount,
              },
              docs: {
                count: parseInt(others.docs || '0', 10),
              },
              store: {
                size: parseInt(others.store || '0'),
              },
              fielddata: {
                memorySize: parseInt(fielddataMemorySize || '0'),
                evictions: parseInt(fielddataEvictions || '0'),
              },
              flush: {
                total: parseInt(flushTotal || '0'),
                totalTime: flushTotalTime ?? '',
              },
              get: {
                current: getCurrent,
                time: getTime,
                total: getTotal,
                existsTime: getExistsTime,
                existsTotal: getExistsTotal,
                missingTime: getMissingTime,
                missingTotal: getMissingTotal,
              },
              indexing: {
                deleteCurrent: indexingDeleteCurrent,
                deleteTime: indexingDeleteTime,
                deleteTotal: indexingDeleteTotal,
                indexCurrent: indexingIndexCurrent,
                indexTime: indexingIndexTime,
                indexTotal: indexingIndexTotal,
                indexFailed: indexingIndexFailed,
              },
              merges: {
                current: mergesCurrent,
                currentDocs: mergesCurrentDocs,
                currentSize: mergesCurrentSize,
                total: parseInt(mergesTotal || '0'),
                totalDocs: parseInt(mergesTotalDocs || '0'),
                totalSize: parseInt(mergesTotalSize || '0'),
                totalTime: mergesTotalTime,
              },
              queryCache: {
                memorySize: parseInt(queryCacheMemorySize || '0'),
                evictions: parseInt(queryCacheEvictions || '0'),
              },
              refresh: {
                total: refreshTotal,
                time: refreshTime,
              },
              search: {
                fetchCurrent: searchFetchCurrent,
                fetchTime: searchFetchTime,
                fetchTotal: searchFetchTotal,
                openContexts: searchOpenContexts,
                queryCurrent: searchQueryCurrent,
                queryTime: searchQueryTime,
                queryTotal: searchQueryTotal,
                scrollCurrent: searchScrollCurrent,
                scrollTime: searchScrollTime,
                scrollTotal: searchScrollTotal,
              },
              segments: {
                count: parseInt(segmentsCount || '0'),
                memory: parseInt(segmentsMemory || '0'),
                indexWriterMemory: parseInt(segmentsIndexWriterMemory || '0'),
                versionMapMemory: parseInt(segmentsVersionMapMemory || '0'),
                fixedBitsetMemory: parseInt(segmentsFixedBitsetMemory || '0'),
              },
              seqNo: {
                globalCheckpoint: seqNoGlobalCheckpoint,
                localCheckpoint: seqNoLocalCheckpoint,
                max: seqNoMax,
              },
              suggest: {
                current: parseInt(suggestCurrent || '0'),
                time: suggestTime ?? '',
                total: parseInt(suggestTotal || '0'),
              },
              unassigned: {
                at: unassignedAt,
                details: unassignedDetails,
                for: unassignedFor,
                reason: unassignedReason,
              },
              recoverySource: {
                type: recoverysourceType,
              },
            }),
          )
          .sort(
            (a: ShardState, b: ShardState) =>
              a.node?.localeCompare(b.node) || a.prirep.localeCompare(b.prirep),
          );
        return { index: indexName, shards: result };
      } catch (err) {}
    },
    async fetchIndices() {
      const { established } = useConnectionStore();
      if (!established) throw new Error(lang.global.t('connection.selectConnection'));
      const client = loadHttpClient(established);
      const data = (await client.get('/_cat/indices', 'format=json&s=index')) as Array<{
        [key: string]: string;
      }>;

      this.indices = data.map((index: { [key: string]: string }) => ({
        index: index.index,
        uuid: index.uuid,
        health: index.health as IndexHealth,
        status: index.status as IndexStatus,
        storage: index['store.size'],
        shards: {
          primary: parseInt(index['pri'], 10),
          replica: parseInt(index['rep'], 10),
        },
        docs: {
          count: parseInt(index['docs.count'] || '0', 10),
          deleted: parseInt(index['docs.deleted'], 10),
        },
      }));
    },
    async fetchAliases() {
      const { established } = useConnectionStore();
      if (!established) throw new Error(lang.global.t('connection.selectConnection'));
      const client = loadHttpClient(established);
      const data = (await client.get('/_cat/aliases', 'format=json&s=alias')) as Array<{
        [key: string]: string;
      }>;
      this.aliases = data.map((alias: { [key: string]: string }) => ({
        alias: alias.alias,
        index: alias.index,
        filter: alias.filter,
        routing: {
          index: alias['routing.index'],
          search: alias['routing.search'],
        },
        isWriteIndex: alias['is_write_index'] === 'true',
      }));
    },
    async fetchTemplates() {
      const { established } = useConnectionStore();
      if (!established) throw new Error(lang.global.t('connection.selectConnection'));
      const client = loadHttpClient(established);
      const fetchIndexTemplates = async () => {
        const data = (await client.get('/_cat/templates', 'format=json')) as Array<{
          [key: string]: string;
        }>;
        return data.map((template: { [key: string]: string }) => ({
          name: template.name,
          type: TemplateType.INDEX_TEMPLATE,
          order: optionalToNullableInt(template.order),
          version: optionalToNullableInt(template.version),
          index_patterns: template.index_patterns.slice(1, -1).split(',').filter(Boolean),
          composed_of: template.composed_of.slice(1, -1).split(',').filter(Boolean),
        }));
      };
      const fetchComponentTemplates = async () => {
        const data = (await client.get('/_cat/component_templates', 'format=json')) as Array<{
          [key: string]: string;
        }>;

        return data.map((template: { [key: string]: string }) => ({
          name: template.name,
          type: TemplateType.COMPONENT_TEMPLATE,
          version: optionalToNullableInt(template.version),
          alias_count: optionalToNullableInt(template.alias_count),
          mapping_count: optionalToNullableInt(template.mapping_count),
          settings_count: optionalToNullableInt(template.settings_count),
          metadata_count: optionalToNullableInt(template.metadata_count),
          included_in: template.included_in.slice(1, -1).split(',').filter(Boolean),
        }));
      };

      const [indexTemplates, componentTemplates] = await Promise.all([
        fetchIndexTemplates(),
        fetchComponentTemplates(),
      ]);

      this.templates = [...indexTemplates, ...componentTemplates];
    },
    async createIndex({
      indexName,
      shards,
      replicas,
      master_timeout,
      timeout,
      wait_for_active_shards,
      body,
    }: {
      indexName: string;
      shards?: number | null;
      replicas?: number | null;
      master_timeout?: number | null;
      timeout?: number | null;
      wait_for_active_shards?: number | null;
      body?: string | null;
    }) {
      const { established } = useConnectionStore();
      if (!established) throw new Error(lang.global.t('connection.selectConnection'));
      const client = loadHttpClient(established);

      const queryParams = new URLSearchParams();
      [
        { key: 'master_timeout', value: master_timeout },
        { key: 'wait_for_active_shards', value: wait_for_active_shards },
        { key: 'timeout', value: timeout },
      ].forEach(param => {
        if (param.value !== null && param.value !== undefined) {
          queryParams.append(
            param.key,
            param.value.toString() + (param.key !== 'wait_for_active_shards' ? 's' : ''),
          );
        }
      });

      const parsedBody = body ? JSON.parse(body) : undefined;

      const payload =
        parsedBody || shards || replicas
          ? JSON.stringify({
              ...parsedBody,
              settings: {
                number_of_shards: shards,
                number_of_replicas: replicas,
                ...(parsedBody?.settings || {}),
              },
            })
          : undefined;

      try {
        const response = await client.put(
          `/${indexName}`,
          queryParams.toString() ?? undefined,
          payload,
        );

        if (response.status >= 300) {
          throw new CustomError(
            response.status,
            `${response.error.type}: ${response.error.reason}`,
          );
        }
      } catch (err) {
        throw new CustomError(
          err instanceof CustomError ? err.status : 500,
          err instanceof CustomError ? err.details : (err as Error).message,
        );
      }
    },
    async createAlias({
      aliasName,
      indexName,
      master_timeout,
      timeout,
      is_write_index,
      filter,
      routing,
      search_routing,
      index_routing,
    }: {
      aliasName: string;
      indexName: string;
      master_timeout: number | null;
      timeout: number | null;
      is_write_index?: boolean;
      filter: { [key: string]: unknown };
      routing: number | null;
      search_routing: number | null;
      index_routing: number | null;
    }) {
      const { established } = useConnectionStore();
      if (!established) throw new Error(lang.global.t('connection.selectConnection'));
      const client = loadHttpClient(established);

      const queryParams = new URLSearchParams();
      [
        { key: 'master_timeout', value: master_timeout },
        { key: 'timeout', value: timeout },
      ].forEach(param => {
        if (param.value !== null && param.value !== undefined) {
          queryParams.append(param.key, param.value.toString() + 's');
        }
      });
      const payload = {
        actions: [
          {
            add: {
              index: indexName,
              alias: aliasName,
              ...(is_write_index !== null && is_write_index !== undefined
                ? { is_write_index }
                : {}),
              ...(filter ? { filter } : {}),
              ...(routing ? { routing: `${routing}` } : {}),
              ...(search_routing ? { search_routing: `${search_routing}` } : {}),
              ...(index_routing ? { index_routing: `${index_routing}` } : {}),
            },
          },
        ],
      };

      try {
        const response = await client.post(
          `/_aliases`,
          queryParams.toString() ?? undefined,
          JSON.stringify(payload),
        );

        if (response.status >= 300) {
          throw new CustomError(
            response.status,
            `${response.error.type}: ${response.error.reason}`,
          );
        }
      } catch (err) {
        throw new CustomError(
          err instanceof CustomError ? err.status : 500,
          err instanceof CustomError ? err.details : (err as Error).message,
        );
      }
      // refresh data
      Promise.all([this.fetchIndices(), this.fetchAliases()]).catch();
    },
    async createTemplate({
      name,
      type,
      create,
      master_timeout,
      body,
    }: {
      name: string;
      type: string;
      create?: boolean | null;
      master_timeout: number | null;
      body: string | null;
    }) {
      const { established } = useConnectionStore();
      if (!established) throw new Error(lang.global.t('connection.selectConnection'));
      const client = loadHttpClient(established);
      const queryParams = new URLSearchParams();
      [
        { key: 'master_timeout', value: master_timeout },
        { key: 'create', value: create },
      ].forEach(param => {
        if (param.value !== null && param.value !== undefined) {
          queryParams.append(
            param.key,
            param.value.toString() + (param.key !== 'create' ? 's' : ''),
          );
        }
      });

      try {
        const response = await client.put(
          `/${type}/${name}`,
          queryParams.toString(),
          body ?? undefined,
        );
        if (response.status >= 300) {
          throw new CustomError(
            response.status,
            `${response.error.type}: ${response.error.reason}`,
          );
        }
      } catch (err) {
        throw new CustomError(
          err instanceof CustomError ? err.status : 500,
          err instanceof CustomError ? err.details : (err as Error).message,
        );
      }
    },

    async deleteIndex(indexName: string) {
      // delete index
      const { established } = useConnectionStore();
      if (!established) throw new Error(lang.global.t('connection.selectConnection'));
      const client = loadHttpClient(established);
      try {
        const response = await client.delete(`/${indexName}`);
        if (response.status >= 300) {
          throw new CustomError(
            response.status,
            `${response.error.type}: ${response.error.reason}`,
          );
        }
      } catch (err) {
        throw new CustomError(
          err instanceof CustomError ? err.status : 500,
          err instanceof CustomError ? err.details : (err as Error).message,
        );
      }
    },
    async closeIndex(indexName: string) {
      const { established } = useConnectionStore();
      if (!established) throw new Error(lang.global.t('connection.selectConnection'));
      const client = loadHttpClient(established);
      try {
        const response = await client.post(`/${indexName}/_close`);
        if (response.status >= 300) {
          throw new CustomError(
            response.status,
            `${response.error.type}: ${response.error.reason}`,
          );
        }
      } catch (err) {
        throw new CustomError(
          err instanceof CustomError ? err.status : 500,
          err instanceof CustomError ? err.details : (err as Error).message,
        );
      }
    },
    async openIndex(indexName: string) {
      const { established } = useConnectionStore();
      if (!established) throw new Error(lang.global.t('connection.selectConnection'));
      const client = loadHttpClient(established);
      try {
        const response = await client.post(`/${indexName}/_open`);
        if (response.status >= 300) {
          throw new CustomError(
            response.status,
            `${response.error.type}: ${response.error.reason}`,
          );
        }
      } catch (err) {
        throw new CustomError(
          err instanceof CustomError ? err.status : 500,
          err instanceof CustomError ? err.details : (err as Error).message,
        );
      }
    },
    async removeAlias(indexName: string, aliasName: string) {
      const { established } = useConnectionStore();
      if (!established) throw new Error(lang.global.t('connection.selectConnection'));
      const client = loadHttpClient(established);
      try {
        const response = await client.delete(`/${indexName}/_alias/${aliasName}`);
        if (response.status >= 300) {
          throw new CustomError(
            response.status,
            `${response.error.type}: ${response.error.reason}`,
          );
        }
      } catch (err) {
        throw new CustomError(
          err instanceof CustomError ? err.status : 500,
          err instanceof CustomError ? err.details : (err as Error).message,
        );
      }
    },
    async switchAlias(aliasName: string, sourceIndexName: string, targetIndexName: string) {
      const { established } = useConnectionStore();
      if (!established) throw new Error(lang.global.t('connection.selectConnection'));
      const client = loadHttpClient(established);
      const payload = {
        actions: [
          {
            remove: {
              index: sourceIndexName,
              alias: aliasName,
            },
          },
          {
            add: {
              index: targetIndexName,
              alias: aliasName,
            },
          },
        ],
      };
      try {
        const response = await client.post(`/_aliases`, undefined, JSON.stringify(payload));
        if (response.status >= 300) {
          throw new CustomError(
            response.status,
            `${response.error.type}: ${response.error.reason}`,
          );
        }
      } catch (err) {
        throw new CustomError(
          err instanceof CustomError ? err.status : 500,
          err instanceof CustomError ? err.details : (err as Error).message,
        );
      }
    },
  },
});
