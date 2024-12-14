import { createApp } from 'vue';
import App from './App.vue';
import { createPinia } from 'pinia';
import { router } from './router';
import { lang } from './lang';

import './assets/styles/normalize.css';
import './assets/styles/theme.scss';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);
app.use(lang);

app.mount('#app');
