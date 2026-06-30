<template>
  <div class="team-management">
    <!-- 操作栏 -->
    <div class="section-header">
      <h3>球队管理</h3>
      <div class="header-actions">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索球队名称/编号"
          prefix-icon="Search"
          clearable
          style="width: 250px; margin-right: 12px;"
          @input="handleSearch"
        />
        <el-button type="primary" @click="showTeamDialog()">
          <el-icon><Plus /></el-icon>添加球队
        </el-button>
      </div>
    </div>

    <!-- 统计信息 -->
    <div class="stats-bar">
      <span>总球队数: <strong>{{ totalTeams }}</strong></span>
      <span>已审核: <strong>{{ approvedTeams }}</strong></span>
      <span>待审核: <strong>{{ pendingTeams }}</strong></span>
    </div>

    <!-- 球队表格 -->
    <el-table :data="filteredTeams" v-loading="loading" border style="width: 100%">
      <el-table-column type="index" width="60" label="序号" />
      <el-table-column label="队徽" width="80">
        <template #default="{ row }">
          <img :src="row.logo || '/default-team-logo.png'" class="team-logo-small" />
        </template>
      </el-table-column>
      <el-table-column prop="name" label="球队名称" min-width="150" />
      <el-table-column prop="teamCode" label="球队编号" width="120" />
      <el-table-column prop="shortName" label="简称" width="100" />
      <el-table-column prop="establishedDate" label="成立时间" width="120" />
      <el-table-column label="来源" width="100" align="center">
        <template #default="{ row }">
          <el-tag v-if="row.source === 'tournament_center'" type="success" size="small">赛事中心</el-tag>
          <el-tag v-else type="primary" size="small">赛小蜂</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="认领状态" width="100" align="center">
        <template #default="{ row }">
          <template v-if="row.source === 'tournament_center'">
            <el-tag v-if="row.claimStatus === 'claimed'" type="success" size="small">已认领</el-tag>
            <el-tag v-else type="warning" size="small">待认领</el-tag>
          </template>
          <el-tag v-else type="info" size="small">个人</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="ownerPhone" label="所属手机号" width="140" />
      <el-table-column label="球员数" width="80" align="center">
        <template #default="{ row }">
          <el-tag size="small">{{ row.playerCount || 0 }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="240" fixed="right">
        <template #default="{ row }">
          <el-button type="primary" link @click="viewTeamDetail(row)">查看</el-button>
          <el-button type="primary" link @click="showTeamDialog(row)">编辑</el-button>
          <el-button type="danger" link @click="deleteTeam(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 分页 -->
    <div class="pagination-wrapper">
      <el-pagination
        v-model:current-page="currentPage"
        :page-size="pageSize"
        :total="filteredTeams.length"
        layout="total, prev, pager, next"
        @current-change="handlePageChange"
      />
    </div>

    <!-- 球队表单弹窗（照搬赛小蜂管理后台样式） -->
    <el-dialog
      v-model="dialogVisible"
      :title="teamForm.id ? '编辑球队' : '创建球队'"
      width="560px"
      :close-on-click-modal="false"
    >
      <el-form :model="teamForm" label-width="90px" label-position="top">
        <el-form-item label="全称" required>
          <el-input v-model="teamForm.name" placeholder="请输入球队全称" maxlength="50" />
        </el-form-item>
        <el-form-item label="简称" required>
          <el-input v-model="teamForm.shortName" placeholder="请输入球队简称" maxlength="20" />
        </el-form-item>
        <el-form-item label="所属省份" required>
          <el-select v-model="teamForm.province" placeholder="选择省份" style="width: 100%" @change="onProvinceChange">
            <el-option v-for="p in provinceCodeMap" :key="p.code" :label="p.code + ' - ' + p.name" :value="p.code" />
          </el-select>
        </el-form-item>
        <el-form-item label="城市" required>
          <el-select v-model="teamForm.cityName" placeholder="先选择省份" style="width: 100%" @change="onCityChange">
            <template v-if="selectedCityList.length > 0">
              <el-option v-for="c in selectedCityList" :key="c.l" :label="c.n + ' (' + c.l + ')'" :value="c.l" />
            </template>
            <el-option v-if="selectedCityList.length === 0" disabled label="请先选择省份" value="" />
          </el-select>
        </el-form-item>
        <el-form-item label="队伍类型" required>
          <el-select v-model="teamForm.teamType" placeholder="选择队伍类型" style="width: 100%" @change="onTeamTypeChange">
            <el-option label="一线队" value="01" />
            <el-option label="二线队" value="02" />
            <el-option label="U8" value="08" />
            <el-option label="U9" value="09" />
            <el-option label="U10" value="10" />
            <el-option label="U11" value="11" />
            <el-option label="U12" value="12" />
            <el-option label="U13" value="13" />
            <el-option label="U14" value="14" />
            <el-option label="U15" value="15" />
            <el-option label="U16" value="16" />
            <el-option label="U17" value="17" />
            <el-option label="U18" value="18" />
          </el-select>
        </el-form-item>
        <el-form-item label="球队编号">
          <el-input v-model="teamForm.teamCode" placeholder="省份+城市字母+序号+类型，如226E00101" maxlength="9" />
        </el-form-item>
        <el-form-item label="绑定手机号">
          <el-input v-model="teamForm.ownerPhone" disabled placeholder="自动填充当前登录手机号" maxlength="11" />
          <span class="form-tip">自动绑定到当前账号，如需修改请联系赛事中心</span>
        </el-form-item>
        <el-form-item label="球队建立时间">
          <el-date-picker v-model="teamForm.establishedDate" type="date" placeholder="选择建立时间" style="width: 100%" value-format="YYYY-MM-DD" />
        </el-form-item>

        <el-form-item label="球队Logo">
          <div class="logo-upload-wrapper">
            <el-upload
              class="logo-uploader"
              :show-file-list="false"
              :before-upload="beforeLogoUpload"
              :http-request="handleLogoUpload"
              accept="image/*"
            >
              <el-button type="primary" :loading="uploadingLogo" size="small">
                <el-icon v-if="!uploadingLogo"><Upload /></el-icon>
                {{ uploadingLogo ? '上传中...' : '上传Logo' }}
              </el-button>
            </el-upload>
            <div class="logo-preview" v-if="teamForm.logo">
              <img :src="teamForm.logo" alt="Logo预览" />
              <span class="preview-tip">预览</span>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="球队简介">
          <el-input v-model="teamForm.description" type="textarea" :rows="3" placeholder="请输入球队简介" maxlength="200" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveTeam">
          {{ teamForm.id ? '保存' : '创建' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 队徽裁剪对话框 -->
    <ImageCropper
      v-model="showLogoCropper"
      :image-src="cropperImageSrc"
      @crop="handleLogoCropConfirm"
    />

    <!-- 球队详情弹窗 -->
    <el-dialog v-model="detailVisible" title="球队详情" width="800px">
      <div v-if="currentTeam" class="team-detail">
        <div class="detail-header">
          <img :src="currentTeam.logo || '/default-team-logo.png'" class="detail-logo" />
          <div class="detail-info">
            <h2>{{ currentTeam.name }}</h2>
            <p>编号: {{ currentTeam.teamCode }}</p>
            <p>简称: {{ currentTeam.shortName }}</p>
            <p>成立时间: {{ currentTeam.establishedDate || '未设置' }}</p>
          </div>
        </div>
        <div class="detail-body">
          <p><strong>球队简介:</strong> {{ currentTeam.description || '暂无' }}</p>
        </div>
        
        <div class="players-section">
          <h3>球员列表 ({{ currentTeamPlayers.length }}人)</h3>
          <el-table :data="currentTeamPlayers" border size="small">
            <el-table-column type="index" width="50" />
            <el-table-column prop="name" label="姓名" width="100" />
            <el-table-column prop="jerseyNumber" label="号码" width="60" />
            <el-table-column prop="position" label="位置" width="80" />
            <el-table-column prop="phone" label="电话" width="120" />
          </el-table>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search, Upload } from '@element-plus/icons-vue'
import { callFunction, uploadFileViaCloud, getCurrentOwner } from '@/utils/cloud'
import ImageCropper from '../../../components/common/ImageCropper.vue'

// 数据列表
const teams = ref([])
const loading = ref(false)
const saving = ref(false)
const searchKeyword = ref('')
const currentPage = ref(1)
const pageSize = ref(10)

// 统计
const totalTeams = ref(0)
const approvedTeams = ref(0)
const pendingTeams = ref(0)

// 弹窗
const dialogVisible = ref(false)
const detailVisible = ref(false)
const showLogoCropper = ref(false)
const cropperImageSrc = ref('')
const uploadingLogo = ref(false)
const currentTeam = ref(null)
const currentTeamPlayers = ref([])

// 表单
const teamForm = reactive({
  id: null,
  name: '',
  shortName: '',
  province: '',
  city: '',
  cityName: '',
  teamCode: '',
  teamType: '',
  logo: '',
  establishedDate: '',
  description: '',
  ownerPhone: '',
  status: 'pending'
})

// 省份代码表（照搬赛小蜂管理后台）
const provinceCodeMap = [{"code":"101","name":"上海"},{"code":"102","name":"天津"},{"code":"103","name":"重庆"},{"code":"104","name":"北京"},{"code":"201","name":"安徽"},{"code":"202","name":"福建"},{"code":"203","name":"甘肃"},{"code":"204","name":"广东"},{"code":"205","name":"广西"},{"code":"206","name":"贵州"},{"code":"207","name":"海南"},{"code":"208","name":"河北"},{"code":"209","name":"黑龙江"},{"code":"210","name":"湖北"},{"code":"211","name":"湖南"},{"code":"212","name":"吉林"},{"code":"213","name":"江苏"},{"code":"214","name":"辽宁"},{"code":"215","name":"江西"},{"code":"216","name":"内蒙古"},{"code":"217","name":"宁夏"},{"code":"218","name":"青海"},{"code":"219","name":"山东"},{"code":"220","name":"山西"},{"code":"221","name":"陕西"},{"code":"222","name":"四川"},{"code":"223","name":"新疆"},{"code":"224","name":"云南"},{"code":"225","name":"浙江"},{"code":"226","name":"河南"}]

// 省份城市车牌字母映射（照搬赛小蜂管理后台）
var cityLetterMap = {"101":[{"l":"A","n":"上海"},{"l":"B","n":"上海浦东"},{"l":"C","n":"上海郊区"},{"l":"D","n":"上海崇明"}],"102":[{"l":"A","n":"天津"},{"l":"B","n":"天津滨海"},{"l":"C","n":"天津郊区"}],"103":[{"l":"A","n":"重庆"},{"l":"B","n":"重庆涪陵"},{"l":"C","n":"重庆万州"}],"104":[{"l":"A","n":"北京"},{"l":"B","n":"北京城区"},{"l":"C","n":"北京郊区"},{"l":"Y","n":"北京延庆"}],"204":[{"l":"A","n":"广州"},{"l":"B","n":"深圳"},{"l":"C","n":"珠海"},{"l":"D","n":"汕头"},{"l":"E","n":"佛山"},{"l":"F","n":"韶关"},{"l":"G","n":"湛江"},{"l":"H","n":"肇庆"},{"l":"J","n":"江门"},{"l":"K","n":"茂名"},{"l":"L","n":"惠州"},{"l":"M","n":"梅州"},{"l":"N","n":"汕尾"},{"l":"P","n":"河源"},{"l":"Q","n":"阳江"},{"l":"R","n":"清远"},{"l":"S","n":"东莞"},{"l":"T","n":"中山"},{"l":"U","n":"潮州"},{"l":"V","n":"揭阳"},{"l":"W","n":"云浮"}],"208":[{"l":"A","n":"石家庄"},{"l":"B","n":"唐山"},{"l":"C","n":"秦皇岛"},{"l":"D","n":"邯郸"},{"l":"E","n":"邢台"},{"l":"F","n":"保定"},{"l":"G","n":"张家口"},{"l":"H","n":"承德"},{"l":"J","n":"沧州"},{"l":"K","n":"廊坊"},{"l":"L","n":"衡水"}],"210":[{"l":"A","n":"武汉"},{"l":"B","n":"黄石"},{"l":"C","n":"十堰"},{"l":"D","n":"荆州"},{"l":"E","n":"宜昌"},{"l":"F","n":"襄阳"},{"l":"G","n":"鄂州"},{"l":"H","n":"荆门"},{"l":"J","n":"黄冈"},{"l":"K","n":"孝感"},{"l":"L","n":"咸宁"},{"l":"M","n":"仙桃"},{"l":"N","n":"潜江"},{"l":"P","n":"神农架"},{"l":"Q","n":"恩施"}],"211":[{"l":"A","n":"长沙"},{"l":"B","n":"株洲"},{"l":"C","n":"湘潭"},{"l":"D","n":"衡阳"},{"l":"E","n":"邵阳"},{"l":"F","n":"岳阳"},{"l":"G","n":"常德"},{"l":"H","n":"益阳"},{"l":"J","n":"娄底"},{"l":"K","n":"郴州"},{"l":"L","n":"永州"},{"l":"M","n":"怀化"},{"l":"N","n":"湘西"}],"213":[{"l":"A","n":"南京"},{"l":"B","n":"无锡"},{"l":"C","n":"徐州"},{"l":"D","n":"常州"},{"l":"E","n":"苏州"},{"l":"F","n":"南通"},{"l":"G","n":"连云港"},{"l":"H","n":"淮安"},{"l":"J","n":"盐城"},{"l":"K","n":"扬州"},{"l":"L","n":"镇江"},{"l":"M","n":"泰州"},{"l":"N","n":"宿迁"}],"219":[{"l":"A","n":"济南"},{"l":"B","n":"青岛"},{"l":"C","n":"淄博"},{"l":"D","n":"枣庄"},{"l":"E","n":"东营"},{"l":"F","n":"烟台"},{"l":"G","n":"潍坊"},{"l":"H","n":"济宁"},{"l":"J","n":"泰安"},{"l":"K","n":"威海"},{"l":"L","n":"日照"},{"l":"M","n":"滨州"},{"l":"N","n":"德州"},{"l":"P","n":"聊城"},{"l":"Q","n":"临沂"},{"l":"R","n":"菏泽"},{"l":"S","n":"莱芜"}],"221":[{"l":"A","n":"西安"},{"l":"B","n":"铜川"},{"l":"C","n":"宝鸡"},{"l":"D","n":"咸阳"},{"l":"E","n":"渭南"},{"l":"F","n":"汉中"},{"l":"G","n":"安康"},{"l":"H","n":"商洛"},{"l":"J","n":"延安"},{"l":"K","n":"榆林"}],"222":[],"225":[{"l":"A","n":"杭州"},{"l":"B","n":"宁波"},{"l":"C","n":"温州"},{"l":"D","n":"绍兴"},{"l":"E","n":"湖州"},{"l":"F","n":"嘉兴"},{"l":"G","n":"金华"},{"l":"H","n":"衢州"},{"l":"J","n":"台州"},{"l":"K","n":"丽水"},{"l":"L","n":"舟山"}],"226":[{"l":"A","n":"郑州"},{"l":"B","n":"开封"},{"l":"C","n":"洛阳"},{"l":"D","n":"平顶山"},{"l":"E","n":"安阳"},{"l":"F","n":"鹤壁"},{"l":"G","n":"新乡"},{"l":"H","n":"焦作"},{"l":"J","n":"濮阳"},{"l":"K","n":"许昌"},{"l":"L","n":"漯河"},{"l":"M","n":"三门峡"},{"l":"N","n":"商丘"},{"l":"P","n":"周口"},{"l":"Q","n":"驻马店"},{"l":"R","n":"南阳"},{"l":"S","n":"信阳"},{"l":"U","n":"济源"}]}

// 当前省份对应的城市列表
const selectedCityList = ref([])

// 省份变更时重置城市和编号
function onProvinceChange() {
  teamForm.city = ''
  teamForm.cityName = ''
  teamForm.teamCode = ''
  selectedCityList.value = cityLetterMap[teamForm.province] || []
}

// 城市变更时自动生成编号
function onCityChange(val) {
  teamForm.city = val
  autoGenerateTeamCode()
}

// 队伍类型变更时自动生成编号
function onTeamTypeChange() {
  autoGenerateTeamCode()
}

// 自动生成球队编号（照搬赛小蜂逻辑）
function autoGenerateTeamCode() {
  if (teamForm.province && teamForm.city && teamForm.teamType) {
    var prefix = teamForm.province + teamForm.city
    var typeCode = teamForm.teamType
    var maxSeq = 0
    // 从已有球队列表中找最大序号
    if (teams.value && teams.value.length > 0) {
      teams.value.forEach(function(t) {
        if (t.teamCode && t.teamCode.startsWith(prefix)) {
          var num = parseInt(t.teamCode.substring(4, 7), 10)
          if (!isNaN(num) && num > maxSeq) maxSeq = num
        }
      })
    }
    var nextNum = (maxSeq + 1).toString().padStart(3, '0')
    teamForm.teamCode = prefix + nextNum + typeCode
  }
}

// 过滤后的球队列表
const filteredTeams = computed(() => {
  if (!searchKeyword.value) return teams.value
  const keyword = searchKeyword.value.toLowerCase()
  return teams.value.filter(t => 
    t.name?.toLowerCase().includes(keyword) ||
    t.teamCode?.toLowerCase().includes(keyword) ||
    t.shortName?.toLowerCase().includes(keyword)
  )
})

// 获取球队列表
async function fetchTeams() {
  loading.value = true
  try {
    const result = await callFunction('getTeams', {
      pageSize: 1000 // 获取所有球队
    })
    if (result.success) {
      teams.value = result.data || []
      totalTeams.value = teams.value.length
      approvedTeams.value = teams.value.filter(t => t.status === 'approved').length
      pendingTeams.value = teams.value.filter(t => t.status === 'pending').length
    } else {
      // 云函数不存在或返回空时优雅降级，不弹错误提示
      console.warn('获取球队列表返回失败:', result.message)
      teams.value = []
      totalTeams.value = 0
      approvedTeams.value = 0
      pendingTeams.value = 0
    }
  } catch (err) {
    // 云函数调用失败时优雅降级，不弹错误提示
    console.warn('获取球队列表失败:', err.message)
    teams.value = []
    totalTeams.value = 0
    approvedTeams.value = 0
    pendingTeams.value = 0
  } finally {
    loading.value = false
  }
}

// 搜索
function handleSearch() {
  currentPage.value = 1
}

// 翻页
function handlePageChange(page) {
  currentPage.value = page
}

// 表单默认值
const defaultTeamForm = {
  id: null,
  name: '',
  shortName: '',
  province: '',
  city: '',
  cityName: '',
  teamCode: '',
  teamType: '',
  logo: '',
  establishedDate: '',
  description: '',
  ownerPhone: '',
  status: 'pending'
}

// 显示表单弹窗
function showTeamDialog(team = null) {
  // 先重置表单
  Object.assign(teamForm, { ...defaultTeamForm })
  selectedCityList.value = []

  // ★ 新建时自动填入当前用户手机号
  if (!team) {
    teamForm.ownerPhone = getCurrentOwner() || ''
  }

  if (team) {
    // 编辑模式：回填所有字段（兼容 DB 字段名 provinceCode/cityCode）
    const teamId = team._id || team.id
    const prov = team.provinceCode || team.province || ''
    const cityVal = team.cityCode || team.city || ''
    Object.assign(teamForm, {
      id: teamId,
      name: team.name || '',
      shortName: team.shortName || '',
      province: prov,
      city: cityVal,
      cityName: cityVal,
      teamCode: team.teamCode || '',
      teamType: team.teamType || '',
      logo: team.logo || '',
      establishedDate: team.establishedDate || '',
      description: team.description || '',
      ownerPhone: team.ownerPhone || '',
      status: team.status || 'pending'
    })
    // 回填城市列表
    if (prov) {
      selectedCityList.value = cityLetterMap[prov] || []
    }
  }

  dialogVisible.value = true
}

// 上传前校验（2MB限制）
function beforeLogoUpload(file) {
  const isImage = file.type.startsWith('image/')
  if (!isImage) { ElMessage.error('只能上传图片文件'); return false }
  const isLt2M = file.size / 1024 / 1024 < 2
  if (!isLt2M) { ElMessage.error('图片大小不能超过 2MB'); return false }
  return true
}

// 读取文件并打开裁剪器
function handleLogoUpload(options) {
  const { file } = options
  const reader = new FileReader()
  reader.onload = (e) => {
    cropperImageSrc.value = e.target.result
    showLogoCropper.value = true
  }
  reader.readAsDataURL(file)
}

// 压缩图片（缩小尺寸 + JPEG压缩，避免 Base64 超云函数 payload 限制）
function compressImage(blob, maxSize = 400) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      let w = img.width, h = img.height
      if (w > maxSize || h > maxSize) {
        const ratio = Math.min(maxSize / w, maxSize / h)
        w = Math.round(w * ratio)
        h = Math.round(h * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, w, h)
      canvas.toBlob((compressed) => resolve(compressed), 'image/jpeg', 0.85)
    }
    img.src = URL.createObjectURL(blob)
  })
}

