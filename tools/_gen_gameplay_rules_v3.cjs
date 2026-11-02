const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, BorderStyle, WidthType, ShadingType, AlignmentType } = require('docx')
const fs = require('fs')

const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' }
const borders = { top: border, bottom: border, left: border, right: border }
const headerShading = { fill: '1a472a', type: ShadingType.CLEAR }
const cellMargins = { top: 80, bottom: 80, left: 120, right: 120 }

function h1(text) { return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text, bold: true, size: 32 })] }) }
function h2(text) { return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text, bold: true, size: 28 })] }) }
function p(text) { return new Paragraph({ children: [new TextRun({ text, size: 24 })] }) }
function bold(text) { return new Paragraph({ children: [new TextRun({ text, bold: true, size: 24 })] }) }
function row(cells, isHeader) {
  return new TableRow({ cantSplit: true, children: cells.map(c => new TableCell({ borders, margins: cellMargins, width: { size: 100 / cells.length, type: WidthType.PERCENTAGE }, shading: isHeader ? headerShading : undefined, children: [new Paragraph({ children: [new TextRun({ text: c, bold: !!isHeader, size: 22, color: isHeader ? 'FFFFFF' : '000000' })] })] })) })
}
function table(headers, rows) {
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, columnWidths: headers.map(() => Math.floor(100 / headers.length) * 100), rows: [row(headers, true), ...rows.map(r => row(r))] })
}

