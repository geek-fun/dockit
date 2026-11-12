import { effectScope, ref, type EffectScope } from 'vue';
import { usePartiqlPagination } from '../../../../src/views/editor/dynamo-editor/composables';

const makeRows = (count: number): number[] =>
  Array.from({ length: count }, (_, index) => index + 1);
let scope: EffectScope;

beforeEach(() => {
  scope = effectScope();
});

afterEach(() => {
  scope.stop();
});

it('paginates all 28 returned rows at 25 per page without a server cursor', async () => {
  const result = ref({ data: makeRows(28), nextToken: null });
  const fetchBatch = jest.fn();
  const pager = scope.run(() => usePartiqlPagination(result, ref(false), fetchBatch))!;

  expect(pager.pagination.value).toMatchObject({
    page: 1,
    pageSize: 25,
    rowOffset: 0,
    hasNext: true,
  });
  await pager.nextPage();
  expect(pager.pagination.value).toMatchObject({ page: 2, rowOffset: 25, hasNext: false });

  await pager.setPageSize(50);
  expect(pager.pagination.value).toMatchObject({
    page: 1,
    pageSize: 50,
    rowOffset: 0,
    hasNext: false,
  });
  expect(fetchBatch).not.toHaveBeenCalled();
});

it('requests a server cursor after the local pages and returns to the last page of the previous batch', async () => {
  const result = ref<{ data: number[]; nextToken: string | null }>({
    data: makeRows(28),
    nextToken: 'second-batch',
  });
  const fetchBatch = jest.fn(async (token: string | null) => {
    result.value.data = token ? makeRows(4) : makeRows(28);
    result.value.nextToken = token ? null : 'second-batch';
    return true;
  });
  const pager = scope.run(() => usePartiqlPagination(result, ref(false), fetchBatch))!;

  await pager.nextPage();
  expect(fetchBatch).not.toHaveBeenCalled();
  expect(pager.pagination.value).toMatchObject({ page: 2, rowOffset: 25, hasNext: true });

  await pager.nextPage();
  expect(fetchBatch).toHaveBeenLastCalledWith('second-batch');
  expect(pager.pagination.value).toMatchObject({ page: 3, rowOffset: 0, hasNext: false });

  await pager.previousPage();
  expect(fetchBatch).toHaveBeenLastCalledWith(null);
  expect(pager.pagination.value).toMatchObject({ page: 2, rowOffset: 25, hasNext: true });
});

it('keeps the current page when a cursor request fails', async () => {
  const result = ref({ data: makeRows(28), nextToken: 'second-batch' });
  const fetchBatch = jest.fn().mockResolvedValue(false);
  const pager = scope.run(() => usePartiqlPagination(result, ref(false), fetchBatch))!;

  await pager.nextPage();
  await pager.nextPage();
  expect(fetchBatch).toHaveBeenCalledWith('second-batch');
  expect(pager.pagination.value).toMatchObject({ page: 2, rowOffset: 25, hasNext: true });
});
