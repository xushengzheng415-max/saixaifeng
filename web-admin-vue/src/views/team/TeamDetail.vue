<template>
  <div class="team-detail">
    <el-page-header @back="$router.push('/teams')" title="返回球队列表" />

    <!-- 球队基本信息 -->
    <div class="page-card" style="margin-top: 20px;">
      <div class="page-header" style="justify-content: space-between;">
        <h2>球队详情</h2>
        <el-button type="primary" size="small" @click="editTeam">编辑球队</el-button>
      </div>
      <div class="team-info-header">
        <div class="team-logo-wrapper">
          <el-avatar :size="100" :src="team.logoUrl || team.logo" shape="square" style="background-color: #fff; color: #909399; border: 1px solid #ebeef5;">
            {{ team.name ? team.name[0] : '?' }}
          </el-avatar>
          <!-- AI生成队徽按钮 -->
          <AIImageGenerator
            type="teamLogo"
            :name="team.name"
            :color="team.color || 'blue'"
            class="ai-logo-btn"
            @success="handleAISuccess"
          />
        </div>
        <div class="team-meta">
          <h2>{{ team.name }}</h2>
          <div class="team-meta-row">
            <span class="meta-item">成立时间: {{ team.establishedDate || '-' }}</span>
            <span class="meta-item">球员: {{ players.length }}人</span>
          </div>
          <div class="team-meta-row">
            <span class="meta-item">简称: {{ team.shortName || '-' }}</span>
          </div>
          <div class="team-description">
            {{ team.description || '暂无球队介绍' }}
          </div>
        </div>
      </div>
    </div>

    <!-- 球员列表 -->
    <div class="page-card" style="margin-top: 16px;">
      <div class="page-header">
        <h2>球员阵容</h2>
        <div style="display: flex; gap: 8px;">
          <el-button type="success" size="small" @click="showBatchImport = true">
            <el-icon><Download /></el-icon>批量导入
          </el-button>
          <el-button type="primary" size="small" @click="showAddPlayer = true">
            <el-icon><Plus /></el-icon>添加球员
          </el-button>
        </div>
      </div>

      <el-table 
        :data="players" 
        v-loading="loading" 
        style="width: 100%" 
        empty-text="暂无球员"
        @row-click="viewPlayerCard"
        class="player-table"
      >
        <!-- 号码 -->
        <el-table-column label="号码" width="60" align="center">
          <template #default="{ row }">
            <span class="jersey-number">{{ row.jerseyNumber || '-' }}</span>
          </template>
        </el-table-column>
        <!-- 头像 -->
        <el-table-column prop="playerId" label="球员ID" width="140" />
        <el-table-column label="头像" width="60" align="center">
          <template #default="{ row }">
            <img 
              v-if="row.photoUrl" 
              :src="row.photoUrl" 
              class="player-avatar-img"
              alt="头像"
            />
            <el-avatar v-else :size="36" style="background-color: #fff; color: #909399; border: 1px solid #ebeef5;">{{ row.name ? row.name[0] : '?' }}</el-avatar>
          </template>
        </el-table-column>
        <!-- 姓名 -->
        <el-table-column prop="name" label="姓名" width="80" />
        <!-- 位置 -->
        <el-table-column label="位置" width="70" align="center">
          <template #default="{ row }">
            <el-tag :type="getPositionType(row.position)" size="small" style="white-space: nowrap;">{{ getPositionLabel(row.position) }}</el-tag>
          </template>
        </el-table-column>
        <!-- 球衣名 -->
        <el-table-column label="球衣名" width="110" align="center">
          <template #default="{ row }">
            <span style="white-space: nowrap; font-size: 12px;">{{ row.jerseyName || '-' }}</span>
          </template>
        </el-table-column>
        <!-- 年龄 -->
        <el-table-column label="年龄" width="60" align="center">
          <template #default="{ row }">
            <span>{{ row.birthDate ? calculateAge(row.birthDate) : '-' }}</span>
          </template>
        </el-table-column>
        <!-- 出场次数/时间 -->
        <el-table-column width="130" align="center">
          <template #header>
            <span style="white-space: nowrap;">出场次数/时间</span>
          </template>
          <template #default="{ row }">
            <span style="color: #909399;">-</span>
          </template>
        </el-table-column>
        <!-- 进球 -->
        <el-table-column label="进球" width="60" align="center">
          <template #default="{ row }">
            {{ row.goals || 0 }}
          </template>
        </el-table-column>
        <!-- 红黄牌 -->
        <el-table-column width="80" align="center">
          <template #header>
            <span style="white-space: nowrap;">红/黄牌</span>
          </template>
          <template #default="{ row }">
            <span style="color: #f56c6c;">{{ row.redCards || 0 }}</span>
            <span style="margin: 0 2px;">/</span>
            <span style="color: #e6a23c;">{{ row.yellowCards || 0 }}</span>
          </template>
        </el-table-column>
        <!-- 操作 -->
        <el-table-column label="操作" width="100" align="center">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click.stop="editPlayer(row)">编辑</el-button>
            <el-button type="danger" link size="small" @click.stop="removePlayer(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 添加/编辑球员对话框 -->
    <el-dialog
      v-model="showAddPlayer"
      :title="isEditingPlayer ? '编辑球员' : '添加球员'"
      width="700px"
      :close-on-click-modal="false"
    >
      <!-- 新增模式：选项卡 -->
      <el-tabs v-if="!isEditingPlayer" v-model="activeTab" type="border-card" class="player-tabs">
        <el-tab-pane label="手动新建" name="manual">
          <div class="tab-content">
