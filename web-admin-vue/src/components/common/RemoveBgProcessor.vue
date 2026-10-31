<template>
  <div class="remove-bg-processor">
    <!-- 上传区域 -->
    <el-upload
      v-if="!processedUrl && !showCropper"
      class="upload-area"
      drag
      action="#"
      :auto-upload="false"
      :on-change="handleFileChange"
      :show-file-list="false"
      accept="image/*"
    >
      <el-icon class="el-icon--upload"><upload-filled /></el-icon>
      <div class="el-upload__text">
        拖拽图片到此处或 <em>点击上传</em>
      </div>
      <template #tip>
        <div class="el-upload__tip">
          支持 JPG/PNG 格式
          <template v-if="props.type === 'teamLogo' || props.type === 'tournamentLogo'">
            <span class="tip-highlight">
              · 建议使用透明背景 PNG 格式，效果最佳
            </span>
            <span class="tip-size">
              · 按原图像素保留清晰度，最长边不超过 2048
            </span>
          </template>
          <span v-else>
            · 自动抠图去背景
          </span>
        </div>
      </template>
    </el-upload>

    <!-- 处理中 -->
    <div v-else-if="processing" class="processing-area">
      <el-icon class="is-loading" :size="48"><Loading /></el-icon>
      <p>AI 正在抠图中，请稍候...</p>
      <p class="sub-text">{{ props.type === 'playerAvatar' ? '百度智能云 AI 处理中' : '本地算法处理中' }}</p>
    </div>

    <!-- 裁剪区域 -->
    <div v-else-if="showCropper && cropperUrl" class="cropper-area">
      <div class="cropper-header">
        <p class="cropper-title">{{ cropConfig.title }}</p>

      </div>
      <div class="cropper-wrapper">
        <vue-cropper
          :key="cropperKey"
          ref="cropperRef"
          :img="cropperUrl"
          :output-size="1"
          :output-type="'png'"
          :info="false"
          :can-scale="true"
          :auto-crop="true"
          :fixed="true"
          :fixed-number="cropConfig.ratio"
          :fixed-box="false"
          :center-box="true"
          :can-move="true"
          :can-move-box="true"
          :original="false"
          :auto-crop-width="cropConfig.width"
          :auto-crop-height="cropConfig.height"
          :enlarge="isLogoType ? 1 : 2"
          :full="isLogoType"
          :high="!isLogoType"
          :max-img-size="isLogoType ? 4096 : 2000"
          mode="contain"
        />
        <!-- 头像参考框叠加层（仅球员头像显示） -->
        <img
          v-if="cropConfig.showAvatarFrame"
          :src="avatarFrameUrl"
          class="avatar-frame-overlay"
          alt="头像参考框"
        />
      </div>
      <div class="cropper-actions">
        <el-button @click="handleCropCancel">取消</el-button>
        <el-button type="primary" @click="handleCropConfirm" :loading="cropping">确认裁剪</el-button>
      </div>
    </div>

    <!-- 预览区域 -->
    <div v-else-if="processedUrl" class="preview-area">
      <div class="image-compare">
        <div class="image-box">
          <p class="label">原图</p>
          <div class="preview-stage">
            <img :src="originalUrl" alt="原图" :style="previewFrameStyle(originalFrame)" @load="rememberPreviewSize($event, 'original')" />
          </div>
        </div>
        <div class="image-box">
          <p class="label">抠图后（透明背景）</p>
          <div class="preview-stage transparent-bg">
            <img :src="processedUrl" alt="抠图后" :style="previewFrameStyle(processedFrame)" @load="rememberPreviewSize($event, 'processed')" />
          </div>
        </div>
      </div>

      <!-- 抠图方案提示 -->
      <div v-if="processMethod" class="method-tip">
        <el-tag :type="processMethod === 'baidu' ? 'success' : processMethod === 'whiteBg' ? 'info' : 'warning'" size="small">
          {{ processMethod === 'baidu' ? 'AI 智能抠图（百度）' : processMethod === 'whiteBg' ? '本地边缘抠白算法' : 'Canvas 简单去白底' }}
        </el-tag>
        <span v-if="methodWarning" class="method-warn">{{ methodWarning }}</span>
      </div>
      <div v-if="uploading" class="uploading-tip">
        <el-icon class="is-loading" :size="16"><Loading /></el-icon>
        <span>正在上传图片，请稍候…</span>
      </div>
      <div class="actions">
        <el-button @click="handleReset" :disabled="uploading">重新上传</el-button>
        <el-button
          type="primary"
          :loading="uploading"
          :disabled="uploading || !processedFileUrl"
          @click="handleConfirm"
        >
          {{ uploading ? '上传中…' : '使用此图片' }}
        </el-button>
      </div>
    </div>

    <!-- 错误提示 -->
    <el-alert
      v-if="errorMessage"
      :title="errorMessage"
      type="error"
      :closable="true"
      @close="errorMessage = ''"
      style="margin-top: 16px;"
    />
  </div>
