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
} from './types';

/**
 * Configuration for the completion provider
 */
export interface CompletionConfig {
  backend: BackendType;
  version?: string;
}

// Default configuration
let currentConfig: CompletionConfig = {
  backend: BackendType.ELASTICSEARCH,
};

/**
 * Set the completion configuration (backend and version)
 */
export function setCompletionConfig(config: CompletionConfig): void {
  currentConfig = config;
}

/**
 * Get the current completion configuration
 */
export function getCompletionConfig(): CompletionConfig {
  return currentConfig;
}

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
function getCompletionContext(
  model: monaco.editor.ITextModel,
  position: monaco.Position,
): CompletionContext {
  const lineContent = model.getLineContent(position.lineNumber);
  const textUntilPosition = lineContent.substring(0, position.column - 1);
  
  // Check if we're at the start of a line (expecting method)
  const trimmedLine = textUntilPosition.trim();
  const methodMatch = /^(GET|POST|PUT|DELETE|HEAD|PATCH|OPTIONS)?\s*/i.exec(trimmedLine);
  
  // If line is empty or has partial method
  if (!trimmedLine || (methodMatch && !methodMatch[1])) {
    return {
      backend: currentConfig.backend,
      version: currentConfig.version,
      position: 'method',
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
}

/**
 * Find the method and path for a given line (search backwards)
 */
function findMethodAndPath(
  model: monaco.editor.ITextModel,
  lineNumber: number,
): { method?: HttpMethod; path?: string } {
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
}

/**
 * Get the JSON path at the current position in the body
 */
function getBodyPath(text: string, offset: number): string[] | null {
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
        const nextToken = tokens.find(t => t.start > token.end && t.type !== TokenType.WHITESPACE);
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
}

/**
 * Provide method completions
 */
function provideMethodCompletions(): monaco.languages.CompletionItem[] {
  return httpMethods.map(({ label, insertText }) => ({
    label,
    kind: monaco.languages.CompletionItemKind.Keyword,
    insertText,
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.None,
    detail: `HTTP ${label} method`,
    sortText: '0' + label,
  } as monaco.languages.CompletionItem));
}

/**
 * Provide path completions based on API spec
 */
function providePathCompletions(
  context: CompletionContext,
  range: monaco.Range,
): monaco.languages.CompletionItem[] {
  const { backend, version, method, path } = context;
  const endpoints = apiSpecProvider.getEndpoints(backend, version);
  
  // Filter endpoints by method
  const filteredEndpoints = method
    ? endpoints.filter(e => e.methods.includes(method))
    : endpoints;

  // Get unique path segments
  const pathPrefix = path || '/';
  const seenPaths = new Set<string>();
  const completions: monaco.languages.CompletionItem[] = [];

  for (const endpoint of filteredEndpoints) {
    // Generate completion based on current path prefix
    let insertText = endpoint.path;
    
    // If user has typed part of the path, filter appropriately
    if (pathPrefix !== '/' && !endpoint.path.startsWith(pathPrefix)) {
      // Check for partial match
      if (!pathStartsWithPattern(endpoint.path, pathPrefix)) {
        continue;
      }
    }

    // Avoid duplicates
    if (seenPaths.has(insertText)) continue;
    seenPaths.add(insertText);

    // Convert path params to snippets
    let snippetText = insertText;
    let snippetIndex = 1;
    snippetText = snippetText.replace(/\{([^}]+)\}/g, (_match, param) => {
      return `\${${snippetIndex++}:${param}}`;
    });

    completions.push({
      label: insertText,
      kind: monaco.languages.CompletionItemKind.Function,
      insertText: snippetText,
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: endpoint.description,
      documentation: endpoint.docUrl
        ? { value: `[Documentation](${endpoint.docUrl})`, isTrusted: true }
        : undefined,
      sortText: '1' + insertText,
      range,
    });
  }

  return completions;
}

/**
 * Check if a path pattern starts with a prefix (handling placeholders)
 */
function pathStartsWithPattern(pattern: string, prefix: string): boolean {
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
}

/**
 * Provide body completions (Query DSL)
 */
function provideBodyCompletions(
  context: CompletionContext,
  range: monaco.Range,
): monaco.languages.CompletionItem[] {
  const { backend, version, path, bodyPath = [] } = context;
  const completions: monaco.languages.CompletionItem[] = [];
  
  // Determine what we're completing based on the body path
  if (bodyPath.length === 0) {
    // Root level of body - provide top-level fields
    const rootFields = getRootBodyFields(path);
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
}

/**
 * Find a query type in the body path
 */
function findQueryTypeInPath(bodyPath: string[]): string | null {
  for (const segment of bodyPath) {
    if (allQueries[segment]) {
      return segment;
    }
  }
  return null;
}

/**
 * Get root body fields based on the endpoint path
 */
function getRootBodyFields(path?: string): Array<{ label: string; snippet: string; description: string }> {
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

  // Default fields for generic endpoints
  return [];
}

/**
 * Get aggregation types for completion
 */
function getAggregationTypes(): Array<{ name: string; snippet: string; description: string }> {
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
}

/**
 * Main completion provider function for Monaco
 */
export function grammarCompletionProvider(
  model: monaco.editor.ITextModel,
  position: monaco.Position,
): monaco.languages.CompletionList {
  const context = getCompletionContext(model, position);
  
  // Get the word at position for filtering
  const wordInfo = model.getWordUntilPosition(position);
  const range = new monaco.Range(
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
    case 'path':
      suggestions = providePathCompletions(context, range);
      break;
    case 'body':
      suggestions = provideBodyCompletions(context, range);
      break;
    case 'queryParam':
      // TODO: Implement query parameter completions
      break;
  }

  return {
    suggestions,
  };
}

// Export all components
export * from './types';
export { apiSpecProvider } from './apiSpec';
export { queryDslProvider } from './queryDsl';
export { tokenize } from './lexer';
export type { Token } from './types';
