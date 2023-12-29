import { defineStore } from 'pinia';
import { CustomError, pureObject } from '../common';

export type Connection = {
  id?: number;
  name: string;
  host: string;
  port: number | string;
  username?: string;
  password?: string;
  queryParameters?: string;
};
const { storeAPI } = window;
export const useConnectionStore = defineStore('connectionStore', {
  state(): { connections: Connection[]; established: Connection | null } {
    return {
      connections: [],
      established: null,
    };
  },
  getters: {},
  actions: {
    async fetchConnections() {
      this.connections = await storeAPI.get('connections', []);
    },
    async testConnection({ host, port }: Connection) {
      try {
        const result = await fetch(`${host}:${port}`, {
          method: 'GET',
        });
        if (!result.ok) new CustomError(result.status, await result.json());
      } catch (e) {
        if (e instanceof CustomError) {
          throw new CustomError(e.status, e.details);
        }
        if (e instanceof Error) {
          throw new CustomError(500, e.message);
        }
        throw new CustomError(500, `unknown error, trace: ${JSON.stringify(e)}`);
      }
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
    establishConnection(connection: Connection) {
      this.established = connection;
    },
    async searchQDSL(index: string | undefined, qdsl: string) {
      const url = index
        ? `${this.established?.host}:${this.established?.port}/${index}/_search`
        : `${this.established?.host}:${this.established?.port}/_search?`;

      // eslint-disable-next-line no-console
      console.log(`searchQDSL_URL ${url}`);
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: qdsl,
        });
        const data = await response.json();
        if (!response.ok) throw new CustomError(response.status, data);
        return data;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.log(`searchQDSL error ${JSON.stringify({ err })}`);

        if (err instanceof CustomError) {
          throw new CustomError(err.status, err.details);
        }
        if (err instanceof Error) {
          throw new CustomError(500, err.message);
        }
        throw new CustomError(500, `unknown error, trace: ${JSON.stringify(err)}`);
      }
    },
  },
});
