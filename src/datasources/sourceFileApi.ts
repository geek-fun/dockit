import {
  BaseDirectory,
  createDir,
  exists,
  readTextFile,
  removeDir,
  removeFile,
  renameFile,
  writeTextFile,
} from '@tauri-apps/api/fs';

import { CustomError, debug } from '../common';

const saveFile = async (filePath: string, content: string) => {
  try {
    const folderPath = filePath.substring(0, filePath.lastIndexOf('/'));

    if (!(await exists(folderPath, { dir: BaseDirectory.AppData }))) {
      await createDir(folderPath, { dir: BaseDirectory.AppData, recursive: true });
    }
    await writeTextFile(filePath, content, { dir: BaseDirectory.AppConfig, append: false });
    debug('save file success');
  } catch (err) {
    debug(`saveFile error: ${err}`);
    throw err;
  }
};

const readFromFile = async (filePath: string) => {
  if (!(await exists(filePath, { dir: BaseDirectory.AppData }))) {
    debug('File does not exist. Creating a new file...');
    return '';
  }

  try {
    return await readTextFile(filePath, { dir: BaseDirectory.AppConfig });
  } catch (err) {
    debug(`readFromFile error: ${err}`);
    throw err;
  }
};

const deleteFileOrFolder = async (filePath: string) => {
  try {
    await Promise.any([removeFile(filePath), removeDir(filePath, { recursive: true })]);
    debug('delete file or folder success');
  } catch (err) {
    console.log(`deleteFileOrFolder error`, JSON.stringify(err));
    debug(`deleteFileOrFolder error: ${err}`);
    throw new CustomError(500, JSON.stringify(err));
  }
};

const renameFileOrFolder = async (oldPath: string, newPath: string) => {
  try {
    await renameFile(oldPath, newPath);
    debug('rename file or folder success');
  } catch (err) {
    debug(`renameFileOrFolder error: ${err}`);
    throw new CustomError(500, JSON.stringify(err));
  }
};

const sourceFileApi = {
  saveFile: (filePath: string, content: string) => saveFile(filePath, content),
  readFile: (filePath: string) => readFromFile(filePath),
  createFolder: (folderPath: string) => createDir(folderPath),
  deleteFileOrFolder,
  renameFileOrFolder,
};

export { sourceFileApi };
