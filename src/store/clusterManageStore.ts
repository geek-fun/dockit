import { defineStore } from 'pinia';
import {
  ClusterAlias,
  ClusterIndex,
  ClusterNode,
  ClusterShard,
  ClusterTemplate,
  esApi,
  loadHttpClient,
} from '../datasources';
import { lang } from '../lang';
import { Connection, DatabaseType } from './connectionStore.ts';
import { CustomError, debug } from '../common';

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
    instances: Array<ClusterNode>;
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

export const useClusterManageStore = defineStore('clusterManageStore', {
  state: (): {
    connection: Connection | undefined;
    cluster: RawClusterStats | undefined;
    nodes: Array<ClusterNode>;
    shards: Array<ClusterShard>;
    indices: Array<ClusterIndex>;
    aliases: Array<ClusterAlias>;
    templates: Array<ClusterTemplate>;
    hideSystemIndices: boolean;
  } => ({
    connection: undefined,
    cluster: undefined,
    nodes: [],
    shards: [],
    indices: [],
    aliases: [],
    templates: [],
    hideSystemIndices: true,
  }),
  persist: {
    pick: ['hideSystemIndices'],
    storage: localStorage,
  },
  getters: {
    aliasesWithIndices(): Array<{ alias: string; indices: Array<ClusterAlias> }> {
      return Array.from(new Set(this.aliases.map(alias => alias.alias))).map(alias => ({
        alias,
        indices: this.aliases.filter(a => a.alias === alias),
      }));
    },
    indexWithAliases(): Array<ClusterIndex & { aliases: Array<ClusterAlias> }> {
      return this.indices.map(index => ({
        ...index,
        aliases: this.aliases.filter(alias => alias.index === index.index),
      }));
    },
    nodesWithShards(): Array<{ [key: string]: Array<ClusterShard> | string }> {
      return Array.from(new Set(this.shards?.map(shard => shard.index))).map(index => ({
        index,
        unassigned: this.shards?.filter(shard => !shard.node && shard.index === index),
        ...this.nodes.reduce(
          (acc, node) => ({
            ...acc,
            [node.name]: this.shards?.filter(shard => shard.node && shard.index === index),
          }),
          {},
        ),
      }));
    },
  },
  actions: {
    setConnection(connection: Connection) {
      this.connection = connection;
    },
    async refreshStates(hide?: boolean) {
      if (hide !== undefined && hide !== null) {
        this.hideSystemIndices = hide;
      }

      try {
        await this.fetchCluster();
        await this.fetchIndices();
        await this.fetchAliases();
        await this.fetchNodes();
        await this.fetchShards();
        await this.fetchTemplates();
      } catch (err) {
        debug(`Error in refreshStates: ${err}`);
      }
    },
    async fetchCluster() {
      if (!this.connection) throw new Error(lang.global.t('connection.selectConnection'));
      if (this.connection.type === DatabaseType.ELASTICSEARCH) {
        const client = loadHttpClient(this.connection);
        this.cluster = (await client.get('/_cluster/stats', 'format=json')) as RawClusterStats;
      }
    },
    async fetchNodes() {
      if (!this.connection) throw new Error(lang.global.t('connection.selectConnection'));
      if (this.connection.type === DatabaseType.ELASTICSEARCH) {
        this.nodes = await esApi.catNodes(this.connection);
      } else {
        this.nodes = [];
      }
    },
    async fetchShards() {
      if (!this.connection) throw new Error(lang.global.t('connection.selectConnection'));
      if (this.connection.type === DatabaseType.ELASTICSEARCH) {
        try {
          const indicesShards = await esApi.catShards(this.connection);

          indicesShards.forEach(indexShard => {
            const target = this.indices.find(({ index }) => index === indexShard.index);
            if (target) {
              target.shards = indexShard.shards;
            }
          });
        } catch (err) {
          debug(`Failed to fetch shards: ${err}`);
          throw new CustomError(
            err instanceof CustomError ? err.status : 500,
            err instanceof CustomError ? err.details : (err as Error).message,
          );
        }
      } else {
        this.shards = [];
      }
    },
    async fetchIndices() {
      if (!this.connection) throw new Error(lang.global.t('connection.selectConnection'));
      if (this.connection.type === DatabaseType.ELASTICSEARCH) {
        const indices = await esApi.catIndices(this.connection);

        this.indices = indices.filter(index =>
          this.hideSystemIndices ? !index.index.startsWith('.') : true,
        );
      } else {
        this.indices = [];
      }
    },
    async fetchAliases() {
      if (!this.connection) throw new Error(lang.global.t('connection.selectConnection'));
      if (this.connection.type === DatabaseType.ELASTICSEARCH) {
        const aliases = await esApi.catAliases(this.connection);

        this.aliases = aliases.filter(alias =>
          this.hideSystemIndices ? !alias.index.startsWith('.') : true,
        );
      } else {
        this.aliases = [];
      }
    },
    async fetchTemplates() {
      if (!this.connection) throw new Error(lang.global.t('connection.selectConnection'));
      if (this.connection.type === DatabaseType.ELASTICSEARCH) {
        const templates = await esApi.catTemplates(this.connection);

        this.templates = templates.filter(template =>
          this.hideSystemIndices ? !template.name.startsWith('.') : true,
        );
      } else {
        this.templates = [];
      }
    },
    async createIndex(options: {
      indexName: string;
      shards?: number | null;
      replicas?: number | null;
      master_timeout?: number | null;
      timeout?: number | null;
      wait_for_active_shards?: number | null;
      body?: string | null;
    }) {
      if (!this.connection) throw new Error(lang.global.t('connection.selectConnection'));
      if (this.connection.type === DatabaseType.ELASTICSEARCH) {
        await esApi.createIndex(this.connection, options);
      }
      return undefined;
    },
    async createAlias(options: {
      aliasName: string;
      indexName: string;
      master_timeout: number | null;
      timeout: number | null;
      is_write_index?: boolean;
      filter: { [key: string]: unknown };
      routing: number | null;
      search_routing: number | null;
      index_routing: number | null;
    }) {
      if (!this.connection) throw new Error(lang.global.t('connection.selectConnection'));
      if (this.connection.type === DatabaseType.ELASTICSEARCH) {
        await esApi.createAlias(this.connection, options);
        // refresh data
        Promise.all([this.fetchIndices(), this.fetchAliases()]).catch();
      }
      return undefined;
    },
    async createTemplate(options: {
      name: string;
      type: string;
      create?: boolean | null;
      master_timeout: number | null;
      body: string | null;
    }) {
      if (!this.connection) throw new Error(lang.global.t('connection.selectConnection'));
      if (this.connection.type === DatabaseType.ELASTICSEARCH) {
        await esApi.createTemplate(this.connection, options);
      }
      return undefined;
    },

    async deleteIndex(indexName: string) {
      // delete index
      if (!this.connection) throw new Error(lang.global.t('connection.selectConnection'));
      if (this.connection.type === DatabaseType.ELASTICSEARCH) {
        await esApi.deleteIndex(this.connection, indexName);
      }
      return undefined;
    },
    async closeIndex(indexName: string) {
      if (!this.connection) throw new Error(lang.global.t('connection.selectConnection'));
      if (this.connection.type === DatabaseType.ELASTICSEARCH) {
        await esApi.closeIndex(this.connection, indexName);
      }
      return undefined;
    },
    async openIndex(indexName: string) {
      if (!this.connection) throw new Error(lang.global.t('connection.selectConnection'));
      if (this.connection.type === DatabaseType.ELASTICSEARCH) {
        await esApi.openIndex(this.connection, indexName);
      }
      return undefined;
    },
    async removeAlias(indexName: string, aliasName: string) {
      if (!this.connection) throw new Error(lang.global.t('connection.selectConnection'));
      if (this.connection.type === DatabaseType.ELASTICSEARCH) {
        await esApi.removeAlias(this.connection, indexName, aliasName);
      }
      return undefined;
    },
    async switchAlias(aliasName: string, sourceIndexName: string, targetIndexName: string) {
      if (!this.connection) throw new Error(lang.global.t('connection.selectConnection'));
      if (this.connection.type === DatabaseType.ELASTICSEARCH) {
        await esApi.switchAlias(this.connection, { aliasName, sourceIndexName, targetIndexName });
      }
      return undefined;
    },
  },
});