<el-form :model="playerForm" label-width="100px">
            <!-- 第一行：姓名 + 身份证号（核心信息放最前） -->
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="姓名" required>
                  <el-input 
                    v-model="playerForm.name" 
                    placeholder="请输入姓名" 
                    @input="onNameInput"
                  />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="身份证号" required>
                  <el-input 
                    v-model="playerForm.idCard" 
                    placeholder="18位身份证号" 
                    maxlength="18"
                    @input="onIdCardInput"
                  />
                </el-form-item>
              </el-col>
            </el-row>
            
            <!-- 第二行：自动生成的信息 -->
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="球衣姓名">
                  <el-input 
                    v-model="playerForm.jerseyName" 
                    placeholder="自动根据姓名生成，可手动修改"
                  >
                    <template #suffix>
                      <el-tooltip content="格式：ZHENG X.（二字）或 ZHENG X.S.（三字），ZH/CH/SH保留双字母">
                        <el-icon><Info-Filled /></el-icon>
                      </el-tooltip>
                    </template>
                  </el-input>
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="平台年龄">
                  <el-input 
                    v-model="displayAge" 
                    placeholder="根据身份证号计算"
                    readonly
                  >
                    <template #suffix>
                      <el-tooltip content="根据身份证号出生日期计算实际年龄">
                        <el-icon><Info-Filled /></el-icon>
                      </el-tooltip>
                    </template>
                  </el-input>
                </el-form-item>
              </el-col>
            </el-row>
            
            <!-- 第三行：身份证解析的信息 -->
            <el-row :gutter="16">
              <el-col :span="8">
                <el-form-item label="出生日期">
                  <el-input 
                    v-model="playerForm.birthDate" 
                    placeholder="自动识别"
                    readonly
                  />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="籍贯">
                  <el-input v-model="playerForm.nativePlace" placeholder="自动识别" readonly />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="性别">
                  <el-select v-model="playerForm.gender" style="width: 100%">
                    <el-option label="男" value="male" />
                    <el-option label="女" value="female" />
                  </el-select>
                </el-form-item>
              </el-col>
            </el-row>
            
            <!-- 通讯地址 -->
            <el-row :gutter="16">
              <el-col :span="24">
                <el-form-item label="通讯地址">
                  <div class="address-row">
                    <el-select v-model="playerForm.province" placeholder="省" style="width: 110px" @change="onProvinceChange">
                      <el-option v-for="p in provinces" :key="p.code" :label="p.name" :value="p.code" />
                    </el-select>
                    <el-select v-model="playerForm.city" placeholder="市" style="width: 110px" :disabled="!playerForm.province" @change="onCityChange">
                      <el-option v-for="c in cities" :key="c.code" :label="c.name" :value="c.code" />
                    </el-select>
                    <el-select v-model="playerForm.district" placeholder="区" style="width: 110px" :disabled="!playerForm.city">
                      <el-option v-for="d in districts" :key="d.code" :label="d.name" :value="d.code" />
                    </el-select>
                  </div>
                </el-form-item>
                <el-form-item label=" " class="address-detail-item">
                  <el-input v-model="playerForm.addressDetail" placeholder="详细地址" />
                </el-form-item>
              </el-col>
            </el-row>
            
            <!-- 第四行：球衣信息 -->
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="球衣号" required>
                  <el-input-number v-model="playerForm.jerseyNumber" :min="1" :max="99" style="width: 100%" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="位置" required>
                  <el-select v-model="playerForm.position" placeholder="请选择位置" style="width: 100%">
                    <el-option label="守门员 GK" value="GK" />
                    <el-option label="后卫 DF" value="DF" />
                    <el-option label="前卫 MF" value="MF" />
                    <el-option label="前锋 FW" value="FW" />
                  </el-select>
                </el-form-item>
              </el-col>
            </el-row>
            
            <!-- 第五行：国籍 -->
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="国籍">
                  <el-input v-model="playerForm.nationality" placeholder="默认：中国" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="服装尺码">
                  <el-select v-model="playerForm.clothingSize" placeholder="选择尺码" style="width: 100%">
                    <el-option v-for="s in ['S','M','L','XL','XXL','XXXL']" :key="s" :label="s" :value="s" />
                  </el-select>
                </el-form-item>
              </el-col>
            </el-row>
            
            <!-- 第六行：身高体重 -->
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="身高(cm)">
                  <el-input-number v-model="playerForm.height" :min="100" :max="250" style="width: 100%" placeholder="身高" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="体重(kg)">
                  <el-input-number v-model="playerForm.weight" :min="30" :max="150" style="width: 100%" placeholder="体重" />
                </el-form-item>
              </el-col>
            </el-row>
            
            <el-divider content-position="left">联系方式</el-divider>
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="联系人">
                  <el-input v-model="playerForm.contactName" placeholder="联系人姓名" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="联系电话">
                  <el-input v-model="playerForm.contactPhone" placeholder="电话号码" />
                </el-form-item>
              </el-col>
            </el-row>
            <!-- 身份证照片上传 -->
            <!-- 球员照片上传（带裁剪和抠图） -->
            <el-divider content-position="left">球员照片（必填）</el-divider>
            <el-row :gutter="16">
              <el-col :span="24">
                <el-form-item label="球员照片" required>
                  <div class="player-photo-section">
                    <AvatarCropper 
                      v-if="!playerForm.photoUrl"
                      @success="handleAvatarCropSuccess"
                    />
                    <div v-else class="photo-preview-wrapper">
                      <img :src="playerForm.photoUrl" class="photo-preview-img" />
                      <el-button size="small" type="danger" @click="playerForm.photoUrl = ''">
                        重新上传
                      </el-button>
                    </div>
                  </div>
                </el-form-item>
              </el-col>
            </el-row>

            <el-divider content-position="left">身份证照片（非必填）</el-divider>
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="身份证正面">
                  <div class="idcard-upload">
                    <el-upload
                      class="idcard-uploader"
                      :show-file-list="false"
                      :before-upload="beforePhotoUpload"
                      :http-request="(opts) => handleIdCardUpload(opts, 'front')"
                      accept="image/*"
                    >
                      <div v-if="playerForm.idCardFront" class="idcard-preview">
                        <img :src="playerForm.idCardFront" />
                      </div>
                      <div v-else class="idcard-placeholder">
                        <el-icon :size="24"><Plus /></el-icon>
                        <span>点击上传正面</span>
                      </div>
                    </el-upload>
                  </div>
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="身份证反面">
                  <div class="idcard-upload">
                    <el-upload
                      class="idcard-uploader"
                      :show-file-list="false"
                      :before-upload="beforePhotoUpload"
                      :http-request="(opts) => handleIdCardUpload(opts, 'back')"
                      accept="image/*"
                    >
                      <div v-if="playerForm.idCardBack" class="idcard-preview">
                        <img :src="playerForm.idCardBack" />
                      </div>
                      <div v-else class="idcard-placeholder">
                        <el-icon :size="24"><Plus /></el-icon>
                        <span>点击上传反面</span>
                      </div>
                    </el-upload>
                  </div>
                </el-form-item>
              </el-col>
            </el-row>
          </el-form>
          </div>
        </el-tab-pane>

        <el-tab-pane label="从库中选择" name="library">
          <div class="tab-content">
            <!-- 搜索栏 -->
            <div class="library-search">
              <el-input v-model="libraryKeyword" placeholder="搜索姓名/身份证号" clearable @clear="loadPlayerLibrary" @keyup.enter="loadPlayerLibrary">
                <template #append>
                  <el-button :icon="Search" @click="loadPlayerLibrary" />
                </template>
              </el-input>
              <el-button size="small" :icon="Refresh" circle @click="loadPlayerLibrary(true)" title="刷新球员库" />
            </div>
            <!-- 球员库列表 -->
            <el-table 
              :data="playerLibraryList" 
              v-loading="libraryLoading" 
              style="width: 100%" 
              max-height="400px" 
              size="small"
              @selection-change="handleLibrarySelectionChange"
              ref="libraryTableRef"
            >
              <el-table-column type="selection" width="40" />
              <el-table-column label="头像" width="70">
                <template #default="{ row }">
                  <img v-if="row.photoUrl" :src="row.photoUrl" class="library-avatar" />
                  <el-avatar v-else :size="40" style="background-color: #fff; color: #909399; border: 1px solid #ebeef5;">{{ row.name ? row.name[0] : '?' }}</el-avatar>
                </template>
              </el-table-column>
              <el-table-column prop="name" label="姓名" width="100" />
              <el-table-column prop="idCard" label="身份证号" width="160">
                <template #default="{ row }">
                  <span>{{ maskIdCard(row.idCard) }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="position" label="位置" width="80">
                <template #default="{ row }">
                  <el-tag :type="getPositionType(row.position)" size="small">{{ getPositionLabel(row.position) }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="80">
                <template #default="{ row }">
                  <el-button type="primary" link size="small" @click="selectFromLibrary(row)">选择</el-button>
                </template>
              </el-table-column>
            </el-table>
            <div class="library-empty-tip">
              <el-empty v-if="playerLibraryList.length === 0 && !libraryLoading" description="球员库中暂无数据，请先手动新建球员" />
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>

      <!-- 编辑模式：直接显示表单 -->
      <template v-else>
<el-form :model="playerForm" label-width="100px">
          <!-- 第一行：姓名 + 身份证号（核心信息放最前） -->
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="姓名" required>
                <el-input 
                  v-model="playerForm.name" 
                  placeholder="请输入姓名" 
                  @input="onNameInput"
                />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="身份证号" required>
                <el-input 
                  v-model="playerForm.idCard" 
                  placeholder="18位身份证号" 
                  maxlength="18"
                  @input="onIdCardInput"
                />
              </el-form-item>
            </el-col>
          </el-row>
          
          <!-- 第二行：自动生成的信息 -->
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="球衣姓名">
                <el-input 
                  v-model="playerForm.jerseyName" 
                  placeholder="自动根据姓名生成，可手动修改"
                >
                  <template #suffix>
                    <el-tooltip content="格式：ZHENG X.（二字）或 ZHENG X.S.（三字），ZH/CH/SH保留双字母">
                      <el-icon><Info-Filled /></el-icon>
                    </el-tooltip>
                  </template>
                </el-input>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="平台年龄">
                <el-input 
                  v-model="displayAge" 
                  placeholder="根据身份证号计算"
                  readonly
                >
                  <template #suffix>
                    <el-tooltip content="根据身份证号出生日期计算实际年龄">
                      <el-icon><Info-Filled /></el-icon>
                    </el-tooltip>
                  </template>
                </el-input>
              </el-form-item>
            </el-col>
          </el-row>
          
          <!-- 第三行：身份证解析的信息 -->
          <el-row :gutter="16">
            <el-col :span="8">
              <el-form-item label="出生日期">
                <el-input 
                  v-model="playerForm.birthDate" 
                  placeholder="自动识别"
                  readonly
                />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="籍贯">
                <el-input v-model="playerForm.nativePlace" placeholder="自动识别" readonly />
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="性别">
                <el-select v-model="playerForm.gender" style="width: 100%">
                  <el-option label="男" value="male" />
                  <el-option label="女" value="female" />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>
          
          <!-- 通讯地址 -->
          <el-row :gutter="16">
            <el-col :span="24">
              <el-form-item label="通讯地址">
                <div class="address-row">
                  <el-select v-model="playerForm.province" placeholder="省" style="width: 110px" @change="onProvinceChange">
                    <el-option v-for="p in provinces" :key="p.code" :label="p.name" :value="p.code" />
                  </el-select>
                  <el-select v-model="playerForm.city" placeholder="市" style="width: 110px" :disabled="!playerForm.province" @change="onCityChange">
                    <el-option v-for="c in cities" :key="c.code" :label="c.name" :value="c.code" />
                  </el-select>
                  <el-select v-model="playerForm.district" placeholder="区" style="width: 110px" :disabled="!playerForm.city">
                    <el-option v-for="d in districts" :key="d.code" :label="d.name" :value="d.code" />
                  </el-select>
                </div>
              </el-form-item>
              <el-form-item label=" " class="address-detail-item">
                <el-input v-model="playerForm.addressDetail" placeholder="详细地址" />
              </el-form-item>
            </el-col>
          </el-row>
          
          <!-- 第四行：球衣信息 -->
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="球衣号" required>
                <el-input-number v-model="playerForm.jerseyNumber" :min="1" :max="99" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="位置" required>
                <el-select v-model="playerForm.position" placeholder="请选择位置" style="width: 100%">
                  <el-option label="守门员 GK" value="GK" />
                  <el-option label="后卫 DF" value="DF" />
                  <el-option label="前卫 MF" value="MF" />
                  <el-option label="前锋 FW" value="FW" />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>
          
          <!-- 第五行：国籍 -->
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="国籍">
                <el-input v-model="playerForm.nationality" placeholder="默认：中国" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="服装尺码">
                <el-select v-model="playerForm.clothingSize" placeholder="选择尺码" style="width: 100%">
                  <el-option v-for="s in ['S','M','L','XL','XXL','XXXL']" :key="s" :label="s" :value="s" />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>
          
          <!-- 第六行：身高体重 -->
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="身高(cm)">
                <el-input-number v-model="playerForm.height" :min="100" :max="250" style="width: 100%" placeholder="身高" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="体重(kg)">
                <el-input-number v-model="playerForm.weight" :min="30" :max="150" style="width: 100%" placeholder="体重" />
              </el-form-item>
            </el-col>
          </el-row>
          
          <el-divider content-position="left">联系方式</el-divider>
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="联系人">
                <el-input v-model="playerForm.contactName" placeholder="联系人姓名" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="联系电话">
                <el-input v-model="playerForm.contactPhone" placeholder="电话号码" />
              </el-form-item>
            </el-col>
          </el-row>
          <!-- 身份证照片上传 -->
          <!-- 球员照片上传（带裁剪和抠图） -->
          <el-divider content-position="left">球员照片（必填）</el-divider>
          <el-row :gutter="16">
            <el-col :span="24">
              <el-form-item label="球员照片" required>
                <div class="player-photo-section">
                  <AvatarCropper 
                    v-if="!playerForm.photoUrl"
                    @success="handleAvatarCropSuccess"
                  />
                  <div v-else class="photo-preview-wrapper">
                    <img :src="playerForm.photoUrl" class="photo-preview-img" />
                    <el-button size="small" type="danger" @click="playerForm.photoUrl = ''">
                      重新上传
                    </el-button>
                  </div>
                </div>
              </el-form-item>
            </el-col>
          </el-row>

          <el-divider content-position="left">身份证照片（非必填）</el-divider>
          <el-row :gutter="16">
            <el-col :span="12">
              <el-form-item label="身份证正面">
                <div class="idcard-upload">
                  <el-upload
                    class="idcard-uploader"
                    :show-file-list="false"
                    :before-upload="beforePhotoUpload"
                    :http-request="(opts) => handleIdCardUpload(opts, 'front')"
                    accept="image/*"
                  >
                    <div v-if="playerForm.idCardFront" class="idcard-preview">
                      <img :src="playerForm.idCardFront" />
                    </div>
                    <div v-else class="idcard-placeholder">
                      <el-icon :size="24"><Plus /></el-icon>
                      <span>点击上传正面</span>
                    </div>
                  </el-upload>
                </div>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="身份证反面">
                <div class="idcard-upload">
                  <el-upload
                    class="idcard-uploader"
                    :show-file-list="false"
                    :before-upload="beforePhotoUpload"
                    :http-request="(opts) => handleIdCardUpload(opts, 'back')"
                    accept="image/*"
                  >
                    <div v-if="playerForm.idCardBack" class="idcard-preview">
                      <img :src="playerForm.idCardBack" />
                    </div>
                    <div v-else class="idcard-placeholder">
                      <el-icon :size="24"><Plus /></el-icon>
                      <span>点击上传反面</span>
                    </div>
                  </el-upload>
                </div>
              </el-form-item>
            </el-col>
          </el-row>
        </el-form>
      </template>

      <template #footer>
        <el-button @click="showAddPlayer = false">取消</el-button>
        <el-button v-if="isEditingPlayer || activeTab === 'manual'" type="primary" :loading="submitting" @click="submitPlayer">
          {{ isEditingPlayer ? '保存' : '添加' }}
        </el-button>
        <el-button v-if="!isEditingPlayer && activeTab === 'library'" type="primary" :loading="batchAdding" :disabled="selectedLibraryPlayers.length === 0" @click="batchAddFromLibrary">
          批量添加 ({{ selectedLibraryPlayers.length }})
        </el-button>
      </template>
    </el-dialog>

    <!-- 批量导入球员对话框 -->
    <el-dialog
      v-model="showBatchImport"
      title="批量导入球员"
      width="800px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <!-- 下载模板 -->
      <div class="import-header">
        <p class="import-tip">下载模板并填写球员信息后，上传 Excel 文件即可批量导入</p>
        <el-button type="success" size="small" @click="downloadImportTemplate">
          <el-icon><Download /></el-icon> 下载模板
        </el-button>
      </div>

      <!-- 上传区域 -->
      <div class="import-upload-area" v-if="importParsedData.length === 0">
        <el-upload
          ref="importUploadRef"
          accept=".xlsx,.xls"
          :auto-upload="false"
          :show-file-list="false"
          :on-change="handleImportFileChange"
          drag
        >
          <el-icon class="el-icon--upload" :size="48"><UploadFilled /></el-icon>
          <div class="el-upload__text">
            将 Excel 文件拖拽到此处，或 <em>点击选择</em>
          </div>
          <template #tip>
            <div class="el-upload__tip">
              支持 .xlsx 格式，请使用模板文件填写球员信息
            </div>
          </template>
        </el-upload>
      </div>

      <!-- 预览区域 -->
      <div v-else class="import-preview">
        <div class="import-preview-header">
          <span class="import-preview-count">共解析到 <strong>{{ importParsedData.length }}</strong> 条球员记录</span>
          <div class="import-preview-actions">
            <el-button size="small" @click="clearImportData">重新选择</el-button>
            <el-button type="primary" size="small" :loading="batchImporting" @click="confirmBatchImport">
              确认导入 ({{ importParsedData.length }})
            </el-button>
          </div>
        </div>
        <!-- 列检测提示 -->
        <el-alert 
          v-if="colDetectInfo.姓名列"
          type="info" 
          :closable="false" 
          style="margin-bottom: 8px;"
          title="请确认以下列映射是否正确："
        >
          <template #default>
            <div style="font-size: 12px; line-height: 1.8;">
              <span v-for="(val, key) in colDetectInfo" :key="key" style="margin-right: 12px;">
                <strong>{{ key }}</strong>: {{ val }}
              </span>
            </div>
          </template>
        </el-alert>
        <el-table :data="importParsedData" max-height="380" size="small" border style="width: 100%">
          <el-table-column type="index" label="#" width="40" />
          <el-table-column prop="name" label="姓名" width="80" />
          <el-table-column prop="jerseyNumber" label="球号" width="60" align="center" />
          <el-table-column prop="idCard" label="身份证号" width="160" />
          <el-table-column prop="position" label="位置" width="70" align="center">
            <template #default="{ row }">
              <el-tag :type="getPositionType(row.position)" size="small">{{ getPositionLabel(row.position) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="jerseyName" label="球衣名" width="110" />
          <el-table-column prop="height" label="身高" width="60" align="center" />
          <el-table-column prop="weight" label="体重" width="60" align="center" />
          <el-table-column prop="contactPhone" label="联系电话" width="130" />
          <el-table-column prop="relatedPosition" label="关联职位" width="100" />
          <el-table-column label="状态" width="90" align="center">
            <template #default="{ row }">
              <el-tag v-if="row._error" type="danger" size="small">错误</el-tag>
              <el-tag v-else type="success" size="small">正常</el-tag>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="importErrors.length > 0" class="import-errors" style="margin-top: 12px;">
          <p class="import-errors-title">以下记录存在问题：</p>
          <p v-for="(err, i) in importErrors" :key="i" class="import-error-item">{{ err }}</p>
        </div>
      </div>

      <template #footer>
        <el-button @click="showBatchImport = false; clearImportData()">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 编辑球队对话框 -->
    <el-dialog
      v-model="showEditTeam"
      title="编辑球队"
      width="560px"
      :close-on-click-modal="false"
    >
      <el-form :model="teamEditForm" label-width="90px" label-position="top">
        <el-form-item label="球队编号">
          <el-input v-model="teamEditForm.teamCode" placeholder="如: 226E001" maxlength="20" />
        </el-form-item>
        <el-form-item label="全称" required>
          <el-input v-model="teamEditForm.name" placeholder="请输入球队全称" maxlength="50" />
        </el-form-item>
        <el-form-item label="简称" required>
          <el-input v-model="teamEditForm.shortName" placeholder="请输入球队简称" maxlength="20" />
        </el-form-item>

        <el-form-item label="球队建立时间">
          <el-date-picker v-model="teamEditForm.establishedDate" type="date" placeholder="选择建立时间" style="width: 100%" value-format="YYYY-MM-DD" />
        </el-form-item>

        <!-- 账号所有者即为负责人 -->

        <el-form-item label="球队Logo">
          <div class="logo-upload-wrapper">
            <div class="logo-input-row">
              <el-input v-model="teamEditForm.logoUrl" placeholder="上传后将自动填充URL" style="flex: 1;" />
              <AIImageGenerator
                type="teamLogo"
                :name="teamEditForm.name"
                color="blue"
                @success="(url) => teamEditForm.logoUrl = url"
              />
            </div>
            <el-button type="primary" size="small" style="margin-top: 8px;" @click="showLogoRemoveBg = true">
              <el-icon><Upload /></el-icon>
              上传Logo
            </el-button>
            <div class="logo-preview" v-if="teamEditForm.logoUrl">
              <img :src="teamEditForm.logoUrl" alt="Logo预览" />
            </div>
          </div>
        </el-form-item>

        <el-form-item label="球队简介">
          <el-input
            v-model="teamEditForm.description"
            type="textarea"
            :rows="3"
            placeholder="请输入球队简介"
            maxlength="200"
            show-word-limit
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="showEditTeam = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitTeamEdit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 队徽裁剪对话框 -->
    <ImageCropper
      v-model="showLogoCropper"
      :image-src="cropperImageSrc"
      @crop="handleLogoCropConfirm"
    />

    <!-- Logo 抠图上传弹窗 -->
    <el-dialog
      v-model="showLogoRemoveBg"
      title="上传球队 Logo"
      width="700px"
      destroy-on-close
      :close-on-click-modal="false"
    >
      <RemoveBgProcessor
        ref="logoRemoveBgRef"
        type="teamLogo"
        @success="handleLogoRemoveBgSuccess"
      />
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Upload, InfoFilled, Search, Refresh, Download, UploadFilled } from '@element-plus/icons-vue'
import { queryById, queryList, addRecord, updateRecord, deleteRecord, uploadFile, uploadFileViaCloud, uploadLargeFileViaCloud, getFileUrl, callFunction, getCurrentOwner } from '../../utils/cloud'
import AIImageGenerator from '../../components/common/AIImageGenerator.vue'
import AvatarCropper from '../../components/common/AvatarCropper.vue'
import { removeLogoBackground } from '../../utils/logoRemoveBg'
import ImageCropper from '../../components/common/ImageCropper.vue'
import RemoveBgProcessor from '../../components/common/RemoveBgProcessor.vue'
import { provincesData, cityMapData, districtMapData } from './areaData.js'
import { generateJerseyName } from '../../utils/jerseyName.js'

const route = useRoute()
const router = useRouter()
const teamId = route.params.id

const loading = ref(false)
const submitting = ref(false)
const uploadingPhoto = ref(false)
const uploadingIdCard = ref({ front: false, back: false })

// 省市区数据（从 areaData.js 导入，由 element-china-area-data 自动生成）
const provinces = ref(provincesData)

const cities = ref([])
const districts = ref([])



function onProvinceChange() {
  playerForm.value.city = ''
  playerForm.value.district = ''
  cities.value = cityMapData[playerForm.value.province] || []
}

function onCityChange() {
  playerForm.value.district = ''
  districts.value = districtMapData[playerForm.value.city] || []
}
const team = ref({})
const players = ref([])
const showAddPlayer = ref(false)
const showBatchImport = ref(false)
const isEditingPlayer = ref(false)
const editingPlayerId = ref('')

// 球员库相关
const activeTab = ref('manual')
const playerLibraryList = ref([])
const libraryLoading = ref(false)
const libraryKeyword = ref('')
const selectedLibraryPlayers = ref([])
const batchAdding = ref(false)
const libraryTableRef = ref(null)

// 球员库缓存（页面会话内只加载一次）
const playerLibraryCache = ref([])
const libraryCacheLoaded = ref(false)

// 批量导入相关
const importParsedData = ref([])
const importErrors = ref([])
const batchImporting = ref(false)
const colDetectInfo = ref({})
const importUploadRef = ref(null)

// 编辑球队相关
const showEditTeam = ref(false)
const teamEditForm = ref({
  name: '',
  teamCode: '',
  establishedDate: '',
  logoUrl: '',
  description: ''
})

// 队徽裁剪相关
const showLogoCropper = ref(false)
const showLogoRemoveBg = ref(false)
const logoRemoveBgRef = ref(null)
const cropperImageSrc = ref('')
const cropperPendingFile = ref(null)

const playerForm = ref({
  name: '', gender: 'male', birthDate: '', idCard: '',
  nationality: '中国', nativePlace: '', jerseyNumber: 1,
  position: '', jerseyName: '', clothingSize: '',
  contactName: '', contactPhone: '',
  photoUrl: '', registerTime: '',
  // 通讯地址
  province: '', city: '', district: '', addressDetail: '',
  // 身份证照片
  idCardFront: '', idCardBack: ''
})

const positionMap = { GK: '守门员', DF: '后卫', MF: '前卫', FW: '前锋' }
const positionTypeMap = { GK: 'danger', DF: '', MF: 'success', FW: 'warning' }

function getPositionLabel(pos) { return positionMap[pos] || pos || '-' }
function getPositionType(pos) { return positionTypeMap[pos] || '' }

// 计算年龄（用于表格显示）
function calculateAge(birthDate) {
  if (!birthDate) return '-'
  try {
    const birth = new Date(birthDate)
    if (isNaN(birth.getTime())) return '-'
    const now = new Date()
    let age = now.getFullYear() - birth.getFullYear()
    const monthDiff = now.getMonth() - birth.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
      age--
    }
    return age >= 0 ? age : '-'
  } catch (e) {
    return '-'
  }
}

// 平台年龄显示（根据身份证号出生日期计算）
const displayAge = computed(() => {
  if (!playerForm.value.birthDate) return '-'
  const birthDate = new Date(playerForm.value.birthDate)
  const now = new Date()
  let age = now.getFullYear() - birthDate.getFullYear()
  const monthDiff = now.getMonth() - birthDate.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) {
    age--
  }
  return age >= 0 ? `${age}岁` : '-'
})



// 解析身份证号
function parseIdCard(idCard) {
  if (!idCard || idCard.length !== 18) return null
  
  // 提取出生日期
  const year = idCard.substring(6, 10)
  const month = idCard.substring(10, 12)
  const day = idCard.substring(12, 14)
  const birthDate = `${year}-${month}-${day}`
  
  // 提取性别（第17位，奇数男，偶数女）
  const genderCode = parseInt(idCard.charAt(16))
  const gender = genderCode % 2 === 1 ? 'male' : 'female'
  
  // 提取籍贯（前6位地区码）- 显示城市
  const areaCode = idCard.substring(0, 6)
  const cityMap = {
    // 北京
    '1101': '北京市', '1102': '北京市',
    // 天津
    '1201': '天津市', '1202': '天津市',
    // 河北
    '1301': '石家庄市', '1302': '唐山市', '1303': '秦皇岛市', '1304': '邯郸市', '1305': '邢台市',
    '1306': '保定市', '1307': '张家口市', '1308': '承德市', '1309': '沧州市', '1310': '廊坊市', '1311': '衡水市',
    // 山西
    '1401': '太原市', '1402': '大同市', '1403': '阳泉市', '1404': '长治市', '1405': '晋城市',
    '1406': '朔州市', '1407': '晋中市', '1408': '运城市', '1409': '忻州市', '1410': '临汾市', '1411': '吕梁市',
    // 内蒙古
    '1501': '呼和浩特市', '1502': '包头市', '1503': '乌海市', '1504': '赤峰市', '1505': '通辽市',
    '1506': '鄂尔多斯市', '1507': '呼伦贝尔市', '1508': '巴彦淖尔市', '1509': '乌兰察布市',
    '1522': '兴安盟', '1525': '锡林郭勒盟', '1529': '阿拉善盟',
    // 辽宁
    '2101': '沈阳市', '2102': '大连市', '2103': '鞍山市', '2104': '抚顺市', '2105': '本溪市',
    '2106': '丹东市', '2107': '锦州市', '2108': '营口市', '2109': '阜新市', '2110': '辽阳市',
    '2111': '盘锦市', '2112': '铁岭市', '2113': '朝阳市', '2114': '葫芦岛市',
    // 吉林
    '2201': '长春市', '2202': '吉林市', '2203': '四平市', '2204': '辽源市', '2205': '通化市',
    '2206': '白山市', '2207': '松原市', '2208': '白城市', '2224': '延边朝鲜族自治州',
    // 黑龙江
    '2301': '哈尔滨市', '2302': '齐齐哈尔市', '2303': '鸡西市', '2304': '鹤岗市', '2305': '双鸭山市',
    '2306': '大庆市', '2307': '伊春市', '2308': '佳木斯市', '2309': '七台河市', '2310': '牡丹江市',
    '2311': '黑河市', '2312': '绥化市', '2327': '大兴安岭地区',
    // 上海
    '3101': '上海市', '3102': '上海市',
    // 江苏
    '3201': '南京市', '3202': '无锡市', '3203': '徐州市', '3204': '常州市', '3205': '苏州市',
    '3206': '南通市', '3207': '连云港市', '3208': '淮安市', '3209': '盐城市', '3210': '扬州市',
    '3211': '镇江市', '3212': '泰州市', '3213': '宿迁市',
    // 浙江
    '3301': '杭州市', '3302': '宁波市', '3303': '温州市', '3304': '嘉兴市', '3305': '湖州市',
    '3306': '绍兴市', '3307': '金华市', '3308': '衢州市', '3309': '舟山市', '3310': '台州市', '3311': '丽水市',
    // 安徽
    '3401': '合肥市', '3402': '芜湖市', '3403': '蚌埠市', '3404': '淮南市', '3405': '马鞍山市',
    '3406': '淮北市', '3407': '铜陵市', '3408': '安庆市', '3410': '黄山市', '3411': '滁州市',
    '3412': '阜阳市', '3413': '宿州市', '3415': '六安市', '3416': '亳州市', '3417': '池州市', '3418': '宣城市',
    // 福建
    '3501': '福州市', '3502': '厦门市', '3503': '莆田市', '3504': '三明市', '3505': '泉州市',
    '3506': '漳州市', '3507': '南平市', '3508': '龙岩市', '3509': '宁德市',
    // 江西
    '3601': '南昌市', '3602': '景德镇市', '3603': '萍乡市', '3604': '九江市', '3605': '新余市',
    '3606': '鹰潭市', '3607': '赣州市', '3608': '吉安市', '3609': '宜春市', '3610': '抚州市', '3611': '上饶市',
    // 山东
    '3701': '济南市', '3702': '青岛市', '3703': '淄博市', '3704': '枣庄市', '3705': '东营市',
    '3706': '烟台市', '3707': '潍坊市', '3708': '济宁市', '3709': '泰安市', '3710': '威海市',
    '3711': '日照市', '3713': '临沂市', '3714': '德州市', '3715': '聊城市', '3716': '滨州市', '3717': '菏泽市',
    // 河南
    '4101': '郑州市', '4102': '开封市', '4103': '洛阳市', '4104': '平顶山市', '4105': '安阳市',
    '4106': '鹤壁市', '4107': '新乡市', '4108': '焦作市', '4109': '濮阳市', '4110': '许昌市',
    '4111': '漯河市', '4112': '三门峡市', '4113': '南阳市', '4114': '商丘市', '4115': '信阳市',
    '4116': '周口市', '4117': '驻马店市', '4190': '省直辖县级行政区划',
    // 湖北
    '4201': '武汉市', '4202': '黄石市', '4203': '十堰市', '4205': '宜昌市', '4206': '襄阳市',
    '4207': '鄂州市', '4208': '荆门市', '4209': '孝感市', '4210': '荆州市', '4211': '黄冈市',
    '4212': '咸宁市', '4213': '随州市', '4228': '恩施土家族苗族自治州', '4290': '省直辖县级行政区划',
    // 湖南
    '4301': '长沙市', '4302': '株洲市', '4303': '湘潭市', '4304': '衡阳市', '4305': '邵阳市',
    '4306': '岳阳市', '4307': '常德市', '4308': '张家界市', '4309': '益阳市', '4310': '郴州市',
    '4311': '永州市', '4312': '怀化市', '4313': '娄底市', '4331': '湘西土家族苗族自治州',
    // 广东
    '4401': '广州市', '4402': '韶关市', '4403': '深圳市', '4404': '珠海市', '4405': '汕头市',
    '4406': '佛山市', '4407': '江门市', '4408': '湛江市', '4409': '茂名市', '4412': '肇庆市',
    '4413': '惠州市', '4414': '梅州市', '4415': '汕尾市', '4416': '河源市', '4417': '阳江市',
    '4418': '清远市', '4419': '东莞市', '4420': '中山市', '4451': '潮州市', '4452': '揭阳市', '4453': '云浮市',
    // 广西
    '4501': '南宁市', '4502': '柳州市', '4503': '桂林市', '4504': '梧州市', '4505': '北海市',
    '4506': '防城港市', '4507': '钦州市', '4508': '贵港市', '4509': '玉林市', '4510': '百色市',
    '4511': '贺州市', '4512': '河池市', '4513': '来宾市', '4514': '崇左市',
    // 海南
    '4601': '海口市', '4602': '三亚市', '4603': '三沙市', '4604': '儋州市', '4690': '省直辖县级行政区划',
    // 重庆
    '5001': '重庆市', '5002': '重庆市',
    // 四川
    '5101': '成都市', '5103': '自贡市', '5104': '攀枝花市', '5105': '泸州市', '5106': '德阳市',
    '5107': '绵阳市', '5108': '广元市', '5109': '遂宁市', '5110': '内江市', '5111': '乐山市',
    '5113': '南充市', '5114': '眉山市', '5115': '宜宾市', '5116': '广安市', '5117': '达州市',
    '5118': '雅安市', '5119': '巴中市', '5120': '资阳市', '5132': '阿坝藏族羌族自治州',
    '5133': '甘孜藏族自治州', '5134': '凉山彝族自治州',
    // 贵州
    '5201': '贵阳市', '5202': '六盘水市', '5203': '遵义市', '5204': '安顺市', '5205': '毕节市',
    '5206': '铜仁市', '5223': '黔西南布依族苗族自治州', '5226': '黔东南苗族侗族自治州', '5227': '黔南布依族苗族自治州',
    // 云南
    '5301': '昆明市', '5303': '曲靖市', '5304': '玉溪市', '5305': '保山市', '5306': '昭通市',
    '5307': '丽江市', '5308': '普洱市', '5309': '临沧市', '5323': '楚雄彝族自治州', '5325': '红河哈尼族彝族自治州',
    '5326': '文山壮族苗族自治州', '5328': '西双版纳傣族自治州', '5329': '大理白族自治州',
    '5331': '德宏傣族景颇族自治州', '5333': '怒江傈僳族自治州', '5334': '迪庆藏族自治州',
    // 西藏
    '5401': '拉萨市', '5402': '日喀则市', '5403': '昌都市', '5404': '林芝市', '5405': '山南市',
    '5406': '那曲市', '5425': '阿里地区',
    // 陕西
    '6101': '西安市', '6102': '铜川市', '6103': '宝鸡市', '6104': '咸阳市', '6105': '渭南市',
    '6106': '延安市', '6107': '汉中市', '6108': '榆林市', '6109': '安康市', '6110': '商洛市',
    // 甘肃
    '6201': '兰州市', '6202': '嘉峪关市', '6203': '金昌市', '6204': '白银市', '6205': '天水市',
    '6206': '武威市', '6207': '张掖市', '6208': '平凉市', '6209': '酒泉市', '6210': '庆阳市',
    '6211': '定西市', '6212': '陇南市', '6229': '临夏回族自治州', '6230': '甘南藏族自治州',
    // 青海
    '6301': '西宁市', '6302': '海东市', '6322': '海北藏族自治州', '6323': '黄南藏族自治州',
    '6325': '海南藏族自治州', '6326': '果洛藏族自治州', '6327': '玉树藏族自治州', '6328': '海西蒙古族藏族自治州',
    // 宁夏
    '6401': '银川市', '6402': '石嘴山市', '6403': '吴忠市', '6404': '固原市', '6405': '中卫市',
    // 新疆
    '6501': '乌鲁木齐市', '6502': '克拉玛依市', '6504': '吐鲁番市', '6505': '哈密市',
    '6523': '昌吉回族自治州', '6527': '博尔塔拉蒙古自治州', '6528': '巴音郭楞蒙古自治州',
    '6529': '阿克苏地区', '6530': '克孜勒苏柯尔克孜自治州', '6531': '喀什地区', '6532': '和田地区',
    '6540': '伊犁哈萨克自治州', '6542': '塔城地区', '6543': '阿勒泰地区', '6590': '自治区直辖县级行政区划'
  }
  const cityCode = areaCode.substring(0, 4)
  const nativePlace = cityMap[cityCode] || ''
  
  return { birthDate, gender, nativePlace }
}

// 姓名输入处理
function onNameInput() {
  if (!isEditingPlayer.value && playerForm.value.name) {
    playerForm.value.jerseyName = generateJerseyName(playerForm.value.name)
  }
  // 联系人自动填充姓名，可手动修改
  if (!playerForm.value.contactName) {
    playerForm.value.contactName = playerForm.value.name
  }
}

// 身份证号输入处理
function onIdCardInput() {
  const idCard = playerForm.value.idCard
  if (idCard && idCard.length === 18) {
    const parsed = parseIdCard(idCard)
    if (parsed) {
      playerForm.value.birthDate = parsed.birthDate
      playerForm.value.gender = parsed.gender
      if (!playerForm.value.nativePlace) {
        playerForm.value.nativePlace = parsed.nativePlace
      }
    }
  }
}

// 球员照片上传
async function beforePhotoUpload(file) {
  const isImage = file.type.startsWith('image/')
  const isLt2M = file.size / 1024 / 1024 < 2

  if (!isImage) {
    ElMessage.error('只能上传图片文件！')
    return false
  }
  if (!isLt2M) {
    ElMessage.error('图片大小不能超过 2MB！')
    return false
  }
  return true
}

// 处理头像裁剪成功
async function handleAvatarCropSuccess(base64Image) {
  try {
    uploadingPhoto.value = true

    // ★ 压缩到 300px 以内
    const compressed = await compressBase64(base64Image, 300)
    console.log('[TeamDetail] 球员头像压缩: ' + (compressed.length / 1024).toFixed(1) + 'KB')

    // base64 → Blob → File
    const base64Data = compressed.split(',')[1]
    const byteCharacters = atob(base64Data)
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'image/png' })
    const file = new File([blob], `avatar-${Date.now()}.png`, { type: 'image/png' })

    // ★ 分片上传（100KB/片，兼顾速度与稳定性）
    const cloudPath = `player-photos/${teamId}/${Date.now()}-avatar.png`
    const result = await uploadLargeFileViaCloud(cloudPath, file, { chunkSize: 100 * 1024 })

    if (result.success) {
      playerForm.value.photoUrl = result.tempUrl || ''
      playerForm.value.photoFileID = result.fileId || result.fileID || ''
      ElMessage.success('头像上传成功！')
    } else {
      throw new Error(result.message || '上传失败')
    }
  } catch (err) {
    console.error('头像上传失败:', err)
    ElMessage.error('上传失败: ' + err.message)
  } finally {
    uploadingPhoto.value = false
  }
}

