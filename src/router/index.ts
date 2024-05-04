import { createMemoryHistory, createRouter } from 'vue-router';
import { basicRoutes } from './basic';
import { createRouterGuards } from './guards';

export const router = createRouter({
  history: createMemoryHistory(),
  scrollBehavior: () => ({ left: 0, top: 0 }),
  routes: basicRoutes,
});

export async function setupRouter(app: App) {
  createRouterGuards(router);
  app.use(router);
}
