import { Connection, DatabaseType, useConnectionStore } from './connectionStore.ts';
import { defineStore } from 'pinia';
import { sourceFileApi } from '../datasources';
import { CustomError } from '../common';
import { defaultCodeSnippet } from '../common/monaco';
import { lang } from '../lang';

type Panel = {
  id: number;
  name: string;
  connection?: Connection;
  file?: string;
  content?: string;
  hideSystemIndices?: boolean;
  editorType?: 'DYNAMO_EDITOR_UI' | 'DYNAMO_EDITOR_SQL' | 'DYNAMO_EDITOR_CREATE_ITEM';
};

const homePanel: Panel = { id: 0, name: 'home', file: '' };
export type DynamoIndexOrTableOption = {
  label: string;
  value: string;
  partitionKeyName: string;
  sortKeyName?: string;
};

export const useTabStore = defineStore('panel', {
  state: () => ({
    activePanel: homePanel,
    panels: [homePanel],
    defaultSnippet: 0,
  }),
  getters: {
    activeConnection: state => state.activePanel.connection,
    activeElasticsearchIndexOption: state =>
      state.activePanel?.connection?.type === DatabaseType.ELASTICSEARCH
        ? state.activePanel.connection.indices?.map(index => ({
            label: index.index,
            value: index.index,
          }))
        : [],
  },
  actions: {
    async establishPanel(connectionOrFile: Connection | string): Promise<void> {
      const isFile = typeof connectionOrFile === 'string';
      if (isFile) {
        const fileInfo = await sourceFileApi.getPathInfo(connectionOrFile);
        const activePanel = this.panels.find(({ file }) => file === fileInfo?.path);
        if (activePanel) {
          this.activePanel = activePanel;
        } else {
          const newPanel: Panel = {
            id: this.panels.length + 1,
            name: fileInfo!.displayPath,
            file: fileInfo!.path,
            content: await sourceFileApi.readFile(fileInfo!.path),
          };
          this.panels.push(newPanel);
          this.activePanel = newPanel;
        }
      } else {
        const exists = this.panels.filter(
          panelItem => panelItem.connection?.id === connectionOrFile.id,
        );

        const isDynamoDB = connectionOrFile.type === DatabaseType.DYNAMODB;
        const fileExt = isDynamoDB ? '.partiql' : '.search';
        let fileName = !exists.length
          ? `${connectionOrFile.name}${fileExt}`
          : `${connectionOrFile.name}-${exists.length}${fileExt}`;
        let content = isDynamoDB ? '' : defaultCodeSnippet;

        const fileInfo = await sourceFileApi.getPathInfo(fileName);
        if (fileInfo) {
          content = await sourceFileApi.readFile(fileInfo.path);
        }
        const newPanel: Panel = {
          id: this.panels.length + 1,
          name: fileInfo?.displayPath ?? fileName,
          connection: connectionOrFile,
          file: fileInfo?.path,
          content,
          editorType: isDynamoDB ? 'DYNAMO_EDITOR_SQL' : undefined,
        };

        this.panels.push(newPanel);
        this.activePanel = newPanel;
      }
    },

    async checkFileExists(panel: Panel | undefined): Promise<boolean> {
      let checkPanel = panel ?? this.activePanel;
      if (!checkPanel?.file) return false;
      try {
        return await sourceFileApi.exists(checkPanel.file);
      } catch (err) {
        throw err;
      }
    },

    async closePanel(panel: Panel | undefined, saveFile: boolean): Promise<void> {
      if (!panel) return;
      try {
        if (saveFile) {
          await this.saveContent(panel, panel.content || '', true);
        }
        const selectedIndex = this.panels.findIndex(({ id }) => id === panel.id);

        this.panels.splice(selectedIndex, 1);
        if (panel.id === this.activePanel?.id) {
          this.activePanel =
            this.panels[Math.min(selectedIndex, this.panels.length - 1)] || homePanel;
        }
      } catch (err) {
        throw err instanceof CustomError ? err : new CustomError(500, (err as Error).message);
      }
    },

    setActivePanel(panelId: number): void {
      const selectedPanel = this.panels.find(({ id }) => id === panelId);
      if (!selectedPanel) return;
      this.activePanel = selectedPanel;
    },

    async saveContent(
      panel: Panel | undefined,
      content: string,
      validateFilePath = false,
    ): Promise<void> {
      let checkPanel = panel ?? this.activePanel;
      if (!checkPanel) return;
      checkPanel.content = content;

      let targetPath = checkPanel.file ?? checkPanel.name;
      const isExists = await sourceFileApi.exists(targetPath);

      if (!isExists) {
        if (!validateFilePath) return;

        const selectedFolder = await sourceFileApi.selectFolder();
        if (selectedFolder === null || selectedFolder === undefined) {
          throw new CustomError(404, lang.global.t('file.folderSelectCancel'));
        }

        targetPath = `${selectedFolder}/${targetPath}`;
      }

      await sourceFileApi.saveFile(targetPath, content);

      checkPanel.file = targetPath;
    },

    async selectConnection(con: Connection): Promise<void> {
      const { connections, testConnection } = useConnectionStore();
      const connection = connections.find(({ id }) => id === con.id);
      if (!connection) {
        throw new CustomError(404, lang.global.t('connection.notFound'));
      }

      await testConnection(connection);

      this.activePanel.connection = connection;
    },

    loadDefaultSnippet(): void {
      if (!this.activePanel) return;
      this.defaultSnippet += 1;
      this.activePanel.content = defaultCodeSnippet;
    },
  },
});
