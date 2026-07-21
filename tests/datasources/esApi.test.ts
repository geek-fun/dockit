import {
  parseVersionParts,
  normalizeComposableTemplateBody,
  normalizeLegacyTemplateBody,
  getTemplateApiMode,
  TemplateApiMode,
  esApi,
} from '../../src/datasources/esApi.ts';
import { jsonify, CustomError } from '../../src/common';

jest.mock('../../src/store', () => ({
  DatabaseType: {
    ELASTICSEARCH: 'ELASTICSEARCH',
    OPENSEARCH: 'OPENSEARCH',
    EASYSEARCH: 'EASYSEARCH',
    DYNAMODB: 'DYNAMODB',
    MONGODB: 'MONGODB',
  },
}));

jest.mock('../../src/datasources', () => ({}));
jest.mock('../../src/datasources/fetchApi.ts', () => ({
  loadHttpClient: jest.fn(() => ({
    get: jest.fn(),
  })),
}));

jest.mock('../../src/lang', () => ({
  lang: {
    globalInjection: true,
    locale: 'enUS',
    legacy: false,
    messages: {},
    t: (k: string) => k,
  },
  useLang: jest.fn(),
}));

jest.mock('../../src/datasources/capabilityInvoker.ts', () => ({
  invokeCapability: jest.fn(),
  parseCapabilityResponse: <T>(raw: string): T => {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && typeof parsed.status === 'number') {
      if (parsed.status >= 400) throw new Error(parsed.message || 'Request failed');
      return (parsed.data ?? {}) as T;
    }
    return parsed as T;
  },
}));

import { invokeCapability } from '../../src/datasources/capabilityInvoker.ts';
const mockedInvokeCapability = invokeCapability as jest.MockedFunction<typeof invokeCapability>;

describe('parseVersionParts', () => {
  it('should parse standard version string', () => {
    expect(parseVersionParts('7.10.1')).toEqual({ major: 7, minor: 10 });
    expect(parseVersionParts('8.0.0')).toEqual({ major: 8, minor: 0 });
    expect(parseVersionParts('6.8.5')).toEqual({ major: 6, minor: 8 });
  });

  it('should handle version without patch number', () => {
    expect(parseVersionParts('7.8')).toEqual({ major: 7, minor: 8 });
  });

  it('should handle version with non-numeric minor by defaulting to 8', () => {
    expect(parseVersionParts('7.x')).toEqual({ major: 7, minor: 8 });
  });

  it('should handle version with only major number by defaulting minor to 8', () => {
    expect(parseVersionParts('7')).toEqual({ major: 7, minor: 8 });
    expect(parseVersionParts('8')).toEqual({ major: 8, minor: 8 });
  });

  it('should default to 7.8 for undefined version', () => {
    expect(parseVersionParts(undefined)).toEqual({ major: 7, minor: 8 });
  });

  it('should default to 7.8 for empty string', () => {
    expect(parseVersionParts('')).toEqual({ major: 7, minor: 8 });
  });

  it('should handle non-numeric major by defaulting to 7', () => {
    expect(parseVersionParts('abc.10')).toEqual({ major: 7, minor: 10 });
    expect(parseVersionParts('xyz')).toEqual({ major: 7, minor: 8 });
  });

  it('should handle non-numeric minor by defaulting to 8', () => {
    expect(parseVersionParts('7.xyz')).toEqual({ major: 7, minor: 8 });
  });

  it('should handle OpenSearch versions', () => {
    expect(parseVersionParts('1.2.4')).toEqual({ major: 1, minor: 2 });
    expect(parseVersionParts('2.11.0')).toEqual({ major: 2, minor: 11 });
  });
});

