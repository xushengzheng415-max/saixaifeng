/* tiny-pinyin 浏览器直连版（vendored，自 web-admin-vue 依赖 tiny-pinyin 生成，MIT）
 * 由 tools 生成器从 dist/dict.js 精确导出，勿手改字典数据。
 * 依赖 Intl.Collator zh-CN 排序；Safari/WebKit 自动打补丁。
 * 暴露 window.tinyPinyin = { isSupported, convertToPinyin }
 */
(function () {
  'use strict'
  var DICT = {"PINYINS":["A","AI","AN","ANG","AO","BA","BAI","BAN","BANG","BAO","BEI","BEN","BENG","BI","BIAN","BIAO","BIE","BIN","BING","BO","BU","CA","CAI","CAN","CANG","CAO","CE","CEN","CENG","CHA","CHAI","CHAN","CHANG","CHAO","CHE","CHEN","CHENG","CHI","CHONG","CHOU","CHU","CHUA","CHUAI","CHUAN","CHUANG","CHUI","CHUN","CHUO","CI","CONG","COU","CU","CUAN","CUI","CUN","CUO","DA","DAI","DAN","DANG","DAO","DE","DEN","DENG","DI","DIAN","DIAO","DIE","DING","DIU","DONG","DOU","DU","DUAN","DUI","DUN","DUO","E","EI","EN","ENG","ER","FA","FAN","FANG","FEI","FEN","FENG","FIAO","FO","FOU","FU","GA","GAI","GAN","GANG","GAO","GE","GEI","GEN","GENG","GONG","GOU","GU","GUA","GUAI","GUAN","GUANG","GUI","GUN","GUO","HA","HAI","HAN","HANG","HAO","HE","HEI","HEN","HENG","HM","HONG","HOU","HU","HUA","HUAI","HUAN","HUANG","HUI","HUN","HUO","JI","JIA","JIAN","JIANG","JIAO","JIE","JIN","JING","JIONG","JIU","JU","JUAN","JUE","JUN","KA","KAI","KAN","KANG","KAO","KE","KEN","KENG","KONG","KOU","KU","KUA","KUAI","KUAN","KUANG","KUI","KUN","KUO","LA","LAI","LAN","LANG","LAO","LE","LEI","LENG","LI","LIA","LIAN","LIANG","LIAO","LIE","LIN","LING","LIU","LO","LONG","LOU","LU","LV","LUAN","LVE","LUN","LUO","M","MA","MAI","MAN","MANG","MAO","ME","MEI","MEN","MENG","MI","MIAN","MIAO","MIE","MIN","MING","MIU","MO","MOU","MU","N","NA","NAI","NAN","NANG","NAO","NE","NEI","NEN","NENG","NI","NIAN","NIANG","NIAO","NIE","NIN","NING","NIU","NONG","NOU","NU","NV","NUAN","NVE","NUN","NUO","O","OU","PA","PAI","PAN","PANG","PAO","PEI","PEN","PENG","PI","PIAN","PIAO","PIE","PIN","PING","PO","POU","PU","QI","QIA","QIAN","QIANG","QIAO","QIE","QIN","QING","QIONG","QIU","QU","QUAN","QUE","QUN","RAN","RANG","RAO","RE","REN","RENG","RI","RONG","ROU","RU","RUA","RUAN","RUI","RUN","RUO","SA","SAI","SAN","SANG","SAO","SE","SEN","SENG","SHA","SHAI","SHAN","SHANG","SHAO","SHE","SHEN","SHENG","SHI","SHOU","SHU","SHUA","SHUAI","SHUAN","SHUANG","SHUI","SHUN","SHUO","SI","SONG","SOU","SU","SUAN","SUI","SUN","SUO","TA","TAI","TAN","TANG","TAO","TE","TENG","TI","TIAN","TIAO","TIE","TING","TONG","TOU","TU","TUAN","TUI","TUN","TUO","WA","WAI","WAN","WANG","WEI","WEN","WENG","WO","WU","XI","XIA","XIAN","XIANG","XIAO","XIE","XIN","XING","XIONG","XIU","XU","XUAN","XUE","XUN","YA","YAN","YANG","YAO","YE","YI","YIN","YING","YO","YONG","YOU","YU","YUAN","YUE","YUN","ZA","ZAI","ZAN","ZANG","ZAO","ZE","ZEI","ZEN","ZENG","ZHA","ZHAI","ZHAN","ZHANG","ZHAO","ZHE","ZHEN","ZHENG","ZHI","ZHONG","ZHOU","ZHU","ZHUA","ZHUAI","ZHUAN","ZHUANG","ZHUI","ZHUN","ZHUO","ZI","ZONG","ZOU","ZU","ZUAN","ZUI","ZUN","ZUO",""],"UNIHANS":["阿","哎","安","肮","凹","八","挀","扳","邦","勹","陂","奔","伻","屄","边","灬","憋","汃","冫","癶","峬","嚓","偲","参","仓","撡","冊","嵾","曽","叉","芆","辿","伥","抄","车","抻","阷","吃","充","抽","出","欻","揣","巛","刅","吹","旾","逴","呲","匆","凑","粗","汆","崔","邨","搓","咑","呆","丹","当","刀","嘚","扥","灯","氐","甸","刁","爹","丁","丟","东","吺","厾","耑","垖","吨","多","妸","诶","奀","鞥","儿","发","帆","匚","飞","分","丰","覅","仏","紑","夫","旮","侅","甘","冈","皋","戈","给","根","刯","工","勾","估","瓜","乖","关","光","归","丨","呙","哈","咍","佄","夯","茠","诃","黒","拫","亨","噷","叿","齁","乎","花","怀","欢","巟","灰","昏","吙","丌","加","戋","江","艽","阶","巾","坕","冂","丩","凥","姢","噘","军","咔","开","刊","忼","尻","匼","肎","劥","空","抠","扝","夸","蒯","宽","匡","亏","坤","扩","垃","来","兰","啷","捞","肋","勒","崚","哩","俩","奁","良","撩","毟","拎","伶","溜","囖","龙","瞜","噜","驴","娈","掠","抡","罗","呣","妈","埋","嫚","牤","猫","么","呅","门","甿","咪","宀","喵","乜","民","名","谬","摸","哞","毪","嗯","拏","腉","囡","囔","孬","疒","娞","恁","能","妮","拈","娘","鸟","捏","囜","宁","妞","农","羺","奴","女","奻","疟","黁","挪","喔","讴","妑","拍","眅","乓","抛","呸","喷","匉","丕","囨","剽","氕","姘","乒","钋","剖","仆","七","掐","千","呛","悄","癿","亲","靑","卭","丘","区","峑","缺","夋","呥","穣","娆","惹","人","扔","日","茸","厹","邚","挼","堧","婑","瞤","捼","仨","毢","三","桒","掻","閪","森","僧","杀","筛","山","伤","弰","奢","申","升","尸","収","书","刷","衰","闩","双","脽","吮","说","厶","忪","捜","苏","狻","夊","孙","唆","他","囼","坍","汤","夲","忑","熥","剔","天","旫","帖","厅","囲","偷","凸","湍","推","吞","乇","穵","歪","弯","尣","危","昷","翁","挝","乌","夕","虲","仙","乡","灱","些","心","星","凶","休","吁","吅","削","坃","丫","恹","央","幺","倻","一","囙","应","哟","佣","优","扜","囦","曰","晕","帀","災","兂","匨","傮","则","贼","怎","増","扎","捚","沾","张","佋","蜇","贞","争","之","中","州","朱","抓","拽","专","妆","隹","宒","卓","乲","宗","邹","租","钻","厜","尊","昨","兙"],"EXCEPTIONS":{"曾":"ZENG","沈":"SHEN","嗲":"DIA","碡":"ZHOU","聒":"GUO","炔":"QUE","蚵":"KE","砉":"HUA","嬤":"MO","嬷":"MO","蹒":"PAN","蹊":"XI","丬":"PAN","霰":"XIAN","莘":"XIN","豉":"CHI","饧":"XING","筠":"JUN","长":"CHANG","帧":"ZHEN","峙":"SHI","郍":"NA","芎":"XIONG","谁":"SHUI"}}
  var safariPatcher = function patcher(DICT) {
  // Update EXCEPTIONS dict.
  DICT.EXCEPTIONS = {
    '\u55F2': 'DIA', // DIE 嗲
    '\u78A1': 'ZHOU', // DU 碡
    '\u8052': 'GUO', // GUA 聒
    '\u7094': 'QUE', // GUI 炔
    '\u86B5': 'KE', // HE 蚵
    '\u7809': 'HUA', // HUO 砉
    '\u5B37': 'MO', // MA 嬷 新增
    '\u8E4A': 'XI', // QI 蹊
    '\u4E2C': 'PAN', // QIANG 丬
    '\u9730': 'XIAN', // SAN 霰
    '\u8C49': 'CHI', // SHI 豉
    '\u9967': 'XING', // TANG 饧
    '\u5E27': 'ZHEN', // ZHENG 帧
    '\u828E': 'XIONG', // 芎
    '\u8C01': 'SHUI', // 谁
    '\u94B6': 'KE' // 钶
  };

  // Update UNIHANS dict.
  DICT.UNIHANS[91] = '\u4F15'; // FU: 夫 --> 伕
  DICT.UNIHANS[347] = '\u4EDA'; // XIAN: 仙 --> 仚
  DICT.UNIHANS[393] = '\u8BCC'; // ZHOU: 州 --> 诌
  DICT.UNIHANS[39] = '\u5A64'; // CHOU: 抽 --> 婤
  DICT.UNIHANS[50] = '\u8160'; // COU: 凑 --> 腠
  DICT.UNIHANS[369] = '\u6538'; // YOU: 优 --> 攸
  DICT.UNIHANS[123] = '\u4E6F'; // HU: 乎 --> 乯
  DICT.UNIHANS[171] = '\u5215'; // LI: 哩 --> 刕
  DICT.UNIHANS[102] = '\u4F5D'; // GOU: 勾 --> 佝
  DICT.UNIHANS[126] = '\u72BF'; // HUAN: 欢 --> 犿
  DICT.UNIHANS[176] = '\u5217'; // LIE: 毟 --> 列
  DICT.UNIHANS[178] = '\u5222'; // LING: 伶 --> 刢
  DICT.UNIHANS[252] = '\u5A1D'; // POU: 剖 --> 娝
  DICT.UNIHANS[330] = '\u5078'; // TOU: 偷 --> 偸
};
  if (typeof navigator === 'object' && /safari/i.test(navigator.userAgent) && !/chrome|android/i.test(navigator.userAgent)) {
    safariPatcher(DICT)
  }
  var FIRST = '\u963F'
  var LAST = '\u9FFF'
  var supported = null
  var COLLATOR = null
  function isSupported() {
    if (supported !== null) return supported
    if (typeof Intl === 'object' && Intl.Collator) {
      COLLATOR = new Intl.Collator(['zh-Hans-CN', 'zh-CN'])
      supported = Intl.Collator.supportedLocalesOf(['zh-CN']).length === 1
    } else {
      supported = false
    }
    return supported
  }
  function genToken(ch) {
    var UNIHANS = DICT.UNIHANS
    var PINYINS = DICT.PINYINS
    var EXCEPTIONS = DICT.EXCEPTIONS
    if (ch in EXCEPTIONS) return EXCEPTIONS[ch]
    if (ch.charCodeAt(0) < 256) return ch
    var cmp = COLLATOR.compare(ch, FIRST)
    if (cmp < 0) return ch
    var offset = -1
    if (cmp === 0) {
      offset = 0
    } else {
      cmp = COLLATOR.compare(ch, LAST)
      if (cmp > 0) return ch
      if (cmp === 0) offset = UNIHANS.length - 1
    }
    if (offset < 0) {
      var begin = 0
      var end = UNIHANS.length - 1
      while (begin <= end) {
        offset = ~~((begin + end) / 2)
        cmp = COLLATOR.compare(ch, UNIHANS[offset])
        if (cmp === 0) break
        if (cmp > 0) begin = offset + 1
        else end = offset - 1
      }
    }
    if (cmp < 0) offset--
    return PINYINS[offset] || ch
  }
  window.tinyPinyin = {
    isSupported: isSupported,
    convertToPinyin: function (str, separator) {
      if (!isSupported()) return str
      var out = []
      var chars = String(str).split('')
      for (var i = 0; i < chars.length; i++) out.push(genToken(chars[i]))
      return out.join(separator || '')
    }
  }
})()
