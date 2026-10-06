<template>
  <div class="poster-editor">
    <!-- 左侧工具栏 -->
    <div class="editor-left">
      <el-tabs v-model="activeTab" class="left-tabs">
        <!-- AI 生图 -->
        <el-tab-pane label="AI 生图" name="ai">
          <div class="panel-section">
            <p class="section-title">生成赛事海报背景</p>
            <el-input
              v-model="aiPrompt"
              type="textarea"
              :rows="3"
              placeholder="描述你想要的背景，如：热血足球赛场，绿色草坪，观众席，灯光璀璨，夜间比赛氛围"
            />
            <div class="style-presets">
              <span class="preset-label">风格：</span>
              <el-radio-group v-model="aiStyle" size="small">
                <el-radio-button label="写实">写实</el-radio-button>
                <el-radio-button label="插画">插画</el-radio-button>
                <el-radio-button label="科技">科技</el-radio-button>
              </el-radio-group>
            </div>
            <el-button
              type="primary"
              :loading="aiGenerating"
              @click="generateAIBackground"
              class="generate-btn"
            >
              <el-icon v-if="!aiGenerating"><Picture /></el-icon>
              {{ aiGenerating ? '生成中...' : '生成背景' }}
            </el-button>
          </div>
        </el-tab-pane>

        <!-- 上传图片 -->
        <el-tab-pane label="上传图片" name="upload">
          <div class="panel-section">
            <p class="section-title">上传背景图片</p>
            <el-upload
              drag
              :auto-upload="false"
              :show-file-list="false"
              accept="image/*"
              @change="handleImageUpload"
            >
              <el-icon class="upload-icon"><UploadFilled /></el-icon>
              <div class="upload-text">拖拽图片到这里<br/>或点击上传</div>
            </el-upload>
          </div>
        </el-tab-pane>

        <!-- 预设模板 -->
        <el-tab-pane label="预设模板" name="templates">
          <div class="panel-section">
            <p class="section-title">选择背景模板</p>
            <div class="template-grid">
              <div
                v-for="(tpl, index) in templates"
                :key="index"
                class="template-item"
                :class="{ active: selectedTemplate === index }"
                @click="selectTemplate(index)"
              >
                <div class="template-preview" :style="{ background: tpl.gradient }"></div>
                <span class="template-name">{{ tpl.name }}</span>
              </div>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>

      <!-- 添加元素 -->
      <div class="add-elements">
        <p class="section-title">添加元素</p>
        <div class="element-buttons">
          <el-button @click="addTextElement">
            <el-icon><Edit /></el-icon> 添加文字
          </el-button>
          <el-button @click="addImageElement">
            <el-icon><Picture /></el-icon> 添加图片
          </el-button>
          <el-button @click="addShapeElement('rect')">
            <el-icon><FullScreen /></el-icon> 添加矩形
          </el-button>
          <el-button @click="addShapeElement('circle')">
            <el-icon><Aim /></el-icon> 添加圆形
          </el-button>
        </div>
      </div>
    </div>

    <!-- 中间画布区域 -->
    <div class="editor-canvas-area">
      <div class="canvas-container" ref="canvasContainer">
        <div
          class="canvas-wrapper"
          :style="canvasWrapperStyle"
          @mousedown="handleCanvasMouseDown"
          @mousemove="handleCanvasMouseMove"
          @mouseup="handleCanvasMouseUp"
          @mouseleave="handleCanvasMouseUp"
        >
          <!-- 背景层 -->
          <div
            class="canvas-background"
            :style="backgroundStyle"
          ></div>

          <!-- 元素层 -->
          <div
            v-for="(el, index) in elements"
            :key="el.id"
            class="canvas-element"
            :class="{ selected: selectedElementId === el.id }"
            :style="getElementStyle(el)"
            @mousedown.stop="handleElementMouseDown($event, el)"
          >
            <!-- 文字元素 -->
            <div
              v-if="el.type === 'text'"
              class="element-text"
              :contenteditable="selectedElementId === el.id"
              @blur="updateElementText(el, $event)"
              @input="updateElementText(el, $event)"
              v-html="el.content"
            ></div>

            <!-- 图片元素 -->
            <img
              v-else-if="el.type === 'image'"
              :src="el.src"
              class="element-image"
              draggable="false"
            />

            <!-- 矩形元素 -->
            <div
              v-else-if="el.type === 'shape' && el.shape === 'rect'"
              class="element-shape rect"
              :style="{ backgroundColor: el.fill, opacity: el.opacity || 1 }"
            ></div>

            <!-- 圆形元素 -->
            <div
              v-else-if="el.type === 'shape' && el.shape === 'circle'"
              class="element-shape circle"
              :style="{ backgroundColor: el.fill, opacity: el.opacity || 1 }"
            ></div>

            <!-- 选中控制框 -->
            <template v-if="selectedElementId === el.id">
              <!-- 文字元素：显示字号调整指示器 -->
              <div v-if="el.type === 'text'" class="font-size-indicator">
                <span>{{ el.fontSize || 32 }}px</span>
              </div>
              <!-- 四个角的缩放控制点 -->
              <div
                class="control-point top-left"
                @mousedown.stop="startResize($event, el, 'top-left')"
              ></div>
              <div
                class="control-point top-right"
                @mousedown.stop="startResize($event, el, 'top-right')"
              ></div>
              <div
                class="control-point bottom-left"
                @mousedown.stop="startResize($event, el, 'bottom-left')"
              ></div>
              <div
                class="control-point bottom-right"
                @mousedown.stop="startResize($event, el, 'bottom-right')"
              ></div>
              <div class="control-point rotate-handle" @mousedown.stop="startRotate($event, el)">
                <el-icon><RefreshRight /></el-icon>
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- 缩放控制 -->
      <div class="zoom-controls">
        <el-button-group>
          <el-button @click="zoomOut" :disabled="scale <= 0.3"><el-icon><ZoomOut /></el-icon></el-button>
          <el-button class="zoom-label">{{ Math.round(scale * 100) }}%</el-button>
          <el-button @click="zoomIn" :disabled="scale >= 3"><el-icon><ZoomIn /></el-icon></el-button>
        </el-button-group>
        <el-button @click="resetZoom">重置</el-button>
      </div>
    </div>

    <!-- 右侧属性面板 -->
    <div class="editor-right">
      <!-- 元素列表 -->
      <div class="elements-list-section">
        <p class="section-title">图层列表</p>
        <div class="elements-list">
          <div
            v-for="(el, index) in elements"
            :key="el.id"
            class="element-list-item"
            :class="{ selected: selectedElementId === el.id }"
            @click="selectedElementId = el.id"
          >
            <el-icon v-if="el.type === 'text'"><Edit /></el-icon>
            <el-icon v-else-if="el.type === 'image'"><Picture /></el-icon>
            <el-icon v-else-if="el.type === 'shape'"><FullScreen /></el-icon>
            <span class="element-name">{{ getElementName(el) }}</span>
            <el-icon class="delete-icon" @click.stop="deleteElementById(el.id)"><Delete /></el-icon>
          </div>
          <div v-if="elements.length === 0" class="no-elements">
            <p>暂无元素</p>
            <p class="tip">点击左侧添加元素</p>
          </div>
        </div>
      </div>

      <template v-if="selectedElement">
        <div class="panel-section">
          <p class="section-title">元素属性</p>

          <!-- 文字内容 -->
          <div v-if="selectedElement.type === 'text'" class="property-group">
            <label>文字内容</label>
            <el-input
              v-model="selectedElement.content"
              type="textarea"
              :rows="2"
              placeholder="输入文字内容"
              @input="updateElement"
            />
          </div>

          <!-- 文字样式快捷工具栏 -->
          <div v-if="selectedElement.type === 'text'" class="property-group">
            <label>快捷样式</label>
            <div class="style-toolbar">
              <el-button-group>
                <el-button
                  :type="selectedElement.fontWeight === 'bold' ? 'primary' : ''"
                  size="small"
                  @click="toggleBold"
                >
                  <el-icon><Rank /></el-icon>
                </el-button>
                <el-button
                  :type="selectedElement.fontStyle === 'italic' ? 'primary' : ''"
                  size="small"
                  @click="toggleItalic"
                >
                  <el-icon><MagicStick /></el-icon>
                </el-button>
                <el-button
                  :type="selectedElement.textDecoration === 'underline' ? 'primary' : ''"
                  size="small"
                  @click="toggleUnderline"
                >
                  <el-icon><Link /></el-icon>
                </el-button>
              </el-button-group>
              <el-button-group>
                <el-button
                  :type="selectedElement.textAlign === 'left' ? 'primary' : ''"
                  size="small"
                  @click="setTextAlign('left')"
                >
                  <el-icon><Histogram /></el-icon>
                </el-button>
                <el-button
                  :type="selectedElement.textAlign === 'center' ? 'primary' : ''"
                  size="small"
                  @click="setTextAlign('center')"
                >
                  <el-icon><Grid /></el-icon>
                </el-button>
                <el-button
                  :type="selectedElement.textAlign === 'right' ? 'primary' : ''"
                  size="small"
                  @click="setTextAlign('right')"
                >
                  <el-icon><Finished /></el-icon>
                </el-button>
              </el-button-group>
            </div>
          </div>

          <!-- 字体样式预设 -->
          <div v-if="selectedElement.type === 'text'" class="property-group">
            <label>文字预设样式</label>
            <div class="text-presets">
              <div
                v-for="preset in textPresets"
                :key="preset.name"
                class="text-preset-item"
                :style="{ fontFamily: preset.fontFamily, color: preset.color, fontSize: preset.fontSize + 'px' }"
                @click="applyTextPreset(preset)"
              >
                {{ preset.name }}
              </div>
            </div>
          </div>

          <!-- 字体 -->
          <div v-if="selectedElement.type === 'text'" class="property-group">
            <label>字体</label>
            <el-select v-model="selectedElement.fontFamily" @change="updateElement">
              <el-option label="默认字体" value="默认" />
              <el-option label="黑体" value="SimHei, sans-serif" />
              <el-option label="宋体" value="SimSun, serif" />
              <el-option label="楷体" value="KaiTi, cursive" />
              <el-option label="微软雅黑" value="Microsoft YaHei, sans-serif" />
              <el-option label="阿里巴巴普惠体" value="AlibabaPuHuiTi, sans-serif" />
              <el-option label="站酷快乐体" value="ZCOOLKuaiLe, cursive" />
              <el-option label="站酷高端黑" value="ZCOOLGaoDuanHei, sans-serif" />
              <el-option label="思源黑体" value="Source Han Sans CN, sans-serif" />
              <el-option label="思源宋体" value="Source Han Serif CN, serif" />
            </el-select>
          </div>

          <!-- 字号 -->
          <div v-if="selectedElement.type === 'text'" class="property-group">
            <label>字号: {{ selectedElement.fontSize || 32 }}px</label>
            <el-slider v-model="selectedElement.fontSize" :min="12" :max="120" @change="updateElement" />
          </div>

          <!-- 字间距 -->
          <div v-if="selectedElement.type === 'text'" class="property-group">
            <label>字间距: {{ selectedElement.letterSpacing || 0 }}px</label>
            <el-slider v-model="selectedElement.letterSpacing" :min="-5" :max="20" @change="updateElement" />
          </div>

          <!-- 行高 -->
          <div v-if="selectedElement.type === 'text'" class="property-group">
            <label>行高: {{ selectedElement.lineHeight || 1.2 }}</label>
            <el-slider v-model="selectedElement.lineHeight" :min="1" :max="3" :step="0.1" @change="updateElement" />
          </div>

          <!-- 颜色 -->
          <div v-if="selectedElement.type === 'text'" class="property-group">
            <label>文字颜色</label>
            <div class="color-input-wrapper">
              <el-color-picker v-model="selectedElement.color" @change="updateElement" />
              <el-input v-model="selectedElement.color" @change="updateElement" />
            </div>
          </div>

          <!-- 描边颜色 -->
          <div v-if="selectedElement.type === 'text'" class="property-group">
            <label>描边颜色</label>
            <div class="color-input-wrapper">
              <el-color-picker v-model="selectedElement.strokeColor" :predefine="predefineColors" @change="updateElement" />
              <el-input v-model="selectedElement.strokeColor" @change="updateElement" />
            </div>
            <el-checkbox v-model="selectedElement.hasStroke" @change="updateElement" style="margin-top: 8px">
              启用描边
            </el-checkbox>
          </div>

          <!-- 阴影 -->
          <div v-if="selectedElement.type === 'text'" class="property-group">
            <label>文字阴影</label>
            <el-switch v-model="selectedElement.hasShadow" @change="updateElement" />
            <div v-if="selectedElement.hasShadow" class="shadow-options">
              <div class="color-input-wrapper" style="margin-top: 8px">
                <span>阴影色</span>
                <el-color-picker v-model="selectedElement.shadowColor" size="small" @change="updateElement" />
              </div>
              <div class="shadow-offset">
                <span>X偏移:</span>
                <el-input-number v-model="selectedElement.shadowBlur" :min="0" :max="20" size="small" @change="updateElement" />
                <span>Y偏移:</span>
                <el-input-number v-model="selectedElement.shadowOffsetY" :min="0" :max="20" size="small" @change="updateElement" />
              </div>
            </div>
          </div>

          <!-- 背景色（形状） -->
          <div v-if="selectedElement.type === 'shape'" class="property-group">
            <label>填充颜色</label>
            <div class="color-input-wrapper">
              <el-color-picker v-model="selectedElement.fill" @change="updateElement" />
              <el-input v-model="selectedElement.fill" @change="updateElement" />
            </div>
          </div>

          <!-- 透明度 -->
          <div class="property-group">
            <label>透明度: {{ Math.round((selectedElement.opacity || 1) * 100) }}%</label>
            <el-slider v-model="selectedElement.opacity" :min="0.1" :max="1" :step="0.1" @change="updateElement" />
          </div>

          <!-- 位置 -->
          <div class="property-group">
            <label>位置</label>
            <div class="position-inputs">
              <div class="pos-item">
                <span>X:</span>
                <el-input-number v-model="selectedElement.x" :min="0" size="small" @change="updateElement" />
              </div>
              <div class="pos-item">
                <span>Y:</span>
                <el-input-number v-model="selectedElement.y" :min="0" size="small" @change="updateElement" />
              </div>
            </div>
          </div>

          <!-- 尺寸 -->
          <div class="property-group">
            <label>尺寸</label>
            <div class="size-inputs">
              <div class="size-item">
                <span>宽:</span>
                <el-input-number v-model="selectedElement.width" :min="20" size="small" @change="updateElement" />
              </div>
              <div class="size-item">
                <span>高:</span>
                <el-input-number v-model="selectedElement.height" :min="20" size="small" @change="updateElement" />
              </div>
            </div>
          </div>

          <!-- 旋转角度 -->
          <div class="property-group">
            <label>旋转: {{ selectedElement.rotation || 0 }}°</label>
            <el-slider v-model="selectedElement.rotation" :min="-180" :max="180" @change="updateElement" />
          </div>

          <!-- 层级 -->
          <div class="property-group">
            <label>层级</label>
            <div class="layer-buttons">
              <el-button size="small" @click="moveLayerUp">
                <el-icon><Top /></el-icon> 上移
              </el-button>
              <el-button size="small" @click="moveLayerDown">
                <el-icon><Bottom /></el-icon> 下移
              </el-button>
              <el-button size="small" @click="moveLayerTop">
                <el-icon><Top /></el-icon><el-icon><Top /></el-icon> 置顶
              </el-button>
              <el-button size="small" @click="moveLayerBottom">
                <el-icon><Bottom /></el-icon><el-icon><Bottom /></el-icon> 置底
              </el-button>
            </div>
          </div>

          <!-- 删除 -->
          <div class="property-group">
            <el-button type="danger" @click="deleteElement">
              <el-icon><Delete /></el-icon> 删除元素
            </el-button>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="no-selection">
          <el-icon :size="48"><Pointer /></el-icon>
          <p>点击画布中的元素进行编辑</p>
        </div>
      </template>

      <!-- 导出按钮 -->
      <div class="export-section">
        <el-button type="primary" size="large" @click="exportPoster" :loading="exporting">
          <el-icon><Download /></el-icon>
          导出海报
        </el-button>
        <el-button @click="saveTemplate">
          <el-icon><Document /></el-icon>
          保存模板
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { Picture, UploadFilled, Edit, FullScreen, Aim, RefreshRight, ZoomIn, ZoomOut, Top, Bottom, Delete, Download, Document, Pointer, Rank, MagicStick, Link, Histogram, Grid, Finished } from '@element-plus/icons-vue'

