import pinyin from 'tiny-pinyin'

/** 复姓列表 */
const COMPOUND_SURNAMES = [
  '司马', '上官', '欧阳', '夏侯', '诸葛', '闻人', '东方', '赫连',
  '皇甫', '尉迟', '公羊', '澹台', '公冶', '宗政', '濮阳', '淳于',
  '单于', '太叔', '申屠', '公孙', '仲孙', '轩辕', '令狐', '钟离',
  '宇文', '长孙', '慕容', '鲜于', '闾丘', '司徒', '司空', '亓官',
  '司寇', '子车', '颛孙', '端木', '巫马', '公西', '漆雕', '乐正',
  '壤驷', '公良', '拓跋', '夹谷', '宰父', '谷梁', '段干', '百里',
  '东郭', '南门', '呼延', '羊舌', '微生', '梁丘', '左丘', '东门',
  '西门', '第五'
]

/**
 * 获取单个汉字的拼音（全大写）
 */
function toPinyin(char) {
  const result = pinyin.convertToPinyin(char, '', true)
  return result ? result.toUpperCase() : char
}

/**
 * 获取拼音的首字母（正确处理 ZH/CH/SH）
 */
function toInitial(py) {
  if (!py || py.length === 0) return ''
  const upper = py.toUpperCase()
  if (upper.startsWith('ZH')) return 'ZH'
  if (upper.startsWith('CH')) return 'CH'
  if (upper.startsWith('SH')) return 'SH'
  return upper.charAt(0)
}

function isMostlyLatinName(name) {
  const text = String(name || '').trim()
  if (!text) return false
  const latin = (text.match(/[A-Za-z\u00C0-\u024F]/g) || []).length
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length
  return latin >= 2 && latin > cjk
}

/** 英文/拉丁姓名球衣名默认取姓（末段），大写。例：Ali Majdi → MAJDI；AmirMohammadSeyedi → SEYEDI */
export function latinJerseySurname(name) {
  const text = String(name || '').trim()
  if (!text) return ''
  if (/\s/.test(text)) {
    const parts = text.split(/\s+/).filter(Boolean)
    return String(parts[parts.length - 1] || '').replace(/[^A-Za-z\u00C0-\u024F]/g, '').toUpperCase().slice(0, 20)
  }
  const letters = text.replace(/[^A-Za-z\u00C0-\u024F]/g, '')
  const parts = letters
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length >= 2) return parts[parts.length - 1].toUpperCase().slice(0, 20)
  return letters.toUpperCase().slice(0, 20)
}

/**
 * 生成球衣名
 * 中文：姓氏全拼 + 空格 + 名字各字首字母加点（例："郑旭升" → "ZHENG X.S."）
 * 拉丁/英文：默认取姓并大写（例："AliMajdi" → "MAJDI"）
 * @param {string} name - 姓名
 * @returns {string} 球衣名
 */
export function generateJerseyName(name) {
  if (!name) return ''
  if (isMostlyLatinName(name)) return latinJerseySurname(name)
  if (name.length < 2) return ''

  let surname = ''
  let givenNames = ''

  // 检查复姓
  const firstTwo = name.substring(0, 2)
  if (COMPOUND_SURNAMES.includes(firstTwo) && name.length > 2) {
    surname = firstTwo
    givenNames = name.substring(2)
  } else {
    surname = name.charAt(0)
    givenNames = name.substring(1)
  }

  // 姓氏全拼
  let surnamePinyin = ''
  for (const char of surname) {
    surnamePinyin += toPinyin(char)
  }

  // 名字各字首字母
  const initials = []
  for (const char of givenNames) {
    const py = toPinyin(char)
    const init = toInitial(py)
    if (init) initials.push(init + '.')
  }

  const suffix = initials.join('')
  const jerseyName = suffix ? `${surnamePinyin} ${suffix}` : surnamePinyin
  return jerseyName.toUpperCase()
}
