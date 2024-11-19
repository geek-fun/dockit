import { buildCsvHeaderFromIndexMapping } from '../../src/common';
import { csvHeader, indexMapping } from '../fixtures';

jest.mock('../../src/common', () => ({
  ...jest.requireActual('../../src/common/csv.ts'),
}));

describe('Unit test for csv', () => {
  it('should get csv header from given index mapping', () => {
    const builtHeader = buildCsvHeaderFromIndexMapping(indexMapping);
    expect(builtHeader).toEqual(csvHeader);
  });
});
