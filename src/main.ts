import { createApp } from 'vue';
import App from './App.vue';
import { createPinia } from 'pinia';
import { router } from './router';
import { lang } from './lang';
import piniaPluginPersistence from 'pinia-plugin-persistedstate';

// UnoCSS utilities - virtual import
import 'virtual:uno.css';

// Styles - Single source of truth for all theme tokens
import './assets/styles/index.css';

const pinia = createPinia();
pinia.use(piniaPluginPersistence);

const app = createApp(App);

app.use(pinia);
app.use(router);
app.use(lang);

app.mount('#app');
