import { monaco } from './index.ts';

export type Range = {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
};
export type Decoration = {
  id: number;
  range: Range;
  options: { isWholeLine: boolean; linesDecorationsClassName: string };
};

export type SearchAction = {
  qdsl: string;
  position: Range;
  method: string;
  index: string;
  path: string;
  queryParams: string | null;
};

export enum ActionType {
  POST_INDEX = 'POST_INDEX',
  POST_SEARCH = 'POST_SEARCH',
  POST_COUNT = 'POST_COUNT',
  GET_SEARCH = 'GET_SEARCH',
  POST_UPDATE = 'POST_UPDATE',
  DELETE_DOC = 'DELETE_DOC',
  PUT_INDEX = 'PUT_INDEX',
  DELETE_INDEX = 'DELETE_INDEX',
  POST_BULK = 'POST_BULK',
  PUT_PUT_INDEX = 'PUT_PUT_INDEX',
  PUT_MAPPING = 'PUT_MAPPING',
  GET_MAPPING = 'GET_MAPPING',
  POST_ALIAS = 'POST_ALIAS',
  GET_HEALTH = 'GET_HEALTH',
  GET_STATE = 'GET_STATE',
  GET_INFO = 'GET_INFO',
  HEAD_INDEX = 'HEAD_INDEX',
  PUT_AUTO_FOLLOW = 'PUT_AUTO_FOLLOW',
  PUT_CCR_FOLLOW = 'PUT_CCR_FOLLOW',
  PUT_SLM_POLICY = 'PUT_SLM_POLICY',
  PUT_SECURITY_ROLE_MAPPING = 'PUT_SECURITY_ROLE_MAPPING',
  PUT_ROLLUP_JOB = 'PUT_ROLLUP_JOB',
  PUT_SECURITY_API_KEY = 'PUT_SECURITY_API_KEY',
  PUT_INGEST_PIPELINE = 'PUT_INGEST_PIPELINE',
  PUT_TRANSFORM = 'PUT_TRANSFORM',
  POST_ML_INFER = 'POST_ML_INFER',
  POST_MULTI_SEARCH = 'POST_MULTI_SEARCH',
  POST_OPEN_INDEX = 'POST_OPEN_INDEX',
  PUT_COMPONENT_TEMPLATE = 'PUT_COMPONENT_TEMPLATE',
  PUT_ENRICH_POLICY = 'PUT_ENRICH_POLICY',
  PUT_TEMPLATE = 'PUT_TEMPLATE',
}

export enum EngineType {
  ELASTICSEARCH = 'ELASTICSEARCH',
  OPENSEARCH = 'OPENSEARCH',
}

export type Monaco = typeof monaco.editor.create;
export type Editor = ReturnType<Monaco>;
