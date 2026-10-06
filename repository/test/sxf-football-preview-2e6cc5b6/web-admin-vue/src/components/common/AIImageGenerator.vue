<template>
  <div class="ai-image-generator">
    <el-button
      type="primary"
      :loading="generating"
      :disabled="generating"
      plain
      size="small"
      @click="handleGenerate"
    >
      <el-icon v-if="!generating"><MagicStick /></el-icon>
      {{ generating ? '生成中...' : buttonText }}
    </el-button>

    <!-- 预览对话框 -->
    <el-dialog
      v-model="showPreview"
      title="AI生成预览"
      width="420px"
      :close-on-click-modal="false"
    >
      <div class="preview-content">
        <!-- 海报类型显示自定义描述输入框 -->
        <div v-if="props.type === 'tournamentPoster'" class="custom-prompt-section">
          <el-input
            v-model="customPrompt"
            type="textarea"
            :rows="3"
            placeholder="描述你想要的海报风格：例如：热血激情风格，火焰特效，红黑色调，球员庆祝动作..."
            :disabled="generating"
          />
          <el-button 
            v-if="!generating && !generatedUrl" 
            type="primary" 
            size="small" 
            @click="handleGenerateWithPrompt"
            style="margin-top: 8px;"
          >
            开始生成
          </el-button>
        </div>
        
        <div class="preview-image" :class="{ 'poster-ratio': props.type === 'tournamentPoster', 'logo-ratio': props.type === 'teamLogo' || props.type === 'tournamentLogo' }" v-if="generatedUrl">
          <img :src="generatedUrl" alt="预览" />
        </div>
        <div class="preview-loading" v-else-if="generating">
          <el-icon class="is-loading" :size="48"><Loading /></el-icon>
          <p>AI正在创作中，请稍候...</p>
          <p class="hint">生成大约需要10-20秒</p>
        </div>
      </div>
      <template #footer>
        <el-button @click="showPreview = false">取消</el-button>
        <el-button type="primary" :disabled="!generatedUrl" @click="handleConfirm">
          使用此图片
        </el-button>
        <el-button :disabled="generating" @click="handleRegenerate">
          重新生成
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { MagicStick, Loading } from '@element-plus/icons-vue'
import { callFunction } from '../../utils/cloud'

const props = defineProps({
  // 生成类型: 'teamLogo' | 'tournamentLogo' | 'tournamentPoster' | 'avatar'
  type: {
    type: String,
    default: 'teamLogo'
  },
  // 名称（用于生成更准确的图片）
  name: {
    type: String,
    default: ''
  },
  // 球队颜色（teamLogo时使用）
  color: {
    type: String,
    default: 'blue'
  },
  // 位置（avatar时使用）
  position: {
    type: String,
    default: 'MF'
  },
  // 性别（avatar时使用）
  gender: {
    type: String,
    default: 'male'
  },
  // 按钮文字
  buttonText: {
    type: String,
    default: 'AI生成'
  },
  // 额外数据（poster等复杂类型使用）
  extraData: {
    type: Object,
    default: () => ({})
  }
})

const emit = defineEmits(['success'])

const generating = ref(false)
const showPreview = ref(false)
const generatedUrl = ref('')
const customPrompt = ref('')

// 根据类型获取action
function getAction() {
  switch (props.type) {
    case 'tournamentLogo':
      return 'generateTournamentLogo'
    case 'tournamentPoster':
      return 'generateTournamentPoster'
    case 'avatar':
      return 'generateAvatar'
    default:
      return 'generateTeamLogo'
  }
}

// 构建AI生图提示词
function buildPrompt(action, params, customDesc = '') {
  switch (action) {
    case 'generateTournamentPoster': {
      // 使用用户自定义描述（支持中文）或默认风格
      const userDesc = customDesc && customDesc.trim() ? customDesc.trim() : ''
      
      // 基础提示词，包含赛事信息
      const baseInfo = `${params.tournamentName}足球赛事海报，${params.startDate || ''} ${params.location || ''}`
      
      if (userDesc) {
        // 用户提供了自定义描述，追加到基础信息
        return `${baseInfo}，${userDesc}，竖版9比16格式，高清画质，专业设计`
      }
      
      // 默认风格模板（中文）
      const styleTemplates = [
        `动感足球风格，${baseInfo}，球员射门剪影，球场灯光背景，橙蓝渐变配色，运动模糊效果，专业体育广告设计，竖版9比16格式`,
        `冠军奖杯风格，${baseInfo}，金色奖杯闪耀，彩带飘落，观众欢呼，红金配色主题，胜利庆祝氛围，电影级海报设计，竖版9比16格式`,
        `球队对决风格，${baseInfo}，两支球队对峙，火焰足球居中，聚光灯效果，绿茵场元素，激烈竞技主题，竖版9比16格式`,
        `现代简约风格，${baseInfo}，几何足球图案，简洁排版，蓝白配色方案，抽象球员剪影，当代体育设计，竖版9比16格式`,
        `热血激情风格，${baseInfo}，精彩射门瞬间，球迷欢呼背景，红黑配色，动态对角线构图，戏剧性体育摄影风格，竖版9比16格式`
      ]
      
      return styleTemplates[Math.floor(Math.random() * styleTemplates.length)]
    }
    
    case 'generateTournamentLogo':
      return `Championship tournament logo for "${params.tournamentName}", elegant trophy cup with golden finish, laurel wreath decorations, royal blue and gold color theme, ornate banner ribbon, sophisticated sports event branding, white background, flat minimalist style`
    
    case 'generateTeamLogo': {
      const colorMap = {
        'red': 'crimson red and gold',
        'blue': 'royal blue and silver',
        'green': 'emerald green and white',
        'yellow': 'golden yellow and black',
        'purple': 'deep purple and gold',
        'orange': 'vibrant orange and white',
        'black': 'black and white',
        'white': 'white and navy blue'
      }
      const colorText = colorMap[params.teamColor] || 'blue and silver'
      return `Football club "${params.teamName}" emblem, ${colorText} colors, flat minimalist shield badge, single star at top, bold typography, white background, clean vector style`
    }
    
    case 'generateAvatar': {
      const genderText = params.gender === 'female' ? 'female' : 'male'
      const positionText = {
        'GK': 'goalkeeper',
        'DF': 'defender',
        'MF': 'midfielder',
        'FW': 'forward'
      }[params.position] || 'football player'
      return `Professional ${genderText} football player ID photo, ${positionText}, white plain background, 1:1 square ratio, flat minimalist style, half body portrait, team jersey, sharp focus, high quality`
    }
    
    default:
      return 'A beautiful football related image'
  }
}

