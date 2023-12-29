import { defineStore } from 'pinia';
import { pureObject } from '../common';
import { loadHttpClient } from '../common/httpClient';

export type Connection = {
  id?: number;
  name: string;
  host: string;
  port: number | string;
  username?: string;
  password?: string;
  queryParameters?: string;
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
  store: {
    size: string;
  };
  pri: {
    store: {
      size: string;
    };
  };
};

const { storeAPI } = window;

export const useConnectionStore = defineStore('connectionStore', {
  state(): {
    connections: Connection[];
    established:
      | (Connection & { indices: Array<ConnectionIndex>; activeIndex: ConnectionIndex })
      | null;
  } {
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
      this.connections = await storeAPI.get('connections', []);
    },
    async testConnection({ host, port }: Connection) {
      const client = loadHttpClient(host, parseInt(`${port}`, 10));
      return await client.get();
    },
    saveConnection(connection: Connection) {
      const index = this.connections.findIndex(item => item.id === connection.id);
      if (index >= 0) {
        this.connections[index] = connection;
      } else {
        this.connections.push({ ...connection, id: this.connections.length + 1 });
      }
      storeAPI.set('connections', pureObject(this.connections));
    },
    removeConnection(connection: Connection) {
      this.connections = this.connections.filter(item => item.id !== connection.id);
      storeAPI.set('connections', pureObject(this.connections));
    },
    async establishConnection(connection: Connection) {
      await this.testConnection(connection);
      const client = loadHttpClient(connection?.host, parseInt(`${connection?.port}`, 10));

      const data = await client.get('/_cat/indices', 'format=json');
      const indices = data.map(index => ({
        ...index,
        docs: {
          count: parseInt(index['docs.count'], 10),
          deleted: parseInt(index['docs.deleted'], 10),
        },
        store: { size: index['store.size'] },
      }));
      this.established = { ...connection, indices };
    },
    selectIndex(indexName: string) {
      this.established = {
        ...this.established,
        activeIndex: this.established.indices.find(({ index }) => index === indexName),
      };
    },
    async searchQDSL(index: string | undefined, qdsl: string) {
      const client = loadHttpClient(this.established?.host, this.established?.port);

      return client.post(index ? `/${index}/_search` : '/_search', undefined, JSON.parse(qdsl));
    },
  },
});
