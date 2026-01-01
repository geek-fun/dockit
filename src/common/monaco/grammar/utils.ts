/**
 * Utility functions for the grammar module
 */

/**
 * Compare two semantic versions
 * @param a First version string (e.g., "7.10.0")
 * @param b Second version string (e.g., "8.0.0")
 * @returns -1 if a < b, 0 if a == b, 1 if a > b
 */
export function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);
  
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA < numB) return -1;
    if (numA > numB) return 1;
  }
  return 0;
}

/**
 * Check if a version is within a range
 * @param version Version to check
 * @param range Range with optional min and max
 * @returns true if version is within range
 */
export function isVersionInRange(
  version: string,
  range: { min?: string; max?: string },
): boolean {
  if (range.min && compareVersions(version, range.min) < 0) {
    return false;
  }
  if (range.max && compareVersions(version, range.max) > 0) {
    return false;
  }
  return true;
}
