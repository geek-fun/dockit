/**
 * Grammar-driven Completion Provider
 * Provides intelligent completions for Elasticsearch/OpenSearch queries
 * based on API specifications and Query DSL definitions.
 */

import * as monaco from 'monaco-editor';
import { apiSpecProvider } from './apiSpec';
import { queryDslProvider, allQueries } from './queryDsl';
import { tokenize } from './lexer';
import {
  BackendType,
  CompletionContext,
  HttpMethod,
  TokenType,
  QueryParam,
} from './types';

/**
 * Configuration for the completion provider
 */
export type CompletionConfig = {
  backend: BackendType;
  version?: string;
};

/**
 * Dynamic options for path parameter completions
 * These are fetched from the connected database
 */
export type DynamicCompletionOptions = {
  /** Selected/active index name from toolbar */
  activeIndex?: string;
  /** All available indices in the connected cluster */
  indices?: string[];
  /** Available snapshot repositories */
  repositories?: string[];
  /** Available templates */
  templates?: string[];
  /** Available pipelines */
  pipelines?: string[];
  /** Available aliases */
  aliases?: string[];
};

// Default configuration
let currentConfig: CompletionConfig = {
  backend: BackendType.ELASTICSEARCH,
};

// Dynamic options for path parameter completions
let dynamicOptions: DynamicCompletionOptions = {};

/**
 * Set the completion configuration (backend and version)
 */
export const setCompletionConfig = (config: CompletionConfig): void => {
  currentConfig = config;
};

/**
 * Get the current completion configuration
 */
export const getCompletionConfig = (): CompletionConfig => {
  return currentConfig;
};

/**
 * Set dynamic completion options (indices, repositories, templates from connected database)
 */
export const setDynamicOptions = (options: DynamicCompletionOptions): void => {
  dynamicOptions = options;
};

/**
 * Get current dynamic completion options
 */
export const getDynamicOptions = (): DynamicCompletionOptions => {
  return dynamicOptions;
};

/**
 * HTTP methods with their completions
 */
const httpMethods: Array<{ label: string; insertText: string }> = [
  { label: 'GET', insertText: 'GET ' },
  { label: 'POST', insertText: 'POST ' },
  { label: 'PUT', insertText: 'PUT ' },
  { label: 'DELETE', insertText: 'DELETE ' },
  { label: 'HEAD', insertText: 'HEAD ' },
  { label: 'PATCH', insertText: 'PATCH ' },
  { label: 'OPTIONS', insertText: 'OPTIONS ' },
];

/**
 * Determine the completion context from the current position
 */
const getCompletionContext = (
  model: monaco.editor.ITextModel,
  position: monaco.Position,
): CompletionContext => {
  const lineContent = model.getLineContent(position.lineNumber);
  const textUntilPosition = lineContent.substring(0, position.column - 1);
  const trimmedLine = textUntilPosition.trim();
  
  // If line is empty, check if we should suggest methods or body content
  if (!trimmedLine) {
    // Check if we're inside a body by looking at the full document
    const fullText = model.getValue();
    const offset = model.getOffsetAt(position);
    const bodyPath = getBodyPath(fullText, offset);
    
    if (bodyPath) {
      // We're inside a body, provide body completions
      const { method, path } = findMethodAndPath(model, position.lineNumber);
      return {
        backend: currentConfig.backend,
        version: currentConfig.version,
        position: 'body',
        method,
        path,
        bodyPath,
      };
    }
    
    // Not inside a body, suggest method
    return {
      backend: currentConfig.backend,
      version: currentConfig.version,
      position: 'method',
    };
  }
  
  // Check if line starts with a partial HTTP method (suggesting methods)
  const partialMethodMatch = /^(G|GE|GET|P|PO|POS|POST|PU|PUT|D|DE|DEL|DELE|DELET|DELETE|H|HE|HEA|HEAD|PA|PAT|PATC|PATCH|O|OP|OPT|OPTI|OPTIO|OPTION|OPTIONS)$/i.exec(trimmedLine);
  if (partialMethodMatch) {
    return {
      backend: currentConfig.backend,
      version: currentConfig.version,
      position: 'method',
    };
  }

  // Check if we're completing query parameters (path contains ?)
  const queryParamMatch = /^(GET|POST|PUT|DELETE|HEAD|PATCH|OPTIONS)\s+(\S+\?[^?\s]*)$/i.exec(trimmedLine);
  if (queryParamMatch) {
    const fullPath = queryParamMatch[2];
    const [basePath] = fullPath.split('?');
    return {
      backend: currentConfig.backend,
      version: currentConfig.version,
      position: 'queryParam',
      method: queryParamMatch[1].toUpperCase() as HttpMethod,
      path: basePath,
    };
  }

  // If we have a complete method followed by space, we're completing path
  const methodPathMatch = /^(GET|POST|PUT|DELETE|HEAD|PATCH|OPTIONS)\s+(\S*)?$/i.exec(trimmedLine);
  if (methodPathMatch) {
    return {
      backend: currentConfig.backend,
      version: currentConfig.version,
      position: 'path',
      method: methodPathMatch[1].toUpperCase() as HttpMethod,
      path: methodPathMatch[2] || '',
    };
  }

  // Check if we're inside a body (JSON)
  const fullText = model.getValue();
  const offset = model.getOffsetAt(position);
  
  const bodyPath = getBodyPath(fullText, offset);
  if (bodyPath) {
    // Find the method and path for this block
    const { method, path } = findMethodAndPath(model, position.lineNumber);
    
    return {
      backend: currentConfig.backend,
      version: currentConfig.version,
      position: 'body',
      method,
      path,
      bodyPath,
    };
  }

  // Default to body completion
  return {
    backend: currentConfig.backend,
    version: currentConfig.version,
    position: 'body',
    bodyPath: [],
  };
};

/**
 * Find the method and path for a given line (search backwards)
 */
