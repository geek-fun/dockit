import {
  BaseDirectory,
  createDir,
  exists,
  readDir,
  readTextFile,
  removeDir,
  removeFile,
  renameFile,
  writeTextFile,
} from '@tauri-apps/api/fs';

import { homeDir } from '@tauri-apps/api/path';
import { open } from '@tauri-apps/api/dialog';
import { CustomError, debug } from '../common';
import { FileType } from '../store';

const saveFile = async (filePath: string, content: string, append: boolean) => {
  try {
    const folderPath = filePath.substring(0, filePath.lastIndexOf('/'));

    if (!(await exists(folderPath, { dir: BaseDirectory.Home }))) {
      await createDir(folderPath, { dir: BaseDirectory.Home, recursive: true });
    }
    await writeTextFile(filePath, content, { dir: BaseDirectory.Home, append });
    debug('save file success');
  } catch (err) {
    debug(`saveFile error: ${err}`);
    throw err;
  }
};

const readFromFile = async (filePath: string) => {
  if (!(await exists(filePath, { dir: BaseDirectory.Home }))) {
    debug('File does not exist. Creating a new file...');
    return '';
  }

  try {
    return await readTextFile(filePath, { dir: BaseDirectory.Home });
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

const getRelativePath = async (filePath?: string) => {
  const defaultPath = filePath ?? `.dockit`;
  const homeDirectory = await homeDir();

  return `${homeDirectory}${defaultPath.replace(homeDirectory, '')}`;
};

const selectFolder = async (basePath?: string) => {
  const homeDirectory = await homeDir();
  const targetPath = await getRelativePath(basePath);

  if (!(await exists(targetPath, { dir: BaseDirectory.Home }))) {
    await createDir(targetPath, { dir: BaseDirectory.Home, recursive: true });
  }

  return (
    await open({
      recursive: true,
      directory: true,
      defaultPath: targetPath,
    })
  )
    ?.toString()
    .replace(homeDirectory, '');
};

const readDirs = async (filePath?: string) => {
  const targetPath = await getRelativePath(filePath);
  const fileList = await readDir(targetPath, { dir: BaseDirectory.Home });
  const homeDirectory = await homeDir();

  return (fileList ?? [])
    .filter(file => !file.name?.startsWith('.'))
    .sort((a, b) => {
      if (a.children && !b.children) return -1;
      if (!a.children && b.children) return 1;
      return a?.name?.localeCompare(b?.name ?? '') || 0;
    })
    .map(file => ({
      path: file.path?.replace(homeDirectory, ''),
      name: file.name?.replace(homeDirectory, '') ?? '',
      type: file.children ? FileType.FOLDER : FileType.FILE,
    }));
};

const sourceFileApi = {
  saveFile: (filePath: string, content: string, append = false) =>
    saveFile(filePath, content, append),
  readFile: (filePath: string) => readFromFile(filePath),
  createFolder: (folderPath: string) => createDir(folderPath),
  deleteFileOrFolder,
  renameFileOrFolder,
  selectFolder,
  exists: async (filePath: string) => await exists(filePath, { dir: BaseDirectory.Home }),
  readDir: readDirs,
};

export { sourceFileApi };
