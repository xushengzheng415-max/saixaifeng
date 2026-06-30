<template>
  <div class="redirect-page">
    <div class="redirect-card">
      <el-icon :size="48" color="#1B5E20"><Promotion /></el-icon>
      <h2>正在跳转到登录页面...</h2>
      <p class="redirect-hint">请使用首页登录入口</p>
      <el-button type="primary" size="large" @click="goHome">
        立即前往登录
      </el-button>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { Promotion } from '@element-plus/icons-vue'

onMounted(() => {
  // 3秒后自动跳转到首页（正确的登录入口）
  setTimeout(() => {
    goHome()
  }, 3000)
})

function goHome() {
  window.location.href = 'https://saixiaofeng.com/'
}
</script>

<style scoped>
.redirect-page {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #1B5E20 0%, #43A047 100%);
}
.redirect-card {
  background: #fff;
  border-radius: 16px;
  padding: 48px;
  text-align: center;
  box-shadow: 0 8px 32px rgba(0,0,0,0.15);
  max-width: 400px;
}
.redirect-card h2 {
  margin: 16px 0 8px;
  color: #1B5E20;
  font-size: 20px;
}
.redirect-hint {
  color: #999;
  margin-bottom: 24px;
  font-size: 14px;
}
</style>
