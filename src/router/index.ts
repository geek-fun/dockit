import { createRouter, createMemoryHistory } from 'vue-router';
import basicRoutes from './routes';

const router = createRouter({
  history: createMemoryHistory(),
  routes: basicRoutes,
  scrollBehavior: () => ({ left: 0, top: 0 }),
});

export default router;
