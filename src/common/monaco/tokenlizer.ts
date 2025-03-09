import { Decoration, executeActions, monaco, SearchAction } from './';
import JSON5 from 'json5';
import { get } from 'lodash';
import { CustomError } from '../customError.ts';

export let searchTokens: SearchAction[] = [];

export const buildSearchToken = (model: monaco.editor.IModel) => {
  const lines = Array.from({ length: model.getLineCount() }, (_, i) => ({
    lineNumber: i + 1,
    lineContent: model.getLineContent(i + 1),
  }));

  const commands = lines.filter(({ lineContent }) => executeActions.regexp.test(lineContent));

  searchTokens = commands.map(({ lineContent, lineNumber }, index, commands) => {
    const [rawPath, queryParams] = lineContent.split('?');
    const rawCmd = rawPath.split(/[\/\s]+/);
    const method = rawCmd[0]?.toUpperCase();
    const indexName = rawCmd[1]?.startsWith('_') ? undefined : rawCmd[1];
    const path = rawCmd.slice(indexName ? 2 : 1, rawCmd.length).join('/');

    const nexCommandLineNumber = commands[index + 1]?.lineNumber
      ? commands[index + 1]?.lineNumber - 1
      : lines.length;

    const endLineNumber =
      lines
        .slice(lineNumber, nexCommandLineNumber)
        .reverse()
        .find(({ lineContent }) => lineContent.trim().endsWith('}'))?.lineNumber || lineNumber;

    const qdsl = lines
      .slice(lineNumber, endLineNumber)
      .map(({ lineContent }) => lineContent)
      .join('\n');

    return {
      qdsl,
      method,
      index: indexName,
      path,
      queryParams,
      position: {
        startLineNumber: lineNumber,
        endLineNumber,
        startColumn: 1,
        endColumn: get(lines, `[${endLineNumber}].lineContent.length`, 0),
      },
    } as SearchAction;
  });

  return searchTokens;
};
export const getAction = (position: monaco.Range | monaco.Position | null | undefined) => {
  if (!position) {
    return undefined;
  }
  const startLine = get(position, 'startLineNumber', get(position, 'lineNumber', -1));
  const endLine = get(position, 'endLineNumber', get(position, 'lineNumber', -1));
  return searchTokens.find(({ position: { startLineNumber, endLineNumber } }) => {
    return startLine >= startLineNumber && endLine <= endLineNumber;
  });
};

export const executionGutterClass = 'execute-button-decoration';
export const getActionMarksDecorations = (searchTokens: SearchAction[]): Array<Decoration> => {
  return searchTokens
    .map(({ position }) => ({
      id: position.startLineNumber,
      range: { ...position, endLineNumber: position.startLineNumber },
      options: { isWholeLine: true, linesDecorationsClassName: executionGutterClass },
    }))
    .filter(Boolean)
    .sort((a, b) => (a as Decoration).id - (b as Decoration).id) as Array<Decoration>;
};
export const buildCodeLens = (
  position: monaco.Position,
  autoIndentCmdId: string,
  copyAsCurlCmdId: string,
): Array<monaco.languages.CodeLens> => {
  const action = getAction(position);
  if (!action) {
    return [];
  }

  const copyCurl = {
    range: action.position,
    id: `CopyAsCurl`,
    command: {
      id: copyAsCurlCmdId!,
      title: 'Copy as CURL',
      arguments: [position],
    },
  };

  const autoIndent = action.qdsl && {
    range: action.position,
    id: `AutoIndent`,
    command: {
      id: autoIndentCmdId!,
      title: 'Auto Indent',
      arguments: [{ ...action.position, startLineNumber: action.position.startLineNumber + 1 }],
    },
  };

  return [autoIndent, copyCurl].filter(Boolean) as Array<monaco.languages.CodeLens>;
};

export const formatQDSL = (
  searchTokens: SearchAction[],
  model: monaco.editor.ITextModel,
  position: { startLineNumber: number; endLineNumber: number },
) => {
  const { startLineNumber, endLineNumber } = position;
  const content = model.getValueInRange({
    startLineNumber: startLineNumber + 1,
    startColumn: 1,
    endLineNumber: endLineNumber,
    endColumn: model.getLineLength(endLineNumber) + 1,
  });

  const bulkAction = searchTokens.find(
    ({ path, position }) => path.includes('_bulk') && position.startLineNumber === startLineNumber,
  );
  if (!bulkAction) {
    return JSON5.stringify(JSON5.parse(content), null, 2);
  }
  const lines = content.split('\n').map(line => JSON5.parse(line));
  return lines.map(line => JSON5.stringify(line)).join('\n');
};

const replaceTripleQuotes = (value: string) =>
  value
    .replace(/'''(.*?)'''/gs, (_, match) => JSON.stringify(match))
    .replace(/"""(.*?)"""/gs, (_, match) => JSON.stringify(match));
const replaceComments = (value: string) => value.replace(/\/\/.*/g, '').trim();

export const transformQDSL = ({ path, qdsl }: Pick<SearchAction, 'path' | 'qdsl'>) => {
  try {
    const puredDsl = replaceTripleQuotes(replaceComments(qdsl));
    const bulkAction = path.includes('_bulk');
    if (bulkAction) {
      const bulkQdsl = puredDsl
        .split('\n')
        .map(line => JSON.stringify(JSON5.parse(line)))
        .join('\n');
      return `${bulkQdsl}\n`;
    }

    return puredDsl ? JSON.stringify(JSON5.parse(puredDsl), null, 2) : undefined;
  } catch (err) {
    throw new CustomError(400, (err as Error).message);
  }
};

export const transformToCurl = ({
  method,
  headers,
  qdsl,
  url,
  ssl,
}: {
  url: string;
  method: string;
  headers: { [key: string]: string };
  qdsl: string;
  ssl: boolean | undefined;
}) => {
  let curlCmd = `curl -X ${method} '${url}'`;

  if (url.startsWith('https') && ssl === false) {
    curlCmd += ' --insecure';
  }

  if (headers) {
    curlCmd += Object.entries(headers)
      .map(([key, value]) => ` -H '${key}: ${value}'`)
      .join('');
  }
  if (qdsl) {
    const qdslCmd = transformQDSL({ path: url, qdsl })?.replace(/'/g, "'\\''");
    curlCmd += ` -d '${qdslCmd}'`;
  }

  return curlCmd;
};
