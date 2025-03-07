import { Connection } from './connectionStore.ts';
import { defineStore } from 'pinia';

type Panel = {
  id: number;
  name: string;
  connection?: Connection;
  file: string;
};

export const usePanelStore = defineStore('panel', {
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
          file: panelName,
        };

        this.panels.push(newPanel);
        this.activePanelId = newPanel.id;
      }
    },
    closePanel(panel: Panel | undefined): void {
      if (!panel) return;
      const nameIndex = this.panels.findIndex(({ id }) => id === panel.id);
      if (!~nameIndex) return;
      // @todo save file content before close
      this.panels.splice(nameIndex, 1);

      if (panel.id === this.activePanelId) {
        this.activePanelId = Math.min(nameIndex, this.panels.length - 1);
      }
    },
    setActivePanel(panel: Panel): void {
      this.activePanelId = panel.id;
    },
  },
  persist: {
    paths: ['currentPanel'],
    storage: localStorage,
  },
});
