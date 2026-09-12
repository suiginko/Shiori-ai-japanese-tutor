// =========================================================
// KANJI JUKUGO & ON'YOMI ENGINE (常用汉字音读与熟语合成引擎)
// =========================================================
// 核心职责：
// 1. 提供高频连续汉字熟语（Jukugo）的读音与声调映射表
// 2. 建立常用汉字标准音读（On'yomi）矩阵，彻底杜绝把连续汉字熟语拆分为单字并套用训读（如“心配”被拆成“心[こころ]”）
// 3. 支持熟语发音音变规则（促音变、半浊音变、连浊等，如 心+配->しんぱい、学+校->がっこう）

export interface JukugoEntry {
  reading: string;
  pitch: number;
  meaning?: string;
  pos?: string;
  level?: string;
}

/**
 * 极高频日常生活与情景交流汉字熟语映射表（优先保障 100% 准确性）
 */
export const CORE_JUKUGO_DICT: Record<string, JukugoEntry> = {
  // --- 心理、情感与状态 ---
  心配: { reading: 'しんぱい', pitch: 0, meaning: '担心，挂念，操心', pos: '名·自动·サ变', level: 'N4' },
  安心: { reading: 'あんしん', pitch: 0, meaning: '放心，安心', pos: '名·自动·サ变', level: 'N4' },
  安全: { reading: 'あんぜん', pitch: 0, meaning: '安全', pos: '形动·名', level: 'N4' },
  危険: { reading: 'きけん', pitch: 0, meaning: '危险', pos: '形动·名', level: 'N5' },
  大切: { reading: 'たいせつ', pitch: 0, meaning: '重要，宝贵', pos: '形动·名', level: 'N5' },
  大変: { reading: 'たいへん', pitch: 0, meaning: '非常；辛苦，够呛', pos: '形动·副', level: 'N5' },
  大丈夫: { reading: 'だいじょうぶ', pitch: 3, meaning: '没问题，不要紧', pos: '形动·副', level: 'N5' },
  無理: { reading: 'むり', pitch: 1, meaning: '勉强，行不通', pos: '形动·名', level: 'N4' },
  残念: { reading: 'ざんねん', pitch: 3, meaning: '遗憾，可惜', pos: '形动·名', level: 'N4' },
  親切: { reading: 'しんせつ', pitch: 1, meaning: '亲切，热情', pos: '形动·名', level: 'N5' },
  便利: { reading: 'べんり', pitch: 1, meaning: '便利，方便', pos: '形动·名', level: 'N5' },
  不便: { reading: 'ふべん', pitch: 1, meaning: '不便，不方便', pos: '形动·名', level: 'N5' },
  簡単: { reading: 'かんたん', pitch: 0, meaning: '简单，简短', pos: '形动·名', level: 'N5' },
  複雑: { reading: 'ふくざつ', pitch: 0, meaning: '复杂', pos: '形动·名', level: 'N4' },
  特別: { reading: 'とくべつ', pitch: 0, meaning: '特别，格外', pos: '形动·副', level: 'N4' },
  普通: { reading: 'ふつう', pitch: 0, meaning: '普通，通常', pos: '形动·名·副', level: 'N4' },
  自由: { reading: 'じゆう', pitch: 2, meaning: '自由，随意', pos: '形动·名', level: 'N4' },
  有名: { reading: 'ゆうめい', pitch: 0, meaning: '有名，著名', pos: '形动·名', level: 'N5' },
  必要: { reading: 'ひつよう', pitch: 0, meaning: '必要，必须', pos: '形动·名', level: 'N5' },
  真面目: { reading: 'まじめ', pitch: 0, meaning: '认真，正派', pos: '形动·名', level: 'N4' },

  // --- 人际交往、学习与商务沟通 ---
  相談: { reading: 'そうだん', pitch: 0, meaning: '商量，咨询', pos: '名·他动·サ变', level: 'N4' },
  約束: { reading: 'やくそく', pitch: 0, meaning: '约定，承诺', pos: '名·他动·サ变', level: 'N5' },
  準備: { reading: 'じゅんび', pitch: 1, meaning: '准备，预备', pos: '名·他动·サ变', level: 'N5' },
  連絡: { reading: 'れんらく', pitch: 0, meaning: '联络，联系', pos: '名·自动·サ变', level: 'N4' },
  案内: { reading: 'あんない', pitch: 0, meaning: '向导，带路，通知', pos: '名·他动·サ变', level: 'N4' },
  紹介: { reading: 'しょうかい', pitch: 0, meaning: '介绍', pos: '名·他动·サ变', level: 'N4' },
  説明: { reading: 'せつめい', pitch: 0, meaning: '说明，解释', pos: '名·他动·サ变', level: 'N4' },
  質問: { reading: 'しつもん', pitch: 0, meaning: '提问，问题', pos: '名·自动·サ变', level: 'N5' },
  問題: { reading: 'もんだい', pitch: 0, meaning: '问题，难题', pos: '名', level: 'N5' },
  返事: { reading: 'へんじ', pitch: 3, meaning: '回答，答复', pos: '名·自动·サ变', level: 'N5' },
  宿題: { reading: 'しゅくだい', pitch: 0, meaning: '家庭作业', pos: '名', level: 'N5' },
  試験: { reading: 'しけん', pitch: 2, meaning: '考试，测验', pos: '名·自动·サ变', level: 'N5' },
  授業: { reading: 'じゅぎょう', pitch: 1, meaning: '授课，上课', pos: '名·自动·サ变', level: 'N5' },
  練習: { reading: 'れんしゅう', pitch: 0, meaning: '练习', pos: '名·他动·サ变', level: 'N5' },
  復習: { reading: 'ふくしゅう', pitch: 0, meaning: '复习', pos: '名·他动·サ变', level: 'N5' },
  予習: { reading: 'よしゅう', pitch: 0, meaning: '预习', pos: '名·他动·サ变', level: 'N5' },
  意味: { reading: 'いみ', pitch: 1, meaning: '意思，含义', pos: '名·他动·サ变', level: 'N5' },
  発音: { reading: 'はつおん', pitch: 0, meaning: '发音', pos: '名·自动·サ变', level: 'N5' },
  文法: { reading: 'ぶんぽう', pitch: 0, meaning: '语法', pos: '名', level: 'N5' },
  単語: { reading: 'たんご', pitch: 0, meaning: '单词，词汇', pos: '名', level: 'N5' },
  会話: { reading: 'かいわ', pitch: 0, meaning: '会话，对话', pos: '名·自动·サ变', level: 'N5' },
  表現: { reading: 'ひょうげん', pitch: 3, meaning: '表达，表现', pos: '名·他动·サ变', level: 'N4' },
  敬語: { reading: 'けいご', pitch: 0, meaning: '敬语', pos: '名', level: 'N4' },
  挨拶: { reading: 'あいさつ', pitch: 1, meaning: '问候，寒暄', pos: '名·自动·サ变', level: 'N5' },
  注意: { reading: 'ちゅうい', pitch: 1, meaning: '注意，当心', pos: '名·自他·サ变', level: 'N5' },
  遠慮: { reading: 'えんりょ', pitch: 0, meaning: '客气，客套', pos: '名·他动·サ变', level: 'N4' },
  経験: { reading: 'けいけん', pitch: 0, meaning: '经验，经历', pos: '名·他动·サ变', level: 'N4' },

  // --- 餐饮、生活与日常消费 ---
  注文: { reading: 'ちゅうもん', pitch: 0, meaning: '点单，点餐，订购', pos: '名·他动·サ变', level: 'N4' },
  会計: { reading: 'かいけい', pitch: 0, meaning: '结账，买单', pos: '名·自动·サ变', level: 'N4' },
  乾杯: { reading: 'かんぱい', pitch: 0, meaning: '干杯', pos: '名·自动·サ变', level: 'N5' },
  居酒屋: { reading: 'いざかや', pitch: 0, meaning: '居酒屋，日式小酒馆', pos: '名', level: 'N4' },
  枝豆: { reading: 'えだまめ', pitch: 0, meaning: '毛豆', pos: '名', level: 'N4' },
  生ビール: { reading: 'なまビール', pitch: 3, meaning: '生啤酒', pos: '名', level: 'N4' },
  定食: { reading: 'ていしょく', pitch: 0, meaning: '定食，套餐', pos: '名', level: 'N4' },
  料理: { reading: 'りょうり', pitch: 1, meaning: '料理，菜肴', pos: '名·他动·サ变', level: 'N5' },
  食事: { reading: 'しょくじ', pitch: 0, meaning: '就餐，用餐', pos: '名·自动·サ变', level: 'N5' },
  食堂: { reading: 'しょくどう', pitch: 0, meaning: '食堂，饭馆', pos: '名', level: 'N5' },
  弁当: { reading: 'べんとう', pitch: 3, meaning: '便当，盒饭', pos: '名', level: 'N5' },
  品物: { reading: 'しなもの', pitch: 0, meaning: '商品，物品', pos: '名', level: 'N4' },
  値段: { reading: 'ねだん', pitch: 0, meaning: '价格，价钱', pos: '名', level: 'N5' },
  買物: { reading: 'かいもの', pitch: 0, meaning: '购物，买东西', pos: '名·自动·サ变', level: 'N5' },
  買い物: { reading: 'かいもの', pitch: 0, meaning: '购物，买东西', pos: '名·自动·サ变', level: 'N5' },
  店員: { reading: 'てんいん', pitch: 0, meaning: '店员', pos: '名', level: 'N5' },
  店長: { reading: 'てんちょう', pitch: 1, meaning: '店长', pos: '名', level: 'N4' },
  客: { reading: 'きゃく', pitch: 0, meaning: '客人，顾客', pos: '名', level: 'N5' },
  案内所: { reading: 'あんないじょ', pitch: 0, meaning: '问讯处，导游处', pos: '名', level: 'N4' },
  喫茶店: { reading: 'きっさてん', pitch: 0, meaning: '咖啡馆', pos: '名', level: 'N5' },
  洋服: { reading: 'ようふく', pitch: 0, meaning: '西服，洋装', pos: '名', level: 'N5' },
  和食: { reading: 'わしょく', pitch: 0, meaning: '日料，和食', pos: '名', level: 'N4' },

  // --- 交通、出行与旅游 ---
  新幹線: { reading: 'しんかんせん', pitch: 3, meaning: '新干线高速列车', pos: '名', level: 'N4' },
  指定席: { reading: 'していせき', pitch: 2, meaning: '指定席，对号座', pos: '名', level: 'N4' },
  自由席: { reading: 'じゆうせき', pitch: 2, meaning: '自由席，非对号座', pos: '名', level: 'N4' },
  切符: { reading: 'きっぷ', pitch: 0, meaning: '票，车票，券', pos: '名', level: 'N5' },
  改札口: { reading: 'かいさつぐち', pitch: 4, meaning: '检票口', pos: '名', level: 'N4' },
  窓口: { reading: 'まどぐち', pitch: 1, meaning: '窗口，柜台', pos: '名', level: 'N4' },
  空港: { reading: 'くうこう', pitch: 0, meaning: '机场', pos: '名', level: 'N5' },
  飛行機: { reading: 'ひこうき', pitch: 2, meaning: '飞机', pos: '名', level: 'N5' },
  電車: { reading: 'でんしゃ', pitch: 0, meaning: '电车，列车', pos: '名', level: 'N5' },
  地下鉄: { reading: 'ちかてつ', pitch: 0, meaning: '地铁', pos: '名', level: 'N5' },
  駅員: { reading: 'えきいん', pitch: 2, meaning: '车站工作人员', pos: '名', level: 'N5' },
  交通: { reading: 'こうつう', pitch: 0, meaning: '交通', pos: '名', level: 'N4' },
  旅行: { reading: 'りょこう', pitch: 0, meaning: '旅行，旅游', pos: '名·自动·サ变', level: 'N5' },
  観光: { reading: 'かんこう', pitch: 0, meaning: '观光，旅游', pos: '名·自动·サ变', level: 'N4' },
  予約: { reading: 'よやく', pitch: 0, meaning: '预定，预约', pos: '名·他动·サ变', level: 'N4' },
  荷物: { reading: 'にもつ', pitch: 1, meaning: '行李，包裹', pos: '名', level: 'N5' },
  写真: { reading: 'しゃしん', pitch: 0, meaning: '照片', pos: '名', level: 'N5' },
  地図: { reading: 'ちず', pitch: 1, meaning: '地图', pos: '名', level: 'N5' },
  案内板: { reading: 'あんないばん', pitch: 0, meaning: '指示牌，案内牌', pos: '名', level: 'N4' },
  出発: { reading: 'しゅっぱつ', pitch: 0, meaning: '出发', pos: '名·自动·サ变', level: 'N4' },
  到着: { reading: 'とうちゃく', pitch: 0, meaning: '到达，抵达', pos: '名·自动·サ变', level: 'N4' },
  乗り換え: { reading: 'のりかえ', pitch: 0, meaning: '换乘，倒车', pos: '名·自动·サ变', level: 'N4' },

  // --- 社会、机构、职业与日常概念 ---
  会社: { reading: 'かいしゃ', pitch: 0, meaning: '公司', pos: '名', level: 'N5' },
  社長: { reading: 'しゃちょう', pitch: 0, meaning: '社长，公司总经理', pos: '名', level: 'N5' },
  社員: { reading: 'しゃいん', pitch: 1, meaning: '公司职员', pos: '名', level: 'N5' },
  会議: { reading: 'かいぎ', pitch: 1, meaning: '会议，开会', pos: '名·自动·サ变', level: 'N4' },
  学校: { reading: 'がっこう', pitch: 0, meaning: '学校', pos: '名', level: 'N5' },
  学生: { reading: 'がくせい', pitch: 0, meaning: '学生', pos: '名', level: 'N5' },
  留学生: { reading: 'りゅうがくせい', pitch: 4, meaning: '留学生', pos: '名', level: 'N5' },
  先生: { reading: 'せんせい', pitch: 3, meaning: '老师，导师，医生', pos: '名', level: 'N5' },
  教室: { reading: 'きょうしつ', pitch: 0, meaning: '教室', pos: '名', level: 'N5' },
  大学: { reading: 'だいがく', pitch: 0, meaning: '大学', pos: '名', level: 'N5' },
  病院: { reading: 'びょういん', pitch: 0, meaning: '医院', pos: '名', level: 'N5' },
  医者: { reading: 'いしゃ', pitch: 0, meaning: '医生，大夫', pos: '名', level: 'N5' },
  看護師: { reading: 'かんごし', pitch: 3, meaning: '护士', pos: '名', level: 'N4' },
  風邪: { reading: 'かぜ', pitch: 0, meaning: '感冒', pos: '名', level: 'N5' },
  病気: { reading: 'びょうき', pitch: 0, meaning: '疾病，生病', pos: '名', level: 'N5' },
  薬: { reading: 'くすり', pitch: 0, meaning: '药，药品', pos: '名', level: 'N5' },
  警察: { reading: 'けいさつ', pitch: 0, meaning: '警察，警察局', pos: '名', level: 'N4' },
  銀行: { reading: 'ぎんこう', pitch: 0, meaning: '银行', pos: '名', level: 'N5' },
  郵便局: { reading: 'ゆうびんきょく', pitch: 3, meaning: '邮局', pos: '名', level: 'N5' },
  図書館: { reading: 'としょかん', pitch: 2, meaning: '图书馆', pos: '名', level: 'N5' },
  美術館: { reading: 'びじゅつかん', pitch: 3, meaning: '美术馆', pos: '名', level: 'N4' },
  水族館: { reading: 'すいぞくかん', pitch: 4, meaning: '水族馆', pos: '名', level: 'N4' },
  映画館: { reading: 'えいがかん', pitch: 3, meaning: '电影院', pos: '名', level: 'N5' },
  動物園: { reading: 'どうぶつえん', pitch: 4, meaning: '动物园', pos: '名', level: 'N5' },
  公園: { reading: 'こうえん', pitch: 0, meaning: '公园', pos: '名', level: 'N5' },

  // --- 时间与周期 ---
  今日: { reading: 'きょう', pitch: 1, meaning: '今天', pos: '名·副', level: 'N5' },
  明日: { reading: 'あした', pitch: 3, meaning: '明天', pos: '名·副', level: 'N5' },
  昨日: { reading: 'きのう', pitch: 2, meaning: '昨天', pos: '名·副', level: 'N5' },
  毎日: { reading: 'まいにち', pitch: 1, meaning: '每天', pos: '名·副', level: 'N5' },
  毎週: { reading: 'まいしゅう', pitch: 0, meaning: '每周', pos: '名·副', level: 'N5' },
  毎月: { reading: 'まいつき', pitch: 0, meaning: '每月', pos: '名·副', level: 'N5' },
  毎年: { reading: 'まいとし', pitch: 0, meaning: '每年', pos: '名·副', level: 'N5' },
  今週: { reading: 'こんしゅう', pitch: 0, meaning: '这周，本周', pos: '名·副', level: 'N5' },
  来週: { reading: 'らいしゅう', pitch: 0, meaning: '下周', pos: '名·副', level: 'N5' },
  先週: { reading: 'せんしゅう', pitch: 0, meaning: '上周', pos: '名·副', level: 'N5' },
  今月: { reading: 'こんげつ', pitch: 0, meaning: '这个月', pos: '名·副', level: 'N5' },
  来月: { reading: 'らいげつ', pitch: 0, meaning: '下个月', pos: '名·副', level: 'N5' },
  先月: { reading: 'せんげつ', pitch: 1, meaning: '上个月', pos: '名·副', level: 'N5' },
  今年: { reading: 'ことし', pitch: 0, meaning: '今年', pos: '名·副', level: 'N5' },
  来年: { reading: 'らいねん', pitch: 0, meaning: '明年', pos: '名·副', level: 'N5' },
  去年: { reading: 'きょねん', pitch: 1, meaning: '去年', pos: '名·副', level: 'N5' },
  今朝: { reading: 'けさ', pitch: 1, meaning: '今天早上', pos: '名·副', level: 'N5' },
  今晩: { reading: 'こんばん', pitch: 1, meaning: '今晚', pos: '名·副', level: 'N5' },
  午前: { reading: 'ごぜん', pitch: 1, meaning: '上午', pos: '名', level: 'N5' },
  午後: { reading: 'ごご', pitch: 1, meaning: '下午', pos: '名', level: 'N5' },
  時間: { reading: 'じかん', pitch: 0, meaning: '时间，小时', pos: '名', level: 'N5' },
  週間: { reading: 'しゅうかん', pitch: 0, meaning: '周，星期', pos: '名', level: 'N5' },
  月曜日: { reading: 'げつようび', pitch: 3, meaning: '星期一', pos: '名', level: 'N5' },
  火曜日: { reading: 'かようび', pitch: 2, meaning: '星期二', pos: '名', level: 'N5' },
  水曜日: { reading: 'すいようび', pitch: 3, meaning: '星期三', pos: '名', level: 'N5' },
  木曜日: { reading: 'もくようび', pitch: 3, meaning: '星期四', pos: '名', level: 'N5' },
  金曜日: { reading: 'きんようび', pitch: 3, meaning: '星期五', pos: '名', level: 'N5' },
  土曜日: { reading: 'どようび', pitch: 2, meaning: '星期六', pos: '名', level: 'N5' },
  日曜日: { reading: 'にちようび', pitch: 3, meaning: '星期天', pos: '名', level: 'N5' },
  週末: { reading: 'しゅうまつ', pitch: 0, meaning: '周末', pos: '名', level: 'N4' },
  最近: { reading: 'さいきん', pitch: 0, meaning: '最近，近来', pos: '名·副', level: 'N5' },
  最初: { reading: 'さいしょ', pitch: 0, meaning: '最初，起初', pos: '名·副', level: 'N5' },
  最後: { reading: 'さいご', pitch: 1, meaning: '最后，最终', pos: '名·副', level: 'N5' },
  将来: { reading: 'しょうらい', pitch: 1, meaning: '将来，未来', pos: '名·副', level: 'N4' },
  予定: { reading: 'よてい', pitch: 0, meaning: '预定，日程安排', pos: '名·他动·サ变', level: 'N5' },
  計画: { reading: 'けいかく', pitch: 0, meaning: '计划，规划', pos: '名·他动·サ变', level: 'N4' },

  // --- 自然、地理与事物 ---
  天気: { reading: 'てんき', pitch: 1, meaning: '天气', pos: '名', level: 'N5' },
  気温: { reading: 'きおん', pitch: 0, meaning: '气温', pos: '名', level: 'N4' },
  季節: { reading: 'きせつ', pitch: 2, meaning: '季节', pos: '名', level: 'N4' },
  春: { reading: 'はる', pitch: 1, meaning: '春天', pos: '名', level: 'N5' },
  夏: { reading: 'なつ', pitch: 2, meaning: '夏天', pos: '名', level: 'N5' },
  秋: { reading: 'あき', pitch: 1, meaning: '秋天', pos: '名', level: 'N5' },
  冬: { reading: 'ふゆ', pitch: 2, meaning: '冬天', pos: '名', level: 'N5' },
  世界: { reading: 'せかい', pitch: 1, meaning: '世界', pos: '名', level: 'N5' },
  日本: { reading: 'にほん', pitch: 2, meaning: '日本', pos: '名', level: 'N5' },
  日本語: { reading: 'にほんご', pitch: 0, meaning: '日语，日本语', pos: '名', level: 'N5' },
  東京: { reading: 'とうきょう', pitch: 0, meaning: '东京', pos: '名', level: 'N5' },
  京都: { reading: 'きょうと', pitch: 1, meaning: '京都', pos: '名', level: 'N5' },
  大阪: { reading: 'おおさか', pitch: 0, meaning: '大阪', pos: '名', level: 'N5' },
  新宿: { reading: 'しんじゅく', pitch: 0, meaning: '新宿', pos: '名', level: 'N5' },
  渋谷: { reading: 'しぶや', pitch: 0, meaning: '涩谷', pos: '名', level: 'N5' },
  秋葉原: { reading: 'あきはばら', pitch: 3, meaning: '秋叶原', pos: '名', level: 'N5' },
  電話: { reading: 'でんわ', pitch: 0, meaning: '电话', pos: '名·自动·サ变', level: 'N5' },
  番号: { reading: 'ばんごう', pitch: 3, meaning: '号码，番 enhance', pos: '名', level: 'N5' },
  住所: { reading: 'じゅうしょ', pitch: 1, meaning: '住址，地址', pos: '名', level: 'N5' },
  名前: { reading: 'なまえ', pitch: 0, meaning: '姓名，名字', pos: '名', level: 'N5' },
  手紙: { reading: 'てがみ', pitch: 0, meaning: '信，书信', pos: '名', level: 'N5' },
  切手: { reading: 'きって', pitch: 0, meaning: '邮票', pos: '名', level: 'N5' },
  辞書: { reading: 'じしょ', pitch: 1, meaning: '词典，字典', pos: '名', level: 'N5' },
  教科書: { reading: 'きょうかしょ', pitch: 3, meaning: '教科书，课本', pos: '名', level: 'N5' },
  趣味: { reading: 'しゅみ', pitch: 1, meaning: '爱好，趣味', pos: '名', level: 'N5' },
  興味: { reading: 'きょうみ', pitch: 1, meaning: '兴趣', pos: '名', level: 'N4' },
  習慣: { reading: 'しゅうかん', pitch: 0, meaning: '习惯，习俗', pos: '名', level: 'N4' },
};

