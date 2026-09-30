import type { Component } from 'vue';
import type { PaidFeature } from '../../../common';
import AiPoster from './AiPoster.vue';
import ClusterPoster from './ClusterPoster.vue';
import ImportExportPoster from './ImportExportPoster.vue';

const posters: Partial<Record<PaidFeature, Component>> = {
  ai: AiPoster,
  cluster_manage: ClusterPoster,
  import_export: ImportExportPoster,
};

export const posterFor = (feature: PaidFeature): Component | null => posters[feature] ?? null;
