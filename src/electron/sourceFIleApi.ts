import Electron from 'electron';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { debug } from '../common';

export enum sourceFileApiMethods {
  SAVE_FILE = 'SAVE_FILE',
  READ_FILE = 'READ_FILE',
}

export type SourceFileApiInput = {
  method: sourceFileApiMethods;
  fileName: string;
  content: string;
};

const saveFile = async (filePath: string, content: string) => {
  const resolvedPath = path.resolve(__dirname, filePath);
  try {
    await writeFile(resolvedPath, content, 'utf-8');
    debug('save file success');
  } catch (err) {
    debug(`saveFile error: ${err}`);
    throw err;
  }
};

const readFromFile = async (filePath: string) => {
  const resolvedPath = path.resolve(__dirname, filePath);
  debug(`resolvedPath: ${resolvedPath}`);
  if (!existsSync(resolvedPath)) {
    debug('File does not exist. Creating a new file...');
    await mkdir(path.dirname(resolvedPath), { recursive: true });
    await writeFile(resolvedPath, '', { encoding: 'utf-8', flag: 'w+' });
    return '';
  }

  try {
    return await readFile(resolvedPath, 'utf-8');
  } catch (err) {
    debug(`readFromFile error: ${err}`);
    throw err;
  }
};

const sourceFileApi: { [key: string]: (filePath: string, content: string) => unknown } = {
  save_file: (filePath: string, content: string) => saveFile(filePath, content),
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  read_file: (filePath: string, _: string) => readFromFile(filePath),
};

export const registerSourceFileApiListener = (ipcMain: Electron.IpcMain) => {
  ipcMain.handle('sourceFileAPI', (_, { content, method }: SourceFileApiInput) =>
    sourceFileApi[method.toLowerCase()]('./data/default.search', content),
  );
};
