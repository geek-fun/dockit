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
          'format=json&h=ip,index,shard,node,docs,store,prirep,state,unassigned.reason&s=index:asc',
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
