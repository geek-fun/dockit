<template>
  <div class="login-container">
    <div class="login-form-content">
      <h1>DocKit</h1>
      <Form>
        <FormItem :error="getError('name', fieldErrors.name)">
          <Input
            v-model="loginForm.name"
            :placeholder="$t('login.enterName')"
            class="w-full"
            @blur="handleBlur('name')"
          />
        </FormItem>
        <FormItem :error="getError('password', fieldErrors.password)">
          <Input
            v-model="loginForm.password"
            type="password"
            :placeholder="$t('login.enterPwd')"
            class="w-full"
            @blur="handleBlur('password')"
          />
        </FormItem>
        <Button class="w-full" @click="handleLogin">
          {{ $t('login.title') }}
        </Button>
      </Form>
      <div class="opration">
        <div class="left">{{ $t('login.forget') }}</div>
        <div class="right">{{ $t('login.register') }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useUserStore } from '../../store';
import { router } from '../../router';
import { useLang } from '../../lang';
import { Form, FormItem } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useFormValidation } from '@/composables';

const userStore = useUserStore();
const lang = useLang();
const { handleBlur, getError, markSubmitted } = useFormValidation();

const loginForm = ref({
  name: '',
  password: '',
});

const fieldErrors = computed(() => ({
  name: !loginForm.value.name ? lang.t('login.enterName') : '',
  password: !loginForm.value.password ? lang.t('login.enterPwd') : '',
}));

const handleLogin = (e: MouseEvent) => {
  e.preventDefault();
  markSubmitted();
  if (fieldErrors.value.name || fieldErrors.value.password) return;
  userStore.setToken('setToken');
  router.push('/');
};
</script>

<style scoped>
.login-container {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.login-form-content {
  width: 280px;
  text-align: center;
}

.opration {
  height: 40px;
  line-height: 40px;
  margin-top: 10px;
  display: flex;
  justify-content: space-between;
}

.opration .left,
.opration .right {
  cursor: pointer;
  text-decoration: underline;
}
</style>