async function handlePhotoUpload(options) {
  uploadingPhoto.value = true
  try {
    const { file } = options
    const cloudPath = `player-photos/${teamId}/${Date.now()}-${file.name}`
    // ★ 分片上传（32KB/片）
    const result = await uploadLargeFileViaCloud(cloudPath, file, { chunkSize: 32 * 1024 })
    if (result.success) {
      playerForm.value.photoUrl = result.tempUrl || ''
      playerForm.value.photoFileID = result.fileId || result.fileID || ''
      ElMessage.success('照片上传成功！')
    } else {
      throw new Error(result.message || '上传失败')
    }
  } catch (err) {
    ElMessage.error('上传失败: ' + (err.message || '未知错误'))
  } finally {
    uploadingPhoto.value = false
  }
}

// 身份证照片上传
async function handleIdCardUpload(options, side) {
  uploadingIdCard.value[side] = true
  try {
    const { file } = options
    const cloudPath = `idcard-photos/${teamId}/${Date.now()}-${side}-${file.name}`
    // ★ 分片上传（32KB/片）
    const result = await uploadLargeFileViaCloud(cloudPath, file, { chunkSize: 32 * 1024 })
    if (result.success) {
      if (side === 'front') {
        playerForm.value.idCardFront = result.tempUrl || ''
      } else {
        playerForm.value.idCardBack = result.tempUrl || ''
      }
      ElMessage.success(`身份证${side === 'front' ? '正面' : '反面'}上传成功！`)
    } else {
      throw new Error(result.message || '上传失败')
    }
  } catch (err) {
    ElMessage.error('上传失败: ' + (err.message || '未知错误'))
  } finally {
    uploadingIdCard.value[side] = false
  }
}

