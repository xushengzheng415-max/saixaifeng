<template>
  <div class="team-list">
    <div class="page-card">
      <div class="page-header">
        <div class="header-left">
          <el-button v-if="fromTournament && currentTournamentName" text @click="$router.push('/tournaments')">
            <el-icon><Back /></el-icon>
          </el-button>
          <h2>{{ fromTournament && currentTournamentName ? currentTournamentName + ' - 参赛球队' : '球队管理' }}</h2>
        </div>
        <div class="header-actions">
          <!-- 视图切换 -->
          <el-radio-group v-model="viewMode" size="small">
            <el-radio-button value="card">
              <el-icon><Grid /></el-icon> 卡片
            </el-radio-button>
            <el-radio-button value="table">
              <el-icon><List /></el-icon> 列表
            </el-radio-button>
          </el-radio-group>
          <!-- 只有有权限的用户才能创建球队 -->
          <el-button v-if="canCreateTeam" type="primary" @click="showCreateDialog = true">
            <el-icon><Plus /></el-icon>创建球队
          </el-button>
        </div>
      </div>

      <!-- 赛事选择器（从赛事菜单进入时显示 -->
      <div v-if="fromTournament" class="filter-bar">
        <el-select v-model="selectedTournament" placeholder="请选择赛事" clearable style="width: 300px;" @change="handleTournamentChange">
          <el-option v-for="t in tournaments" :key="t._id" :label="t.name" :value="t._id" />
        </el-select>
        <span v-if="selectedTournament" class="filter-hint">
          {{ filteredTeams.length }} 支球队        </span>
      </div>

      <!-- 搜索器 -->
      <div class="filter-bar">
        <el-input
          v-model="searchKey"
          placeholder="搜索球队名称"
          prefix-icon="Search"
          clearable
          style="width: 300px;"
          @input="handleSearch"
        />
      </div>

      <!-- ============ 卡片视图 ============ -->
      <div v-if="viewMode === 'card'" class="team-cards" v-loading="loading">
        <div
          v-for="team in filteredTeams"
          :key="team._id"
          class="team-card"
          @click="viewTeam(team)"
        >
          <div class="card-header">
            <el-avatar :size="60" :src="team.logoUrl || team.logo" shape="square" class="team-logo" style="background-color: #fff; color: #909399; border: 1px solid #ebeef5;">
              {{ team.name ? team.name[0] : '?' }}
            </el-avatar>
            <div class="card-info">
              <h3 class="team-name">{{ team.name }}</h3>
              <span class="team-shortname" v-if="team.shortName">{{ team.shortName }}</span>
            </div>
          </div>
          <div class="card-body">
            <div class="card-item">
              <span class="card-label">编号</span>
              <span class="card-value"><strong>{{ team.teamCode || '-' }}</strong></span>
            </div>
            <div class="card-item">
              <span class="card-label">类型</span>
              <span class="card-value">{{ getTeamTypeLabel(team.teamType) || '-' }}</span>
            </div>
            <div class="card-item">
              <span class="card-label">城市</span>
              <span class="card-value">{{ getTeamCity(team) || '-' }}</span>
            </div>
            <div class="card-item">
              <span class="card-label">成立时间</span>
              <span class="card-value">{{ team.establishedDate || '-' }}</span>
            </div>
            <div class="card-item">
              <span class="card-label">球员</span>
              <el-tag size="small" type="info">{{ team.playerCount || 0 }} 人</el-tag>
            </div>
            <!-- 赛事邀请报名提示 -->
            <div v-if="team.invitedCount > 0" class="card-item invite-alert">
              <el-icon color="#409EFF"><Message /></el-icon>
              <span class="invite-text">{{ team.invitedCount }} 个赛事邀请待确认</span>
            </div>
            <div v-else-if="team.approvedCount > 0" class="card-item joined-hint">
              <el-icon color="#67C23A"><Trophy /></el-icon>
              <span>已参赛 {{ team.approvedCount }} 个赛事</span>
            </div>
            <div v-else-if="team.pendingCount > 0" class="card-item pending-hint">
              <el-icon color="#E6A23C"><Clock /></el-icon>
              <span>{{ team.pendingCount }} 个报名审核中</span>
            </div>
            <div v-else-if="team.cancelRequestedCount > 0" class="card-item cancel-hint">
              <el-icon color="#E6A23C"><WarningFilled /></el-icon>
              <span>{{ team.cancelRequestedCount }} 个赛事撤销申请</span>
            </div>
          </div>
          <div class="card-footer">
            <span class="create-time">{{ formatTime(team.createTime) }}</span>
            <div class="card-actions" @click.stop>
              <!-- 根据权限显示编辑/删除按钮 -->
              <el-button v-if="canEditTeam(team)" type="primary" link size="small" @click="editTeam(team)">编辑</el-button>
              <el-button v-if="canDeleteTeam(team)" type="danger" link size="small" @click="deleteTeam(team)">删除</el-button>
            </div>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-if="filteredTeams.length === 0 && !loading" class="empty-state">
          <el-empty description="暂无球队数据">
            <el-button v-if="canCreateTeam" type="primary" @click="showCreateDialog = true">创建第一个球队</el-button>
          </el-empty>
        </div>
      </div>

      <!-- ============ 列表视图 ============ -->
      <el-table v-else :data="filteredTeams" v-loading="loading" style="width: 100%" empty-text="暂无球队数据">
        <el-table-column label="Logo" width="80">
          <template #default="{ row }">
            <el-avatar :size="40" :src="row.logoUrl || row.logo" shape="square" style="background-color: #fff; color: #909399; border: 1px solid #ebeef5;">
              {{ row.name ? row.name[0] : '?' }}
            </el-avatar>
          </template>
        </el-table-column>
        <el-table-column prop="teamCode" label="编号" width="120" />
        <el-table-column prop="name" label="全称" min-width="160" />
        <el-table-column prop="shortName" label="简称" width="120" />
        <el-table-column prop="establishedDate" label="成立时间" width="110" />
        <el-table-column label="球员数" width="90" align="center">
          <template #default="{ row }">
            <el-tag size="small" type="info">{{ row.playerCount || 0 }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="180">
          <template #default="{ row }">
            {{ formatTime(row.createTime) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="viewTeam(row)">查看</el-button>
            <el-button v-if="canEditTeam(row)" type="primary" link size="small" @click="editTeam(row)">编辑</el-button>
            <el-button v-if="canDeleteTeam(row)" type="danger" link size="small" @click="deleteTeam(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 创建/编辑球队对话框 -->
    <el-dialog
      v-model="showCreateDialog"
      :title="isEditing ? '编辑球队' : '创建球队'"
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

        <el-form-item label="球队建立时间">
          <el-date-picker v-model="teamForm.establishedDate" type="date" placeholder="选择建立时间" style="width: 100%" value-format="YYYY-MM-DD" />
        </el-form-item>



        <el-form-item label="球队Logo">
          <div class="logo-upload-wrapper">
            <div class="logo-input-row">
              <el-input v-model="teamForm.logoUrl" placeholder="上传后将自动填充URL" style="flex: 1;" />
              <AIImageGenerator
                type="teamLogo"
                :name="teamForm.name"
                :color="teamForm.color || 'blue'"
                @success="handleAISuccess"
              />
            </div>
            <el-upload
              class="logo-uploader"
              :show-file-list="false"
              :before-upload="beforeLogoUpload"
              :http-request="handleLogoUpload"
              accept="image/*"
            >
              <el-button type="primary" :loading="uploadingLogo" size="small" style="margin-top: 8px;">
                <el-icon v-if="!uploadingLogo"><Upload /></el-icon>
                {{ uploadingLogo ? '上传中...' : '上传Logo' }}
              </el-button>
            </el-upload>
            <div class="logo-preview" v-if="teamForm.logoUrl">
              <img :src="teamForm.logoUrl" alt="Logo预览" />
              <span class="preview-tip">预览</span>
            </div>
          </div>
        </el-form-item>

        <el-form-item label="绑定手机号">
          <el-input v-model="teamForm.ownerPhone" disabled placeholder="自动填充当前登录手机号" />
          <span class="form-tip">新建时自动绑定当前账号，如需修改请联系赛事中心</span>
        </el-form-item>

        <el-form-item label="球队简介">
          <el-input
            v-model="teamForm.description"
            type="textarea"
            :rows="3"
            placeholder="请输入球队简介"
            maxlength="200"
            show-word-limit
          />
        </el-form-item>


      </el-form>

      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitTeam">
          {{ isEditing ? '保存' : '创建' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 队徽裁剪对话框 -->
    <ImageCropper
      v-model="showLogoCropper"
      :image-src="cropperImageSrc"
      @crop="handleLogoCropConfirm"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Back, Grid, List, Message, Trophy, Clock, WarningFilled } from '@element-plus/icons-vue'
import { queryList, addRecord, updateRecord, deleteRecord, uploadFile, uploadFileViaCloud, uploadLargeFileViaCloud, getFileUrl, callFunction } from '../../utils/cloud'
import { removeBackground } from '../../utils/removeBg'
import AIImageGenerator from '../../components/common/AIImageGenerator.vue'
import { permissions, getCurrentRole, ROLES } from '../../utils/permissions'
import ImageCropper from '../../components/common/ImageCropper.vue'

// 注册组件
defineOptions({
  components: { AIImageGenerator, ImageCropper }
})

const router = useRouter()
const route = useRoute()

const loading = ref(false)
const submitting = ref(false)
const uploadingLogo = ref(false)
const searchKey = ref('')
const teams = ref([])

// 队徽裁剪相关
const showLogoCropper = ref(false)
const cropperImageSrc = ref('')
const cropperPendingFile = ref(null)
const showCreateDialog = ref(false)
const isEditing = ref(false)
const editingId = ref('')
const viewMode = ref('card') // 默认卡片视图

// 当前角色
const currentRole = ref(getCurrentRole())
const userId = ref(localStorage.getItem('userId') || 'dev-user-id')
// 当前用户手机号（用于备用匹配球队）
const userPhone = ref(localStorage.getItem('userInfo') ? (JSON.parse(localStorage.getItem('userInfo') || '{}').phone || '') : '')

// 权限检查
const canCreateTeam = computed(() => permissions.team.create())
const canViewAllTeams = computed(() => permissions.team.viewAll())

// 赛事相关
const fromTournament = ref(false)
const tournaments = ref([])
const selectedTournament = ref('')

const selectedCityList = ref([]);

function onProvinceChange() {
  teamForm.value.city = '';
  teamForm.value.cityName = '';
  teamForm.value.teamCode = '';
  teamForm.value.teamType = '';
  selectedCityList.value = cityLetterMap[teamForm.value.province] || [];
}

function onCityChange(val) {
  teamForm.value.city = val;
  autoGenerateTeamCode();
}

function onTeamTypeChange() {
  autoGenerateTeamCode();
}

const provinceCodeMap = [{"code":"101","name":"上海"},{"code":"102","name":"天津"},{"code":"103","name":"重庆"},{"code":"104","name":"北京"},{"code":"201","name":"安徽"},{"code":"202","name":"福建"},{"code":"203","name":"甘肃"},{"code":"204","name":"广东"},{"code":"205","name":"广西"},{"code":"206","name":"贵州"},{"code":"207","name":"海南"},{"code":"208","name":"河北"},{"code":"209","name":"黑龙江"},{"code":"210","name":"湖北"},{"code":"211","name":"湖南"},{"code":"212","name":"吉林"},{"code":"213","name":"江苏"},{"code":"214","name":"辽宁"},{"code":"215","name":"江西"},{"code":"216","name":"内蒙古"},{"code":"217","name":"宁夏"},{"code":"218","name":"青海"},{"code":"219","name":"山东"},{"code":"220","name":"山西"},{"code":"221","name":"陕西"},{"code":"222","name":"四川"},{"code":"223","name":"新疆"},{"code":"224","name":"云南"},{"code":"225","name":"浙江"},{"code":"226","name":"河南"}];

// 省份城市车牌字母映射
var cityLetterMap = {"101":[{"l":"A","n":"上海"},{"l":"B","n":"上海浦东"},{"l":"C","n":"上海郊区"},{"l":"D","n":"上海崇明"}],"102":[{"l":"A","n":"天津"},{"l":"B","n":"天津滨海"},{"l":"C","n":"天津郊区"}],"103":[{"l":"A","n":"重庆"},{"l":"B","n":"重庆涪陵"},{"l":"C","n":"重庆万州"}],"104":[{"l":"A","n":"北京"},{"l":"B","n":"北京城区"},{"l":"C","n":"北京郊区"},{"l":"Y","n":"北京延庆"}],"204":[{"l":"A","n":"广州"},{"l":"B","n":"深圳"},{"l":"C","n":"珠海"},{"l":"D","n":"汕头"},{"l":"E","n":"佛山"},{"l":"F","n":"韶关"},{"l":"G","n":"湛江"},{"l":"H","n":"肇庆"},{"l":"J","n":"江门"},{"l":"K","n":"茂名"},{"l":"L","n":"惠州"},{"l":"M","n":"梅州"},{"l":"N","n":"汕尾"},{"l":"P","n":"河源"},{"l":"Q","n":"阳江"},{"l":"R","n":"清远"},{"l":"S","n":"东莞"},{"l":"T","n":"中山"},{"l":"U","n":"潮州"},{"l":"V","n":"揭阳"},{"l":"W","n":"云浮"}],"208":[{"l":"A","n":"石家庄"},{"l":"B","n":"唐山"},{"l":"C","n":"秦皇岛"},{"l":"D","n":"邯郸"},{"l":"E","n":"邢台"},{"l":"F","n":"保定"},{"l":"G","n":"张家口"},{"l":"H","n":"承德"},{"l":"J","n":"沧州"},{"l":"K","n":"廊坊"},{"l":"L","n":"衡水"}],"210":[{"l":"A","n":"武汉"},{"l":"B","n":"黄石"},{"l":"C","n":"十堰"},{"l":"D","n":"荆州"},{"l":"E","n":"宜昌"},{"l":"F","n":"襄阳"},{"l":"G","n":"鄂州"},{"l":"H","n":"荆门"},{"l":"J","n":"黄冈"},{"l":"K","n":"孝感"},{"l":"L","n":"咸宁"},{"l":"M","n":"仙桃"},{"l":"N","n":"潜江"},{"l":"P","n":"神农架"},{"l":"Q","n":"恩施"}],"211":[{"l":"A","n":"长沙"},{"l":"B","n":"株洲"},{"l":"C","n":"湘潭"},{"l":"D","n":"衡阳"},{"l":"E","n":"邵阳"},{"l":"F","n":"岳阳"},{"l":"G","n":"常德"},{"l":"H","n":"益阳"},{"l":"J","n":"娄底"},{"l":"K","n":"郴州"},{"l":"L","n":"永州"},{"l":"M","n":"怀化"},{"l":"N","n":"湘西"}],"213":[{"l":"A","n":"南京"},{"l":"B","n":"无锡"},{"l":"C","n":"徐州"},{"l":"D","n":"常州"},{"l":"E","n":"苏州"},{"l":"F","n":"南通"},{"l":"G","n":"连云港"},{"l":"H","n":"淮安"},{"l":"J","n":"盐城"},{"l":"K","n":"扬州"},{"l":"L","n":"镇江"},{"l":"M","n":"泰州"},{"l":"N","n":"宿迁"}],"219":[{"l":"A","n":"济南"},{"l":"B","n":"青岛"},{"l":"C","n":"淄博"},{"l":"D","n":"枣庄"},{"l":"E","n":"东营"},{"l":"F","n":"烟台"},{"l":"G","n":"潍坊"},{"l":"H","n":"济宁"},{"l":"J","n":"泰安"},{"l":"K","n":"威海"},{"l":"L","n":"日照"},{"l":"M","n":"滨州"},{"l":"N","n":"德州"},{"l":"P","n":"聊城"},{"l":"Q","n":"临沂"},{"l":"R","n":"菏泽"},{"l":"S","n":"莱芜"}],"221":[{"l":"A","n":"西安"},{"l":"B","n":"铜川"},{"l":"C","n":"宝鸡"},{"l":"D","n":"咸阳"},{"l":"E","n":"渭南"},{"l":"F","n":"汉中"},{"l":"G","n":"安康"},{"l":"H","n":"商洛"},{"l":"J","n":"延安"},{"l":"K","n":"榆林"}],"222":[],"225":[{"l":"A","n":"杭州"},{"l":"B","n":"宁波"},{"l":"C","n":"温州"},{"l":"D","n":"绍兴"},{"l":"E","n":"湖州"},{"l":"F","n":"嘉兴"},{"l":"G","n":"金华"},{"l":"H","n":"衢州"},{"l":"J","n":"台州"},{"l":"K","n":"丽水"},{"l":"L","n":"舟山"}],"226":[{"l":"A","n":"郑州"},{"l":"B","n":"开封"},{"l":"C","n":"洛阳"},{"l":"D","n":"平顶山"},{"l":"E","n":"安阳"},{"l":"F","n":"鹤壁"},{"l":"G","n":"新乡"},{"l":"H","n":"焦作"},{"l":"J","n":"濮阳"},{"l":"K","n":"许昌"},{"l":"L","n":"漯河"},{"l":"M","n":"三门峡"},{"l":"N","n":"商丘"},{"l":"P","n":"周口"},{"l":"Q","n":"驻马店"},{"l":"R","n":"南阳"},{"l":"S","n":"信阳"},{"l":"U","n":"济源"}]};
const cityLetterList = ["A","B","C","D","E","F","G","H","J","K","L","M","N","P","Q","R","S","T","U","V","W","X","Y","Z"];

const teamForm = ref({
  name: '',
  shortName: '',
  establishedDate: '',
  logoUrl: '',
  description: '',
  teamType: '',
  ownerPhone: ''  // ★ 绑定手机号
})

// 教练列表
const coaches = ref([])

// 加载教练列表

// 自动生成球队编号
function autoGenerateTeamCode() {
  if (teamForm.value.province && teamForm.value.city && teamForm.value.teamType) {
    var prefix = teamForm.value.province + teamForm.value.city;
    var typeCode = teamForm.value.teamType;
    var maxSeq = 0;
    if (teams.value && teams.value.length > 0) {
      teams.value.forEach(function(t) {
        if (t.teamCode && t.teamCode.startsWith(prefix)) {
          // 提取序号部分：跳过省份(3位)+城市(1位)=4位后的3位
          var num = parseInt(t.teamCode.substring(4, 7), 10);
          if (!isNaN(num) && num > maxSeq) maxSeq = num;
        }
      });
    }
    var nextNum = (maxSeq + 1).toString().padStart(3, '0');
    teamForm.value.teamCode = prefix + nextNum + typeCode;
  }
}

async function loadCoaches() {
  try {
    coaches.value = await queryList('coaches', { orderBy: { createTime: 'desc' } })
  } catch (err) {
    console.error('加载教练列表失败:', err)
  }
}

// 根据来源过滤球队
const filteredTeams = computed(() => {
  let result = teams.value

  // 搜索过滤
  if (searchKey.value) {
    const key = searchKey.value.toLowerCase()
    result = result.filter(t => t.name && t.name.toLowerCase().includes(key))
  }

  return result
})

// 当前赛事名称
const currentTournamentName = computed(() => {
  const t = tournaments.value.find(t => t._id === selectedTournament.value)
  return t ? t.name : ''
})

// 处理赛事选择变化
async function handleTournamentChange(tournamentId) {
  if (tournamentId) {
    loading.value = true
    try {

      // 先尝试从 tournament_teams 获取关联的球队（不限制status）
      const tournamentTeams = await queryList('tournament_teams', {
        where: { tournamentId }
      })

      // 获取所有球队（单独查询，以便在teams为空时给出明确提示）
      const allTeams = await queryList('teams', {})

      if (allTeams.length === 0) {
        // teams集合为空，提示用户先创建球队
        console.warn('⚠️ teams 集合为空！请先创建球队，或检查数据库权限设置')
        teams.value = []
        ElMessage.warning({
          message: '球队数据为空！请先在「球队管理」中创建球队',
          duration: 5000
        })
        return
      }

      if (tournamentTeams && tournamentTeams.length > 0) {
        // 筛选已审核通过的球队
        const approvedTeams = tournamentTeams.filter(tt =>
          tt.status === 'approved' || tt.status === 'verified' || !tt.status
        )

        if (approvedTeams.length > 0) {
          const teamIds = approvedTeams.map(tt => tt.teamId)
          teams.value = allTeams.filter(t => teamIds.includes(t._id))
          
          // 如果过滤后为空，说明 tournament_teams 中的 teamId 与 teams 集合不匹配
          if (teams.value.length === 0) {
            console.warn('⚠️ tournament_teams 中的 teamId ?teams 集合不匹配！')
            ElMessage.warning({
              message: '报名数据与球队数据不匹配，请检查数据完整性',
              duration: 5000
            })
          }
        } else {
          // tournament_teams存在但没有审核通过的，显示全部球队作为调试
          teams.value = allTeams
        }
      } else {
        // 如果 tournament_teams 为空，显示全部球队
        teams.value = allTeams
        if (allTeams.length > 0) {
          ElMessage.info('该赛事暂无报名球队，已显示全部球队作为参考')
        }
      }

      // 获取教练 + 球员数量
      const allTeamIds = teams.value.map(t => t._id).filter(Boolean)
      if (allTeamIds.length > 0) {
        const [coaches, players] = await Promise.all([
          queryList('coaches', { where: { teamId: { $in: allTeamIds } } }),
          queryList('players', { where: { teamId: { $in: allTeamIds } } })
        ])

        const coachByTeam = {}
        coaches.forEach(c => {
          if (!coachByTeam[c.teamId]) coachByTeam[c.teamId] = []
          coachByTeam[c.teamId].push(c)
        })

        const playerByTeam = {}
        players.forEach(p => {
          if (!playerByTeam[p.teamId]) playerByTeam[p.teamId] = []
          playerByTeam[p.teamId].push(p)
        })

        teams.value.forEach(team => {
          if (!team.coachName) {
            const teamCoaches = coachByTeam[team._id] || []
            const headCoach = teamCoaches.find(c => c.type === 'head_coach')
            team._coachName = headCoach ? headCoach.name : (teamCoaches[0] ? teamCoaches[0].name : '')
          }
          team.playerCount = (playerByTeam[team._id] || []).length
        })
      }
    } catch (err) {
      console.error('加载赛事球队失败:', err)
      ElMessage.error('加载赛事球队失败: ' + err.message)
    } finally {
      loading.value = false
    }
  } else {
    teams.value = []
  }
}

import { Upload } from '@element-plus/icons-vue'

// 球队 Logo 上传
async function beforeLogoUpload(file) {
  const isImage = file.type.startsWith('image/')
  const isLt2M = file.size / 1024 / 1024 < 2

  if (!isImage) {
    ElMessage.error('只能上传图片文件')
    return false
  }
  if (!isLt2M) {
    ElMessage.error('图片大小不能超过 2MB')
    return false
  }
  return true
}

// AI生成成功回调
function handleAISuccess(url) {
  teamForm.value.logoUrl = url
  teamForm.value.logo = url // 同时更新logo字段
}

function handleLogoUpload(options) {
  const { file } = options
  const reader = new FileReader()
  reader.onload = (e) => {
    cropperImageSrc.value = e.target.result
    cropperPendingFile.value = file
    showLogoCropper.value = true
  }
  reader.readAsDataURL(file)
}

// 压缩图片 blob（缩小尺寸 + JPEG压缩）
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
      canvas.toBlob((compressed) => resolve(compressed), 'image/png')
    }
    img.src = URL.createObjectURL(blob)
  })
}

