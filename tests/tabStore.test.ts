import { setActivePinia, createPinia } from 'pinia';

jest.mock('../src/store/connectionStore', () => ({
  DatabaseType: {
    DYNAMODB: 'DYNAMODB',
    MONGODB: 'MONGODB',
    ELASTICSEARCH: 'ELASTICSEARCH',
    OPENSEARCH: 'OPENSEARCH',
    EASYSEARCH: 'EASYSEARCH',
  },
  isSearchConnection: jest.fn(),
  useConnectionStore: jest.fn(),
}));

jest.mock('../src/datasources', () => ({
  sourceFileApi: {
    getPathInfo: jest.fn(),
    readFile: jest.fn(),
    exists: jest.fn(),
    selectFolder: jest.fn(),
    saveFile: jest.fn(),
  },
}));

jest.mock('../src/common/monaco', () => ({
  defaultCodeSnippet: 'default code snippet',
}));

jest.mock('../src/common', () => ({
  CustomError: class CustomError extends Error {
    constructor(
      public readonly status: number,
      public readonly details: string,
    ) {
      super(details);
      void status;
    }
  },
}));

jest.mock('../src/lang', () => ({
  lang: { global: { t: (k: string) => k } },
}));

import { useTabStore } from '../src/store/tabStore';
import type { DynamoDBConnection, Connection } from '../src/store/connectionStore';

const dynamoConn = {
  id: 1,
  name: 'myDynamo',
  type: 'DYNAMODB' as const,
  region: 'us-east-1',
  auth: { kind: 'accessKey' as const, accessKeyId: 'ak', secretAccessKey: 'sk' },
};

const mongoConn: Connection = {
  id: 2,
  name: 'myMongo',
  type: 'MONGODB' as const,
  host: 'localhost',
  port: 27017,
  auth: { kind: 'none' as const },
};

const searchConn = {
  id: 3,
  name: 'mySearch',
  type: 'ELASTICSEARCH' as const,
  host: 'http://localhost',
  port: 9200,
  indices: [
    { index: 'index-1', health: 'green', status: 'open', uuid: 'u1', docs: { count: 10, deleted: 0 }, store: { size: '1kb' }, pri: { store: { size: '1kb' } }, mapping: {} },
    { index: 'index-2', health: 'green', status: 'open', uuid: 'u2', docs: { count: 20, deleted: 0 }, store: { size: '2kb' }, pri: { store: { size: '2kb' } }, mapping: {} },
  ],
  activeIndex: undefined,
  version: '8.0.0',
  isOpenSearch: false,
  clusterName: 'c',
  clusterUuid: 'u',
  sslCertVerification: false,
};

const mockPathInfo = { name: 'test', path: '/home/test.file', displayPath: '~/test.file', type: 'FILE' as const };

beforeEach(() => {
  setActivePinia(createPinia());

  const { useConnectionStore, isSearchConnection } =
    require('../src/store/connectionStore');
  isSearchConnection.mockReset();
  isSearchConnection.mockReturnValue(false);
  useConnectionStore.mockReset();
  useConnectionStore.mockReturnValue({
    connections: [],
    freshConnection: jest.fn(),
    fetchTables: jest.fn().mockResolvedValue([]),
    saveConnection: jest.fn(),
  });

  const { sourceFileApi } = require('../src/datasources');
  sourceFileApi.getPathInfo.mockReset();
  sourceFileApi.readFile.mockReset();
  sourceFileApi.exists.mockReset();
  sourceFileApi.selectFolder.mockReset();
  sourceFileApi.saveFile.mockReset();
});

