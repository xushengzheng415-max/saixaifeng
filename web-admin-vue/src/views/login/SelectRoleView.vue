<template>
  <div class="organizer-only-page">
    <div class="organizer-card">
      <h1>赛小蜂足球</h1>
      <el-tag type="success" size="large">主办方后台</el-tag>
      <p>当前系统仅保留主办方登录身份，无需选择身份。</p>
      <el-button type="primary" size="large" @click="enterOrganizer">进入赛事管理</el-button>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'

const router = useRouter()

function enterOrganizer() {
  localStorage.removeItem('needSelectRole')
  router.replace('/tournaments')
}
</script>

<style scoped>
.organizer-only-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: linear-gradient(135deg, #1b5e20, #43a047);
}

.organizer-card {
  width: min(420px, 100%);
  padding: 40px;
  border-radius: 18px;
  background: #fff;
  text-align: center;
  box-shadow: 0 16px 48px rgb(0 0 0 / 18%);
}

.organizer-card h1 {
  margin: 0 0 20px;
  color: #1b5e20;
}

.organizer-card p {
  margin: 20px 0 28px;
  color: #606266;
  line-height: 1.7;
}
</style>
