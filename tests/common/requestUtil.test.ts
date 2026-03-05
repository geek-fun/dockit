import { buildAuthHeader } from '../../src/common/requestUtil';

describe('Unit tests for requestUtil', () => {
  describe('buildAuthHeader - basic auth', () => {
    it('should return Basic authorization header when username and password are provided', () => {
      const result = buildAuthHeader('basic', 'user', 'pass');
      expect(result).toBeDefined();
      expect(result?.authorization).toMatch(/^Basic /);
    });

    it('should return undefined when neither username nor password is provided', () => {
      const result = buildAuthHeader(undefined, undefined, undefined);
      expect(result).toBeUndefined();
    });

    it('should return Basic authorization header when only username is provided', () => {
      const result = buildAuthHeader('basic', 'user', undefined);
      expect(result).toBeDefined();
      expect(result?.authorization).toMatch(/^Basic /);
    });

    it('should not serialize undefined as string in credentials', () => {
      const result = buildAuthHeader('basic', 'user', undefined);
      // Should encode "user:" not "user:undefined"
      const encoded = result?.authorization?.replace('Basic ', '') ?? '';
      const decoded = atob(encoded);
      expect(decoded).toBe('user:');
    });

    it('should default to basic auth when authType is undefined', () => {
      const result = buildAuthHeader(undefined, 'user', 'pass');
      expect(result).toBeDefined();
      expect(result?.authorization).toMatch(/^Basic /);
    });
  });

  describe('buildAuthHeader - API key auth', () => {
    it('should return ApiKey authorization header when apiKey is provided', () => {
      const apiKey = 'dGVzdC1pZDp0ZXN0LWtleQ==';
      const result = buildAuthHeader('apiKey', undefined, undefined, apiKey);
      expect(result).toBeDefined();
      expect(result?.authorization).toBe(`ApiKey ${apiKey}`);
    });

    it('should return undefined when apiKey is undefined', () => {
      const result = buildAuthHeader('apiKey', undefined, undefined, undefined);
      expect(result).toBeUndefined();
    });

    it('should return undefined when apiKey is empty string', () => {
      const result = buildAuthHeader('apiKey', undefined, undefined, '');
      expect(result).toBeUndefined();
    });

    it('should include the raw apiKey value without additional encoding', () => {
      const apiKey = 'myApiKeyValue123';
      const result = buildAuthHeader('apiKey', undefined, undefined, apiKey);
      expect(result?.authorization).toBe(`ApiKey myApiKeyValue123`);
    });

    it('should ignore username/password when authType is apiKey', () => {
      const result = buildAuthHeader('apiKey', 'user', 'pass', 'myApiKey');
      expect(result?.authorization).toBe('ApiKey myApiKey');
    });
  });
});