describe('establishPanel - file path', () => {
  it('creates a new panel when no panel exists with the same file', async () => {
    const { sourceFileApi } = require('../src/datasources');
    sourceFileApi.getPathInfo.mockResolvedValue(mockPathInfo);
    sourceFileApi.readFile.mockResolvedValue('file content');

    const store = useTabStore();
    await store.establishPanel('/some/file.path');

    expect(store.panels).toHaveLength(2);
    const panel = store.panels[1];
    expect(panel.id).toBe(2);
    expect(panel.name).toBe('~/test.file');
    expect(panel.file).toBe('/home/test.file');
    expect(panel.content).toBe('file content');
    expect(store.activePanel).toBe(panel);
  });

  it('sets existing panel as active when a panel with the same file already exists', async () => {
    const { sourceFileApi } = require('../src/datasources');
    sourceFileApi.getPathInfo.mockResolvedValue(mockPathInfo);
    sourceFileApi.readFile.mockResolvedValue('file content');

    const store = useTabStore();
    await store.establishPanel('/some/file.path');
    const firstPanel = store.activePanel;

    // Second call with same file
    await store.establishPanel('/some/file.path');

    expect(store.panels).toHaveLength(2);
    expect(store.activePanel).toBe(firstPanel);
  });

  it('does not read file content when panel already exists', async () => {
    const { sourceFileApi } = require('../src/datasources');
    sourceFileApi.getPathInfo.mockResolvedValue(mockPathInfo);
    sourceFileApi.readFile.mockResolvedValue('file content');

    const store = useTabStore();
    await store.establishPanel('/some/file.path');

    sourceFileApi.readFile.mockClear();

    await store.establishPanel('/some/file.path');

    expect(sourceFileApi.readFile).not.toHaveBeenCalled();
  });

  it('assigns incremental ids to multiple file panels', async () => {
    const { sourceFileApi } = require('../src/datasources');
    sourceFileApi.getPathInfo
      .mockResolvedValueOnce(mockPathInfo)
      .mockResolvedValueOnce({ ...mockPathInfo, path: '/home/file2', displayPath: '~/file2' });
    sourceFileApi.readFile.mockResolvedValue('content');

    const store = useTabStore();
    await store.establishPanel('/first');
    await store.establishPanel('/second');

    expect(store.panels[1].id).toBe(2);
    expect(store.panels[2].id).toBe(3);
  });
});

describe('establishPanel - connection', () => {
  it('creates DynamoDB panel with editorType and empty content', async () => {
    const { sourceFileApi } = require('../src/datasources');
    sourceFileApi.getPathInfo.mockResolvedValue(undefined);

    const store = useTabStore();
    await store.establishPanel(dynamoConn);

    expect(store.panels).toHaveLength(2);
    const panel = store.panels[1];
    expect(panel.editorType).toBe('DYNAMO_EDITOR_UI');
    expect(panel.content).toBe('');
    expect(panel.name).toBe('myDynamo.partiql');
    expect(panel.connection).toStrictEqual(dynamoConn);
    expect(panel.file).toBeUndefined();
    expect(store.activePanel).toBe(panel);
  });

  it('creates MongoDB panel with no editorType and empty content', async () => {
    const { sourceFileApi } = require('../src/datasources');
    sourceFileApi.getPathInfo.mockResolvedValue(undefined);

    const store = useTabStore();
    await store.establishPanel(mongoConn);

    const panel = store.panels[1];
    expect(panel.editorType).toBeUndefined();
    expect(panel.content).toBe('');
    expect(panel.name).toBe('myMongo.mongo');
    expect(panel.connection).toStrictEqual(mongoConn);
  });

  it('creates Search panel with no editorType and default code snippet content', async () => {
    const { isSearchConnection } = require('../src/store/connectionStore');
    isSearchConnection.mockReturnValue(true);

    const { sourceFileApi } = require('../src/datasources');
    sourceFileApi.getPathInfo.mockResolvedValue(undefined);

    const store = useTabStore();
    await store.establishPanel(searchConn);

    const panel = store.panels[1];
    expect(panel.editorType).toBeUndefined();
    expect(panel.content).toBe('default code snippet');
    expect(panel.name).toBe('mySearch.search');
    expect(panel.connection).toStrictEqual(searchConn);
  });

  it('reads file content from disk when file exists for connection panel', async () => {
    const { sourceFileApi } = require('../src/datasources');
    sourceFileApi.getPathInfo.mockResolvedValue(mockPathInfo);
    sourceFileApi.readFile.mockResolvedValue('saved file content');

    const store = useTabStore();
    await store.establishPanel(searchConn);

    const panel = store.panels[1];
    expect(panel.content).toBe('saved file content');
    expect(sourceFileApi.getPathInfo).toHaveBeenCalledWith('mySearch.search');
    expect(sourceFileApi.readFile).toHaveBeenCalledWith('/home/test.file');
  });

  it('generates suffixed filenames on name collision for same connection', async () => {
    const { sourceFileApi } = require('../src/datasources');
    sourceFileApi.getPathInfo.mockResolvedValue(undefined);

    const store = useTabStore();
    await store.establishPanel(searchConn);
    expect(store.panels[1].name).toBe('mySearch.search');

    await store.establishPanel(searchConn);
    expect(store.panels[2].name).toBe('mySearch-1.search');
  });

  it('assigns incremental panel ids for connection panels', async () => {
    const { sourceFileApi } = require('../src/datasources');
    sourceFileApi.getPathInfo.mockResolvedValue(undefined);

    const store = useTabStore();
    await store.establishPanel(dynamoConn);
    await store.establishPanel(mongoConn);

    expect(store.panels[1].id).toBe(2);
    expect(store.panels[2].id).toBe(3);
  });

  it('uses displayPath from fileInfo when available for panel name', async () => {
    const { sourceFileApi } = require('../src/datasources');
    sourceFileApi.getPathInfo.mockResolvedValue(mockPathInfo);
    sourceFileApi.readFile.mockResolvedValue('content');

    const store = useTabStore();
    await store.establishPanel(dynamoConn);

    expect(store.panels[1].name).toBe('~/test.file');
  });

  it('sets file path on panel when fileInfo is returned', async () => {
    const { sourceFileApi } = require('../src/datasources');
    sourceFileApi.getPathInfo.mockResolvedValue(mockPathInfo);
    sourceFileApi.readFile.mockResolvedValue('content');

    const store = useTabStore();
    await store.establishPanel(dynamoConn);

    expect(store.panels[1].file).toBe('/home/test.file');
  });
});

