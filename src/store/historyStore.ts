import { defineStore } from 'pinia';
import { storeApi } from '../datasources';
import { pureObject } from '../common';

export type HistoryEntry = {
  id: string;
  timestamp: number;
  method: string;
  path: string;
  index?: string;
  qdsl?: string;
  connectionName: string;
  connectionId?: number;
};

const MAX_HISTORY_ENTRIES = 500;

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
      const newEntry: HistoryEntry = {
        ...entry,
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        timestamp: Date.now(),
      };
      this.entries.unshift(newEntry);
      if (this.entries.length > MAX_HISTORY_ENTRIES) {
        this.entries = this.entries.slice(0, MAX_HISTORY_ENTRIES);
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