</template>

<script setup>
import { ref, nextTick, computed, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled, Loading } from '@element-plus/icons-vue'
import { removeBackground } from '../../utils/removeBg'
import { removeBackgroundBaidu } from '../../utils/baiduRemoveBg'
import { removeWhiteBackground } from '../../utils/whiteBgRemover'
import { getTempFileURL } from '../../utils/upload'
import { uploadLargeFileViaCloud } from '../../utils/cloud'
import { LOGO_MAX_EDGE, LOGO_PREVIEW_BOX, logoPreviewSize, logoUploadEdges } from '../../utils/logoImageSize'
import { addTransparentSafeArea, fileFittedToEdge, limitDataUrlToEdge, readImageSize } from '../../utils/logoImageCanvas'

const avatarFrameUrl = `${import.meta.env.BASE_URL}images/avatar-frame.png`
import 'vue-cropper/dist/index.css'
import { VueCropper } from 'vue-cropper'

const props = defineProps({
  // 图片用途：'playerAvatar' | 'teamLogo' | 'tournamentLogo'
  type: {
    type: String,
    default: 'playerAvatar'
  }
})

const emit = defineEmits(['success'])
const isLogoType = computed(() => props.type === 'teamLogo' || props.type === 'tournamentLogo')

// 暴露重置方法，供父组件调用
defineExpose({ reset: handleReset })

const processing = ref(false)
const cropping = ref(false)
const uploading = ref(false) // 上传到云存储中
const originalUrl = ref('')
const sourceFile = ref(null)
const processedUrl = ref('')
const processedFileUrl = ref('') // 上传到云存储后的临时URL
const processedFileID = ref('') // 上传到云存储后的fileID
const errorMessage = ref('')
const processMethod = ref('')   // 'rembg' | 'canvas' | ''
const methodWarning = ref('')    // Canvas 方案时的警告
const originalFrame = ref(null)
const processedFrame = ref(null)

// 裁剪相关
const showCropper = ref(false)
const cropperUrl = ref('')
const cropperRef = ref(null)
const cropperKey = ref(0)  // 强制 vue-cropper 重新渲染

// Blob URL 缓存（用于释放）
let blobUrlCache = null

/**
 * 将 Data URL (base64) 转为 Blob URL
 * vue-cropper 对大尺寸 base64 支持不好，用 Blob URL 更稳定
 */
function dataUrlToBlobUrl(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith('data:')) return dataUrl
  const arr = dataUrl.split(',')
  const mimeMatch = arr[0].match(/:(.*?);/)
  const mime = mimeMatch ? mimeMatch[1] : 'image/png'
  const bstr = atob(arr[1])
  let n = bstr.length
  const u8arr = new Uint8Array(n)
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n)
  }
  const blob = new Blob([u8arr], { type: mime })
  return URL.createObjectURL(blob)
}

/**
 * 释放 Blob URL
 */
function revokeBlobUrl() {
  if (blobUrlCache) {
    URL.revokeObjectURL(blobUrlCache)
    blobUrlCache = null
  }
}

function rememberPreviewSize(event, key) {
  const img = event.target
  const frame = logoPreviewSize(img.naturalWidth || img.width, img.naturalHeight || img.height, LOGO_PREVIEW_BOX)
  const next = {
    width: `${frame.width}px`,
    height: `${frame.height}px`
  }
  if (key === 'processed') processedFrame.value = next
  else originalFrame.value = next
}

function previewFrameStyle(frame) {
  return frame || undefined
}

