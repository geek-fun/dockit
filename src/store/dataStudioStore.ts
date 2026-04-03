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
  autoMode: boolean;
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
    addSource(source: ConnectedSource): boolean {
      if (source.connectionId === undefined) return false;
      const exists = this.connectedSources.some(s => s.connectionId === source.connectionId);
      if (exists) return false;
      this.connectedSources.push(source);
      return true;
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
    removeSourceById(connectionId: number) {
      const index = this.connectedSources.findIndex(s => s.connectionId === connectionId);
      if (index !== -1) {
        this.connectedSources.splice(index, 1);
      }
    },
    getSourceById(connectionId: number): ConnectedSource | undefined {
      return this.connectedSources.find(s => s.connectionId === connectionId);
    },
  },
});
