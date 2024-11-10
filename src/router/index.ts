import { createRouter, createWebHistory } from 'vue-router';
import { useUserStore } from '../store';

const LOGIN_PATH = '/login';

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: () => ({ left: 0, top: 0 }),
  routes: [
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
      redirect: '/connect/:filePath?',
      children: [
        {
          name: 'Connect',
          path: '/connect/:filePath?',
          meta: {
            keepAlive: false,
          },
          component: () => import('../views/connect/index.vue'),
        },
        {
          name: 'Manage',
          path: '/manage',
          meta: {
            keepAlive: false,
          },
          component: () => import('../views/manage/index.vue'),
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
        {
          name: 'File',
          path: '/file',
          meta: {
            keepAlive: false,
          },
          component: () => import('../views/file/index.vue'),
        },
        {
          name: 'BackupRestore',
          path: '/backup-restore',
          meta: {
            keepAlive: false,
          },
          component: () => import('../views/backup-restore/index.vue'),
        },
      ],
    },
  ],
});

router.beforeEach(async (to, _, next) => {
  const userStore = useUserStore();
  const token = userStore.getToken;
  if (to.meta.requiresAuth && !token) {
    next(LOGIN_PATH);
  } else {
    next();
  }
});

export { router };
