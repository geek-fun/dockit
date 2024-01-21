import { createMemoryHistory, createRouter } from 'vue-router';

const router = createRouter({
  history: createMemoryHistory(),
  scrollBehavior: () => ({ left: 0, top: 0 }),
  routes: [
    {
      path: '/',
      name: 'Layout',
      meta: {
        keepAlive: false,
      },
      component: () => import('../layout/index.vue'),
      redirect: '/connect',
      children: [
        {
          name: 'Connect',
          path: '/connect',
          meta: {
            keepAlive: false,
          },
          component: () => import('../views/connect/index.vue'),
        },
        {
          name: 'History',
          path: '/history',
          meta: {
            keepAlive: false,
          },
          component: () => import('../views/history/index.vue'),
        },
        {
          name: 'Setting',
          path: '/setting',
          meta: {
            keepAlive: false,
          },
          component: () => import('../views/setting/index.vue'),
        },
      ],
    },
  ],
});
export default router;
