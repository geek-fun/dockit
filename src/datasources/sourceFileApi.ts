import { BaseDirectory, createDir, exists, readTextFile, writeTextFile } from '@tauri-apps/api/fs';

import { debug } from '../common';

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

const sourceFileApi = {
  saveFile: (filePath: string, content: string) => saveFile(filePath, content),
  readFile: (filePath: string) => readFromFile(filePath),
};

export { sourceFileApi };
