<template>
  <article class="regulation-fields panel-card" :class="`section-${section}`">
    <header><div><h3>{{ sectionTitle }}</h3><p>{{ sectionDescription }}</p></div><button v-if="section === 'handbook' && sourceAvailable" class="recognize-button" type="button" :disabled="recognizing" @click="emit('recognize')">{{ recognizing ? '正在识别…' : '从已上传规程识别' }}</button></header>
    <el-collapse v-model="openSections">
      <el-collapse-item v-if="section === 'discipline' || section === 'handbook'" title="官员与报名费用" name="registration">
        <div class="field-grid">
          <el-form-item label="领队名额"><el-input-number v-model="details.teamLeaderLimit" :min="0" :max="10" /><span class="unit">人</span></el-form-item>
          <el-form-item label="教练名额"><el-input-number v-model="details.coachLimit" :min="0" :max="20" /><span class="unit">人</span></el-form-item>
          <el-form-item label="队医名额"><el-input-number v-model="details.doctorLimit" :min="0" :max="10" /><span class="unit">人</span></el-form-item>
          <el-form-item label="每人参赛费"><el-input-number v-model="details.registrationFeePerPerson" :min="0" :max="100000" /><span class="unit">元</span></el-form-item>
          <el-form-item label="每队纪律保证金"><el-input-number v-model="details.disciplineDepositPerTeam" :min="0" :max="100000" /><span class="unit">元</span></el-form-item>
          <el-form-item label="保证金退款时限"><el-input-number v-model="details.depositRefundWorkdays" :min="0" :max="90" /><span class="unit">工作日</span></el-form-item>
        </div>
        <div class="switch-grid"><label><span>领队/教练/队医可兼球员</span><el-switch v-model="details.officialsCanPlay" /></label><label><span>弃权扣除全部保证金</span><el-switch v-model="details.forfeitDepositDeduction" /></label></div>
      </el-collapse-item>

      <el-collapse-item v-if="section === 'discipline' || section === 'handbook'" title="资格审查与报名材料" name="eligibility">
        <div class="switch-grid"><label><span>允许外籍球员持护照参赛</span><el-switch v-model="details.foreignPlayersAllowed" /></label><label><span>允许职业球员参赛</span><el-switch v-model="details.professionalPlayersAllowed" /></label><label><span>女性球员成人年龄例外</span><el-switch v-model="details.femaleAdultAgeException" /></label><label><span>中老年组仅按出生年份</span><el-switch v-model="details.ageByYearOnly" /></label><label><span>足协黑名单核验</span><el-switch v-model="details.blacklistCheckRequired" /></label><label><span>报名照片须穿本队队服</span><el-switch v-model="details.teamKitPhotoRequired" /></label></div>
        <div class="field-grid"><el-form-item label="资格投诉截止轮次"><el-input-number v-model="details.eligibilityComplaintDeadlineRound" :min="0" :max="30" /><span class="unit">轮开赛前</span></el-form-item><el-form-item label="资格违规判罚比分"><el-input v-model.trim="details.eligibilityViolationScore" maxlength="7" placeholder="0:3" /></el-form-item></div>
      </el-collapse-item>

      <el-collapse-item v-if="section === 'competition' || section === 'handbook'" title="比赛执行细则" name="execution">
        <div class="field-grid">
          <el-form-item label="比赛用球"><el-input-number v-model="details.matchBallSize" :min="3" :max="5" /><span class="unit">号</span></el-form-item>
          <el-form-item label="赛前提交名单"><el-input-number v-model="details.lineupSubmissionMinutes" :min="0" :max="180" /><span class="unit">分钟前</span></el-form-item>
          <el-form-item label="最低比赛人数"><el-input-number v-model="details.minimumPlayersToContinue" :min="3" :max="11" /><span class="unit">人</span></el-form-item>
          <el-form-item label="比赛终止判罚比分"><el-input v-model.trim="details.terminationForfeitScore" maxlength="7" placeholder="0:3" /></el-form-item>
          <el-form-item label="上半场换人窗口"><el-input-number v-model="details.firstHalfSubstitutionWindows" :min="0" :max="10" /><span class="unit">次</span></el-form-item>
          <el-form-item label="下半场换人窗口"><el-input-number v-model="details.secondHalfSubstitutionWindows" :min="0" :max="10" /><span class="unit">次</span></el-form-item>
          <el-form-item label="中场换人窗口"><el-input-number v-model="details.halftimeSubstitutionWindows" :min="0" :max="5" /><span class="unit">次</span></el-form-item>
          <el-form-item label="脑震荡替换"><el-input-number v-model="details.concussionSubstitutionLimit" :min="0" :max="5" /><span class="unit">次/队</span></el-form-item>
        </div>
        <div class="switch-grid"><label><span>单次窗口换人人数不限</span><el-switch v-model="details.unlimitedPlayersPerWindow" /></label><label><span>换下球员禁止再次上场</span><el-switch v-model="details.substitutionReentryForbidden" /></label><label><span>终止时保留更高现场比分</span><el-switch v-model="details.keepHigherLiveScore" /></label><label><span>对方获得额外脑震荡替换</span><el-switch v-model="details.opponentConcussionSubstitution" /></label></div>
      </el-collapse-item>

      <el-collapse-item v-if="section === 'competition' || section === 'handbook'" title="装备与替补席" name="equipment">
        <div class="field-grid"><el-form-item label="替补席总人数"><el-input-number v-model="details.benchTotalLimit" :min="0" :max="30" /><span class="unit">人</span></el-form-item><el-form-item label="替补球员"><el-input-number v-model="details.benchPlayerLimit" :min="0" :max="30" /><span class="unit">人</span></el-form-item><el-form-item label="球队官员"><el-input-number v-model="details.benchOfficialLimit" :min="0" :max="20" /><span class="unit">人</span></el-form-item><el-form-item label="球衣号码范围"><div class="inline-number"><el-input-number v-model="details.jerseyNumberMin" :min="0" :max="999" /><span>至</span><el-input-number v-model="details.jerseyNumberMax" :min="1" :max="999" /></div></el-form-item></div>
        <div class="switch-grid"><label><span>须备深浅两套比赛服</span><el-switch v-model="details.twoKitsRequired" /></label><label><span>队长袖标</span><el-switch v-model="details.captainArmbandRequired" /></label><label><span>护腿板</span><el-switch v-model="details.shinGuardsRequired" /></label><label><span>禁止金属底/钢钉球鞋</span><el-switch v-model="details.metalStudsForbidden" /></label><label><span>禁止涂改或粘贴号码</span><el-switch v-model="details.jerseyModificationForbidden" /></label><label><span>替补席服装须与场上区分</span><el-switch v-model="details.benchKitContrastRequired" /></label></div>
      </el-collapse-item>

      <el-collapse-item v-if="section === 'competition' || section === 'handbook'" title="比赛中止与恢复" name="stoppage">
        <div class="field-grid"><el-form-item label="首次暂停等待"><el-input-number v-model="details.stoppagePauseMinutes" :min="0" :max="180" /><span class="unit">分钟</span></el-form-item><el-form-item label="最多等待阶段"><el-input-number v-model="details.stoppagePausePeriods" :min="1" :max="5" /><span class="unit">次</span></el-form-item><el-form-item label="组委会决定时限"><el-input-number v-model="details.stoppageDecisionHours" :min="0" :max="72" /><span class="unit">小时</span></el-form-item></div>
        <div class="switch-grid"><label><span>优先续赛剩余时间</span><el-switch v-model="details.resumeRemainingTimePreferred" /></label><label><span>续赛保留比分、名单、换人和红黄牌</span><el-switch v-model="details.resumeStatePreserved" /></label></div>
      </el-collapse-item>

      <el-collapse-item v-if="section === 'discipline' || section === 'handbook'" title="退出比赛与纪律处罚" name="discipline">
        <div class="field-grid"><el-form-item label="严重违纪禁赛"><el-input-number v-model="details.severeMisconductBanMonths" :min="0" :max="120" /><span class="unit">个月</span></el-form-item></div>
        <div class="switch-grid"><label><span>退赛取消既往赛果与红黄牌</span><el-switch v-model="details.withdrawalVoidsResults" /></label><label><span>严重违背公平竞赛取消资格</span><el-switch v-model="details.fairPlayDisqualification" /></label><label><span>红黄牌带入下一阶段</span><el-switch v-model="details.cardsCarryToNextStage" /></label><label><span>球队官员纳入红黄牌处罚</span><el-switch v-model="details.teamOfficialsDiscipline" /></label></div>
      </el-collapse-item>
    </el-collapse>
  </article>
