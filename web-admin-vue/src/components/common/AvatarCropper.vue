<template>
  <div class="avatar-cropper">
    <!-- 上传区域 -->
    <div v-if="!imageUrl && !processedImage" class="upload-section">
      <el-upload
        class="avatar-uploader"
        drag
        action="#"
        :auto-upload="false"
        :on-change="handleFileChange"
        :show-file-list="false"
        accept="image/*"
      >
        <el-icon class="el-icon--upload" :size="48"><upload-filled /></el-icon>
        <div class="el-upload__text">
          拖拽图片到此处或 <em>点击上传</em>
        </div>
        <template #tip>
          <div class="el-upload__tip">
            支持 JPG、PNG 格式，建议上传半身照
          </div>
        </template>
      </el-upload>
    </div>

    <!-- 裁剪区域 -->
    <div v-else-if="imageUrl && !processedImage" class="crop-section">
      <div class="crop-header">
        <p class="crop-title">调整头像位置</p>
        <p class="crop-subtitle">拖动图片调整位置，滚轮缩放，框选区域将用于球员卡显示</p>
      </div>
      <div class="cropper-wrapper">
        <vue-cropper
          ref="cropperRef"
          :img="imageUrl"
          :output-size="1"
          :output-type="'png'"
          :info="false"
          :can-scale="true"
          :auto-crop="true"
          :fixed="true"
          :fixed-number="[3, 4]"
          :fixed-box="true"
          :center-box="true"
          :can-move="true"
          :can-move-box="false"
          :original="false"
          :auto-crop-width="180"
          :auto-crop-height="240"
          :enlarge="2"
          mode="contain"
        />
      </div>
      <div class="crop-actions">
        <el-button @click="handleCancel">取消</el-button>
        <el-button type="primary" :loading="processing" @click="handleConfirm">
          {{ processing ? '处理中...' : '确认裁剪' }}
        </el-button>
      </div>
    </div>

    <!-- 结果预览 -->
    <div v-else-if="processedImage" class="preview-section">
      <div class="preview-box">
        <p class="preview-label">抠图结果（透明背景）</p>
        <img :src="processedImage" alt="抠图结果" class="preview-image transparent-bg" />
      </div>
      <div class="preview-actions">
        <el-button @click="handleReset">重新上传</el-button>
        <el-button type="primary" @click="handleUse">使用此图片</el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import { VueCropper } from 'vue-cropper'
import 'vue-cropper/dist/index.css'
import { removeBackgroundBaidu } from '../../utils/baiduRemoveBg'

const emit = defineEmits(['success', 'cancel'])

const imageUrl = ref('')
const processedImage = ref('')
const processing = ref(false)
const cropperRef = ref(null)
const originalFile = ref(null)

// 处理文件选择
function handleFileChange(file) {
  if (!file || !file.raw) return

  // 验证文件类型
  const validTypes = ['image/jpeg', 'image/png', 'image/jpg']
  if (!validTypes.includes(file.raw.type)) {
    ElMessage.error('请上传 JPG 或 PNG 格式的图片')
    return
  }

  // 验证文件大小（最大 5MB）
  const maxSize = 5 * 1024 * 1024
  if (file.raw.size > maxSize) {
    ElMessage.error('图片大小不能超过 5MB')
    return
  }

  originalFile.value = file.raw
  imageUrl.value = URL.createObjectURL(file.raw)
}

// 取消裁剪
function handleCancel() {
  imageUrl.value = ''
  originalFile.value = null
  emit('cancel')
}

// 确认裁剪并进行抠图
async function handleConfirm() {
  if (!cropperRef.value || !originalFile.value) return

  processing.value = true
  
  try {
    // 获取裁剪后的图片数据
    cropperRef.value.getCropData(async (cropData) => {
      try {
        // 将 base64 转换为文件
        const cropFile = await base64ToFile(cropData, 'cropped.png')
        
        // 调用抠图 API
        const result = await removeBackgroundBaidu(cropFile)
        
        if (result.success && result.data) {
          // 保持透明背景，不添加白色背景
          processedImage.value = result.data
          ElMessage.success('抠图完成')
        } else {
          throw new Error(result.message || '抠图失败')
        }
      } catch (err) {
        console.error('处理失败:', err)
        ElMessage.error('处理失败: ' + err.message)
      } finally {
        processing.value = false
      }
    })
  } catch (err) {
    console.error('裁剪失败:', err)
    ElMessage.error('裁剪失败')
    processing.value = false
  }
}

// Base64 转 File
function base64ToFile(base64Data, filename) {
  return new Promise((resolve) => {
    const arr = base64Data.split(',')
    const mime = arr[0].match(/:(.*?);/)[1]
    const bstr = atob(arr[1])
    let n = bstr.length
    const u8arr = new Uint8Array(n)
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n)
    }
    resolve(new File([u8arr], filename, { type: mime }))
  })
}

// 重新上传
function handleReset() {
  imageUrl.value = ''
  processedImage.value = ''
  originalFile.value = null
}

// 使用此图片
function handleUse() {
  if (processedImage.value) {
    emit('success', processedImage.value)
  }
}
</script>

<style scoped>
.avatar-cropper {
  width: 100%;
}

.upload-section {
  width: 100%;
}

.avatar-uploader :deep(.el-upload-dragger) {
  width: 100%;
  height: 200px;
}

/* 裁剪区域 */
.crop-section {
  padding: 16px;
  background: #f5f7fa;
  border-radius: 8px;
}

.crop-header {
  text-align: center;
  margin-bottom: 16px;
}

.crop-title {
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.crop-subtitle {
  margin: 0;
  font-size: 13px;
  color: #909399;
}

.cropper-wrapper {
  width: 100%;
  height: 400px;
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #dcdfe6;
}

.crop-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 16px;
}

/* 预览区域 */
.preview-section {
  padding: 16px;
  text-align: center;
}

.preview-box {
  margin-bottom: 20px;
}

.preview-label {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #606266;
  font-weight: 500;
}

.preview-image {
  width: 180px;
  height: 240px;
  object-fit: contain;
  border-radius: 8px;
  border: 1px solid #dcdfe6;
}

.transparent-bg {
  background-image: 
    linear-gradient(45deg, #ccc 25%, transparent 25%),
    linear-gradient(-45deg, #ccc 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #ccc 75%),
    linear-gradient(-45deg, transparent 75%, #ccc 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
  background-color: #fff;
}

.preview-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
}
</style>