describe('checkFileExists', () => {
  it('returns true when the panel file exists', async () => {
    const { sourceFileApi } = require('../src/datasources');
    sourceFileApi.exists.mockResolvedValue(true);
    sourceFileApi.getPathInfo.mockResolvedValue(mockPathInfo);
    sourceFileApi.readFile.mockResolvedValue('content');

    const store = useTabStore();
    await store.establishPanel('/file');
    const result = await store.checkFileExists(store.activePanel);

    expect(result).toBe(true);
    expect(sourceFileApi.exists).toHaveBeenCalledWith('/home/test.file');
  });

  it('returns false when the panel file does not exist', async () => {
    const { sourceFileApi } = require('../src/datasources');
    sourceFileApi.getPathInfo.mockResolvedValue(mockPathInfo);
    sourceFileApi.readFile.mockResolvedValue('content');
    sourceFileApi.exists.mockResolvedValue(false);

    const store = useTabStore();
    await store.establishPanel('/file');
    const result = await store.checkFileExists(store.activePanel);

    expect(result).toBe(false);
  });

  it('returns false when panel has no file', async () => {
    const store = useTabStore();
    const panelWithoutFile = { id: 99, name: 'no-file', file: undefined } as any;
    const result = await store.checkFileExists(panelWithoutFile);

    expect(result).toBe(false);
    const { sourceFileApi } = require('../src/datasources');
    expect(sourceFileApi.exists).not.toHaveBeenCalled();
  });

  it('uses activePanel when no panel argument is provided', async () => {
    const { sourceFileApi } = require('../src/datasources');
    sourceFileApi.getPathInfo.mockResolvedValue(mockPathInfo);
    sourceFileApi.readFile.mockResolvedValue('content');
    sourceFileApi.exists.mockResolvedValue(true);

    const store = useTabStore();
    await store.establishPanel('/file');
    const result = await store.checkFileExists();

    expect(result).toBe(true);
    expect(sourceFileApi.exists).toHaveBeenCalled();
  });

  it('returns false when activePanel has no file', async () => {
    const store = useTabStore();
    const result = await store.checkFileExists();

    expect(result).toBe(false);
  });
});

describe('setActivePanel', () => {
  it('sets activePanel to the panel with the matching id', () => {
    const store = useTabStore();
    const panelA = { id: 1, name: 'A', file: '' };
    const panelB = { id: 2, name: 'B', file: '' };
    store.panels = [store.activePanel, panelA as any, panelB as any];

    store.setActivePanel(2);
    expect(store.activePanel.name).toBe('B');
  });

  it('does nothing when id is not found', () => {
    const store = useTabStore();
    const original = store.activePanel;

    store.setActivePanel(999);
    expect(store.activePanel).toBe(original);
  });
});

