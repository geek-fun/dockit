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

export enum TemplateApiMode {
  LEGACY = 'LEGACY',
  COMPOSABLE = 'COMPOSABLE',
}

export type ClusterTemplate = {
  name: string;
  type: TemplateType;
  api_mode: TemplateApiMode;
  precedence: number | null;
  index_patterns: Array<string>;
  composed_of: Array<string>;
  version: number | null;
  alias_count: number | null;
  mapping_count: number | null;
  settings_count: number | null;
  metadata_count: number | null;
  included_in: Array<string>;
};

export type AllocationDecider = {
  decider: string;
  decision: string;
  explanation: string;
};

export type NodeAllocationDecision = {
  node_id: string;
  node_name: string;
  node_attributes: Record<string, string>;
  node_decision: string;
  weight_ranking: number | null;
  deciders: AllocationDecider[];
};

export type UnassignedInfo = {
  reason: string;
  at: string;
  last_allocation_status: string;
  details?: string;
  for?: string;
};

export type ClusterAllocationExplain = {
  index: string;
  shard: number;
  primary: boolean;
  current_state: string;
  unassigned_info?: UnassignedInfo;
  can_allocate: string;
  allocate_explanation?: string;
  node_allocation_decisions: NodeAllocationDecision[];
};

const parseVersionParts = (version: string | undefined) => {
  const parts = (version ?? '7.8').split('.').map(part => parseInt(part, 10));
  const major = parts[0];
  const minor = parts[1];

  return {
    major: Number.isNaN(major) ? 7 : major,
    minor: minor === undefined || Number.isNaN(minor) ? 8 : minor,
  };
};

const getTemplateApiMode = (connection: ElasticsearchConnection): TemplateApiMode => {
  if (connection.isOpenSearch) {
    return TemplateApiMode.COMPOSABLE;
  }

  const { major, minor } = parseVersionParts(connection.version);

  if (major < 7 || (major === 7 && minor < 8)) {
    return TemplateApiMode.LEGACY;
  }

  return TemplateApiMode.COMPOSABLE;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }

  if (typeof value === 'string') {
    return value
      .replace(/^\[/, '')
      .replace(/\]$/, '')
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
  }

  return [];
};

const countRecordKeys = (value: unknown): number | null => {
  return isRecord(value) ? Object.keys(value).length : null;
};

const toNullableInt = (value: unknown): number | null => {
  return optionalToNullableInt(
    typeof value === 'string' || typeof value === 'number' ? value : undefined,
  );
};

const normalizeComposableTemplateBody = (body: string | null) => {
  if (!body) {
    return undefined;
  }

  const parsedBody = jsonify.parse(body) as Record<string, unknown>;
  const template = isRecord(parsedBody.template) ? parsedBody.template : {};
  const { order, settings, mappings, aliases, template: _template, ...rest } = parsedBody;

  const hasExistingPriority = rest.priority !== undefined || template.priority !== undefined;
  const templateWithoutPriority = Object.fromEntries(
    Object.entries(template).filter(([key]) => key !== 'priority'),
  );

  return jsonify.stringify({
    ...rest,
    ...(order !== undefined && !hasExistingPriority ? { priority: order } : {}),
    template: {
      ...(settings !== undefined && template.settings === undefined ? { settings } : {}),
      ...(mappings !== undefined && template.mappings === undefined ? { mappings } : {}),
      ...(aliases !== undefined && template.aliases === undefined ? { aliases } : {}),
      ...templateWithoutPriority,
    },
  });
};

const normalizeLegacyTemplateBody = (body: string | null) => {
  if (!body) {
    return undefined;
  }

  const parsedBody = jsonify.parse(body) as Record<string, unknown>;
  const template = isRecord(parsedBody.template) ? parsedBody.template : {};
  const { priority, template: _template, composed_of, data_stream, ...rest } = parsedBody;

  if (Array.isArray(composed_of) && composed_of.length > 0) {
    throw new CustomError(400, 'Legacy templates do not support composed_of');
  }

  if (data_stream !== undefined) {
    throw new CustomError(400, 'Legacy templates do not support data_stream');
  }

  return jsonify.stringify({
    ...rest,
    ...template,
    ...(priority !== undefined && rest.order === undefined ? { order: priority } : {}),
  });
};

const normalizeLegacyTemplate = (
  name: string,
  template: Record<string, unknown>,
): ClusterTemplate => ({
  name,
  type: TemplateType.INDEX_TEMPLATE,
  api_mode: TemplateApiMode.LEGACY,
  precedence: toNullableInt(template.order),
  index_patterns: toStringArray(template.index_patterns),
  composed_of: [],
  version: toNullableInt(template.version),
  alias_count: countRecordKeys(template.aliases),
  mapping_count: countRecordKeys(template.mappings),
  settings_count: countRecordKeys(template.settings),
  metadata_count: countRecordKeys(template._meta),
  included_in: [],
});

