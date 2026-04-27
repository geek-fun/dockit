import * as monaco from 'monaco-editor';
import {
  grammarCompletionProvider,
  setCompletionConfig,
  setDynamicOptions,
  BackendType,
} from '../../../../src/common/monaco/searchdsl/completionProvider';
import { apiSpecProvider } from '../../../../src/common/monaco/searchdsl/apiSpec';

jest.mock('monaco-editor', () => ({
  Range: class Range {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
    constructor(
      startLineNumber: number,
      startColumn: number,
      endLineNumber: number,
      endColumn: number,
    ) {
      this.startLineNumber = startLineNumber;
      this.startColumn = startColumn;
      this.endLineNumber = endLineNumber;
      this.endColumn = endColumn;
    }
  },
  languages: {
    CompletionItemKind: { Keyword: 17, Function: 1, Property: 9, Class: 5, Value: 12 },
    CompletionItemInsertTextRule: { None: 0, InsertAsSnippet: 4 },
  },
}));

const createMockModel = (text: string): monaco.editor.ITextModel => {
  const lines = text.split('\n');
  return {
    getValue: () => text,
    getLineContent: (lineNumber: number) => lines[lineNumber - 1] || '',
    getOffsetAt: (pos: { lineNumber: number; column: number }) => {
      let offset = 0;
      for (let i = 0; i < pos.lineNumber - 1; i++) offset += lines[i].length + 1;
      return offset + pos.column - 1;
    },
    getWordUntilPosition: (pos: { lineNumber: number; column: number }) => {
      const line = lines[pos.lineNumber - 1] || '';
      const before = line.substring(0, pos.column - 1);
      const match = before.match(/[a-zA-Z_][a-zA-Z0-9_]*$/);
      return match
        ? { word: match[0], startColumn: pos.column - match[0].length, endColumn: pos.column }
        : { word: '', startColumn: pos.column, endColumn: pos.column };
    },
  } as monaco.editor.ITextModel;
};

const suggestionsFor = (text: string) => {
  const model = createMockModel(text);
  const position = { lineNumber: 1, column: text.length + 1 };
  return grammarCompletionProvider(model, position as monaco.Position).suggestions;
};

const labelsFor = (text: string) => suggestionsFor(text).map(s => s.label);

const concretePath = (pattern: string): string =>
  pattern
    .replace(/\{index\}/g, 'my_index')
    .replace(/\{id\}/g, '1')
    .replace(/\{alias\}/g, 'my_alias')
    .replace(/\{template\}/g, 'my_template')
    .replace(/\{repository\}/g, 'my_repo')
    .replace(/\{snapshot\}/g, 'my_snapshot')
    .replace(/\{task_id\}/g, 'abc123')
    .replace(/\{pipeline\}/g, 'my_pipeline')
    .replace(/\{transform_id\}/g, 'my_transform')
    .replace(/\{data_stream\}/g, 'my_stream')
    .replace(/\{policy\}/g, 'my_policy')
    .replace(/\{job_id\}/g, 'my_job')
    .replace(/\{watch_id\}/g, 'my_watch')
    .replace(/\{job_id\}/g, 'my_job')
    .replace(/\{model_id\}/g, 'my_model')
    .replace(/\{username\}/g, 'admin')
    .replace(/\{role\}/g, 'my_role')
    .replace(/\{detector_id\}/g, 'det1')
    .replace(/\{monitor_id\}/g, 'mon1')
    .replace(/\{channel_id\}/g, 'chan1')
    .replace(/\{[^}]+\}/g, 'fixture_value');

const assertQueryParamCompletions = (
  backend: BackendType,
  version: string,
  method: string,
  path: string,
) => {
  const endpoint = apiSpecProvider.findEndpoint(backend, path, method as never, version);
  if (!endpoint?.queryParams?.length) return;

  const text = `${method} ${path}?`;

  it(`${method} ${path} — param names`, () => {
    const labels = labelsFor(text);
    endpoint.queryParams!.forEach(p => {
      expect(labels).toContain(p.name);
    });
  });

  endpoint
    .queryParams!.filter(p => p.enum?.length)
    .forEach(p => {
      it(`${method} ${path} — ${p.name} enum values`, () => {
        const valueText = `${text}${p.name}=`;
        const labels = labelsFor(valueText);
        p.enum!.forEach(v => expect(labels).toContain(v));
      });
    });

  endpoint
    .queryParams!.filter(p => p.type === 'boolean')
    .forEach(p => {
      it(`${method} ${path} — ${p.name} boolean values`, () => {
        const valueText = `${text}${p.name}=`;
        const labels = labelsFor(valueText);
        expect(labels).toContain('true');
        expect(labels).toContain('false');
      });
    });
};

