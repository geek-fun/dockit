import { createApp } from 'vue';
import App from './App.vue';
import { createPinia } from 'pinia';
import { router } from './router';
import { lang } from './lang';
import piniaPluginPersistence from 'pinia-plugin-persistedstate';

import './assets/styles/normalize.css';
import './assets/styles/theme.scss';


const pinia = createPinia();
pinia.use(piniaPluginPersistence);

const app = createApp(App);

app.use(pinia);
app.use(router);
app.use(lang);

app.mount('#app');