describe('closePanel', () => {
  it('removes panel without saving when saveFile is false', async () => {
    const store = useTabStore();
    const panel = { id: 1, name: 'test', file: '' };
    store.panels = [{ id: 0, name: 'home', file: '' }, panel as any];

    await store.closePanel(panel as any, false);

    expect(store.panels).toHaveLength(1);
    expect(store.panels[0].id).toBe(0);
  });

  it('saves content before removing panel when saveFile is true', async () => {
    const { sourceFileApi } = require('../src/datasources');
    sourceFileApi.exists.mockResolvedValue(true);
    sourceFileApi.saveFile.mockResolvedValue(undefined);

    const store = useTabStore();
    const panel = { id: 1, name: 'test', file: '/path/file', content: 'data' };
    store.panels = [{ id: 0, name: 'home', file: '' }, panel as any];

    await store.closePanel(panel as any, true);

    expect(sourceFileApi.saveFile).toHaveBeenCalledWith('/path/file', 'data');
    expect(store.panels).toHaveLength(1);
  });

  it('selects next panel when closing the active panel and more panels remain', async () => {
    const store = useTabStore();
    const p1 = { id: 1, name: 'p1', file: '' };
    const p2 = { id: 2, name: 'p2', file: '' };
    store.panels = [{ id: 0, name: 'home', file: '' }, p1 as any, p2 as any];
    store.activePanel = p1 as any;

    await store.closePanel(p1 as any, false);

    expect(store.activePanel.id).toBe(2);
  });

  it('falls back to homePanel when closing the last active panel', async () => {
    const store = useTabStore();
    const p1 = { id: 1, name: 'only', file: '' };
    store.panels = [{ id: 0, name: 'home', file: '' }, p1 as any];
    store.activePanel = p1 as any;

    await store.closePanel(p1 as any, false);

    expect(store.activePanel.id).toBe(0);
    expect(store.activePanel.name).toBe('home');
  });

  it('does not change activePanel when closing a non-active panel', async () => {
    const store = useTabStore();
    const p1 = { id: 1, name: 'p1', file: '' };
    const p2 = { id: 2, name: 'p2', file: '' };
    store.panels = [{ id: 0, name: 'home', file: '' }, p1 as any, p2 as any];
    store.activePanel = p2 as any;

    await store.closePanel(p1 as any, false);

    expect(store.activePanel.id).toBe(2);
  });

  it('is a no-op when panel is undefined', async () => {
    const store = useTabStore();
    const panelsBefore = store.panels.length;

    await store.closePanel(undefined, false);

    expect(store.panels).toHaveLength(panelsBefore);
  });

  it('re-throws CustomError when saveContent fails', async () => {
    const { sourceFileApi } = require('../src/datasources');
    sourceFileApi.exists.mockResolvedValue(false);

    const store = useTabStore();
    const panel = { id: 1, name: 'test', file: '/path/file', content: 'data' };
    store.panels = [{ id: 0, name: 'home', file: '' }, panel as any];

    await expect(store.closePanel(panel as any, true)).rejects.toThrow();
    expect(store.panels).toHaveLength(2);
  });

  it('wraps non-CustomError in CustomError(500) when saveContent fails', async () => {
    const { sourceFileApi } = require('../src/datasources');

    jest.spyOn(sourceFileApi, 'exists').mockRejectedValue(new TypeError('unexpected'));

    const store = useTabStore();
    const panel = { id: 1, name: 'test', file: '/path/file', content: 'data' };
    store.panels = [{ id: 0, name: 'home', file: '' }, panel as any];

    await expect(store.closePanel(panel as any, true)).rejects.toThrow();
  });

  it('passes empty string to saveContent when panel content is undefined', async () => {
    const { sourceFileApi } = require('../src/datasources');
    sourceFileApi.exists.mockResolvedValue(true);
    sourceFileApi.saveFile.mockResolvedValue(undefined);

    const store = useTabStore();
    const panel = { id: 1, name: 'test', file: '/path/file', content: undefined };
    store.panels = [{ id: 0, name: 'home', file: '' }, panel as any];

    await store.closePanel(panel as any, true);

    expect(sourceFileApi.saveFile).toHaveBeenCalledWith('/path/file', '');
  });

  it('falls back to homePanel when all panels are removed and active panel is closed', async () => {
    const store = useTabStore();
    store.panels = [];
    const p = { id: 1, name: 'temp', file: '' };
    store.panels.push(p as any);
    store.activePanel = p as any;

    await store.closePanel(p as any, false);

    expect(store.activePanel.id).toBe(0);
    expect(store.activePanel.name).toBe('home');
  });
});