function viewPlayerCard(row) {
  router.push('/players/' + row._id)
}

function editPlayer(row) {
  isEditingPlayer.value = true
  editingPlayerId.value = row._id
  playerForm.value = {
    name: row.name || '', gender: row.gender || 'male',
    birthDate: row.birthDate || '', idCard: row.idCard || '',
    nationality: row.nationality || '中国', nativePlace: row.nativePlace || '',
    jerseyNumber: row.jerseyNumber || 1, position: row.position || '',
    jerseyName: row.jerseyName || '', clothingSize: row.clothingSize || '',
    height: row.height || null, weight: row.weight || null,
    contactName: row.contactName || '', contactPhone: row.contactPhone || '',
    photoUrl: row.photoUrl || '', registerTime: row.registerTime || row.createTime || new Date().toISOString(),
    province: row.province || '', city: row.city || '', district: row.district || '', addressDetail: row.addressDetail || '',
    idCardFront: row.idCardFront || '', idCardBack: row.idCardBack || ''
  }
  showAddPlayer.value = true
}

async function removePlayer(row) {
  try {
    await ElMessageBox.confirm(`确定删除球员「${row.name}」吗？`, '删除确认', { type: 'warning' })
    if (!row._id) {
      ElMessage.error('球员记录缺少ID，无法删除')
      console.error('删除失败：row._id 为空', JSON.stringify(row))
      return
    }
    // 改用 webBatchUpdate 云函数删除（权限与 update 一致）
    const res = await callFunction('webBatchUpdate', {
      action: 'delete',
      collection: 'players',
      id: row._id
    })
    if (res && res.success) {
      ElMessage.success('删除成功')
      loadPlayers()
    } else {
      const msg = res?.message || '删除失败'
      console.error('删除失败:', res)
      ElMessage.error('删除失败: ' + msg)
    }
  } catch (err) {
    if (err !== 'cancel') {
      const msg = err?.message || String(err)
      console.error('删除球员失败:', err)
      ElMessage.error('删除失败: ' + msg)
    }
  }
}

