import { buildAuthHeader, buildApiKeyAuthHeader } from '../../src/common/requestUtil';

describe('Unit tests for requestUtil', () => {
  describe('buildAuthHeader', () => {
    it('should return Basic authorization header when username and password are provided', () => {
      const result = buildAuthHeader('user', 'pass');
      expect(result).toBeDefined();
      expect(result?.authorization).toMatch(/^Basic /);
    });

    it('should return undefined when neither username nor password is provided', () => {
      const result = buildAuthHeader(undefined, undefined);
      expect(result).toBeUndefined();
    });

    it('should return Basic authorization header when only username is provided', () => {
      const result = buildAuthHeader('user', undefined);
      expect(result).toBeDefined();
      expect(result?.authorization).toMatch(/^Basic /);
    });
  });

  describe('buildApiKeyAuthHeader', () => {
    it('should return ApiKey authorization header when apiKey is provided', () => {
      const apiKey = 'dGVzdC1pZDp0ZXN0LWtleQ==';
      const result = buildApiKeyAuthHeader(apiKey);
      expect(result).toBeDefined();
      expect(result?.authorization).toBe(`ApiKey ${apiKey}`);
    });

    it('should return undefined when apiKey is undefined', () => {
      const result = buildApiKeyAuthHeader(undefined);
      expect(result).toBeUndefined();
    });

    it('should return undefined when apiKey is empty string', () => {
      const result = buildApiKeyAuthHeader('');
      expect(result).toBeUndefined();
    });

    it('should include the raw apiKey value without additional encoding', () => {
      const apiKey = 'myApiKeyValue123';
      const result = buildApiKeyAuthHeader(apiKey);
      expect(result?.authorization).toBe(`ApiKey myApiKeyValue123`);
    });
  });
});
