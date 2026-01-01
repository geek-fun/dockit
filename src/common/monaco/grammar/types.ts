/**
 * Types for the grammar-driven completion engine
 */

/**
 * Backend type enumeration
 */
export enum BackendType {
  ELASTICSEARCH = 'elasticsearch',
  OPENSEARCH = 'opensearch',
}

/**
 * HTTP method types
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD' | 'PATCH' | 'OPTIONS';

/**
 * Version range specification
 */
export interface VersionRange {
  min?: string;
  max?: string;
}

/**
 * API Endpoint definition from spec
 */
export interface ApiEndpoint {
  path: string;
  methods: HttpMethod[];
  description?: string;
  deprecated?: boolean;
  docUrl?: string;
  pathParams?: PathParam[];
  queryParams?: QueryParam[];
  requestBody?: RequestBody;
  availability?: {
    [key in BackendType]?: VersionRange;
  };
}

/**
 * Path parameter definition
 */
export interface PathParam {
  name: string;
  type: string;
  description?: string;
  required?: boolean;
}

/**
 * Query parameter definition
 */
export interface QueryParam {
  name: string;
  type: string;
  description?: string;
  required?: boolean;
  default?: string | number | boolean;
  enum?: string[];
}

/**
 * Request body definition
 */
export interface RequestBody {
  description?: string;
  required?: boolean;
  properties?: { [key: string]: BodyProperty };
}

/**
 * Body property definition
 */
export interface BodyProperty {
  type: string;
  description?: string;
  required?: boolean;
  properties?: { [key: string]: BodyProperty };
  items?: BodyProperty;
  enum?: string[];
  default?: string | number | boolean;
}

/**
 * Completion context
 */
export interface CompletionContext {
  backend: BackendType;
  version?: string;
  position: 'method' | 'path' | 'queryParam' | 'body';
  method?: HttpMethod;
  path?: string;
  bodyPath?: string[];
}

/**
 * Completion item
 */
export interface CompletionItem {
  label: string;
  kind: 'method' | 'path' | 'param' | 'keyword' | 'property' | 'value';
  detail?: string;
  documentation?: string;
  insertText?: string;
  deprecated?: boolean;
}

/**
 * Parser token types
 */
export enum TokenType {
  METHOD = 'method',
  PATH = 'path',
  QUERY_PARAM = 'queryParam',
  BODY_START = 'bodyStart',
  BODY_END = 'bodyEnd',
  KEY = 'key',
  VALUE = 'value',
  COLON = 'colon',
  COMMA = 'comma',
  WHITESPACE = 'whitespace',
  NEWLINE = 'newline',
  COMMENT = 'comment',
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  NULL = 'null',
  UNKNOWN = 'unknown',
}

/**
 * Token definition
 */
export interface Token {
  type: TokenType;
  value: string;
  start: number;
  end: number;
  line: number;
  column: number;
}

/**
 * Parsed action from editor content
 */
export interface ParsedAction {
  method: HttpMethod;
  path: string;
  queryParams?: { [key: string]: string };
  bodyTokens?: Token[];
  startLine: number;
  endLine: number;
}
