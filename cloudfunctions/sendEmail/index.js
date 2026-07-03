// sendEmail 云函数 - 发送邮件（QQ邮箱SMTP）
const cloud = require('wx-server-sdk')
const nodemailer = require('nodemailer')

cloud.init({ env: 'cloud1-7g8ckb3c7815a011' })

// QQ邮箱配置（从环境变量读取，避免硬编码）
const SMTP_CONFIG = {
  host: 'smtp.qq.com',
  port: 465,
  secure: true, // SSL
  auth: {
    user: process.env.SMTP_USER || '',   // 发件人邮箱，如 123456@qq.com
    pass: process.env.SMTP_PASS || ''    // QQ邮箱授权码（非密码）
  }
}

/**
 * 发送邮件
 * event: { to, subject, body }
 */
exports.main = async (event, context) => {
  const { to, subject, body } = event

  if (!to || !subject || !body) {
    return { success: false, error: '缺少必要参数：to, subject, body' }
  }

  if (!SMTP_CONFIG.auth.user || !SMTP_CONFIG.auth.pass) {
    console.error('[sendEmail] SMTP配置缺失，请配置环境变量 SMTP_USER / SMTP_PASS')
    return { success: false, error: '邮件服务未配置，请联系管理员' }
  }

  try {
    const transporter = nodemailer.createTransport(SMTP_CONFIG)

    const mailOptions = {
      from: `"赛小蜂足球" <${SMTP_CONFIG.auth.user}>`,
      to: to,
      subject: subject,
      text: body,
      // 可选：HTML格式
      // html: `<p>${body.replace(/\n/g, '<br>')}</p>`
    }

    const info = await transporter.sendMail(mailOptions)
    console.log('[sendEmail] 邮件发送成功：', info.messageId)

    return {
      success: true,
      messageId: info.messageId
    }
  } catch (err) {
    console.error('[sendEmail] 邮件发送失败：', err)
    return { success: false, error: err.message || '邮件发送失败' }
  }
}