describe('normalizeComposableTemplateBody', () => {
  it('should return undefined for null body', () => {
    expect(normalizeComposableTemplateBody(null)).toBeUndefined();
  });

  it('should return undefined for empty string', () => {
    expect(normalizeComposableTemplateBody('')).toBeUndefined();
  });

  it('should preserve valid composable template structure', () => {
    const body =
      '{"index_patterns":["log-*"],"priority":100,"template":{"settings":{"number_of_shards":1}}}';
    const result = normalizeComposableTemplateBody(body);
    const parsed = jsonify.parse(result!);

    expect(parsed).toEqual({
      index_patterns: ['log-*'],
      priority: 100,
      template: {
        settings: { number_of_shards: 1 },
      },
    });
  });

  it('should convert order to priority when no priority exists', () => {
    const body = '{"index_patterns":["log-*"],"order":50,"template":{"settings":{}}}';
    const result = normalizeComposableTemplateBody(body);
    const parsed = jsonify.parse(result!);

    expect(parsed.priority).toBe(50);
    expect(parsed.order).toBeUndefined();
  });

  it('should not add priority if both order and priority exist at top-level', () => {
    const body = '{"index_patterns":["log-*"],"order":50,"priority":100}';
    const result = normalizeComposableTemplateBody(body);
    const parsed = jsonify.parse(result!);

    expect(parsed.priority).toBe(100);
    expect(parsed.order).toBeUndefined();
  });

  it('should not add priority if priority exists in template', () => {
    const body = '{"index_patterns":["log-*"],"order":50,"template":{"priority":100}}';
    const result = normalizeComposableTemplateBody(body);
    const parsed = jsonify.parse(result!);

    expect(parsed.priority).toBeUndefined();
    expect(parsed.template.priority).toBeUndefined();
  });

  it('should remove mistaken priority from template object', () => {
    const body = '{"index_patterns":["log-*"],"template":{"priority":100,"settings":{}}}';
    const result = normalizeComposableTemplateBody(body);
    const parsed = jsonify.parse(result!);

    expect(parsed.template.priority).toBeUndefined();
    expect(parsed.template.settings).toBeDefined();
  });

  it('should move flat settings/mappings/aliases into template', () => {
    const body =
      '{"index_patterns":["log-*"],"settings":{"number_of_shards":1},"mappings":{"properties":{"field":{"type":"text"}}}}';
    const result = normalizeComposableTemplateBody(body);
    const parsed = jsonify.parse(result!);

    expect(parsed.template.settings).toEqual({ number_of_shards: 1 });
    expect(parsed.template.mappings).toEqual({ properties: { field: { type: 'text' } } });
  });

  it('should not override template settings if both flat and nested exist', () => {
    const body =
      '{"settings":{"number_of_shards":1},"template":{"settings":{"number_of_replicas":2}}}';
    const result = normalizeComposableTemplateBody(body);
    const parsed = jsonify.parse(result!);

    expect(parsed.template.settings).toEqual({ number_of_replicas: 2 });
  });
});

describe('normalizeLegacyTemplateBody', () => {
  it('should return undefined for null body', () => {
    expect(normalizeLegacyTemplateBody(null)).toBeUndefined();
  });

  it('should preserve valid legacy template structure', () => {
    const body = '{"index_patterns":["log-*"],"order":50,"settings":{"number_of_shards":1}}';
    const result = normalizeLegacyTemplateBody(body);
    const parsed = jsonify.parse(result!);

    expect(parsed).toEqual({
      index_patterns: ['log-*'],
      order: 50,
      settings: { number_of_shards: 1 },
    });
  });

  it('should convert priority to order when no order exists', () => {
    const body = '{"index_patterns":["log-*"],"priority":100,"settings":{}}';
    const result = normalizeLegacyTemplateBody(body);
    const parsed = jsonify.parse(result!);

    expect(parsed.order).toBe(100);
    expect(parsed.priority).toBeUndefined();
  });

  it('should not add order if both order and priority exist', () => {
    const body = '{"index_patterns":["log-*"],"order":50,"priority":100}';
    const result = normalizeLegacyTemplateBody(body);
    const parsed = jsonify.parse(result!);

    expect(parsed.order).toBe(50);
    expect(parsed.priority).toBeUndefined();
  });

  it('should throw error for composed_of in legacy template', () => {
    const body = '{"index_patterns":["log-*"],"composed_of":["component1"]}';

    let thrownError: Error | null = null;
    try {
      normalizeLegacyTemplateBody(body);
    } catch (err) {
      thrownError = err as CustomError;
    }

    expect(thrownError).not.toBeNull();
    expect(thrownError instanceof CustomError).toBe(true);
    expect((thrownError as CustomError).details).toContain(
      'Legacy templates do not support composed_of',
    );
  });

  it('should throw error for data_stream in legacy template', () => {
    const body = '{"index_patterns":["log-*"],"data_stream":{}}';

    let thrownError: Error | null = null;
    try {
      normalizeLegacyTemplateBody(body);
    } catch (err) {
      thrownError = err as CustomError;
    }

    expect(thrownError).not.toBeNull();
    expect(thrownError instanceof CustomError).toBe(true);
    expect((thrownError as CustomError).details).toContain(
      'Legacy templates do not support data_stream',
    );
  });

  it('should move nested template contents to top-level', () => {
    const body = '{"template":{"settings":{"number_of_shards":1},"mappings":{}}}';
    const result = normalizeLegacyTemplateBody(body);
    const parsed = jsonify.parse(result!);

    expect(parsed.settings).toEqual({ number_of_shards: 1 });
    expect(parsed.mappings).toEqual({});
    expect(parsed.template).toBeUndefined();
  });
});

