import { ElasticsearchConnection } from '../store';
import { loadHttpClient } from './fetchApi.ts';
import { CustomError, debug, jsonify } from '../common';

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

export enum NodeRoleEnum {
  DATA = 'DATA',
  INGEST = 'INGEST',
  MASTER_ELIGIBLE = 'MASTER_ELIGIBLE',
  ML = 'ML',
  REMOTE_CLUSTER_CLIENT = 'REMOTE_CLUSTER_CLIENT',
  TRANSFORM = 'TRANSFORM',
  COORDINATING = 'COORDINATING',
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

export type ClusterNode = {
  id: string;
  ip: string;
  name: string;
  version: string;
  cpu: string;
  roles: Array<NodeRoleEnum | undefined>;
  master: boolean;
  heap: {
    percent: number;
    current: number;
    max: number;
  };
  ram: {
    percent: number;
    current: number;
    max: number;
  };
  disk: {
    percent: number;
    current: number;
    max: number;
  };
  shard: {
    total: number;
  };
  mapping: {
    total: number;
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
      const response = await client.put(
        `/${indexName}`,
        queryParams.toString() ?? undefined,
        payload,
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
      const response = await client.post(
        `/_aliases`,
        queryParams.toString() ?? undefined,
        jsonify.stringify(payload),
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
      const response = await client.put(
        `/${type}/${name}`,
        queryParams.toString(),
        body ?? undefined,
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
      const response = await client.delete(`/${indexName}`);
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
      const response = await client.post(`/${indexName}/_close`);
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
      const response = await client.post(`/${indexName}/_open`);
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
      const response = await client.delete(`/${indexName}/_alias/${aliasName}`);
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
      const response = await client.post(`/_aliases`, undefined, jsonify.stringify(payload));
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
      const nodes = await client.get(
        `/_cat/nodes`,
        'format=json&bytes=b&h=ip,id,name,heap.percent,heap.current,heap.max,ram.percent,ram.current,ram.max,node.role,master,cpu,load_1m,load_5m,load_15m,disk.used_percent,disk.used,disk.total,shard_stats.total_count,mappings.total_count&full_id=true',
      );
      return Object.entries<{
        ip: string;
        name: string;
        'node.role': string;
        master: string;
        cpu: string;
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
      }>(nodes)
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
                  return undefined;
              }
            })
            .filter(Boolean),
          master: node.master === '*',
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
};

export { esApi };
