const basicRoutes = [
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
    ],
  },
];

export default basicRoutes;