// 根据类型动态裁剪配置
const cropConfig = computed(() => {
  if (isLogoType.value) {
    return {
      title: '调整 Logo 位置',
      subtitle: '已预留安全边距，可拖动或缩放调整位置；输出保持原图像素',
      ratio: [1, 1],
      width: 500,
      height: 500,
      showAvatarFrame: false
    }
  }
  return {
    title: '调整头像位置',
    subtitle: '拖动图片调整位置，滚轮缩放，框选区域将用于球员卡显示',
    ratio: [150, 194],
    width: 150,
    height: 194,
    showAvatarFrame: true
  }
})

// 处理文件选择
async function handleFileChange(file) {
  if (!file || !file.raw) return

  // 保留用户上传的原始文件给调用方持久化；裁剪/透明抠图只生成派生图，不能覆盖原图。
  sourceFile.value = file.raw

  // 验证文件类型
  const validTypes = ['image/jpeg', 'image/png', 'image/jpg']
  if (!validTypes.includes(file.raw.type)) {
    ElMessage.error('请上传 JPG 或 PNG 格式的图片')
    return
  }

  // 验证文件大小（最大 3MB，百度API要求base64+urlencode后不超过4MB）
  const maxSize = 3 * 1024 * 1024
  if (file.raw.size > maxSize) {
    ElMessage.error('图片大小不能超过 3MB（百度API限制）')
    return
  }

  processing.value = true
  errorMessage.value = ''

  // 队徽只在超过 2048 时缩小，并铺白底供边缘抠白；小图保持原像素。
  let processFile = file.raw
  if (isLogoType.value) {
    try {
      processFile = await fileFittedToEdge(file.raw, LOGO_MAX_EDGE, { matte: true })
    } catch (err) {
      console.warn('[RemoveBg] 图片尺寸整理失败，使用原图:', err.message)
      processFile = file.raw
    }
  }

  originalFrame.value = null
  if (originalUrl.value && originalUrl.value.startsWith('blob:')) URL.revokeObjectURL(originalUrl.value)
  originalUrl.value = URL.createObjectURL(processFile)

  try {

      let result

    // 根据类型选择抠图方式
    if (isLogoType.value) {
      // 队徽/赛事Logo：优先使用本地"抠白"算法（去除白色背景）
      result = await removeWhiteBackground(processFile)

      // 如果本地算法失败，回退到 remove.bg API
      if (!result.success) {
        console.warn('[RemoveBg] 本地抠白失败，回退到 remove.bg API')
        result = await removeBackground(processFile)
      }
    } else {
      // 球员头像：优先使用百度人像分割（免费额度充足）
      result = await removeBackgroundBaidu(processFile)

      // 如果百度失败，回退到 remove.bg
      if (!result.success) {
        console.warn('[RemoveBg] 百度抠图失败，回退到 remove.bg API')
        result = await removeBackground(processFile)
      }
    }

      if (result.success && result.data) {

        // 记录使用的方案
        processMethod.value = result.method || ''
        methodWarning.value = result.warning || ''

        // 球员头像仍压到 200px，避免人像分割大图触发上传限制。
        // 队徽保持抠图结果的像素，不再先缩成 200px 再被裁剪框放大。
        const cropperReady = isLogoType.value ? result.data : await limitDataUrlToEdge(result.data, 200)
        const cropperWithSafeArea = await addTransparentSafeArea(cropperReady)
        const preparedSize = await readImageSize(cropperWithSafeArea)
        console.log(`[RemoveBg] 裁剪源图: ${preparedSize.width}×${preparedSize.height}, ${(cropperWithSafeArea.length / 1024).toFixed(1)}KB`)

        // 将 base64 转为 Blob URL（vue-cropper 对大 base64 支持不好）
        revokeBlobUrl()
        const blobUrl = dataUrlToBlobUrl(cropperWithSafeArea)
        blobUrlCache = blobUrl

        // 进入裁剪模式：先设置数据，再显示裁剪区，最后刷新组件
        cropperUrl.value = blobUrl
        showCropper.value = true
        cropperKey.value++  // 强制 vue-cropper 重新创建
        await nextTick()
        processing.value = false
      } else {
        throw new Error(result.message || '抠图失败')
      }
  } catch (err) {
    console.error('[RemoveBg] 处理失败:', err)
    errorMessage.value = err.message || '抠图处理失败，请重试'
    ElMessage.error(errorMessage.value)
    processing.value = false
  }
}