async function submitPlayer() {
  if (!playerForm.value.name.trim()) {
    ElMessage.warning('请输入球员姓名')
    return
  }
  if (!playerForm.value.idCard || playerForm.value.idCard.length !== 18) {
    ElMessage.warning('请输入18位身份证号')
    return
  }
  if (!playerForm.value.photoUrl) {
    ElMessage.warning('请上传球员照片')
    return
  }
  // 检查球衣号是否有效（1-99）
  const jerseyNum = parseInt(playerForm.value.jerseyNumber)
  if (isNaN(jerseyNum) || jerseyNum < 1 || jerseyNum > 99) {
    ElMessage.warning('球衣号码必须在1-99之间')
    return
  }

  // 检查同一球队内是否已有相同身份证号的球员（避免重复加入同一球队）
  // 编辑时排除自己
  if (!isEditingPlayer.value) {
    try {
      const existInTeam = await queryList('players', {
        where: {
          idCard: playerForm.value.idCard,
          $or: [
            { teamId: teamId },
            { teamCode: teamId }
          ]
        }
      })
      if (existInTeam && existInTeam.length > 0) {
        ElMessage.warning('该球员已在本球队中，无需重复添加')
        submitting.value = false
        return
      }
    } catch (checkErr) {
      console.warn('检查球员重复失败，继续提交:', checkErr.message)
    }
  }

  // 检查同一球队内球衣号是否重复
  try {
    const jerseyWhere = {
      jerseyNumber: jerseyNum,
      $or: [
        { teamId: teamId },
        { teamCode: teamId }
      ]
    }
    // 编辑时排除自己
    if (isEditingPlayer.value && editingPlayerId.value) {
      jerseyWhere._id = { $ne: editingPlayerId.value }
    }
    const existJersey = await queryList('players', { where: jerseyWhere })
    if (existJersey && existJersey.length > 0) {
      ElMessage.warning(`球衣号码 ${jerseyNum} 已被球员「${existJersey[0].name}」使用`)
      submitting.value = false
      return
    }
  } catch (checkErr) {
    console.warn('检查球衣号重复失败，继续提交:', checkErr.message)
  }
  submitting.value = true
  try {
    // 如果有 photoFileID（云存储fileID），使用它作为永久保存的photoUrl
    // 这样避免临时URL过期导致图片无法显示
    const photoUrlToSave = playerForm.value.photoFileID || playerForm.value.photoUrl
    
    const data = {
      ...playerForm.value,
      playerId: generatePlayerId(team.value.teamCode || teamId, 'C'),
      photoUrl: photoUrlToSave,
      teamCode: teamId,
      teamName: team.value.name,
      // 新注册时设置注册时间
      registerTime: isEditingPlayer.value ? playerForm.value.registerTime : new Date().toISOString()
    }
    if (isEditingPlayer.value) {
      await updateRecord('players', editingPlayerId.value, data)
      ElMessage.success('保存成功')
    } else {
      await addRecord('players', data)

      // 同步到球员库（按身份证号去重）
      try {
        const owner = getCurrentOwner()
        const existWhere = owner
          ? { idCard: playerForm.value.idCard, owner }
          : { idCard: playerForm.value.idCard }
        const exist = await queryList('player_library', { where: existWhere })
        if (!exist || exist.length === 0) {
          await addRecord('player_library', {
            name: playerForm.value.name,
            idCard: playerForm.value.idCard,
            gender: playerForm.value.gender,
            birthDate: playerForm.value.birthDate,
            nativePlace: playerForm.value.nativePlace,
            nationality: playerForm.value.nationality,
            photoUrl: photoUrlToSave,
            photoFileID: playerForm.value.photoFileID || '',
            jerseyName: playerForm.value.jerseyName || '',
            position: playerForm.value.position || '',
            clothingSize: playerForm.value.clothingSize || '',
            height: playerForm.value.height || null,
            weight: playerForm.value.weight || null,
            contactName: playerForm.value.contactName || '',
            contactPhone: playerForm.value.contactPhone || '',
            province: playerForm.value.province || '',
            city: playerForm.value.city || '',
            district: playerForm.value.district || '',
            addressDetail: playerForm.value.addressDetail || '',
            idCardFront: playerForm.value.idCardFront || '',
            idCardBack: playerForm.value.idCardBack || '',
            owner: owner || '',
            creator: '',
            createTime: new Date(),
            updateTime: new Date()
          })
        }
      } catch (err) {
        console.warn('同步到球员库失败:', err)
      }

      ElMessage.success('添加成功')
    }
    showAddPlayer.value = false
    resetPlayerForm()
    loadPlayers()
  } catch (err) {
    ElMessage.error('操作失败: ' + err.message)
  } finally {
    submitting.value = false
  }
}

function resetPlayerForm() {
  playerForm.value = {
    name: '', gender: 'male', birthDate: '', idCard: '',
    nationality: '中国', nativePlace: '', jerseyNumber: 1,
    position: '', jerseyName: '', clothingSize: '',
    height: null, weight: null,
    contactName: '', contactPhone: '',
    photoUrl: '', registerTime: new Date().toISOString(),
    province: '', city: '', district: '', addressDetail: '',
    idCardFront: '', idCardBack: ''
  }
  isEditingPlayer.value = false
  editingPlayerId.value = ''
  activeTab.value = 'manual'
}

// 身份证号脱敏显示
function maskIdCard(idCard) {
  if (!idCard || idCard.length !== 18) return idCard || '-'
  return idCard.substring(0, 6) + '********' + idCard.substring(14)
}

