'use strict'
/**
 * 赛小蜂足球世界 · MVP 玩法参数（2026-11-02）
 *
 * 集中存放本版唯一数值来源，页面与引擎不得各自写死：
 *   - 每日兑换券数量
 *   - 收藏 / 展示 / 展馆槽位的初始容量、单次扩容价、容量上限
 *   - 背景卡免费更换门槛（沿用已确认规则，保留不缩减）
 *
 * 说明：本文件数值是「先跑起来」的占位默认值，不属于已确认产品定价。
 * 券面额、槽位价格、上限调整时只改这里；正式版由服务端下发后此文件仅作兜底。
 */

var EMPTY_COUPON_NOTICE = '券不够时明天登录再领，或用后续任务奖励'

module.exports = {
  /** 每日登录自动到账的兑换券数量 */
  DAILY_COUPONS: 1,

  /** 初始槽位容量 */
  SLOT_DEFAULTS: { collect: 20, display: 3, gallery: 3 },

  /** 单次扩容消耗的兑换券 */
  SLOT_PRICES: { collect: 2, display: 1, gallery: 1 },

  /** 单类槽位容量上限 */
  SLOT_MAX: { collect: 60, display: 9, gallery: 9 },

  /** 槽位语义（商城与「我的」共用） */
  SLOT_META: {
    collect: { label: '收藏槽位', hint: '卡册最多可收藏的卡数' },
    display: { label: '展示位', hint: '个人主页可陈列的卡位' },
    gallery: { label: '展馆位', hint: '个人展馆公开陈列的卡位' }
  },

  /** 满 100 分或有效会员可免费更换背景（已确认，保留不缩减） */
  FREE_BG_SCORE: 100,

  /** 背景卡本期不上架；后期卡皮肤商城只售槽位 */
  BACKGROUND_STORE_OPEN: false,

  COUPON_EMPTY_NOTICE: EMPTY_COUPON_NOTICE,

  /** 商城固定规则文案（不写价格、不写额度承诺） */
  SHOP_RULES: [
    '商城只售槽位容量，不卖卡、不卖背景卡',
    '兑换券由每日登录与后续任务发放，不可交易、不可提现',
    '真实球员卡由赛事发放，永久收藏，不在商城售卖',
    '本期无支付流程：不涉及付费，也不涉及未成年人付费'
  ]
}
