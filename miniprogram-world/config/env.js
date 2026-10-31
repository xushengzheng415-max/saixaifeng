'use strict'
/**
 * 赛小蜂足球世界 · 运行环境配置（2026-10-31）
 *
 * 业务环境（唯一数据源）：cloud1-7g8ckb3c7815a011
 *   - 与球队端小程序、PC 后台、服务号 H5 共用一套 users / players / 赛事数据
 *   - 球员端通过「环境共享」被授权访问，不建第二套数据库
 *
 * 开通环境（空环境，只用于获得云开发权限）：
 *   - sxf-world-dev-d6gxotk5mc8bb7cb6（腾讯云 CloudBase 控制台新建，PostgreSQL 体系）
 *   - 与 cloud1 属不同技术栈，禁止放置业务表，也不承载 cardWorld* 云函数
 *
 * MODE 切换：
 *   'local' —— 本地演示适配器（utils/store.js），无需云开发权限
 *   'cloud' —— 走 wx.cloud.callFunction 调 webLoginApi 的 cardWorld* action
 * 正式切换前必须确认：AppID 已关联业务环境、cardWorld* 已部署、返回结构与本地视图同构。
 */

var BUSINESS_ENV = 'cloud1-7g8ckb3c7815a011'
var DEV_ENV = 'sxf-world-dev-d6gxotk5mc8bb7cb6'
var CLOUD_FUNCTION = 'webLoginApi'
var MODE = 'local' // 'local' | 'cloud'

module.exports = {
  BUSINESS_ENV: BUSINESS_ENV,
  DEV_ENV: DEV_ENV,
  CLOUD_FUNCTION: CLOUD_FUNCTION,
  MODE: MODE
}