describe('getTemplateApiMode', () => {
  it('returns COMPOSABLE for OpenSearch connection', () => {
    const conn = { type: 'OPENSEARCH', version: '2.11.0' } as never;
    expect(getTemplateApiMode(conn)).toBe(TemplateApiMode.COMPOSABLE);
  });

  it('returns COMPOSABLE for EasySearch connection', () => {
    const conn = { type: 'EASYSEARCH', version: '7.10.2' } as never;
    expect(getTemplateApiMode(conn)).toBe(TemplateApiMode.COMPOSABLE);
  });

  it('returns LEGACY for Elasticsearch version below 7.8', () => {
    const conn = { type: 'ELASTICSEARCH', version: '7.7.0' } as never;
    expect(getTemplateApiMode(conn)).toBe(TemplateApiMode.LEGACY);
  });

  it('returns COMPOSABLE for Elasticsearch 7.8+', () => {
    const conn = { type: 'ELASTICSEARCH', version: '7.8.0' } as never;
    expect(getTemplateApiMode(conn)).toBe(TemplateApiMode.COMPOSABLE);
  });

  it('returns COMPOSABLE for Elasticsearch 8.x', () => {
    const conn = { type: 'ELASTICSEARCH', version: '8.0.0' } as never;
    expect(getTemplateApiMode(conn)).toBe(TemplateApiMode.COMPOSABLE);
  });
});

describe('esApi.catIndices', () => {
  const mockIndices = [
    {
      index: 'my-index',
      uuid: 'abc123',
      health: 'green',
      status: 'open',
      'store.size': '1kb',
      'docs.count': '10',
      'docs.deleted': '0',
    },
  ];

  beforeEach(() => {
    mockedInvokeCapability.mockResolvedValue(JSON.stringify({ status: 200, data: mockIndices }));
  });

  it('uses expand_wildcards=all for EasySearch connections', async () => {
    const conn = { type: 'EASYSEARCH', version: '7.10.2', id: 'conn-123' } as never;

    await esApi.catIndices(conn);

    expect(mockedInvokeCapability).toHaveBeenCalledWith('es__cat_indices', {}, 'conn-123');
  });

  it('uses expand_wildcards=all for OpenSearch connections', async () => {
    const conn = { type: 'OPENSEARCH', version: '2.11.0', id: 'conn-123' } as never;

    await esApi.catIndices(conn);

    expect(mockedInvokeCapability).toHaveBeenCalledWith('es__cat_indices', {}, 'conn-123');
  });
});

describe('esApi.createIndex', () => {
  const { loadHttpClient } = require('../../src/datasources/fetchApi.ts');

  const baseConn = { type: 'ELASTICSEARCH', version: '8.0.0' } as never;

  it('creates index successfully with minimal params', async () => {
    const mockPut = jest.fn().mockResolvedValue({ status: 200 });
    loadHttpClient.mockReturnValue({ put: mockPut });

    await esApi.createIndex(baseConn, { indexName: 'my-index' });
    expect(mockPut).toHaveBeenCalledWith('/my-index', expect.any(String), undefined);
  });

  it('includes shards/replicas in payload', async () => {
    const mockPut = jest.fn().mockResolvedValue({ status: 200 });
    loadHttpClient.mockReturnValue({ put: mockPut });

    await esApi.createIndex(baseConn, { indexName: 'idx', shards: 3, replicas: 1 });
    const payload = JSON.parse(mockPut.mock.calls[0][2]);
    expect(payload.settings.number_of_shards).toBe(3);
    expect(payload.settings.number_of_replicas).toBe(1);
  });

  it('throws CustomError when response status >= 300', async () => {
    const mockPut = jest.fn().mockResolvedValue({
      status: 400,
      error: { type: 'index_already_exists_exception', reason: 'already exists' },
    });
    loadHttpClient.mockReturnValue({ put: mockPut });

    await expect(esApi.createIndex(baseConn, { indexName: 'dup' })).rejects.toBeInstanceOf(
      CustomError,
    );
  });

  it('wraps unexpected thrown error as CustomError', async () => {
    const mockPut = jest.fn().mockRejectedValue(new Error('network error'));
    loadHttpClient.mockReturnValue({ put: mockPut });

    await expect(esApi.createIndex(baseConn, { indexName: 'idx' })).rejects.toBeInstanceOf(
      CustomError,
    );
  });
});

describe('esApi.createAlias', () => {
  const { loadHttpClient } = require('../../src/datasources/fetchApi.ts');
  const baseConn = { type: 'ELASTICSEARCH', version: '8.0.0' } as never;

  it('creates alias successfully', async () => {
    const mockPost = jest.fn().mockResolvedValue({ status: 200 });
    loadHttpClient.mockReturnValue({ post: mockPost });

    await esApi.createAlias(baseConn, {
      aliasName: 'my-alias',
      indexName: 'my-index',
      master_timeout: null,
      timeout: null,
      filter: {},
      routing: null,
      search_routing: null,
      index_routing: null,
    });

    expect(mockPost).toHaveBeenCalledWith('/_aliases', expect.any(String), expect.any(String));
  });

  it('throws on error response', async () => {
    const mockPost = jest.fn().mockResolvedValue({
      status: 404,
      error: { type: 'index_not_found_exception', reason: 'no such index' },
    });
    loadHttpClient.mockReturnValue({ post: mockPost });

    await expect(
      esApi.createAlias(baseConn, {
        aliasName: 'a',
        indexName: 'i',
        master_timeout: null,
        timeout: null,
        filter: {},
        routing: null,
        search_routing: null,
        index_routing: null,
      }),
    ).rejects.toBeInstanceOf(CustomError);
  });
});

