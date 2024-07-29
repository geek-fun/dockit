import { defineStore } from 'pinia';
import { pureObject } from '../common';
import { loadHttpClient, storeApi } from '../datasources';

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

export type Connection = {
  id?: number;
  name: string;
  host: string;
  port: number;
  username?: string;
  sslCertVerification: boolean;
  password?: string;
  queryParameters?: string;
  rawClusterState?: RawClusterStats;
};
export type ConnectionIndex = {
  health: string;
  status: string;
  index: string;
  uuid: string;
  docs: {
    count: number;
    deleted: number;
  };
  mapping: { [key: string]: unknown };
  store: {
    size: string;
  };
  pri: {
    store: {
      size: string;
    };
  };
};

type Established =
  | (Connection & { indices: Array<ConnectionIndex>; activeIndex?: ConnectionIndex })
  | null;

const buildPath = (index: string | undefined, path: string | undefined) => {
  return index &&
    !['_nodes', '_cluster', '_cat', '_bulk', '_aliases', '_analyze'].includes(
      path?.split('/')[0] ?? '',
    )
    ? `/${index}/${path}`
    : `/${path}`;
};

export const useConnectionStore = defineStore('connectionStore', {
  state: (): {
    connections: Connection[];
    established: Established;
  } => {
    return {
      connections: [],
      established: null,
    };
  },
  getters: {
    establishedIndexNames(state) {
      return state.established?.indices.map(({ index }) => index) ?? [];
    },
  },
  actions: {
    async fetchConnections() {
      this.connections = (await storeApi.get('connections', [])) as Connection[];
    },
    async fetchClusterState() {
      if (!this.established) return;
      const client = loadHttpClient(this.established as Connection);
      this.established.rawClusterState = (await client.get(
        '/_cluster/stats',
        'format=json',
      )) as RawClusterStats;
    },
    async testConnection(con: Connection) {
      const client = loadHttpClient(con);

      return await client.get(undefined, 'format=json');
    },
    async saveConnection(connection: Connection) {
      const index = this.connections.findIndex(({ id }: Connection) => id === connection.id);
      if (index >= 0) {
        this.connections[index] = connection;
      } else {
        this.connections.push({ ...connection, id: this.connections.length + 1 });
      }
      await storeApi.set('connections', pureObject(this.connections));
    },
    async removeConnection(connection: Connection) {
      this.connections = this.connections.filter(({ id }: Connection) => id !== connection.id);
      await storeApi.set('connections', pureObject(this.connections));
    },
    async establishConnection(connection: Connection) {
      await this.testConnection(connection);
      const client = loadHttpClient(connection);

      const data = (await client.get('/_cat/indices', 'format=json')) as Array<{
        [key: string]: string;
      }>;
      const indices = data.map((index: { [key: string]: string }) => ({
        ...index,
        docs: {
          count: parseInt(index['docs.count'], 10),
          deleted: parseInt(index['docs.deleted'], 10),
        },
        store: { size: index['store.size'] },
      })) as ConnectionIndex[];
      this.established = { ...connection, indices };
    },
    async fetchNodes() {
      if (!this.established) return;
      const client = loadHttpClient(this.established as Connection);
      try {
        const data = await client.get('/_cat/nodes', 'format=json');
        this.established.rawClusterState!.nodes.instances = data
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
      } catch (err) {
        console.error('failed to fetch nodes', err);
      }
    },
    async fetchNodeState(nodeName: string) {
      const client = loadHttpClient(this.established as Connection);
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
      if (!this.established) return;
      const client = loadHttpClient(this.established as Connection);
      try {
        const data = await client.get(
          '/_cat/shards',
          'format=json&h=ip,index,shard,node,docs,store,prirep,state,unassigned.reason&s=index:asc&bytes=b',
        );

        const filteredData = includeHidden
          ? data
          : data.filter((shard: Shard) => !shard.index.startsWith('.'));

        console.log('/_cat/shards', { data, filteredData });
        return filteredData as Shard[];
      } catch (err) {
        console.error('failed to fetch shards', err);
      }
    },
    async getShardState(indexName: string) {
      if (!this.established) return;
      const client = loadHttpClient(this.established as Connection);
      try {
        const data = await client.get(
          `/_cat/shards/${indexName}`,
          'format=json&h=index,shard,prirep,state,docs,store,dataset.size,ip,id,node,completion.size,dense_vector.value_count,fielddata.memory_size,fielddata.evictions,flush.total,flush.total_time,get.current,get.time,get.total,get.exists_time,get.exists_total,get.missing_time,get.missing_total,indexing.delete_current,indexing.delete_time,indexing.delete_total,indexing.index_current,indexing.index_time,indexing.index_total,indexing.index_failed,merges.current,merges.current_docs,merges.current_size,merges.total,merges.total_docs,merges.total_size,merges.total_time,query_cache.memory_size,query_cache.evictions,recoverysource.type,refresh.total,refresh.time,search.fetch_current,search.fetch_time,search.fetch_total,search.open_contexts,search.query_current,search.query_time,search.query_total,search.scroll_current,search.scroll_time,search.scroll_total,segments.count,segments.memory,segments.index_writer_memory,segments.version_map_memory,segments.fixed_bitset_memory,seq_no.global_checkpoint,seq_no.local_checkpoint,seq_no.max,suggest.current,suggest.time,suggest.total,sync_id,unassigned.at,unassigned.details,unassigned.for,unassigned.reason&s=index:asc&bytes=b',
        );
        console.log(`/_cat/shards/${indexName}`, { data });
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
                total: flushTotal,
                totalTime: flushTotalTime,
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
                current: suggestCurrent,
                time: suggestTime,
                total: suggestTotal,
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
      } catch (err) {
        console.error('failed to fetch shards', err);
      }
    },
    async fetchIndices() {
      if (!this.established) throw new Error('no connection established');
      const client = loadHttpClient(this.established as Connection);
      const data = (await client.get('/_cat/indices', 'format=json')) as Array<{
        [key: string]: string;
      }>;
      this.established.indices = data.map((index: { [key: string]: string }) => ({
        ...index,
        docs: {
          count: parseInt(index['docs.count'], 10),
          deleted: parseInt(index['docs.deleted'], 10),
        },
        store: { size: index['store.size'] },
      })) as ConnectionIndex[];
    },
    async selectIndex(indexName: string) {
      const client = loadHttpClient(this.established as Connection);

      // get the index mapping
      const mapping = await client.get(`/${indexName}/_mapping`, 'format=json');
      const activeIndex = this.established?.indices.find(
        ({ index }: { index: string }) => index === indexName,
      );
      this.established = {
        ...this.established,
        activeIndex: { ...activeIndex, mapping },
      } as Established;
    },
    async searchQDSL({
      method,
      path,
      index,
      qdsl,
    }: {
      method: string;
      path: string;
      index?: string;
      qdsl?: string;
    }) {
      if (!this.established) throw new Error('no connection established');
      const client = loadHttpClient(this.established);
      // refresh the index mapping
      try {
        if (index && index !== this.established.activeIndex?.index) {
          const newIndex = this.established.indices.find(
            ({ index: indexName }: ConnectionIndex) => indexName === index,
          );
          if (newIndex) {
            if (!newIndex.mapping) {
              newIndex.mapping = await client.get(`/${index}/_mapping`, 'format=json');
            }
            this.established = { ...this.established, activeIndex: newIndex };
          }
        }
      } catch (err) {
        console.error('failed to refresh index mapping', err);
      }

      const reqPath = buildPath(index, path);

      const dispatch: { [method: string]: () => Promise<unknown> } = {
        POST: async () => client.post(reqPath, undefined, qdsl),
        PUT: async () => client.put(reqPath, undefined, qdsl),
        DELETE: async () => client.delete(reqPath, undefined, qdsl),
        GET: async () =>
          qdsl ? client.post(reqPath, undefined, qdsl) : client.get(reqPath, 'format=json'),
      };
      return dispatch[method]();
    },
  },
});
