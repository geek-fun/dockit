/* eslint-disable no-console */
import { defineStore } from 'pinia';
import { storeApi } from '../datasources';
import { useAppStore } from './appStore';
import type { QueryHistoryEntry } from '../datasources/agentApi';
import {
  loadQueryHistory,
  addQueryHistoryEntry,
  toggleQueryHistoryStar,
  deleteQueryHistoryEntry,
  clearQueryHistory,
} from '../datasources/agentApi';
import { DatabaseType } from './connectionStore';

export type HistoryEntry = {
  id: string;
  timestamp: number;
  databaseType?: DatabaseType;
  method: string;
  path: string;
  index?: string;
  qdsl?: string;
  connectionName: string;
  connectionId: number | string;
  mongoOperation?: string;
  mongoCollection?: string;
  mongoDatabase?: string;
  mongoDuration?: number;
  mongoResultCount?: number;
  starred?: boolean;
};

// Convert backend camelCase to frontend HistoryEntry
const toHistoryEntry = (be: QueryHistoryEntry): HistoryEntry => ({
  id: be.id,
  timestamp: be.timestamp,
  databaseType: (be.databaseType as DatabaseType) ?? undefined,
  method: be.method,
  path: be.path,
  index: be.indexName ?? undefined,
  qdsl: be.qdsl ?? undefined,
  connectionName: be.connectionName,
  connectionId: be.connectionId,
  mongoOperation: be.mongoOperation ?? undefined,
  mongoCollection: be.mongoCollection ?? undefined,
  mongoDatabase: be.mongoDatabase ?? undefined,
  mongoDuration: be.mongoDuration ?? undefined,
  mongoResultCount: be.mongoResultCount ?? undefined,
  starred: be.starred, // use raw boolean, undefined becomes undefined naturally
});

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
    starredEntries: state => state.entries.filter(e => e.starred),
  },
  actions: {
    async fetchHistory() {
      try {
        // One-time migration: if old data exists in .store.dat, move it to SQLite
        const oldEntries = await storeApi.get<Record<string, unknown>[]>('queryHistory', []);
        if (oldEntries.length > 0) {
          const appStore = useAppStore();
          const cap = appStore.historyConfig.historyCap;
          let failed = 0;
          for (const entry of oldEntries) {
            const rawConnId = (entry as any).connectionId;
            if (rawConnId == null) {
              console.warn('Skipping migration of entry without connectionId:', (entry as any).id);
              continue;
            }
            try {
              await addQueryHistoryEntry({
                databaseType: (entry as any).databaseType ?? null,
                method: (entry as any).method ?? '',
                path: (entry as any).path ?? '',
                indexName: (entry as any).index ?? null,
                qdsl: (entry as any).qdsl ?? null,
                connectionName: (entry as any).connectionName ?? '',
                connectionId: String(rawConnId),
                mongoOperation: (entry as any).mongoOperation ?? null,
                mongoCollection: (entry as any).mongoCollection ?? null,
                mongoDatabase: (entry as any).mongoDatabase ?? null,
                mongoDuration: (entry as any).mongoDuration ?? null,
                mongoResultCount: (entry as any).mongoResultCount ?? null,
                historyCap: cap,
              });
            } catch (err) {
              console.error('Failed to migrate query history entry:', err);
              failed++;
            }
          }
          if (failed > 0) {
            console.warn(
              `Migrated ${oldEntries.length - failed}/${oldEntries.length} query history entries`,
            );
          }
          // Clear old data regardless of failures to prevent duplicate entries on retry.
          // Failed entries are logged via console.error above — they are individual query
          // records that the user can re-execute.
          await storeApi.set('queryHistory', []);
        }

        const backendEntries = await loadQueryHistory();
        this.entries = backendEntries.map(toHistoryEntry);
      } catch (err) {
        console.error('Failed to load query history:', err);
        this.entries = [];
      }
    },
    async addEntry(entry: Omit<HistoryEntry, 'id' | 'timestamp'>) {
      const appStore = useAppStore();
      const cap = appStore.historyConfig.historyCap;
      try {
        const result = await addQueryHistoryEntry({
          databaseType: entry.databaseType ?? null,
          method: entry.method,
          path: entry.path,
          indexName: entry.index ?? null,
          qdsl: entry.qdsl ?? null,
          connectionName: entry.connectionName,
          connectionId: String(entry.connectionId),
          mongoOperation: entry.mongoOperation ?? null,
          mongoCollection: entry.mongoCollection ?? null,
          mongoDatabase: entry.mongoDatabase ?? null,
          mongoDuration: entry.mongoDuration ?? null,
          mongoResultCount: entry.mongoResultCount ?? null,
          historyCap: cap,
        });
        // Optimistically add the entry, then re-fetch to sync cap enforcement deletes
        this.entries.unshift(toHistoryEntry(result));
        const backendEntries = await loadQueryHistory();
        this.entries = backendEntries.map(toHistoryEntry);
      } catch (err) {
        console.error('Failed to add query history entry:', err);
      }
    },
    selectEntry(id: string | null) {
      this.selectedEntryId = id;
    },
    async toggleStar(id: string) {
      const entry = this.entries.find(e => e.id === id);
      if (!entry) return;
      const newStarred = !entry.starred;
      entry.starred = newStarred;
      try {
        await toggleQueryHistoryStar(id);
      } catch (err) {
        console.error('Failed to toggle query history star:', err);
        entry.starred = !newStarred;
      }
    },
    async removeEntry(id: string) {
      const removed = this.entries.filter(e => e.id === id);
      const previousSelectedId = this.selectedEntryId;
      this.entries = this.entries.filter(e => e.id !== id);
      if (this.selectedEntryId === id) {
        this.selectedEntryId = null;
      }
      try {
        await deleteQueryHistoryEntry(id);
      } catch (err) {
        console.error('Failed to delete query history entry:', err);
        this.entries = [...this.entries, ...removed];
        this.selectedEntryId = previousSelectedId;
      }
    },
    async clearHistory() {
      const previous = this.entries;
      const previousSelectedId = this.selectedEntryId;
      this.entries = [];
      this.selectedEntryId = null;
      try {
        await clearQueryHistory();
      } catch (err) {
        console.error('Failed to clear query history:', err);
        this.entries = previous;
        this.selectedEntryId = previousSelectedId;
      }
    },
  },
});
