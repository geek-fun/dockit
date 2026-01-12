import { ElasticsearchConnection } from '../store';
import { loadHttpClient } from './fetchApi.ts';
import { CustomError, debug, jsonify, optionalToNullableInt } from '../common';
import { get } from 'lodash';

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

export enum ShardStateEnum {
  UNASSIGNED = 'UNASSIGNED',
  INITIALIZING = 'INITIALIZING',
  STARTED = 'STARTED',
  RELOCATING = 'RELOCATING',
}

export enum NodeRoleEnum {
  DATA = 'DATA',
  INGEST = 'INGEST',
  MASTER_ELIGIBLE = 'MASTER_ELIGIBLE',
  ML = 'ML',
  REMOTE_CLUSTER_CLIENT = 'REMOTE_CLUSTER_CLIENT',
  TRANSFORM = 'TRANSFORM',
  COORDINATING = 'COORDINATING',
}

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

export type ClusterNode = {
  id: string;
  ip: string;
  name: string;
  version: string;
  cpu: string;
  roles: Array<NodeRoleEnum | undefined>;
  master: boolean;
  heap: {
    percent: number | null;
    current: number | null;
    max: number | null;
  };
  ram: {
    percent: number | null;
    current: number | null;
    max: number | null;
  };
  disk: {
    percent: number | null;
    current: number | null;
    max: number | null;
  };
  shard: {
    total: number | null;
  };
  mapping: {
    total: number | null;
  };
};

