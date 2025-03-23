import { Connection } from './connectionStore.ts';
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
};

const homePanel = { id: 0, name: 'home', file: '' };

export const useTabStore = defineStore('panel', {
  state: (): {
    panels: Array<Panel>;
    activePanel: Panel;
    defaultSnippet: number;
  } => ({
    activePanel: homePanel,
    panels: [homePanel],
    defaultSnippet: 0,
  }),
  getters: {},
  actions: {
    async establishPanel(connectionOrFile: Connection | string): Promise<void> {
      const isFile = typeof connectionOrFile == 'string';
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

        let fileName = !exists.length
          ? `${connectionOrFile.name}.search`
          : `${connectionOrFile.name}-${exists.length}.search`;
        let content = defaultCodeSnippet;

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
        };

        this.panels.push(newPanel);
        this.activePanel = newPanel;
      }
    },

    async checkFileExists(panel: Panel | undefined) {
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
          this.activePanel = this.panels[Math.min(selectedIndex, this.panels.length - 1)];
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

      if (
        !validateFilePath &&
        !(!checkPanel.file || (await sourceFileApi.exists(checkPanel.file)))
      ) {
        return;
      }

      let filePath = checkPanel.file ?? checkPanel.name;

      if (!(await sourceFileApi.exists(filePath))) {
        const selectedFolder = await sourceFileApi.selectFolder();
        if (selectedFolder === null || selectedFolder === undefined) {
          throw new CustomError(404, lang.global.t('file.folderSelectCancel'));
        }

        filePath = `${selectedFolder}/${filePath}`;
      }

      await sourceFileApi.saveFile(filePath, content);

      checkPanel.file = filePath;
    },

    loadDefaultSnippet() {
      if (!this.activePanel) return;
      this.defaultSnippet += 1;
      this.activePanel.content = defaultCodeSnippet;
    },
  },
  persist: {
    paths: ['currentPanel'],
    storage: localStorage,
  },
});
