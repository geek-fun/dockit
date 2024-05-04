export const basicRoutes = [
  {
    path: '/login',
    name: 'Login',
    meta: {
      keepAlive: false,
    },
    component: () => import('../views/login/index.vue'),
  },
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
];