describe('esApi.deleteIndex', () => {
  const baseConn = { type: 'ELASTICSEARCH', version: '8.0.0', id: 'conn-123' } as never;

  it('deletes index successfully', async () => {
    mockedInvokeCapability.mockResolvedValue(
      JSON.stringify({ status: 200, data: { acknowledged: true } }),
    );

    await esApi.deleteIndex(baseConn, 'my-index');
    expect(mockedInvokeCapability).toHaveBeenCalledWith(
      'es__delete_index',
      { index: 'my-index' },
      'conn-123',
    );
  });

  it('throws on error response', async () => {
    mockedInvokeCapability.mockResolvedValue(
      JSON.stringify({
        status: 404,
        data: null,
        error: { type: 'index_not_found', reason: 'not found' },
      }),
    );

    await expect(esApi.deleteIndex(baseConn, 'missing')).rejects.toBeInstanceOf(CustomError);
  });
});

describe('esApi.closeIndex', () => {
  const { loadHttpClient } = require('../../src/datasources/fetchApi.ts');
  const baseConn = { type: 'ELASTICSEARCH', version: '8.0.0' } as never;

  it('closes index successfully', async () => {
    const mockPost = jest.fn().mockResolvedValue({ status: 200 });
    loadHttpClient.mockReturnValue({ post: mockPost });

    await esApi.closeIndex(baseConn, 'my-index');
    expect(mockPost).toHaveBeenCalledWith('/my-index/_close');
  });

  it('throws on error response', async () => {
    const mockPost = jest.fn().mockResolvedValue({
      status: 500,
      error: { type: 'error', reason: 'server error' },
    });
    loadHttpClient.mockReturnValue({ post: mockPost });

    await expect(esApi.closeIndex(baseConn, 'my-index')).rejects.toBeInstanceOf(CustomError);
  });
});

describe('esApi.openIndex', () => {
  const { loadHttpClient } = require('../../src/datasources/fetchApi.ts');
  const baseConn = { type: 'ELASTICSEARCH', version: '8.0.0' } as never;

  it('opens index successfully', async () => {
    const mockPost = jest.fn().mockResolvedValue({ status: 200 });
    loadHttpClient.mockReturnValue({ post: mockPost });

    await esApi.openIndex(baseConn, 'my-index');
    expect(mockPost).toHaveBeenCalledWith('/my-index/_open');
  });

  it('throws when network error occurs', async () => {
    const mockPost = jest.fn().mockRejectedValue(new Error('timeout'));
    loadHttpClient.mockReturnValue({ post: mockPost });

    await expect(esApi.openIndex(baseConn, 'my-index')).rejects.toBeInstanceOf(CustomError);
  });
});

describe('esApi.removeAlias', () => {
  const baseConn = { type: 'ELASTICSEARCH', version: '8.0.0', id: 'conn-123' } as never;

  it('removes alias successfully', async () => {
    mockedInvokeCapability.mockResolvedValue(
      JSON.stringify({ status: 200, data: { acknowledged: true } }),
    );

    await esApi.removeAlias(baseConn, 'my-index', 'my-alias');
    expect(mockedInvokeCapability).toHaveBeenCalledWith(
      'es__delete_alias',
      { index: 'my-index', name: 'my-alias' },
      'conn-123',
    );
  });

  it('throws on error response', async () => {
    mockedInvokeCapability.mockResolvedValue(
      JSON.stringify({
        status: 404,
        data: null,
        error: { type: 'alias_not_found', reason: 'not found' },
      }),
    );

    await expect(esApi.removeAlias(baseConn, 'idx', 'alias')).rejects.toBeInstanceOf(CustomError);
  });
});

describe('esApi.switchAlias', () => {
  const { loadHttpClient } = require('../../src/datasources/fetchApi.ts');
  const baseConn = { type: 'ELASTICSEARCH', version: '8.0.0' } as never;

  it('switches alias successfully', async () => {
    const mockPost = jest.fn().mockResolvedValue({ status: 200 });
    loadHttpClient.mockReturnValue({ post: mockPost });

    await esApi.switchAlias(baseConn, {
      aliasName: 'my-alias',
      sourceIndexName: 'old-index',
      targetIndexName: 'new-index',
    });

    expect(mockPost).toHaveBeenCalledWith('/_aliases', undefined, expect.any(String));
    const body = JSON.parse(mockPost.mock.calls[0][2]);
    expect(body.actions).toHaveLength(2);
  });

  it('throws on error response', async () => {
    const mockPost = jest.fn().mockResolvedValue({
      status: 500,
      error: { type: 'error', reason: 'server error' },
    });
    loadHttpClient.mockReturnValue({ post: mockPost });

    await expect(
      esApi.switchAlias(baseConn, {
        aliasName: 'a',
        sourceIndexName: 's',
        targetIndexName: 't',
      }),
    ).rejects.toBeInstanceOf(CustomError);
  });
});

