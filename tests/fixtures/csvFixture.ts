export const indexMapping = {
  mappings: {
    properties: {
      '@timestamp': {
        type: 'alias',
        path: 'timestamp',
      },
      agent: {
        type: 'text',
        fields: {
          keyword: {
            type: 'keyword',
            ignore_above: 256,
          },
        },
      },
      bytes: {
        type: 'long',
      },
      clientip: {
        type: 'ip',
      },
      event: {
        properties: {
          dataset: {
            type: 'keyword',
          },
        },
      },
      extension: {
        type: 'text',
        fields: {
          keyword: {
            type: 'keyword',
            ignore_above: 256,
          },
        },
      },
      geo: {
        properties: {
          coordinates: {
            type: 'geo_point',
          },
          dest: {
            type: 'keyword',
          },
          src: {
            type: 'keyword',
          },
          srcdest: {
            type: 'keyword',
          },
        },
      },
      host: {
        type: 'text',
        fields: {
          keyword: {
            type: 'keyword',
            ignore_above: 256,
          },
        },
      },
      index: {
        type: 'text',
        fields: {
          keyword: {
            type: 'keyword',
            ignore_above: 256,
          },
        },
      },
      ip: {
        type: 'ip',
      },
      ip_range: {
        type: 'ip_range',
      },
      machine: {
        properties: {
          os: {
            type: 'text',
            fields: {
              keyword: {
                type: 'keyword',
                ignore_above: 256,
              },
            },
          },
          ram: {
            type: 'long',
          },
        },
      },
      memory: {
        type: 'double',
      },
      message: {
        type: 'text',
        fields: {
          keyword: {
            type: 'keyword',
            ignore_above: 256,
          },
        },
      },
      phpmemory: {
        type: 'long',
      },
      referer: {
        type: 'keyword',
      },
      request: {
        type: 'text',
        fields: {
          keyword: {
            type: 'keyword',
            ignore_above: 256,
          },
        },
      },
      response: {
        type: 'text',
        fields: {
          keyword: {
            type: 'keyword',
            ignore_above: 256,
          },
        },
      },
      tags: {
        type: 'text',
        fields: {
          keyword: {
            type: 'keyword',
            ignore_above: 256,
          },
        },
      },
      timestamp: {
        type: 'date',
      },
      timestamp_range: {
        type: 'date_range',
      },
      url: {
        type: 'text',
        fields: {
          keyword: {
            type: 'keyword',
            ignore_above: 256,
          },
        },
      },
      utc_time: {
        type: 'date',
      },
    },
  },
};

export const csvHeader = [
  '@timestamp',
  'agent',
  'bytes',
  'clientip',
  'event.dataset',
  'extension',
  'geo.coordinates',
  'geo.dest',
  'geo.src',
  'geo.srcdest',
  'host',
  'index',
  'ip',
  'ip_range',
  'machine.os',
  'machine.ram',
  'memory',
  'message',
  'phpmemory',
  'referer',
  'request',
  'response',
  'tags',
  'timestamp',
  'timestamp_range',
  'url',
  'utc_time',
];