const normalizeComposableIndexTemplate = (item: Record<string, unknown>): ClusterTemplate => {
  const template = isRecord(item.index_template) ? item.index_template : {};
  const templateBody = isRecord(template.template) ? template.template : {};

  return {
    name: typeof item.name === 'string' ? item.name : '',
    type: TemplateType.INDEX_TEMPLATE,
    api_mode: TemplateApiMode.COMPOSABLE,
    precedence: toNullableInt(template.priority),
    index_patterns: toStringArray(template.index_patterns),
    composed_of: toStringArray(template.composed_of),
    version: toNullableInt(template.version),
    alias_count: countRecordKeys(templateBody.aliases),
    mapping_count: countRecordKeys(templateBody.mappings),
    settings_count: countRecordKeys(templateBody.settings),
    metadata_count: countRecordKeys(template._meta),
    included_in: [],
  };
};

const normalizeComponentTemplate = (item: Record<string, unknown>): ClusterTemplate => {
  const template = isRecord(item.component_template) ? item.component_template : {};
  const templateBody = isRecord(template.template) ? template.template : {};

  return {
    name: typeof item.name === 'string' ? item.name : '',
    type: TemplateType.COMPONENT_TEMPLATE,
    api_mode: TemplateApiMode.COMPOSABLE,
    precedence: null,
    index_patterns: [],
    composed_of: [],
    version: toNullableInt(template.version),
    alias_count: countRecordKeys(templateBody.aliases),
    mapping_count: countRecordKeys(templateBody.mappings),
    settings_count: countRecordKeys(templateBody.settings),
    metadata_count: countRecordKeys(template._meta),
    included_in: [],
  };
};

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

  listTemplates(connection: ElasticsearchConnection): Promise<Array<ClusterTemplate>>;

  allocationExplain(
    connection: ElasticsearchConnection,
    options: {
      index: string;
      shard: number;
      primary: boolean;
    },
  ): Promise<ClusterAllocationExplain>;
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
    const templateApiMode = getTemplateApiMode(connection);
    const queryParams = new URLSearchParams();
    [
      { key: 'master_timeout', value: master_timeout },
      { key: 'create', value: create },
    ].forEach(param => {
      if (param.value !== null && param.value !== undefined) {
        queryParams.append(param.key, param.value.toString() + (param.key !== 'create' ? 's' : ''));
      }
    });

    if (templateApiMode === TemplateApiMode.LEGACY) {
      if (type === TemplateType.COMPONENT_TEMPLATE) {
        throw new CustomError(400, 'Component templates are not supported by this cluster');
      }

      try {
        const response = await client.put<{
          status: number;
          error: { type: string; reason: string };
        }>(`/_template/${name}`, queryParams.toString(), normalizeLegacyTemplateBody(body));
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

      return;
    }

    const esTemplatePath =
      type === TemplateType.INDEX_TEMPLATE ? '_index_template' : '_component_template';

    try {
      const response = await client.put<{
        status: number;
        error: { type: string; reason: string };
      }>(
        `/${esTemplatePath}/${name}`,
        queryParams.toString(),
        normalizeComposableTemplateBody(body),
      );
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
    const majorVersion = parseInt(connection.version?.split('.')[0] ?? '7', 10);
    const expandWildcards =
      connection.isOpenSearch || majorVersion >= 6 ? '&expand_wildcards=all' : '';
    const data = (await client.get(
      '/_cat/indices',
      `format=json&s=index${expandWildcards}`,
    )) as Array<{
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

  listTemplates: async connection => {
    const client = loadHttpClient(connection);
    const templateApiMode = getTemplateApiMode(connection);

    if (templateApiMode === TemplateApiMode.LEGACY) {
      const data = (await client.get('/_template')) as Record<string, Record<string, unknown>>;

      return Object.entries(data).map(([name, template]) =>
        normalizeLegacyTemplate(name, template),
      );
    }

    const [indexTemplatesResponse, componentTemplatesResponse] = await Promise.all([
      client.get<{ index_templates: Array<Record<string, unknown>> }>('/_index_template'),
      client.get<{ component_templates: Array<Record<string, unknown>> }>('/_component_template'),
    ]);

    return [
      ...(indexTemplatesResponse.index_templates || []).map(normalizeComposableIndexTemplate),
      ...(componentTemplatesResponse.component_templates || []).map(normalizeComponentTemplate),
    ];
  },

  allocationExplain: async (connection, { index, shard, primary }) => {
    const client = loadHttpClient(connection);
    try {
      const queryParams = new URLSearchParams();
      queryParams.append('include_yes_decisions', 'true');
      const data = await client.post<ClusterAllocationExplain>(
        `/_cluster/allocation/explain?${queryParams.toString()}`,
        undefined,
        jsonify.stringify({ index, shard, primary }),
      );
      return data;
    } catch (err) {
      debug(`Failed to get allocation explanation: ${err}`);
      throw new CustomError(
        err instanceof CustomError ? err.status : 500,
        err instanceof CustomError ? err.details : (err as Error).message,
      );
    }
  },
};

export {
  esApi,
  getTemplateApiMode,
  parseVersionParts,
  normalizeComposableTemplateBody,
  normalizeLegacyTemplateBody,
};