// 取消裁剪
function handleCropCancel() {
  showCropper.value = false
  cropperUrl.value = ''
  if (originalUrl.value && originalUrl.value.startsWith('blob:')) URL.revokeObjectURL(originalUrl.value)
  originalUrl.value = ''
  originalFrame.value = null
  processedFrame.value = null
  revokeBlobUrl()
}

// 确认裁剪
async function handleCropConfirm() {
  if (!cropperRef.value) return

  cropping.value = true

  try {
    cropperRef.value.getCropData(async (data) => {
      const rawKB = (data.length / 1024).toFixed(1)
      console.log(`[RemoveBg] getCropData → ${rawKB}KB, 前缀: ${data.substring(0, 30)}`)
      processedFrame.value = null
      processedUrl.value = data
      showCropper.value = false
      uploading.value = true

      try {
        const uploaded = await uploadWithAutoRetry(data)
        if (uploaded && uploaded !== data) {
          processedFrame.value = null
          processedUrl.value = uploaded
        }
      } catch (err) {
        console.error('[RemoveBg] 上传失败:', err)
        errorMessage.value = '上传失败，请重试'
        ElMessage.error(errorMessage.value)
      } finally {
        uploading.value = false
        cropping.value = false
      }
    })
  } catch (err) {
    console.error('[RemoveBg] 裁剪失败:', err)
    ElMessage.error(errorMessage.value)
    cropping.value = false
  }
}

async function uploadWithAutoRetry(base64Data) {
  // 分片上传本身不受单次 body 大小限制。队徽第一次按当前像素上传；
  // 只有上传失败才逐级缩小。球员头像仍从 200px 起试。
  const size = isLogoType.value ? await readImageSize(base64Data) : null
  const longest = size ? Math.max(size.width, size.height) : 0
  const edges = isLogoType.value ? logoUploadEdges(size.width, size.height) : [200, 128, 64]
  let lastError = null

  for (const edge of edges) {
    try {
      const payload = isLogoType.value && edge >= longest
        ? base64Data
        : await limitDataUrlToEdge(base64Data, edge)
      const payloadSize = await readImageSize(payload)
      console.log(`[RemoveBg] 上传 ${payloadSize.width}×${payloadSize.height}, ${(payload.length / 1024).toFixed(1)}KB`)
      await uploadProcessedImage(payload)
      return payload
    } catch (err) {
      lastError = err
      console.warn(`[RemoveBg] 最长边 ${edge}px 上传失败:`, err.message)
    }
  }
  throw lastError || new Error('上传失败')
}

// 上传处理后的图片到云存储
// ★ 分片上传：每片 32KB，绕过 HTTP 网关 body 限制
async function uploadProcessedImage(base64Data) {
  try {
    const folder = getFolderByType()

    // base64 → Blob → File
    const blob = dataUrlToBlob(base64Data)
    const fileName = `${Date.now()}.png`
    const file = new File([blob], fileName, { type: 'image/png' })
    const cloudPath = `${folder}/${fileName}`

    console.log(`[RemoveBg] 分片上传: ${(blob.size / 1024).toFixed(1)}KB → ${cloudPath}`)

    // ★ 32KB 分片（二进制），base64 后 ≈ 43KB，远低于 ~100KB 限制
    const result = await uploadLargeFileViaCloud(cloudPath, file, { chunkSize: 32 * 1024 })

    if (result.success && result.fileId) {
      processedFileID.value = result.fileId

      if (result.tempUrl) {
        processedFileUrl.value = result.tempUrl
      } else {
        const urlResult = await getTempFileURL(result.fileId)
        if (urlResult.success && urlResult.url) {
          processedFileUrl.value = urlResult.url
        } else {
          processedFileUrl.value = result.fileId
        }
      }
      console.log('[RemoveBg] 上传成功:', result.fileId)
    } else {
      throw new Error(result.message || '上传失败')
    }
  } catch (err) {
    console.error('[RemoveBg] 上传失败:', err)
    throw err
  }
}

// 工具函数：dataUrl → Blob
function dataUrlToBlob(dataUrl) {
  const arr = dataUrl.split(',')
  const mimeMatch = arr[0].match(/:(.*?);/)
  const mime = mimeMatch ? mimeMatch[1] : 'image/png'
  const bstr = atob(arr[1])
  const u8arr = new Uint8Array(bstr.length)
  for (let i = 0; i < bstr.length; i++) {
    u8arr[i] = bstr.charCodeAt(i)
  }
  return new Blob([u8arr], { type: mime })
}

