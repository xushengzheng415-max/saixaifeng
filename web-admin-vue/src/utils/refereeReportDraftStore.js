import { getPlayerReadIdentity } from './cloud'

const DATABASE = 'sxf-referee-review-drafts-v1'
async function ownerKey(matchId) {
  const guard = getPlayerReadIdentity()
  const read = key => { try { return JSON.parse(localStorage.getItem(key) || '{}') } catch { return {} } }
  const user = read('userInfo'), current = read('currentUser'), organization = read('currentOrganization'), org = read('currentOrg')
  const userId = user._id || user.id || user.userId || user.user?._id || current._id || current.id || current.userId
  const orgId = organization._id || organization.id || organization.orgId || org._id || org.id || user.orgId || current.orgId || ''
  if (!userId || !matchId) throw new Error('请登录后保存或恢复草稿')
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([location.origin,String(userId),String(orgId),String(matchId)])))
  if (guard !== getPlayerReadIdentity()) throw new Error('账号已变化，请重新进入比赛')
  return { key:[...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,'0')).join(''), guard }
}
function database() {
  return new Promise((resolve,reject) => {
    const request = indexedDB.open(DATABASE,1)
    request.onupgradeneeded = () => request.result.createObjectStore('drafts',{keyPath:'key'})
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('本机草稿存储不可用，请检查浏览器空间'))
  })
}
async function access(matchId,mode,operation) {
  const owner = await ownerKey(matchId), db = await database()
  try {
    if (owner.guard !== getPlayerReadIdentity()) throw new Error('账号已变化，请重新进入比赛')
    return await new Promise((resolve,reject) => {
      const transaction = db.transaction('drafts',mode), request = operation(transaction.objectStore('drafts'),owner.key)
      let result
      request.onsuccess = () => { result = request.result }
      transaction.oncomplete = () => owner.guard === getPlayerReadIdentity() ? resolve(result) : reject(new Error('账号已变化，请重新进入比赛'))
      transaction.onabort = transaction.onerror = () => reject(new Error('草稿保存失败，请检查浏览器存储空间'))
    })
  } finally { db.close() }
}
export const loadReportDraft = matchId => access(matchId,'readonly',(store,key)=>store.get(key))
export const saveReportDraft = (matchId,value) => access(matchId,'readwrite',(store,key)=>store.put({...value,key,version:1,savedAt:Date.now()}))
export const deleteReportDraft = matchId => access(matchId,'readwrite',(store,key)=>store.delete(key))
