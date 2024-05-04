<template>
  <div class="login-container">
    <div class="login-form-content">
      <h1>DocKit</h1>
      <n-form
        ref="loginFormRef"
        :model="loginForm"
        :rules="loginRules"
        :show-label="false"
      >
        <n-form-item path="name">
          <n-input
            v-model:value="loginForm.name"
            clearable
            :placeholder="$t('login.enterName')"
          />
        </n-form-item>
        <n-form-item path="password">
          <n-input v-model:value="loginForm.password"
            type="password"
            show-password-on="mousedown"
            :placeholder="$t('login.enterPwd')"
          />
        </n-form-item>
        <n-button type="primary" @click="handleLogin">
          {{ $t('login.title') }}
        </n-button>
      </n-form>
      <div class="opration">
        <div class="left">{{ $t('login.forget') }}</div>
        <div class="right">{{ $t('login.register') }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { FormRules } from 'naive-ui'
import { useUserStore } from './../../store'
import { router } from './../../router';
import { useLang } from './../../lang';

const userStore = useUserStore()
const lang = useLang();

const loginFormRef = ref(null);
const loginForm = ref({
  name: '',
  password: '',
})
const loginRules: FormRules = ref({
  name: [
    {
      required: true,
      message: lang.t('login.enterName'),
      trigger: ['input', 'blur'],
    }
  ],
  password: [
    {
      required: true,
      message: lang.t('login.enterPwd'),
      trigger: ['input', 'blur'],
    }
  ]
})

const handleLogin = (e: MouseEvent) => {
  e.preventDefault()
  loginFormRef.value.validate((errors) => {
    if (!errors) {
      userStore.setToken('setToken')
      router.push('/')
    }
  })
}

</script>

<style lang="scss" scoped>
.login-container {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  .login-form-content {
    width: 280px;
    text-align: center;
    .n-button {
      width: 100%;
    }
    .opration {
      height: 40px;
      line-height: 40px;
      margin-top: 10px;
      display: flex;
      justify-content: space-between;
      .left,
      .right {
        cursor: pointer;
        text-decoration: underline;
      }
    }
  }
}
</style>