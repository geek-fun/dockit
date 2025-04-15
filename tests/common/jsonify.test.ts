import { jsonify } from '../../src/common';

describe('Unit test for jsonify', () => {
  it('should parse JSON5 string with bigInt to Object by jsonify.parse5 ', () => {
    const text = '{ uid: 1308537228663099396 }';
    const parsed = jsonify.parse5(text);

    expect(parsed).toEqual({ uid: BigInt('1308537228663099396') });
  });

  it('should stringify the Object with bigInt to correct JSON string by jsonify.string5', () => {
    const obj = { uid: BigInt('1308537228663099396') };
    const parsed = jsonify.string5(obj);

    expect(parsed).toEqual('{uid:1308537228663099396}');
  });

  it('should parse JSON string with bigInt to Object by jsonify.parse', () => {
    const text = '{ "uid": 1308537228663099396 }';
    const parsed = jsonify.parse(text);

    expect(parsed).toEqual({ uid: BigInt('1308537228663099396') });
  });

  it('should stringify the Object with bigInt to correct JSON string by jsonify.stringify', () => {
    const obj = { uid: BigInt('1308537228663099396') };
    const parsed = jsonify.stringify(obj);

    expect(parsed).toEqual('{"uid":1308537228663099396}');
  });

  it('should format the JSON5 object to string with expected indent', () => {
    const text = `{ uid: 1308537228663099396 }`;
    const parsed = jsonify.stringify(jsonify.parse5(text), null, 2);
    expect(parsed).toEqual('{\n  "uid": 1308537228663099396\n}');
  });

  it('should format the JSON5 string to expected format', () => {
    const text = `{
  // comments
  unquoted: 'and you can quote me on that',
  singleQuotes: 'I can use "double quotes" here',
  lineBreaks: "Look, Mom! \\
No \\\\n's!",
  hexadecimal: 0xdecaf,
  leadingDecimalPoint: .8675309, andTrailing: 8675309.,
  positiveSign: +1,
  trailingComma: 'in objects', andIn: ['arrays',],
  "backwardsCompatible": "with JSON",
   uid: 1308537228663099396
}`;
    const parsed = jsonify.string5(jsonify.parse5(text), null, 2);
    expect(parsed).toEqual(`{
  unquoted: 'and you can quote me on that',
  singleQuotes: 'I can use "double quotes" here',
  lineBreaks: "Look, Mom! No \\\\n's!",
  hexadecimal: 912559,
  leadingDecimalPoint: 0.8675309,
  andTrailing: 8675309,
  positiveSign: 1,
  trailingComma: 'in objects',
  andIn: [
    'arrays',
  ],
  backwardsCompatible: 'with JSON',
  uid: 1308537228663099396,
}`);
  });

  it('should parse JSON string to Object when no bigInt in the string value', () => {
    const jsonStr = `{\"data\":{\"_nodes\":{\"failed\":0,\"successful\":1,\"total\":1},\"cluster_name\":\"130671906284:opensearch-haystack-domain\",\"cluster_uuid\":\"nTBcAhPmR7CR_7ALeprVhg\",\"indices\":{\"analysis\":{\"analyzer_types\":[],\"built_in_analyzers\":[{\"count\":1,\"index_count\":1,\"name\":\"whitespace\"}],\"built_in_char_filters\":[],\"built_in_filters\":[],\"built_in_tokenizers\":[],\"char_filter_types\":[],\"filter_types\":[],\"tokenizer_types\":[]},\"completion\":{\"size_in_bytes\":0},\"count\":19,\"docs\":{\"count\":505,\"deleted\":4},\"fielddata\":{\"evictions\":0,\"memory_size_in_bytes\":0},\"mappings\":{\"field_types\":[{\"count\":1,\"index_count\":1,\"name\":\"binary\"},{\"count\":9,\"index_count\":4,\"name\":\"boolean\"},{\"count\":26,\"index_count\":10,\"name\":\"date\"},{\"count\":13,\"index_count\":4,\"name\":\"flat_object\"},{\"count\":1,\"index_count\":1,\"name\":\"float\"},{\"count\":22,\"index_count\":5,\"name\":\"integer\"},{\"count\":119,\"index_count\":14,\"name\":\"keyword\"},{\"count\":12,\"index_count\":4,\"name\":\"long\"},{\"count\":13,\"index_count\":6,\"name\":\"nested\"},{\"count\":59,\"index_count\":7,\"name\":\"object\"},{\"count\":129,\"index_count\":13,\"name\":\"text\"}]},\"query_cache\":{\"cache_count\":0,\"cache_size\":0,\"evictions\":0,\"hit_count\":0,\"memory_size_in_bytes\":0,\"miss_count\":0,\"total_count\":0},\"segments\":{\"count\":16,\"doc_values_memory_in_bytes\":0,\"file_sizes\":{},\"fixed_bit_set_memory_in_bytes\":144,\"index_writer_memory_in_bytes\":0,\"max_unsafe_auto_id_timestamp\":-1,\"memory_in_bytes\":0,\"norms_memory_in_bytes\":0,\"points_memory_in_bytes\":0,\"remote_store\":{\"download\":{\"total_download_size\":{\"failed_bytes\":0,\"started_bytes\":0,\"succeeded_bytes\":0},\"total_time_spent_in_millis\":0},\"upload\":{\"max_refresh_time_lag_in_millis\":0,\"pressure\":{\"total_rejections\":0},\"refresh_size_lag\":{\"max_bytes\":0,\"total_bytes\":0},\"total_time_spent_in_millis\":0,\"total_upload_size\":{\"failed_bytes\":0,\"started_bytes\":0,\"succeeded_bytes\":0}}},\"segment_replication\":{\"max_bytes_behind\":0,\"max_replication_lag\":0,\"total_bytes_behind\":0},\"stored_fields_memory_in_bytes\":0,\"term_vectors_memory_in_bytes\":0,\"terms_memory_in_bytes\":0,\"version_map_memory_in_bytes\":0},\"shards\":{\"index\":{\"primaries\":{\"avg\":2.8947368421052633,\"max\":5,\"min\":1},\"replication\":{\"avg\":0.0,\"max\":0.0,\"min\":0.0},\"shards\":{\"avg\":2.8947368421052633,\"max\":5,\"min\":1}},\"primaries\":55,\"replication\":0.0,\"total\":55},\"store\":{\"reserved_in_bytes\":0,\"size_in_bytes\":324511}},\"nodes\":{\"count\":{\"cluster_manager\":1,\"coordinating_only\":0,\"data\":1,\"ingest\":1,\"master\":1,\"remote_cluster_client\":1,\"search\":0,\"total\":1},\"discovery_types\":{\"zen\":1},\"fs\":{\"available_in_bytes\":10374856704,\"free_in_bytes\":10391633920,\"total_in_bytes\":10394816512},\"ingest\":{\"number_of_pipelines\":0,\"processor_stats\":{}},\"jvm\":{\"max_uptime_in_millis\":4006636,\"mem\":{\"heap_max_in_bytes\":1073741824,\"heap_used_in_bytes\":390215088},\"threads\":421},\"network_types\":{\"http_types\":{\"aws-opensearch-netty\":1},\"transport_types\":{\"org.opensearch.security.ssl.http.netty.SecuritySSLNettyTransport\":1}},\"os\":{\"allocated_processors\":2,\"available_processors\":2,\"mem\":{\"free_in_bytes\":84819968,\"free_percent\":4,\"total_in_bytes\":2017742848,\"used_in_bytes\":1932922880,\"used_percent\":96},\"names\":[{\"count\":1}],\"pretty_names\":[{\"count\":1}]},\"packaging_types\":[{\"count\":1,\"type\":\"tar\"}],\"process\":{\"cpu\":{\"percent\":33},\"open_file_descriptors\":{\"avg\":1838,\"max\":1838,\"min\":1838}},\"versions\":[\"2.17.0\"]},\"status\":\"yellow\",\"timestamp\":1744648082203},\"message\":\"Success\",\"status\":200}`;
    const parsed = jsonify.parse(jsonStr);
    expect(parsed).toEqual({
      data: {
        _nodes: {
          failed: 0,
          successful: 1,
          total: 1,
        },
        cluster_name: '130671906284:opensearch-haystack-domain',
        cluster_uuid: 'nTBcAhPmR7CR_7ALeprVhg',
        indices: {
          analysis: {
            analyzer_types: [],
            built_in_analyzers: [
              {
                count: 1,
                index_count: 1,
                name: 'whitespace',
              },
            ],
            built_in_char_filters: [],
            built_in_filters: [],
            built_in_tokenizers: [],
            char_filter_types: [],
            filter_types: [],
            tokenizer_types: [],
          },
          completion: {
            size_in_bytes: 0,
          },
          count: 19,
          docs: {
            count: 505,
            deleted: 4,
          },
          fielddata: {
            evictions: 0,
            memory_size_in_bytes: 0,
          },
          mappings: {
            field_types: [
              {
                count: 1,
                index_count: 1,
                name: 'binary',
              },
              {
                count: 9,
                index_count: 4,
                name: 'boolean',
              },
              {
                count: 26,
                index_count: 10,
                name: 'date',
              },
              {
                count: 13,
                index_count: 4,
                name: 'flat_object',
              },
              {
                count: 1,
                index_count: 1,
                name: 'float',
              },
              {
                count: 22,
                index_count: 5,
                name: 'integer',
              },
              {
                count: 119,
                index_count: 14,
                name: 'keyword',
              },
              {
                count: 12,
                index_count: 4,
                name: 'long',
              },
              {
                count: 13,
                index_count: 6,
                name: 'nested',
              },
              {
                count: 59,
                index_count: 7,
                name: 'object',
              },
              {
                count: 129,
                index_count: 13,
                name: 'text',
              },
            ],
          },
          query_cache: {
            cache_count: 0,
            cache_size: 0,
            evictions: 0,
            hit_count: 0,
            memory_size_in_bytes: 0,
            miss_count: 0,
            total_count: 0,
          },
          segments: {
            count: 16,
            doc_values_memory_in_bytes: 0,
            file_sizes: {},
            fixed_bit_set_memory_in_bytes: 144,
            index_writer_memory_in_bytes: 0,
            max_unsafe_auto_id_timestamp: -1,
            memory_in_bytes: 0,
            norms_memory_in_bytes: 0,
            points_memory_in_bytes: 0,
            remote_store: {
              download: {
                total_download_size: {
                  failed_bytes: 0,
                  started_bytes: 0,
                  succeeded_bytes: 0,
                },
                total_time_spent_in_millis: 0,
              },
              upload: {
                max_refresh_time_lag_in_millis: 0,
                pressure: {
                  total_rejections: 0,
                },
                refresh_size_lag: {
                  max_bytes: 0,
                  total_bytes: 0,
                },
                total_time_spent_in_millis: 0,
                total_upload_size: {
                  failed_bytes: 0,
                  started_bytes: 0,
                  succeeded_bytes: 0,
                },
              },
            },
            segment_replication: {
              max_bytes_behind: 0,
              max_replication_lag: 0,
              total_bytes_behind: 0,
            },
            stored_fields_memory_in_bytes: 0,
            term_vectors_memory_in_bytes: 0,
            terms_memory_in_bytes: 0,
            version_map_memory_in_bytes: 0,
          },
          shards: {
            index: {
              primaries: {
                avg: 2.8947368421052633,
                max: 5,
                min: 1,
              },
              replication: {
                avg: 0.0,
                max: 0.0,
                min: 0.0,
              },
              shards: {
                avg: 2.8947368421052633,
                max: 5,
                min: 1,
              },
            },
            primaries: 55,
            replication: 0.0,
            total: 55,
          },
          store: {
            reserved_in_bytes: 0,
            size_in_bytes: 324511,
          },
        },
        nodes: {
          count: {
            cluster_manager: 1,
            coordinating_only: 0,
            data: 1,
            ingest: 1,
            master: 1,
            remote_cluster_client: 1,
            search: 0,
            total: 1,
          },
          discovery_types: {
            zen: 1,
          },
          fs: {
            available_in_bytes: 10374856704,
            free_in_bytes: 10391633920,
            total_in_bytes: 10394816512,
          },
          ingest: {
            number_of_pipelines: 0,
            processor_stats: {},
          },
          jvm: {
            max_uptime_in_millis: 4006636,
            mem: {
              heap_max_in_bytes: 1073741824,
              heap_used_in_bytes: 390215088,
            },
            threads: 421,
          },
          network_types: {
            http_types: {
              'aws-opensearch-netty': 1,
            },
            transport_types: {
              'org.opensearch.security.ssl.http.netty.SecuritySSLNettyTransport': 1,
            },
          },
          os: {
            allocated_processors: 2,
            available_processors: 2,
            mem: {
              free_in_bytes: 84819968,
              free_percent: 4,
              total_in_bytes: 2017742848,
              used_in_bytes: 1932922880,
              used_percent: 96,
            },
            names: [
              {
                count: 1,
              },
            ],
            pretty_names: [
              {
                count: 1,
              },
            ],
          },
          packaging_types: [
            {
              count: 1,
              type: 'tar',
            },
          ],
          process: {
            cpu: {
              percent: 33,
            },
            open_file_descriptors: {
              avg: 1838,
              max: 1838,
              min: 1838,
            },
          },
          versions: ['2.17.0'],
        },
        status: 'yellow',
        timestamp: 1744648082203,
      },
      message: 'Success',
      status: 200,
    });
  });
});
