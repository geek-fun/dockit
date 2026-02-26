<template>
  <div class="login-container">
    <div class="login-form-content">
      <h1>DocKit</h1>
      <Form>
        <FormItem>
          <Input v-model="loginForm.name" :placeholder="$t('login.enterName')" class="w-full" />
          <p v-if="errors.name" class="text-sm text-destructive mt-1">{{ errors.name }}</p>
        </FormItem>
        <FormItem>
          <Input
            v-model="loginForm.password"
            type="password"
            :placeholder="$t('login.enterPwd')"
            class="w-full"
          />
          <p v-if="errors.password" class="text-sm text-destructive mt-1">{{ errors.password }}</p>
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
import { useUserStore } from '../../store';
import { router } from '../../router';
import { useLang } from '../../lang';
import { Form, FormItem } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const userStore = useUserStore();
const lang = useLang();

const loginForm = ref({
  name: '',
  password: '',
});

const errors = ref({
  name: '',
  password: '',
});

const validate = (): boolean => {
  let isValid = true;
  errors.value.name = '';
  errors.value.password = '';

  if (!loginForm.value.name) {
    errors.value.name = lang.t('login.enterName');
    isValid = false;
  }
  if (!loginForm.value.password) {
    errors.value.password = lang.t('login.enterPwd');
    isValid = false;
  }
  return isValid;
};

const handleLogin = (e: MouseEvent) => {
  e.preventDefault();
  if (validate()) {
    userStore.setToken('setToken');
    router.push('/');
  }
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
