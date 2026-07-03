<template>
  <div class="bind-phone-page">
    <div class="bind-phone-container">
      <!-- Logo 区域 -->
      <div class="logo-area">
        <img src="/logo-saixiaofeng.png" alt="赛小蜂足球" class="logo-img" />
      </div>

      <!-- 绑定手机号区域 -->
      <h2 class="page-title">绑定手机号</h2>
      <p class="page-desc">微信登录成功！请绑定手机号以激活您的账号</p>

      <el-form ref="formRef" :model="form" :rules="rules" @submit.prevent="handleBind">
        <el-form-item prop="phone">
          <el-input
            v-model="form.phone"
            placeholder="请输入手机号"
            size="large"
            :prefix-icon="Phone"
            maxlength="11"
            clearable
          />
        </el-form-item>

        <el-form-item prop="code">
          <div class="code-row">
            <el-input
              v-model="form.code"
              placeholder="请输入验证码"
              size="large"
              :prefix-icon="Message"
              maxlength="6"
              clearable
            />
            <el-button
              size="large"
              :disabled="countdown > 0 || !form.phone || form.phone.length !== 11"
              @click="sendCode"
              class="code-btn"
            >
              {{ countdown > 0 ? `${countdown}s后重发` : '获取验证码' }}
            </el-button>
          </div>
        </el-form-item>

        <button
          type="submit"
          class="bind-btn"
          :class="{ active: form.phone && form.code }"
          :disabled="loading || !form.phone || !form.code"
          @click="handleBind"
        >
          {{ loading ? '绑定中...' : '确认绑定' }}
        </button>
      </el-form>

      <!-- 底部提示 -->
      <p class="footer-hint">绑定后，您可以使用手机号+验证码方式登录</p>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Phone, Message } from '@element-plus/icons-vue'
// ★ 直接复用 cloud.js，和 LoginView 完全一致的调用方式
import { callFunction } from '../../utils/cloud'

const router = useRouter()
const formRef = ref(null)
const loading = ref(false)
const countdown = ref(0)
let timer = null

const form = reactive({
  phone: '',
  code: ''
})

const rules = {
  phone: [
    { required: true, message: '请输入手机号', trigger: 'blur' },
    { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号', trigger: 'blur' }
  ],
  code: [
    { required: true, message: '请输入验证码', trigger: 'blur' },
    { len: 6, message: '验证码为6位数字', trigger: 'blur' }
  ]
}

// 发送验证码（调用 sendSms 云函数）
async function sendCode() {
  if (!form.phone || form.phone.length !== 11) return

  try {
    const res = await callFunction('sendSms', { phoneNumber: form.phone })

    if (res.success) {
      ElMessage.success('验证码已发送')
      countdown.value = 60
      timer = setInterval(() => {
        countdown.value--
        if (countdown.value <= 0) clearInterval(timer)
      }, 1000)
    } else {
      ElMessage.error(res.error || '发送失败')
    }
  } catch (err) {
    console.error('[BindPhone] 发送验证码异常:', err)
    ElMessage.error('发送失败：' + (err.message || '网络错误'))
  }
}

// 绑定手机号（一步完成：bindPhone 内部已包含验证码校验 + 账号合并）
async function handleBind() {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch { return }

  loading.value = true

  try {
    // 取出微信临时信息（扫码时 wechatWebLogin 保存在 localStorage 的）
    const wechatTempStr = localStorage.getItem('wechatTemp') || '{}'
    const wechatTemp = JSON.parse(wechatTempStr)


    // ★ 直接调用 bindPhone 云函数，它内部会：
    //   1. 校验短信验证码（verifySmsCode 的逻辑）
    //   2. 通过 unionId/openId 找到微信临时用户
    //   3. 检查手机号是否已被占用 → 自动合并或直接绑定
    //   4. 返回合并后的完整用户对象
    const bindRes = await callFunction('bindPhone', {
      phone: form.phone,
      code: form.code,
      unionId: wechatTemp.unionId || '',
      openId: wechatTemp.openId || ''
    })

    if (!bindRes.success) {
      ElMessage.error(bindRes.error || '绑定失败')
      return
    }


    // 更新本地存储（用 bindPhone 返回的最终用户信息）
    const finalUser = bindRes.user
    if (finalUser) {
      localStorage.setItem('userId', finalUser._id || '')
      localStorage.setItem('role', finalUser.role || '')
      localStorage.setItem('currentRole', finalUser.role || '')
      localStorage.setItem('isLoggedIn', 'true')
      localStorage.setItem('userInfo', JSON.stringify({
        uid: finalUser._id,
        userName: finalUser.nickname || wechatTemp.nickname || '微信用户',
        avatarUrl: finalUser.headimgurl || wechatTemp.headimgurl || '',
        phone: finalUser.phone || form.phone,
        email: finalUser.email || ''
      }))
    }

    // 清理临时数据
    localStorage.removeItem('wechatTemp')
    localStorage.removeItem('needBindPhone')

    ElMessage.success('绑定成功！正在进入系统...')

    // 检查是否需要选角色
    if (!finalUser?.role || finalUser.role === '' || bindRes.needSelectRole) {
      localStorage.setItem('needSelectRole', 'true')
      setTimeout(() => router.push('/select-role'), 800)
    } else {
      const rolePathMap = { ORGANIZER: '/tournaments', COACH: '/teams', REFEREE: '/matches' }
      const targetPath = rolePathMap[finalUser.role] || '/tournaments'
      setTimeout(() => router.push(targetPath), 800)
    }
  } catch (err) {
    console.error('[BindPhone] 绑定异常:', err)
    ElMessage.error('绑定失败：' + (err.message || '网络错误'))
  } finally {
    loading.value = false
  }
}

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<style scoped>
.bind-phone-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #1B5E20 0%, #2E7D32 50%, #43A047 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.bind-phone-container {
  width: 100%;
  max-width: 420px;
  background: #fff;
  border-radius: 16px;
  padding: 40px 32px 32px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.15);
}