// 根据类型获取存储文件夹
function getFolderByType() {
  switch (props.type) {
    case 'teamLogo':
      return 'team-logos'
    case 'tournamentLogo':
      return 'tournament-logos'
    case 'playerAvatar':
    default:
      return 'player-avatars'
  }
}

// 重置
function handleReset() {
  if (originalUrl.value && originalUrl.value.startsWith('blob:')) URL.revokeObjectURL(originalUrl.value)
  originalUrl.value = ''
  originalFrame.value = null
  processedFrame.value = null
  sourceFile.value = null
  processedUrl.value = ''
  processedFileUrl.value = ''
  processedFileID.value = ''
  cropperUrl.value = ''
  showCropper.value = false
  errorMessage.value = ''
  processMethod.value = ''
  methodWarning.value = ''
  revokeBlobUrl()
}

// 确认使用
function handleConfirm() {
  if (processedFileUrl.value) {
    emit('success', {
      url: processedFileUrl.value,
      previewUrl: processedUrl.value,
      fileID: processedFileID.value,
      sourceFile: sourceFile.value
    })
    ElMessage.success('图片已选择，请点击保存按钮保存更改')
    // 不重置，保持预览状态
  }
}

// 组件卸载时释放 Blob URL
onUnmounted(() => {
  revokeBlobUrl()
})
</script>

<style scoped>
.remove-bg-processor {
  width: 100%;
}

.tip-highlight {
  color: #e6a23c;
  font-weight: 500;
}

.tip-size {
  color: #67c23a;
  font-weight: 500;
  margin-left: 4px;
}

.upload-area {
  width: 100%;
}

.upload-area :deep(.el-upload-dragger) {
  width: 100%;
  height: 200px;
}

.processing-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  background: #f5f7fa;
  border-radius: 8px;
  gap: 16px;
}

.processing-area p {
  margin: 0;
  color: #606266;
  font-size: 16px;
}

.processing-area .sub-text {
  font-size: 12px;
  color: #909399;
}

/* 裁剪区域 */
.cropper-area {
  padding: 16px;
  background: #f5f7fa;
  border-radius: 8px;
}

.cropper-header {
  text-align: center;
  margin-bottom: 16px;
}

.cropper-title {
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.cropper-subtitle {
  margin: 0;
  font-size: 13px;
  color: #909399;
}

.cropper-wrapper {
  position: relative;
  width: 100%;
  max-width: 320px;
  height: 280px;
  margin: 0 auto;
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #dcdfe6;
}

/* 头像参考框叠加层 - 居中显示在裁剪区域 */
.avatar-frame-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 150px;
  height: 194px;
  pointer-events: none;
  z-index: 10;
  opacity: 1;
  filter: drop-shadow(0 0 4px rgba(0, 0, 0, 0.6));
}

.cropper-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 16px;
}

.preview-area {
  padding: 16px;
}

.image-compare {
  display: flex;
  gap: 16px;
  margin-bottom: 20px;
}

.image-box {
  flex: 1;
  text-align: center;
}

.image-box .label {
  margin: 0 0 8px 0;
  font-size: 14px;
  color: #606266;
  font-weight: 500;
}

.preview-stage {
  box-sizing: border-box;
  width: 200px;
  height: 200px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid #dcdfe6;
  background: #fff;
}

.preview-stage img {
  display: block;
  width: auto;
  height: auto;
  max-width: 200px;
  max-height: 200px;
  flex: 0 0 auto;
  object-fit: contain;
}

.image-box .transparent-bg {
  background-image:
    linear-gradient(45deg, #ccc 25%, transparent 25%),
    linear-gradient(-45deg, #ccc 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #ccc 75%),
    linear-gradient(-45deg, transparent 75%, #ccc 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
  background-color: #fff;
}

.uploading-tip {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 12px 0;
  padding: 10px 16px;
  background: #ecf5ff;
  border-radius: 6px;
  color: #409eff;
  font-size: 13px;
}

.actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 20px;
}

/* 抠图方案提示 */
.method-tip {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 0;
  font-size: 13px;
}

.method-warn {
  color: #e6a23c;
  font-size: 12px;
}
</style>