/**
 * 常用汉字核心音读（On'yomi）映射表（用于对未收录熟语进行音读安全推导，杜绝将其拆分为单字训读）
 */
export const KANJI_ONYOMI_TABLE: Record<string, string[]> = {
  心: ['しん'],
  配: ['はい', 'ぱい'],
  安: ['あん'],
  全: ['ぜん'],
  危: ['き'],
  険: ['けん'],
  相: ['そう', 'しょう'],
  談: ['だん'],
  約: ['やく'],
  束: ['そく'],
  準: ['じゅん'],
  備: ['び'],
  質: ['しつ'],
  問: ['もん'],
  題: ['だい'],
  宿: ['しゅく'],
  試: ['し'],
  験: ['けん'],
  経: ['けい'],
  説: ['せつ'],
  明: ['めい', 'みょう'],
  紹: ['しょう'],
  介: ['かい'],
  連: ['れん'],
  絡: ['らく'],
  案: ['あん'],
  内: ['ない'],
  注: ['ちゅう'],
  意: ['い'],
  味: ['み'],
  文: ['ぶん', 'もん'],
  法: ['ほう', 'ぽう'],
  発: ['はつ', 'ぱつ'],
  音: ['おん', 'いん'],
  単: ['たん'],
  語: ['ご'],
  会: ['かい', 'え'],
  話: ['わ'],
  表: ['ひょう'],
  現: ['げん'],
  敬: ['けい'],
  利: ['り'],
  用: ['よう'],
  交: ['こう'],
  通: ['つう'],
  新: ['しん'],
  干: ['かん'],
  線: ['せん'],
  指: ['し'],
  定: ['てい', 'じょう'],
  席: ['せき'],
  自: ['じ', 'し'],
  由: ['ゆう', 'ゆ'],
  切: ['せつ', 'さい'],
  符: ['ふ'],
  札: ['さつ'],
  口: ['こう', 'く'],
  窓: ['そう'],
  空: ['くう'],
  港: ['こう'],
  飛: ['ひ'],
  行: ['こう', 'ぎょう'],
  機: ['き'],
  電: ['でん'],
  車: ['しゃ'],
  鉄: ['てつ'],
  駅: ['えき'],
  員: ['いん'],
  社: ['しゃ'],
  長: ['ちょう'],
  学: ['がく'],
  校: ['こう'],
  生: ['せい', 'しょう'],
  先: ['せん'],
  教: ['きょう'],
  室: ['しつ'],
  病: ['びょう'],
  院: ['いん'],
  医: ['い'],
  者: ['しゃ'],
  薬: ['やく'],
  局: ['きょく'],
  図: ['と', 'ず'],
  書: ['しょ'],
  館: ['かん'],
  食: ['しょく', 'じき'],
  事: ['じ'],
  堂: ['どう'],
  品: ['ひん'],
  物: ['ぶつ', 'もつ'],
  旅: ['りょ'],
  出: ['しゅつ'],
  到: ['とう'],
  着: ['ちゃく'],
  無: ['む', 'ぶ'],
  理: ['り'],
  残: ['ざん'],
  念: ['ねん'],
  難: ['なん'],
  普: ['ふ'],
  段: ['だん'],
  簡: ['かん'],
  複: ['ふく'],
  雑: ['ざつ', 'ぞう'],
  特: ['とく'],
  別: ['べつ'],
};

