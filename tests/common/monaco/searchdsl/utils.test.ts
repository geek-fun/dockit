/**
 * Tests for the grammar utility functions
 */
import { compareVersions, isVersionInRange } from '../../../../src/common/monaco/searchdsl/utils';

describe('compareVersions', () => {
  it('should return 0 for equal versions', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('7.10.2', '7.10.2')).toBe(0);
  });

  it('should return -1 when first version is less', () => {
    expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
    expect(compareVersions('7.9.0', '7.10.0')).toBe(-1);
    expect(compareVersions('7.10.0', '7.10.1')).toBe(-1);
  });

  it('should return 1 when first version is greater', () => {
    expect(compareVersions('2.0.0', '1.0.0')).toBe(1);
    expect(compareVersions('8.0.0', '7.10.0')).toBe(1);
    expect(compareVersions('7.10.1', '7.10.0')).toBe(1);
  });

  it('should handle versions with different segment counts', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0', '1.0')).toBe(0);
    expect(compareVersions('1.0', '1.0.1')).toBe(-1);
    expect(compareVersions('1.0.1', '1.0')).toBe(1);
  });
});

describe('isVersionInRange', () => {
  it('should return true when no constraints', () => {
    expect(isVersionInRange('1.0.0', {})).toBe(true);
  });

  it('should return true when version is within range', () => {
    expect(isVersionInRange('7.10.0', { min: '7.0.0', max: '8.0.0' })).toBe(true);
    expect(isVersionInRange('7.0.0', { min: '7.0.0' })).toBe(true);
    expect(isVersionInRange('8.0.0', { max: '8.0.0' })).toBe(true);
  });

  it('should return false when version is below min', () => {
    expect(isVersionInRange('6.9.0', { min: '7.0.0' })).toBe(false);
    expect(isVersionInRange('7.9.0', { min: '7.10.0' })).toBe(false);
  });

  it('should return false when version is above max', () => {
    expect(isVersionInRange('8.1.0', { max: '8.0.0' })).toBe(false);
    expect(isVersionInRange('7.11.0', { max: '7.10.0' })).toBe(false);
  });

  it('should handle min only constraint', () => {
    expect(isVersionInRange('8.0.0', { min: '7.0.0' })).toBe(true);
    expect(isVersionInRange('6.0.0', { min: '7.0.0' })).toBe(false);
  });

  it('should handle max only constraint', () => {
    expect(isVersionInRange('6.0.0', { max: '7.0.0' })).toBe(true);
    expect(isVersionInRange('8.0.0', { max: '7.0.0' })).toBe(false);
  });
});
