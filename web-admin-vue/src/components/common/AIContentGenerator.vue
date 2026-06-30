<template>
  <div class="ai-content-generator">
    <el-button 
      :type="buttonType" 
      :size="buttonSize"
      :loading="generating"
      @click="handleGenerate"
      :icon="Magic"
    >
      {{ buttonText }}
    </el-button>
    
    <el-dialog
      v-model="dialogVisible"
      title="AI 生成内容"
      width="600px"
      destroy-on-close
    >
      <div v-if="generatedContent" class="generated-content">
        <el-input
          v-model="generatedContent"
          type="textarea"
          :rows="8"
          resize="none"
        />
      </div>
      <div v-else-if="generating" class="generating-tip">
        <el-icon class="loading"><Loading /></el-icon>
        <span>AI 正在生成内容，请稍候...</span>
      </div>
      
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleUse" :disabled="!generatedContent">
          使用此内容
        </el-button>
        <el-button @click="handleRegenerate" :loading="generating">
          重新生成
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Magic, Loading } from '@element-plus/icons-vue'
import { generateMatchReport, generatePlayerAnalysis, generateTournamentIntro, generateCustomContent } from '@/utils/ai'

const props = defineProps({
  type: {
    type: String,
    required: true,
    validator: (value) => ['matchReport', 'playerAnalysis', 'tournamentIntro', 'custom'].includes(value)
  },
  data: {
    type: Object,
    default: () => ({})
  },
  prompt: {
    type: String,
    default: ''
  },
  buttonType: {
    type: String,
    default: 'primary'
  },
  buttonSize: {
    type: String,
    default: 'default'
  },
  buttonText: {
    type: String,
    default: 'AI 生成'
  }
})

const emit = defineEmits(['success'])

const dialogVisible = ref(false)
const generating = ref(false)
const generatedContent = ref('')

async function handleGenerate() {
  dialogVisible.value = true
  await doGenerate()
}

async function doGenerate() {
  generating.value = true
  generatedContent.value = ''
  
  try {
    let result
    
    switch (props.type) {
      case 'matchReport':
        result = await generateMatchReport(props.data)
        break
      case 'playerAnalysis':
        result = await generatePlayerAnalysis(props.data)
        break
      case 'tournamentIntro':
        result = await generateTournamentIntro(props.data)
        break
      case 'custom':
        result = await generateCustomContent(props.prompt, props.data.contentType)
        break
    }
    
    if (result.success) {
      generatedContent.value = result.data.content
    } else {
      ElMessage.error(result.message || '生成失败')
    }
  } catch (err) {
    console.error('AI 生成失败:', err)
    ElMessage.error('AI 生成失败')
  } finally {
    generating.value = false
  }
}

function handleRegenerate() {
  doGenerate()
}

function handleUse() {
  emit('success', generatedContent.value)
  dialogVisible.value = false
}
</script>

<style scoped>
.ai-content-generator {
  display: inline-block;
}

.generating-tip {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: #666;
  gap: 10px;
}

.loading {
  animation: rotating 2s linear infinite;
}

@keyframes rotating {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.generated-content {
  padding: 10px 0;
}
</style>