describe('apiSpec compliance — common endpoints (Elasticsearch)', () => {
  beforeEach(() => {
    setCompletionConfig({ backend: BackendType.ELASTICSEARCH, version: '8.0.0' });
    setDynamicOptions({ indices: ['my_index'], activeIndex: 'my_index' });
  });

  const esVersion = '8.0.0';

  const commonCases: Array<[string, string]> = [
    ['GET', '/_search'],
    ['GET', '/my_index/_search'],
    ['GET', '/_count'],
    ['GET', '/my_index/_count'],
    ['POST', '/my_index/_doc'],
    ['GET', '/my_index/_doc/1'],
    ['POST', '/_bulk'],
    ['POST', '/my_index/_bulk'],
    ['GET', '/my_index/_mapping'],
    ['GET', '/my_index/_settings'],
    ['POST', '/my_index/_open'],
    ['POST', '/my_index/_close'],
    ['POST', '/my_index/_refresh'],
    ['POST', '/my_index/_flush'],
    ['POST', '/my_index/_forcemerge'],
    ['PUT', '/my_index/_alias/my_alias'],
    ['GET', '/_cat/indices'],
    ['GET', '/_cat/health'],
    ['GET', '/_cat/nodes'],
    ['GET', '/_cat/shards'],
    ['GET', '/_cat/aliases'],
    ['GET', '/_cat/templates'],
    ['GET', '/_cat/allocation'],
    ['GET', '/_cluster/health'],
    ['GET', '/_cluster/state'],
    ['GET', '/_cluster/stats'],
    ['GET', '/_cluster/settings'],
    ['POST', '/_cluster/allocation/explain'],
    ['POST', '/_cluster/reroute'],
    ['GET', '/_nodes'],
    ['GET', '/_nodes/stats'],
    ['GET', '/_nodes/hot_threads'],
    ['GET', '/_template/my_template'],
    ['GET', '/_index_template/my_template'],
    ['GET', '/_component_template/my_template'],
    ['GET', '/my_index/_analyze'],
    ['GET', '/my_index/_validate/query'],
    ['GET', '/_msearch'],
    ['GET', '/my_index/_msearch'],
    ['GET', '/my_index/_explain/1'],
    ['POST', '/_reindex'],
    ['POST', '/my_index/_update_by_query'],
    ['POST', '/my_index/_delete_by_query'],
    ['GET', '/_snapshot'],
    ['GET', '/_snapshot/my_repo'],
    ['GET', '/_snapshot/my_repo/my_snapshot'],
    ['POST', '/_snapshot/my_repo/my_snapshot/_restore'],
    ['GET', '/_tasks'],
    ['GET', '/_tasks/abc123'],
    ['POST', '/_tasks/abc123/_cancel'],
    ['GET', '/_ingest/pipeline'],
    ['GET', '/_ingest/pipeline/my_pipeline'],
    ['POST', '/_ingest/pipeline/_simulate'],
    ['GET', '/_scripts/my_id'],
    ['GET', '/_field_caps'],
    ['GET', '/my_index/_field_caps'],
    ['GET', '/_search/scroll'],
    ['POST', '/_cache/clear'],
    ['POST', '/my_index/_cache/clear'],
    ['GET', '/my_index/_recovery'],
    ['GET', '/my_index/_segments'],
    ['GET', '/_stats'],
    ['GET', '/my_index/_stats'],
    ['GET', '/my_index/_search_shards'],
  ];

  commonCases.forEach(([method, path]) => {
    assertQueryParamCompletions(BackendType.ELASTICSEARCH, esVersion, method, path);
  });
});

describe('apiSpec compliance — Elasticsearch-only endpoints', () => {
  beforeEach(() => {
    setCompletionConfig({ backend: BackendType.ELASTICSEARCH, version: '8.0.0' });
    setDynamicOptions({ indices: ['my_index'], activeIndex: 'my_index' });
  });

  const esVersion = '8.0.0';

  const esCases: Array<[string, string]> = [
    ['GET', '/my_index/_eql/search'],
    ['GET', '/_sql'],
    ['GET', '/_transform'],
    ['GET', '/_transform/my_transform'],
    ['GET', '/_data_stream'],
    ['GET', '/_data_stream/my_stream'],
    ['GET', '/_ilm/policy'],
    ['GET', '/_ilm/policy/my_policy'],
    ['GET', '/_rollup/job/my_job'],
    ['GET', '/_watcher/watch/my_watch'],
    ['GET', '/_ml/anomaly_detectors'],
    ['GET', '/_ml/anomaly_detectors/my_job'],
    ['GET', '/_ml/trained_models'],
    ['GET', '/_ml/trained_models/my_model'],
    ['POST', '/_ml/trained_models/my_model/_infer'],
    ['GET', '/_security/user'],
    ['GET', '/_security/user/admin'],
    ['GET', '/_security/role/my_role'],
    ['GET', '/_security/api_key'],
  ];

  esCases.forEach(([method, path]) => {
    assertQueryParamCompletions(BackendType.ELASTICSEARCH, esVersion, method, path);
  });
});

