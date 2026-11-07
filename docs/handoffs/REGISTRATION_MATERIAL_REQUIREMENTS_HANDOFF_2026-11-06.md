# 报名材料 / 参赛资质配置 —— 交接文档

- 日期：2026-11-06
- 范围：PC 后台「赛事 → 报名管理 → 报名材料设置」的配置面板、数据字段与球员端预览
- 状态：代码已改并已双端部署；**未提交 git**；尚未接入球员端与后端校验

---

## 一、本任务明确只做这一件事

主办方在赛事内为每个竞赛组别配置「报名要交哪些材料」，并在右侧看到与真实报名页一致的实时预览。

**不做的事（避免混淆）**：

- 不改赛事创建、组别赛制、赛程、报名审核、名单审核、抽签、统计、权限、机构归属。
- 不改球员端（小程序 / 服务号 H5）任何页面。
- 不改任何云函数。
- 不改登录、账号、机构相关逻辑。

---

## 二、改动文件清单（共 3 个前端文件）

### 1. 新增 —— `web-admin-vue/src/views/tournament/RegistrationMaterialSettings.vue`

整个配置面板（左侧配置 + 右侧球员端预览）。文件为**新增未跟踪文件**（`??`）。

内容结构：

| 区块 | 说明 |
|---|---|
| 材料项下拉 | 标准形象照 / 球衣号码 / 身份证材料 / 实名认证 / 人脸核验 / 意外保险 / 免责协议，取值 `required` / `optional` / `none` |
| 身份证材料 | 单独的三种取值：`number`（提交身份证号）/ `photos`（提交正反面）/ `none`（不提交），兼容旧值 `required`、`optional` 均按 `photos` 处理 |
| 留存证件面 | 仅当身份证材料为 `photos` 时出现，勾选「人像面 / 国徽面」；切到 `photos` 时默认两面都勾 |
| 同一球员限报一个组别 | 开关 |
| 球衣号码范围 | 两个输入框（0–999 / 1–999），写入 `regulationDetails.jerseyNumberMin/Max` |
| 右侧预览 | 按小程序报名页形态还原：必填项前红色 `*`、右对齐输入框、上传方块、实名/人脸/免责按钮、保险「上传保单 + 平台购买」链接、底部「提交报名」 |

相关行：模板 L1–L69，脚本 L71–L190，样式 L192–L253。

### 2. 修改 —— `web-admin-vue/src/views/tournament/TournamentTeams.vue`

只加了入口、弹窗和读写逻辑，共 5 处：

| 行 | 改动 |
|---|---|
| L32 | 报名管理工作区按钮栏新增「报名材料设置」按钮（`v-if="isRegistrationWorkspace"`） |
| L606–L609 | 新增 `el-dialog`，宽 1220px、`max-width:calc(100vw - 32px)`、`top:5vh` |
| L628 | `import RegistrationMaterialSettings from './RegistrationMaterialSettings.vue'` |
| L1010–L1013 | `materialSettingsVisible` / `materialForm` / `savingMaterialSettings` / `materialDivisionDeadline` |
| L1015–L1050 | `openMaterialSettings()`（从当前组别读默认值）与 `saveMaterialSettings()`（写 `divisions`） |

**重要**：该文件里还有另一批 `statusToneClass(...)` 改动（L228–L250 一带）和 `import { statusToneClass }`，**不是本任务的改动**，来自同一工作区的其他会话（`web-admin-vue/src/utils/statusTone.js` 也是他人新增的未跟踪文件）。提交时请分开处理。

### 3. 修改 —— `web-admin-vue/src/components/tournament/RegistrationPlayerEditor.vue`

球员资料编辑弹窗的两处小改动：

| 行 | 改动 |
|---|---|
| L15 / L23 | 「球衣名」从第 2 位后移到「国籍」之后，使「姓名 → 证件类型 → 身份证号」成为前三位 |
| L40 | 新增 `import { resolveNativePlace } from '../../../../cloudfunctions/dataCenter/shared/idcard-region.cjs'` |
| L57–L73 | 新增 `deriveFromIdNumber()` 与 `watch`：身份证号合法时，自动补齐**未填写**的出生日期、性别、籍贯 |

派生只填空值，不覆盖人工填写；仅当证件类型为 `resident_id` 时生效。

---

## 三、数据契约（写入 `divisions` 集合）

保存时写入当前组别记录，字段如下：

```js
{
  materialRequirements: {
    photo: 'required' | 'optional' | 'none',
    jerseyNo: 'required' | 'optional' | 'none',
    idDocs: 'number' | 'photos' | 'none',   // 兼容旧值 required/optional
    realName: 'required' | 'optional' | 'none',
    faceCheck: 'required' | 'optional' | 'none',
    insurance: 'required' | 'optional' | 'none',
    waiver: 'required' | 'optional' | 'none'
  },
  idDocParts: { frontPhoto: boolean, backPhoto: boolean },
  singleDivisionOnly: boolean,
  regulationDetails: { ...已有字段, jerseyNumberMin: number, jerseyNumberMax: number },
  materialSettingsUpdatedAt: Date,
  updateTime: Date
}
```

