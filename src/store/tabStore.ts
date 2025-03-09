import { Connection } from './connectionStore.ts';
import { defineStore } from 'pinia';
import { sourceFileApi } from '../datasources';
import { CustomError } from '../common';

type Panel = {
  id: number;
  name: string;
  connection?: Connection;
  file: string;
  content?: string;
};

export const useTabStore = defineStore('panel', {
  state: (): {
    activePanelId: number;
    panels: Array<Panel>;
  } => ({
    activePanelId: 0,
    panels: [{ id: 0, name: 'home', file: '' }],
  }),
  getters: {},
  actions: {
    establishPanel(connectionOrFile: Connection | string): void {
      const isFile = typeof connectionOrFile == 'string';
      if (isFile) {
        const exists = this.panels.find(panelItem => panelItem.file === connectionOrFile);
        if (exists) {
          this.activePanelId = exists.id;
        } else {
          const newPanel: Panel = {
            id: this.panels.length + 1,
            name: connectionOrFile,
            file: connectionOrFile,
          };
          this.panels.push(newPanel);
          this.activePanelId = newPanel.id;
        }
      } else {
        const exists = this.panels.filter(
          panelItem => panelItem.connection?.id === connectionOrFile.id,
        );
        const panelName = !exists.length
          ? connectionOrFile.name
          : `${connectionOrFile.name}-${exists.length}`;

        const newPanel: Panel = {
          id: this.panels.length + 1,
          name: panelName,
          connection: connectionOrFile,
          file: `${panelName}.search`,
        };

        this.panels.push(newPanel);
        this.activePanelId = newPanel.id;
      }
    },
    async checkFileExists(panel: Panel | undefined) {
      if (!panel) return;
      try {
        return await sourceFileApi.exists(panel.file);
      } catch (err) {
        console.log('error isabs', err);
        throw err;
      }
    },

    async closePanel(panel: Panel | undefined, saveFile: boolean): Promise<void> {
      if (!panel) return;
      try {
        if (saveFile) {
          await this.saveFile(panel, panel.content || '');
        }
        const selectedIndex = this.panels.findIndex(({ id }) => id === panel.id);

        this.panels.splice(selectedIndex, 1);
        if (panel.id === this.activePanelId) {
          this.activePanelId = Math.min(selectedIndex, this.panels.length - 1);
        }
      } catch (err) {
        throw new CustomError(500, (err as Error).message);
      }
    },
    setActivePanel(panelId: number, content: string): void {
      const selectedPanel = this.panels.find(({ id }) => id === panelId);
      if (!selectedPanel) return;
      selectedPanel.content = content;
      this.activePanelId = selectedPanel.id;
    },

    async saveFile(panel: Panel, content: string): Promise<void> {
      let filePath = panel.file;
      if (!(await sourceFileApi.exists(filePath))) {
        const selectedFolder = await sourceFileApi.selectFolder();
        filePath = `${selectedFolder}/${filePath}`;
        console.log(`selectedFolder:${selectedFolder}, filePath:${filePath}`);
        if (!filePath) {
          throw new CustomError(404, 'Folder not found');
        }
      }

      await sourceFileApi.saveFile(filePath, content);
    },
  },
  persist: {
    paths: ['currentPanel'],
    storage: localStorage,
  },
});
