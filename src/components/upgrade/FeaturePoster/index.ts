import type { Component } from 'vue';
import type { PaidFeature } from '../../../common';
import AiPoster from './AiPoster.vue';
import ClusterPoster from './ClusterPoster.vue';
import ImportExportPoster from './ImportExportPoster.vue';
import McpPoster from './McpPoster.vue';

const posters: Partial<Record<PaidFeature, Component>> = {
  ai: AiPoster,
  cluster_manage: ClusterPoster,
  import_export: ImportExportPoster,
  mcp_bridge: McpPoster,
};

export const posterFor = (feature: PaidFeature): Component | null => posters[feature] ?? null;