/* Logo */
.logo-area {
  text-align: center;
  margin-bottom: 24px;
}
.logo-img {
  width: 200px;
  height: 200px;
  object-fit: contain;
}

/* 标题 */
.page-title {
  text-align: center;
  font-size: 20px;
  font-weight: 600;
  color: #303133;
  margin: 0 0 8px;
}
.page-desc {
  text-align: center;
  font-size: 14px;
  color: #606266;
  line-height: 1.6;
  margin: 0 0 28px;
}

/* 验证码行 */
.code-row {
  display: flex;
  gap: 10px;
  width: 100%;
}
.code-row .el-input {
  flex: 1;
}
.code-btn {
  flex-shrink: 0;
  width: 120px;
  color: #1B5E20 !important;
  border-color: #c0e0b8 !important;
  background: #f1f8e9 !important;
  font-size: 13px !important;
}
.code-btn:hover:not(:disabled) {
  color: #fff !important;
  border-color: #1B5E20 !important;
  background: #1B5E20 !important;
}
.code-btn:disabled {
  opacity: 0.6;
}

/* 绑定按钮 */
.bind-btn {
  width: 100%;
  height: 46px;
  font-size: 16px;
  font-weight: 600;
  border: none;
  border-radius: 10px;
  background: #c0c4cc;
  color: #fff;
  cursor: not-allowed;
  transition: all 0.3s ease;
  margin-top: 4px;
}
.bind-btn.active {
  background: linear-gradient(135deg, #1B5E20, #43A047);
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(27, 94, 32, 0.3);
}
.bind-btn.active:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(27, 94, 32, 0.4);
}

/* Element Plus 表单覆盖 */
:deep(.el-input__wrapper) {
  border-radius: 8px;
  padding: 4px 12px;
  box-shadow: 0 0 0 1px #dcdfe6 inset;
}
:deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px #c0e0b8 inset;
}
:deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px #1B5E20 inset;
}
:deep(.el-form-item) {
  margin-bottom: 20px;
}

/* 底部提示 */
.footer-hint {
  text-align: center;
  font-size: 12px;
  color: #c0c4cc;
  margin: 18px 0 0;
}
</style>