// 加载球员库列表（增量同步 + 排除当前球队已有球员 + 缓存机制）
async function loadPlayerLibrary(forceRefresh = false) {
  libraryLoading.value = true

  try {
    const owner = getCurrentOwner()

    // 1. 先获取当前球队已有球员的身份证号（用于排除）
    const existingIdCards = new Set()
    for (const p of players.value) {
      if (p.idCard) existingIdCards.add(p.idCard)
    }

    // 2. 如果有缓存且不是强制刷新，直接用缓存数据过滤
    if (!forceRefresh && libraryCacheLoaded.value && playerLibraryCache.value.length > 0) {
      let cachedList = playerLibraryCache.value.filter(p => !existingIdCards.has(p.idCard))

      // 如果有搜索关键词，在缓存中过滤
      const keyword = libraryKeyword.value.trim()
      if (keyword) {
        cachedList = cachedList.filter(p =>
          (p.name && p.name.includes(keyword)) ||
          (p.idCard && p.idCard.includes(keyword))
        )
      }

      playerLibraryList.value = cachedList
      libraryLoading.value = false
      return
    }

    // 3. 增量同步：把 players 集合中不在库里的球员同步到 player_library
    try {
      const allPlayers = await queryList('players', { limit: 1000, orderBy: { createTime: 'desc' } })
      if (allPlayers && allPlayers.length > 0) {
        // 先查库里已有的身份证号
        const libRes = await queryList('player_library', {
          where: owner ? { owner } : {},
          limit: 1000
        })
        const libIdCards = new Set((libRes || []).map(p => p.idCard).filter(Boolean))

        // 按身份证号去重，只同步不在库里的
        const seenIds = new Set()
        const toSync = []
        for (const p of allPlayers) {
          const idKey = p.idCard || p._id
          if (!idKey || seenIds.has(idKey) || libIdCards.has(p.idCard)) continue
          seenIds.add(idKey)
          toSync.push(p)
        }

        let synced = 0
        for (const p of toSync) {
          try {
            await addRecord('player_library', {
              name: p.name || '',
              idCard: p.idCard || '',
              gender: p.gender || 'male',
              birthDate: p.birthDate || '',
              nativePlace: p.nativePlace || '',
              nationality: p.nationality || '中国',
              photoUrl: p.photoUrl || '',
              photoFileID: p.photoFileID || '',
              jerseyName: p.jerseyName || '',
              position: p.position || '',
              clothingSize: p.clothingSize || '',
              height: p.height || null,
              weight: p.weight || null,
              contactName: p.contactName || '',
              contactPhone: p.contactPhone || '',
              province: p.province || '',
              city: p.city || '',
              district: p.district || '',
              addressDetail: p.addressDetail || '',
              idCardFront: p.idCardFront || '',
              idCardBack: p.idCardBack || '',
              owner: owner || '',
              creator: '',
              createTime: new Date(),
              updateTime: new Date()
            })
            synced++
          } catch (syncErr) {
            console.warn('同步球员到库失败:', p.name, syncErr)
          }
        }
        if (synced > 0) {
        }
      }
    } catch (syncErr) {
      console.warn('增量同步球员库失败:', syncErr)
    }

    // 4. 查询球员库（全量）
    const params = { orderBy: { createTime: 'desc' }, limit: 1000 }

    let list = []
    const where = owner ? { owner } : {}
    const listParams = { ...params, where: { ...(params.where || {}), ...where } }
    try {
      const res = await queryList('player_library', listParams)
      list = res || []
    } catch (queryErr) {
      console.warn('player_library 查询失败:', queryErr.message)
    }

    // 5. 排除当前球队已有球员
    list = list.filter(p => !existingIdCards.has(p.idCard))

    // 6. 转换 cloud:// 格式的头像为临时 URL
    for (const player of list) {
      if (player.photoUrl && player.photoUrl.startsWith('cloud://')) {
        player._photoFileID = player.photoUrl
        try {
          player.photoUrl = await getFileUrl(player.photoUrl)
        } catch (err) {
          console.warn('获取头像临时URL失败:', player.name, err)
        }
      }
    }

    // 7. 保存到缓存
    playerLibraryCache.value = [...list]
    libraryCacheLoaded.value = true

    // 8. 如果有搜索关键词，在前端过滤
    const keyword = libraryKeyword.value.trim()
    if (keyword) {
      list = list.filter(p =>
        (p.name && p.name.includes(keyword)) ||
        (p.idCard && p.idCard.includes(keyword))
      )
    }

    playerLibraryList.value = list
  } catch (err) {
    console.error('加载球员库失败:', err)
    playerLibraryList.value = []
  } finally {
    libraryLoading.value = false
  }
}

// 处理球员库复选框选择变化
function handleLibrarySelectionChange(selection) {
  selectedLibraryPlayers.value = selection
}

// 批量从球员库添加
async function batchAddFromLibrary() {
  if (selectedLibraryPlayers.value.length === 0) {
    ElMessage.warning('请先选择要添加的球员')
    return
  }

  batchAdding.value = true
  let successCount = 0
  let failCount = 0
  let skipCount = 0

  // 预先获取当前球队所有球员（用于重复检测和球衣号分配）
  let existingPlayers = []
  let usedJerseyNumbers = new Set()
  try {
    const [byTeamId, byTeamCode] = await Promise.all([
      queryList('players', { where: { teamId: teamId }, limit: 1000 }),
      queryList('players', { where: { teamCode: teamId }, limit: 1000 })
    ])
    const seen = new Set()
    for (const p of [...(byTeamId || []), ...(byTeamCode || [])]) {
      if (seen.has(p._id)) continue
      seen.add(p._id)
      existingPlayers.push(p)
      if (p.jerseyNumber) usedJerseyNumbers.add(parseInt(p.jerseyNumber))
    }
  } catch (e) {
    console.warn('预加载球队球员失败:', e)
  }

  // 构建已存在的球员标识集合（按 idCard 或 name+birthDate）
  const existingKeys = new Set()
  for (const p of existingPlayers) {
    if (p.idCard) {
      existingKeys.add(`idCard:${p.idCard}`)
    } else {
      existingKeys.add(`name:${p.name || ''}|birth:${p.birthDate || ''}`)
    }
  }

  for (const player of selectedLibraryPlayers.value) {
    try {
      // 检查是否已在球队中（支持无idCard的球员用 name+birthDate 判断）
      let isExist = false
      if (player.idCard) {
        isExist = existingKeys.has(`idCard:${player.idCard}`)
      } else {
        isExist = existingKeys.has(`name:${player.name || ''}|birth:${player.birthDate || ''}`)
      }
      if (isExist) {
        skipCount++
        continue
      }

      // 分配最小可用球衣号（1-99）
      let jerseyNum = 1
      for (let n = 1; n <= 99; n++) {
        if (!usedJerseyNumbers.has(n)) {
          jerseyNum = n
          usedJerseyNumbers.add(n)
          break
        }
      }

      const data = {
        name: player.name || '',
        gender: player.gender || 'male',
        birthDate: player.birthDate || '',
        idCard: player.idCard || '',
        nationality: player.nationality || '中国',
        nativePlace: player.nativePlace || '',
        jerseyNumber: jerseyNum,
        position: player.position || 'MF',
        jerseyName: player.jerseyName || '',
        clothingSize: player.clothingSize || '',
        height: player.height || null,
        weight: player.weight || null,
        contactName: player.contactName || '',
        contactPhone: player.contactPhone || '',
        photoUrl: player.photoUrl || '',
        photoFileID: player._photoFileID || player.photoFileID || '',
        registerTime: new Date().toISOString(),
        province: player.province || '',
        city: player.city || '',
        district: player.district || '',
        addressDetail: player.addressDetail || '',
        idCardFront: player.idCardFront || '',
        idCardBack: player.idCardBack || '',
        teamCode: teamId,
        teamName: team.value ? team.value.name : ''
      }
      if (!data.playerId) {
        data.playerId = generatePlayerId(team.value.teamCode || teamId, 'C');
      }

      await addRecord('players', data)
      successCount++
      // 标记为已存在，防止同批次重复添加
      if (player.idCard) {
        existingKeys.add(`idCard:${player.idCard}`)
      } else {
        existingKeys.add(`name:${player.name || ''}|birth:${player.birthDate || ''}`)
      }
    } catch (err) {
      console.error(`添加球员 ${player.name} 失败:`, err)
      failCount++
    }
  }

  batchAdding.value = false

  // 显示结果
  let msg = ''
  if (successCount > 0) msg += `成功添加 ${successCount} 名球员`
  if (skipCount > 0) msg += `${msg ? '，' : ''}${skipCount} 名已在球队中`
  if (failCount > 0) msg += `${msg ? '，' : ''}${failCount} 名失败`

  if (failCount === 0) {
    ElMessage.success(msg || '添加完成')
  } else {
    ElMessage.warning(msg || '添加完成')
  }

  // 清空选择
  selectedLibraryPlayers.value = []
  if (libraryTableRef.value) {
    libraryTableRef.value.clearSelection()
  }

  // 刷新列表
  loadPlayers()

  // 关闭弹窗
  if (successCount > 0) {
    showAddPlayer.value = false
  }
}

// 从球员库选择 — 填充到手动新建表单
function selectFromLibrary(player) {
  // 填充表单
  playerForm.value = {
    name: player.name || '',
    gender: player.gender || 'male',
    birthDate: player.birthDate || '',
    idCard: player.idCard || '',
    nationality: player.nationality || '中国',
    nativePlace: player.nativePlace || '',
    jerseyNumber: 1,
    position: player.position || '',
    jerseyName: player.jerseyName || '',
    clothingSize: player.clothingSize || '',
    height: player.height || null,
    weight: player.weight || null,
    contactName: player.contactName || '',
    contactPhone: player.contactPhone || '',
    photoUrl: player.photoUrl || '',
    photoFileID: player._photoFileID || player.photoFileID || '',
    registerTime: new Date().toISOString(),
    province: player.province || '',
    city: player.city || '',
    district: player.district || '',
    addressDetail: player.addressDetail || '',
    idCardFront: player.idCardFront || '',
    idCardBack: player.idCardBack || ''
  }

  // 更新省市区联动
  if (playerForm.value.province) {
    cities.value = cityMapData[playerForm.value.province] || []
  }
  if (playerForm.value.city) {
    districts.value = districtMapData[playerForm.value.city] || []
  }

  // 切换到手新建选项卡
  activeTab.value = 'manual'
  ElMessage.success(`已选择「${player.name}」，请确认球衣号和位置后提交`)
}

// AI生成队徽成功回调
async function handleAISuccess(url) {
  try {
    // 使用云函数更新（确保权限）
    const res = await callFunction('webBatchUpdate', {
      collection: 'teams',
      id: teamId,
      data: { logo: url, logoUrl: url }
    })

    // 同时更新本地数据
    team.value.logo = url
    team.value.logoUrl = url

    // 强制刷新UI
    team.value = { ...team.value }

    ElMessage.success('队徽已更新')
  } catch (err) {
    console.error('更新失败:', err)
    ElMessage.error('更新失败: ' + (err.message || '未知错误'))
  }
}

watch(showAddPlayer, (val) => {
  if (val) {
    // 打开弹窗时预加载球员库
    loadPlayerLibrary()
  } else {
    resetPlayerForm()
    clearImportData()
  }
})

