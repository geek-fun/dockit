import { defineStore } from 'pinia';
import { pureObject } from '../common';
import { loadHttpClient, storeApi } from '../datasources';

export type RawClusterState = {
  cluster_name: string;
  cluster_uuid: string;
  version: number;
  state_uuid: string;
  master_node: string;
  nodes: {
    [nodeId: string]: {
      name: string;
      ephemeral_id: string;
      transport_address: string;
      external_id: string;
      attributes: {
        zone_id: string;
        'ml.allocated_processors_double': string;
        'ml.allocated_processors': string;
        zone: string;
        'ml.machine_memory': string;
        'xpack.installed': string;
        'ml.max_jvm_size': string;
      };
      roles: Array<string>;
      version: string;
    };
  };
  transport_versions: Array<{ node_id: string; transport_version: string }>;
  metadata: {
    cluster_uuid: string;
    cluster_uuid_committed: boolean;
    cluster_coordination: {
      term: number;
      last_committed_config: Array<string>;
      last_accepted_config: Array<string>;
      voting_config_exclusions: Array<string>;
    };
    templates: {
      [key: string]: unknown;
    };
    indices: {
      [key: string]: unknown;
    };
    ingest: {
      [key: string]: unknown;
    };
    data_stream: {
      [key: string]: unknown;
    };
    component_template: {
      [key: string]: unknown;
    };
    index_template: {
      [key: string]: unknown;
    };
    repositories: {
      [key: string]: unknown;
    };
    'index-graveyard': {
      [key: string]: unknown;
    };
    persistent_tasks: {
      [key: string]: unknown;
    };
    index_lifecycle: {
      [key: string]: unknown;
    };
    reserved_state: {
      [key: string]: unknown;
    };
  };
  routing_table: {
    indices: {
      [key: string]: {
        shards: {
          [key: string]: Array<{
            state: string;
            primary: boolean;
            node: string;
            relocating_node: string;
            shard: number;
            index: string;
            allocation_id: {
              id: string;
            };
            recovery_source: {
              type: string;
              index: {
                uuid: string;
                name: string;
              };
              node: {
                id: string;
              };
              restore_source: {
                repository: string;
                snapshot: string;
              };
            };
            unassigned_info: {
              reason: string;
            };
            allocation: {
              id: {
                id: string;
              };
            };
          }>;
        };
      };
    };
  };
  routing_nodes: {
    unassigned: Array<{
      state: string;
      primary: boolean;
      node: string;
      relocating_node: string;
      shard: number;
      index: string;
      allocation_id: {
        id: string;
      };
      recovery_source: {
        type: string;
        index: {
          uuid: string;
          name: string;
        };
        node: {
          id: string;
        };
        restore_source: {
          repository: string;
          snapshot: string;
        };
      };
      unassigned_info: {
        reason: string;
      };
      allocation: {
        id: {
          id: string;
        };
      };
    }>;
    nodes: {
      [key: string]: {
        node: string;
        shards: {
          [key: string]: Array<{
            state: string;
            primary: boolean;
            node: string;
            relocating_node: string;
            shard: number;
            index: string;
            allocation_id: {
              id: string;
            };
            recovery_source: {
              type: string;
              index: {
                uuid: string;
                name: string;
              };
              node: {
                id: string;
              };
              restore_source: {
                repository: string;
                snapshot: string;
              };
            };
            unassigned_info: {
              reason: string;
            };
            allocation: {
              id: {
                id: string;
              };
            };
          }>;
        };
      };
    };
  };
  snapshots: {
    [key: string]: unknown;
  };
  health: {
    disk: {
      high_watermark: string;
      high_max_headroom: string;
      flood_stage_watermark: string;
      flood_stage_max_headroom: string;
      frozen_flood_stage_watermark: string;
      frozen_flood_stage_max_headroom: string;
    };
    shard_limits: {
      max_shards_per_node: number;
      max_shards_per_node_frozen: number;
    };
  };
  snapshot_deletions: {
    snapshot_deletions: Array<string>;
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
  rawClusterState?: RawClusterState;
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
        '/_cluster/state',
        'format=json',
      )) as RawClusterState;
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
