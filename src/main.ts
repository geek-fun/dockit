import { createApp } from 'vue';
import App from './App.vue';
import store from './store';
import { router } from './router';
import { lang } from './lang';

import './common/shortcuts.ts';
import './assets/styles/normalize.css';
import './assets/styles/theme.scss';

const app = createApp(App);

app.use(router);
app.use(store);
app.use(lang);

app.mount('#app');
