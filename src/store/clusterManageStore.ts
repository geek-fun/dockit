import { defineStore } from 'pinia';
import { loadHttpClient } from '../datasources';
import { lang } from '../lang';
import { useConnectionStore } from './connectionStore.ts';

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

export const useClusterManageStore = defineStore('clusterManageStore', {
  state: (): { indices: Array<ClusterIndex>; aliases: Array<ClusterAlias> } => ({
    indices: [],
    aliases: [],
  }),
  getters: {
    aliasesWithIndices(): Array<ClusterAlias | { indices: Array<ClusterAlias> }> {
      return Array.from(new Set(this.aliases.map(alias => alias.alias))).map(alias => ({
        alias,
        indices: this.aliases.filter(a => a.alias === alias),
      }));
    },
    indexWithAliases(): Array<ClusterIndex | { aliases: Array<ClusterAlias> }> {
      return this.indices.map(index => ({
        ...index,
        aliases: this.aliases.filter(alias => alias.index === index.index),
      }));
    },
  },
  actions: {
    async fetchIndices() {
      const { established } = useConnectionStore();
      if (!established) throw new Error(lang.global.t('connection.selectConnection'));
      const client = loadHttpClient(established);
      const data = (await client.get('/_cat/indices', 'format=json')) as Array<{
        [key: string]: string;
      }>;

      this.indices = data.map((index: { [key: string]: string }) => ({
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
    async fetchAliases() {
      const { established } = useConnectionStore();
      if (!established) throw new Error(lang.global.t('connection.selectConnection'));
      const client = loadHttpClient(established);
      const data = (await client.get('/_cat/aliases', 'format=json')) as Array<{
        [key: string]: string;
      }>;
      console.log(data);
      this.aliases = data.map((alias: { [key: string]: string }) => ({
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
  },
});