// 裁剪确认后上传
async function handleLogoCropConfirm(croppedBlob) {
  uploadingLogo.value = true
  try {
    const compressed = await compressImage(croppedBlob, 400)
    const cloudPath = `team-logos/${Date.now()}-logo.jpg`
    const result = await uploadFileViaCloud(cloudPath, compressed)
    if (result.success) {
      teamForm.logo = result.tempUrl
      ElMessage.success('Logo上传成功')
    } else {
      throw new Error(result.message || '上传失败')
    }
  } catch (err) {
    console.error('[队徽上传] 失败:', err)
    ElMessage.error('上传失败: ' + (err.message || '未知错误'))
  } finally {
    uploadingLogo.value = false
  }
}

// 保存球队
async function saveTeam() {
  if (!teamForm.name) {
    ElMessage.warning('请输入球队名称')
    return
  }
  if (!teamForm.shortName) {
    ElMessage.warning('请输入球队简称')
    return
  }
  if (!teamForm.province) {
    ElMessage.warning('请选择所属省份')
    return
  }
  if (!teamForm.cityName) {
    ElMessage.warning('请选择城市')
    return
  }

  saving.value = true
  try {
    const data = { ...teamForm }
    data.claimStatus = data.ownerPhone ? 'claimed' : 'unclaimed'
    data.source = 'tournament_center'   // ★ 来源标识
    if (data.id) {
      await callFunction('updateTeam', data)
      ElMessage.success('更新成功')
    } else {
      const result = await callFunction('createTeam', data)
      if (result.success) {
        teamForm.teamCode = result.data.teamCode
        ElMessage.success('添加成功，编号: ' + result.data.teamCode)
      }
    }
    dialogVisible.value = false
    fetchTeams()
  } catch (err) {
    console.error('保存球队失败:', err)
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

// 查看球队详情
async function viewTeamDetail(team) {
  currentTeam.value = team
  detailVisible.value = true
  
  // 获取该球队的球员
  try {
    const result = await callFunction('getPlayers', {
      teamId: team._id || team.id
    })
    if (result.success) {
      currentTeamPlayers.value = result.data || []
    }
  } catch (err) {
    console.error('获取球员列表失败:', err)
    currentTeamPlayers.value = []
  }
}

// 删除球队
async function deleteTeam(team) {
  try {
    // ★ 先查该球队下有多少球员
    let playerCount = team.playerCount || 0
    if (!playerCount) {
      try {
        const playersRes = await callFunction('getPlayers', { teamId: team._id || team.id })
        playerCount = (playersRes?.data || playersRes?.players || []).length
      } catch (e) { console.warn('[deleteTeam] 查询球员数失败:', e.message) }
    }

    let force = false
    let confirmMsg = `确定要删除球队"${team.name}"吗？`

    if (playerCount > 0) {
      force = true
      confirmMsg = `"${team.name}" 下有 ${playerCount} 名球员！\n\n删除球队将同时删除所有球员数据，是否继续？`
    }

    await ElMessageBox.confirm(confirmMsg, '提示', {
      type: 'warning',
      confirmButtonText: playerCount > 0 ? '强制删除（含球员）' : '确定删除',
      cancelButtonText: '取消'
    })

    const result = await callFunction('deleteTeam', { id: team._id || team.id, force })
    if (result.success) {
      ElMessage.success(result.message || '删除成功')
    } else {
      ElMessage.error(result.error || '删除失败')
    }
    fetchTeams()
  } catch {
    // 取消删除
  }
}

onMounted(() => {
  fetchTeams()
})
</script>

<style scoped>
.team-management {
  padding: 20px 0;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-header h3 {
  margin: 0;
  font-size: 18px;
  color: #303133;
}

.header-actions {
  display: flex;
  align-items: center;
}

.stats-bar {
  background: #f5f7fa;
  padding: 12px 16px;
  border-radius: 4px;
  margin-bottom: 16px;
  display: flex;
  gap: 24px;
  font-size: 14px;
  color: #606266;
}

.stats-bar strong {
  color: #303133;
  margin-left: 4px;
}

.team-logo-small {
  width: 40px;
  height: 40px;
  object-fit: contain;
  border-radius: 4px;
}

.pagination-wrapper {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

/* 上传组件 */
.logo-upload-wrapper {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.logo-uploader {
  display: inline-block;
}

.logo-preview {
  position: relative;
  width: 80px;
  height: 80px;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  overflow: hidden;
}

.logo-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.preview-tip {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  font-size: 11px;
  text-align: center;
  padding: 2px 0;
}

/* 球队详情 */
.team-detail {
  padding: 20px 0;
}

.detail-header {
  display: flex;
  gap: 24px;
  margin-bottom: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid #ebeef5;
}

.detail-logo {
  width: 120px;
  height: 120px;
  object-fit: contain;
  border-radius: 8px;
  border: 1px solid #ebeef5;
}

.detail-info h2 {
  margin: 0 0 12px;
  font-size: 24px;
  color: #303133;
}

.detail-info p {
  margin: 6px 0;
  color: #606266;
  font-size: 14px;
}

.players-section {
  margin-top: 24px;
}

.players-section h3 {
  margin: 0 0 12px;
  font-size: 16px;
  color: #303133;
}

.form-tip {
  display: block;
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
  line-height: 1.4;
}
</style>
