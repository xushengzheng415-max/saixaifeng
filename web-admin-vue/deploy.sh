#!/bin/bash
# 赛小蜂足球管理系统 - 一键部署脚本
# 用法: ./deploy.sh

set -e

ENV_ID="cloud1-7g8ckb3c7815a011"
PROD_URL="https://${ENV_ID}-1419431905.tcloudbaseapp.com"

echo "🚀 开始部署赛小蜂到公网..."
echo ""

echo "📦 [1/2] 构建生产版本..."
npm run build
echo "✅ 构建完成"
echo ""

echo "☁️  [2/2] 上传到 CloudBase 静态托管..."
tcb hosting deploy dist/ -e ${ENV_ID}
echo "✅ 上传完成"
echo ""

echo "🎉 部署成功！"
echo ""
echo "📍 访问地址："
echo "   广告页（登录入口）: ${PROD_URL}/landing-page.html"
echo "   管理后台（需登录）: ${PROD_URL}/#/tournaments"
echo ""
echo "💡 以后改完 Bug，只需要在本目录运行："
echo "   npm run deploy"
echo "   或： ./deploy.sh"
echo ""