async function handleLogoCropConfirm(croppedBlob) {
  uploadingLogo.value = true
  try {
    // ★ 转换为 File 对象
    const file = new File([croppedBlob], 'logo-cropped.png', { type: 'image/png' })

    // ★ AI 智能去背景（rembg）
    let finalBlob = croppedBlob
    try {
      ElMessage.info('正在智能去背景...')
      const rembgResult = await removeBackground(file, { format: 'png' })
      if (rembgResult.success) {
        // removeBackground 返回的 blob 就是透明 PNG
        finalBlob = rembgResult.blob
        ElMessage.success('去背景完成')
      } else {
        console.warn('[队徽] 去背景失败，使用原图:', rembgResult.message)
      }
    } catch (rembgErr) {
      console.warn('[队徽] 去背景异常，使用原图:', rembgErr.message)
    }

    // ★ 压缩到 400px 以内
    const compressed = await compressImage(finalBlob, 400)
    const cloudPath = `team-logos/${Date.now()}-logo.png`
    
    // ★ 使用分片上传（避免 413 错误）
    const result = await uploadLargeFileViaCloud(cloudPath, compressed, { chunkSize: 100 * 1024 })

    if (result.success) {
      teamForm.value.logoUrl = result.tempUrl
      teamForm.value.logo = result.tempUrl
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

function formatTime(time) {
  if (!time) return '-'
  const d = new Date(time)
  return isNaN(d.getTime()) ? '-' : d.toLocaleString('zh-CN')
}

// 队伍类型码→中文名
const teamTypeLabelMap = {
  '01': '一线队', '02': '二线队',
  '08': 'U8', '09': 'U9', '10': 'U10', '11': 'U11', '12': 'U12',
  '13': 'U13', '14': 'U14', '15': 'U15', '16': 'U16', '17': 'U17', '18': 'U18'
}
function getTeamTypeLabel(type) {
  return teamTypeLabelMap[type] || type || '-'
}

// 省份代码+城市代码 → 省份·城市名
function getTeamCity(team) {
  const provCode = team.provinceCode || team.province
  const cityCode = team.cityCode || team.city
  if (!provCode) return ''
  const prov = provinceCodeMap.find(p => p.code === provCode)
  const provName = prov ? prov.name : provCode
  if (!cityCode) return provName
  const cities = cityLetterMap[provCode]
  if (!cities) return provName + '·' + cityCode
  const city = cities.find(c => c.l === cityCode.toUpperCase())
  return provName + '·' + (city ? city.n : cityCode)
}

function viewTeam(row) {
  router.push('/teams/' + row._id)
}

function editTeam(row) {
  isEditing.value = true
  editingId.value = row._id
  teamForm.value = {
    name: row.name || '',
    shortName: row.shortName || '',
    province: row.provinceCode || row.province || '',
    city: row.cityCode || row.city || '',
    teamCode: row.teamCode || '',
    teamType: row.teamType || '',
    establishedDate: row.establishedDate || row.foundedDate || '',
    logoUrl: row.logo || row.logoUrl || '',
    cityName: row.cityName || '',
    description: row.description || '',
    ownerPhone: row.ownerPhone || row.creatorPhone || userPhone.value || ''
  }
  showCreateDialog.value = true
}

async function deleteTeam(row) {
  try {
    // ★ 先查球员数量
    let playerCount = row.playerCount || 0
    if (!playerCount) {
      try {
        const playersRes = await callFunction('getPlayers', { teamId: row._id || row.id })
        playerCount = playersRes?.data?.length || 0
      } catch (e) { console.warn('[deleteTeam] 查询球员数失败:', e.message) }
    }

    let confirmMsg = `确定删除球队「${row.name}」吗？此操作不可恢复！`
    let force = false

    if (playerCount > 0) {
      confirmMsg = `该球队下有 ${playerCount} 名球员！\n\n删除球队将同时删除所有球员数据，是否继续？`
    }

    await ElMessageBox.confirm(confirmMsg, '删除确认', {
      type: 'warning',
      confirmButtonText: playerCount > 0 ? '强制删除（含球员）' : '确定删除',
      cancelButtonText: '取消'
    })

    force = playerCount > 0  // 有球员时 force=true

    const result = await callFunction('deleteTeam', { id: row._id || row.id, force })
    if (result.success) {
      ElMessage.success(result.message || '删除成功')
    } else {
      ElMessage.error(result.error || '删除失败')
    }
    loadTeams()
  } catch (err) {
    if (err !== 'cancel' && err !== 'close') {
      ElMessage.error('删除失败: ' + err.message)
    }
  }
}

function handleSearch() {
  // filteredTeams is computed, auto-updates
}

async function submitTeam() {
  if (!teamForm.value.name.trim()) {
    ElMessage.warning('请输入球队名称')
    return
  }
  // 账号所有者即为负责人
  // 使用账号绑定的手机号

  submitting.value = true
  try {
    // 获取教练名称
    // 自动设置负责人为当前账号
    
    // 同时保存 logo 和 logoUrl，确保小程序和Web端都能读取
      const teamData = {
        // 核心字段
        name: teamForm.value.name,
        shortName: teamForm.value.shortName,
        provinceCode: teamForm.value.province,
        cityCode: teamForm.value.city,
        cityName: teamForm.value.cityName || '',
        teamType: teamForm.value.teamType,
        teamCode: teamForm.value.teamCode,
        ownerPhone: userPhone.value,
        source: 'saixiaofeng',
        // 可选字段
        establishedDate: teamForm.value.establishedDate || '',
        logo: teamForm.value.logoUrl || '',
        description: teamForm.value.description || '',
        home: '',
        // 管理字段
        creatorId: userId.value,
        claimStatus: 'claimed'
      }

    if (isEditing.value) {
      await updateRecord('teams', editingId.value, teamData)
      ElMessage.success('保存成功')
    } else {
      await addRecord('teams', { ...teamData, playerCount: 0 })
      ElMessage.success('创建成功')
    }
    showCreateDialog.value = false
    resetForm()
    loadTeams()
  } catch (err) {
    ElMessage.error('操作失败: ' + err.message)
  } finally {
    submitting.value = false
  }
}

function resetForm() {
  teamForm.value = { name: '', shortName: '', province: '', city: '', teamCode: '', teamType: '', establishedDate: '', logoUrl: '', description: '', ownerPhone: userPhone.value }
  isEditing.value = false
  editingId.value = ''
}

// 监听对话框关闭时重置
watch(showCreateDialog, (val) => {
  if (val) {
    // 打开对话框时重置表单并自动填入手机号
    resetForm()
    teamForm.value.ownerPhone = userPhone.value
  } else {
    resetForm()
  }
})

// 检查是否可以编辑球队
function canEditTeam(team) {
  return permissions.team.edit(team)
}

// 检查是否可以删除球队
function canDeleteTeam(team) {
  return permissions.team.delete(team)
}

async function loadTeams() {
  loading.value = true
  try {
    // 根据角色加载不同的球队数据
      if (canViewAllTeams.value) {
      // 主办?管理员可以查看所有球队
        const result = await queryList('teams', { orderBy: { createTime: 'desc' } })
      teams.value = result
    } else if (currentRole.value === ROLES.COACH) {
      // 教练查看自己创建的球队
        // 匹配优先级：creatorId > contactPhone > coachPhone > 老数据无 creatorId 全显示
      const result = await queryList('teams', { orderBy: { createTime: 'desc' } })
      teams.value = result.filter(team => {
        // ★ 赛事中心创建的公共球队
        if (team.source === 'tournament_center') {
          // 已认领 + 手机号匹配当前用户 → 显示
          if (team.claimStatus === 'claimed' && team.ownerPhone && userPhone.value) {
            return team.ownerPhone === userPhone.value
          }
          // 未认领 → 隐藏
          return false
        }
        // 1. 精确匹配 creatorId
        if (team.creatorId && userId.value) {
          if (team.creatorId === userId.value) return true
        }
        // 2. 按手机号匹配（contactPhone ?coachPhone)
          if (userPhone.value) {
          if (team.contactPhone === userPhone.value || team.coachPhone === userPhone.value) return true
        }
        // 3. 老数据没有 creatorId 也没有电话，默认显示（兼容）
        if (!team.creatorId && !team.contactPhone && !team.coachPhone) {
          return true
        }
        return false
      })
    } else {
      teams.value = []
    }

    const allTeamIds = teams.value.map(t => t._id).filter(Boolean)
    if (allTeamIds.length === 0) {
      loading.value = false
      return
    }

    // 并行加载：赛事关联+ 教练 + 球员数量
    const [tournamentTeams, coaches, players] = await Promise.all([
      queryList('tournament_teams', { where: { teamId: { $in: allTeamIds } } }),
      queryList('coaches', { where: { teamId: { $in: allTeamIds } } }),
      queryList('players', { where: { teamId: { $in: allTeamIds } } })
    ])

    // 按球队ID分组统计赛事
    const ttByTeam = {}
    tournamentTeams.forEach(tt => {
      if (!ttByTeam[tt.teamId]) ttByTeam[tt.teamId] = []
      ttByTeam[tt.teamId].push(tt)
    })

    // 按球队ID分组统计教练（取主教练名称
      const coachByTeam = {}
    coaches.forEach(c => {
      if (!coachByTeam[c.teamId]) coachByTeam[c.teamId] = []
      coachByTeam[c.teamId].push(c)
    })

    // 按球队ID分组统计球员
    const playerByTeam = {}
    players.forEach(p => {
      if (!playerByTeam[p.teamId]) playerByTeam[p.teamId] = []
      playerByTeam[p.teamId].push(p)
    })

    // 附加到球队对象
      teams.value.forEach(team => {
      // 赛事关联
      const records = ttByTeam[team._id] || []
      team.invitedCount = records.filter(r => r.status === 'invited').length
      team.pendingCount = records.filter(r => r.status === 'pending').length
      team.approvedCount = records.filter(r => r.status === 'approved').length
      team.cancelRequestedCount = records.filter(r => r.status === 'cancel_requested').length
      team.tournamentCount = records.length

      // 教练名：优先从 teams.coachName，没有则从 coaches 集合取主教练
      if (!team.coachName) {
        const teamCoaches = coachByTeam[team._id] || []
        const headCoach = teamCoaches.find(c => c.type === 'head_coach')
        team._coachName = headCoach ? headCoach.name : (teamCoaches[0] ? teamCoaches[0].name : '')
      }

      // 球员数量
      team.playerCount = (playerByTeam[team._id] || []).length
    })
  } catch (err) {
    console.error('加载球队列表失败:', err)
    ElMessage.error('加载球队列表失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  // 检查是否从赛事路由进入 /tournaments/:id/teams
  const tournamentId = route.params.id
  if (tournamentId) {
    fromTournament.value = true
    selectedTournament.value = tournamentId
    // 加载赛事信息（用于显示名称）
    loadTournaments()
    // 加载该赛事的球队
    handleTournamentChange(tournamentId)
  } else if (route.query.from === 'tournament') {
    fromTournament.value = true
    loadTournaments()
  } else {
    loadTeams()
  }
})

// 加载赛事列表
async function loadTournaments() {
  try {
    const result = await queryList('tournaments', { orderBy: { createTime: 'desc' } })
    tournaments.value = result

    // 如果有赛事，自动选中第一个
      if (tournaments.value.length > 0) {
      selectedTournament.value = tournaments.value[0]._id
      handleTournamentChange(selectedTournament.value)
    }
  } catch (err) {
    console.error('加载赛事列表失败:', err)
  }
}
</script>

<style scoped>
.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.filter-bar {
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 16px;
}

.filter-hint {
  font-size: 13px;
  color: #909399;
}

/* ============ 卡片视图样式 ============ */
.team-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  padding: 4px;
}

.team-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  cursor: pointer;
  transition: all 0.3s ease;
  border: 1px solid #ebeef5;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  height: 100%;
}

.team-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  border-color: #43A047;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.team-logo {
  border: 2px solid #f0f0f0;
  flex-shrink: 0;
  width: 60px !important;
  height: 60px !important;
}
.team-logo :deep(img) {
  object-fit: contain !important;
}

.card-info {
  flex: 1;
  min-width: 0;
}

.team-name {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  margin: 0 0 4px 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.team-code {
  font-size: 12px;
  color: #909399;
  background: #f5f7fa;
  padding: 2px 8px;
  border-radius: 4px;
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
  flex: 1;
}

.card-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-label {
  font-size: 13px;
  color: #909399;
  min-width: 40px;
}

.card-value {
  font-size: 13px;
  color: #606266;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.invite-alert {
  margin-top: 4px;
  padding: 6px 10px;
  background: #ecf5ff;
  border-radius: 6px;
  color: #409eff;
  font-size: 13px;
  font-weight: 500;
}

.invite-alert .el-icon {
  margin-right: 4px;
}

.joined-hint {
  margin-top: 4px;
  padding: 6px 10px;
  background: #f0f9eb;
  border-radius: 6px;
  color: #67c23a;
  font-size: 13px;
}

.pending-hint {
  margin-top: 4px;
  padding: 6px 10px;
  background: #fdf6ec;
  border-radius: 6px;
  color: #e6a23c;
  font-size: 13px;
}

.cancel-hint {
  margin-top: 4px;
  padding: 6px 10px;
  background: #fdf6ec;
  border-radius: 6px;
  color: #e6a23c;
  font-size: 13px;
  font-weight: 500;
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 12px;
  border-top: 1px solid #f5f7fa;
}

.create-time {
  font-size: 12px;
  color: #c0c4cc;
}

.card-actions {
  display: flex;
  gap: 4px;
}

.empty-state {
  grid-column: 1 / -1;
  padding: 60px 0;
}

/* 原有样式 */
.logo-upload-wrapper {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.logo-input-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.logo-preview {
  position: relative;
  width: 80px;
  height: 80px;
  border: 1px dashed #dcdfe6;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f7fa;
}

.logo-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.logo-preview .preview-tip {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  font-size: 12px;
  text-align: center;
  padding: 2px 0;
}

.form-tip {
  display: block;
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
  line-height: 1.4;
}
</style>
