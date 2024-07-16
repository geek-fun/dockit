import { defineStore } from 'pinia';
import { pureObject } from '../common';
import { loadHttpClient, storeApi } from '../datasources';

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
