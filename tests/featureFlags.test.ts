import { isFeatureEnabled } from '../src/common/featureFlags';

describe('isFeatureEnabled', () => {
  describe('mongodb', () => {
    it('exports isFeatureEnabled object', () => {
      expect(isFeatureEnabled).toBeDefined();
      expect(typeof isFeatureEnabled).toBe('object');
    });

    it('has mongodb property', () => {
      expect('mongodb' in isFeatureEnabled).toBe(true);
    });

    it('mongodb is a boolean', () => {
      expect(typeof isFeatureEnabled.mongodb).toBe('boolean');
    });

    it('mongodb defaults to false in test environment', () => {
      expect(isFeatureEnabled.mongodb).toBe(false);
    });

    it('mongodb is false when __MONGODB_ENABLED__ is not set', () => {
      expect(isFeatureEnabled.mongodb).toBe(false);
    });

    it('isFeatureEnabled object has correct shape', () => {
      expect(Object.keys(isFeatureEnabled)).toEqual(['mongodb']);
    });
  });
});
