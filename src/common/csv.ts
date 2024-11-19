import { get } from 'lodash';

export const buildCsvHeaderFromIndexMapping = ({
  mappings,
}: {
  mappings: {
    properties: {
      [key: string]: unknown;
    };
  };
}) => {
  return buildCsvHeaders(mappings.properties);
};

const buildCsvHeaders = (
  mapping: { [key: string]: unknown },
  parent: string = '',
  res: string[] = [],
): string[] => {
  for (let key in mapping) {
    const propName = parent ? `${parent}.${key}` : key;
    const subProperties = get(mapping, `${key}.properties`) as { [key: string]: unknown };
    if (subProperties) {
      buildCsvHeaders(subProperties, propName, res);
    } else {
      res.push(propName);
    }
  }
  return res;
};
