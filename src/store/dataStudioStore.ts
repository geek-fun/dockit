import { defineStore } from 'pinia';

export type DataSourcePermissions = {
  read: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
};

export type ConnectedSource = {
  connectionId: number | undefined;
  name: string;
  permissions: DataSourcePermissions;
  unifiedAccess: boolean;
};

export const useDataStudioStore = defineStore('dataStudio', {
  state: (): {
    connectedSources: Array<ConnectedSource>;
    configPanelOpen: boolean;
  } => ({
    connectedSources: [],
    configPanelOpen: true,
  }),
  persist: true,
  actions: {
    toggleConfigPanel() {
      this.configPanelOpen = !this.configPanelOpen;
    },
    addSource(source: ConnectedSource) {
      this.connectedSources.push(source);
    },
    updateSource(index: number, source: Partial<ConnectedSource>) {
      if (index >= 0 && index < this.connectedSources.length) {
        Object.assign(this.connectedSources[index], source);
      }
    },
    removeSource(index: number) {
      if (index >= 0 && index < this.connectedSources.length) {
        this.connectedSources.splice(index, 1);
      }
    },
  },
});
