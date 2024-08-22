import { Decoration, executeActions, monaco, SearchAction } from './';
import JSON5 from 'json5';
import { CustomError } from '../customError.ts';

export const buildSearchToken = (lines: Array<{ lineNumber: number; lineContent: string }>) => {
  const commands = lines.filter(({ lineContent }) => executeActions.regexp.test(lineContent));

  return commands.map(({ lineContent, lineNumber }, index, commands) => {
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
      actionPosition: {
        startLineNumber: lineNumber,
        endLineNumber: lineNumber,
        startColumn: 1,
        endColumn: lineContent.length,
      },
      qdslPosition: qdsl
        ? {
            startLineNumber: lineNumber + 1,
            startColumn: 1,
            endLineNumber,
            endColumn: lines[endLineNumber].lineContent.length,
          }
        : null,
    } as SearchAction;
  });
};
export const executionGutterClass = 'execute-button-decoration';
export const getActionMarksDecorations = (searchTokens: SearchAction[]): Array<Decoration> => {
  return searchTokens
    .map(({ actionPosition }) => ({
      id: actionPosition.startLineNumber,
      range: actionPosition,
      options: { isWholeLine: true, linesDecorationsClassName: executionGutterClass },
    }))
    .filter(Boolean)
    .sort((a, b) => (a as Decoration).id - (b as Decoration).id) as Array<Decoration>;
};
export const buildCodeLens = (searchTokens: SearchAction[], autoIndentCmdId: string) =>
  searchTokens
    .filter(({ qdslPosition }) => qdslPosition)
    .map(({ actionPosition, qdslPosition }, index) => ({
      range: actionPosition,
      id: `AutoIndent-${index}`,
      command: { id: autoIndentCmdId!, title: 'Auto Indent', arguments: [qdslPosition] },
    }));

export const formatQDSL = (
  searchTokens: SearchAction[],
  model: monaco.editor.ITextModel,
  qdslPosition: { startLineNumber: number; endLineNumber: number },
) => {
  const { startLineNumber, endLineNumber } = qdslPosition;
  const content = model.getValueInRange({
    startLineNumber,
    startColumn: 1,
    endLineNumber: endLineNumber,
    endColumn: model.getLineLength(endLineNumber) + 1,
  });

  const bulkAction = searchTokens.find(
    ({ qdslPosition: position, path }) =>
      path.includes('_bulk') && position.startLineNumber === qdslPosition.startLineNumber,
  );

  if (!bulkAction) {
    return JSON5.stringify(JSON5.parse(content), null, 2);
  }
  const lines = content.split('\n').map(line => JSON5.parse(line));
  return lines.map(line => JSON5.stringify(line)).join('\n');
};

export const transformQDSL = (action: SearchAction) => {
  try {
    const bulkAction = action.path.includes('_bulk');
    if (bulkAction) {
      const dsql = action.qdsl
        .split('\n')
        .map(line => JSON.stringify(JSON5.parse(line)))
        .join('\n');
      return `${dsql}\n`;
    }

    return action.qdsl ? JSON.stringify(JSON5.parse(action.qdsl), null, 2) : undefined;
  } catch (err) {
    throw new CustomError(400, (err as Error).message);
  }
};
