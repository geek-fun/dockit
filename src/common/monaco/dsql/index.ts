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
          default_operator: {
            label: 'default_operator',
            snippet: 'default_operator: $0',
          },
          df: {
            label: 'df',
            snippet: 'df: $0',
          },
          analyzer: {
            label: 'analyzer',
            snippet: 'analyzer: $0',
          },
          sort: {
            label: 'sort',
            snippet: 'sort: $0',
          },
          boost: {
            label: 'boost',
            snippet: 'boost: $0',
          },
        },
      },
      from: {
        label: 'from',
        snippet: 'from: $0',
      },
      size: {
        label: 'size',
        snippet: 'size: $0',
      },
      aggs: {
        label: 'aggs',
        snippet: `aggs: {\n\t$0\n},`,
      },
      sort: {
        label: 'sort',
        snippet: 'sort: $0',
      },
      type: {
        label: 'type',
        snippet: 'type: $0',
      },
      version: {
        label: 'version',
        snippet: 'version: $0',
      },
      min_score: {
        label: 'min_score',
        snippet: 'min_score: $0',
      },
      fields: {
        label: 'fields',
        snippet: 'fields: $0',
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
const getKeywordsFromDsqlTree = (tree: typeof dsqlTree): Array<string> => {
  return Array.from(
    new Set(
      Object.entries(tree)
        .map(([key, value]) => {
          if (key === '*') {
            return getKeywordsFromDsqlTree(value.children ?? {});
          }
          if (value.children) {
            return [key, ...getKeywordsFromDsqlTree(value.children)];
          }
          return [key];
        })
        .flat(),
    ),
  );
};

export { dsqlTree, getSubDsqlTree, getKeywordsFromDsqlTree };