const doc = new Document({
  styles: {
    default: { document: { run: { font: { ascii: 'Arial', hAnsi: 'Arial', eastAsia: 'Microsoft YaHei' }, size: 24 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 32, bold: true, font: { ascii: 'Arial', hAnsi: 'Arial', eastAsia: 'Microsoft YaHei' } }, paragraph: { spacing: { before: 240, after: 240 }, outlineLevel: 0, keepNext: false, keepLines: false } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 28, bold: true, font: { ascii: 'Arial', hAnsi: 'Arial', eastAsia: 'Microsoft YaHei' } }, paragraph: { spacing: { before: 180, after: 180 }, outlineLevel: 1, keepNext: false, keepLines: false } },
    ]
  },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
    children: [
      h1('赛小蜂足球世界 — 玩法数据规则'),
      p('版本：v3.0 | 更新日期：2026-10-22'),
      p(''),

      h2('一、核心设计原则'),
      bold('1. 教练模式（FM 模式）'),
      p('玩家扮演教练，不直接上场踢球。核心乐趣 = 收集球员卡 + 组建阵容 + 战术搭配 + PK 对抗。'),
      p(''),
      bold('2. 实战与虚拟严格分离'),
      p('• 实战（真实数据）：球员卡的 formBonus（状态加成）由真实比赛数据驱动，赛季卡/MVP 卡由真实获奖产生'),
      p('• 虚拟（养成道具）：教练卡等级、符文卡、技能卡，不影响真实数据，只影响玩法深度和策略'),
      p(''),
      bold('3. 现实同行原则'),
      p('没上过场的球员，其卡片无法通过虚拟养成达到实战球员的上限。真实比赛数据是硬通货。'),

      h2('二、球员卡体系'),
      bold('2.1 卡级与属性区间'),
      table(
        ['卡级', '颜色', '属性区间', '卡种战力加成', '获取方式'],
        [
          ['bronze 铜', '铜色', '40-70', '+0', '普通开卡'],
          ['silver 银', '银色', '60-85', '+0', '普通开卡'],
          ['gold 金', '金色', '75-99', '+0', '普通开卡'],
          ['epic 史诗', '紫色', '82-99', '+3', '单场MVP/最佳阵容/金靴/金手套'],
          ['legendary 传说', '彩虹/闪', '88-99', '+5', '赛季MVP/冠军核心']
        ]
      ),
      p(''),
      bold('2.2 基础属性（attrs）'),
      p('开卡时随机生成 6 维属性：shooting / passing / defending / pace / stamina / awareness。'),
      p('位置微调：FW 射门+15/速度+5 | MF 传球+15/意识+5 | DF 防守+15/体能+5 | GK 防守+20/意识+10'),
      p(''),
      bold('2.3 状态加成（formBonus）—— 真实数据驱动'),
      table(
        ['事件', '加减分', '统计窗口'],
        [
          ['进球', '+2', '最近 3 场'],
          ['黄牌', '-1', '最近 3 场'],
          ['红牌', '-3', '最近 3 场'],
          ['两黄一红', '-4（一黄+一红）', '最近 3 场']
        ]
      ),
      p('只影响 PK 战力，不改变基础 attrs。'),

      h2('三、教练卡体系'),
      bold('3.1 教练卡属性'),
      table(
        ['属性', '说明'],
        [
          ['等级', '1-30 级，喂收集卡升级'],
          ['经验', '铜10 / 银30 / 金100 / epic200 / legendary500'],
          ['阵型解锁', '5人→7人→8人→9人→11人'],
          ['战术槽', 'Lv.5 +1 / Lv.20 +2'],
          ['技能槽', 'Lv.10 +1 / Lv.25 +2'],
          ['符文槽', 'Lv.15 +1 / Lv.25 +2']
        ]
      ),
      p(''),
      bold('3.2 教练称号'),
      p('Lv.1 青训教练 → Lv.5 资深教练 → Lv.10 职业教练 → Lv.20 战术大师 → Lv.30 传奇教头'),
      p(''),
      bold('3.3 升级消耗'),
      p('喂收集卡给教练加经验：铜10 / 银30 / 金100 / epic200 / legendary500。'),
      p('教练卡本身不上场，不占用阵容位置。'),

      h2('四、符文卡系统（有耐久度）'),
      bold('4.1 符文品质'),
      table(
        ['品质', '属性加成', '耐久度', '获取'],
        [
          ['普通', '+2', '3 场', '卡包/分解'],
          ['精良', '+3', '5 场', '卡包/活动'],
          ['稀有', '+4', '8 场', '高阶卡包'],
          ['史诗', '+5', '12 场', '赛季奖励']
        ]
      ),
      p(''),
      bold('4.2 符文规则'),
      p('• 装备到球员卡上，每卡最多 2 个'),
      p('• 每打 1 场 PK 耐久 -1，耐久 0 符文碎裂消失'),
      p('• 可提前卸下（保留剩余耐久）'),
      p('• 分解：3 个同品质 → 1 个随机高一级符文（普通→精良→稀有→史诗）'),
      p('• 符文加成在 PK 时临时叠加，不改变球员卡基础 attrs'),

      h2('五、技能卡系统（消耗品）'),
      table(
        ['技能', '效果', '类型'],
        [
          ['反击战术', '本场全队战力 +5%', 'team_boost'],
          ['铁桶阵', '本场对手进球期望值 -0.3', 'defense_boost'],
          ['核心激励', '指定球员 formBonus ×2', 'form_double'],
          ['针对部署', '对手战力最高球员 -10%', 'target_nerf']
        ]
      ),
      p(''),
      p('技能卡为消耗品，使用一次后消失。赛前选择使用，本场 PK 生效。'),

      h2('六、PK 战力公式'),
      bold('球员卡战力 = (6维均值 × 位置契合度) + 卡种加成 + formBonus + 符文加成'),
      p(''),
      p('• 位置契合度：关键两维均值映射到 0.8-1.2'),
      p('  FW 看射门+速度 | MF 看传球+意识 | DF 看防守+体能 | GK 看防守+意识'),
      p('• 卡种加成：epic +3 / legendary +5'),
      p('• formBonus：真实比赛数据（进球+2/黄牌-1/红牌-3）'),
      p('• 符文加成：装备符文临时叠加'),

      h2('七、赛季卡与 MVP 卡'),
      p('• 只有真实获奖的球员才能生成 epic/legendary 卡'),
      p('• 单场 MVP / 最佳阵容 / 金靴 / 金手套 → epic'),
      p('• 赛季 MVP / 冠军核心 → legendary'),
      p('• 赛季卡由服务端在 awards 计算后自动发放，无法购买、无法合成'),

      h2('八、合规红线'),
      p('• 概率公示：卡包概率必须在页面公示'),
      p('• 保底计数：必须有保底机制'),
      p('• 消费上限：单日/单月消费上限'),
      p('• 未成年人保护：未满 8 岁禁售'),
      p('• 服务端概率决定：禁止前端 Math.random 参与付费链路'),
      p('• iOS 虚拟支付限制：iOS 端虚拟物品支付受限'),
      p('• 术语：用「开卡」「卡包」，不用「盲盒」「抽奖」'),

      h2('九、版本记录'),
      table(
        ['版本', '日期', '变更'],
        [
          ['v1.0', '2026-10-21', '初始版本：铜/银/金三档，基础属性随机'],
          ['v2.0', '2026-10-21', 'FM 模式：位置契合度、状态加成、人机对手'],
          ['v3.0', '2026-10-22', '教练模式：教练卡+符文+技能，实战与虚拟分离']
        ]
      ),
    ]
  }]
})

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync('C:\\Users\\15043\\Desktop\\赛小蜂足球世界-玩法数据规则.docx', buf)
  console.log('done')
})