export type ClusterShard = {
  index: string;
  shard: string;
  prirep: string;
  state: ShardStateEnum;
  docs: {
    count: number | null;
  };
  store: {
    size: number | null;
  };
  dataset: {
    size: number | null;
  };
  ip: string;
  id: string;
  node: string;
  completion: {
    size: number | null;
  };
  denseVector: {
    valueCount: string;
  };
  fielddata: {
    memorySize: number | null;
    evictions: number | null;
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
    total: number | null;
    totalDocs: number | null;
    totalSize: number | null;
    totalTime: string;
  };
  queryCache: {
    memorySize: number | null;
    evictions: number | null;
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
    count: number | null;
    memory: number | null;
    indexWriterMemory: number | null;
    versionMapMemory: number | null;
    fixedBitsetMemory: number | null;
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

export type ClusterIndex = {
  index: string;
  uuid: string;
  health: IndexHealth;
  status: IndexStatus;
  storage: string;
  shards: Array<ClusterShard> | undefined;
  docs: {
    count: number | null;
    deleted: number | null;
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

export type ClusterTemplate = ComponentTemplate | IndexTemplate;

interface ESApi {
  createIndex(
    connection: ElasticsearchConnection,
    options: {
      indexName: string;
      shards?: number | null;
      replicas?: number | null;
      master_timeout?: number | null;
      timeout?: number | null;
      wait_for_active_shards?: number | null;
      body?: string | null;
    },
  ): Promise<void>;

  createAlias(
    connection: ElasticsearchConnection,
    options: {
      aliasName: string;
      indexName: string;
      master_timeout: number | null;
      timeout: number | null;
      is_write_index?: boolean;
      filter: { [key: string]: unknown };
      routing: number | null;
      search_routing: number | null;
      index_routing: number | null;
    },
  ): Promise<void>;

  createTemplate(
    connection: ElasticsearchConnection,
    options: {
      name: string;
      type: string;
      create?: boolean | null;
      master_timeout: number | null;
      body: string | null;
    },
  ): Promise<void>;

  deleteIndex(connection: ElasticsearchConnection, indexName: string): Promise<void>;

  closeIndex(connection: ElasticsearchConnection, indexName: string): Promise<void>;

  openIndex(connection: ElasticsearchConnection, indexName: string): Promise<void>;

  removeAlias(
    connection: ElasticsearchConnection,
    indexName: string,
    aliasName: string,
  ): Promise<void>;

  switchAlias(
    connection: ElasticsearchConnection,
    options: {
      aliasName: string;
      sourceIndexName: string;
      targetIndexName: string;
    },
  ): Promise<void>;

  catIndices(connection: ElasticsearchConnection): Promise<Array<ClusterIndex>>;

  catAliases(connection: ElasticsearchConnection): Promise<Array<ClusterAlias>>;

  catNodes(connection: ElasticsearchConnection): Promise<Array<ClusterNode>>;

  catShards(
    connection: ElasticsearchConnection,
  ): Promise<Array<{ index: string; shards: Array<ClusterShard> }>>;

  catTemplates(connection: ElasticsearchConnection): Promise<Array<ClusterTemplate>>;
}

const esApi: ESApi = {
  createIndex: async (
    connection,
    { indexName, shards, replicas, master_timeout, timeout, wait_for_active_shards, body },
  ) => {
    const client = loadHttpClient(connection);

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

    const parsedBody = body ? jsonify.parse(body) : undefined;

    const payload =
      parsedBody || shards || replicas
        ? jsonify.stringify({
            ...parsedBody,
            settings: {
              number_of_shards: shards,
              number_of_replicas: replicas,
              ...(parsedBody?.settings || {}),
            },
          })
        : undefined;

    try {
      const response = await client.put<{
        status: number;
        error: { type: string; reason: string };
      }>(`/${indexName}`, queryParams.toString() ?? undefined, payload);

      if (response.status >= 300) {
        throw new CustomError(response.status, `${response.error.type}: ${response.error.reason}`);
      }
    } catch (err) {
      throw new CustomError(
        err instanceof CustomError ? err.status : 500,
        err instanceof CustomError ? err.details : (err as Error).message,
      );
    }
  },
  createAlias: async (
    connection,
    {
      aliasName,
      indexName,
      master_timeout,
      timeout,
      is_write_index,
      filter,
      routing,
      search_routing,
      index_routing,
    },
  ) => {
    const client = loadHttpClient(connection);

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
            ...(is_write_index !== null && is_write_index !== undefined ? { is_write_index } : {}),
            ...(filter ? { filter } : {}),
            ...(routing ? { routing: `${routing}` } : {}),
            ...(search_routing ? { search_routing: `${search_routing}` } : {}),
            ...(index_routing ? { index_routing: `${index_routing}` } : {}),
          },
        },
      ],
    };

    try {
      const response = await client.post<{
        status: number;
        error: { type: string; reason: string };
      }>(`/_aliases`, queryParams.toString() ?? undefined, jsonify.stringify(payload));

      if (response.status >= 300) {
        throw new CustomError(response.status, `${response.error.type}: ${response.error.reason}`);
      }
    } catch (err) {
      throw new CustomError(
        err instanceof CustomError ? err.status : 500,
        err instanceof CustomError ? err.details : (err as Error).message,
      );
    }
  },
  createTemplate: async (connection, { name, type, create, master_timeout, body }) => {
    const client = loadHttpClient(connection);
    const queryParams = new URLSearchParams();
    [
      { key: 'master_timeout', value: master_timeout },
      { key: 'create', value: create },
    ].forEach(param => {
      if (param.value !== null && param.value !== undefined) {
        queryParams.append(param.key, param.value.toString() + (param.key !== 'create' ? 's' : ''));
      }
    });

    try {
      const response = await client.put<{
        status: number;
        error: { type: string; reason: string };
      }>(`/${type}/${name}`, queryParams.toString(), body ?? undefined);
      if (response.status >= 300) {
        throw new CustomError(response.status, `${response.error.type}: ${response.error.reason}`);
      }
    } catch (err) {
      throw new CustomError(
        err instanceof CustomError ? err.status : 500,
        err instanceof CustomError ? err.details : (err as Error).message,
      );
    }
  },

  deleteIndex: async (connection, indexName) => {
    const client = loadHttpClient(connection);
    try {
      const response = await client.delete<{
        status: number;
        error: { type: string; reason: string };
      }>(`/${indexName}`);
      if (response.status >= 300) {
        throw new CustomError(response.status, `${response.error.type}: ${response.error.reason}`);
      }
    } catch (err) {
      throw new CustomError(
        err instanceof CustomError ? err.status : 500,
        err instanceof CustomError ? err.details : (err as Error).message,
      );
    }
  },
  closeIndex: async (connection, indexName) => {
    const client = loadHttpClient(connection);
    try {
      const response = await client.post<{
        status: number;
        error: { type: string; reason: string };
      }>(`/${indexName}/_close`);
      if (response.status >= 300) {
        throw new CustomError(response.status, `${response.error.type}: ${response.error.reason}`);
      }
    } catch (err) {
      throw new CustomError(
        err instanceof CustomError ? err.status : 500,
        err instanceof CustomError ? err.details : (err as Error).message,
      );
    }
  },
  openIndex: async (connection, indexName) => {
    const client = loadHttpClient(connection);
    try {
      const response = await client.post<{
        status: number;
        error: { type: string; reason: string };
      }>(`/${indexName}/_open`);
      if (response.status >= 300) {
        throw new CustomError(response.status, `${response.error.type}: ${response.error.reason}`);
      }
    } catch (err) {
      throw new CustomError(
        err instanceof CustomError ? err.status : 500,
        err instanceof CustomError ? err.details : (err as Error).message,
      );
    }
  },
  removeAlias: async (connection, indexName, aliasName) => {
    const client = loadHttpClient(connection);
    try {
      const response = await client.delete<{
        status: number;
        error: { type: string; reason: string };
      }>(`/${indexName}/_alias/${aliasName}`);
      if (response.status >= 300) {
        throw new CustomError(response.status, `${response.error.type}: ${response.error.reason}`);
      }
    } catch (err) {
      throw new CustomError(
        err instanceof CustomError ? err.status : 500,
        err instanceof CustomError ? err.details : (err as Error).message,
      );
    }
  },
  switchAlias: async (connection, { aliasName, sourceIndexName, targetIndexName }) => {
    const client = loadHttpClient(connection);
    const payload = {
      actions: [
        { remove: { index: sourceIndexName, alias: aliasName } },
        { add: { index: targetIndexName, alias: aliasName } },
      ],
    };
    try {
      const response = await client.post<{
        status: number;
        error: { type: string; reason: string };
      }>(`/_aliases`, undefined, jsonify.stringify(payload));
      if (response.status >= 300) {
        throw new CustomError(response.status, `${response.error.type}: ${response.error.reason}`);
      }
    } catch (err) {
      throw new CustomError(
        err instanceof CustomError ? err.status : 500,
        err instanceof CustomError ? err.details : (err as Error).message,
      );
    }
  },
  catIndices: async connection => {
    const client = loadHttpClient(connection);
    const data = (await client.get('/_cat/indices', 'format=json&s=index')) as Array<{
      [key: string]: string;
    }>;

    return data.map((index: { [key: string]: string }) => ({
      index: index.index,
      uuid: index.uuid,
      health: index.health as IndexHealth,
      status: index.status as IndexStatus,
      storage: index['store.size'],
      docs: {
        count: optionalToNullableInt(index['docs.count']),
        deleted: optionalToNullableInt(index['docs.deleted']),
      },
      shards: undefined,
    }));
  },
  catAliases: async connection => {
    const client = loadHttpClient(connection);
    const data = (await client.get('/_cat/aliases', 'format=json&s=alias')) as Array<{
      [key: string]: string;
    }>;
    return data.map((alias: { [key: string]: string }) => ({
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
  catNodes: async connection => {
    const client = loadHttpClient(connection);
    try {
      const nodes = await client.get<{
        [key: string]: unknown;
      }>(
        `/_cat/nodes`,
        'format=json&bytes=b&h=ip,id,name,heap.percent,heap.current,heap.max,ram.percent,ram.current,ram.max,node.role,master,cpu,load_1m,load_5m,load_15m,disk.used_percent,disk.used,disk.total,shard_stats.total_count,mappings.total_count,version&full_id=true',
      );

      return Object.entries(nodes)
        .map(([id, node]) => ({
          id,
          version: get(node, 'version', ''),
          ip: get(node, 'ip', ''),
          cpu: get(node, 'cpu', ''),
          name: get(node, 'name', ''),
          heap: {
            percent: optionalToNullableInt(get(node, 'heap.percent')),
            current: optionalToNullableInt(get(node, 'heap.current')),
            max: optionalToNullableInt(get(node, 'heap.max')),
          },
          ram: {
            percent: optionalToNullableInt(get(node, 'ram.percent')),
            current: optionalToNullableInt(get(node, 'ram.current')),
            max: optionalToNullableInt(get(node, 'ram.max')),
          },
          disk: {
            percent: optionalToNullableInt(get(node, 'disk.used_percent')),
            current: optionalToNullableInt(get(node, 'disk.used')),
            max: optionalToNullableInt(get(node, 'disk.total')),
          },
          shard: { total: optionalToNullableInt(get(node, 'shard_stats.total_count')) },
          mapping: { total: optionalToNullableInt(get(node, 'mappings.total_count')) },
          roles: get(node, 'node.role', '')
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
                  return undefined;
              }
            })
            .filter(Boolean),
          master: get(node, 'master') === '*',
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (err) {
      debug(`Failed to fetch nodes: ${err}`);
      throw new CustomError(
        err instanceof CustomError ? err.status : 500,
        err instanceof CustomError ? err.details : (err as Error).message,
      );
    }
  },
  catShards: async connection => {
    const client = loadHttpClient(connection);
    try {
      const data: Array<{ [key: string]: string }> = await client.get(
        `/_cat/shards`,
        'format=json&h=index,shard,prirep,state,docs,store,dataset.size,ip,id,node,completion.size,dense_vector.value_count,fielddata.memory_size,fielddata.evictions,flush.total,flush.total_time,get.current,get.time,get.total,get.exists_time,get.exists_total,get.missing_time,get.missing_total,indexing.delete_current,indexing.delete_time,indexing.delete_total,indexing.index_current,indexing.index_time,indexing.index_total,indexing.index_failed,merges.current,merges.current_docs,merges.current_size,merges.total,merges.total_docs,merges.total_size,merges.total_time,query_cache.memory_size,query_cache.evictions,recoverysource.type,refresh.total,refresh.time,search.fetch_current,search.fetch_time,search.fetch_total,search.open_contexts,search.query_current,search.query_time,search.query_total,search.scroll_current,search.scroll_time,search.scroll_total,segments.count,segments.memory,segments.index_writer_memory,segments.version_map_memory,segments.fixed_bitset_memory,seq_no.global_checkpoint,seq_no.local_checkpoint,seq_no.max,suggest.current,suggest.time,suggest.total,sync_id,unassigned.at,unassigned.details,unassigned.for,unassigned.reason&s=index:asc&bytes=b',
      );
      const indicesSet = new Set<string>();
      data.forEach(item => indicesSet.add(item.index));

      return Array.from(indicesSet).map(index => ({
        index,
        shards: data
          .filter(item => item.index === index)
          .map(
            (item: { [key: string]: string }) =>
              ({
                index: item.index,
                shard: item.shard,
                prirep: item.prirep,
                state: item.state,
                ip: item.ip,
                id: item.id,
                node: item.node,
                dataset: { size: optionalToNullableInt(get(item, 'dataset.size')) },
                completion: { size: optionalToNullableInt(get(item, 'completion.size')) },
                denseVector: { valueCount: get(item, 'dense_vector.value_count') },
                docs: { count: optionalToNullableInt(get(item, 'docs')) },
                store: { size: optionalToNullableInt(get(item, 'store')) },
                fielddata: {
                  memorySize: optionalToNullableInt(get(item, 'fielddata.memory_size')),
                  evictions: optionalToNullableInt(get(item, 'fielddata.evictions')),
                },
                flush: {
                  total: optionalToNullableInt(get(item, 'flush.total')),
                  totalTime: get(item, 'flush.total_time'),
                },
                get: {
                  current: get(item, 'get.current'),
                  time: get(item, 'get.time'),
                  total: get(item, 'get.total'),
                  existsTime: get(item, 'get.exists_time'),
                  existsTotal: get(item, 'get.exists_total'),
                  missingTime: get(item, 'get.missing_time'),
                  missingTotal: get(item, 'get.missing_total'),
                },
                indexing: {
                  deleteCurrent: get(item, 'indexing.delete_current'),
                  deleteTime: get(item, 'indexing.delete_time'),
                  deleteTotal: get(item, 'indexing.delete_total'),
                  indexCurrent: get(item, 'indexing.index_current'),
                  indexTime: get(item, 'indexing.index_time'),
                  indexTotal: get(item, 'indexing.index_total'),
                  indexFailed: get(item, 'indexing.index_failed'),
                },
                merges: {
                  current: get(item, 'merges.current'),
                  currentDocs: get(item, 'merges.current_docs'),
                  currentSize: get(item, 'merges.current_size'),
                  total: optionalToNullableInt(get(item, 'merges.total')),
                  totalDocs: optionalToNullableInt(get(item, 'merges.total_docs')),
                  totalSize: optionalToNullableInt(get(item, 'merges.total_size')),
                  totalTime: get(item, 'merges.total_time'),
                },
                queryCache: {
                  memorySize: optionalToNullableInt(get(item, 'query_cache.memory_size')),
                  evictions: optionalToNullableInt(get(item, 'query_cache.evictions')),
                },
                refresh: {
                  total: get(item, 'refresh.total'),
                  time: get(item, 'refresh.time'),
                },
                search: {
                  fetchCurrent: get(item, 'search.fetch_current'),
                  fetchTime: get(item, 'search.fetch_time'),
                  fetchTotal: get(item, 'search.fetch_total'),
                  openContexts: get(item, 'search.open_contexts'),
                  queryCurrent: get(item, 'search.query_current'),
                  queryTime: get(item, 'search.query_time'),
                  queryTotal: get(item, 'search.query_total'),
                  scrollCurrent: get(item, 'search.scroll_current'),
                  scrollTime: get(item, 'search.scroll_time'),
                  scrollTotal: get(item, 'search.scroll_total'),
                },
                segments: {
                  count: optionalToNullableInt(get(item, 'segments.count')),
                  memory: optionalToNullableInt(get(item, 'segments.memory')),
                  indexWriterMemory: optionalToNullableInt(
                    get(item, 'segments.index_writer_memory'),
                  ),
                  versionMapMemory: optionalToNullableInt(get(item, 'segments.version_map_memory')),
                  fixedBitsetMemory: optionalToNullableInt(
                    get(item, 'segments.fixed_bitset_memory'),
                  ),
                },
                seqNo: {
                  globalCheckpoint: get(item, 'seq_no.global_checkpoint'),
                  localCheckpoint: get(item, 'seq_no.local_checkpoint'),
                  max: get(item, 'seq_no.max'),
                },
                suggest: {
                  current: optionalToNullableInt(get(item, 'suggest.current')),
                  time: get(item, 'suggest.time', ''),
                  total: optionalToNullableInt(get(item, 'suggest.total')),
                },
                unassigned: {
                  at: get(item, 'unassigned.at'),
                  details: get(item, 'unassigned.details'),
                  for: get(item, 'unassigned.for'),
                  reason: get(item, 'unassigned.reason'),
                },
                recoverySource: { type: get(item, 'recoverysource.type') },
              }) as unknown as ClusterShard,
          )
          .sort(
            (a: ClusterShard, b: ClusterShard) =>
              a.node?.localeCompare(b.node) || a.prirep.localeCompare(b.prirep),
          ),
      }));
    } catch (err) {
      debug(`Failed to fetch shards: ${err}`);
      throw new CustomError(
        err instanceof CustomError ? err.status : 500,
        err instanceof CustomError ? err.details : (err as Error).message,
      );
    }
  },

  catTemplates: async connection => {
    const client = loadHttpClient(connection);
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

    return [...indexTemplates, ...componentTemplates];
  },
};

export { esApi };
