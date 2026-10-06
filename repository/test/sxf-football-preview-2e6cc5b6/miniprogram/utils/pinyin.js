// utils/pinyin.js - 拼音转换工具（覆盖常见姓名用字）
const PINYIN_MAP = {
  // 姓氏
  '赵':'ZHAO','钱':'QIAN','孙':'SUN','李':'LI','周':'ZHOU','吴':'WU','郑':'ZHENG','王':'WANG',
  '冯':'FENG','陈':'CHEN','褚':'CHU','卫':'WEI','蒋':'JIANG','沈':'SHEN','韩':'HAN','杨':'YANG',
  '朱':'ZHU','秦':'QIN','尤':'YOU','许':'XU','何':'HE','吕':'LV','施':'SHI','张':'ZHANG',
  '孔':'KONG','曹':'CAO','严':'YAN','华':'HUA','金':'JIN','魏':'WEI','陶':'TAO','姜':'JIANG',
  '戚':'QI','谢':'XIE','邹':'ZOU','喻':'YU','柏':'BO','水':'SHUI','窦':'DOU','章':'ZHANG',
  '云':'YUN','苏':'SU','潘':'PAN','葛':'GE','奚':'XI','范':'FAN','彭':'PENG','郎':'LANG',
  '鲁':'LU','韦':'WEI','昌':'CHANG','马':'MA','苗':'MIAO','凤':'FENG','花':'HUA','方':'FANG',
  '俞':'YU','任':'REN','袁':'YUAN','柳':'LIU','丰':'FENG','鲍':'BAO','史':'SHI','唐':'TANG',
  '费':'FEI','廉':'LIAN','岑':'CEN','薛':'XUE','雷':'LEI','贺':'HE','倪':'NI','汤':'TANG',
  '滕':'TENG','殷':'YIN','罗':'LUO','毕':'BI','郝':'HAO','邬':'WU','安':'AN','常':'CHANG',
  '乐':'YUE','于':'YU','时':'SHI','傅':'FU','皮':'PI','卞':'BIAN','齐':'QI','康':'KANG',
  '伍':'WU','余':'YU','元':'YUAN','卜':'BU','顾':'GU','孟':'MENG','平':'PING','黄':'HUANG',
  '和':'HE','穆':'MU','萧':'XIAO','尹':'YIN','姚':'YAO','邵':'SHAO','湛':'ZHAN','汪':'WANG',
  '祁':'QI','毛':'MAO','禹':'YU','狄':'DI','米':'MI','贝':'BEI','明':'MING','臧':'ZANG',
  '计':'JI','伏':'FU','成':'CHENG','戴':'DAI','谈':'TAN','宋':'SONG','茅':'MAO','庞':'PANG',
  '熊':'XIONG','纪':'JI','舒':'SHU','屈':'QU','项':'XIANG','祝':'ZHU','董':'DONG','梁':'LIANG',
  '杜':'DU','阮':'RUAN','蓝':'LAN','闵':'MIN','席':'XI','季':'JI','麻':'MA','强':'QIANG',
  '贾':'JIA','路':'LU','娄':'LOU','危':'WEI','江':'JIANG','童':'TONG','颜':'YAN','郭':'GUO',
  '梅':'MEI','盛':'SHENG','林':'LIN','刁':'DIAO','钟':'ZHONG','徐':'XU','邱':'QIU','骆':'LUO',
  '高':'GAO','夏':'XIA','蔡':'CAI','田':'TIAN','樊':'FAN','胡':'HU','凌':'LING','霍':'HUO',
  '虞':'YU','万':'WAN','支':'ZHI','柯':'KE','昝':'ZAN','管':'GUAN','卢':'LU','莫':'MO',
  '经':'JING','房':'FANG','裘':'QIU','缪':'MIAO','干':'GAN','解':'XIE','应':'YING','宗':'ZONG',
  '丁':'DING','宣':'XUAN','贲':'BEN','邓':'DENG','郁':'YU','单':'SHAN','杭':'HANG','洪':'HONG',
  '包':'BAO','诸':'ZHU','左':'ZUO','石':'SHI','崔':'CUI','吉':'JI','钮':'NIU','龚':'GONG',
  '程':'CHENG','嵇':'JI','邢':'XING','滑':'HUA','裴':'PEI','陆':'LU','荣':'RONG','翁':'WENG',
  '荀':'XUN','羊':'YANG','於':'YU','惠':'HUI','甄':'ZHEN','曲':'QU','家':'JIA','封':'FENG',
  '芮':'RUI','羿':'YI','储':'CHU','靳':'JIN','汲':'JI','邴':'BING','糜':'MI','松':'SONG',
  '井':'JING','段':'DUAN','富':'FU','巫':'WU','乌':'WU','焦':'JIAO','巴':'BA','弓':'GONG',
  '牧':'MU','隗':'WEI','山':'SHAN','谷':'GU','车':'CHE','侯':'HOU','宓':'MI','蓬':'PENG',
  '全':'QUAN','郗':'XI','班':'BAN','仰':'YANG','秋':'QIU','仲':'ZHONG','伊':'YI','宫':'GONG',
  '宁':'NING','仇':'QIU','栾':'LUAN','暴':'BAO','甘':'GAN','钭':'TOU','厉':'LI','戎':'RONG',
  '祖':'ZU','武':'WU','符':'FU','刘':'LIU','景':'JING','詹':'ZHAN','束':'SHU','龙':'LONG',
  '叶':'YE','幸':'XING','司':'SI','韶':'SHAO','郜':'GAO','黎':'LI','蓟':'JI','薄':'BO',
  '印':'YIN','宿':'SU','白':'BAI','怀':'HUAI','蒲':'PU','邰':'TAI','从':'CONG','鄂':'E',
  '索':'SUO','咸':'XIAN','籍':'JI','赖':'LAI','卓':'ZHUO','蔺':'LIN','屠':'TU','蒙':'MENG',
  '池':'CHI','乔':'QIAO','阴':'YIN','郁':'YU','胥':'XU','能':'NENG','苍':'CANG','双':'SHUANG',
  '闻':'WEN','莘':'SHEN','党':'DANG','翟':'ZHAI','谭':'TAN','贡':'GONG','劳':'LAO','逄':'PANG',
  '姬':'JI','申':'SHEN','扶':'FU','堵':'DU','冉':'RAN','宰':'ZAI','郦':'LI','雍':'YONG',
  '却':'QUE','璩':'QU','桑':'SANG','桂':'GUI','濮':'PU','牛':'NIU','寿':'SHOU','通':'TONG',
  '边':'BIAN','扈':'HU','燕':'YAN','冀':'JI','郏':'JIA','浦':'PU','尚':'SHANG','农':'NONG',
  '温':'WEN','别':'BIE','庄':'ZHUANG','晏':'YAN','柴':'CHAI','瞿':'QU','阎':'YAN','充':'CHONG',
  '慕':'MU','连':'LIAN','茹':'RU','习':'XI','宦':'HUAN','艾':'AI','鱼':'YU','容':'RONG',
  '向':'XIANG','古':'GU','易':'YI','慎':'SHEN','戈':'GE','廖':'LIAO','庚':'GENG','终':'ZHONG',
  '暨':'JI','居':'JU','衡':'HENG','步':'BU','都':'DU','耿':'GENG','满':'MAN','弘':'HONG',
  '匡':'KUANG','国':'GUO','文':'WEN','寇':'KOU','广':'GUANG','禄':'LU','阙':'QUE','东':'DONG',
  '欧':'OU','殳':'SHU','沃':'WO','利':'LI','蔚':'WEI','越':'YUE','夔':'KUI','隆':'LONG',
  '师':'SHI','巩':'GONG','厍':'SHE','聂':'NIE','晁':'CHAO','勾':'GOU','敖':'AO','融':'RONG',
  '冷':'LENG','訾':'ZI','辛':'XIN','阚':'KAN','那':'NA','简':'JIAN','饶':'RAO','空':'KONG',
  '曾':'ZENG','毋':'WU','沙':'SHA','乜':'MIE','养':'YANG','鞠':'JU','须':'XU','丰':'FENG',
  '巢':'CHAO','关':'GUAN','蒯':'KUAI','相':'XIANG','查':'ZHA','后':'HOU','荆':'JING','红':'HONG',
  '游':'YOU','竺':'ZHU','权':'QUAN','逯':'LU','盖':'GE','益':'YI','桓':'HUAN','公':'GONG',
  '晋':'JIN','楚':'CHU','闫':'YAN','法':'FA','汝':'RU','鄢':'YAN','涂':'TU','钦':'QIN',
  '归':'GUI','海':'HAI','岳':'YUE','帅':'SHUAI','缑':'GOU','亢':'KANG','况':'KUANG','郈':'HOU',
  '有':'YOU','琴':'QIN','商':'SHANG','牟':'MOU','佘':'SHE','佴':'NAI','伯':'BO','赏':'SHANG',
  // 常用名字用字
  '伟':'WEI','刚':'GANG','勇':'YONG','毅':'YI','俊':'JUN','峰':'FENG','强':'QIANG','军':'JUN',
  '平':'PING','保':'BAO','东':'DONG','文':'WEN','辉':'HUI','力':'LI','明':'MING','永':'YONG',
  '健':'JIAN','世':'SHI','广':'GUANG','志':'ZHI','义':'YI','兴':'XING','良':'LIANG','海':'HAI',
  '山':'SHAN','仁':'REN','波':'BO','宁':'NING','贵':'GUI','福':'FU','生':'SHENG','龙':'LONG',
  '元':'YUAN','全':'QUAN','国':'GUO','胜':'SHENG','学':'XUE','祥':'XIANG','才':'CAI','发':'FA',
  '武':'WU','新':'XIN','利':'LI','清':'QING','飞':'FEI','彬':'BIN','富':'FU','顺':'SHUN',
  '信':'XIN','子':'ZI','杰':'JIE','涛':'TAO','昌':'CHANG','成':'CHENG','康':'KANG','星':'XING',
  '光':'GUANG','泰':'TAI','达':'DA','安':'AN','岩':'YAN','中':'ZHONG','茂':'MAO','进':'JIN',
  '林':'LIN','有':'YOU','坚':'JIAN','和':'HE','彪':'BIAO','博':'BO','诚':'CHENG','先':'XIAN',
  '敬':'JING','震':'ZHEN','振':'ZHEN','壮':'ZHUANG','会':'HUI','思':'SI','群':'QUN','豪':'HAO',
  '心':'XIN','邦':'BANG','承':'CHENG','乐':'YUE','绍':'SHAO','功':'GONG','松':'SONG','善':'SHAN',
  '厚':'HOU','庆':'QING','磊':'LEI','民':'MIN','友':'YOU','裕':'YU','河':'HE','哲':'ZHE',
  '江':'JIANG','超':'CHAO','浩':'HAO','亮':'LIANG','政':'ZHENG','谦':'QIAN','亨':'HENG','奇':'QI',
  '固':'GU','之':'ZHI','轮':'LUN','翰':'HAN','朗':'LANG','伯':'BO','宏':'HONG','言':'YAN',
  '若':'RUO','鸣':'MING','朋':'PENG','斌':'BIN','梁':'LIANG','栋':'DONG','维':'WEI','启':'QI',
  '克':'KE','伦':'LUN','翔':'XIANG','旭':'XU','鹏':'PENG','泽':'ZE','晨':'CHEN','辰':'CHEN',
  '士':'SHI','建':'JIAN','家':'JIA','致':'ZHI','树':'SHU','炎':'YAN','德':'DE','行':'XING',
  '时':'SHI','泰':'TAI','盛':'SHENG','雄':'XIONG','琛':'CHEN','钧':'JUN','冠':'GUAN','策':'CE',
  '腾':'TENG','楠':'NAN','榕':'RONG','风':'FENG','航':'HANG','弘':'HONG','秀':'XIU','娟':'JUAN',
  '英':'YING','华':'HUA','慧':'HUI','巧':'QIAO','美':'MEI','娜':'NA','静':'JING','淑':'SHU',
  '惠':'HUI','珠':'ZHU','翠':'CUI','雅':'YA','芝':'ZHI','玉':'YU','萍':'PING','红':'HONG',
  '娥':'E','玲':'LING','芬':'FEN','芳':'FANG','燕':'YAN','彩':'CAI','春':'CHUN','菊':'JU',
  '兰':'LAN','凤':'FENG','洁':'JIE','梅':'MEI','琳':'LIN','素':'SU','云':'YUN','莲':'LIAN',
  '真':'ZHEN','环':'HUAN','雪':'XUE','荣':'RONG','爱':'AI','妹':'MEI','霞':'XIA','香':'XIANG',
  '月':'YUE','莺':'YING','媛':'YUAN','艳':'YAN','瑞':'RUI','凡':'FAN','佳':'JIA','嘉':'JIA',
  '琼':'QIONG','桂':'GUI','娣':'DI','叶':'YE','璧':'BI','璐':'LU','娅':'YA','男':'NAN',
  '哲':'ZHE','瑞':'RUI','尧':'YAO','昊':'HAO','然':'RAN','皓':'HAO','睿':'RUI','煜':'YU',
  '恒':'HENG','熙':'XI','烨':'YE','焱':'YAN','霖':'LIN','鑫':'XIN','锐':'RUI','翔':'XIANG',
  '洋':'YANG','远':'YUAN','鹏':'PENG','源':'YUAN','渊':'YUAN','涵':'HAN','瀚':'HAN','尘':'CHEN',
  '昂':'ANG','升':'SHENG','少':'SHAO','帅':'SHUAI','韵':'YUN','航':'HANG','逸':'YI','天':'TIAN','翔':'XIANG',
  '骏':'JUN','驰':'CHI','骁':'XIAO','澈':'CHE','晓':'XIAO','凯':'KAI','铭':'MING','越':'YUE',
  '通':'TONG','驰':'CHI','誉':'YU','诚':'CHENG','霖':'LIN','霆':'TING','铖':'CHENG','钧':'JUN',
  '忆':'YI','舟':'ZHOU','帆':'FAN','临':'LIN','乾':'QIAN','坤':'KUN','霖':'LIN','霆':'TING',
  '潇':'XIAO','睿':'RUI','博':'BO','浩':'HAO','宇':'YU','轩':'XUAN','泽':'ZE','然':'RAN',
  '诺':'NUO','奕':'YI','洲':'ZHOU','承':'CHENG','骁':'XIAO','朗':'LANG','逸':'YI','帅':'SHUAI',
  '昂':'ANG','旗':'QI','硕':'SHUO','乐':'LE','潼':'TONG','煦':'XU','朗':'LANG','骐':'QI',
  '骥':'JI','鸿':'HONG','沐':'MU','阳':'YANG','沁':'QIN','恒':'HENG','屹':'YI','懿':'YI',
  '纯':'CHUN','翊':'YI','笑':'XIAO','凯':'KAI','祺':'QI','安':'AN','礼':'LI','嘉':'JIA',
  '祎':'YI','恒':'HENG','奕':'YI','铭':'MING','誉':'YU','川':'CHUAN','阳':'YANG','禾':'HE',
  '苗':'MIAO','峰':'FENG','岩':'YAN','泓':'HONG','洲':'ZHOU','鸣':'MING','弘':'HONG','熠':'YI',
  '松':'SONG','熙':'XI','晨':'CHEN','城':'CHENG','翼':'YI','齐':'QI','清':'QING','越':'YUE',
  '烨':'YE','涵':'HAN','临':'LIN','远':'YUAN','恒':'HENG','韬':'TAO','哲':'ZHE','铭':'MING',
  '钦':'QIN','煊':'XUAN','炫':'XUAN','淼':'MIAO','峥':'ZHENG','坚':'JIAN','森':'SEN','磊':'LEI',
  '鑫':'XIN','琨':'KUN','伦':'LUN','琛':'CHEN','翔':'XIANG','焱':'YAN','鑫':'XIN','炜':'WEI',
  '柯':'KE','炫':'XUAN','光':'GUANG','德':'DE','奎':'KUI','旭':'XU','煦':'XU','伦':'LUN',
  '修':'XIU','熠':'YI','焕':'HUAN','珏':'JUE','锋':'FENG','尧':'YAO','恒':'HENG','毅':'YI',
  '刚':'GANG','森':'SEN','锋':'FENG','毅':'YI','明':'MING','亮':'LIANG','辉':'HUI','程':'CHENG',
  '威':'WEI','铭':'MING','振':'ZHEN','栋':'DONG','桐':'TONG','柏':'BO','钰':'YU','铭':'MING',
  '锦':'JIN','翊':'YI','庚':'GENG','增':'ZENG','伦':'LUN','海':'HAI','涵':'HAN','权':'QUAN',
  '棋':'QI','熠':'YI','灿':'CAN','煦':'XU','然':'RAN','诚':'CHENG','善':'SHAN','义':'YI',
  '淳':'CHUN','慈':'CI','正':'ZHENG','贤':'XIAN','震':'ZHEN','雨':'YU','农':'NONG','翔':'XIANG',
  '志':'ZHI','强':'QIANG','立':'LI','浩':'HAO','乾':'QIAN','坤':'KUN','文':'WEN','武':'WU',
  '斌':'BIN','毅':'YI','男':'NAN','恒':'HENG','宁':'NING','安':'AN','康':'KANG','瑞':'RUI',
  '景':'JING','运':'YUN','杰':'JIE','良':'LIANG','英':'YING','达':'DA','奇':'QI','荣':'RONG',
  '恩':'EN','善':'SHAN','跃':'YUE','贵':'GUI','德':'DE','如':'RU','恩':'EN','奇':'QI',
  '瀚':'HAN','灏':'HAO','廷':'TING','晟':'SHENG','庭':'TING','驰':'CHI','晖':'HUI','瑜':'YU',
  '杲':'GAO','楠':'NAN','铭':'MING','默':'MO','之':'ZHI','一':'YI','子':'ZI','小':'XIAO',
  '大':'DA','双':'SHUANG','家':'JIA','二':'ER','三':'SAN','四':'SI','五':'WU','六':'LIU',
  '七':'QI','八':'BA','九':'JIU','十':'SHI','冰':'BING','如':'RU','若':'RUO','语':'YU',
  '可':'KE','斯':'SI','堂':'TANG','以':'YI','亦':'YI','其':'QI','正':'ZHENG','初':'CHU',
  '元':'YUAN','兆':'ZHAO','启':'QI','鸿':'HONG','承':'CHENG','光':'GUANG','景':'JING','永':'YONG',
  '显':'XIAN','宝':'BAO','树':'SHU','继':'JI','立':'LI','孝':'XIAO','光':'GUANG','贤':'XIAN',
  '龙':'LONG','先':'XIAN','宝':'BAO','同':'TONG','兴':'XING','维':'WEI','乐':'YUE','传':'CHUAN',
  '兆':'ZHAO','庆':'QING','安':'AN','书':'SHU','利':'LI','理':'LI','善':'SHAN','本':'BEN',
  '尚':'SHANG','尔':'ER','克':'KE','家':'JIA','以':'YI','中':'ZHONG','祥':'XIANG','华':'HUA',
  '佑':'YOU','天':'TIAN','子':'ZI','盛':'SHENG','承':'CHENG','和':'HE','言':'YAN','博':'BO',
  '诗':'SHI','梦':'MENG','涵':'HAN','依':'YI','一':'YI','雨':'YU','欣':'XIN','悦':'YUE',
  '彤':'TONG','萱':'XUAN','妍':'YAN','怡':'YI','紫':'ZI','怡':'YI','佳':'JIA','彤':'TONG',
  '妍':'YAN','可':'KE','琪':'QI','语':'YU','昕':'XIN','芷':'ZHI','妍':'YAN','琳':'LIN',
  '怡':'YI','蕊':'RUI','思':'SI','雅':'YA','睿':'RUI','昕':'XIN','然':'RAN','淼':'MIAO'
}