// 生成参数
function getParams() {
  const base = {}
  switch (props.type) {
    case 'tournamentLogo':
      base.tournamentName = props.name || 'Football Tournament'
      break
    case 'tournamentPoster':
      base.tournamentName = props.name || 'Football Tournament'
      base.tournamentType = props.extraData?.type || 'tournament'
      base.startDate = props.extraData?.startDate || ''
      base.location = props.extraData?.location || ''
      break
    case 'avatar':
      base.name = props.name || 'Player'
      base.position = props.position
      base.gender = props.gender
      break
    default:
      base.teamName = props.name || 'Team'
      base.teamColor = props.color || 'blue'
  }
  return base
}

async function handleGenerate() {
  // 海报类型先显示对话框让用户输入描述
  if (props.type === 'tournamentPoster') {
    showPreview.value = true
    generatedUrl.value = ''
    customPrompt.value = ''
    return
  }
  
  await handleGenerateWithPrompt()
}

async function handleGenerateWithPrompt() {
  generating.value = true
  generatedUrl.value = ''

  try {

    const action = getAction()
    const params = getParams()
    
    // 调用我们自己的 generateAIImage 云函数
    const res = await callFunction('generateAIImage', {
      action: action,
      name: params.name || params.teamName || params.tournamentName || 'Default',
      position: params.position,
      gender: params.gender,
      teamName: params.teamName,
      teamColor: params.teamColor,
      tournamentName: params.tournamentName,
      tournamentType: params.tournamentType,
      startDate: params.startDate,
      location: params.location,
      // 海报自定义描述
      customDesc: customPrompt.value
    })


    // 处理 generateAIImage 云函数返回格式
    
    let imageUrl = null
    if (res && res.success && res.data) {
      imageUrl = res.data.url
    }
    
    if (imageUrl) {
      generatedUrl.value = imageUrl
      ElMessage.success('生成成功')
    } else {
      console.error('[AI生图] 生成失败，返回数据:', JSON.stringify(res))
      // 检查是否有错误信息
      const errorMsg = res?.message || res?.errMsg || '生成失败，请重试'
      ElMessage.error(errorMsg)
      showPreview.value = false
    }
  } catch (err) {
    console.error('[AI生图] 异常:', err)
    const errorMsg = err.message || err.errMsg || '未知错误'
    ElMessage.error('生成失败: ' + errorMsg)
    showPreview.value = false
  } finally {
    generating.value = false
  }
}

async function handleRegenerate() {
  await handleGenerateWithPrompt()
}

function handleConfirm() {
  if (generatedUrl.value) {
    emit('success', generatedUrl.value)
    showPreview.value = false
    ElMessage.success('已应用AI生成的图片')
  }
}
</script>

<style scoped>
.preview-content {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  min-height: 300px;
}

.custom-prompt-section {
  width: 100%;
  margin-bottom: 16px;
}

.preview-image {
  width: 100%;
  max-width: 300px;
}

/* 海报竖版比例 */
.preview-image.poster-ratio {
  max-width: 240px;
  max-height: 426px;
}

.preview-image.poster-ratio img {
  aspect-ratio: 9/16;
  object-fit: cover;
}

.preview-image img {
  width: 100%;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

/* Logo/队徽 1:1 正方形比例 */
.preview-image.logo-ratio {
  max-width: 280px;
  max-height: 280px;
}

.preview-image.logo-ratio img {
  aspect-ratio: 1/1;
  object-fit: cover;
  border-radius: 12px;
}

.preview-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: #909399;
  padding: 40px 0;
}

.preview-loading p {
  margin: 0;
  font-size: 14px;
}

.preview-loading .hint {
  font-size: 12px;
  color: #c0c4cc;
}
</style>