// 编辑球队
function editTeam() {
  teamEditForm.value = {
    name: team.value.name || '',
    teamCode: team.value.teamCode || '',
    establishedDate: team.value.establishedDate || '',
    shortName: team.value.shortName || '',
    logoUrl: team.value.logoUrl || team.value.logo || '',
    description: team.value.description || ''
  }
  showEditTeam.value = true
}

// ========== 批量导入球员（Excel）==========

const IMPORT_INSTRUCTION_START_ROW = 38

// 位置映射：中文 → 代码
const POSITION_MAP_CN = {
  '守门员': 'GK', '门将': 'GK',
  '后卫': 'DF', '边后卫': 'DF', '中后卫': 'DF',
  '前卫': 'MF', '中场': 'MF',
  '前锋': 'FW', '前峰': 'FW'
}

// 下载导入模板
function downloadImportTemplate() {
  const a = document.createElement('a')
  a.href = `${import.meta.env.BASE_URL}templates/player-import-template.xlsx`
  a.download = '球员导入模板.xlsx'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)

  ElMessage.success('模板下载成功，请填写后重新上传')
}

// 处理导入文件选择
async function handleImportFileChange(file) {
  const reader = new FileReader()
  reader.onload = async (e) => {
    try {
      const XLSX = await import('xlsx')
      const data = new Uint8Array(e.target.result)
      const workbook = XLSX.read(data, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 })
      
      if (!jsonData || jsonData.length < 2) {
        ElMessage.error('Excel 文件为空或格式不正确')
        return
      }
      
      // 查找表头行（找包含"姓名"的那一行）
      let headerRowIndex = -1
      for (let i = 0; i < Math.min(jsonData.length, 10); i++) {
        const row = jsonData[i]
        if (row && row.some(cell => String(cell || '').includes('姓名'))) {
          headerRowIndex = i
          break
        }
      }
      if (headerRowIndex === -1) {
        ElMessage.error('未找到列头行（需包含"姓名"列），请确认使用模板格式')
        return
      }
      
      const headers = jsonData[headerRowIndex].map(h => String(h || '').trim())
      const candidateRows = jsonData.slice(headerRowIndex + 1)
        .map((row, index) => ({ row, excelRowNumber: headerRowIndex + index + 2 }))
        .filter(({ row }) => row && row.some(c => String(c || '').trim()))
      
      if (candidateRows.length === 0) {
        ElMessage.warning('Excel 中没有有效的数据行')
        return
      }
      
      // 列索引映射（优先精确匹配，再模糊匹配，避免"球衣名"误匹配"姓名"等）
      function findCol(keywords, excludes = []) {
        // 1. 精确匹配
        let idx = headers.findIndex(h => keywords.some(k => h === k))
        // 2. 模糊匹配（排除含特定关键词的列）
        if (idx === -1) {
          idx = headers.findIndex(h => 
            keywords.some(k => h.includes(k)) && 
            !excludes.some(e => h.includes(e))
          )
        }
        return idx
      }
      
      const colMap = {
        serial: findCol(['序号', '编号', '顺序'], []),
        name: findCol(['姓名'], ['球衣', '号码', '球衣名', '缩写', '拼音']),
        idCard: findCol(['身份证号', '身份证', '证件号', '证件']),
        jerseyNumber: findCol(['球号', '号码'], ['身份证']),
        jerseyName: findCol(['球衣名', '姓名号码', '球衣名缩写', '拼音名'], []),
        position: findCol(['球场位置', '位置', '场上位置'], ['关联职位']),
        height: findCol(['身高(cm)', '身高']),
        weight: findCol(['体重(kg)', '体重(KG)', '体重']),
        contactName: findCol(['联系人', '联系人姓名', '联系姓名']),
        contactPhone: findCol(['联系电话', '手机号', '手机', '电话', '联系方式']),
        relatedPosition: findCol(['关联职位', '职务', '职位', '关联'], ['球场位置'])
      }
      
      // 调试日志 & 用户可见提示
      const info = {
        姓名列: colMap.name >= 0 ? `第${colMap.name + 1}列「${headers[colMap.name]}」` : '未找到',
        身份证列: colMap.idCard >= 0 ? `第${colMap.idCard + 1}列「${headers[colMap.idCard]}」` : '未找到',
        球号列: colMap.jerseyNumber >= 0 ? `第${colMap.jerseyNumber + 1}列「${headers[colMap.jerseyNumber]}」` : '未找到',
        球衣名列: colMap.jerseyName >= 0 ? `第${colMap.jerseyName + 1}列「${headers[colMap.jerseyName]}」` : '未找到（将自动生成）',
        位置列: colMap.position >= 0 ? `第${colMap.position + 1}列「${headers[colMap.position]}」` : '未找到',
        联系人列: colMap.contactName >= 0 ? `第${colMap.contactName + 1}列「${headers[colMap.contactName]}」` : '未找到',
        联系电话列: colMap.contactPhone >= 0 ? `第${colMap.contactPhone + 1}列「${headers[colMap.contactPhone]}」` : '未找到',
        序号列: colMap.serial >= 0 ? `第${colMap.serial + 1}列「${headers[colMap.serial]}」` : '未找到（不影响导入）',
        关联职位列: colMap.relatedPosition >= 0 ? `第${colMap.relatedPosition + 1}列「${headers[colMap.relatedPosition]}」` : '未找到',
      }
      colDetectInfo.value = info
      console.log('🔍 Excel 列检测结果:', info)
      
      if (colMap.name === -1) {
        ElMessage.error('未找到"姓名"列，请使用模板格式')
        return
      }
      
      const parsed = []
      const errors = []
      const instructionKeywords = ['填写说明', '姓名为必填', '球场位置可选', '关联职位可选', '球衣名会', '示例行请', '导入前删除']
      const isInstructionRow = (row, excelRowNumber) => {
        const rowText = (row || []).map(c => String(c || '').trim()).filter(Boolean).join(' ')
        if (!rowText) return true
        if (excelRowNumber >= IMPORT_INSTRUCTION_START_ROW) return true
        return instructionKeywords.some(keyword => rowText.includes(keyword))
      }
      
      candidateRows.forEach(({ row, excelRowNumber }) => {
        if (isInstructionRow(row, excelRowNumber)) return

        const serial = String(colMap.serial >= 0 ? (row[colMap.serial] || '') : '').trim()
        const name = String(colMap.name >= 0 ? (row[colMap.name] || '') : '').trim()
        const idCard = String(colMap.idCard >= 0 ? (row[colMap.idCard] || '') : '').trim()
        const jerseyNumberStr = String(colMap.jerseyNumber >= 0 ? (row[colMap.jerseyNumber] || '') : '').trim()
        const positionCn = String(colMap.position >= 0 ? (row[colMap.position] || '') : '').trim()
        const heightStr = String(colMap.height >= 0 ? (row[colMap.height] || '') : '').trim()
        const weightStr = String(colMap.weight >= 0 ? (row[colMap.weight] || '') : '').trim()
        const contactName = String(colMap.contactName >= 0 ? (row[colMap.contactName] || '') : '').trim()
        const contactPhone = String(colMap.contactPhone >= 0 ? (row[colMap.contactPhone] || '') : '').trim()
        const relatedPosition = String(colMap.relatedPosition >= 0 ? (row[colMap.relatedPosition] || '') : '').trim()
        const jerseyNameFromExcel = String(colMap.jerseyName >= 0 ? (row[colMap.jerseyName] || '') : '').trim()

        const unchangedExample = serial === '1' && name === '张三' && idCard === '410204200001010011' &&
          jerseyNumberStr === '10' && positionCn === '前卫' && heightStr === '178' && weightStr === '70' &&
          contactName === '张三' && contactPhone === '13800138000' && ['队员', '球员'].includes(relatedPosition)
        if (unchangedExample) return
        
        if (!name) {
          errors.push(`第 ${excelRowNumber} 行：姓名为空，已跳过`)
          return
        }
        
        const player = {
          name,
          idCard,
          jerseyNumber: jerseyNumberStr || '',
          position: POSITION_MAP_CN[positionCn] || '',
          height: heightStr || '',
          weight: weightStr || '',
          contactName: contactName || '',
          contactPhone: contactPhone || '',
          relatedPosition: relatedPosition || '',
          jerseyName: jerseyNameFromExcel || '',
          _error: false
        }
        
        // 自动生成球衣名（仅当 Excel 中没有提供时）
        if (!player.jerseyName && typeof generateJerseyName === 'function') {
          player.jerseyName = generateJerseyName(name)
        }
        
        // 验证
        if (!idCard) {
          player._error = true
          errors.push(`第 ${excelRowNumber} 行「${name}」：身份证号为空`)
        }
        
        parsed.push(player)
      })
      
      importParsedData.value = parsed
      importErrors.value = errors
      
      if (parsed.length > 0) {
        ElMessage.success(`成功解析 ${parsed.length} 条球员记录${errors.length > 0 ? `，${errors.length} 条有警告` : ''}`)
      } else {
        ElMessage.warning('未解析到有效球员数据')
      }
    } catch (err) {
      console.error('导入解析失败:', err)
      ElMessage.error('Excel 解析失败：' + (err.message || '格式错误'))
    }
  }
  reader.readAsArrayBuffer(file.raw || file)
}

// 清空导入数据
function clearImportData() {
  importParsedData.value = []
  importErrors.value = []
  colDetectInfo.value = {}
}

// 确认批量导入
async function confirmBatchImport() {
  const validData = importParsedData.value.filter(p => !p._error)
  if (validData.length === 0) {
    ElMessage.warning('没有可导入的有效球员数据')
    return
  }
  
  try {
    await ElMessageBox.confirm(
      `确定导入 ${validData.length} 名球员到「${team.value.name || '当前球队'}」？`,
      '批量导入确认',
      { confirmButtonText: '确认导入', cancelButtonText: '取消', type: 'info' }
    )
  } catch {
    return
  }
  
  batchImporting.value = true
  let success = 0
  let failed = 0
  // 计算起始序号：在现有球员最大序号基础上递增，避免ID冲突
  const teamCodeForId = team.value.teamCode || teamId
  let maxExistingSeq = 0
  for (let i = 0; i < players.value.length; i++) {
    const pid = players.value[i].playerId || ''
    if (pid.startsWith(teamCodeForId)) {
      const seqStr = pid.substring(teamCodeForId.length, teamCodeForId.length + 3)
      const seq = parseInt(seqStr, 10)
      if (!isNaN(seq) && seq > maxExistingSeq) maxExistingSeq = seq
    }
  }
  let importSeq = maxExistingSeq + 1 // 批量导入序号计数器，确保每个球员ID唯一
  
  for (const player of validData) {
    try {
      // 解析身份证号（出生日期、籍贯、性别）
      const idCardInfo = parseIdCard(player.idCard) || {}
      const jerseyNum = parseInt(player.jerseyNumber)
      
      await addRecord('players', {
        name: player.name,
        idCard: player.idCard,
        jerseyNumber: isNaN(jerseyNum) ? 0 : jerseyNum,
        jerseyName: player.jerseyName || '',
        position: player.position || '',
        height: player.height ? parseFloat(player.height) : null,
        weight: player.weight ? parseFloat(player.weight) : null,
        contactName: player.contactName || '',
        contactPhone: player.contactPhone || '',
        relatedPosition: player.relatedPosition || '',
        teamId: teamId,
        teamCode: teamId,
        teamName: team.value.name || '',
        gender: idCardInfo.gender || 'male',
        nationality: '中国',
        birthDate: idCardInfo.birthDate || '',
        nativePlace: idCardInfo.nativePlace || '',
        playerId: generatePlayerId(team.value.teamCode || teamId, 'C', importSeq),
        registerTime: new Date().toISOString(),
        createTime: new Date().toISOString()
      })
      success++
      importSeq++ // 序号递增，确保每个球员ID唯一
    } catch (err) {
      console.error(`导入球员「${player.name}」失败:`, err)
      failed++
    }
  }
  
  batchImporting.value = false
  importParsedData.value = []
  importErrors.value = []
  colDetectInfo.value = {}
  
  loadPlayers()
  showBatchImport.value = false
  
  ElMessage.success(`导入完成：成功 ${success} 人${failed > 0 ? `，失败 ${failed} 人` : ''}`)
}