// 画布尺寸
const CANVAS_WIDTH = 600
const CANVAS_HEIGHT = 900

// 状态
const activeTab = ref('ai')
const aiPrompt = ref('')
const aiStyle = ref('写实')
const aiGenerating = ref(false)
const exporting = ref(false)
const scale = ref(1)
const selectedTemplate = ref(-1)

// 背景
const background = reactive({
  type: 'color',
  value: '#1a1a2e'
})

// 元素列表
const elements = ref([])
const selectedElementId = ref(null)

// 拖拽状态
const isDragging = ref(false)
const isResizing = ref(false)
const isRotating = ref(false)
const dragStart = ref({ x: 0, y: 0 })
const resizeHandle = ref('')
const canvasContainer = ref(null)

// 预设模板
const templates = [
  { name: '深夜足球', gradient: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)' },
  { name: '热血绿茵', gradient: 'linear-gradient(135deg, #134e5e 0%, #71b280 100%)' },
  { name: '金色荣耀', gradient: 'linear-gradient(135deg, #f12711 0%, #f5af19 100%)' },
  { name: '科技未来', gradient: 'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)' },
  { name: '经典红蓝', gradient: 'linear-gradient(135deg, #c94b4b 0%, #4b134f 100%)' },
  { name: '清新浅蓝', gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
]

// 预定义颜色
const predefineColors = ref([
  '#ffffff', '#000000', '#ff4500', '#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#9b59b6'
])

// 文字样式预设
const textPresets = [
  { name: '标题', fontFamily: 'Microsoft YaHei, sans-serif', fontSize: 48, color: '#ffffff', fontWeight: 'bold', letterSpacing: 4 },
  { name: '副标题', fontFamily: 'Microsoft YaHei, sans-serif', fontSize: 28, color: '#ffd93d', fontWeight: 'normal', letterSpacing: 2 },
  { name: '正文', fontFamily: 'SimSun, serif', fontSize: 18, color: '#ffffff', fontWeight: 'normal', letterSpacing: 0 },
  { name: '金色大字', fontFamily: 'Microsoft YaHei, sans-serif', fontSize: 72, color: '#ffd700', fontWeight: 'bold', letterSpacing: 8 },
  { name: '描边白字', fontFamily: 'SimHei, sans-serif', fontSize: 36, color: '#ffffff', strokeColor: '#000000', hasStroke: true, strokeWidth: 2 },
  { name: '发光字', fontFamily: 'Microsoft YaHei, sans-serif', fontSize: 40, color: '#00ffff', hasShadow: true, shadowColor: '#00ffff', shadowBlur: 10, shadowOffsetY: 2 },
]

// 计算属性
const selectedElement = computed(() => {
  return elements.value.find(el => el.id === selectedElementId.value)
})

const canvasWrapperStyle = computed(() => ({
  width: `${CANVAS_WIDTH}px`,
  height: `${CANVAS_HEIGHT}px`,
  transform: `scale(${scale.value})`,
  transformOrigin: 'center center'
}))

const backgroundStyle = computed(() => {
  if (background.type === 'color') {
    return { backgroundColor: background.value }
  } else if (background.type === 'gradient') {
    return { background: background.value }
  } else if (background.type === 'image') {
    return {
      backgroundImage: `url(${background.value})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center'
    }
  }
  return {}
})

// 生成唯一ID
function generateId() {
  return 'el_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
}

// 获取元素名称
function getElementName(el) {
  if (el.type === 'text') {
    const text = el.content ? el.content.replace(/<[^>]*>/g, '').substring(0, 10) : '文字'
    return text.length > 10 ? text + '...' : text
  } else if (el.type === 'image') {
    return '图片'
  } else if (el.type === 'shape') {
    return el.shape === 'circle' ? '圆形' : '矩形'
  }
  return '元素'
}

// 删除元素（通过ID）
function deleteElementById(id) {
  const index = elements.value.findIndex(el => el.id === id)
  if (index > -1) {
    elements.value.splice(index, 1)
    if (selectedElementId.value === id) {
      selectedElementId.value = null
    }
    ElMessage.success('元素已删除')
  }
}

// 切换粗体
function toggleBold() {
  if (selectedElement.value) {
    selectedElement.value.fontWeight = selectedElement.value.fontWeight === 'bold' ? 'normal' : 'bold'
    updateElement()
  }
}

// 切换斜体
function toggleItalic() {
  if (selectedElement.value) {
    selectedElement.value.fontStyle = selectedElement.value.fontStyle === 'italic' ? 'normal' : 'italic'
    updateElement()
  }
}

// 切换下划线
function toggleUnderline() {
  if (selectedElement.value) {
    selectedElement.value.textDecoration = selectedElement.value.textDecoration === 'underline' ? 'none' : 'underline'
    updateElement()
  }
}

// 设置文字对齐
function setTextAlign(align) {
  if (selectedElement.value) {
    selectedElement.value.textAlign = align
    updateElement()
  }
}

// 应用文字预设
function applyTextPreset(preset) {
  if (selectedElement.value && selectedElement.value.type === 'text') {
    Object.assign(selectedElement.value, {
      fontFamily: preset.fontFamily,
      fontSize: preset.fontSize,
      color: preset.color,
      fontWeight: preset.fontWeight || 'normal',
      fontStyle: preset.fontStyle || 'normal',
      letterSpacing: preset.letterSpacing || 0,
      textDecoration: preset.textDecoration || 'none',
      hasStroke: preset.hasStroke || false,
      strokeColor: preset.strokeColor || '#000000',
      strokeWidth: preset.strokeWidth || 2,
      hasShadow: preset.hasShadow || false,
      shadowColor: preset.shadowColor || '#000000',
      shadowBlur: preset.shadowBlur || 5,
      shadowOffsetY: preset.shadowOffsetY || 2
    })
    updateElement()
    ElMessage.success('已应用预设样式')
  }
}

// AI 生成背景
async function generateAIBackground() {
  if (!aiPrompt.value.trim()) {
    ElMessage.warning('请输入图片描述')
    return
  }

  aiGenerating.value = true
  try {
    // 调用云函数生成图片
    const { callFunction } = await import('../../utils/cloud')
    const res = await callFunction('generateAIImage', {
      action: 'generateCustomImage',
      prompt: `${aiPrompt.value}，${aiStyle.value}风格，足球主题，高清，无文字`,
      aspect_ratio: '2:3'
    })

    if (res && res.success && res.data && res.data.image_url) {
      background.type = 'image'
      background.value = res.data.image_url
      ElMessage.success('背景生成成功！')
    } else {
      ElMessage.error('生成失败，请重试')
    }
  } catch (err) {
    console.error('AI生成失败:', err)
    ElMessage.error('生成失败: ' + (err.message || '未知错误'))
  } finally {
    aiGenerating.value = false
  }
}

// 处理图片上传
function handleImageUpload(file) {
  const url = URL.createObjectURL(file.raw)
  background.type = 'image'
  background.value = url
  ElMessage.success('背景上传成功！')
}

// 选择模板
function selectTemplate(index) {
  selectedTemplate.value = index
  background.type = 'gradient'
  background.value = templates[index].gradient
}

// 添加文字元素
function addTextElement() {
  const el = {
    id: generateId(),
    type: 'text',
    content: '双击编辑文字',
    x: CANVAS_WIDTH / 2 - 100,
    y: CANVAS_HEIGHT / 2,
    width: 200,
    height: 50,
    fontSize: 32,
    fontFamily: 'Microsoft YaHei, sans-serif',
    fontWeight: 'normal',
    fontStyle: 'normal',
    textDecoration: 'none',
    color: '#ffffff',
    letterSpacing: 0,
    lineHeight: 1.2,
    textAlign: 'center',
    hasStroke: false,
    strokeColor: '#000000',
    strokeWidth: 2,
    hasShadow: false,
    shadowColor: '#000000',
    shadowBlur: 5,
    shadowOffsetY: 2,
    rotation: 0,
    opacity: 1
  }
  elements.value.push(el)
  selectedElementId.value = el.id
  ElMessage.success('已添加文字元素')
}

// 添加图片元素
function addImageElement() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.onchange = (e) => {
    const file = e.target.files[0]
    if (file) {
      const url = URL.createObjectURL(file)
      const el = {
        id: generateId(),
        type: 'image',
        src: url,
        x: CANVAS_WIDTH / 2 - 75,
        y: CANVAS_HEIGHT / 2 - 75,
        width: 150,
        height: 150,
        rotation: 0,
        opacity: 1
      }
      elements.value.push(el)
      selectedElementId.value = el.id
      ElMessage.success('已添加图片元素')
    }
  }
  input.click()
}

// 添加形状元素
function addShapeElement(shape) {
  const el = {
    id: generateId(),
    type: 'shape',
    shape: shape,
    x: CANVAS_WIDTH / 2 - 50,
    y: CANVAS_HEIGHT / 2 - 50,
    width: 100,
    height: shape === 'circle' ? 100 : 100,
    fill: '#4a90d9',
    rotation: 0,
    opacity: 0.8
  }
  elements.value.push(el)
  selectedElementId.value = el.id
  ElMessage.success(`已添加${shape === 'circle' ? '圆形' : '矩形'}元素`)
}

// 获取元素样式
function getElementStyle(el) {
  const style = {
    left: `${el.x}px`,
    top: `${el.y}px`,
    width: `${el.width}px`,
    height: `${el.height}px`,
    transform: `rotate(${el.rotation || 0}deg)`,
    opacity: el.opacity || 1
  }

  // 文字元素特殊样式
  if (el.type === 'text') {
    if (el.fontFamily && el.fontFamily !== '默认') {
      style.fontFamily = el.fontFamily
    }
    style.fontSize = `${el.fontSize || 32}px`
    style.color = el.color || '#ffffff'
    style.fontWeight = el.fontWeight || 'normal'
    style.fontStyle = el.fontStyle || 'normal'
    style.textDecoration = el.textDecoration || 'none'
    style.letterSpacing = `${el.letterSpacing || 0}px`
    style.lineHeight = el.lineHeight || 1.2
    style.textAlign = el.textAlign || 'center'

    // 描边效果
    if (el.hasStroke && el.strokeColor) {
      style.WebkitTextStroke = `${el.strokeWidth || 2}px ${el.strokeColor}`
      style.paintOrder = 'stroke fill'
    }

    // 阴影效果
    if (el.hasShadow) {
      style.textShadow = `${el.shadowOffsetY || 2}px ${el.shadowOffsetY || 2}px ${el.shadowBlur || 5}px ${el.shadowColor || '#000000'}`
    }
  }

  return style
}

// 更新元素
function updateElement() {
  // 触发响应式更新
  selectedElementId.value = selectedElementId.value
}

// 更新文字内容
function updateElementText(el, event) {
  el.content = event.target.innerHTML
}

// 元素鼠标按下 - 开始拖拽
function handleElementMouseDown(event, el) {
  selectedElementId.value = el.id
  isDragging.value = true
  dragStart.value = {
    x: event.clientX - el.x,
    y: event.clientY - el.y
  }
}

// 画布鼠标按下
function handleCanvasMouseDown(event) {
  if (event.target.classList.contains('canvas-wrapper') || event.target.classList.contains('canvas-background')) {
    selectedElementId.value = null
  }
}

// 鼠标移动
function handleCanvasMouseMove(event) {
  if (!selectedElementId.value) return
  const el = selectedElement.value
  if (!el) return

  if (isDragging.value) {
    el.x = event.clientX - dragStart.value.x
    el.y = event.clientY - dragStart.value.y
  } else if (isResizing.value) {
    handleResize(event, el)
  } else if (isRotating.value) {
    handleRotate(event, el)
  }
}

// 鼠标释放
function handleCanvasMouseUp() {
  isDragging.value = false
  isResizing.value = false
  isRotating.value = false
}

// 开始缩放
function startResize(event, el, handle) {
  isResizing.value = true
  resizeHandle.value = handle
  dragStart.value = { x: event.clientX, y: event.clientY }
  // 保存元素的初始状态
  dragStart.value.initialFontSize = el.fontSize || 32
  dragStart.value.initialWidth = el.width
  dragStart.value.initialHeight = el.height
  dragStart.value.initialX = el.x
  dragStart.value.initialY = el.y
}

// 开始旋转
function startRotate(event, el) {
  isRotating.value = true
  const rect = event.target.closest('.canvas-element').getBoundingClientRect()
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2

  dragStart.value = {
    centerX,
    centerY,
    startAngle: Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180 / Math.PI,
    startRotation: el.rotation || 0
  }
}

// 处理缩放
function handleResize(event, el) {
  const dx = event.clientX - dragStart.value.x
  const dy = event.clientY - dragStart.value.y

  // 文字元素：拖动控制点调整字号
  if (el.type === 'text') {
    // 使用对角线距离变化来调整字号
    const distance = Math.sqrt(dx * dx + dy * dy)
    const direction = resizeHandle.value.includes('right') || resizeHandle.value.includes('bottom') ? 1 : -1
    const sizeChange = Math.round(distance * direction * 0.5)
    el.fontSize = Math.max(12, Math.min(120, dragStart.value.initialFontSize + sizeChange))
    updateElement()
    return
  }

  // 其他元素（图片、形状）：缩放元素
  if (resizeHandle.value.includes('right')) {
    el.width = Math.max(20, el.width + dx)
  }
  if (resizeHandle.value.includes('left')) {
    const newWidth = Math.max(20, el.width - dx)
    el.x += el.width - newWidth
    el.width = newWidth
  }
  if (resizeHandle.value.includes('bottom')) {
    el.height = Math.max(20, el.height + dy)
  }
  if (resizeHandle.value.includes('top')) {
    const newHeight = Math.max(20, el.height - dy)
    el.y += el.height - newHeight
    el.height = newHeight
  }

  dragStart.value = { x: event.clientX, y: event.clientY }
}

// 处理旋转
function handleRotate(event, el) {
  const angle = Math.atan2(
    event.clientY - dragStart.value.centerY,
    event.clientX - dragStart.value.centerX
  ) * 180 / Math.PI
  el.rotation = dragStart.value.startRotation + (angle - dragStart.value.startAngle)
}

// 层级操作
function moveLayerUp() {
  const index = elements.value.findIndex(el => el.id === selectedElementId.value)
  if (index < elements.value.length - 1) {
    const temp = elements.value[index]
    elements.value[index] = elements.value[index + 1]
    elements.value[index + 1] = temp
  }
}

function moveLayerDown() {
  const index = elements.value.findIndex(el => el.id === selectedElementId.value)
  if (index > 0) {
    const temp = elements.value[index]
    elements.value[index] = elements.value[index - 1]
    elements.value[index - 1] = temp
  }
}

function moveLayerTop() {
  const index = elements.value.findIndex(el => el.id === selectedElementId.value)
  if (index < elements.value.length - 1) {
    const el = elements.value.splice(index, 1)[0]
    elements.value.push(el)
  }
}

function moveLayerBottom() {
  const index = elements.value.findIndex(el => el.id === selectedElementId.value)
  if (index > 0) {
    const el = elements.value.splice(index, 1)[0]
    elements.value.unshift(el)
  }
}

// 删除元素
function deleteElement() {
  const index = elements.value.findIndex(el => el.id === selectedElementId.value)
  if (index > -1) {
    elements.value.splice(index, 1)
    selectedElementId.value = null
    ElMessage.success('元素已删除')
  }
}

// 缩放控制
function zoomIn() {
  scale.value = Math.min(3, scale.value + 0.1)
}

function zoomOut() {
  scale.value = Math.max(0.3, scale.value - 0.1)
}

function resetZoom() {
  scale.value = 1
}

// 导出海报
async function exportPoster() {
  exporting.value = true
  try {
    await nextTick()

    const wrapper = document.querySelector('.canvas-wrapper')
    if (!wrapper) throw new Error('找不到画布')

    // 使用 html2canvas 导出
    const { default: html2canvas } = await import('html2canvas')

    const canvas = await html2canvas(wrapper, {
      backgroundColor: null,
      scale: 2,
      useCORS: true,
      allowTaint: true
    })

    // 下载
    const link = document.createElement('a')
    link.download = `海报_${Date.now()}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()

    ElMessage.success('海报导出成功！')
  } catch (err) {
    console.error('导出失败:', err)
    ElMessage.error('导出失败: ' + err.message)
  } finally {
    exporting.value = false
  }
}

// 保存模板
function saveTemplate() {
  const template = {
    background: { ...background },
    elements: elements.value.map(el => ({ ...el })),
    canvasSize: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
    savedAt: new Date().toISOString()
  }

  const json = JSON.stringify(template, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const link = document.createElement('a')
  link.download = `海报模板_${Date.now()}.json`
  link.href = URL.createObjectURL(blob)
  link.click()

  ElMessage.success('模板已保存！')
}

// 生命周期
onMounted(() => {
  // 添加键盘事件
  document.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
})

// 键盘快捷键
function handleKeyDown(e) {
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (selectedElementId.value && !document.activeElement.isContentEditable) {
      deleteElement()
    }
  }
}
</script>

<style scoped>
.poster-editor {
  display: flex;
  height: calc(100vh - 60px);
  background: #f5f7fa;
}

.editor-left {
  width: 280px;
  background: #fff;
  border-right: 1px solid #e4e7ed;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.left-tabs {
  flex: 1;
}

.panel-section {
  padding: 16px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 12px;
}

.style-presets {
  margin: 12px 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.preset-label {
  font-size: 13px;
  color: #606266;
}

.generate-btn {
  width: 100%;
  margin-top: 12px;
}

.upload-icon {
  font-size: 40px;
  color: #909399;
}

.upload-text {
  color: #606266;
  font-size: 14px;
  line-height: 1.5;
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.template-item {
  cursor: pointer;
  border: 2px solid transparent;
  border-radius: 8px;
  overflow: hidden;
  transition: all 0.3s;
}

.template-item:hover {
  border-color: #409eff;
}

.template-item.active {
  border-color: #409eff;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.2);
}

.template-preview {
  height: 80px;
}

.template-name {
  display: block;
  padding: 8px;
  text-align: center;
  font-size: 12px;
  background: #f5f7fa;
}

.add-elements {
  padding: 16px;
  border-top: 1px solid #e4e7ed;
  background: #fafafa;
}

.element-buttons {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.element-buttons .el-button {
  font-size: 12px;
}

/* 画布区域 */
.editor-canvas-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: #e5e7eb;
  overflow: auto;
}

.canvas-container {
  overflow: auto;
  max-width: 100%;
  max-height: 100%;
}

.canvas-wrapper {
  position: relative;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  transition: transform 0.2s;
}

.canvas-background {
  position: absolute;
  width: 100%;
  height: 100%;
  left: 0;
  top: 0;
}

.canvas-element {
  position: absolute;
  cursor: move;
  user-select: none;
}

.canvas-element.selected {
  outline: 2px dashed #409eff;
}

.element-text {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  word-break: break-word;
  outline: none;
  text-align: center;
}

.element-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.element-shape {
  width: 100%;
  height: 100%;
}

.element-shape.circle {
  border-radius: 50%;
}

/* 控制点 */
.control-point {
  position: absolute;
  width: 12px;
  height: 12px;
  background: #fff;
  border: 2px solid #409eff;
  border-radius: 2px;
  z-index: 10;
  transition: all 0.2s;
}

.control-point:hover {
  background: #409eff;
  transform: scale(1.2);
}

/* 文字元素控制点特殊样式 - 表示可以调整字号 */
.canvas-element.selected .control-point {
  background: linear-gradient(135deg, #409eff, #67c23a);
  border-color: #67c23a;
}

.canvas-element.selected .control-point:hover {
  background: #67c23a;
  box-shadow: 0 0 8px rgba(103, 194, 58, 0.6);
}

.control-point.top-left { top: -6px; left: -6px; cursor: nw-resize; }
.control-point.top-right { top: -6px; right: -6px; cursor: ne-resize; }
.control-point.bottom-left { bottom: -6px; left: -6px; cursor: sw-resize; }
.control-point.bottom-right { bottom: -6px; right: -6px; cursor: se-resize; }

.rotate-handle {
  top: -30px;
  left: 50%;
  transform: translateX(-50%);
  border-radius: 50%;
  cursor: grab;
  display: flex;
  align-items: center;
  justify-content: center;
}

.rotate-handle:active {
  cursor: grabbing;
}

.zoom-controls {
  display: flex;
  gap: 12px;
  margin-top: 16px;
  align-items: center;
}

.zoom-label {
  min-width: 60px;
}

/* 右侧面板 */
.editor-right {
  width: 320px;
  background: #fff;
  border-left: 1px solid #e4e7ed;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

/* 图层列表 */
.elements-list-section {
  padding: 16px;
  border-bottom: 1px solid #e4e7ed;
}

.elements-list {
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
}

.element-list-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  cursor: pointer;
  border-bottom: 1px solid #f0f0f0;
  transition: background 0.2s;
}

.element-list-item:last-child {
  border-bottom: none;
}

.element-list-item:hover {
  background: #f5f7fa;
}

.element-list-item.selected {
  background: #ecf5ff;
  color: #409eff;
}

.element-list-item .el-icon {
  margin-right: 8px;
  font-size: 14px;
}

.element-name {
  flex: 1;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.element-list-item .delete-icon {
  opacity: 0;
  transition: opacity 0.2s;
  color: #f56c6c;
}

.element-list-item:hover .delete-icon {
  opacity: 1;
}

.no-elements {
  padding: 20px;
  text-align: center;
  color: #909399;
}

.no-elements .tip {
  font-size: 12px;
  margin-top: 4px;
}

/* 快捷样式工具栏 */
.style-toolbar {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.style-toolbar .el-button-group {
  display: flex;
}

/* 文字预设 */
.text-presets {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.text-preset-item {
  padding: 10px 8px;
  text-align: center;
  background: #f5f7fa;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 14px;
}

.text-preset-item:hover {
  border-color: #409eff;
  background: #ecf5ff;
}

/* 阴影选项 */
.shadow-options {
  margin-top: 8px;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 4px;
}

.shadow-offset {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.shadow-offset span {
  font-size: 12px;
  color: #606266;
}

.shadow-offset .el-input-number {
  width: 80px;
}

.property-group {
  margin-bottom: 16px;
}

.property-group label {
  display: block;
  font-size: 13px;
  color: #606266;
  margin-bottom: 8px;
}

.color-input-wrapper {
  display: flex;
  gap: 8px;
  align-items: center;
}

.color-input-wrapper .el-color-picker {
  flex-shrink: 0;
}

.position-inputs,
.size-inputs {
  display: flex;
  gap: 12px;
}

.pos-item,
.size-item {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
}

.pos-item span,
.size-item span {
  font-size: 13px;
  color: #909399;
  flex-shrink: 0;
}

.layer-buttons {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.no-selection {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #909399;
  gap: 16px;
}

.export-section {
  padding: 16px;
  border-top: 1px solid #e4e7ed;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.export-section .el-button {
  width: 100%;
}
</style>
