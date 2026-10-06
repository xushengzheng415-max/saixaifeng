// manageTournamentCenterAccounts 云函数
// 赛事中心 — 白名单账号管理（仅 super_admin 可操作）
// 支持：list（列表）、add（添加）、remove（删除）、toggle（启用/禁用）
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.SYMBOL_CURRENT_ENV })

// ========== 权限校验 ==========

async function checkSuperAdmin(db, operatorPhone) {
  if (!operatorPhone) {
    throw new Error('未授权：缺少操作人信息')
  }

  const result = await db.collection('tournament_center_users')
    .where({ phone: operatorPhone })
    .get()

  if (!result.data || result.data.length === 0) {
    throw new Error('未授权：操作人不存在')
  }

  const operator = result.data[0]

  if (operator.status !== 'active') {
    throw new Error('未授权：操作人账号已被禁用')
  }

  if (operator.role !== 'super_admin') {
    throw new Error('无权限：仅超级管理员可执行此操作')
  }

  return operator
}

// ========== 操作处理 ==========

/** 列出所有账号 */
async function handleList(db, operatorPhone) {
  await checkSuperAdmin(db, operatorPhone)

  const result = await db.collection('tournament_center_users')
    .orderBy('createdAt', 'desc')
    .get()

  // 移除密码字段，不返回给前端
  const safeList = (result.data || []).map(user => {
    const { password, ...safe } = user
    return safe
  })

  return { success: true, data: safeList }
}

/** 添加账号 */
async function handleAdd(db, params) {
  const { phone, displayName, role, operatorPhone } = params
  await checkSuperAdmin(db, operatorPhone)

  // 参数校验
  if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
    return { success: false, error: '请输入正确的手机号' }
  }

  if (!displayName || !displayName.trim()) {
    return { success: false, error: '请输入姓名' }
  }

  const validRoles = ['super_admin', 'admin']
  if (!role || !validRoles.includes(role)) {
    return { success: false, error: '角色无效，可选：super_admin 或 admin' }
  }

  // 检查是否已存在
  const exist = await db.collection('tournament_center_users')
    .where({ phone })
    .count()

  if (exist.total > 0) {
    return { success: false, error: '该手机号已存在' }
  }

  // 添加账号
  await db.collection('tournament_center_users').add({
    data: {
      phone,
      displayName: displayName.trim(),
      role,
      status: 'active',
      createdBy: operatorPhone,
      createdAt: db.serverDate(),
      updatedAt: db.serverDate()
    }
  })

  console.log('[manageTournamentCenterAccounts] 添加账号:', phone, 'by', operatorPhone)
  return { success: true, message: '账号添加成功' }
}

/** 删除账号 */
async function handleRemove(db, params) {
  const { phone, operatorPhone } = params
  await checkSuperAdmin(db, operatorPhone)

  if (!phone) {
    return { success: false, error: '请指定要删除的手机号' }
  }

  // 不能删除自己
  if (phone === operatorPhone) {
    return { success: false, error: '不能删除自己的账号' }
  }

  const result = await db.collection('tournament_center_users')
    .where({ phone })
    .get()

  if (!result.data || result.data.length === 0) {
    return { success: false, error: '账号不存在' }
  }

  await db.collection('tournament_center_users').doc(result.data[0]._id).remove()

  console.log('[manageTournamentCenterAccounts] 删除账号:', phone, 'by', operatorPhone)
  return { success: true, message: '账号已删除' }
}

/** 切换账号状态（启用/禁用） */
async function handleToggle(db, params) {
  const { phone, operatorPhone } = params
  await checkSuperAdmin(db, operatorPhone)

  if (!phone) {
    return { success: false, error: '请指定要操作的手机号' }
  }

  // 不能禁用自己的账号
  if (phone === operatorPhone) {
    return { success: false, error: '不能禁用自己的账号' }
  }

  const result = await db.collection('tournament_center_users')
    .where({ phone })
    .get()

  if (!result.data || result.data.length === 0) {
    return { success: false, error: '账号不存在' }
  }

  const user = result.data[0]
  const newStatus = user.status === 'active' ? 'disabled' : 'active'

  await db.collection('tournament_center_users').doc(user._id).update({
    data: {
      status: newStatus,
      updatedAt: db.serverDate()
    }
  })

  console.log('[manageTournamentCenterAccounts] 切换状态:', phone, '→', newStatus, 'by', operatorPhone)
  return {
    success: true,
    message: newStatus === 'active' ? '账号已启用' : '账号已禁用',
    newStatus
  }
}

// ========== 主函数 ==========

exports.main = async (event) => {
  const { action } = event
  const db = cloud.database()

  try {
    switch (action) {
      case 'list':
        return await handleList(db, event.operatorPhone)

      case 'add':
        return await handleAdd(db, event)

      case 'remove':
        return await handleRemove(db, event)

      case 'toggle':
        return await handleToggle(db, event)

      default:
        return { success: false, error: '未知操作：' + action + '（支持 list/add/remove/toggle）' }
    }
  } catch (err) {
    // 权限错误直接返回
    if (err.message && err.message.startsWith('未授权') || err.message && err.message.startsWith('无权限')) {
      return { success: false, error: err.message }
    }
    console.error('[manageTournamentCenterAccounts] 错误:', err)
    return { success: false, error: err.message || '账号管理服务异常' }
  }
}