describe('esApi.catAliases', () => {
  const baseConn = { type: 'ELASTICSEARCH', version: '8.0.0', id: 'conn-123' } as never;

  it('returns normalized aliases', async () => {
    mockedInvokeCapability.mockResolvedValue(
      JSON.stringify({
        status: 200,
        data: [
          {
            alias: 'my-alias',
            index: 'my-index',
            filter: '-',
            'routing.index': '1',
            'routing.search': '1',
            is_write_index: 'true',
          },
        ],
      }),
    );

    const result = await esApi.catAliases(baseConn);
    expect(result).toHaveLength(1);
    expect(result[0].alias).toBe('my-alias');
    expect(result[0].isWriteIndex).toBe(true);
    expect(result[0].routing.index).toBe('1');
  });
});

describe('esApi.catNodes', () => {
  const { loadHttpClient } = require('../../src/datasources/fetchApi.ts');
  const baseConn = { type: 'ELASTICSEARCH', version: '8.0.0' } as never;

  it('returns sorted nodes with roles', async () => {
    const nodesResponse = {
      node1: {
        ip: '10.0.0.1',
        id: 'n1',
        name: 'bravo',
        version: '8.0.0',
        cpu: '5',
        'heap.percent': '50',
        'heap.current': '512',
        'heap.max': '1024',
        'ram.percent': '60',
        'ram.current': '2048',
        'ram.max': '4096',
        'disk.used_percent': '30',
        'disk.used': '100',
        'disk.total': '1000',
        'shard_stats.total_count': '5',
        'mappings.total_count': '10',
        'node.role': 'dm',
        master: '*',
      },
      node2: {
        ip: '10.0.0.2',
        id: 'n2',
        name: 'alpha',
        version: '8.0.0',
        cpu: '3',
        'heap.percent': '40',
        'heap.current': '400',
        'heap.max': '1024',
        'ram.percent': '50',
        'ram.current': '1600',
        'ram.max': '4096',
        'disk.used_percent': '20',
        'disk.used': '80',
        'disk.total': '1000',
        'shard_stats.total_count': '3',
        'mappings.total_count': '8',
        'node.role': 'i',
        master: '-',
      },
    };
    const mockGet = jest.fn().mockResolvedValue(nodesResponse);
    loadHttpClient.mockReturnValue({ get: mockGet });

    const result = await esApi.catNodes(baseConn);
    expect(result[0].name).toBe('alpha');
    expect(result[1].name).toBe('bravo');
    expect(result[1].master).toBe(true);
    expect(result[0].master).toBe(false);
  });

  it('throws CustomError on failure', async () => {
    const mockGet = jest.fn().mockRejectedValue(new Error('network error'));
    loadHttpClient.mockReturnValue({ get: mockGet });

    await expect(esApi.catNodes(baseConn)).rejects.toBeInstanceOf(CustomError);
  });
});

describe('esApi.createTemplate', () => {
  const { loadHttpClient } = require('../../src/datasources/fetchApi.ts');

  it('creates composable index template for ES 8.x', async () => {
    const mockPut = jest.fn().mockResolvedValue({ status: 200 });
    loadHttpClient.mockReturnValue({ put: mockPut });

    const conn = { type: 'ELASTICSEARCH', version: '8.0.0' } as never;
    await esApi.createTemplate(conn, {
      name: 'my-template',
      type: 'INDEX_TEMPLATE',
      master_timeout: null,
      body: '{"index_patterns":["log-*"]}',
    });

    expect(mockPut).toHaveBeenCalledWith(
      '/_index_template/my-template',
      expect.any(String),
      expect.any(String),
    );
  });

  it('creates legacy template for ES 7.7', async () => {
    const mockPut = jest.fn().mockResolvedValue({ status: 200 });
    loadHttpClient.mockReturnValue({ put: mockPut });

    const conn = { type: 'ELASTICSEARCH', version: '7.7.0' } as never;
    await esApi.createTemplate(conn, {
      name: 'legacy-tmpl',
      type: 'INDEX_TEMPLATE',
      master_timeout: null,
      body: '{"index_patterns":["old-*"]}',
    });

    expect(mockPut).toHaveBeenCalledWith(
      '/_template/legacy-tmpl',
      expect.any(String),
      expect.any(String),
    );
  });

  it('throws when creating component template in legacy mode', async () => {
    const mockPut = jest.fn().mockResolvedValue({ status: 200 });
    loadHttpClient.mockReturnValue({ put: mockPut });

    const conn = { type: 'ELASTICSEARCH', version: '7.7.0' } as never;
    await expect(
      esApi.createTemplate(conn, {
        name: 'comp-tmpl',
        type: 'COMPONENT_TEMPLATE',
        master_timeout: null,
        body: null,
      }),
    ).rejects.toBeInstanceOf(CustomError);
  });

  it('creates component template for ES 8.x', async () => {
    const mockPut = jest.fn().mockResolvedValue({ status: 200 });
    loadHttpClient.mockReturnValue({ put: mockPut });

    const conn = { type: 'ELASTICSEARCH', version: '8.0.0' } as never;
    await esApi.createTemplate(conn, {
      name: 'comp-tmpl',
      type: 'COMPONENT_TEMPLATE',
      master_timeout: null,
      body: '{"template":{"settings":{}}}',
    });

    expect(mockPut).toHaveBeenCalledWith(
      '/_component_template/comp-tmpl',
      expect.any(String),
      expect.any(String),
    );
  });
});

