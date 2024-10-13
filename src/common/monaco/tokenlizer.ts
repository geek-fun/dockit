import { Decoration, Editor, executeActions, monaco, Range, SearchAction } from './';
import JSON5 from 'json5';
import { CustomError } from '../customError.ts';

export let searchTokens: SearchAction[] = [];

export const buildSearchToken = (lines: Array<{ lineNumber: number; lineContent: string }>) => {
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
        endColumn: lines[endLineNumber].lineContent.length,
      },
    } as SearchAction;
  });

  return searchTokens;
};
export const getPositionAction = (position: Range) => {
  return searchTokens.find(({ position: { startLineNumber, endLineNumber } }) => {
    return position.startLineNumber >= startLineNumber && position.endLineNumber <= endLineNumber;
  });
};
export const getPointerAction = (editor: Editor, tokens: Array<SearchAction>) => {
  const { lineNumber } = editor?.getPosition() || {};
  if (lineNumber === undefined || lineNumber === null) {
    return;
  }

  return tokens.find(
    ({ position: { startLineNumber, endLineNumber } }) =>
      lineNumber >= startLineNumber && lineNumber <= endLineNumber,
  );
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
  searchTokens: SearchAction[],
  autoIndentCmdId: string,
  copyAsCurlCmdId: string,
) => {
  const copyCurl = searchTokens.map(({ position }, index) => ({
    range: { ...position, endLineNumber: position.startLineNumber },
    id: `CopyAsCurl-${index}`,
    command: {
      id: copyAsCurlCmdId!,
      title: 'Copy as CURL',
      arguments: [position],
    },
  }));

  const autoIndent = searchTokens
    .filter(({ qdsl }) => qdsl)
    .map(({ position }, index) => ({
      range: { ...position, endLineNumber: position.startLineNumber },
      id: `AutoIndent-${index}`,
      command: {
        id: autoIndentCmdId!,
        title: 'Auto Indent',
        arguments: [{ ...position, startLineNumber: position.startLineNumber + 1 }],
      },
    }));

  return [...autoIndent, ...copyCurl];
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

export const transformQDSL = ({ path, qdsl }: Pick<SearchAction, 'path' | 'qdsl'>) => {
  try {
    const bulkAction = path.includes('_bulk');
    if (bulkAction) {
      const bulkQdsl = qdsl
        .split('\n')
        .map(line => JSON.stringify(JSON5.parse(line)))
        .join('\n');
      return `${bulkQdsl}\n`;
    }

    return qdsl ? JSON.stringify(JSON5.parse(replaceTripleQuotes(qdsl)), null, 2) : undefined;
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
