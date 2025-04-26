import { defineStore } from 'pinia';
import { ClusterAlias, ClusterIndex, ClusterNode, esApi, loadHttpClient } from '../datasources';
import { lang } from '../lang';
import { Connection, DatabaseType } from './connectionStore.ts';
import { CustomError, debug, optionalToNullableInt } from '../common';

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
    instances: Array<ClusterNode>;
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
    connection: Connection | undefined;
    cluster: RawClusterStats | undefined;
    nodes: Array<ClusterNode>;
    shards: Array<Shard>;
    indices: Array<ClusterIndex>;
    aliases: Array<ClusterAlias>;
    templates: Array<ClusterTemplate>;
    hideSystemIndices: boolean;
  } => ({
    connection: undefined,
    cluster: undefined,
    nodes: [],
    shards: [],
    indices: [],
    aliases: [],
    templates: [],
    hideSystemIndices: true,
  }),
  persist: {
    pick: ['showSystemIndices'],
    storage: localStorage,
  },
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
    nodesWithShards(): Array<{ [key: string]: Shard[] | string }> {
      return Array.from(new Set(this.shards?.map(shard => shard.index))).map(index => ({
        index,
        unassigned: this.shards?.filter(shard => !shard.node && shard.index === index),
        ...this.nodes.reduce(
          (acc, node) => ({
            ...acc,
            [node.name]: this.shards?.filter(shard => shard.node && shard.index === index),
          }),
          {},
        ),
      }));
    },
  },
  actions: {
    setConnection(connection: Connection) {
      this.connection = connection;
    },
    async fetchCluster() {
      if (!this.connection) throw new Error(lang.global.t('connection.selectConnection'));
      if (this.connection.type === DatabaseType.ELASTICSEARCH) {
        const client = loadHttpClient(this.connection);
        this.cluster = (await client.get('/_cluster/stats', 'format=json')) as RawClusterStats;
      }
    },
    async fetchNodes() {
      if (!this.connection) throw new Error(lang.global.t('connection.selectConnection'));
      if (this.connection.type === DatabaseType.ELASTICSEARCH) {
        this.nodes = await esApi.catNodes(this.connection);
      } else {
        this.nodes = [];
      }
    },
    async fetchShards() {
      if (!this.connection) throw new Error(lang.global.t('connection.selectConnection'));
      if (this.connection.type === DatabaseType.ELASTICSEARCH) {
        const client = loadHttpClient(this.connection);
        try {
          const data = (
            await client.get(
              '/_cat/shards',
              'format=json&h=ip,index,shard,node,docs,store,prirep,state,unassigned.reason&s=index:asc&bytes=b',
            )
          ).sort((a: { prirep: string }, b: { prirep: string }) =>
            a.prirep.localeCompare(b.prirep),
          );

          this.shards = this.hideSystemIndices
            ? data.filter((shard: Shard) => !shard.index.startsWith('.'))
            : data;
        } catch (err) {
          debug(`Failed to fetch shards: ${err}`);
          throw new CustomError(
            err instanceof CustomError ? err.status : 500,
            err instanceof CustomError ? err.details : (err as Error).message,
          );
        }
      } else {
        this.shards = [];
      }
    },
    async getShardState(indexName: string) {
      if (!this.connection) throw new Error(lang.global.t('connection.selectConnection'));
      if (this.connection.type === DatabaseType.ELASTICSEARCH) {
        const client = loadHttpClient(this.connection);
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
      }
    },
    async fetchIndices() {
      if (!this.connection) throw new Error(lang.global.t('connection.selectConnection'));
      if (this.connection.type === DatabaseType.ELASTICSEARCH) {
        const indices = await esApi.catIndices(this.connection);

        this.indices = indices.filter(index =>
          this.hideSystemIndices ? !index.index.startsWith('.') : true,
        );
      } else {
        this.indices = [];
      }
    },
    async fetchAliases() {
      if (!this.connection) throw new Error(lang.global.t('connection.selectConnection'));
      if (this.connection.type === DatabaseType.ELASTICSEARCH) {
        const aliases = await esApi.catAliases(this.connection);

        this.aliases = aliases.filter(alias =>
          this.hideSystemIndices ? !alias.index.startsWith('.') : true,
        );
      } else {
        this.aliases = [];
      }
    },
    async fetchTemplates() {
      if (!this.connection) throw new Error(lang.global.t('connection.selectConnection'));
      if (this.connection.type === DatabaseType.ELASTICSEARCH) {
        const client = loadHttpClient(this.connection);
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
          const data = (await client.get('/_component_template', 'format=json')) as {
            component_templates: Array<{
              [key: string]: string;
            }>;
          };

          return data?.component_templates.map((template: { [key: string]: string }) => ({
            name: template.name,
            type: TemplateType.COMPONENT_TEMPLATE,
            version: optionalToNullableInt(template.version),
            alias_count: optionalToNullableInt(template.alias_count),
            mapping_count: optionalToNullableInt(template.mapping_count),
            settings_count: optionalToNullableInt(template.settings_count),
            metadata_count: optionalToNullableInt(template.metadata_count),
            included_in: template.included_in?.slice(1, -1).split(',').filter(Boolean),
          }));
        };

        const [indexTemplates, componentTemplates] = await Promise.all([
          fetchIndexTemplates(),
          fetchComponentTemplates(),
        ]);

        this.templates = [...indexTemplates, ...componentTemplates];
      } else {
        this.templates = [];
      }
    },
    async createIndex(options: {
      indexName: string;
      shards?: number | null;
      replicas?: number | null;
      master_timeout?: number | null;
      timeout?: number | null;
      wait_for_active_shards?: number | null;
      body?: string | null;
    }) {
      if (!this.connection) throw new Error(lang.global.t('connection.selectConnection'));
      if (this.connection.type === DatabaseType.ELASTICSEARCH) {
        await esApi.createIndex(this.connection, options);
      }
      return undefined;
    },
    async createAlias(options: {
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
      if (!this.connection) throw new Error(lang.global.t('connection.selectConnection'));
      if (this.connection.type === DatabaseType.ELASTICSEARCH) {
        await esApi.createAlias(this.connection, options);
        // refresh data
        Promise.all([this.fetchIndices(), this.fetchAliases()]).catch();
      }
      return undefined;
    },
    async createTemplate(options: {
      name: string;
      type: string;
      create?: boolean | null;
      master_timeout: number | null;
      body: string | null;
    }) {
      if (!this.connection) throw new Error(lang.global.t('connection.selectConnection'));
      if (this.connection.type === DatabaseType.ELASTICSEARCH) {
        await esApi.createTemplate(this.connection, options);
      }
      return undefined;
    },

    async deleteIndex(indexName: string) {
      // delete index
      if (!this.connection) throw new Error(lang.global.t('connection.selectConnection'));
      if (this.connection.type === DatabaseType.ELASTICSEARCH) {
        await esApi.deleteIndex(this.connection, indexName);
      }
      return undefined;
    },
    async closeIndex(indexName: string) {
      if (!this.connection) throw new Error(lang.global.t('connection.selectConnection'));
      if (this.connection.type === DatabaseType.ELASTICSEARCH) {
        await esApi.closeIndex(this.connection, indexName);
      }
      return undefined;
    },
    async openIndex(indexName: string) {
      if (!this.connection) throw new Error(lang.global.t('connection.selectConnection'));
      if (this.connection.type === DatabaseType.ELASTICSEARCH) {
        await esApi.openIndex(this.connection, indexName);
      }
      return undefined;
    },
    async removeAlias(indexName: string, aliasName: string) {
      if (!this.connection) throw new Error(lang.global.t('connection.selectConnection'));
      if (this.connection.type === DatabaseType.ELASTICSEARCH) {
        await esApi.removeAlias(this.connection, indexName, aliasName);
      }
      return undefined;
    },
    async switchAlias(aliasName: string, sourceIndexName: string, targetIndexName: string) {
      if (!this.connection) throw new Error(lang.global.t('connection.selectConnection'));
      if (this.connection.type === DatabaseType.ELASTICSEARCH) {
        await esApi.switchAlias(this.connection, { aliasName, sourceIndexName, targetIndexName });
      }
      return undefined;
    },
  },
});
