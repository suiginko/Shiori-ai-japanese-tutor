import { RoleplayScenario } from '../types';

/**
 * 静态角色扮演场景库。
 *
 * 注意：日文文本里**不要**手工写注音标记。
 * - 旧式「汉字后面紧跟读音方括号」仅用于兼容存量数据，新数据一律不要写；
 * - 方括号内留空（一对空方括号）解析器完全不认（`BARE_UNIT_SOURCE` 要求括号内至少 1 个假名），
 *   会原样穿透到界面，学生就会看到裸奔的括号。
 * 场景文本一律交给 `<jp>` 渲染链路 + 词典链路自动补音。
 */
export const ROLEPLAY_SCENARIOS: RoleplayScenario[] = [
  {
    id: 'convenience_store',
    title: '便利店深夜觅食',
    titleJp: 'コンビニでお弁当を買う',
    category: 'shopping',
    level: 'N5',
    icon: 'Store',
    description: '在日本罗森(Lawson)或7-11购买便当、饮料，应对店员关于加热、塑料袋和筷子的经典三问。',
    roleAi: '便利店店员（亲切礼貌、略带机械感的敬语服务）',
    roleUser: '外国留学生/游客（购买便当并需要加热）',
    initialMessage: 'いらっしゃいませ！お弁当はこちらで温めますか？袋はどうされますか？',
    goals: [
      { id: 'g1', description: '回答是否需要加热便当（「お願いします」或「大丈夫です」）', completed: false },
      { id: 'g2', description: '回答是否需要塑料袋（「袋をください」或「結構です」）', completed: false },
      { id: 'g3', description: '成功确认支付方式（现金、Suica卡或信用卡）', completed: false },
    ],
    usefulPhrases: [
      { jp: '温めてください', kana: 'あたためてください', cn: '请帮我加热一下' },
      { jp: '袋は大丈夫です', kana: 'ふくろはだいじょうぶです', cn: '不用塑料袋了' },
      { jp: 'Suicaで払います', kana: 'すいかで はらいます', cn: '用西瓜卡支付' },
    ],
  },
  {
    id: 'izakaya_ordering',
    title: '下班后的居酒屋点餐',
    titleJp: '居酒屋で注文する',
    category: 'daily',
    level: 'N4',
    icon: 'Utensils',
    description: '走进东京新宿的居酒屋，点经典的“首先来杯生啤”以及烤鸡肉串、推荐下酒菜。',
    roleAi: '居酒屋热情的店小二（元气满满、经常推荐当季料理）',
    roleUser: '顾客（向店员点单并询问推荐）',
    initialMessage: 'いらっしゃいませ！何名様でしょうか？お飲み物は先にお決まりですか？',
    goals: [
      { id: 'g1', description: '告知就餐人数（如「一人です」或「二人です」）', completed: false },
      { id: 'g2', description: '说出经典居酒屋起手式「まずは生ビールで！」', completed: false },
      { id: 'g3', description: '询问店里的招牌推荐并点一份烤串（盐烤/酱烤）', completed: false },
    ],
    usefulPhrases: [
      { jp: '生ビールを二つください', kana: 'なまビールを ふたつ ください', cn: '请来两杯生啤' },
      { jp: 'おすすめは何ですか？', kana: 'おすすめは なんですか？', cn: '有什么推荐吗？' },
      { jp: '焼き鳥は塩でお願いします', kana: 'やきとりは しおで おねがいします', cn: '烤鸡肉串请用盐烤' },
    ],
  },
  {
    id: 'asking_directions_shinkansen',
    title: '东京站迷宫问路',
    titleJp: '東京駅で道を聞く',
    category: 'travel',
    level: 'N4',
    icon: 'Compass',
    description: '在繁忙的东京站寻找前往京都的新干线检票口与指定席售票机。',
    roleAi: '车站站务员（清晰、指引明确）',
    roleUser: '背包旅客（手持车票询问站台与乘车方向）',
    initialMessage: 'はい、どうなさいましたか？新幹線の乗り換えですか？',
    goals: [
      { id: 'g1', description: '礼貌以「すみません」开头并询问东海道新干线检票口在哪', completed: false },
      { id: 'g2', description: '听懂指示词（「あちら」「階段の右手」等）并复述确认', completed: false },
      { id: 'g3', description: '道谢并顺利出发', completed: false },
    ],
    usefulPhrases: [
      { jp: '東海道新幹線の乗り場はどこですか？', kana: 'とうかいどう しんかんせんの のりばは どこですか？', cn: '东海道新干线乘车处在哪里？' },
      { jp: '歩いてどのくらいかかりますか？', kana: 'あるいて どのくらい かかりますか？', cn: '走过去大概需要多久？' },
    ],
  },
  {
    id: 'business_meeting_greeting',
    title: '日企商务初次拜访与名片交换',
    titleJp: 'ビジネスの挨拶と名刺交換',
    category: 'business',
    level: 'N2',
    icon: 'Briefcase',
    description: '拜访日本合作客户公司，运用得体的敬语、谦让语进行自我介绍并规范交换名片。',
    roleAi: '日本客户公司的项目负责人（部长/课长，严谨而体面）',
    roleUser: '外企派遣的商务代表（首次登门拜访）',
    initialMessage: '本日はお忙しい中、弊社まで足をお運びいただき誠にありがとうございます。私、営業部の田中と申します。',
    goals: [
      { id: 'g1', description: '使用敬语表达初次见面的寒暄（「はじめまして、～と申します」）', completed: false },
      { id: 'g2', description: '得体交换名片并致以请多关照（「頂戴いたします」「どうぞよろしくお願い申し上げます」）', completed: false },
      { id: 'g3', description: '简述今日来访目的或议题概要', completed: false },
    ],
    usefulPhrases: [
      { jp: 'お目にかかれて光栄です', kana: 'おめにかかれて こうえいです', cn: '能与您会面十分荣幸' },
      { jp: '名刺を頂戴いたします', kana: 'めいしを ちょうだいいたします', cn: '收下您的名片' },
    ],
  },
  {
    id: 'anime_manga_chat',
    title: '秋叶原宅友聊动漫名作',
    titleJp: 'アニメや漫画について熱く語る',
    category: 'anime',
    level: 'N3',
    icon: 'Sparkles',
    description: '与日本动漫同好闲聊最新季番、心目中的神作以及催泪名场面。',
    roleAi: '二次元深资宅友（热情健谈，常带口语感和感叹语气）',
    roleUser: '动漫爱好者（分享自己喜欢的作品和理由）',
    initialMessage: 'お疲れ！今期のアニメ、何か追いかけてる？あの作品の作画、神がかってたよね！',
    goals: [
      { id: 'g1', description: '分享一部自己最近在看的动画或经典作品', completed: false },
      { id: 'g2', description: '说明自己喜欢这部作品的理由（剧情/声优/作画）', completed: false },
      { id: 'g3', description: '向对方询问或推荐一部值得补的番剧', completed: false },
    ],
    usefulPhrases: [
      { jp: 'ストーリーの展開が鳥肌モノでした', kana: 'ストーリーの てんかいが とりはだモノでした', cn: '剧情展开让人起一身鸡皮疙瘩（神展开）' },
      { jp: '推しキャラは誰ですか？', kana: 'おしキャラは だれですか？', cn: '你的本命推是谁？' },
    ],
  },
];