/**
 * 孤立单汉字（前后均非汉字）的常用读音兜底表：
 * 仅收录【独立出现时读音确定且高频】的汉字，用于给词典未覆盖的单字补注音，
 * 绝不参与连续汉字熟语的拆分（熟语由 CORE_JUKUGO_DICT / deriveJukugoReading 负责）。
 */
export const SINGLE_KANJI_READINGS: Record<string, { reading: string; pitch?: number }> = {
  // 身体与五官
  心: { reading: 'こころ', pitch: 2 },
  体: { reading: 'からだ', pitch: 0 },
  頭: { reading: 'あたま', pitch: 3 },
  髪: { reading: 'かみ', pitch: 2 },
  顔: { reading: 'かお', pitch: 0 },
  目: { reading: 'め', pitch: 0 },
  口: { reading: 'くち', pitch: 0 },
  耳: { reading: 'みみ', pitch: 2 },
  声: { reading: 'こえ', pitch: 1 },
  手: { reading: 'て', pitch: 1 },
  足: { reading: 'あし', pitch: 2 },
  指: { reading: 'ゆび', pitch: 2 },
  爪: { reading: 'つめ', pitch: 0 },
  肩: { reading: 'かた', pitch: 1 },
  首: { reading: 'くび', pitch: 0 },
  胸: { reading: 'むね', pitch: 2 },
  腹: { reading: 'はら', pitch: 2 },
  背: { reading: 'せ', pitch: 1 },
  肌: { reading: 'はだ', pitch: 1 },
  骨: { reading: 'ほね', pitch: 2 },
  血: { reading: 'ち', pitch: 0 },
  汗: { reading: 'あせ', pitch: 1 },
  涙: { reading: 'なみだ', pitch: 1 },
  鼻: { reading: 'はな', pitch: 0 },
  歯: { reading: 'は', pitch: 1 },
  // 自然与景物
  空: { reading: 'そら', pitch: 1 },
  風: { reading: 'かぜ', pitch: 0 },
  雲: { reading: 'くも', pitch: 1 },
  雨: { reading: 'あめ', pitch: 1 },
  雪: { reading: 'ゆき', pitch: 2 },
  星: { reading: 'ほし', pitch: 0 },
  月: { reading: 'つき', pitch: 2 },
  日: { reading: 'ひ', pitch: 0 },
  山: { reading: 'やま', pitch: 2 },
  川: { reading: 'かわ', pitch: 2 },
  海: { reading: 'うみ', pitch: 1 },
  森: { reading: 'もり', pitch: 0 },
  林: { reading: 'はやし', pitch: 3 },
  草: { reading: 'くさ', pitch: 2 },
  葉: { reading: 'は', pitch: 0 },
  花: { reading: 'はな', pitch: 2 },
  実: { reading: 'み', pitch: 0 },
  根: { reading: 'ね', pitch: 1 },
  田: { reading: 'た', pitch: 0 },
  火: { reading: 'ひ', pitch: 1 },
  水: { reading: 'みず', pitch: 0 },
  木: { reading: 'き', pitch: 1 },
  土: { reading: 'つち', pitch: 2 },
  金: { reading: 'かね', pitch: 0 },
  石: { reading: 'いし', pitch: 2 },
  島: { reading: 'しま', pitch: 2 },
  町: { reading: 'まち', pitch: 2 },
  村: { reading: 'むら', pitch: 2 },
  道: { reading: 'みち', pitch: 0 },
  橋: { reading: 'はし', pitch: 2 },
  門: { reading: 'もん', pitch: 0 },
  壁: { reading: 'かべ', pitch: 0 },
  窓: { reading: 'まど', pitch: 1 },
  戸: { reading: 'と', pitch: 0 },
  床: { reading: 'ゆか', pitch: 0 },
  庭: { reading: 'にわ', pitch: 0 },
  畑: { reading: 'はたけ', pitch: 0 },
  墓: { reading: 'はか', pitch: 2 },
  寺: { reading: 'てら', pitch: 2 },
  駅: { reading: 'えき', pitch: 1 },
  店: { reading: 'みせ', pitch: 2 },
  車: { reading: 'くるま', pitch: 0 },
  船: { reading: 'ふね', pitch: 1 },
  箱: { reading: 'はこ', pitch: 0 },
  袋: { reading: 'ふくろ', pitch: 3 },
  紙: { reading: 'かみ', pitch: 2 },
  糸: { reading: 'いと', pitch: 1 },
  布: { reading: 'ぬの', pitch: 0 },
  針: { reading: 'はり', pitch: 1 },
  紐: { reading: 'ひも', pitch: 0 },
  傘: { reading: 'かさ', pitch: 1 },
  靴: { reading: 'くつ', pitch: 2 },
  服: { reading: 'ふく', pitch: 2 },
  鍵: { reading: 'かぎ', pitch: 2 },
  鏡: { reading: 'かがみ', pitch: 3 },
  色: { reading: 'いろ', pitch: 2 },
  音: { reading: 'おと', pitch: 2 },
  歌: { reading: 'うた', pitch: 2 },
  絵: { reading: 'え', pitch: 1 },
  字: { reading: 'じ', pitch: 1 },
  本: { reading: 'ほん', pitch: 1 },
  夢: { reading: 'ゆめ', pitch: 2 },
  力: { reading: 'ちから', pitch: 3 },
  旅: { reading: 'たび', pitch: 2 },
  家: { reading: 'いえ', pitch: 2 },
  米: { reading: 'こめ', pitch: 2 },
  豆: { reading: 'まめ', pitch: 2 },
  肉: { reading: 'にく', pitch: 2 },
  魚: { reading: 'さかな', pitch: 0 },
  卵: { reading: 'たまご', pitch: 2 },
  油: { reading: 'あぶら', pitch: 0 },
  塩: { reading: 'しお', pitch: 2 },
  茶: { reading: 'ちゃ', pitch: 0 },
  酒: { reading: 'さけ', pitch: 0 },
  // 时间与周期
  時: { reading: 'とき', pitch: 2 },
  年: { reading: 'とし', pitch: 2 },
  朝: { reading: 'あさ', pitch: 1 },
  昼: { reading: 'ひる', pitch: 2 },
  夜: { reading: 'よる', pitch: 1 },
  春: { reading: 'はる', pitch: 1 },
  夏: { reading: 'なつ', pitch: 2 },
  秋: { reading: 'あき', pitch: 1 },
  冬: { reading: 'ふゆ', pitch: 2 },
  // 人物与亲属
  人: { reading: 'ひと', pitch: 0 },
  男: { reading: 'おとこ', pitch: 3 },
  女: { reading: 'おんな', pitch: 3 },
  子: { reading: 'こ', pitch: 0 },
  親: { reading: 'おや', pitch: 2 },
  兄: { reading: 'あに', pitch: 1 },
  姉: { reading: 'あね', pitch: 0 },
  弟: { reading: 'おとうと', pitch: 4 },
  妹: { reading: 'いもうと', pitch: 4 },
  夫: { reading: 'おっと', pitch: 1 },
  妻: { reading: 'つま', pitch: 1 },
  友: { reading: 'とも', pitch: 1 },
};

