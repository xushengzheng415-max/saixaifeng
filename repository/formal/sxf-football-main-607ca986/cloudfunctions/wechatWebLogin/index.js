// ΢�ſ���ƽ̨ - ��վɨ���¼
// ���̣�ǰ����ת΢����Ȩ �� �û�ɨ�� �� �ص��� code �� ���ƺ����� code �� access_token �� ��ȡ�û���Ϣ �� ��¼
//
// �� �޸�˵����2026-06-18����
//   1. �ֶ������ݣ�С������� phoneNumber/openId����ҳ���� phone/wechatOpenId
//      ����������ͬʱ��ѯ�����ֶ������������˺�ʶ������
//   2. needBindPhone �ж�ͬʱ��� phone �� phoneNumber �ֶ�
//   3. ���ص��û���Ϣ��ͳһ��һ��Ϊ��׼�ֶ���
//
const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: cloud.SYMBOL_CURRENT_ENV })

// ========== ���� ==========
const APP_ID = process.env.WECHAT_WEB_APPID || ''
const APP_SECRET = process.env.WECHAT_WEB_APPSECRET || ''

/**
 * �� https ģ�鷢�� HTTP GET ����Node 16 ���ݣ�
 */
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch(e) { resolve(data) }
      })
    })
    req.on('error', reject)
    req.setTimeout(10000, () => { req.destroy(new Error('����ʱ')) })
  })
}

/**
 * �� code ��ȡ access_token ���û���Ϣ
 * API: https://api.weixin.qq.com/sns/oauth2/access_token
 */
async function exchangeCodeForToken(code) {
  const url = 'https://api.weixin.qq.com/sns/oauth2/access_token?appid=' + APP_ID + '&secret=' + APP_SECRET + '&code=' + code + '&grant_type=authorization_code'
  const data = await httpsGet(url)
  if (data.errcode && data.errcode !== 0) {
    throw new Error('΢�Ŵ���' + (data.errmsg || 'δ֪����'))
  }
  return data
}

/**
 * ͨ�� access_token ��ȡ�û���Ϣ
 * API: https://api.weixin.qq.com/sns/userinfo
 */
async function getUserInfo(accessToken, openId) {
  const url = 'https://api.weixin.qq.com/sns/userinfo?access_token=' + accessToken + '&openid=' + openId
  const data = await httpsGet(url)
  if (data.errcode && data.errcode !== 0) {
    throw new Error('��ȡ�û���Ϣʧ�ܣ�' + (data.errmsg || 'δ֪����'))
  }
  return data
}

/**
 * ͨ�ø������������û������л�ȡ�ֻ��ţ����������ֶ�����
 * @param {Object} user �û���¼
 * @returns {string} �ֻ��ţ����ַ�����ʾ��
 */
function getUserPhone(user) {
  return user.phone || user.phoneNumber || ''
}

/**
 * ͨ�ø������������ֻ��Ų����û���ͬʱ��ѯ phone �� phoneNumber �ֶΣ�
 * @param {Object} db ���ݿ�����
 * @param {string} phone �ֻ���
 * @returns {Promise<Object|null>} �ҵ����û��� null
 */
async function findUserByPhone(db, phone) {
  if (!phone) return null

  // �Ȳ� phone �ֶΣ���ҳ�˱�׼�ֶΣ�
  const res1 = await db.collection('users').where({ phone: phone }).get()
  if (res1.data && res1.data.length > 0) return res1.data[0]

  // �ٲ� phoneNumber �ֶΣ�С������ֶΣ�
  const res2 = await db.collection('users').where({ phoneNumber: phone }).get()
  if (res2.data && res2.data.length > 0) return res2.data[0]

  return null
}