describe('saveContent', () => {
  it('saves content to existing file path and updates panel.file', async () => {
    const { sourceFileApi } = require('../src/datasources');
    sourceFileApi.exists.mockResolvedValue(true);
    sourceFileApi.saveFile.mockResolvedValue(undefined);

    const store = useTabStore();
    const panel = { id: 1, name: 'test', file: '/path/file', content: '' };
    store.panels = [{ id: 0, name: 'home', file: '' }, panel as any];

    await store.saveContent(panel as any, 'new content', true);

    expect(sourceFileApi.saveFile).toHaveBeenCalledWith('/path/file', 'new content');
    expect(panel.content).toBe('new content');
    expect(panel.file).toBe('/path/file');
  });

  it('returns early when target file does not exist and validateFilePath is false', async () => {
    const { sourceFileApi } = require('../src/datasources');
    sourceFileApi.exists.mockResolvedValue(false);

    const store = useTabStore();
    const panel = { id: 1, name: 'test', file: '/path/nonexistent', content: 'old' };

    await store.saveContent(panel as any, 'new content', false);

    expect(panel.content).toBe('new content');
    expect(sourceFileApi.saveFile).not.toHaveBeenCalled();
  });

  it('selects folder and saves when target does not exist and validateFilePath is true', async () => {
    const { sourceFileApi } = require('../src/datasources');
    sourceFileApi.exists.mockResolvedValue(false);
    sourceFileApi.selectFolder.mockResolvedValue('/selected/folder');
    sourceFileApi.saveFile.mockResolvedValue(undefined);

    const store = useTabStore();
    const panel = { id: 1, name: 'test', file: '/path/nonexistent', content: 'old' };

    await store.saveContent(panel as any, 'new content', true);

    expect(sourceFileApi.selectFolder).toHaveBeenCalled();
    expect(sourceFileApi.saveFile).toHaveBeenCalledWith('/selected/folder//path/nonexistent', 'new content');
    expect(panel.file).toBe('/selected/folder//path/nonexistent');
  });

  it('uses panel.name when panel.file is undefined', async () => {
    const { sourceFileApi } = require('../src/datasources');
    sourceFileApi.exists.mockResolvedValue(false);
    sourceFileApi.selectFolder.mockResolvedValue('/folder');
    sourceFileApi.saveFile.mockResolvedValue(undefined);

    const store = useTabStore();
    const panel = { id: 1, name: 'myName', file: undefined, content: '' };

    await store.saveContent(panel as any, 'content', true);

    expect(sourceFileApi.saveFile).toHaveBeenCalledWith('/folder/myName', 'content');
  });

  it('throws CustomError(404) when folder selection is cancelled', async () => {
    const { sourceFileApi } = require('../src/datasources');
    sourceFileApi.exists.mockResolvedValue(false);
    sourceFileApi.selectFolder.mockResolvedValue(null);

    const store = useTabStore();
    const panel = { id: 1, name: 'test', file: '/path/nonexistent', content: '' };

    await expect(store.saveContent(panel as any, 'content', true)).rejects.toThrow();
  });

  it('uses activePanel when panel argument is undefined', async () => {
    const { sourceFileApi } = require('../src/datasources');
    sourceFileApi.exists.mockResolvedValue(true);
    sourceFileApi.saveFile.mockResolvedValue(undefined);

    const store = useTabStore();
    const panel = { id: 1, name: 'active', file: '/active/file', content: 'old' };
    store.panels = [{ id: 0, name: 'home', file: '' }, panel as any];
    store.activePanel = panel as any;

    await store.saveContent(undefined, 'new content', true);

    expect(sourceFileApi.saveFile).toHaveBeenCalledWith('/active/file', 'new content');
    expect(panel.content).toBe('new content');
  });

  it('uses default validateFilePath=false when called without third argument', async () => {
    const { sourceFileApi } = require('../src/datasources');
    sourceFileApi.exists.mockResolvedValue(false);

    const store = useTabStore();
    const panel = { id: 1, name: 'test', file: '/path/nonexistent', content: 'old' };

    await store.saveContent(panel as any, 'new content');

    expect(panel.content).toBe('new content');
    expect(sourceFileApi.selectFolder).not.toHaveBeenCalled();
    expect(sourceFileApi.saveFile).not.toHaveBeenCalled();
  });

  it('is no-op when both panel and activePanel are missing', async () => {
    const store = useTabStore();
    store.activePanel = null as any;

    await store.saveContent(undefined, 'content', false);

    const { sourceFileApi } = require('../src/datasources');
    expect(sourceFileApi.exists).not.toHaveBeenCalled();
    expect(sourceFileApi.saveFile).not.toHaveBeenCalled();
  });
});

