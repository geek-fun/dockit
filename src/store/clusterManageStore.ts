import { defineStore } from 'pinia';
import { loadHttpClient } from '../datasources';
import { lang } from '../lang';
import { useConnectionStore } from './connectionStore.ts';
import { CustomError, optionalToNullableInt } from '../common';

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

export const useClusterManageStore = defineStore('clusterManageStore', {
  state: (): {
    indices: Array<ClusterIndex>;
    aliases: Array<ClusterAlias>;
    templates: Array<ClusterTemplate>;
  } => ({
    indices: [],
    aliases: [],
    templates: [],
  }),
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
  },
  actions: {
    async fetchIndices() {
      const { established } = useConnectionStore();
      if (!established) throw new Error(lang.global.t('connection.selectConnection'));
      const client = loadHttpClient(established);
      const data = (await client.get('/_cat/indices', 'format=json&s=index')) as Array<{
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
      const data = (await client.get('/_cat/aliases', 'format=json&s=alias')) as Array<{
        [key: string]: string;
      }>;
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
    async fetchTemplates() {
      const { established } = useConnectionStore();
      if (!established) throw new Error(lang.global.t('connection.selectConnection'));
      const client = loadHttpClient(established);
      const fetchIndexTemplates = async () => {
        const data = (await client.get('/_cat/templates', 'format=json')) as Array<{
          [key: string]: string;
        }>;
        console.log('templates', data);
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
        const data = (await client.get('/_cat/component_templates', 'format=json')) as Array<{
          [key: string]: string;
        }>;
        console.log('component templates', data);
        return data.map((template: { [key: string]: string }) => ({
          name: template.name,
          type: TemplateType.COMPONENT_TEMPLATE,
          version: optionalToNullableInt(template.version),
          alias_count: optionalToNullableInt(template.alias_count),
          mapping_count: optionalToNullableInt(template.mapping_count),
          settings_count: optionalToNullableInt(template.settings_count),
          metadata_count: optionalToNullableInt(template.metadata_count),
          included_in: template.included_in.slice(1, -1).split(',').filter(Boolean),
        }));
      };

      const [indexTemplates, componentTemplates] = await Promise.all([
        fetchIndexTemplates(),
        fetchComponentTemplates(),
      ]);

      this.templates = [...indexTemplates, ...componentTemplates];
    },
    async createIndex({
      indexName,
      shards,
      replicas,
      master_timeout,
      timeout,
      wait_for_active_shards,
      body,
    }: {
      indexName: string;
      shards?: number | null;
      replicas?: number | null;
      master_timeout?: number | null;
      timeout?: number | null;
      wait_for_active_shards?: number | null;
      body?: string | null;
    }) {
      const { established } = useConnectionStore();
      if (!established) throw new Error(lang.global.t('connection.selectConnection'));
      const client = loadHttpClient(established);

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

      const parsedBody = body ? JSON.parse(body) : undefined;

      const payload =
        parsedBody || shards || replicas
          ? JSON.stringify({
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
          throw new CustomError(
            response.status,
            `${response.error.type}: ${response.error.reason}`,
          );
        }
      } catch (err) {
        console.error('Error creating index', err);
        throw new CustomError(
          err instanceof CustomError ? err.status : 500,
          err instanceof CustomError ? err.details : (err as Error).message,
        );
      }
      // refresh data
      Promise.all([this.fetchIndices(), this.fetchAliases()]).catch();
    },
    async createAlias({
      aliasName,
      indexName,
      master_timeout,
      timeout,
      is_write_index,
      filter,
      routing,
      search_routing,
      index_routing,
    }: {
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
      const { established } = useConnectionStore();
      if (!established) throw new Error(lang.global.t('connection.selectConnection'));
      const client = loadHttpClient(established);

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
              ...(is_write_index !== null && is_write_index !== undefined
                ? { is_write_index }
                : {}),
              ...(filter ? { filter } : {}),
              ...(routing ? { routing: `${routing}` } : {}),
              ...(search_routing ? { search_routing: `${search_routing}` } : {}),
              ...(index_routing ? { index_routing: `${index_routing}` } : {}),
            },
          },
        ],
      };
      console.log('payload', payload);
      try {
        const response = await client.post(
          `/_aliases`,
          queryParams.toString() ?? undefined,
          JSON.stringify(payload),
        );

        if (response.status >= 300) {
          throw new CustomError(
            response.status,
            `${response.error.type}: ${response.error.reason}`,
          );
        }
      } catch (err) {
        console.error('Error creating alias', err);
        throw new CustomError(
          err instanceof CustomError ? err.status : 500,
          err instanceof CustomError ? err.details : (err as Error).message,
        );
      }
      // refresh data
      Promise.all([this.fetchIndices(), this.fetchAliases()]).catch();
    },
    async createTemplate({
      name,
      type,
      create,
      master_timeout,
      body,
    }: {
      name: string;
      type: string;
      create?: boolean | null;
      master_timeout: number | null;
      body: string | null;
    }) {
      const { established } = useConnectionStore();
      if (!established) throw new Error(lang.global.t('connection.selectConnection'));
      const client = loadHttpClient(established);
      const queryParams = new URLSearchParams();
      [
        { key: 'master_timeout', value: master_timeout },
        { key: 'create', value: create },
      ].forEach(param => {
        if (param.value !== null && param.value !== undefined) {
          queryParams.append(
            param.key,
            param.value.toString() + (param.key !== 'create' ? 's' : ''),
          );
        }
      });
      console.log('createTemplate', { name, type });
      try {
        const response = await client.put(
          `/${type}/${name}`,
          queryParams.toString(),
          body ?? undefined,
        );
        console.log('response', response);
        if (response.status >= 300) {
          throw new CustomError(
            response.status,
            `${response.error.type}: ${response.error.reason}`,
          );
        }
      } catch (err) {
        console.error('Error creating template', JSON.stringify(err));
        throw new CustomError(
          err instanceof CustomError ? err.status : 500,
          err instanceof CustomError ? err.details : (err as Error).message,
        );
      }
      // refresh data
      await this.fetchTemplates();
    },
  },
});
