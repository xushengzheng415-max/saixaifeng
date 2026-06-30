<template>
  <el-dialog
    v-model="visible"
    title="裁剪队徽"
    width="560px"
    :close-on-click-modal="false"
    destroy-on-close
  >
    <div class="cropper-wrapper">
      <img ref="imageRef" :src="imageSrc" class="cropper-img" />
    </div>
    <div class="cropper-toolbar">
      <el-button-group>
        <el-button size="small" @click="zoom(0.1)">
          <el-icon><ZoomIn /></el-icon>
        </el-button>
        <el-button size="small" @click="zoom(-0.1)">
          <el-icon><ZoomOut /></el-icon>
        </el-button>
        <el-button size="small" @click="rotate(-90)">
          <el-icon><RefreshLeft /></el-icon>
        </el-button>
        <el-button size="small" @click="rotate(90)">
          <el-icon><RefreshRight /></el-icon>
        </el-button>
        <el-button size="small" @click="reset">
          <el-icon><Refresh /></el-icon> 重置
        </el-button>
      </el-button-group>
      <span class="cropper-tip">拖动调整位置，滚轮缩放</span>
    </div>
    <template #footer>
      <el-button @click="cancel">取消</el-button>
      <el-button type="primary" :loading="cropping" @click="confirm">
        确认裁剪
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import Cropper from 'cropperjs'
import 'cropperjs/dist/cropper.css'
import { ZoomIn, ZoomOut, RefreshLeft, RefreshRight, Refresh } from '@element-plus/icons-vue'

const props = defineProps({
  modelValue: Boolean,
  imageSrc: String
})

const emit = defineEmits(['update:modelValue', 'crop'])

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const imageRef = ref(null)
const cropping = ref(false)
let cropper = null

watch(() => props.imageSrc, async (src) => {
  if (!src || !visible.value) return
  await nextTick()
  await nextTick()
  if (cropper) {
    cropper.destroy()
    cropper = null
  }
  if (imageRef.value) {
    cropper = new Cropper(imageRef.value, {
      aspectRatio: 1,
      viewMode: 0,
      dragMode: 'move',
      autoCropArea: 1,
      restore: false,
      guides: false,
      center: false,
      highlight: false,
      cropBoxMovable: true,
      cropBoxResizable: true,
      toggleDragModeOnDblclick: false,
      minContainerWidth: 500,
      minContainerHeight: 350,
      ready() {
        const canvasData = this.getCanvasData()
        const containerData = this.getContainerData()
        if (canvasData.naturalWidth > 0 && canvasData.naturalHeight > 0) {
          // 缩放到让图片 fit 进画布，留 5% 边距
          const scale = Math.min(
            containerData.width / canvasData.naturalWidth,
            containerData.height / canvasData.naturalHeight
          )
          if (scale < 1) {
            this.zoomTo(scale * 0.95)
          }
        }
      }
    })
  }
})

function zoom(ratio) {
  if (cropper) cropper.zoom(ratio)
}

function rotate(deg) {
  if (cropper) cropper.rotate(deg)
}

function reset() {
  if (cropper) cropper.reset()
}

function cancel() {
  visible.value = false
  if (cropper) {
    cropper.destroy()
    cropper = null
  }
}

function confirm() {
  if (!cropper) return
  cropping.value = true
  const canvas = cropper.getCroppedCanvas({
    width: 400,
    height: 400,
    fillColor: '#fff',
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high'
  })
  canvas.toBlob((blob) => {
    cropping.value = false
    if (blob) {
      emit('crop', blob)
    }
    visible.value = false
    cropper.destroy()
    cropper = null
  }, 'image/png')
}
</script>

<style scoped>
.cropper-wrapper {
  width: 100%;
  height: 380px;
  background: #f5f5f5;
  border-radius: 8px;
  overflow: hidden;
}
.cropper-img {
  display: block;
  max-width: 100%;
}
.cropper-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
}
.cropper-tip {
  font-size: 12px;
  color: #999;
}
</style>