describe('selectConnection', () => {
  it('sets activePanel.connection to the matching connection from store', async () => {
    const { useConnectionStore } = require('../src/store/connectionStore');
    const mockConn = { ...mongoConn };
    useConnectionStore.mockReturnValue({
      connections: [mockConn],
      freshConnection: jest.fn().mockResolvedValue(undefined),
      fetchTables: jest.fn().mockResolvedValue([]),
      saveConnection: jest.fn(),
    });

    const store = useTabStore();
    store.activePanel = { id: 1, name: 'panel' } as any;

    await store.selectConnection(mongoConn);

    expect(store.activePanel.connection).toStrictEqual(mockConn);
  });

  it('calls freshConnection for non-DynamoDB connections', async () => {
    const freshConnection = jest.fn().mockResolvedValue(undefined);
    const { useConnectionStore } = require('../src/store/connectionStore');
    useConnectionStore.mockReturnValue({
      connections: [mongoConn],
      freshConnection,
      fetchTables: jest.fn(),
      saveConnection: jest.fn(),
    });

    const store = useTabStore();
    store.activePanel = { id: 1, name: 'panel' } as any;

    await store.selectConnection(mongoConn);

    expect(freshConnection).toHaveBeenCalledWith(mongoConn);
    expect(store.activePanel.connection).toStrictEqual(mongoConn);
  });

  it('picks first table from fetchTables for DynamoDB when no activeTable and no favorites', async () => {
    const fetchTables = jest.fn().mockResolvedValue([{ name: 'orders' }, { name: 'users' }]);
    const { useConnectionStore } = require('../src/store/connectionStore');
    const connWithFavs = { ...dynamoConn, favoriteTables: undefined };
    useConnectionStore.mockReturnValue({
      connections: [connWithFavs],
      freshConnection: jest.fn(),
      fetchTables,
      saveConnection: jest.fn(),
    });

    const store = useTabStore();
    store.activePanel = { id: 1, name: 'panel', activeTable: undefined } as any;

    await store.selectConnection(connWithFavs as any);

    expect(store.activePanel.activeTable).toBe('orders');
    expect(store.activePanel.connection).toStrictEqual(connWithFavs);
  });

  it('picks first matching favorite table over first table for DynamoDB', async () => {
    const fetchTables = jest.fn().mockResolvedValue([{ name: 'orders' }, { name: 'users' }, { name: 'products' }]);
    const { useConnectionStore } = require('../src/store/connectionStore');
    const connWithFavs = { ...dynamoConn, favoriteTables: ['products', 'nonexistent'] };
    useConnectionStore.mockReturnValue({
      connections: [connWithFavs],
      freshConnection: jest.fn(),
      fetchTables,
      saveConnection: jest.fn(),
    });

    const store = useTabStore();
    store.activePanel = { id: 1, name: 'panel', activeTable: undefined } as any;

    await store.selectConnection(connWithFavs as any);

    expect(store.activePanel.activeTable).toBe('products');
  });

  it('does not set activeTable when fetchTables returns empty for DynamoDB', async () => {
    const fetchTables = jest.fn().mockResolvedValue([]);
    const { useConnectionStore } = require('../src/store/connectionStore');
    useConnectionStore.mockReturnValue({
      connections: [dynamoConn],
      freshConnection: jest.fn(),
      fetchTables,
      saveConnection: jest.fn(),
    });

    const store = useTabStore();
    store.activePanel = { id: 1, name: 'panel', activeTable: undefined } as any;

    await store.selectConnection(dynamoConn as any);

    expect(store.activePanel.activeTable).toBeUndefined();
  });

  it('does not overwrite activeTable if already set', async () => {
    const fetchTables = jest.fn().mockResolvedValue([{ name: 'orders' }]);
    const { useConnectionStore } = require('../src/store/connectionStore');
    useConnectionStore.mockReturnValue({
      connections: [dynamoConn],
      freshConnection: jest.fn(),
      fetchTables,
      saveConnection: jest.fn(),
    });

    const store = useTabStore();
    store.activePanel = { id: 1, name: 'panel', activeTable: 'existing' } as any;

    await store.selectConnection(dynamoConn as any);

    expect(store.activePanel.activeTable).toBe('existing');
  });

  it('throws CustomError(404) when connection is not in store', async () => {
    const { useConnectionStore } = require('../src/store/connectionStore');
    useConnectionStore.mockReturnValue({
      connections: [],
      freshConnection: jest.fn(),
      fetchTables: jest.fn(),
      saveConnection: jest.fn(),
    });

    const store = useTabStore();
    store.activePanel = { id: 1, name: 'panel' } as any;

    await expect(store.selectConnection(mongoConn)).rejects.toThrow();
  });
});