</template>

<script setup>
import { computed, ref } from 'vue'
const props = defineProps({ form: { type: Object, required: true }, section: { type: String, default: 'handbook' }, sourceAvailable: { type: Boolean, default: false }, recognizing: { type: Boolean, default: false } })
const emit = defineEmits(['recognize'])
const details = computed(() => props.form.regulationDetails)
const section = computed(() => ['competition', 'discipline', 'handbook'].includes(props.section) ? props.section : 'handbook')
const sectionTitle = computed(() => section.value === 'handbook' ? '竞赛规程设置' : section.value === 'discipline' ? '其他纪律参数' : '其他执行参数')
const sectionDescription = computed(() => section.value === 'handbook' ? '用于生成竞赛规程和秩序册，不参与自动赛程与积分计算。' : section.value === 'discipline' ? '名单资格、报名材料、费用及纪律处罚。' : '换人、装备、替补席及比赛中止恢复。')
const openSections = ref(section.value === 'handbook' ? [] : section.value === 'discipline' ? ['registration'] : ['execution'])
</script>

<style scoped>
.regulation-fields{grid-column:1/-1;padding:0!important;overflow:hidden}.regulation-fields>header{padding:15px 18px;border-bottom:1px solid #e8eee9;background:#fafcfb}.regulation-fields.section-discipline>header{background:#fffbf4}.regulation-fields.section-handbook>header{background:#f7faf8}.regulation-fields h3,.regulation-fields p{margin:0}.regulation-fields h3{font-size:16px}.regulation-fields p{margin-top:4px;color:#728078;font-size:12px}.regulation-fields :deep(.el-collapse){border:0}.regulation-fields :deep(.el-collapse-item__header){height:48px;padding:0 18px;color:#26372d;font-weight:700}.regulation-fields :deep(.el-collapse-item__wrap){border-bottom-color:#edf1ee}.regulation-fields :deep(.el-collapse-item__content){padding:16px 18px 18px}.field-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:2px 14px}.field-grid :deep(.el-form-item){grid-column:span 3;min-width:0}.field-grid :deep(.el-form-item:has(.el-input)){grid-column:span 4}.field-grid :deep(.el-input-number){width:132px;max-width:100%}.field-grid :deep(.el-input){width:190px;max-width:100%}.unit{margin-left:6px;color:#748178;font-size:12px}.switch-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px 12px;margin-top:6px}.switch-grid label{display:flex;min-height:38px;align-items:center;justify-content:space-between;gap:10px;padding:0 10px;border:1px solid #e5ece7;border-radius:6px;background:#fafcfb;color:#405047;font-size:13px}.inline-number{display:flex;align-items:center;gap:6px}.inline-number :deep(.el-input-number){width:96px;min-width:0}@media(max-width:1100px){.field-grid :deep(.el-form-item){grid-column:span 6}.switch-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:620px){.field-grid :deep(.el-form-item){grid-column:1/-1}.field-grid :deep(.el-input-number),.field-grid :deep(.el-input){width:100%}.switch-grid{grid-template-columns:1fr}}
.regulation-fields>header{display:flex;align-items:center;justify-content:space-between;gap:16px}.recognize-button{flex:0 0 auto;min-height:34px;padding:0 13px;border:1px solid #16834b;border-radius:6px;color:#087542;background:#fff;cursor:pointer}.recognize-button:disabled{opacity:.6;cursor:not-allowed}@media(max-width:620px){.regulation-fields>header{align-items:flex-start;flex-direction:column}.recognize-button{width:100%}}
</style>