默认值（组别尚无配置时）：形象照必填、球衣号码必填、身份证材料 `none`、实名 `none`、人脸 `none`、保险必填、免责选填、限报一个组别开启、号码 1–99。

---

## 四、当前实际生效范围（很关键）

- ✅ PC 后台：可配置、可保存、右侧预览实时联动。
- ✅ 演示赛事（`demo-` 前缀的赛事 ID）：只在本页内存生效，**不写数据库**，提示「演示模式已应用，未写入数据库」。
- ❌ 球员端（小程序报名页 / 服务号 H5）：**尚未读取** `materialRequirements`，配置目前不影响真实报名。
- ❌ 后端：**尚未**在报名提交时校验这些材料。

也就是说：现在这套只是「配置 + 预览」，还没有形成闭环。要真正生效需要单独一期接入（见第七节）。

---

## 五、部署记录（2026-11-06）

| 端口 | 部署路径 | 入口 | 页面 chunk |
|---|---|---|---|
| 正式 | `/admin/` | `assets/index-CGrXPAt3.js` | `assets/TournamentTeams-C5lsN4Li.js` |
| 测试 | `/preview/admin/` | `assets/index-CokROP0H.js` | `assets/TournamentTeams-C_ZWljRb.js` |

两端共用样式表 `assets/TournamentTeams-KsvtwMZw.css`。

线上回读结果：`rms-page-card=2`、`rms-page-label=1`、`上传保单=1`、`平台购买保险=1`、样式含 `420px` 预览列宽、`rms-page-submit=1`。

环境：`cloud1-7g8ckb3c7815a011`（ap-shanghai）。

---

## 六、同期已发布、但不属于本任务的内容

同一工作区里还有一批与本任务无关的改动，交接时请勿合并理解：

- `cloudfunctions/webLoginApi/index.js`、`divisionExecutionRules.cjs`：`benchPlayerLimitUnlimited` 布尔字段（已发布到线上，属换人人数上限，与报名材料无关）。
- `web-admin-vue/src/utils/statusTone.js` 及多个页面的 `statusToneClass` 调用：状态标签配色，属其他会话。
- 小程序、服务号 H5、裁判相关文件的一批修改：属其他会话。

---

## 七、待确认 / 未完成事项

按重要性排序：

1. **身份证「不提交」的年龄限制**：用户要求「不提交仅限青少年组，成年组必须提交身份证号」，但代码里没有可靠的组别年龄字段用于拦截，需确认用哪个字段判断（组别名称、`regulationDetails` 里的年龄上下限、还是赛事类别）。
2. **实名认证的实现口径**：左侧提示当前写「活体检测·需开通」，与 `docs/PRODUCT_RULES.md#L516-L517`「实名认证不要求活体」冲突。需确认走百度智能云活体检测，还是走现有 `parent_identity_verifications` 人工审核。
3. **球员端接入**：小程序报名页 / 服务号 H5 读取 `materialRequirements`，按配置显示或隐藏字段、上传位、按钮与购买链接。
4. **后端校验**：报名提交时按 `materialRequirements` 校验必填项；保险在生成参赛证时校验，允许先报名后补交。
5. **面板形态**：目前是 1220px 弹窗，用户曾提出「单独走一页」，未最终决定。
6. **号码范围校验**：`jerseyNumberMin/Max` 已写入组别，但报名填号时的越界校验尚未实现。

---

## 八、回滚方式

本任务只涉及前端，回滚成本低：

1. 删除 `web-admin-vue/src/views/tournament/RegistrationMaterialSettings.vue`；
2. 回退 `TournamentTeams.vue` 上述 5 处（**注意保留同文件里他人的 `statusToneClass` 改动**）；
3. 如需一并回退身份证派生，回退 `RegistrationPlayerEditor.vue` 的 3 处；
4. 重新构建并部署 `/admin/` 与 `/preview/admin/`。

已写入数据库的 `materialRequirements` 等字段因为无人消费，可保留也可清除，不影响现有报名流程。

---

## 九、构建命令备忘

```powershell
# 测试版
cd E:\Documents\sxf-football\web-admin-vue
$env:VITE_APP_BASE='/preview/admin/'
npm run build
E:\Documents\sxf-basketball\tools\sxf-cloud.ps1 football run hosting deploy "E:\Documents\sxf-football\web-admin-vue\dist" preview/admin

# 正式版
Remove-Item Env:VITE_APP_BASE
npm run build
E:\Documents\sxf-basketball\tools\sxf-cloud.ps1 football run hosting deploy "E:\Documents\sxf-football\web-admin-vue\dist" admin
```
