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

import { homeDir, isAbsolute, basename,sep } from '@tauri-apps/api/path';
import { open } from '@tauri-apps/api/dialog';
import { CustomError, debug } from '../common';
import { FileType } from '../store';

const DEFAULT_FOLDER = '.dockit';
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
  const defaultPath = filePath ?? DEFAULT_FOLDER;
  const homeDirectory = await homeDir();
  const emoji = await getSysEmoji();

  return defaultPath.startsWith(homeDirectory) || defaultPath.startsWith(emoji)
    ? defaultPath.replace(homeDirectory, '').replace(`${emoji}/`, '')
    : defaultPath;
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

const readDirs = async (filePath?: string) => {
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
        name: file.name,
        displayPath: await getDisplayPath(file.path),
        type: file.children ? FileType.FOLDER : FileType.FILE,
      })),
  );
};

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

const getDisplayPath = async (filePath?: string) => {
  if (!filePath) return '';

  const homeDirectory = await homeDir();
  const sysEmoji = await getSysEmoji();

  if (filePath.startsWith(homeDirectory)) {
    return filePath.replace(homeDirectory, `${sysEmoji}/`).replace(/\\/g, '/');
} else return filePath.replace(/\\/g, '/');
};

const getFileInfo = async (filePath: string) => {
  const absolute = await isAbsolute(filePath);
  const homeFolder = await homeDir();

  const fileName = await basename(filePath);

  if (absolute) {
    if (!(await exists(await getRelativePath(filePath), { dir: BaseDirectory.Home })))
      return undefined;

    return { name: fileName, path: filePath, displayPath: await getDisplayPath(filePath) };
  }

  // file exists in specified folder
  if (await exists(filePath, { dir: BaseDirectory.Home })) {
    const path = `${homeFolder}${filePath}`;

    return { name: fileName, path, displayPath: await getDisplayPath(path) };
  }
  // file exists in default folder
  if (await exists(`${DEFAULT_FOLDER}${sep}${filePath}`, { dir: BaseDirectory.Home })) {
    const path = `${homeFolder}${DEFAULT_FOLDER}${sep}${filePath}`;

    return { name: fileName, path, displayPath: await getDisplayPath(path) };
  }

  return undefined;
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
  getFileInfo,
};

export { sourceFileApi };
