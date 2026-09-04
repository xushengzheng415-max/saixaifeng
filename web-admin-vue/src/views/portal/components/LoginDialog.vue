<template>
  <el-dialog
    v-model="visible"
    title=""
    width="380px"
    :show-close="true"
    :close-on-click-modal="false"
    align-center
    class="login-dialog"
    @close="handleClose"
  >
    <div class="login-header">
      <img :src="brandLogoUrl" alt="赛小蜂足球" class="login-logo" />
      <h3 class="login-title">登录赛小蜂足球</h3>
      <p class="login-subtitle">登录后体验竞猜、关注、蜂蜜币等完整功能</p>
    </div>

    <el-form :model="form" class="login-form" @submit.prevent="handleLogin">
      <el-form-item>
        <el-input
          v-model="form.phone"
          placeholder="请输入手机号"
          maxlength="11"
          size="large"
          :prefix-icon="Phone"
        />
      </el-form-item>
      <el-form-item>
        <el-input
          v-model="form.code"
          placeholder="请输入验证码"
          maxlength="6"
          size="large"
          :prefix-icon="Key"
          @keyup.enter="handleLogin"
        >
          <template #append>
            <el-button :disabled="countdown > 0 || !isPhoneValid" @click="sendCode">
              {{ countdown > 0 ? `${countdown}s` : '获取验证码' }}
            </el-button>
          </template>
        </el-input>
      </el-form-item>
      <el-form-item>
        <el-button
          type="primary"
          size="large"
          class="login-submit"
          :loading="loading"
          :disabled="!isPhoneValid || form.code.length !== 6"
          @click="handleLogin"
        >
          登录 / 注册
        </el-button>
      </el-form-item>
    </el-form>

    <div class="login-footer">
      登录即表示同意 <a href="javascript:void(0)">《用户协议》</a> 和 <a href="javascript:void(0)">《隐私政策》</a>
    </div>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Phone, Key } from '@element-plus/icons-vue'

const brandLogoUrl = `${import.meta.env.BASE_URL}LOGO2.png`

/**
 * 登录弹窗组件
 * 手机号 + 验证码登录
 * 双向绑定 v-model:visible
 * 登录逻辑预留：实际调用 callFunction('phoneLogin')，此处仅做 Mock 提示
 */
const props = defineProps({
  modelValue: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue', 'success'])

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const form = ref({ phone: '', code: '' })
const loading = ref(false)
const countdown = ref(0)
let timer = null

const isPhoneValid = computed(() => /^1[3-9]\d{9}$/.test(form.value.phone))

// 发送验证码（预留 API 结构）
async function sendCode() {
  if (!isPhoneValid.value) {
    ElMessage.warning('请输入正确的手机号')
    return
  }
  try {
    // TODO: 接入真实 API
    // const { callFunction } = await import('../../../utils/cloud')
    // const res = await callFunction('sendSms', { phoneNumber: form.value.phone })
    ElMessage.success('验证码已发送（Mock）')
    countdown.value = 60
    timer = setInterval(() => {
      countdown.value--
      if (countdown.value <= 0) clearInterval(timer)
    }, 1000)
  } catch (err) {
    ElMessage.error('发送失败：' + (err.message || '网络错误'))
  }
}

// 登录
async function handleLogin() {
  if (!isPhoneValid.value) {
    ElMessage.warning('请输入正确的手机号')
    return
  }
  if (form.value.code.length !== 6) {
    ElMessage.warning('请输入6位验证码')
    return
  }
  loading.value = true
  try {
    // TODO: 接入真实 API
    // const { callFunction } = await import('../../../utils/cloud')
    // const res = await callFunction('phoneLogin', { phone: form.value.phone, code: form.value.code })
    await new Promise((resolve) => setTimeout(resolve, 800))
    ElMessage.success('登录成功（Mock）')
    emit('success', { phone: form.value.phone, token: 'mock_token' })
    visible.value = false
    resetForm()
  } catch (err) {
    ElMessage.error('登录失败：' + (err.message || '网络错误'))
  } finally {
    loading.value = false
  }
}

function resetForm() {
  form.value = { phone: '', code: '' }
  countdown.value = 0
  if (timer) clearInterval(timer)
}

function handleClose() {
  resetForm()
}

// 外部关闭时清理定时器
watch(visible, (v) => {
  if (!v && timer) clearInterval(timer)
})
</script>

<style scoped>
.login-header {
  text-align: center;
  margin-bottom: 20px;
}

.login-logo {
  width: 64px;
  height: auto;
  margin-bottom: 8px;
}

.login-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--portal-primary, #1B5E20);
  margin-bottom: 4px;
}

.login-subtitle {
  font-size: 13px;
  color: var(--portal-text-secondary, #909399);
}

.login-form {
  margin-top: 8px;
}

.login-submit {
  width: 100%;
}

.login-footer {
  text-align: center;
  font-size: 12px;
  color: var(--portal-text-secondary, #909399);
  margin-top: 8px;
}

.login-footer a {
  color: var(--portal-primary-light, #2E7D32);
  text-decoration: none;
}
</style>