const findMethodAndPath = (
  model: monaco.editor.ITextModel,
  lineNumber: number,
): { method?: HttpMethod; path?: string } => {
  for (let line = lineNumber; line >= 1; line--) {
    const content = model.getLineContent(line);
    const match = /^(GET|POST|PUT|DELETE|HEAD|PATCH|OPTIONS)\s+(\S+)/i.exec(content);
    if (match) {
      return {
        method: match[1].toUpperCase() as HttpMethod,
        path: match[2].split('?')[0], // Remove query params
      };
    }
  }
  return {};
};

/**
 * Get the JSON path at the current position in the body
 */
const getBodyPath = (text: string, offset: number): string[] | null => {
  const tokens = tokenize(text);
  const pathStack: string[] = [];
  let inBody = false;
  let lastKey: string | null = null;
  
  for (const token of tokens) {
    if (token.start >= offset) break;
    
    switch (token.type) {
      case TokenType.BODY_START:
        if (token.value === '{') {
          inBody = true;
          if (lastKey) {
            pathStack.push(lastKey);
            lastKey = null;
          }
        }
        break;
      case TokenType.BODY_END:
        if (token.value === '}') {
          pathStack.pop();
          lastKey = null;
        }
        break;
      case TokenType.KEY:
      case TokenType.STRING:
        // Check if this is a key (followed by colon)
        // Use >= to include tokens that start right at the end of the current token
        const nextToken = tokens.find(t => 
          t.start >= token.end && 
          t.type !== TokenType.WHITESPACE && 
          t.type !== TokenType.NEWLINE
        );
        if (nextToken?.type === TokenType.COLON) {
          lastKey = token.value.replace(/['"]/g, '');
        }
        break;
      case TokenType.COLON:
        // After a colon, we're expecting a value
        break;
      case TokenType.COMMA:
        lastKey = null;
        break;
    }
  }

  return inBody ? pathStack : null;
};

/**
 * Provide method completions
 */
const provideMethodCompletions = (): monaco.languages.CompletionItem[] => {
  return httpMethods.map(({ label, insertText }) => ({
    label,
    kind: monaco.languages.CompletionItemKind.Keyword,
    insertText,
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.None,
    detail: `HTTP ${label} method`,
    sortText: '0' + label,
  } as monaco.languages.CompletionItem));
};

/**
 * Get default value for a path parameter based on dynamic options
 */
const getPathParamDefault = (paramName: string): string => {
  const lowerParam = paramName.toLowerCase();
  
  // Use activeIndex for index placeholders
  if (lowerParam === 'index') {
    if (dynamicOptions.activeIndex) {
      return dynamicOptions.activeIndex;
    }
    // Fallback to first available index if no active index
    if (dynamicOptions.indices && dynamicOptions.indices.length > 0) {
      return dynamicOptions.indices[0];
    }
  }
  
  // Use first available repository for repository placeholders
  if (lowerParam === 'repository') {
    if (dynamicOptions.repositories && dynamicOptions.repositories.length > 0) {
      return dynamicOptions.repositories[0];
    }
  }
  
  // Use first available template for template placeholders
  if (lowerParam === 'template') {
    if (dynamicOptions.templates && dynamicOptions.templates.length > 0) {
      return dynamicOptions.templates[0];
    }
  }
  
  // Use first available pipeline for pipeline placeholders
  if (lowerParam === 'pipeline') {
    if (dynamicOptions.pipelines && dynamicOptions.pipelines.length > 0) {
      return dynamicOptions.pipelines[0];
    }
  }
  
  // Use first available alias for alias placeholders
  if (lowerParam === 'alias') {
    if (dynamicOptions.aliases && dynamicOptions.aliases.length > 0) {
      return dynamicOptions.aliases[0];
    }
  }
  
  // Return original param name as default
  return paramName;
};

/**
 * Provide path completions based on API spec
 */
const providePathCompletions = (
  context: CompletionContext,
  range: monaco.Range,
): monaco.languages.CompletionItem[] => {
  const { backend, version, method, path } = context;
  const endpoints = apiSpecProvider.getEndpoints(backend, version);
  
  // Filter endpoints by method
  const filteredEndpoints = method
    ? endpoints.filter(e => e.methods.includes(method))
    : endpoints;

  // Determine if user started path with slash or not
  const userTypedPath = path || '';
  const userStartedWithSlash = userTypedPath.startsWith('/');
  
  // Normalize path for comparison (remove leading slash)
  const normalizedUserPath = userTypedPath.replace(/^\//, '');

  // Get unique path segments
  const seenPaths = new Set<string>();
  const completions: monaco.languages.CompletionItem[] = [];
  
  // Check if user is typing after an index name (e.g., test_index/ or test_index/_)
  // Pattern: something followed by /
  const indexWithSlashMatch = /^([^/]+)\/$/.exec(normalizedUserPath);
  const indexWithPartialEndpoint = /^([^/]+)\/(_[^/]*)$/.exec(normalizedUserPath);
  
  // If user has typed an index name followed by slash, suggest endpoints
  if (indexWithSlashMatch || indexWithPartialEndpoint) {
    const indexName = indexWithSlashMatch ? indexWithSlashMatch[1] : indexWithPartialEndpoint?.[1];
    const partialEndpoint = indexWithPartialEndpoint ? indexWithPartialEndpoint[2] : '';
    
    // Provide index-specific endpoints
    const indexEndpoints = getIndexSpecificEndpoints();
    for (const ep of indexEndpoints) {
      // Filter by partial endpoint if typed
      if (partialEndpoint && !ep.path.toLowerCase().startsWith(partialEndpoint.toLowerCase())) {
        continue;
      }
      
      // Check if method matches
      if (method && !ep.methods.includes(method)) {
        continue;
      }
      
      const fullPath = userStartedWithSlash 
        ? `/${indexName}/${ep.path}` 
        : `${indexName}/${ep.path}`;
      
      if (seenPaths.has(fullPath)) continue;
      seenPaths.add(fullPath);
      
      // Determine sort priority - _search endpoints first
      const sortPrefix = ep.path.includes('_search') ? '0' : '1';
      
      completions.push({
        label: fullPath,
        kind: monaco.languages.CompletionItemKind.Function,
        insertText: fullPath,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.None,
        detail: ep.description,
        sortText: sortPrefix + fullPath,
        range,
      });
    }
  }

  // Add index name completions from dynamic options
  // Only show when user is typing something that could be an index name (not starting with _)
  const isTypingIndexName = normalizedUserPath && 
    !normalizedUserPath.startsWith('_') && 
    !normalizedUserPath.includes('/');
  
  if (isTypingIndexName && dynamicOptions.indices && dynamicOptions.indices.length > 0) {
    for (const indexName of dynamicOptions.indices) {
      // Filter by what user typed
      if (!indexName.toLowerCase().startsWith(normalizedUserPath.toLowerCase())) {
        continue;
      }
      
      const fullPath = userStartedWithSlash ? `/${indexName}` : indexName;
      
      if (seenPaths.has(fullPath)) continue;
      seenPaths.add(fullPath);
      
      completions.push({
        label: fullPath,
        kind: monaco.languages.CompletionItemKind.Variable,
        insertText: fullPath,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.None,
        detail: 'Index',
        sortText: '0' + fullPath, // Prioritize index names
        range,
      });
    }
  }

  for (const endpoint of filteredEndpoints) {
    // Normalize endpoint path for comparison
    const normalizedEndpointPath = endpoint.path.replace(/^\//, '');
    
    // If user has typed part of the path, filter appropriately
    if (normalizedUserPath) {
      // Check if endpoint path starts with what user typed (case-insensitive prefix match)
      if (!pathStartsWithPattern('/' + normalizedEndpointPath, '/' + normalizedUserPath)) {
        continue;
      }
    }

    // Determine the label and insert text based on user's slash preference
    // If user started with slash, keep the slash; otherwise, omit it
    const label = userStartedWithSlash ? endpoint.path : normalizedEndpointPath;
    const insertPath = userStartedWithSlash ? endpoint.path : normalizedEndpointPath;

    // Avoid duplicates
    if (seenPaths.has(label)) continue;
    seenPaths.add(label);

    // Convert path params to snippets with dynamic defaults
    let snippetText = insertPath;
    let snippetIndex = 1;
    snippetText = snippetText.replace(/\{([^}]+)\}/g, (_match, param) => {
      const defaultValue = getPathParamDefault(param);
      return `\${${snippetIndex++}:${defaultValue}}`;
    });
    
    // Determine sort priority - _search endpoints should be prioritized
    let sortPrefix = '1';
    if (endpoint.path.includes('_search')) {
      sortPrefix = '0a'; // Higher priority for _search
    } else if (endpoint.path.includes('{index}/_search')) {
      sortPrefix = '0b'; // Second priority for {index}/_search
    }

    completions.push({
      label,
      kind: monaco.languages.CompletionItemKind.Function,
      insertText: snippetText,
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: endpoint.description,
      documentation: endpoint.docUrl
        ? { value: `[Documentation](${endpoint.docUrl})`, isTrusted: true }
        : undefined,
      sortText: sortPrefix + label,
      range,
    });
  }

  return completions;
};

/**
 * Get index-specific endpoints for completion after an index name
 */
const getIndexSpecificEndpoints = (): Array<{ path: string; methods: HttpMethod[]; description: string }> => {
  return [
    { path: '_search', methods: ['GET', 'POST'], description: 'Search documents' },
    { path: '_count', methods: ['GET', 'POST'], description: 'Count documents' },
    { path: '_doc', methods: ['POST'], description: 'Index a document' },
    { path: '_doc/{id}', methods: ['GET', 'PUT', 'DELETE'], description: 'Get/index/delete document by ID' },
    { path: '_update/{id}', methods: ['POST'], description: 'Update document' },
    { path: '_bulk', methods: ['POST'], description: 'Bulk operations' },
    { path: '_mapping', methods: ['GET', 'PUT'], description: 'Index mappings' },
    { path: '_settings', methods: ['GET', 'PUT'], description: 'Index settings' },
    { path: '_refresh', methods: ['POST'], description: 'Refresh index' },
    { path: '_flush', methods: ['POST'], description: 'Flush index' },
    { path: '_forcemerge', methods: ['POST'], description: 'Force merge' },
    { path: '_open', methods: ['POST'], description: 'Open index' },
    { path: '_close', methods: ['POST'], description: 'Close index' },
    { path: '_alias/{alias}', methods: ['GET', 'PUT', 'DELETE', 'HEAD'], description: 'Index alias' },
    { path: '_analyze', methods: ['GET', 'POST'], description: 'Analyze text' },
    { path: '_validate/query', methods: ['GET', 'POST'], description: 'Validate query' },
    { path: '_msearch', methods: ['GET', 'POST'], description: 'Multi search' },
    { path: '_explain/{id}', methods: ['GET', 'POST'], description: 'Explain scoring' },
    { path: '_terms_enum', methods: ['GET', 'POST'], description: 'Terms enumeration' },
    { path: '_update_by_query', methods: ['POST'], description: 'Update by query' },
    { path: '_delete_by_query', methods: ['POST'], description: 'Delete by query' },
    { path: '_cache/clear', methods: ['POST'], description: 'Clear cache' },
    { path: '_recovery', methods: ['GET'], description: 'Recovery status' },
    { path: '_segments', methods: ['GET'], description: 'Index segments' },
    { path: '_stats', methods: ['GET'], description: 'Index stats' },
    { path: '_search_shards', methods: ['GET', 'POST'], description: 'Search shards' },
    { path: '_field_caps', methods: ['GET', 'POST'], description: 'Field capabilities' },
  ];
};

/**
 * Check if a path pattern starts with a prefix (handling placeholders)
 */
const pathStartsWithPattern = (pattern: string, prefix: string): boolean => {
  const patternParts = pattern.split('/').filter(Boolean);
  const prefixParts = prefix.split('/').filter(Boolean);
  
  for (let i = 0; i < prefixParts.length; i++) {
    const patternPart = patternParts[i];
    const prefixPart = prefixParts[i];
    
    if (!patternPart) return false;
    
    // If pattern part is a placeholder, it matches anything
    if (patternPart.startsWith('{') && patternPart.endsWith('}')) {
      continue;
    }
    
    // Exact match or prefix match for last part
    if (i === prefixParts.length - 1) {
      if (!patternPart.startsWith(prefixPart)) {
        return false;
      }
    } else if (patternPart !== prefixPart) {
      return false;
    }
  }
  
  return true;
};

/**
 * Provide query parameter completions based on API specifications
 */
const provideQueryParamCompletions = (
  context: CompletionContext,
  range: monaco.Range,
): monaco.languages.CompletionItem[] => {
  const { backend, version, method, path } = context;
  const completions: monaco.languages.CompletionItem[] = [];
  
  if (!path) return completions;
  
  // Find matching endpoint
  const endpoint = apiSpecProvider.findEndpoint(backend, path, method, version);
  if (!endpoint?.queryParams) return completions;
  
  for (const param of endpoint.queryParams) {
    const insertText = createQueryParamInsertText(param);
    
    completions.push({
      label: param.name,
      kind: monaco.languages.CompletionItemKind.Property,
      insertText,
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: param.description || `Query parameter: ${param.name}`,
      documentation: createQueryParamDocumentation(param),
      sortText: param.required ? '0' + param.name : '1' + param.name,
      range,
    });
  }
  
  return completions;
};

/**
 * Create insert text for a query parameter
 */
const createQueryParamInsertText = (param: QueryParam): string => {
  if (param.enum && param.enum.length > 0) {
    // For enum params, provide first value as placeholder
    return `${param.name}=\${1|${param.enum.join(',')}|}`;
  }
  if (param.type === 'boolean') {
    return `${param.name}=\${1|true,false|}`;
  }
  if (param.default !== undefined) {
    return `${param.name}=\${1:${param.default}}`;
  }
  return `${param.name}=\${1:value}`;
};

/**
 * Create documentation for a query parameter
 */
const createQueryParamDocumentation = (param: QueryParam): string => {
  const parts: string[] = [];
  
  if (param.description) {
    parts.push(param.description);
  }
  
  parts.push(`**Type:** ${param.type}`);
  
  if (param.required) {
    parts.push('**Required**');
  }
  
  if (param.default !== undefined) {
    parts.push(`**Default:** ${param.default}`);
  }
  
  if (param.enum && param.enum.length > 0) {
    parts.push(`**Values:** ${param.enum.join(', ')}`);
  }
  
  return parts.join('\n\n');
};

/**
 * Provide body completions (Query DSL)
 */
const provideBodyCompletions = (
  context: CompletionContext,
  range: monaco.Range,
): monaco.languages.CompletionItem[] => {
  const { backend, version, path, method, bodyPath = [] } = context;
  const completions: monaco.languages.CompletionItem[] = [];
  
  // Determine what we're completing based on the body path
  if (bodyPath.length === 0) {
    // Root level of body - provide top-level fields
    const rootFields = getRootBodyFields(path, method);
    for (const field of rootFields) {
      completions.push({
        label: field.label,
        kind: monaco.languages.CompletionItemKind.Property,
        insertText: field.snippet,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        detail: field.description,
        sortText: '0' + field.label,
        range,
      });
    }
  } else if (bodyPath[0] === 'settings') {
    // Inside settings - provide settings fields
    const settingsFields = getSettingsFields();
    for (const field of settingsFields) {
      completions.push({
        label: field.label,
        kind: monaco.languages.CompletionItemKind.Property,
        insertText: field.snippet,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        detail: field.description,
        sortText: '0' + field.label,
        range,
      });
    }
  } else if (bodyPath[0] === 'mappings') {
    // Inside mappings - determine depth
    if (bodyPath.length === 1) {
      // Direct inside mappings - provide mappings fields
      const mappingsFields = getMappingsFields();
      for (const field of mappingsFields) {
        completions.push({
          label: field.label,
          kind: monaco.languages.CompletionItemKind.Property,
          insertText: field.snippet,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: field.description,
          sortText: '0' + field.label,
          range,
        });
      }
    } else if (bodyPath.includes('properties')) {
      // Inside properties - provide field type options
      const fieldTypes = getFieldTypeOptions();
      for (const fieldType of fieldTypes) {
        completions.push({
          label: fieldType.label,
          kind: monaco.languages.CompletionItemKind.TypeParameter,
          insertText: fieldType.snippet,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: fieldType.description,
          sortText: '0' + fieldType.label,
          range,
        });
      }
    }
  } else if (bodyPath[0] === 'query' || bodyPath.includes('query')) {
    // Inside query - provide query types
    const queryTypes = queryDslProvider.getQueryTypes(backend, version);
    for (const [name, query] of Object.entries(queryTypes)) {
      completions.push({
        label: name,
        kind: monaco.languages.CompletionItemKind.Class,
        insertText: query.snippet,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        detail: query.description,
        documentation: query.docUrl
          ? { value: `[Documentation](${query.docUrl})`, isTrusted: true }
          : undefined,
        sortText: query.deprecated ? '9' + name : '1' + name,
        range,
      });
    }
    
    // Also provide nested query properties if we're inside a specific query
    if (bodyPath.length > 1) {
      const queryType = findQueryTypeInPath(bodyPath);
      if (queryType && allQueries[queryType]) {
        const props = allQueries[queryType].properties;
        if (props) {
          for (const [propName, prop] of Object.entries(props)) {
            if (propName === '*') continue;
            completions.push({
              label: propName,
              kind: monaco.languages.CompletionItemKind.Property,
              insertText: `${propName}: $0`,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              detail: prop.description,
              sortText: '2' + propName,
              range,
            });
          }
        }
      }
    }
  } else if (bodyPath[0] === 'aggs' || bodyPath[0] === 'aggregations') {
    // Inside aggregations - provide aggregation types
    const aggTypes = getAggregationTypes();
    for (const agg of aggTypes) {
      completions.push({
        label: agg.name,
        kind: monaco.languages.CompletionItemKind.Class,
        insertText: agg.snippet,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        detail: agg.description,
        sortText: '1' + agg.name,
        range,
      });
    }
  }

  return completions;
};

/**
 * Find a query type in the body path
 */
const findQueryTypeInPath = (bodyPath: string[]): string | null => {
  for (const segment of bodyPath) {
    if (allQueries[segment]) {
      return segment;
    }
  }
  return null;
};

/**
 * Get root body fields based on the endpoint path
 */
const getRootBodyFields = (path?: string, method?: HttpMethod): Array<{ label: string; snippet: string; description: string }> => {
  // Check if this is a search endpoint
  if (path?.includes('_search')) {
    return [
      { label: 'query', snippet: 'query: {\n\t$0\n}', description: 'Query DSL' },
      { label: 'from', snippet: 'from: ${1:0}', description: 'Starting offset' },
      { label: 'size', snippet: 'size: ${1:10}', description: 'Number of hits to return' },
      { label: 'sort', snippet: 'sort: [\n\t$0\n]', description: 'Sort order' },
      { label: '_source', snippet: '_source: $0', description: 'Source filtering' },
      { label: 'aggs', snippet: 'aggs: {\n\t"${1:agg_name}": {\n\t\t$0\n\t}\n}', description: 'Aggregations' },
      { label: 'highlight', snippet: 'highlight: {\n\tfields: {\n\t\t"${1:field}": {}\n\t}\n}', description: 'Highlighting' },
      { label: 'post_filter', snippet: 'post_filter: {\n\t$0\n}', description: 'Post filter' },
      { label: 'track_total_hits', snippet: 'track_total_hits: ${1:true}', description: 'Track total hits' },
      { label: 'explain', snippet: 'explain: ${1:true}', description: 'Explain scoring' },
      { label: 'timeout', snippet: 'timeout: "${1:10s}"', description: 'Search timeout' },
      { label: 'min_score', snippet: 'min_score: ${1:0.5}', description: 'Minimum score threshold' },
      { label: 'stored_fields', snippet: 'stored_fields: [$0]', description: 'Stored fields to retrieve' },
      { label: 'docvalue_fields', snippet: 'docvalue_fields: [$0]', description: 'Doc value fields' },
      { label: 'script_fields', snippet: 'script_fields: {\n\t"${1:field}": {\n\t\tscript: {\n\t\t\tsource: "$0"\n\t\t}\n\t}\n}', description: 'Script fields' },
      { label: 'rescore', snippet: 'rescore: {\n\tquery: {\n\t\trescore_query: {\n\t\t\t$0\n\t\t}\n\t}\n}', description: 'Query rescoring' },
      { label: 'collapse', snippet: 'collapse: {\n\tfield: "${1:field}"\n}', description: 'Field collapsing' },
      { label: 'search_after', snippet: 'search_after: [$0]', description: 'Search after for pagination' },
      { label: 'suggest', snippet: 'suggest: {\n\t"${1:suggest_name}": {\n\t\ttext: "${2:text}",\n\t\tterm: {\n\t\t\tfield: "${3:field}"\n\t\t}\n\t}\n}', description: 'Suggest queries' },
    ];
  }

  // Check if this is an update endpoint
  if (path?.includes('_update')) {
    return [
      { label: 'doc', snippet: 'doc: {\n\t$0\n}', description: 'Partial document' },
      { label: 'script', snippet: 'script: {\n\tsource: "$0"\n}', description: 'Update script' },
      { label: 'upsert', snippet: 'upsert: {\n\t$0\n}', description: 'Document to upsert' },
      { label: 'doc_as_upsert', snippet: 'doc_as_upsert: ${1:true}', description: 'Use doc as upsert' },
      { label: 'detect_noop', snippet: 'detect_noop: ${1:true}', description: 'Detect noop updates' },
    ];
  }

  // Check if this is a reindex endpoint
  if (path?.includes('_reindex')) {
    return [
      { label: 'source', snippet: 'source: {\n\tindex: "${1:source_index}"\n}', description: 'Source index configuration' },
      { label: 'dest', snippet: 'dest: {\n\tindex: "${1:dest_index}"\n}', description: 'Destination index configuration' },
      { label: 'script', snippet: 'script: {\n\tsource: "$0"\n}', description: 'Reindex script' },
      { label: 'max_docs', snippet: 'max_docs: ${1:1000}', description: 'Maximum documents' },
      { label: 'conflicts', snippet: 'conflicts: "${1:proceed}"', description: 'Conflict handling' },
    ];
  }

  // Check if this is an aliases endpoint
  if (path?.includes('_aliases')) {
    return [
      {
        label: 'actions',
        snippet: 'actions: [\n\t{\n\t\tadd: {\n\t\t\tindex: "${1:index_name}",\n\t\t\talias: "${2:alias_name}"\n\t\t}\n\t}\n]',
        description: 'Actions to perform on aliases (add, remove, remove_index)',
      },
    ];
  }

  // Check if this is an index creation (PUT /{index}) or mapping/settings endpoint
  // An index creation is typically PUT /index_name (path that doesn't start with _ after the leading /)
  const normalizedPath = path?.replace(/^\/+/, '') || '';
  const pathSegments = normalizedPath.split('/').filter(Boolean);
  const isIndexCreation = method === 'PUT' && 
    pathSegments.length === 1 && 
    !pathSegments[0].startsWith('_');
  
  if (isIndexCreation || path?.includes('_mapping') || path?.includes('_settings')) {
    return getIndexBodyFields();
  }

  // Default fields for generic endpoints
  return [];
};

/**
 * Get body fields for index creation (PUT /{index})
 */
const getIndexBodyFields = (): Array<{ label: string; snippet: string; description: string }> => {
  return [
    { label: 'settings', snippet: 'settings: {\n\t$0\n}', description: 'Index settings' },
    { label: 'mappings', snippet: 'mappings: {\n\tproperties: {\n\t\t$0\n\t}\n}', description: 'Index mappings' },
    { label: 'aliases', snippet: 'aliases: {\n\t"${1:alias_name}": {}\n}', description: 'Index aliases' },
  ];
};

/**
 * Get settings fields for completion
 */
const getSettingsFields = (): Array<{ label: string; snippet: string; description: string }> => {
  return [
    { label: 'number_of_shards', snippet: 'number_of_shards: ${1:1}', description: 'Number of primary shards' },
    { label: 'number_of_replicas', snippet: 'number_of_replicas: ${1:1}', description: 'Number of replica shards' },
    { label: 'refresh_interval', snippet: 'refresh_interval: "${1:1s}"', description: 'How often to refresh the index' },
    { label: 'max_result_window', snippet: 'max_result_window: ${1:10000}', description: 'Maximum value of from + size for searches' },
    { label: 'analysis', snippet: 'analysis: {\n\t$0\n}', description: 'Analysis settings' },
    { label: 'index.routing.allocation.include._tier_preference', snippet: 'index.routing.allocation.include._tier_preference: "${1:data_content}"', description: 'Tier preference for index routing' },
    { label: 'codec', snippet: 'codec: "${1|default,best_compression|}"', description: 'Compression codec' },
    { label: 'routing_partition_size', snippet: 'routing_partition_size: ${1:1}', description: 'Number of shards a custom routing value can go to' },
    { label: 'soft_deletes.retention_lease.period', snippet: 'soft_deletes.retention_lease.period: "${1:12h}"', description: 'Retention period for soft deletes' },
    { label: 'load_fixed_bitset_filters_eagerly', snippet: 'load_fixed_bitset_filters_eagerly: ${1:true}', description: 'Load fixed bitset filters eagerly' },
    { label: 'hidden', snippet: 'hidden: ${1:false}', description: 'Make the index hidden' },
    { label: 'priority', snippet: 'priority: ${1:1}', description: 'Recovery priority for index' },
    { label: 'auto_expand_replicas', snippet: 'auto_expand_replicas: "${1:0-1}"', description: 'Auto expand replicas based on cluster state' },
  ];
};

/**
 * Get mappings fields for completion
 */
const getMappingsFields = (): Array<{ label: string; snippet: string; description: string }> => {
  return [
    { label: 'properties', snippet: 'properties: {\n\t$0\n}', description: 'Field mappings' },
    { label: 'dynamic', snippet: 'dynamic: ${1|true,false,strict|}', description: 'Dynamic mapping behavior' },
    { label: '_source', snippet: '_source: {\n\tenabled: ${1:true}\n}', description: 'Source field configuration' },
    { label: '_routing', snippet: '_routing: {\n\trequired: ${1:false}\n}', description: 'Routing configuration' },
    { label: 'date_detection', snippet: 'date_detection: ${1:true}', description: 'Date detection in dynamic mapping' },
    { label: 'numeric_detection', snippet: 'numeric_detection: ${1:false}', description: 'Numeric detection in dynamic mapping' },
    { label: 'dynamic_templates', snippet: 'dynamic_templates: [\n\t{\n\t\t"${1:template_name}": {\n\t\t\tmatch: "${2:*}",\n\t\t\tmapping: {\n\t\t\t\ttype: "${3:keyword}"\n\t\t\t}\n\t\t}\n\t}\n]', description: 'Dynamic templates for field mapping' },
  ];
};

/**
 * Get field type options for properties
 */
const getFieldTypeOptions = (): Array<{ label: string; snippet: string; description: string }> => {
  return [
    { label: 'text', snippet: '{\n\ttype: "text"$0\n}', description: 'Text field for full-text search' },
    { label: 'keyword', snippet: '{\n\ttype: "keyword"$0\n}', description: 'Keyword field for exact matching' },
    { label: 'long', snippet: '{\n\ttype: "long"$0\n}', description: 'Long integer field' },
    { label: 'integer', snippet: '{\n\ttype: "integer"$0\n}', description: 'Integer field' },
    { label: 'short', snippet: '{\n\ttype: "short"$0\n}', description: 'Short integer field' },
    { label: 'byte', snippet: '{\n\ttype: "byte"$0\n}', description: 'Byte field' },
    { label: 'double', snippet: '{\n\ttype: "double"$0\n}', description: 'Double-precision floating point' },
    { label: 'float', snippet: '{\n\ttype: "float"$0\n}', description: 'Single-precision floating point' },
    { label: 'half_float', snippet: '{\n\ttype: "half_float"$0\n}', description: 'Half-precision floating point' },
    { label: 'scaled_float', snippet: '{\n\ttype: "scaled_float",\n\tscaling_factor: ${1:100}\n}', description: 'Scaled floating point' },
    { label: 'date', snippet: '{\n\ttype: "date"$0\n}', description: 'Date field' },
    { label: 'boolean', snippet: '{\n\ttype: "boolean"$0\n}', description: 'Boolean field' },
    { label: 'binary', snippet: '{\n\ttype: "binary"$0\n}', description: 'Binary field' },
    { label: 'integer_range', snippet: '{\n\ttype: "integer_range"$0\n}', description: 'Integer range field' },
    { label: 'float_range', snippet: '{\n\ttype: "float_range"$0\n}', description: 'Float range field' },
    { label: 'long_range', snippet: '{\n\ttype: "long_range"$0\n}', description: 'Long range field' },
    { label: 'double_range', snippet: '{\n\ttype: "double_range"$0\n}', description: 'Double range field' },
    { label: 'date_range', snippet: '{\n\ttype: "date_range"$0\n}', description: 'Date range field' },
    { label: 'ip_range', snippet: '{\n\ttype: "ip_range"$0\n}', description: 'IP range field' },
    { label: 'object', snippet: '{\n\ttype: "object",\n\tproperties: {\n\t\t$0\n\t}\n}', description: 'Object field' },
    { label: 'nested', snippet: '{\n\ttype: "nested",\n\tproperties: {\n\t\t$0\n\t}\n}', description: 'Nested object field' },
    { label: 'geo_point', snippet: '{\n\ttype: "geo_point"$0\n}', description: 'Geo-point field' },
    { label: 'geo_shape', snippet: '{\n\ttype: "geo_shape"$0\n}', description: 'Geo-shape field' },
    { label: 'ip', snippet: '{\n\ttype: "ip"$0\n}', description: 'IP address field' },
    { label: 'completion', snippet: '{\n\ttype: "completion"$0\n}', description: 'Completion suggester field' },
    { label: 'token_count', snippet: '{\n\ttype: "token_count",\n\tanalyzer: "${1:standard}"\n}', description: 'Token count field' },
    { label: 'percolator', snippet: '{\n\ttype: "percolator"$0\n}', description: 'Percolator query field' },
    { label: 'join', snippet: '{\n\ttype: "join",\n\trelations: {\n\t\t"${1:parent}": "${2:child}"\n\t}\n}', description: 'Join field for parent-child relations' },
    { label: 'rank_feature', snippet: '{\n\ttype: "rank_feature"$0\n}', description: 'Rank feature field' },
    { label: 'rank_features', snippet: '{\n\ttype: "rank_features"$0\n}', description: 'Rank features field' },
    { label: 'dense_vector', snippet: '{\n\ttype: "dense_vector",\n\tdims: ${1:128}\n}', description: 'Dense vector field' },
    { label: 'sparse_vector', snippet: '{\n\ttype: "sparse_vector"$0\n}', description: 'Sparse vector field' },
    { label: 'search_as_you_type', snippet: '{\n\ttype: "search_as_you_type"$0\n}', description: 'Search-as-you-type field' },
    { label: 'alias', snippet: '{\n\ttype: "alias",\n\tpath: "${1:field_path}"\n}', description: 'Field alias' },
    { label: 'flattened', snippet: '{\n\ttype: "flattened"$0\n}', description: 'Flattened object field' },
    { label: 'shape', snippet: '{\n\ttype: "shape"$0\n}', description: 'Arbitrary cartesian shape field' },
    { label: 'histogram', snippet: '{\n\ttype: "histogram"$0\n}', description: 'Pre-aggregated histogram field' },
    { label: 'constant_keyword', snippet: '{\n\ttype: "constant_keyword",\n\tvalue: "${1:value}"\n}', description: 'Constant keyword field' },
    { label: 'wildcard', snippet: '{\n\ttype: "wildcard"$0\n}', description: 'Wildcard field for pattern matching' },
    { label: 'version', snippet: '{\n\ttype: "version"$0\n}', description: 'Software version field' },
    { label: 'match_only_text', snippet: '{\n\ttype: "match_only_text"$0\n}', description: 'Space-optimized text field' },
  ];
};

/**
 * Get aggregation types for completion
 */
const getAggregationTypes = (): Array<{ name: string; snippet: string; description: string }> => {
  return [
    // Metric aggregations
    { name: 'avg', snippet: 'avg: {\n\tfield: "${1:field}"\n}', description: 'Average aggregation' },
    { name: 'sum', snippet: 'sum: {\n\tfield: "${1:field}"\n}', description: 'Sum aggregation' },
    { name: 'min', snippet: 'min: {\n\tfield: "${1:field}"\n}', description: 'Minimum aggregation' },
    { name: 'max', snippet: 'max: {\n\tfield: "${1:field}"\n}', description: 'Maximum aggregation' },
    { name: 'stats', snippet: 'stats: {\n\tfield: "${1:field}"\n}', description: 'Stats aggregation' },
    { name: 'extended_stats', snippet: 'extended_stats: {\n\tfield: "${1:field}"\n}', description: 'Extended stats aggregation' },
    { name: 'cardinality', snippet: 'cardinality: {\n\tfield: "${1:field}"\n}', description: 'Cardinality aggregation' },
    { name: 'value_count', snippet: 'value_count: {\n\tfield: "${1:field}"\n}', description: 'Value count aggregation' },
    { name: 'percentiles', snippet: 'percentiles: {\n\tfield: "${1:field}"\n}', description: 'Percentiles aggregation' },
    { name: 'percentile_ranks', snippet: 'percentile_ranks: {\n\tfield: "${1:field}",\n\tvalues: [${2:values}]\n}', description: 'Percentile ranks aggregation' },
    { name: 'top_hits', snippet: 'top_hits: {\n\tsize: ${1:3}\n}', description: 'Top hits aggregation' },
    
    // Bucket aggregations
    { name: 'terms', snippet: 'terms: {\n\tfield: "${1:field}"\n}', description: 'Terms aggregation' },
    { name: 'histogram', snippet: 'histogram: {\n\tfield: "${1:field}",\n\tinterval: ${2:10}\n}', description: 'Histogram aggregation' },
    { name: 'date_histogram', snippet: 'date_histogram: {\n\tfield: "${1:field}",\n\tcalendar_interval: "${2:day}"\n}', description: 'Date histogram aggregation' },
    { name: 'range', snippet: 'range: {\n\tfield: "${1:field}",\n\tranges: [\n\t\t{ to: ${2:50} },\n\t\t{ from: ${2:50}, to: ${3:100} },\n\t\t{ from: ${3:100} }\n\t]\n}', description: 'Range aggregation' },
    { name: 'date_range', snippet: 'date_range: {\n\tfield: "${1:field}",\n\tranges: [\n\t\t{ to: "${2:now-1M}" },\n\t\t{ from: "${2:now-1M}" }\n\t]\n}', description: 'Date range aggregation' },
    { name: 'filter', snippet: 'filter: {\n\t${1:query}\n}', description: 'Filter aggregation' },
    { name: 'filters', snippet: 'filters: {\n\tfilters: {\n\t\t"${1:filter_name}": {\n\t\t\t$0\n\t\t}\n\t}\n}', description: 'Filters aggregation' },
    { name: 'nested', snippet: 'nested: {\n\tpath: "${1:path}"\n}', description: 'Nested aggregation' },
    { name: 'reverse_nested', snippet: 'reverse_nested: {}', description: 'Reverse nested aggregation' },
    { name: 'global', snippet: 'global: {}', description: 'Global aggregation' },
    { name: 'missing', snippet: 'missing: {\n\tfield: "${1:field}"\n}', description: 'Missing aggregation' },
    { name: 'composite', snippet: 'composite: {\n\tsources: [\n\t\t{ "${1:name}": { terms: { field: "${2:field}" } } }\n\t]\n}', description: 'Composite aggregation' },
    { name: 'sampler', snippet: 'sampler: {\n\tshard_size: ${1:100}\n}', description: 'Sampler aggregation' },
    { name: 'significant_terms', snippet: 'significant_terms: {\n\tfield: "${1:field}"\n}', description: 'Significant terms aggregation' },
    { name: 'significant_text', snippet: 'significant_text: {\n\tfield: "${1:field}"\n}', description: 'Significant text aggregation' },
    { name: 'adjacency_matrix', snippet: 'adjacency_matrix: {\n\tfilters: {\n\t\t"${1:filter_name}": {\n\t\t\t$0\n\t\t}\n\t}\n}', description: 'Adjacency matrix aggregation' },
    { name: 'auto_date_histogram', snippet: 'auto_date_histogram: {\n\tfield: "${1:field}",\n\tbuckets: ${2:10}\n}', description: 'Auto date histogram aggregation' },
    
    // Pipeline aggregations
    { name: 'avg_bucket', snippet: 'avg_bucket: {\n\tbuckets_path: "${1:path}"\n}', description: 'Average bucket aggregation' },
    { name: 'sum_bucket', snippet: 'sum_bucket: {\n\tbuckets_path: "${1:path}"\n}', description: 'Sum bucket aggregation' },
    { name: 'min_bucket', snippet: 'min_bucket: {\n\tbuckets_path: "${1:path}"\n}', description: 'Min bucket aggregation' },
    { name: 'max_bucket', snippet: 'max_bucket: {\n\tbuckets_path: "${1:path}"\n}', description: 'Max bucket aggregation' },
    { name: 'stats_bucket', snippet: 'stats_bucket: {\n\tbuckets_path: "${1:path}"\n}', description: 'Stats bucket aggregation' },
    { name: 'derivative', snippet: 'derivative: {\n\tbuckets_path: "${1:path}"\n}', description: 'Derivative aggregation' },
    { name: 'cumulative_sum', snippet: 'cumulative_sum: {\n\tbuckets_path: "${1:path}"\n}', description: 'Cumulative sum aggregation' },
    { name: 'moving_avg', snippet: 'moving_avg: {\n\tbuckets_path: "${1:path}"\n}', description: 'Moving average aggregation' },
    { name: 'serial_diff', snippet: 'serial_diff: {\n\tbuckets_path: "${1:path}"\n}', description: 'Serial differencing aggregation' },
    { name: 'bucket_sort', snippet: 'bucket_sort: {\n\tsort: [\n\t\t{ "${1:field}": { order: "desc" } }\n\t]\n}', description: 'Bucket sort aggregation' },
    { name: 'bucket_selector', snippet: 'bucket_selector: {\n\tbuckets_path: {\n\t\t"${1:var}": "${2:path}"\n\t},\n\tscript: "${3:params.var > 10}"\n}', description: 'Bucket selector aggregation' },
    { name: 'bucket_script', snippet: 'bucket_script: {\n\tbuckets_path: {\n\t\t"${1:var}": "${2:path}"\n\t},\n\tscript: "${3:params.var * 2}"\n}', description: 'Bucket script aggregation' },
  ];
};

/**
 * Calculate the replacement range for path completions
 * This handles cases like `_cat/indi` where we need to replace the entire path
 */
const getPathRange = (
  model: monaco.editor.ITextModel,
  position: monaco.Position,
): monaco.Range => {
  const lineContent = model.getLineContent(position.lineNumber);
  
  // Find the start of the path (after the HTTP method and space)
  const methodMatch = /^(GET|POST|PUT|DELETE|HEAD|PATCH|OPTIONS)\s+/i.exec(lineContent);
  if (methodMatch) {
    const pathStart = methodMatch[0].length + 1; // 1-based column
    return new monaco.Range(
      position.lineNumber,
      pathStart,
      position.lineNumber,
      position.column,
    );
  }
  
  // Fallback to word-based range
  const wordInfo = model.getWordUntilPosition(position);
  return new monaco.Range(
    position.lineNumber,
    wordInfo.startColumn,
    position.lineNumber,
    position.column,
  );
};

/**
 * Main completion provider function for Monaco
 */
export const grammarCompletionProvider = (
  model: monaco.editor.ITextModel,
  position: monaco.Position,
): monaco.languages.CompletionList => {
  const context = getCompletionContext(model, position);
  
  // Get the word at position for filtering
  const wordInfo = model.getWordUntilPosition(position);
  const defaultRange = new monaco.Range(
    position.lineNumber,
    wordInfo.startColumn,
    position.lineNumber,
    position.column,
  );

  let suggestions: monaco.languages.CompletionItem[] = [];

  switch (context.position) {
    case 'method':
      suggestions = provideMethodCompletions();
      break;
    case 'path': {
      // Use a custom range for path completions to avoid duplication
      const pathRange = getPathRange(model, position);
      suggestions = providePathCompletions(context, pathRange);
      break;
    }
    case 'body':
      suggestions = provideBodyCompletions(context, defaultRange);
      break;
    case 'queryParam':
      suggestions = provideQueryParamCompletions(context, defaultRange);
      break;
  }

  return {
    suggestions,
  };
};

// Export all components
export * from './types';
export { apiSpecProvider } from './apiSpec';
export { queryDslProvider } from './queryDsl';
export { tokenize } from './lexer';
