import { createApp } from 'vue';
import App from './App.vue';
import store from './store';
import { setupRouter } from './router';
import { lang } from './lang';

import './assets/styles/normalize.css';
import './assets/styles/theme.scss';

async function bootstrap() {
  const app = createApp(App);

  setupRouter(app);
  app.use(store);
  app.use(lang);

  app.mount('#app');
}
bootstrap();
