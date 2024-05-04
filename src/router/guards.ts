import { Router } from 'vue-router';
import { useUserStore } from './../store';

const LOGIN_PATH = '/login';

export function createRouterGuards(router: Router) {
  router.beforeEach(async (to, from, next) => {
    const userStore = useUserStore();
    const token = userStore.getToken;
    if (token) {
      // 有token
      if (to.path === LOGIN_PATH) {
        next('/');
      } else {
        next();
      }
    } else {
      // 无token，跳转到登录页
      if (to.path === LOGIN_PATH) {
        next();
      } else {
        next(LOGIN_PATH);
      }
    }
  });
}
