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
      component: () => import('@/layout/index.vue'),
      redirect: '/home',
      children: [
        {
          name: 'Home',
          path: '/home',
          meta: {
            keepAlive: false,
          },
          component: () => import('@/views/home/index.vue'),
        },
        {
          name: 'Setting',
          path: '/setting',
          meta: {
            keepAlive: false,
          },
          component: () => import('@/views/setting/index.vue'),
        },
      ],
    },
  ],
});

export default router;
