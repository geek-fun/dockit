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
import { platform } from '@tauri-apps/api/os';

import { homeDir, isAbsolute, basename, sep, extname } from '@tauri-apps/api/path';
import { open } from '@tauri-apps/api/dialog';
import { CustomError, debug } from '../common';

export enum PathTypeEnum {
  FILE = 'FILE',
  FOLDER = 'FOLDER',
}

export type PathInfo = {
  name: string;
  path: string;
  displayPath: string;
  type: PathTypeEnum;
};

const DEFAULT_FOLDER = '.dockit';

const getSysEmoji = async (): Promise<string> => {
  const os = await platform();
  let emoji = '';

  switch (os) {
    case 'linux':
      emoji = '🏠︎'; // Penguin emoji for Linux
      break;
    case 'darwin':
    case 'ios':
      emoji = ''; // Green apple emoji for macOS
      break;
    case 'freebsd':
    case 'dragonfly':
    case 'netbsd':
    case 'openbsd':
      emoji = '🐡'; // Blowfish emoji for OpenBSD
      break;
    case 'solaris':
      emoji = '☀️'; // Sun emoji for Solaris
      break;
    case 'android':
      emoji = '🤖'; // Robot emoji for Android
      break;
    case 'win32':
      emoji = '⊞'; // Window emoji for Windows
      break;
    default:
      emoji = '🏠︎'; // Globe emoji for other OS
  }

  return emoji;
};
const getFileType = async (filePath: string): Promise<PathTypeEnum> =>
  (await extname(filePath).catch(() => undefined)) ? PathTypeEnum.FILE : PathTypeEnum.FOLDER;

const getRelativePath = async (filePath?: string) => {
  const defaultPath = filePath ?? DEFAULT_FOLDER;
  const homeDirectory = await homeDir();
  const emoji = await getSysEmoji();

  return defaultPath.startsWith(homeDirectory) || defaultPath.startsWith(emoji)
    ? defaultPath.replace(homeDirectory, '').replace(`${emoji}/`, '')
    : defaultPath;
};

const getPathInfo = async (filePath: string): Promise<PathInfo | undefined> => {
  const homeFolder = await homeDir();

  const fileName = await basename(filePath).catch(() => undefined);
  const fileType = await getFileType(filePath);

  const targetPath = await getRelativePath(filePath);
  const absolute = await isAbsolute(targetPath);

  if (absolute) {
    if (!(await exists(targetPath, { dir: BaseDirectory.Home }))) return undefined;

    return {
      name: fileName,
      path: filePath,
      type: fileType,
      displayPath: await getDisplayPath(filePath),
    };
  }

  // file exists in specified folder
  if (await exists(targetPath, { dir: BaseDirectory.Home })) {
    const path = `${homeFolder}${targetPath}`;

    return { name: fileName, path, displayPath: await getDisplayPath(path), type: fileType };
  }

  // file exists in default folder
  if (
    !targetPath.startsWith(DEFAULT_FOLDER) &&
    (await exists(`${DEFAULT_FOLDER}${sep}${targetPath}`, { dir: BaseDirectory.Home }))
  ) {
    const path = `${homeFolder}${DEFAULT_FOLDER}${sep}${targetPath}`;

    return { name: fileName, path, displayPath: await getDisplayPath(path), type: fileType };
  }

  return undefined;
};

const saveFile = async (filePath: string, content: string, append: boolean) => {
  try {
    const folderPath = filePath.substring(0, filePath.lastIndexOf(sep));

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

const createFolder = async (folderPath: string) => {
  try {
    const targetPath = await getRelativePath(folderPath);

    if (!(await exists(targetPath, { dir: BaseDirectory.Home }))) {
      await createDir(targetPath, { dir: BaseDirectory.Home, recursive: true });
      debug('create folder success');
    }
  } catch (err) {
    debug(`createFolder error: ${err}`);
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

const selectFolder = async (basePath?: string) => {
  const homeDirectory = await homeDir();
  const targetPath = await getRelativePath(basePath);

  if (!(await exists(targetPath, { dir: BaseDirectory.Home }))) {
    await createDir(targetPath, { dir: BaseDirectory.Home, recursive: true });
  }
  const defaultPath = (await isAbsolute(basePath ?? ''))
    ? targetPath
    : `${homeDirectory}${targetPath}`;

  return (await open({ recursive: true, directory: true, defaultPath }))?.toString();
};

const readDirs = async (filePath?: string): Promise<Array<PathInfo>> => {
  const targetPath = await getRelativePath(filePath);
  const fileList = await readDir(targetPath, { dir: BaseDirectory.Home });

  return await Promise.all(
    (fileList ?? [])
      .filter(file => !file.name?.startsWith('.'))
      .sort((a, b) => {
        if (a.children && !b.children) return -1;
        if (!a.children && b.children) return 1;
        return a?.name?.localeCompare(b?.name ?? '') || 0;
      })
      .map(async file => ({
        path: file.path,
        name: file.name ?? '',
        displayPath: await getDisplayPath(file.path),
        type: file.children ? PathTypeEnum.FOLDER : PathTypeEnum.FILE,
      })),
  );
};

const getDisplayPath = async (filePath?: string) => {
  if (!filePath) return '';

  const homeDirectory = await homeDir();
  const sysEmoji = await getSysEmoji();

  if (filePath.startsWith(homeDirectory)) {
    return filePath.replace(homeDirectory, `${sysEmoji}/`).replace(/\\/g, '/');
  } else return filePath.replace(/\\/g, '/');
};

const sourceFileApi = {
  saveFile: (filePath: string, content: string, append = false) =>
    saveFile(filePath, content, append),
  readFile: (filePath: string) => readFromFile(filePath),
  createFolder,
  deleteFileOrFolder,
  renameFileOrFolder,
  selectFolder,
  exists: async (filePath: string) => await exists(filePath, { dir: BaseDirectory.Home }),
  readDir: readDirs,
  getPathInfo,
};

export { sourceFileApi };
