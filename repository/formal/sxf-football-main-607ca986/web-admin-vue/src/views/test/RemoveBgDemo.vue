<template>
  <div class="remove-bg-demo">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>Remove.bg 抠图功能演示</span>
          <el-tag type="success" v-if="creditsInfo">
            剩余额度: {{ creditsInfo.free_calls }} 张
          </el-tag>
        </div>
      </template>

      <!-- 额度信息 -->
      <el-alert
        v-if="creditsInfo"
        :title="`今日剩余免费额度: ${creditsInfo.free_calls} 张`"
        :type="creditsInfo.free_calls > 10 ? 'info' : 'warning'"
        :closable="false"
        style="margin-bottom: 20px;"
      />

      <!-- 抠图组件 -->
      <div class="demo-section">
        <h3>球员头像抠图</h3>
        <RemoveBgProcessor
          type="playerAvatar"
          @success="handleAvatarSuccess"
        />
      </div>

      <!-- 已生成的图片展示 -->
      <div v-if="generatedImages.length > 0" class="generated-section">
        <h3>已生成的图片</h3>
        <div class="image-list">
          <div
            v-for="(img, index) in generatedImages"
            :key="index"
            class="image-item"
          >
            <img :src="img.url" alt="抠图结果" />
            <p class="image-type">{{ img.type }}</p>
            <p class="image-url">{{ img.url.substring(0, 50) }}...</p>
          </div>
        </div>
      </div>

      <!-- 使用说明 -->
      <el-divider />
      <div class="usage-guide">
        <h3>使用说明</h3>
        <ol>
          <li>拖拽或点击上传需要抠图的图片</li>
          <li>系统自动调用 remove.bg API 进行 AI 抠图</li>
          <li>抠图完成后自动上传到云存储</li>
          <li>获取云存储 URL，可用于小程序端展示</li>
        </ol>
        <el-alert
          title="注意事项"
          type="warning"
          :closable="false"
        >
          <p>• 每天免费额度 50 张</p>
          <p>• 支持 JPG、PNG 格式</p>
          <p>• 单张图片最大 5MB</p>
          <p>• 抠图后背景为透明（PNG格式）</p>
        </el-alert>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import RemoveBgProcessor from '../../components/common/RemoveBgProcessor.vue'
import { checkApiCredits } from '../../utils/removeBg'

const creditsInfo = ref(null)
const generatedImages = ref([])

// 检查 API 额度
async function checkCredits() {
  const result = await checkApiCredits()
  if (result.success) {
    creditsInfo.value = result.data.credits
  }
}

// 处理抠图成功
function handleAvatarSuccess(data) {
  generatedImages.value.push({
    type: '球员头像',
    url: data.url,
    previewUrl: data.previewUrl
  })
  ElMessage.success('抠图完成并已保存到云存储')
}

onMounted(() => {
  checkCredits()
})
</script>

<style scoped>
.remove-bg-demo {
  padding: 20px;
  max-width: 800px;
  margin: 0 auto;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.demo-section {
  margin: 20px 0;
}

.demo-section h3 {
  margin-bottom: 16px;
  color: #303133;
}

.generated-section {
  margin-top: 30px;
}

.generated-section h3 {
  margin-bottom: 16px;
  color: #303133;
}

.image-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 16px;
}

.image-item {
  text-align: center;
}

.image-item img {
  width: 120px;
  height: 120px;
  object-fit: contain;
  border-radius: 8px;
  border: 1px solid #dcdfe6;
  background-image: 
    linear-gradient(45deg, #f0f0f0 25%, transparent 25%),
    linear-gradient(-45deg, #f0f0f0 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #f0f0f0 75%),
    linear-gradient(-45deg, transparent 75%, #f0f0f0 75%);
  background-size: 10px 10px;
  background-position: 0 0, 0 5px, 5px -5px, -5px 0px;
}

.image-type {
  margin: 8px 0 4px;
  font-size: 14px;
  color: #606266;
  font-weight: 500;
}

.image-url {
  margin: 0;
  font-size: 12px;
  color: #909399;
}

.usage-guide {
  margin-top: 20px;
}

.usage-guide h3 {
  margin-bottom: 12px;
  color: #303133;
}

.usage-guide ol {
  margin-bottom: 16px;
  padding-left: 20px;
  color: #606266;
  line-height: 1.8;
}
</style>
