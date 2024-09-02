import { DsqlTreeItem } from '../type.ts';
import { get } from 'lodash';
import { termLevelQueries } from './termLevelQueries.ts';
import { specializedQueries } from './specializedQueries.ts';
import { fullTextQueries } from './fullTextQueries.ts';
import { matchAllQueries } from './matchAllQueries.ts';
import { compoundQueries } from './compoundQueries.ts';

const dsqlTree: {
  [key: string]: {
    label: string;
    children?: {
      [key: string]: DsqlTreeItem;
    };
  };
} = {
  _search: {
    label: '_search',
    children: {
      query: {
        label: 'query',
        snippet: `query: {\n\t$0\n},`,
        children: {
          ...matchAllQueries,
          ...termLevelQueries,
          ...specializedQueries,
          ...fullTextQueries,
          ...compoundQueries,
          indices: {
            label: 'indices',
            snippet: `indices: {\n\t$0\n},`,
          },
          default_operator: {
            label: 'default_operator',
            snippet: 'default_operator: $1',
          },
          df: {
            label: 'df',
            snippet: 'df: $1',
          },
          analyzer: {
            label: 'analyzer',
            snippet: 'analyzer: $1',
          },
          sort: {
            label: 'sort',
            snippet: 'sort: $1',
          },
          boost: {
            label: 'boost',
            snippet: 'boost: $1',
          },
        },
      },
      from: {
        label: 'from',
        snippet: 'from: $1',
      },
      size: {
        label: 'size',
        snippet: 'size: $1',
      },
      aggs: {
        label: 'aggs',
        snippet: `aggs: {\n\t$0\n},`,
      },
      sort: {
        label: 'sort',
        snippet: 'sort: $1',
      },
      indices: {
        label: 'indices',
        snippet: 'indices: $1',
      },
      type: {
        label: 'type',
        snippet: 'type: $1',
      },
      version: {
        label: 'version',
        snippet: 'version: $1',
      },
      min_score: {
        label: 'min_score',
        snippet: 'min_score: $1',
      },
      fields: {
        label: 'fields',
        snippet: 'fields: $1',
      },
      script_fields: {
        label: 'script_fields',
        snippet: 'script_fields: ```\n\t$0\n```',
      },
      partial_fields: {
        label: 'partial_fields',
        snippet: 'partial_fields: ```\n\t$0\n```',
      },
      highlight: {
        label: 'highlight',
        snippet: `highlight: {\n\t$0\n},`,
      },
    },
  },
};

const getSubDsqlTree = (action: string, path: Array<string>) => {
  let subTree = get(dsqlTree, action);
  console.log('getSubDsqlTree', { action, path, subTree });
  if (!subTree) {
    return;
  }
  for (const key of path) {
    const newSubTree = get(subTree, `children.${key}`) || get(subTree, 'children.*');
    if (newSubTree) {
      subTree = newSubTree;
    } else {
      return;
    }
  }

  return subTree;
};

export { dsqlTree, getSubDsqlTree };