/**
 * ���һ򴴽��û�
 *
 * �� �����߼�����ǿ�棩��
 * 1. �� unionId ���ң���ɿ� �� ͬһ����ƽ̨�¸�Ӧ��unionId��ͬ��
 * 2. �� wechatOpenId / openId ���ң���ҳ��openId��
 * 3. ����ṩ���ֻ��ţ��Ѷ�����֤�������ֻ��Ų��Ҳ��ϲ�΢����Ϣ
 * 4. ��û�� �� ������ʱ�û����������ֻ���ʱ�ϲ���
 *
 * @param {Object} db - ���ݿ�����
 * @param {Object} userInfo - ΢�ŷ��ص��û���Ϣ���� unionid, openid, nickname, headimgurl��
 * @param {string} phone - ����֤���ֻ��ţ�����Ϊ�գ�
 * @returns {{ user: Object, isNewUser: boolean, merged: boolean }}
 */
async function findOrCreateUser(db, userInfo, phone) {
  const unionId = userInfo.unionid || ''
  const openId = userInfo.openid
  const now = new Date()

  let user = null
  let isNewUser = false
  let merged = false

  // ===== ��1��������ͨ�� unionId ���� =====
  // ͬһ΢�ſ���ƽ̨�£�С�������վӦ�õ� unionId ��ͬ
  if (unionId) {
    const res = await db.collection('users').where({ unionId: unionId }).get()
    if (res.data && res.data.length > 0) {
      user = res.data[0]
      console.log('[wechatWebLogin] ͨ�� unionId �ҵ��û�:', user._id, 'phone=', getUserPhone(user))
    }
  }

  // ===== ��2����ͨ�� openId ���ң����������ֶ�����=====
  if (!user) {
    // ��ҳ�˱�׼�ֶ�
    const res1 = await db.collection('users').where({ wechatOpenId: openId }).get()
    if (res1.data && res1.data.length > 0) {
      user = res1.data[0]
      console.log('[wechatWebLogin] ͨ�� wechatOpenId �ҵ��û�:', user._id)
      // ���� unionId
      if (unionId && !user.unionId) {
        await db.collection('users').doc(user._id).update({ data: { unionId: unionId, updateTime: now } })
        user.unionId = unionId
      }
    } else {
      // С������ֶ���
      const res2 = await db.collection('users').where({ openId: openId }).get()
      if (res2.data && res2.data.length > 0) {
        user = res2.data[0]
        console.log('[wechatWebLogin] ͨ�� openId(С�����ֶ�)�ҵ��û�:', user._id)
        // ���� unionId �ͱ�׼�� openId �ֶ�
        const updateData = { unionId: unionId || user.unionId || '', wechatOpenId: openId, updateTime: now }
        await db.collection('users').doc(user._id).update({ data: updateData })
        Object.assign(user, updateData)
      }
    }
  }

  // ===== ��3������û�ҵ� �� �����ֻ����жϺϲ������½� =====
  if (!user) {
    if (phone) {
      // ���ֻ��ţ����������˺ţ�ͬʱ�� phone �� phoneNumber �ֶΣ�
      const existingUser = await findUserByPhone(db, phone)
      if (existingUser) {
        // �ϲ�������ҳ��΢����Ϣ���䵽�����˺�
        const targetUser = existingUser
        const updateData = {
          unionId: targetUser.unionId || unionId || '',
          wechatOpenId: targetUser.wechatOpenId || openId || '',
          // ���ԭ��û�б�׼ phone �ֶΣ�����
          phone: targetUser.phone || targetUser.phoneNumber || phone,
          nickname: userInfo.nickname || targetUser.nickname || targetUser.nickName || '΢���û�',
          headimgurl: userInfo.headimgurl || targetUser.headimgurl || targetUser.avatarUrl || '',
          lastLoginTime: now,
          updateTime: now
        }
        await db.collection('users').doc(targetUser._id).update({ data: updateData })
        user = { ...targetUser, ...updateData }
        merged = true
        console.log('[wechatWebLogin] ? �ϲ��˺ţ���ҳ΢����Ϣ�Ѳ��䵽�����ֻ����˺�', targetUser._id, 'phone=', phone)
      } else {
        // �ֻ���Ҳ�����ڣ��������û�
        const newUserRes = await db.collection('users').add({
          data: {
            wechatOpenId: openId,
            unionId: unionId,
            nickname: userInfo.nickname || '΢���û�',
            headimgurl: userInfo.headimgurl || '',
            phone: phone,
            email: '',
            role: '',
            passwordSet: false,
            loginType: 'wechat',
            lastLoginTime: now,
            createTime: now,
            updateTime: now
          }
        })
        user = {
          _id: newUserRes._id,
          wechatOpenId: openId,
          unionId: unionId,
          nickname: userInfo.nickname || '΢���û�',
          headimgurl: userInfo.headimgurl || '',
          phone: phone,
          email: '',
          role: '',
          passwordSet: false,
          isNew: true
        }
        isNewUser = true
        console.log('[wechatWebLogin] �������û������ֻ��ţ�:', newUserRes._id)
      }
    } else {
      // û���ֻ��ţ�������ʱ�û�������������ֻ��ţ�
      const newUserRes = await db.collection('users').add({
        data: {
          wechatOpenId: openId,
          unionId: unionId,
          nickname: userInfo.nickname || '΢���û�',
          headimgurl: userInfo.headimgurl || '',
          phone: '',
          email: '',
          role: '',
          passwordSet: false,
          loginType: 'wechat',
          lastLoginTime: now,
          createTime: now,
          updateTime: now
        }
      })
      user = {
        _id: newUserRes._id,
        wechatOpenId: openId,
        unionId: unionId,
        nickname: userInfo.nickname || '΢���û�',
        headimgurl: userInfo.headimgurl || '',
        phone: '',
        email: '',
        role: '',
        passwordSet: false,
        isNew: true
      }
      isNewUser = true
      console.log('[wechatWebLogin] ������ʱ�û��������ֻ��ţ�:', newUserRes._id)
    }
  } else {
    // ===== �û��Ѵ��ڣ����µ�¼ʱ���ͷ��/�ǳ� =====
    // ͬʱ��׼�� phone �ֶΣ����ֻ�� phoneNumber��
    const existingPhone = getUserPhone(user)
    const updateData = {
      headimgurl: userInfo.headimgurl || user.headimgurl || '',
      nickname: userInfo.nickname || user.nickname || user.nickName || '',
      lastLoginTime: now,
      updateTime: now
    }
    // ����� phoneNumber ��û�� phone���Զ����� phone �ֶ�
    if (!user.phone && user.phoneNumber) {
      updateData.phone = user.phoneNumber
    }
    await db.collection('users').doc(user._id).update({ data: updateData })
    user.nickname = updateData.nickname
    user.headimgurl = updateData.headimgurl
    if (updateData.phone) user.phone = updateData.phone
    console.log('[wechatWebLogin] �����û����³ɹ�:', user._id, 'phone=', existingPhone || '(��)')
  }

  return { user, isNewUser, merged }
}

