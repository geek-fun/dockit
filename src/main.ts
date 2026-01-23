import { createApp } from 'vue';
import App from './App.vue';
import { createPinia } from 'pinia';
import { router } from './router';
import { lang } from './lang';
import piniaPluginPersistence from 'pinia-plugin-persistedstate';

// UnoCSS utilities - virtual import
import 'virtual:uno.css';

// Legacy styles - keeping for backward compatibility during migration
import './assets/styles/normalize.css';
import './assets/styles/theme.scss';

// Tailwind/shadcn-vue styles
import './assets/styles/tailwind.css';

const pinia = createPinia();
pinia.use(piniaPluginPersistence);

const app = createApp(App);

app.use(pinia);
app.use(router);
app.use(lang);

app.mount('#app');