/**
 * 获取单个汉字的拼音大写
 */
function getPinyin(char) {
  return PINYIN_MAP[char] || ''
}

/**
 * 生成球衣名
 * 格式: 姓拼音大写 + 空格 + 名字每个字的拼音首字母+点
 * 例如: 金洋洋 → JIN Y.Y.
 *       李小鹏 → LI X.P.
 *       张远   → ZHANG Y.
 */
function generateJerseyName(name) {
  if (!name || name.length < 2) return ''

  // 姓氏拼音
  const surnamePinyin = getPinyin(name[0])
  if (!surnamePinyin) return ''

  // 名字部分（除姓以外的字）
  // 特殊规则：ZH/CH/SH开头的拼音取前两个字母（如 SHENG→SH, CHEN→CH）
  const givenName = name.slice(1)
  let initials = ''
  for (let i = 0; i < givenName.length; i++) {
    const py = getPinyin(givenName[i])
    if (py) {
      if (py.startsWith('ZH') || py.startsWith('CH') || py.startsWith('SH')) {
        initials += py.substring(0, 2) + '.'
      } else {
        initials += py[0] + '.'
      }
    }
  }

  return surnamePinyin + ' ' + initials
}

/**
 * 从身份证号提取出生日期和年龄
 */
function parseIdCard(idCard) {
  if (!idCard || idCard.length !== 18) return null

  const year = parseInt(idCard.substring(6, 10))
  const month = parseInt(idCard.substring(10, 12))
  const day = parseInt(idCard.substring(12, 14))

  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null
  }

  const birthDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  // 计算年龄
  const today = new Date()
  const birth = new Date(year, month - 1, day)
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--
  }

  return {
    birthDate: birthDate,
    age: age
  }
}

module.exports = {
  getPinyin,
  generateJerseyName,
  parseIdCard
}