describe('toggleFavoriteTable', () => {
  it('removes table from favorites when already present', async () => {
    const saveConnection = jest.fn().mockResolvedValue({ success: true });
    const connWithFavs = { ...dynamoConn, favoriteTables: ['orders', 'users'] };
    const { useConnectionStore } = require('../src/store/connectionStore');
    useConnectionStore.mockReturnValue({
      connections: [connWithFavs],
      freshConnection: jest.fn(),
      fetchTables: jest.fn(),
      saveConnection,
    });

    const store = useTabStore();
    store.activePanel = { id: 1, name: 'panel', connection: dynamoConn } as any;

    await store.toggleFavoriteTable('orders');

    expect(connWithFavs.favoriteTables).toEqual(['users']);
    expect(saveConnection).toHaveBeenCalledWith(connWithFavs);
    expect((store.activePanel.connection as any).favoriteTables).toEqual(['users']);
  });

  it('adds table to favorites when not present', async () => {
    const saveConnection = jest.fn().mockResolvedValue({ success: true });
    const connWithFavs = { ...dynamoConn, favoriteTables: ['orders'] };
    const { useConnectionStore } = require('../src/store/connectionStore');
    useConnectionStore.mockReturnValue({
      connections: [connWithFavs],
      freshConnection: jest.fn(),
      fetchTables: jest.fn(),
      saveConnection,
    });

    const store = useTabStore();
    store.activePanel = { id: 1, name: 'panel', connection: dynamoConn } as any;

    await store.toggleFavoriteTable('users');

    expect(connWithFavs.favoriteTables).toEqual(['orders', 'users']);
    expect(saveConnection).toHaveBeenCalledWith(connWithFavs);
  });

  it('initializes favoriteTables when it is undefined', async () => {
    const saveConnection = jest.fn().mockResolvedValue({ success: true });
    const connNoFavs = { ...dynamoConn, favoriteTables: undefined };
    const { useConnectionStore } = require('../src/store/connectionStore');
    useConnectionStore.mockReturnValue({
      connections: [connNoFavs],
      freshConnection: jest.fn(),
      fetchTables: jest.fn(),
      saveConnection,
    });

    const store = useTabStore();
    store.activePanel = { id: 1, name: 'panel', connection: dynamoConn } as any;

    await store.toggleFavoriteTable('orders');

    expect(connNoFavs.favoriteTables).toEqual(['orders']);
    expect(saveConnection).toHaveBeenCalledWith(connNoFavs);
  });

  it('is no-op when activePanel connection is not DynamoDB', async () => {
    const saveConnection = jest.fn();
    const { useConnectionStore } = require('../src/store/connectionStore');
    useConnectionStore.mockReturnValue({
      connections: [mongoConn],
      freshConnection: jest.fn(),
      fetchTables: jest.fn(),
      saveConnection,
    });

    const store = useTabStore();
    store.activePanel = { id: 1, name: 'panel', connection: mongoConn } as any;

    await store.toggleFavoriteTable('test');

    expect(saveConnection).not.toHaveBeenCalled();
  });

  it('is no-op when activePanel has no connection', async () => {
    const saveConnection = jest.fn();
    const { useConnectionStore } = require('../src/store/connectionStore');
    useConnectionStore.mockReturnValue({
      connections: [],
      freshConnection: jest.fn(),
      fetchTables: jest.fn(),
      saveConnection,
    });

    const store = useTabStore();
    store.activePanel = { id: 1, name: 'panel', connection: undefined } as any;

    await store.toggleFavoriteTable('test');

    expect(saveConnection).not.toHaveBeenCalled();
  });

  it('is no-op when connection not found in store', async () => {
    const saveConnection = jest.fn();
    const { useConnectionStore } = require('../src/store/connectionStore');
    useConnectionStore.mockReturnValue({
      connections: [],
      freshConnection: jest.fn(),
      fetchTables: jest.fn(),
      saveConnection,
    });

    const store = useTabStore();
    store.activePanel = { id: 1, name: 'panel', connection: dynamoConn } as any;

    await store.toggleFavoriteTable('test');

    expect(saveConnection).not.toHaveBeenCalled();
  });
});

describe('loadDefaultSnippet', () => {
  it('increments defaultSnippet and sets content on activePanel', () => {
    const store = useTabStore();
    expect(store.defaultSnippet).toBe(0);

    store.loadDefaultSnippet();

    expect(store.defaultSnippet).toBe(1);
    expect(store.activePanel.content).toBe('default code snippet');
  });

  it('is no-op when there is no activePanel', () => {
    const store = useTabStore();
    store.activePanel = null as any;

    store.loadDefaultSnippet();

    expect(store.defaultSnippet).toBe(0);
  });
});

