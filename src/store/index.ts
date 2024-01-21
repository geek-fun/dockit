import { createPinia } from 'pinia';
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate';

const store = createPinia();
store.use(piniaPluginPersistedstate);

export default store;

export * from './appStore';
export * from './userStore';
export * from './connectionStore';
export * from './sourceFileStore';
