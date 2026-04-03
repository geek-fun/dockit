import { defineStore } from 'pinia';
import { storeApi } from '../datasources';
import { pureObject } from '../common';
import { DatabaseType } from './connectionStore';
import { useAppStore } from './appStore';

export type HistoryEntry = {
  id: string;
  timestamp: number;
  databaseType?: DatabaseType;
  method: string;
  path: string;
  index?: string;
  qdsl?: string;
  connectionName: string;
  connectionId?: number;
};

export const useHistoryStore = defineStore('historyStore', {
  state: (): {
    entries: HistoryEntry[];
    selectedEntryId: string | null;
  } => ({
    entries: [],
    selectedEntryId: null,
  }),
  getters: {
    selectedEntry: state => state.entries.find(e => e.id === state.selectedEntryId),
  },
  actions: {
    async fetchHistory() {
      try {
        this.entries = (await storeApi.get('queryHistory', [])) as HistoryEntry[];
      } catch (_error) {
        this.entries = [];
      }
    },
    async addEntry(entry: Omit<HistoryEntry, 'id' | 'timestamp'>) {
      const appStore = useAppStore();
      const cap = appStore.historyConfig.historyCap;
      const newEntry: HistoryEntry = {
        ...entry,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
      };
      this.entries.unshift(newEntry);
      if (this.entries.length > cap) {
        this.entries = this.entries.slice(0, cap);
      }
      await storeApi.set('queryHistory', pureObject(this.entries));
    },
    selectEntry(id: string | null) {
      this.selectedEntryId = id;
    },
    async removeEntry(id: string) {
      this.entries = this.entries.filter(e => e.id !== id);
      if (this.selectedEntryId === id) {
        this.selectedEntryId = null;
      }
      await storeApi.set('queryHistory', pureObject(this.entries));
    },
    async clearHistory() {
      this.entries = [];
      this.selectedEntryId = null;
      await storeApi.set('queryHistory', pureObject(this.entries));
    },
  },
});