/**
 * �����ֻ���ӳ���ɫ
 */
// ========== ����� ==========
exports.main = async (event) => {
  const { code, phone: eventPhone, smsCode } = event
  const db = cloud.database()

  console.log('[wechatWebLogin] �յ�����code=' + (code ? code.substring(0, 8) + '...' : '��') + ' phone=' + (eventPhone || '��'))

  try {
    // 1. ����У��
    if (!code) {
      return { success: false, error: 'ȱ����Ȩ��' }
    }

    if (!APP_ID || !APP_SECRET) {
      console.error('[wechatWebLogin] δ���� WECHAT_WEB_APPID / WECHAT_WEB_APPSECRET ��������')
      return { success: false, error: 'ϵͳ���ô���δ����΢�ſ���ƽ̨ƾ֤' }
    }

    // 2. �� code ��ȡ access_token + openid + unionid
    const tokenData = await exchangeCodeForToken(code)
    console.log('[wechatWebLogin] token�����ɹ���openid=', tokenData.openid, 'unionid=', (tokenData.unionid || '��'))

    // 3. ��ȡ�û���ϸ��Ϣ
    const wxUserInfo = await getUserInfo(tokenData.access_token, tokenData.openid)
    console.log('[wechatWebLogin] �û���Ϣ��ȡ�ɹ���nickname=', wxUserInfo.nickname)

    // 4. ��������ֻ��źͶ�����֤�룬����֤
    let verifiedPhone = ''
    if (eventPhone && smsCode) {
      const smsResult = await db.collection('sms_codes').where({
        phoneNumber: eventPhone,
        code: smsCode,
        used: false
      }).orderBy('createTime', 'desc').limit(1).get()

      if (!smsResult.data || smsResult.data.length === 0) {
        return { success: false, error: '��֤�������ѹ���' }
      }
      const smsRecord = smsResult.data[0]
      const createTime = new Date(smsRecord.createTime)
      const now = new Date()
      if ((now - createTime) > 5 * 60 * 1000) {
        return { success: false, error: '��֤���ѹ��ڣ������»�ȡ' }
      }
      await db.collection('sms_codes').doc(smsRecord._id).update({
        data: { used: true, useTime: new Date() }
      })
      verifiedPhone = eventPhone
      console.log('[wechatWebLogin] �ֻ�����֤�ɹ���', verifiedPhone)
    }

    // 5. ���һ򴴽��û����� ��ǿ�棺֧�ֿ���ֶ������ݣ�
    const { user, isNewUser, merged } = await findOrCreateUser(db, wxUserInfo, verifiedPhone)
    const finalPhone = getUserPhone(user)
    console.log('[wechatWebLogin] �û�������ɣ�isNewUser=', isNewUser, 'merged=', merged, 'userId=', user._id, 'phone=', finalPhone || '(��)')

    // 6. �ж��Ƿ���Ҫǿ�Ʋ������� ͬʱ��� phone �� phoneNumber��
    const needSetPassword = !user.passwordSet
    const needBindPhone = !finalPhone && !verifiedPhone
    const needBindEmail = !(user.email || '')
    const needSelectRole = false

    // 7. �����û���ֻ��ţ����� needPhoneBinding ��ǰ�˵���ҳ
    if (needBindPhone) {
      return {
        success: true,
        needPhoneBinding: true,
        wechatTemp: {
          unionId: user.unionId || wxUserInfo.unionid || '',
          openId: user.wechatOpenId || tokenData.openid,
          nickname: user.nickname,
          headimgurl: user.headimgurl
        },
        message: '����ֻ���'
      }
    }

    // 8. ȷ�����ս�ɫ���� ʹ�ù�һ������ֻ��ţ�
    const finalRole = 'ORGANIZER'
    // 9. �����Զ����¼Ʊ��
    const ticket = null

    return {
      success: true,
      ticket: ticket,
      message: merged ? '�˺��Ѻϲ�����ӭ������' : (isNewUser ? 'ע�Ტ��¼�ɹ�' : '��ӭ������'),
      needSetPassword,
      needBindPhone: false,
      needBindEmail,
      needSelectRole,
      role: finalRole,
      merged: merged,
      user: {
        _id: user._id,
        openid: user.wechatOpenId || user.openId || tokenData.openid,
        unionid: user.unionId || wxUserInfo.unionid || '',
        nickname: user.nickname || user.nickName || '',
        headimgurl: user.headimgurl || user.avatarUrl || '',
        phone: finalPhone || verifiedPhone || '',
        email: user.email || '',
        role: finalRole
      },
      isNewUser
    }

  } catch (err) {
    console.error('[wechatWebLogin] ����', err.message || err)
    return { success: false, error: err.message || '��¼ʧ�ܣ�������' }
  }
}
