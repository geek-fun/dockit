/**
 * Types for the grammar-driven completion engine
 */

/**
 * Backend type enumeration
 */
export enum BackendType {
  ELASTICSEARCH = 'ELASTICSEARCH',
  OPENSEARCH = 'OPENSEARCH',
}

/**
 * HTTP method types
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD' | 'PATCH' | 'OPTIONS';

/**
 * Version range specification
 */
export type VersionRange = {
  min?: string;
  max?: string;
};

/**
 * API Endpoint definition from spec
 */
export type ApiEndpoint = {
  path: string;
  methods: HttpMethod[];
  description?: string;
  descriptionKey?: string; // i18n key for description translation
  deprecated?: boolean;
  docUrl?: string;
  pathParams?: PathParam[];
  queryParams?: QueryParam[];
  requestBody?: RequestBody;
  availability?: {
    [key in BackendType]?: VersionRange;
  };
};

/**
 * Path parameter definition
 */
export type PathParam = {
  name: string;
  type: string;
  description?: string;
  required?: boolean;
};

/**
 * Query parameter definition
 */
export type QueryParam = {
  name: string;
  type: string;
  description?: string;
  required?: boolean;
  default?: string | number | boolean;
  enum?: string[];
};

/**
 * Request body definition
 */
export type RequestBody = {
  description?: string;
  required?: boolean;
  properties?: { [key: string]: BodyProperty };
};

/**
 * Body property definition
 */
export type BodyProperty = {
  type: string;
  description?: string;
  required?: boolean;
  properties?: { [key: string]: BodyProperty };
  items?: BodyProperty;
  enum?: string[];
  default?: string | number | boolean;
};

/**
 * Completion context
 */
export type CompletionContext = {
  backend: BackendType;
  version?: string;
  position: 'method' | 'path' | 'queryParam' | 'body';
  method?: HttpMethod;
  path?: string;
  bodyPath?: string[];
};

/**
 * Completion item
 */
export type CompletionItem = {
  label: string;
  kind: 'method' | 'path' | 'param' | 'keyword' | 'property' | 'value';
  detail?: string;
  documentation?: string;
  insertText?: string;
  deprecated?: boolean;
};

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
export type Token = {
  type: TokenType;
  value: string;
  start: number;
  end: number;
  line: number;
  column: number;
};

/**
 * Parsed action from editor content
 */
export type ParsedAction = {
  method: HttpMethod;
  path: string;
  queryParams?: { [key: string]: string };
  bodyTokens?: Token[];
  startLine: number;
  endLine: number;
};