/**
 * 孤立单字读音兜底查询：仅在【前后均非汉字】的单字场景返回读音，
 * 绝不用于连续汉字熟语（避免把熟语拆成单字误注训读）。
 */
export function deriveSingleKanjiReading(kanji: string): { reading: string; pitch?: number } | null {
  if (!kanji || kanji.length !== 1) return null;
  return SINGLE_KANJI_READINGS[kanji] || null;
}

/**
 * 判断字符串是否完全由汉字组成
 */
export function isAllKanji(text: string): boolean {
  if (!text || text.length === 0) return false;
  return /^[一-龯々〆ヵヶ]+$/.test(text);
}

/**
 * 安全推导汉字熟语的读音：
 * 1. 优先查高频熟语词库
 * 2. 若未命中但为纯连续汉字（2字），尝试按常用音读矩阵合成（杜绝单字训读断词）
 */
export function deriveJukugoReading(kanjiCompound: string): JukugoEntry | null {
  if (!kanjiCompound) return null;

  // 1. 优先查高频熟语字典
  const exact = CORE_JUKUGO_DICT[kanjiCompound];
  if (exact) return exact;

  // 2. 双字熟语安全音读推导
  if (kanjiCompound.length === 2 && isAllKanji(kanjiCompound)) {
    const k1 = kanjiCompound[0];
    const k2 = kanjiCompound[1];
    const on1 = KANJI_ONYOMI_TABLE[k1];
    const on2 = KANJI_ONYOMI_TABLE[k2];

    if (on1 && on1.length > 0 && on2 && on2.length > 0) {
      const part1 = on1[0];
      let part2 = on2[0];

      // 连浊与半浊音变简单规则：若 part1 结尾为 ん 且 part2 为 は行，变 ぱ行（如 心配 しん＋はい -> しんぱい）
      if (part1.endsWith('ん') && on2.includes('ぱい')) {
        part2 = 'ぱい';
      }

      return {
        reading: part1 + part2,
        pitch: 0, // 熟语默认为平板调（最普遍）
        pos: '名·熟语',
      };
    }
  }

  return null;
}
