import {
  buildConnectRouteQuery,
  connectViewFromEditorType,
  editorTypeFromConnectView,
  parseConnectRouteQuery,
  resolveEsEditorMode,
} from '../../src/common/connectQuery';

describe('parseConnectRouteQuery', () => {
  it('extracts index and browse view from route query', () => {
    expect(parseConnectRouteQuery({ index: 'logs-2024', view: 'browse' })).toEqual({
      index: 'logs-2024',
      view: 'browse',
    });
  });

  it('extracts query view and omits invalid view values', () => {
    expect(parseConnectRouteQuery({ index: 'idx', view: 'query' })).toEqual({
      index: 'idx',
      view: 'query',
    });
    expect(parseConnectRouteQuery({ view: 'invalid' })).toEqual({ view: undefined });
  });

  it('ignores non-string query values', () => {
    expect(parseConnectRouteQuery({ index: ['a', 'b'], view: 1 })).toEqual({});
  });
});

describe('editorTypeFromConnectView', () => {
  it('maps browse and query views to editor types', () => {
    expect(editorTypeFromConnectView('browse')).toBe('ES_EDITOR_BROWSE');
    expect(editorTypeFromConnectView('query')).toBe('ES_EDITOR_QUERY');
  });

  it('returns undefined for missing or unknown views', () => {
    expect(editorTypeFromConnectView(undefined)).toBeUndefined();
    expect(editorTypeFromConnectView('other')).toBeUndefined();
  });
});

describe('connectViewFromEditorType', () => {
  it('maps editor types to connect views', () => {
    expect(connectViewFromEditorType('ES_EDITOR_BROWSE')).toBe('browse');
    expect(connectViewFromEditorType('ES_EDITOR_QUERY')).toBe('query');
  });
});

describe('resolveEsEditorMode', () => {
  it('defaults to query mode unless browse is set', () => {
    expect(resolveEsEditorMode('ES_EDITOR_BROWSE')).toBe('ES_EDITOR_BROWSE');
    expect(resolveEsEditorMode('ES_EDITOR_QUERY')).toBe('ES_EDITOR_QUERY');
    expect(resolveEsEditorMode(undefined)).toBe('ES_EDITOR_QUERY');
    expect(resolveEsEditorMode('DYNAMO_EDITOR_UI')).toBe('ES_EDITOR_QUERY');
  });
});

describe('buildConnectRouteQuery', () => {
  it('includes index and browse view when in browse mode', () => {
    expect(buildConnectRouteQuery({ index: 'my-index', editorType: 'ES_EDITOR_BROWSE' })).toEqual({
      index: 'my-index',
      view: 'browse',
    });
  });

  it('omits view in query mode and omits index when unset', () => {
    expect(buildConnectRouteQuery({ editorType: 'ES_EDITOR_QUERY' })).toEqual({});
    expect(buildConnectRouteQuery({ index: 'only-index' })).toEqual({ index: 'only-index' });
  });
});