describe('apiSpec compliance — OpenSearch-only endpoints', () => {
  beforeEach(() => {
    setCompletionConfig({ backend: BackendType.OPENSEARCH, version: '2.0.0' });
    setDynamicOptions({ indices: ['my_index'], activeIndex: 'my_index' });
  });

  const osVersion = '2.0.0';

  const osCases: Array<[string, string]> = [
    ['GET', '/_plugins/_anomaly_detection/detectors'],
    ['GET', '/_plugins/_anomaly_detection/detectors/det1'],
    ['GET', '/_plugins/_alerting/monitors'],
    ['GET', '/_plugins/_alerting/monitors/mon1'],
    ['GET', '/_plugins/_ism/policies'],
    ['GET', '/_plugins/_ism/policies/my_policy'],
    ['POST', '/_plugins/_asynchronous_search'],
  ];

  osCases.forEach(([method, path]) => {
    assertQueryParamCompletions(BackendType.OPENSEARCH, osVersion, method, path);
  });
});

describe('apiSpec compliance — path completions', () => {
  beforeEach(() => {
    setCompletionConfig({ backend: BackendType.ELASTICSEARCH, version: '8.0.0' });
    setDynamicOptions({ indices: ['my_index', 'logs-2024'], activeIndex: 'my_index' });
  });

  it('offers _search after index prefix', () => {
    expect(labelsFor('GET my_index/')).toContain('_search');
  });

  it('offers _count after index prefix', () => {
    expect(labelsFor('GET my_index/')).toContain('_count');
  });

  it('offers _bulk after index prefix', () => {
    expect(labelsFor('POST my_index/')).toContain('_bulk');
  });

  it('offers _mapping after index prefix', () => {
    expect(labelsFor('GET my_index/')).toContain('_mapping');
  });

  it('offers root paths starting with _', () => {
    const labels = labelsFor('GET /_');
    expect(labels.some(l => l.startsWith('/_') || l.startsWith('_'))).toBe(true);
  });

  it('suppresses path completions when path is already complete', () => {
    const labels = labelsFor('GET my_index/_search');
    expect(labels).not.toContain('my_index/_search');
  });

  it('suppresses path completions when exact deep path is complete', () => {
    const labels = labelsFor('POST my_index/_eql/search');
    expect(labels).not.toContain('my_index/_eql/search');
  });
});

describe('apiSpec compliance — backend isolation', () => {
  it('does not return ES-only endpoints on OpenSearch connection', () => {
    setCompletionConfig({ backend: BackendType.OPENSEARCH, version: '2.0.0' });
    setDynamicOptions({});
    const labels = labelsFor('GET /_');
    expect(labels).not.toContain('/_eql');
    expect(labels).not.toContain('/_transform');
    expect(labels).not.toContain('/_rollup');
  });

  it('does not return OpenSearch plugin paths on Elasticsearch connection', () => {
    setCompletionConfig({ backend: BackendType.ELASTICSEARCH, version: '8.0.0' });
    setDynamicOptions({});
    const allLabels = labelsFor('GET /');
    expect(allLabels.some(l => l.includes('_plugins/_anomaly_detection'))).toBe(false);
    expect(allLabels.some(l => l.includes('_plugins/_alerting'))).toBe(false);
    expect(allLabels.some(l => l.includes('_plugins/_ism'))).toBe(false);
  });

  it('index-scoped completions on ES do not include OpenSearch-only endpoints', () => {
    setCompletionConfig({ backend: BackendType.ELASTICSEARCH, version: '8.0.0' });
    setDynamicOptions({ indices: ['my_index'], activeIndex: 'my_index' });
    const labels = labelsFor('GET my_index/');
    expect(labels.some(l => l.includes('_plugins'))).toBe(false);
  });

  it('index-scoped completions on OpenSearch include _eql when available', () => {
    setCompletionConfig({ backend: BackendType.ELASTICSEARCH, version: '8.0.0' });
    setDynamicOptions({ indices: ['my_index'], activeIndex: 'my_index' });
    const labels = labelsFor('GET my_index/');
    expect(labels).toContain('_eql/search');
  });

  it('returns common endpoints on both backends', () => {
    setCompletionConfig({ backend: BackendType.ELASTICSEARCH, version: '8.0.0' });
    setDynamicOptions({});
    const esLabels = labelsFor('GET /_');

    setCompletionConfig({ backend: BackendType.OPENSEARCH, version: '2.0.0' });
    const osLabels = labelsFor('GET /_');

    expect(esLabels).toContain('/_search');
    expect(osLabels).toContain('/_search');
    expect(esLabels).toContain('/_cat/indices');
    expect(osLabels).toContain('/_cat/indices');
  });
});

describe('apiSpec compliance — already-typed param exclusion', () => {
  beforeEach(() => {
    setCompletionConfig({ backend: BackendType.ELASTICSEARCH, version: '8.0.0' });
    setDynamicOptions({});
  });

  it('excludes already-typed param from subsequent suggestions', () => {
    const labels = labelsFor('GET /_search?size=10&');
    expect(labels).not.toContain('size');
    expect(labels).toContain('from');
  });

  it('excludes multiple already-typed params', () => {
    const labels = labelsFor('GET /_search?size=10&from=0&');
    expect(labels).not.toContain('size');
    expect(labels).not.toContain('from');
    expect(labels).toContain('q');
  });
});