describe('esApi.listTemplates', () => {
  const { loadHttpClient } = require('../../src/datasources/fetchApi.ts');

  it('returns legacy templates for ES 7.7', async () => {
    const mockGet = jest.fn().mockResolvedValue({
      'my-template': {
        order: 5,
        index_patterns: ['log-*'],
        version: 1,
        aliases: { 'log-alias': {} },
        mappings: { properties: {} },
        settings: { number_of_shards: 1 },
        _meta: { description: 'test' },
      },
    });
    loadHttpClient.mockReturnValue({ get: mockGet });

    const conn = { type: 'ELASTICSEARCH', version: '7.7.0' } as never;
    const result = await esApi.listTemplates(conn);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('my-template');
    expect(result[0].api_mode).toBe(TemplateApiMode.LEGACY);
  });

  it('returns composable templates for ES 8.x', async () => {
    const mockGet = jest
      .fn()
      .mockResolvedValueOnce({
        index_templates: [
          {
            name: 'idx-tmpl',
            index_template: {
              index_patterns: ['data-*'],
              priority: 100,
              composed_of: ['comp1'],
              version: 2,
              template: {
                aliases: { 'data-alias': {} },
                mappings: {},
                settings: {},
              },
              _meta: {},
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        component_templates: [
          {
            name: 'comp1',
            component_template: {
              template: {
                mappings: { properties: {} },
                settings: {},
              },
              version: 1,
              _meta: {},
            },
          },
        ],
      });
    loadHttpClient.mockReturnValue({ get: mockGet });

    const conn = { type: 'ELASTICSEARCH', version: '8.0.0' } as never;
    const result = await esApi.listTemplates(conn);

    expect(result.length).toBeGreaterThanOrEqual(2);
  });
});

describe('esApi.allocationExplain', () => {
  const { loadHttpClient } = require('../../src/datasources/fetchApi.ts');
  const baseConn = { type: 'ELASTICSEARCH', version: '8.0.0' } as never;

  it('returns allocation explain response', async () => {
    const explainData = {
      index: 'my-index',
      shard: 0,
      primary: true,
      current_state: 'unassigned',
      can_allocate: 'yes',
      node_allocation_decisions: [],
    };
    const mockPost = jest.fn().mockResolvedValue(explainData);
    loadHttpClient.mockReturnValue({ post: mockPost });

    const result = await esApi.allocationExplain(baseConn, {
      index: 'my-index',
      shard: 0,
      primary: true,
    });

    expect(result.index).toBe('my-index');
    expect(result.can_allocate).toBe('yes');
    expect(mockPost).toHaveBeenCalledWith(
      expect.stringContaining('/_cluster/allocation/explain'),
      undefined,
      expect.any(String),
    );
  });

  it('throws CustomError on failure', async () => {
    const mockPost = jest.fn().mockRejectedValue(new Error('cluster error'));
    loadHttpClient.mockReturnValue({ post: mockPost });

    await expect(
      esApi.allocationExplain(baseConn, { index: 'idx', shard: 0, primary: true }),
    ).rejects.toBeInstanceOf(CustomError);
  });
});

describe('esApi.catShards', () => {
  const { loadHttpClient } = require('../../src/datasources/fetchApi.ts');
  const baseConn = { type: 'ELASTICSEARCH', version: '8.0.0' } as never;

  it('groups shards by index', async () => {
    const shardsData = [
      { index: 'idx-a', shard: '0', prirep: 'p', state: 'STARTED', docs: '10', store: '1024' },
      { index: 'idx-a', shard: '1', prirep: 'r', state: 'STARTED', docs: '10', store: '1024' },
      { index: 'idx-b', shard: '0', prirep: 'p', state: 'STARTED', docs: '5', store: '512' },
    ];
    const mockGet = jest.fn().mockResolvedValue(shardsData);
    loadHttpClient.mockReturnValue({ get: mockGet });

    const result = await esApi.catShards(baseConn);
    expect(result).toHaveLength(2);
    const idxA = result.find(r => r.index === 'idx-a');
    expect(idxA?.shards).toHaveLength(2);
  });

  it('throws CustomError on failure', async () => {
    const mockGet = jest.fn().mockRejectedValue(new Error('network error'));
    loadHttpClient.mockReturnValue({ get: mockGet });

    await expect(esApi.catShards(baseConn)).rejects.toBeInstanceOf(CustomError);
  });
});

describe('esApi.getIndexMapping', () => {
  const { loadHttpClient } = require('../../src/datasources/fetchApi.ts');
  const baseConn = { type: 'ELASTICSEARCH', version: '8.0.0' } as never;

  it('fetches mapping for an index', async () => {
    const mapping = { 'my-index': { mappings: { properties: { title: { type: 'text' } } } } };
    const mockGet = jest.fn().mockResolvedValue(mapping);
    loadHttpClient.mockReturnValue({ get: mockGet });

    await expect(esApi.getIndexMapping(baseConn, 'my-index')).resolves.toEqual(mapping);
    expect(mockGet).toHaveBeenCalledWith('/my-index/_mapping', 'format=json');
  });

  it('rethrows CustomError unchanged', async () => {
    const mockGet = jest.fn().mockRejectedValue(new CustomError(403, 'forbidden'));
    loadHttpClient.mockReturnValue({ get: mockGet });

    await expect(esApi.getIndexMapping(baseConn, 'my-index')).rejects.toMatchObject({
      status: 403,
      details: 'forbidden',
    });
  });

  it('wraps generic Error as CustomError 500', async () => {
    const mockGet = jest.fn().mockRejectedValue(new Error('network down'));
    loadHttpClient.mockReturnValue({ get: mockGet });

    await expect(esApi.getIndexMapping(baseConn, 'my-index')).rejects.toMatchObject({
      status: 500,
      details: 'network down',
    });
  });
});

describe('esApi.searchIndexDocuments', () => {
  const { loadHttpClient } = require('../../src/datasources/fetchApi.ts');
  const baseConn = { type: 'ELASTICSEARCH', version: '8.0.0' } as never;

  it('posts search body with size, sort, and track_total_hits', async () => {
    const mockPost = jest.fn().mockResolvedValue({
      hits: {
        total: { value: 1 },
        hits: [{ _id: '1', _index: 'idx', _source: { a: 1 }, sort: [0] }],
      },
    });
    loadHttpClient.mockReturnValue({ post: mockPost });

    const result = await esApi.searchIndexDocuments(baseConn, { indexName: 'idx', size: 25 });

    expect(mockPost).toHaveBeenCalledWith('/idx/_search', undefined, expect.any(String));
    const body = JSON.parse(mockPost.mock.calls[0][2]);
    expect(body).toEqual({
      size: 25,
      sort: [{ _doc: 'asc' }],
      track_total_hits: true,
    });
    expect(result.hits).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.nextSearchAfter).toBeUndefined();
  });

  it('includes search_after and query when provided', async () => {
    const mockPost = jest.fn().mockResolvedValue({ hits: { total: 0, hits: [] } });
    loadHttpClient.mockReturnValue({ post: mockPost });

    await esApi.searchIndexDocuments(baseConn, {
      indexName: 'idx',
      size: 10,
      searchAfter: [42],
      query: { match_all: {} },
    });

    const body = JSON.parse(mockPost.mock.calls[0][2]);
    expect(body.search_after).toEqual([42]);
    expect(body.query).toEqual({ match_all: {} });
  });

  it('omits search_after when empty', async () => {
    const mockPost = jest.fn().mockResolvedValue({ hits: { total: 0, hits: [] } });
    loadHttpClient.mockReturnValue({ post: mockPost });

    await esApi.searchIndexDocuments(baseConn, {
      indexName: 'idx',
      size: 10,
      searchAfter: [],
    });

    const body = JSON.parse(mockPost.mock.calls[0][2]);
    expect(body.search_after).toBeUndefined();
  });

  it('maps hit defaults and numeric total', async () => {
    const mockPost = jest.fn().mockResolvedValue({
      hits: {
        total: 2,
        hits: [{}, { _id: 'b', _source: { x: 1 }, sort: [1] }],
      },
    });
    loadHttpClient.mockReturnValue({ post: mockPost });

    const result = await esApi.searchIndexDocuments(baseConn, { indexName: 'idx', size: 25 });

    expect(result.hits[0]).toEqual({
      _id: '',
      _index: 'idx',
      _score: null,
      _source: {},
      sort: undefined,
    });
    expect(result.hits[1]._id).toBe('b');
    expect(result.total).toBe(2);
  });

  it('falls back total to hits.length when total missing', async () => {
    const mockPost = jest.fn().mockResolvedValue({
      hits: {
        hits: [{ _id: 'a', sort: [0] }],
      },
    });
    loadHttpClient.mockReturnValue({ post: mockPost });

    const result = await esApi.searchIndexDocuments(baseConn, { indexName: 'idx', size: 25 });
    expect(result.total).toBe(1);
  });

  it('returns nextSearchAfter when page is full and last hit has sort', async () => {
    const mockPost = jest.fn().mockResolvedValue({
      hits: {
        total: { value: 100 },
        hits: [
          { _id: '1', sort: [10] },
          { _id: '2', sort: [20] },
        ],
      },
    });
    loadHttpClient.mockReturnValue({ post: mockPost });

    const result = await esApi.searchIndexDocuments(baseConn, { indexName: 'idx', size: 2 });
    expect(result.nextSearchAfter).toEqual([20]);
  });

  it('throws CustomError when response status >= 300', async () => {
    const mockPost = jest.fn().mockResolvedValue({
      status: 400,
      error: { type: 'search_phase_execution_exception', reason: 'all shards failed' },
    });
    loadHttpClient.mockReturnValue({ post: mockPost });

    await expect(
      esApi.searchIndexDocuments(baseConn, { indexName: 'idx', size: 10 }),
    ).rejects.toMatchObject({
      status: 400,
      details: 'search_phase_execution_exception: all shards failed',
    });
  });

  it('wraps unexpected thrown error as CustomError', async () => {
    const mockPost = jest.fn().mockRejectedValue(new Error('timeout'));
    loadHttpClient.mockReturnValue({ post: mockPost });

    await expect(
      esApi.searchIndexDocuments(baseConn, { indexName: 'idx', size: 10 }),
    ).rejects.toMatchObject({ status: 500, details: 'timeout' });
  });
});

describe('esApi.aggregateFieldValues', () => {
  const { loadHttpClient } = require('../../src/datasources/fetchApi.ts');
  const baseConn = { type: 'ELASTICSEARCH', version: '8.0.0' } as never;

  it('requests terms aggregation with default size 50', async () => {
    const mockPost = jest.fn().mockResolvedValue({
      aggregations: {
        field_values: {
          buckets: [
            { key: 'Functional', doc_count: 3 },
            { key: 'Unknown', doc_count: 1 },
          ],
        },
      },
    });
    loadHttpClient.mockReturnValue({ post: mockPost });

    const result = await esApi.aggregateFieldValues(baseConn, {
      indexName: 'idx',
      field: 'category.keyword',
    });

    expect(mockPost).toHaveBeenCalledWith('/idx/_search', undefined, expect.any(String));
    const body = JSON.parse(mockPost.mock.calls[0][2]);
    expect(body).toEqual({
      size: 0,
      aggs: {
        field_values: {
          terms: { field: 'category.keyword', size: 50, order: { _key: 'asc' } },
        },
      },
    });
    expect(result).toEqual([
      { value: 'Functional', count: 3 },
      { value: 'Unknown', count: 1 },
    ]);
  });

  it('supports custom size and query', async () => {
    const mockPost = jest.fn().mockResolvedValue({ aggregations: { field_values: { buckets: [] } } });
    loadHttpClient.mockReturnValue({ post: mockPost });

    await esApi.aggregateFieldValues(baseConn, {
      indexName: 'idx',
      field: 'status',
      size: 10,
      query: { term: { active: true } },
    });

    const body = JSON.parse(mockPost.mock.calls[0][2]);
    expect(body.aggs.field_values.terms.size).toBe(10);
    expect(body.query).toEqual({ term: { active: true } });
  });

  it('returns empty array when buckets missing', async () => {
    const mockPost = jest.fn().mockResolvedValue({});
    loadHttpClient.mockReturnValue({ post: mockPost });

    await expect(
      esApi.aggregateFieldValues(baseConn, { indexName: 'idx', field: 'x' }),
    ).resolves.toEqual([]);
  });

  it('throws CustomError when response status >= 300', async () => {
    const mockPost = jest.fn().mockResolvedValue({
      status: 500,
      error: { type: 'error', reason: 'Failed to fetch API' },
    });
    loadHttpClient.mockReturnValue({ post: mockPost });

    await expect(
      esApi.aggregateFieldValues(baseConn, { indexName: 'idx', field: 'x' }),
    ).rejects.toMatchObject({ status: 500 });
  });

  it('wraps unexpected thrown error as CustomError', async () => {
    const mockPost = jest.fn().mockRejectedValue(new Error('boom'));
    loadHttpClient.mockReturnValue({ post: mockPost });

    await expect(
      esApi.aggregateFieldValues(baseConn, { indexName: 'idx', field: 'x' }),
    ).rejects.toMatchObject({ status: 500, details: 'boom' });
  });
});
