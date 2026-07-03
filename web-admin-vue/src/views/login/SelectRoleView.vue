<template>
  <div class="select-role-page">
    <div class="select-role-container">
      <!-- Logo 区域 -->
      <div class="logo-area">
        <img src="/logo-saixiaofeng.png" alt="赛小蜂足球" class="logo-img" />
        <h1 class="app-title">赛小蜂足球</h1>
        <p class="app-subtitle">青少年足球赛事管理系统</p>
      </div>

      <!-- 选择身份区域 -->
      <h2 class="page-title">选择您的身份</h2>
      <p class="page-desc">欢迎使用赛小蜂足球！请选择您的身份，这将决定您在平台上的功能权限</p>

      <div class="role-options">
        <div
          v-for="opt in roleOptions"
          :key="opt.value"
          :class="['role-option-card', { active: selectedRole === opt.value }]"
          @click="selectedRole = opt.value"
        >
          <div class="role-icon-circle" :class="'role-' + opt.value">
            <el-icon :size="28"><component :is="opt.icon" /></el-icon>
          </div>
          <div class="role-info">
            <div class="role-label">{{ opt.label }}</div>
            <div class="role-desc">{{ opt.desc }}</div>
          </div>
          <el-icon v-if="selectedRole === opt.value" :size="22" color="#1B5E20"><Select /></el-icon>
        </div>
      </div>

      <button
        class="confirm-btn"
        :class="{ active: selectedRole }"
        :disabled="!selectedRole"
        @click="confirmSelectRole"
      >
        确认选择
      </button>

      <!-- 底部提示 -->
      <p class="footer-hint">选择后可在「系统管理」中切换身份</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { OfficeBuilding, Football, VideoPlay, Select } from '@element-plus/icons-vue'
import { ROLE_NAMES } from '../../utils/permissions'

const router = useRouter()
const selectedRole = ref('')

const roleOptions = [
  {
    value: 'organizer',
    label: '赛事主办方',
    desc: '创建和管理赛事、管理球队和裁判、查看数据统计',
    icon: 'OfficeBuilding'
  },
  {
    value: 'coach',
    label: '球队/教练',
    desc: '管理球队和球员信息、报名参赛、查看赛程',
    icon: 'Football'
  },
  {
    value: 'referee',
    label: '裁判',
    desc: '查看执法赛事、记录比赛数据',
    icon: 'VideoPlay'
  }
]

async function confirmSelectRole() {
  if (!selectedRole.value) return

  try {
    const WEB_LOGIN_API_URL = 'https://cloud1-7g8ckb3c7815a011-1419431905.ap-shanghai.app.tcloudbase.com/webLoginApi'
    const userId = localStorage.getItem('userId')
    
    const response = await fetch(WEB_LOGIN_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'emailSetRole',
        role: selectedRole.value,
        userId
      })
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    const res = await response.json()
    
    if (res.success) {
      // 设置角色到 localStorage
      localStorage.setItem('role', selectedRole.value)
      localStorage.setItem('currentRole', selectedRole.value)
      localStorage.removeItem('needSelectRole')

      ElMessage.success(`身份已设置为：${ROLE_NAMES[selectedRole.value] || selectedRole.value}`)

      // 跳转到对应角色的首页
      const rolePathMap = {
        organizer: '/tournaments',
        coach: '/teams',
        referee: '/referees'
      }
      router.push(rolePathMap[selectedRole.value] || '/tournaments')
    } else {
      ElMessage.error(res.error || '设置失败')
    }
  } catch (err) {
    ElMessage.error('设置失败：' + (err.message || '网络错误'))
  }
}
</script>

<style scoped>
.select-role-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #1B5E20 0%, #2E7D32 50%, #43A047 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.select-role-container {
  width: 100%;
  max-width: 480px;
  background: #fff;
  border-radius: 16px;
  padding: 40px 36px 32px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.15);
}

/* Logo */
.logo-area {
  text-align: center;
  margin-bottom: 32px;
}
.logo-img {
  width: 56px;
  height: 56px;
  object-fit: contain;
}
.app-title {
  margin: 10px 0 4px;
  font-size: 24px;
  font-weight: 700;
  color: #1B5E20;
}
.app-subtitle {
  margin: 0;
  font-size: 13px;
  color: #909399;
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

/* 角色卡片 */
.role-options {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 24px;
}
.role-option-card {
  display: flex;
  align-items: center;
  gap: 14px;
  border: 2px solid #e4e7ed;
  border-radius: 12px;
  padding: 18px 16px;
  cursor: pointer;
  transition: all 0.25s ease;
  background: #fff;
}
.role-option-card:hover {
  border-color: #1B5E20;
  background: #f1f8e9;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(27, 94, 32, 0.12);
}
.role-option-card.active {
  border-color: #1B5E20;
  background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%);
  box-shadow: 0 4px 16px rgba(27, 94, 32, 0.2);
}
.role-icon-circle {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
}
.role-icon-circle.role-organizer { background: linear-gradient(135deg, #1B5E20, #43A047); }
.role-icon-circle.role-coach { background: linear-gradient(135deg, #1565C0, #42A5F5); }
.role-icon-circle.role-referee { background: linear-gradient(135deg, #E65100, #FF9800); }
.role-info {
  flex: 1;
}
.role-label {
  font-weight: 600;
  font-size: 15px;
  color: #303133;
}
.role-desc {
  font-size: 12px;
  color: #909399;
  margin-top: 3px;
}

/* 确认按钮 */
.confirm-btn {
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
}
.confirm-btn.active {
  background: linear-gradient(135deg, #1B5E20, #43A047);
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(27, 94, 32, 0.3);
}
.confirm-btn.active:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(27, 94, 32, 0.4);
}

/* 底部提示 */
.footer-hint {
  text-align: center;
  font-size: 12px;
  color: #c0c4cc;
  margin: 18px 0 0;
}
</style>
