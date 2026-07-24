export type EsEditorMode = 'ES_EDITOR_QUERY' | 'ES_EDITOR_BROWSE';
export type ConnectView = 'query' | 'browse';

export const parseConnectRouteQuery = (
  query: Record<string, unknown | unknown[]>,
): { index?: string; view?: ConnectView } => {
  const index = typeof query.index === 'string' ? query.index : undefined;
  const viewRaw = typeof query.view === 'string' ? query.view : undefined;
  const view = viewRaw === 'browse' || viewRaw === 'query' ? viewRaw : undefined;
  return { index, view };
};

export const editorTypeFromConnectView = (view?: string): EsEditorMode | undefined => {
  if (view === 'browse') return 'ES_EDITOR_BROWSE';
  if (view === 'query') return 'ES_EDITOR_QUERY';
  return undefined;
};

export const connectViewFromEditorType = (editorType: EsEditorMode): ConnectView =>
  editorType === 'ES_EDITOR_BROWSE' ? 'browse' : 'query';

export const resolveEsEditorMode = (editorType?: string): EsEditorMode =>
  editorType === 'ES_EDITOR_BROWSE' ? 'ES_EDITOR_BROWSE' : 'ES_EDITOR_QUERY';

export const buildConnectRouteQuery = (options: {
  index?: string;
  editorType?: EsEditorMode;
}): Record<string, string> => {
  const query: Record<string, string> = {};
  if (options.index) query.index = options.index;
  if (options.editorType === 'ES_EDITOR_BROWSE') query.view = 'browse';
  return query;
};