// 上传球队Logo（先裁剪预览，再抠图上传）
function handleTeamLogoUpload(options) {
  const { file } = options
  // 读取文件为 DataURL，弹出裁剪框
  const reader = new FileReader()
  reader.onload = (e) => {
    cropperImageSrc.value = e.target.result
    cropperPendingFile.value = file
    showLogoCropper.value = true
  }
  reader.readAsDataURL(file)
}

// 裁剪确认后的处理：抠图 + 上传
async function handleLogoCropConfirm(croppedBlob) {
  try {
    const file = cropperPendingFile.value
    // 1. 抠图处理
    ElMessage.info('正在处理图片，请稍候...')
    const removeBgResult = await removeLogoBackground(croppedBlob)

    let processedFile = croppedBlob
    let isProcessed = false
    if (removeBgResult.success && removeBgResult.data) {
      const base64Data = removeBgResult.data.split(',')[1]
      const byteCharacters = atob(base64Data)
      const byteNumbers = new Array(byteCharacters.length)
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i)
      }
      const byteArray = new Uint8Array(byteNumbers)
      processedFile = new Blob([byteArray], { type: 'image/png' })
      processedFile = new File([processedFile], 'logo-' + Date.now() + '.png', { type: 'image/png' })
      isProcessed = true
      ElMessage.success('背景抠除成功，正在上传...')
    } else {
      ElMessage.warning('抠图失败，使用原图上传')
    }

    // 2. 上传处理后的图片
    const cloudPath = `team-logos/${teamId}/${Date.now()}-logo.png`
    // ★ 分片上传（32KB/片）
    const result = await uploadLargeFileViaCloud(cloudPath, processedFile, { chunkSize: 32 * 1024 })

    if (result.success) {
      teamEditForm.value.logoUrl = result.tempUrl
      if (isProcessed) {
        ElMessage.success('透明背景Logo上传成功')
      } else {
        ElMessage.success('Logo上传成功（未抠图）')
      }
    } else {
      throw new Error(result.message || '上传失败')
    }
  } catch (err) {
    console.error('[LogoUpload] 上传失败:', err)
    ElMessage.error('上传失败: ' + err.message)
  }
}

// RemoveBgProcessor 抠图上传成功回调
function handleLogoRemoveBgSuccess(result) {
  teamEditForm.value.logoUrl = result.url
  showLogoRemoveBg.value = false
  ElMessage.success('Logo 上传成功')
}

// 提交球队编辑
async function submitTeamEdit() {
  if (!teamEditForm.value.name.trim()) {
    ElMessage.warning('请输入球队全称')
    return
  }
  // 账号所有者即为负责人，使用账号绑定的手机号

  submitting.value = true
  try {
    const teamData = {
      ...teamEditForm.value,
      logo: teamEditForm.value.logoUrl
    }
    await updateRecord('teams', teamId, teamData)
    ElMessage.success('保存成功')
    showEditTeam.value = false
    loadTeam()
  } catch (err) {
    ElMessage.error('保存失败: ' + err.message)
  } finally {
    submitting.value = false
  }
}

async function loadTeam() {
  try {
    const result = await queryById('teams', teamId)
    
    // 处理不同的返回格式
    if (Array.isArray(result) && result.length > 0) {
      team.value = result[0]
    } else if (result && typeof result === 'object') {
      team.value = result
    } else {
      team.value = {}
    }
    
  } catch (err) {
    console.error('加载球队信息失败:', err)
    team.value = {}
  }
}

// 生成球员ID
function generatePlayerId(teamCode, roleSuffix, overrideSeq) {
  roleSuffix = roleSuffix || 'C';
  if (!teamCode) return '';

  // 如果传入序号，直接使用（用于批量导入，避免循环中读取同一份 players 列表）
  if (typeof overrideSeq === 'number' && overrideSeq > 0) {
    var seq = overrideSeq.toString().padStart(3, '0');
    return teamCode + seq + roleSuffix;
  }

  var maxSeq = 0;
  for (var i = 0; i < players.value.length; i++) {
    var pid = players.value[i].playerId || '';
    if (pid.startsWith(teamCode)) {
      var seqStr = pid.substring(teamCode.length, teamCode.length + 3);
      var seq = parseInt(seqStr, 10);
      if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }
  }
  var nextSeq = (maxSeq + 1).toString().padStart(3, '0');
  return teamCode + nextSeq + roleSuffix;
}

async function loadPlayers() {
  loading.value = true
  try {
    // 同时查询 teamId 和 teamCode，合并去重
    // 因为历史数据有的用 teamId，有的用 teamCode
    const [byTeamId, byTeamCode] = await Promise.all([
      queryList('players', { where: { teamId: teamId } }),
      queryList('players', { where: { teamCode: teamId } })
    ])

    // 合并并去重（按 _id）
    const playerMap = new Map()
    for (const p of (byTeamId || [])) {
      if (p._id) playerMap.set(p._id, p)
    }
    for (const p of (byTeamCode || [])) {
      if (p._id) playerMap.set(p._id, p)
    }
    let result = Array.from(playerMap.values())
    
    // 处理头像URL：如果是 cloudId，需要转换成临时URL
    const processedPlayers = await Promise.all(result.map(async (player) => {
      if (player.photoUrl && player.photoUrl.startsWith('cloud://')) {
        try {
          const tempUrl = await getFileUrl(player.photoUrl)
          return { ...player, photoUrl: tempUrl }
        } catch (err) {
          console.error('获取头像临时URL失败:', err)
          return player
        }
      }
      return player
    }))
    
    players.value = processedPlayers

    // 同步更新球队的 playerCount
    try {
      await updateRecord('teams', teamId, { playerCount: processedPlayers.length })
      if (team.value) team.value.playerCount = processedPlayers.length
    } catch (e) {
      console.error('同步 playerCount 失败:', e)
    }
  } catch (err) {
    console.error('加载球员列表失败:', err)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadTeam()
  loadPlayers()
})

// 压缩 Base64 图片（避免 413 Payload Too Large）
function compressBase64(dataUrl, maxSize = 300) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const ratio = Math.min(1, maxSize / img.width, maxSize / img.height)
      const w = Math.max(1, Math.round(img.width * ratio))
      const h = Math.max(1, Math.round(img.height * ratio))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}
</script>

<style scoped>
.team-info-header {
  display: flex;
  align-items: center;
  gap: 20px;
}

.team-logo-wrapper {
  position: relative;
}

.team-logo-wrapper .ai-logo-btn {
  position: absolute;
  bottom: 0;
  right: 0;
  opacity: 0;
  transition: opacity 0.3s;
}

.team-logo-wrapper:hover .ai-logo-btn {
  opacity: 1;
}

.team-meta h2 {
  font-size: 20px;
  margin-bottom: 8px;
  color: #303133;
}

.team-meta-row {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 13px;
  color: #909399;
}

.meta-item {
  margin-left: 8px;
}

.team-description {
  margin-top: 8px;
  font-size: 13px;
  color: #606266;
  line-height: 1.6;
  max-width: 600px;
}

.jersey-number {
  font-weight: 600;
  font-size: 16px;
  color: #2E7D32;
}

/* 地址选择器 */
.address-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}

.address-detail-item :deep(.el-form-item__label) {
  visibility: hidden;
}

/* 身份证上传 */
.idcard-upload {
  width: 100%;
}

.idcard-uploader {
  width: 100%;
}

.idcard-uploader :deep(.el-upload) {
  width: 100%;
}

.idcard-placeholder {
  width: 100%;
  height: 100px;
  border: 1px dashed #dcdfe6;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #909399;
  cursor: pointer;
  transition: all 0.3s;
}

.idcard-placeholder:hover {
  border-color: #2E7D32;
  color: #2E7D32;
}

.idcard-placeholder span {
  font-size: 12px;
  margin-top: 4px;
}

.idcard-preview {
  width: 100%;
  height: 100px;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid #e4e7ed;
}

.idcard-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 球员照片4:3竖版样式 */
.player-photo-upload .idcard-placeholder,
.player-photo-upload .idcard-preview {
  width: 120px;
  height: 160px;
  margin: 0 auto;
}

/* 新头像裁剪区域样式 */
.player-photo-section {
  display: flex;
  justify-content: center;
  padding: 16px;
  background: #f5f7fa;
  border-radius: 8px;
}

.photo-preview-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.photo-preview-img {
  width: 120px;
  height: 144px;
  object-fit: cover;
  border-radius: 8px;
  background-color: #f5f5f5;
  background-image: 
    linear-gradient(45deg, #e0e0e0 25%, transparent 25%),
    linear-gradient(-45deg, #e0e0e0 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #e0e0e0 75%),
    linear-gradient(-45deg, transparent 75%, #e0e0e0 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
}

/* Logo上传样式 */
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
  width: 100px;
  height: 100px;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid #e4e7ed;
}

.logo-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 球员表格行可点击样式 */
.player-table :deep(.el-table__row) {
  cursor: pointer;
}

.player-table :deep(.el-table__row:hover) {
  background-color: #f0f9f0 !important;
}

/* 球员头像 - 透明背景，无框 */
.player-avatar-img {
  width: 36px;
  height: 48px;
  object-fit: contain;
  border-radius: 0;
  background-color: transparent;
  display: block;
}

/* 队徽Logo - 透明背景 */
.team-logo-wrapper :deep(.el-avatar) {
  background-color: transparent !important;
}

.logo-preview {
  background-color: transparent;
}

/* 球员库选项卡 */
.player-tabs {
  margin-top: -10px;
}

.player-tabs :deep(.el-tabs__content) {
  padding: 16px 0 0 0;
}

.tab-content {
  min-height: 300px;
}

.library-search {
  margin-bottom: 16px;
  display: flex;
  gap: 8px;
  align-items: center;
}
.library-search .el-input {
  flex: 1;
}

.library-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
}

.library-empty-tip {
  margin-top: 16px;
}
</style>
