const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const ROLE_LABELS = {
  director: '主任', deputy: '副主任', committee: '委员',
  supervisor: '裁判监督/评估员', lecturer: '裁判讲师', coordinator: '裁判组协调员'
}

exports.main = async (event, context) => {
  const params = event.data || event
  const { action, tournamentId, enabled, memberId, refereeId, refereeName, role, responsibilities } = params

  try {
    if (action === 'list') {
      if (!tournamentId) return { code: 400, message: '缺少赛事ID' }
      const res = await db.collection('referee_committee').where({ tournamentId }).orderBy('createTime', 'asc').get()
      let committeeEnabled = false
      try {
        const tRes = await db.collection('tournaments').doc(tournamentId).get()
        committeeEnabled = tRes.data?.refContactInfo?.committeeEnabled || false
      } catch (e) {}
      return { code: 0, data: res.data || [], enabled: committeeEnabled, roleLabels: ROLE_LABELS }
    }

    if (action === 'toggleEnabled') {
      if (!tournamentId) return { code: 400, message: '缺少赛事ID' }
      await db.collection('tournaments').doc(tournamentId).update({
        data: { 'refContactInfo.committeeEnabled': !!enabled, updateTime: db.serverDate() }
      })
      return { code: 0, message: '操作成功' }
    }

    if (action === 'create') {
      if (!refereeId || !role) return { code: 400, message: '缺少参数' }
      const doc = {
        tournamentId: tournamentId || '', refereeId, refereeName: refereeName || '',
        role, roleLabel: ROLE_LABELS[role] || role, responsibilities: responsibilities || '',
        createTime: db.serverDate(), updateTime: db.serverDate()
      }
      const addRes = await db.collection('referee_committee').add({ data: doc })
      return { code: 0, message: '添加成功', id: addRes._id }
    }

    if (action === 'delete') {
      if (!memberId) return { code: 400, message: '缺少成员ID' }
      await db.collection('referee_committee').doc(memberId).remove()
      return { code: 0, message: '删除成功' }
    }

    return { code: 400, message: '未知操作' }
  } catch (err) {
    console.error('manageRefereeCommittee error:', err)
    return { code: 500, message: err.message || '服务器错误' }
  }
}
