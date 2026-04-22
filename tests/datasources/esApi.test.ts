import {
  parseVersionParts,
  normalizeComposableTemplateBody,
  normalizeLegacyTemplateBody,
} from '../../src/datasources/esApi.ts';
import { jsonify, CustomError } from '../../src/common';

jest.mock('../../src/lang/index.ts', () => ({
  lang: {
    globalInjection: true,
    locale: 'enUS',
    legacy: false,
    messages: {},
  },
  useLang: jest.fn(),
}));

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