describe('setActiveTable', () => {
  it('sets activeTable on activePanel', () => {
    const store = useTabStore();
    store.activePanel = { id: 1, name: 'panel' } as any;

    store.setActiveTable('myTable');

    expect(store.activePanel.activeTable).toBe('myTable');
  });
});

describe('saveQueryResult', () => {
  it('sets queryResult on activePanel', () => {
    const store = useTabStore();
    store.activePanel = { id: 1, name: 'panel' } as any;

    store.saveQueryResult({ items: [1, 2, 3] });

    expect(store.activePanel.queryResult).toEqual({ items: [1, 2, 3] });
  });
});

describe('setPendingInsertQuery / clearPendingInsertQuery', () => {
  it('sets pendingInsertQuery, mode, and increments token', () => {
    const store = useTabStore();
    expect(store.pendingInsertQuery).toBeNull();
    expect(store.pendingInsertToken).toBe(0);

    store.setPendingInsertQuery('SELECT *', 'append_bottom');

    expect(store.pendingInsertQuery).toBe('SELECT *');
    expect(store.pendingInsertMode).toBe('append_bottom');
    expect(store.pendingInsertToken).toBe(1);
  });

  it('defaults mode to cursor', () => {
    const store = useTabStore();
    store.setPendingInsertQuery('test');

    expect(store.pendingInsertMode).toBe('cursor');
    expect(store.pendingInsertToken).toBe(1);
  });

  it('increments token on each call', () => {
    const store = useTabStore();
    store.setPendingInsertQuery('q1');
    store.setPendingInsertQuery('q2');
    expect(store.pendingInsertToken).toBe(2);
  });

  it('clears pendingInsertQuery while preserving token', () => {
    const store = useTabStore();
    store.setPendingInsertQuery('SELECT *');
    const token = store.pendingInsertToken;

    store.clearPendingInsertQuery();

    expect(store.pendingInsertQuery).toBeNull();
    expect(store.pendingInsertToken).toBe(token);
  });
});

describe('getters', () => {
  describe('activeConnection', () => {
    it('returns the connection from activePanel', () => {
      const store = useTabStore();
      store.activePanel = { id: 1, name: 'p', connection: dynamoConn } as any;

      expect(store.activeConnection).toStrictEqual(dynamoConn);
    });

    it('returns undefined when activePanel has no connection', () => {
      const store = useTabStore();
      expect(store.activeConnection).toBeUndefined();
    });
  });

  describe('activeQueryResult', () => {
    it('returns queryResult from activePanel', () => {
      const store = useTabStore();
      store.activePanel = { id: 1, name: 'p', queryResult: { data: 'test' } } as any;

      expect(store.activeQueryResult).toEqual({ data: 'test' });
    });

    it('returns undefined when no queryResult', () => {
      const store = useTabStore();
      expect(store.activeQueryResult).toBeUndefined();
    });
  });

  describe('activeSearchIndexOption', () => {
    it('returns empty array when activePanel has no connection', () => {
      const store = useTabStore();
      store.activePanel = { id: 1, name: 'p', connection: undefined } as any;

      expect(store.activeSearchIndexOption).toEqual([]);
    });

    it('returns empty array when connection is not a search connection', () => {
      const { isSearchConnection } = require('../src/store/connectionStore');
      isSearchConnection.mockReturnValue(false);

      const store = useTabStore();
      store.activePanel = { id: 1, name: 'p', connection: mongoConn } as any;

      expect(store.activeSearchIndexOption).toEqual([]);
    });

    it('returns formatted index options for search connection with indices', () => {
      const { isSearchConnection } = require('../src/store/connectionStore');
      isSearchConnection.mockReturnValue(true);

      const store = useTabStore();
      store.activePanel = { id: 1, name: 'p', connection: searchConn } as any;

      expect(store.activeSearchIndexOption).toEqual([
        { label: 'index-1', value: 'index-1' },
        { label: 'index-2', value: 'index-2' },
      ]);
    });

    it('returns empty array for search connection with no indices', () => {
      const { isSearchConnection } = require('../src/store/connectionStore');
      isSearchConnection.mockReturnValue(true);

      const store = useTabStore();
      const connNoIndices = { ...searchConn, indices: undefined };
      store.activePanel = { id: 1, name: 'p', connection: connNoIndices } as any;

      expect(store.activeSearchIndexOption).toEqual([]);
    });
  });
});
