import { KanaItem } from '../types';

export const SEION_KANA: KanaItem[] = [
  // a-row
  { hiragana: 'あ', katakana: 'ア', romaji: 'a', row: 'a', col: 'a', type: 'seion', chineseMnemonic: '像草书的“安”字', pronunciationTip: '发音口型比汉语“啊”略小，自然放松。' },
  { hiragana: 'い', katakana: 'イ', romaji: 'i', row: 'a', col: 'i', type: 'seion', chineseMnemonic: '源自草书“以”', pronunciationTip: '口角向两侧微展，发音短促清脆。' },
  { hiragana: 'う', katakana: 'ウ', romaji: 'u', row: 'a', col: 'u', type: 'seion', chineseMnemonic: '源自草书“宇”', pronunciationTip: '重要！嘴唇不要像汉语“乌”那样向前突出，双唇微扁不撅起。' },
  { hiragana: 'え', katakana: 'エ', romaji: 'e', row: 'a', col: 'e', type: 'seion', chineseMnemonic: '源自“衣”的草书', pronunciationTip: '介于汉语“哎”和“诶”之间，下颌微降。' },
  { hiragana: 'お', katakana: 'オ', romaji: 'o', row: 'a', col: 'o', type: 'seion', chineseMnemonic: '源自草书“於”', pronunciationTip: '圆形唇，但不要过度用力拢圆。' },

  // ka-row
  { hiragana: 'か', katakana: 'カ', romaji: 'ka', row: 'ka', col: 'a', type: 'seion', chineseMnemonic: '来自“加”的草书', pronunciationTip: '清辅音，在词中词尾时常不送气（听感略近ga但非浊音）。', keystrokes: ['ka'] },
  { hiragana: 'き', katakana: 'キ', romaji: 'ki', row: 'ka', col: 'i', type: 'seion', chineseMnemonic: '源自草书“幾”', pronunciationTip: '舌面隆起靠近硬腭，清脆。', keystrokes: ['ki'] },
  { hiragana: 'く', katakana: 'ク', romaji: 'ku', row: 'ka', col: 'u', type: 'seion', chineseMnemonic: '来自“久”的草书', pronunciationTip: '嘴唇不要向前凸出。', keystrokes: ['ku'] },
  { hiragana: 'け', katakana: 'ケ', romaji: 'ke', row: 'ka', col: 'e', type: 'seion', chineseMnemonic: '源自草书“計”', pronunciationTip: '辅音k加元音e。', keystrokes: ['ke'] },
  { hiragana: 'こ', katakana: 'コ', romaji: 'ko', row: 'ka', col: 'o', type: 'seion', chineseMnemonic: '源自草书“己”', pronunciationTip: '口型呈小椭圆。', keystrokes: ['ko'] },

  // sa-row
  { hiragana: 'さ', katakana: 'サ', romaji: 'sa', row: 'sa', col: 'a', type: 'seion', chineseMnemonic: '源自草书“左”', pronunciationTip: '舌尖接近上齿龈，类似汉语平舌音。', keystrokes: ['sa'] },
  { hiragana: 'し', katakana: 'シ', romaji: 'shi', row: 'sa', col: 'i', type: 'seion', chineseMnemonic: '像吸管，源自“之”', pronunciationTip: '重要！不是拼音si，也不是卷舌shi，而是舌面隆起的“西”音。', altRomaji: ['si'], keystrokes: ['shi', 'si'] },
  { hiragana: 'す', katakana: 'ス', romaji: 'su', row: 'sa', col: 'u', type: 'seion', chineseMnemonic: '源自草书“寸”', pronunciationTip: '重要！不是拼音su也不是卷舌shu，发音近“斯”，双唇展平。', keystrokes: ['su'] },
  { hiragana: 'せ', katakana: 'セ', romaji: 'se', row: 'sa', col: 'e', type: 'seion', chineseMnemonic: '源自草书“世”', pronunciationTip: '平舌辅音s加元音e。', keystrokes: ['se'] },
  { hiragana: 'そ', katakana: 'ソ', romaji: 'so', row: 'sa', col: 'o', type: 'seion', chineseMnemonic: '源自草书“曾”', pronunciationTip: '平舌辅音s加元音o。', keystrokes: ['so'] },

  // ta-row
  { hiragana: 'た', katakana: 'タ', romaji: 'ta', row: 'ta', col: 'a', type: 'seion', chineseMnemonic: '源自草书“太”', pronunciationTip: '清音，词中不送气听起来像da。', keystrokes: ['ta'] },
  { hiragana: 'ち', katakana: 'チ', romaji: 'chi', row: 'ta', col: 'i', type: 'seion', chineseMnemonic: '像数字5，源自“知”', pronunciationTip: '重要！类似汉语“七”，不是汉语ti。', altRomaji: ['ti'], keystrokes: ['chi', 'ti'] },
  { hiragana: 'つ', katakana: 'ツ', romaji: 'tsu', row: 'ta', col: 'u', type: 'seion', chineseMnemonic: '像弯弯月亮，源自“川”', pronunciationTip: '重要难点！类似汉语“呲/粗”之间，舌尖在门齿后形成缝隙，不卷舌。', altRomaji: ['tu'], keystrokes: ['tsu', 'tu'] },
  { hiragana: 'て', katakana: 'テ', romaji: 'te', row: 'ta', col: 'e', type: 'seion', chineseMnemonic: '源自草书“天”', pronunciationTip: '辅音t加元音e。', keystrokes: ['te'] },
  { hiragana: 'と', katakana: 'ト', romaji: 'to', row: 'ta', col: 'o', type: 'seion', chineseMnemonic: '源自草书“止”', pronunciationTip: '辅音t加元音o。', keystrokes: ['to'] },

  // na-row
  { hiragana: 'な', katakana: 'ナ', romaji: 'na', row: 'na', col: 'a', type: 'seion', chineseMnemonic: '源自草书“奈”', pronunciationTip: '鼻音n起首，声音柔和。', keystrokes: ['na'] },
  { hiragana: 'に', katakana: 'ニ', romaji: 'ni', row: 'na', col: 'i', type: 'seion', chineseMnemonic: '源自草书“仁”', pronunciationTip: '类似“你”，舌面贴近上腭。', keystrokes: ['ni'] },
  { hiragana: 'ぬ', katakana: 'ヌ', romaji: 'nu', row: 'na', col: 'u', type: 'seion', chineseMnemonic: '源自草书“奴”', pronunciationTip: '注意双唇不要撅起。', keystrokes: ['nu'] },
  { hiragana: 'ね', katakana: 'ネ', romaji: 'ne', row: 'na', col: 'e', type: 'seion', chineseMnemonic: '源自草书“祢”', pronunciationTip: '鼻音n加元音e。', keystrokes: ['ne'] },
  { hiragana: 'の', katakana: 'ノ', romaji: 'no', row: 'na', col: 'o', type: 'seion', chineseMnemonic: '源自草书“乃”', pronunciationTip: '日语的灵魂助词“的”。', keystrokes: ['no'] },

  // ha-row
  { hiragana: 'は', katakana: 'ハ', romaji: 'ha', row: 'ha', col: 'a', type: 'seion', chineseMnemonic: '源自草书“波”', pronunciationTip: '作为助词时读作 wa（和）。打字均输入 ha。', keystrokes: ['ha'] },
  { hiragana: 'ひ', katakana: 'ヒ', romaji: 'hi', row: 'ha', col: 'i', type: 'seion', chineseMnemonic: '源自草书“比”', pronunciationTip: '呼气通过舌面微狭缝，摩擦声柔和。', keystrokes: ['hi'] },
  { hiragana: 'ふ', katakana: 'フ', romaji: 'fu', row: 'ha', col: 'u', type: 'seion', chineseMnemonic: '源自草书“不”', pronunciationTip: '重要！不是上齿咬下唇的汉语fu，而是双唇微开吹蜡烛般的无齿摩擦音。', altRomaji: ['hu'], keystrokes: ['fu', 'hu'] },
  { hiragana: 'へ', katakana: 'ヘ', romaji: 'he', row: 'ha', col: 'e', type: 'seion', chineseMnemonic: '源自草书“部”', pronunciationTip: '作为助词“向/往”时读作 e。打字输入 he。', keystrokes: ['he'] },
  { hiragana: 'ほ', katakana: 'ホ', romaji: 'ho', row: 'ha', col: 'o', type: 'seion', chineseMnemonic: '源自草书“保”', pronunciationTip: '声门轻吐气。', keystrokes: ['ho'] },

  // ma-row
  { hiragana: 'ま', katakana: 'マ', romaji: 'ma', row: 'ma', col: 'a', type: 'seion', chineseMnemonic: '源自草书“末”', pronunciationTip: '双唇闭合鼻音起首。', keystrokes: ['ma'] },
  { hiragana: 'み', katakana: 'ミ', romaji: 'mi', row: 'ma', col: 'i', type: 'seion', chineseMnemonic: '源自草书“美”', pronunciationTip: '辅音m加元音i。', keystrokes: ['mi'] },
  { hiragana: 'む', katakana: 'ム', romaji: 'mu', row: 'ma', col: 'u', type: 'seion', chineseMnemonic: '双唇不向前伸。', pronunciationTip: '双唇不向前伸。', keystrokes: ['mu'] },
  { hiragana: 'め', katakana: 'メ', romaji: 'me', row: 'ma', col: 'e', type: 'seion', chineseMnemonic: '源自草书“女”', pronunciationTip: '辅音m加元音e。', keystrokes: ['me'] },
  { hiragana: 'も', katakana: 'モ', romaji: 'mo', row: 'ma', col: 'o', type: 'seion', chineseMnemonic: '源自草书“毛”', pronunciationTip: '辅音m加元音o。', keystrokes: ['mo'] },

  // ya-row
  { hiragana: 'や', katakana: 'ヤ', romaji: 'ya', row: 'ya', col: 'a', type: 'seion', chineseMnemonic: '源自草书“也”', pronunciationTip: '半元音，发音连贯。', keystrokes: ['ya'] },
  { hiragana: 'ゆ', katakana: 'ユ', romaji: 'yu', row: 'ya', col: 'u', type: 'seion', chineseMnemonic: '源自草书“由”', pronunciationTip: '舌位高，不撅唇。', keystrokes: ['yu'] },
  { hiragana: 'よ', katakana: 'ヨ', romaji: 'yo', row: 'ya', col: 'o', type: 'seion', chineseMnemonic: '源自草书“与”', pronunciationTip: '半元音y加元音o。', keystrokes: ['yo'] },

  // ra-row (Important for Chinese speakers)
  { hiragana: 'ら', katakana: 'ラ', romaji: 'ra', row: 'ra', col: 'a', type: 'seion', chineseMnemonic: '源自草书“良”', pronunciationTip: '难点！不是汉语的“拉(L)”也不是英文的“R”，而是舌尖在上齿龈轻弹一下的弹舌音(近da/la)。', keystrokes: ['ra'] },
  { hiragana: 'り', katakana: 'リ', romaji: 'ri', row: 'ra', col: 'i', type: 'seion', chineseMnemonic: '源自草书“利”', pronunciationTip: '舌尖轻弹一次。', keystrokes: ['ri'] },
  { hiragana: 'る', katakana: 'ル', romaji: 'ru', row: 'ra', col: 'u', type: 'seion', chineseMnemonic: '源自草书“留”', pronunciationTip: '动词原形常用结尾，舌尖轻弹。', keystrokes: ['ru'] },
  { hiragana: 'れ', katakana: 'レ', romaji: 're', row: 'ra', col: 'e', type: 'seion', chineseMnemonic: '源自草书“礼”', pronunciationTip: '弹音加元音e。', keystrokes: ['re'] },
  { hiragana: 'ろ', katakana: 'ロ', romaji: 'ro', row: 'ra', col: 'o', type: 'seion', chineseMnemonic: '源自草书“吕”', pronunciationTip: '弹音加元音o。', keystrokes: ['ro'] },

  // wa-row & n
  { hiragana: 'わ', katakana: 'ワ', romaji: 'wa', row: 'wa', col: 'a', type: 'seion', chineseMnemonic: '源自草书“和”', pronunciationTip: '圆唇轻带，类似“挖”。', keystrokes: ['wa'] },
  { hiragana: 'を', katakana: 'ヲ', romaji: 'wo', row: 'wa', col: 'o', type: 'seion', chineseMnemonic: '源自草书“乎”', pronunciationTip: '现代日语实际读音与“お(o)”相同，仅作为宾语助词使用。打字必须输入 wo。', altRomaji: ['o'], keystrokes: ['wo'] },
  { hiragana: 'ん', katakana: 'ン', romaji: 'n', row: 'wa', col: 'n', type: 'seion', chineseMnemonic: '源自草书“无”', pronunciationTip: '拨音，占用完整一拍(mora)长度。根据后接音变化为m/n/ng。打字最稳打两次 nn。', altRomaji: ['nn'], keystrokes: ['nn', 'xn'] },
];

export const DAKUON_KANA: KanaItem[] = [
  { hiragana: 'が', katakana: 'ガ', romaji: 'ga', row: 'ga', col: 'a', type: 'dakuon', chineseMnemonic: 'か的浊音', pronunciationTip: '声带振动，在词头为清浊结合，词中常带鼻浊音。', keystrokes: ['ga'] },
  { hiragana: 'ぎ', katakana: 'ギ', romaji: 'gi', row: 'ga', col: 'i', type: 'dakuon', chineseMnemonic: 'き的浊音', pronunciationTip: '声带振动。', keystrokes: ['gi'] },
  { hiragana: 'ぐ', katakana: 'グ', romaji: 'gu', row: 'ga', col: 'u', type: 'dakuon', chineseMnemonic: 'く的浊音', pronunciationTip: '声带振动，双唇不噘。', keystrokes: ['gu'] },
  { hiragana: 'げ', katakana: 'ゲ', romaji: 'ge', row: 'ga', col: 'e', type: 'dakuon', chineseMnemonic: 'け的浊音', pronunciationTip: '声带振动。', keystrokes: ['ge'] },
  { hiragana: 'ご', katakana: 'ゴ', romaji: 'go', row: 'ga', col: 'o', type: 'dakuon', chineseMnemonic: 'こ的浊音', pronunciationTip: '声带振动。', keystrokes: ['go'] },

  { hiragana: 'ざ', katakana: 'ザ', romaji: 'za', row: 'za', col: 'a', type: 'dakuon', chineseMnemonic: 'さ的浊音', pronunciationTip: '声带振动的平舌音，近“杂”。', keystrokes: ['za'] },
  { hiragana: 'じ', katakana: 'ジ', romaji: 'ji', row: 'za', col: 'i', type: 'dakuon', chineseMnemonic: 'しの浊音', pronunciationTip: '类似英语 jeep 的起始音。打字支持 ji 或 zi。', altRomaji: ['zi'], keystrokes: ['ji', 'zi'] },
  { hiragana: 'ず', katakana: 'ズ', romaji: 'zu', row: 'za', col: 'u', type: 'dakuon', chineseMnemonic: 'す的浊音', pronunciationTip: '类似“滋”但带声带震动。', keystrokes: ['zu'] },
  { hiragana: 'ぜ', katakana: 'ゼ', romaji: 'ze', row: 'za', col: 'e', type: 'dakuon', chineseMnemonic: 'せ的浊音', pronunciationTip: '浊辅音z加元音e。', keystrokes: ['ze'] },
  { hiragana: 'ぞ', katakana: 'ゾ', romaji: 'zo', row: 'za', col: 'o', type: 'dakuon', chineseMnemonic: 'そ的浊音', pronunciationTip: '浊辅音z加元音o。', keystrokes: ['zo'] },

  { hiragana: 'だ', katakana: 'ダ', romaji: 'da', row: 'da', col: 'a', type: 'dakuon', chineseMnemonic: 'た的浊音', pronunciationTip: '声带振动，类似“答”。', keystrokes: ['da'] },
  { hiragana: 'ぢ', katakana: 'ヂ', romaji: 'ji', row: 'da', col: 'i', type: 'dakuon', chineseMnemonic: 'ち的浊音', pronunciationTip: '现代音同「じ」。打字输入 di 可精准输出。', altRomaji: ['di'], keystrokes: ['di'] },
  { hiragana: 'づ', katakana: 'ヅ', romaji: 'zu', row: 'da', col: 'u', type: 'dakuon', chineseMnemonic: 'つの浊音', pronunciationTip: '现代音同「ず」。打字输入 du 可精准输出。', altRomaji: ['du'], keystrokes: ['du'] },
  { hiragana: 'で', katakana: 'デ', romaji: 'de', row: 'da', col: 'e', type: 'dakuon', chineseMnemonic: 'ての浊音', pronunciationTip: '声带振动。', keystrokes: ['de'] },
  { hiragana: 'ど', katakana: 'ド', romaji: 'do', row: 'da', col: 'o', type: 'dakuon', chineseMnemonic: 'との浊音', pronunciationTip: '声带振动。', keystrokes: ['do'] },

  { hiragana: 'ば', katakana: 'バ', romaji: 'ba', row: 'ba', col: 'a', type: 'dakuon', chineseMnemonic: 'は的浊音', pronunciationTip: '声带振动的双唇闭合音。', keystrokes: ['ba'] },
  { hiragana: 'び', katakana: 'ビ', romaji: 'bi', row: 'ba', col: 'i', type: 'dakuon', chineseMnemonic: 'ひ的浊音', pronunciationTip: '声带振动。', keystrokes: ['bi'] },
  { hiragana: 'ぶ', katakana: 'ブ', romaji: 'bu', row: 'ba', col: 'u', type: 'dakuon', chineseMnemonic: 'ふ的浊音', pronunciationTip: '声带振动。', keystrokes: ['bu'] },
  { hiragana: 'べ', katakana: 'ベ', romaji: 'be', row: 'ba', col: 'e', type: 'dakuon', chineseMnemonic: 'へ的浊音', pronunciationTip: '声带振动。', keystrokes: ['be'] },
  { hiragana: 'ぼ', katakana: 'ボ', romaji: 'bo', row: 'ba', col: 'o', type: 'dakuon', chineseMnemonic: 'ほ的浊音', pronunciationTip: '声带振动。', keystrokes: ['bo'] },

  // 半浊音 (Handakuon)
  { hiragana: 'ぱ', katakana: 'パ', romaji: 'pa', row: 'pa', col: 'a', type: 'dakuon', chineseMnemonic: '半浊音 circle', pronunciationTip: '双唇清爆破音，送气类似“啪”。', keystrokes: ['pa'] },
  { hiragana: 'ぴ', katakana: 'ピ', romaji: 'pi', row: 'pa', col: 'i', type: 'dakuon', chineseMnemonic: '半浊音', pronunciationTip: '双唇爆破。', keystrokes: ['pi'] },
  { hiragana: 'ぷ', katakana: 'プ', romaji: 'pu', row: 'pa', col: 'u', type: 'dakuon', chineseMnemonic: '半浊音', pronunciationTip: '双唇爆破。', keystrokes: ['pu'] },
  { hiragana: 'ぺ', katakana: 'ペ', romaji: 'pe', row: 'pa', col: 'e', type: 'dakuon', chineseMnemonic: '半浊音', pronunciationTip: '双唇爆破。', keystrokes: ['pe'] },
  { hiragana: 'ぽ', katakana: 'ポ', romaji: 'po', row: 'pa', col: 'o', type: 'dakuon', chineseMnemonic: '半浊音', pronunciationTip: '双唇爆破。', keystrokes: ['po'] },
];

/** 36个经典标准拗音 (Yōon) */
export const YOON_KANA: KanaItem[] = [
  // k-group
  { hiragana: 'きゃ', katakana: 'キャ', romaji: 'kya', row: 'kya', col: 'a', type: 'yoon', chineseMnemonic: 'き + ゃ', pronunciationTip: '舌面隆起靠近硬腭，一口气快速滑出kya。', keystrokes: ['kya'] },
  { hiragana: 'きゅ', katakana: 'キュ', romaji: 'kyu', row: 'kya', col: 'u', type: 'yoon', chineseMnemonic: 'き + ゅ', pronunciationTip: '舌尖后缩，双唇微扁不向前撅。', keystrokes: ['kyu'] },
  { hiragana: 'きょ', katakana: 'キョ', romaji: 'kyo', row: 'kya', col: 'o', type: 'yoon', chineseMnemonic: 'き + ょ', pronunciationTip: '发音类似汉语“桥”的第一声（略平）。', keystrokes: ['kyo'] },

  // s-group
  { hiragana: 'しゃ', katakana: 'シャ', romaji: 'sha', row: 'sha', col: 'a', type: 'yoon', chineseMnemonic: 'し + ゃ', pronunciationTip: '平舌面音，类似汉语“虾”，勿卷舌！', altRomaji: ['sya'], keystrokes: ['sha', 'sya'] },
  { hiragana: 'しゅ', katakana: 'シュ', romaji: 'shu', row: 'sha', col: 'u', type: 'yoon', chineseMnemonic: 'し + ゅ', pronunciationTip: '发音近汉语“休”，嘴唇展平不要撅嘴。', altRomaji: ['syu'], keystrokes: ['shu', 'syu'] },
  { hiragana: 'しょ', katakana: 'ショ', romaji: 'sho', row: 'sha', col: 'o', type: 'yoon', chineseMnemonic: 'し + ょ', pronunciationTip: '舌面音xi加o，类似“修”的开音。', altRomaji: ['syo'], keystrokes: ['sho', 'syo'] },

  // t-group
  { hiragana: 'ちゃ', katakana: 'チャ', romaji: 'cha', row: 'cha', col: 'a', type: 'yoon', chineseMnemonic: 'ち + ゃ', pronunciationTip: '类似汉语“恰”，但口型更收敛。', altRomaji: ['tya'], keystrokes: ['cha', 'tya'] },
  { hiragana: 'ちゅ', katakana: 'チュ', romaji: 'chu', row: 'cha', col: 'u', type: 'yoon', chineseMnemonic: 'ち + ゅ', pronunciationTip: '类似“丘/秋”，双唇不可突出。', altRomaji: ['tyu'], keystrokes: ['chu', 'tyu'] },
  { hiragana: 'ちょ', katakana: 'チョ', romaji: 'cho', row: 'cha', col: 'o', type: 'yoon', chineseMnemonic: 'ち + ょ', pronunciationTip: '汉语“悄”的第一声。常见词：ちょっと。', altRomaji: ['tyo'], keystrokes: ['cho', 'tyo'] },

  // n-group
  { hiragana: 'にゃ', katakana: 'ニャ', romaji: 'nya', row: 'nya', col: 'a', type: 'yoon', chineseMnemonic: '猫叫声 nya', pronunciationTip: '鼻音起音，类似汉语“捏-啊”极快连读。', keystrokes: ['nya'] },
  { hiragana: 'にゅ', katakana: 'ニュ', romaji: 'nyu', row: 'nya', col: 'u', type: 'yoon', chineseMnemonic: 'に + ゅ', pronunciationTip: '发音近“牛”，鼻音韵味浓厚。', keystrokes: ['nyu'] },
  { hiragana: 'にょ', katakana: 'ニョ', romaji: 'nyo', row: 'nya', col: 'o', type: 'yoon', chineseMnemonic: 'に + ょ', pronunciationTip: '鼻音舌面滑向o段。', keystrokes: ['nyo'] },

  // h-group
  { hiragana: 'ひゃ', katakana: 'ヒャ', romaji: 'hya', row: 'hya', col: 'a', type: 'yoon', chineseMnemonic: 'ひ + ゃ', pronunciationTip: '声门呼气摩擦音，舌面高抬。', keystrokes: ['hya'] },
  { hiragana: 'ひゅ', katakana: 'ヒュ', romaji: 'hyu', row: 'hya', col: 'u', type: 'yoon', chineseMnemonic: 'ひ + ゅ', pronunciationTip: '呼气与半元音结合，发音轻盈。', keystrokes: ['hyu'] },
  { hiragana: 'ひょ', katakana: 'ヒョ', romaji: 'hyo', row: 'hya', col: 'o', type: 'yoon', chineseMnemonic: 'ひ + ょ', pronunciationTip: '舌面摩擦滑向o。例：ひょう（票/豹）。', keystrokes: ['hyo'] },

  // m-group
  { hiragana: 'みゃ', katakana: 'ミャ', romaji: 'mya', row: 'mya', col: 'a', type: 'yoon', chineseMnemonic: 'み + ゃ', pronunciationTip: '双唇闭合鼻音m快速带出ya。', keystrokes: ['mya'] },
  { hiragana: 'みゅ', katakana: 'ミュ', romaji: 'myu', row: 'mya', col: 'u', type: 'yoon', chineseMnemonic: 'み + ゅ', pronunciationTip: '常见于外来语如 ミュージック(音乐)。', keystrokes: ['myu'] },
  { hiragana: 'みょ', katakana: 'ミョ', romaji: 'myo', row: 'mya', col: 'o', type: 'yoon', chineseMnemonic: 'み + ょ', pronunciationTip: '双唇鼻音滑向o。例：みょうじ（苗字）。', keystrokes: ['myo'] },

  // r-group
  { hiragana: 'りゃ', katakana: 'リャ', romaji: 'rya', row: 'rya', col: 'a', type: 'yoon', chineseMnemonic: 'り + ゃ', pronunciationTip: '舌尖在上齿龈轻弹一下迅速滑向a。', keystrokes: ['rya'] },
  { hiragana: 'りゅ', katakana: 'リュ', romaji: 'ryu', row: 'rya', col: 'u', type: 'yoon', chineseMnemonic: 'り + ゅ', pronunciationTip: '轻弹一次舌尖连出u。例：りゅうがく（留学）。', keystrokes: ['ryu'] },
  { hiragana: 'りょ', katakana: 'リョ', romaji: 'ryo', row: 'rya', col: 'o', type: 'yoon', chineseMnemonic: 'り + ょ', pronunciationTip: '舌尖轻弹连出o。例：りょこう（旅行）。', keystrokes: ['ryo'] },

  // g-group (浊音拗音)
  { hiragana: 'ぎゃ', katakana: 'ギャ', romaji: 'gya', row: 'gya', col: 'a', type: 'yoon', chineseMnemonic: 'ぎ + ゃ', pronunciationTip: '声带振动，舌面贴硬腭爆破滑音。', keystrokes: ['gya'] },
  { hiragana: 'ぎゅ', katakana: 'ギュ', romaji: 'gyu', row: 'gya', col: 'u', type: 'yoon', chineseMnemonic: 'ぎ + ゅ', pronunciationTip: '声带振动，词中多见。例：ぎゅうにゅう(牛奶)。', keystrokes: ['gyu'] },
  { hiragana: 'ぎょ', katakana: 'ギョ', romaji: 'gyo', row: 'gya', col: 'o', type: 'yoon', chineseMnemonic: 'ぎ + ょ', pronunciationTip: '例：ぎょうざ(饺子)、ぎょぎょう(渔业)。', keystrokes: ['gyo'] },

  // j-group (浊音拗音)
  { hiragana: 'じゃ', katakana: 'ジャ', romaji: 'ja', row: 'ja', col: 'a', type: 'yoon', chineseMnemonic: 'じ + ゃ', pronunciationTip: '声带振动的平舌滑音，类似“夹”的浊化音。', altRomaji: ['zya', 'jya'], keystrokes: ['ja', 'zya'] },
  { hiragana: 'じゅ', katakana: 'ジュ', romaji: 'ju', row: 'ja', col: 'u', type: 'yoon', chineseMnemonic: 'じ + ゅ', pronunciationTip: '发音近英语 June 的前半段，双唇不突。', altRomaji: ['zyu', 'jyu'], keystrokes: ['ju', 'zyu'] },
  { hiragana: 'じょ', katakana: 'ジョ', romaji: 'jo', row: 'ja', col: 'o', type: 'yoon', chineseMnemonic: 'じ + ょ', pronunciationTip: '常见于 じょせい(女性)、じょうず(上手)。', altRomaji: ['zyo', 'jyo'], keystrokes: ['jo', 'zyo'] },

  // b-group (浊音拗音)
  { hiragana: 'びゃ', katakana: 'ビャ', romaji: 'bya', row: 'bya', col: 'a', type: 'yoon', chineseMnemonic: 'び + ゃ', pronunciationTip: '双唇闭合浊塞音爆破滑向a。', keystrokes: ['bya'] },
  { hiragana: 'びゅ', katakana: 'ビュ', romaji: 'byu', row: 'bya', col: 'u', type: 'yoon', chineseMnemonic: 'び + ゅ', pronunciationTip: '例：インタビュー(采访)、びゅうびゅう。', keystrokes: ['byu'] },
  { hiragana: 'びょ', katakana: 'ビョ', romaji: 'byo', row: 'bya', col: 'o', type: 'yoon', chineseMnemonic: 'び + ょ', pronunciationTip: '双唇浊音连o。例：びょういん(医院)。', keystrokes: ['byo'] },

  // p-group (半浊音拗音)
  { hiragana: 'ぴゃ', katakana: 'ピャ', romaji: 'pya', row: 'pya', col: 'a', type: 'yoon', chineseMnemonic: 'ぴ + ゃ', pronunciationTip: '双唇清爆破滑向a。', keystrokes: ['pya'] },
  { hiragana: 'ぴゅ', katakana: 'ピュ', romaji: 'pyu', row: 'pya', col: 'u', type: 'yoon', chineseMnemonic: 'ぴ + ゅ', pronunciationTip: '清爆破滑向u。例：ピューピュー(风声)。', keystrokes: ['pyu'] },
  { hiragana: 'ぴょ', katakana: 'ピョ', romaji: 'pyo', row: 'pya', col: 'o', type: 'yoon', chineseMnemonic: 'ぴ + ょ', pronunciationTip: '双唇清爆破连o。例：ぴょんぴょん(蹦跳)。', keystrokes: ['pyo'] },
];

/** 现代日语/外来语特殊假名 (Special Katakana for Loanwords) */
export const SPECIAL_KATAKANA: KanaItem[] = [
  { hiragana: 'しぇ', katakana: 'シェ', romaji: 'she', row: 'special', col: 'e', type: 'special', chineseMnemonic: 'シ + ェ', pronunciationTip: '对应英语 sh 辅音加 e，如 シェフ(主厨)。', altRomaji: ['sye'], keystrokes: ['she', 'sye'] },
  { hiragana: 'じぇ', katakana: 'ジェ', romaji: 'je', row: 'special', col: 'e', type: 'special', chineseMnemonic: 'ジ + ェ', pronunciationTip: '对应英语 j 辅音加 e，如 ジェット(喷气式)。', altRomaji: ['zye'], keystrokes: ['je', 'zye'] },
  { hiragana: 'ちぇ', katakana: 'チェ', romaji: 'che', row: 'special', col: 'e', type: 'special', chineseMnemonic: 'チ + ェ', pronunciationTip: '对应英语 ch 辅音加 e，如 チェック(检查/支票)。', altRomaji: ['tye'], keystrokes: ['che', 'tye'] },
  { hiragana: 'てぃ', katakana: 'ティ', romaji: 'ti', row: 'special', col: 'i', type: 'special', chineseMnemonic: 'テ + ィ (极高频!)', pronunciationTip: '现代外来语特有音，纯正清辅音 t 加 i，如 パーティー(派对)、ティー(茶)。', altRomaji: ['thi'], keystrokes: ['ti', 'thi'] },
  { hiragana: 'でぃ', katakana: 'ディ', romaji: 'di', row: 'special', col: 'i', type: 'special', chineseMnemonic: 'デ + ィ (极高频!)', pronunciationTip: '纯正浊辅音 d 加 i，如 ディズニー(迪士尼)、ビルディング。', altRomaji: ['dhi'], keystrokes: ['di', 'dhi'] },
  { hiragana: 'でゅ', katakana: 'デュ', romaji: 'dhu', row: 'special', col: 'u', type: 'special', chineseMnemonic: 'デ + ュ', pronunciationTip: '对应英语 du/dew，如 デュエット(二重唱)。打法：dhu 或 de+xyu。', altRomaji: ['dyu'], keystrokes: ['dhu', 'dyu'] },
  { hiragana: 'ふぁ', katakana: 'ファ', romaji: 'fa', row: 'special', col: 'a', type: 'special', chineseMnemonic: 'フ + ァ', pronunciationTip: '唇齿清擦音 f 加 a，如 ファイル(文件)、ファミリー。', keystrokes: ['fa', 'fwa'] },
  { hiragana: 'ふぃ', katakana: 'フィ', romaji: 'fi', row: 'special', col: 'i', type: 'special', chineseMnemonic: 'フ + ィ', pronunciationTip: '辅音 f 加 i，如 フィルム(胶卷)、フィクション。', altRomaji: ['fyi'], keystrokes: ['fi'] },
  { hiragana: 'ふぇ', katakana: 'フェ', romaji: 'fe', row: 'special', col: 'e', type: 'special', chineseMnemonic: 'フ + ェ', pronunciationTip: '辅音 f 加 e，如 カフェ(咖啡馆)、フェリー(渡轮)。', keystrokes: ['fe'] },
  { hiragana: 'ふぉ', katakana: 'フォ', romaji: 'fo', row: 'special', col: 'o', type: 'special', chineseMnemonic: 'フ + ォ', pronunciationTip: '辅音 f 加 o，如 フォーク(叉子)、フォント(字体)。', keystrokes: ['fo'] },
  { hiragana: 'うぃ', katakana: 'ウィ', romaji: 'wi', row: 'special', col: 'i', type: 'special', chineseMnemonic: 'ウ + ィ', pronunciationTip: '圆唇半元音 w 加 i，如 ウィンドウ(窗户)、ウィスキー。', altRomaji: ['whi'], keystrokes: ['wi', 'whi'] },
  { hiragana: 'うぇ', katakana: 'ウェ', romaji: 'we', row: 'special', col: 'e', type: 'special', chineseMnemonic: 'ウ + ェ', pronunciationTip: '圆唇半元音 w 加 e，如 ウェブ(网络)、ウェディング。', altRomaji: ['whe'], keystrokes: ['we', 'whe'] },
  { hiragana: 'うぉ', katakana: 'ウォ', romaji: 'wo', row: 'special', col: 'o', type: 'special', chineseMnemonic: 'ウ + ォ', pronunciationTip: '辅音 w 加 o，如 ウォーター(水)、ウォーク。', altRomaji: ['who'], keystrokes: ['who', 'uxo'] },
  { hiragana: 'ゔぁ', katakana: 'ヴァ', romaji: 'va', row: 'special', col: 'a', type: 'special', chineseMnemonic: 'ヴ + ァ', pronunciationTip: '唇齿浊擦音 v 加 a，如 ヴァイオリン(小提琴)。', keystrokes: ['va'] },
  { hiragana: 'ゔぃ', katakana: 'ヴィ', romaji: 'vi', row: 'special', col: 'i', type: 'special', chineseMnemonic: 'ヴ + ィ', pronunciationTip: '唇齿浊擦音 v 加 i，如 ヴィラ(别墅)、ヴィーナス。', keystrokes: ['vi'] },
  { hiragana: 'ゔ',   katakana: 'ヴ',   romaji: 'vu', row: 'special', col: 'u', type: 'special', chineseMnemonic: 'ウ + 点点', pronunciationTip: '唇齿浊擦音 v，标准平假名极少使用，多用片假名 ヴ。', keystrokes: ['vu'] },
  { hiragana: 'ゔぇ', katakana: 'ヴェ', romaji: 've', row: 'special', col: 'e', type: 'special', chineseMnemonic: 'ヴ + ェ', pronunciationTip: '唇齿浊擦音 v 加 e，如 ヴェネツィア(威尼斯)。', keystrokes: ['ve'] },
  { hiragana: 'ゔぉ', katakana: 'ヴォ', romaji: 'vo', row: 'special', col: 'o', type: 'special', chineseMnemonic: 'ヴ + ォ', pronunciationTip: '唇齿浊擦音 v 加 o，如 ヴォーカル(主唱)。', keystrokes: ['vo'] },
  { hiragana: 'つぁ', katakana: 'ツァ', romaji: 'tsa', row: 'special', col: 'a', type: 'special', chineseMnemonic: 'ツ + ァ', pronunciationTip: '舌尖塞擦音 ts 加 a，如 ツァー(观光旅行)。', keystrokes: ['tsa'] },
  { hiragana: 'つぃ', katakana: 'ツィ', romaji: 'tsi', row: 'special', col: 'i', type: 'special', chineseMnemonic: 'ツ + ィ', pronunciationTip: '舌尖塞擦音 ts 加 i，如 ツィッター(鸣叫)。', keystrokes: ['tsi'] },
  { hiragana: 'つぇ', katakana: 'ツェ', romaji: 'tse', row: 'special', col: 'e', type: 'special', chineseMnemonic: 'ツ + ェ', pronunciationTip: '如 ツェッペリン(齐柏林飞艇)。', keystrokes: ['tse'] },
  { hiragana: 'つぉ', katakana: 'ツォ', romaji: 'tso', row: 'special', col: 'o', type: 'special', chineseMnemonic: 'ツ + ォ', pronunciationTip: '舌尖塞擦音 ts 加 o。', keystrokes: ['tso'] },
  { hiragana: 'とぅ', katakana: 'トゥ', romaji: 'twu', row: 'special', col: 'u', type: 'special', chineseMnemonic: 'ト + ゥ', pronunciationTip: '清辅音 t 加 u，如 トゥルー(true)。打法：twu 或 to+xu。', altRomaji: ['toxu'], keystrokes: ['twu'] },
  { hiragana: 'どぅ', katakana: 'ドゥ', romaji: 'dwu', row: 'special', col: 'u', type: 'special', chineseMnemonic: 'ド + ゥ', pronunciationTip: '浊辅音 d 加 u，如 ドゥ(do)。打法：dwu 或 do+xu。', altRomaji: ['doxu'], keystrokes: ['dwu'] },
];

/** 日语核心发音知识全解指南 */
export const PRONUNCIATION_TOPICS: import('../types').PronunciationTopic[] = [
  {
    id: 'sokuon',
    title: '促音 (っ/ッ) 发音奥秘',
    subtitle: '音拍停顿法则：吸一口气的静止瞬间',
    iconType: 'pause',
    tag: '基础核心',
    summary: '促音用小写「っ/ッ」表示，本身不单独发音，而是占据整整一拍（Mora）的无声停顿，靠喉头闭锁或口腔阻断气流形成节奏顿挫感。',
    coreRule: '发促音时，在前一个假名刚结束时做好后一个假名发音器官的准备，紧紧憋气停顿整整一拍，然后再爆发后一个音。',
    examples: [
      { word: '切手', reading: 'きって', romaji: 'kitte', meaning: '邮票', note: '停顿1拍：ki - [停顿] - te' },
      { word: '学校', reading: 'がっこう', romaji: 'gakkou', meaning: '学校', note: 'ga - [喉头闭塞停顿] - kou' },
      { word: '雑誌', reading: 'ざっし', romaji: 'zasshi', meaning: '杂志', note: 'za - [齿间气流持续一拍] - shi' },
      { word: '日本', reading: 'にっぽん', romaji: 'nippon', meaning: '日本(强调读音)', note: 'ni - [双唇紧闭停顿] - pon' },
    ],
    audioText: 'きって。がっこう。ざっし。にっぽん。',
    practicalTips: [
      '初学者最常见毛病是“读太快跳过去”导致听起来像 kiti 或 gako，必须严格留出一拍的时间空白。',
      '促音后面必定跟着 k、s、t、p 辅音行（即 か/さ/た/ぱ 行）。',
      '26键打字最快秘诀：直接连按两次后一个音的辅音字母（例如 kitte、gakkou、zasshi、nippon），系统会自动生成促音！',
    ],
  },
  {
    id: 'hatsuon',
    title: '拨音 (ん/ン) 鼻音与同化',
    subtitle: '独立一拍与随音变色：绝不仅是拼音的 n',
    iconType: 'music',
    tag: '母语级细节',
    summary: '拨音「ん」是唯一的辅音假名，同样独占一拍时值。虽然罗马字记作 n，但根据其后面跟随的假名，口腔发音位置会自动发生同化。',
    coreRule: '「ん」根据后接辅音分为三种主要形态：后接 m/b/p 发 [m]（闭唇），后接 t/d/n 发 [n]（舌尖抵上齿龈），后接 k/g 发 [ŋ]（舌根软腭鼻音），在词尾或元音前发微弱小舌鼻音 [ɴ]。',
    examples: [
      { word: '散歩', reading: 'さんぽ', romaji: 'sampo / sanpo', meaning: '散步', note: '后接 p 音，双唇闭合发 [m]' },
      { word: '先生', reading: 'せんせい', romaji: 'sensei', meaning: '老师', note: '后接 s 音，舌面接近牙齿' },
      { word: '天気', reading: 'てんき', romaji: 'tenki', meaning: '天气', note: '后接 k 音，舌根抵软腭发 [ŋ]' },
      { word: '本', reading: 'ほん', romaji: 'hon', meaning: '书', note: '位于词尾，不完全闭合的小舌微鼻音' },
    ],
    audioText: 'さんぽ。せんせい。てんき。ほん。',
    practicalTips: [
      '切记「ん」不能读得轻忽飘过，它与普通假名享有完全同等的“一拍时值”。例如「ほん」是两拍（ho-n），绝不是单音节的“轰”。',
      '打字踩坑预警：输入法中单独打 n 往往出不来「ん」！强烈建议养成连敲两次「nn」的肌肉记忆，在任何输入法中都100%稳妥！',
      '当「ん」后面接 a/i/u/e/o 或 ya/yu/yo 时，若只敲一个 n，输入法会直接合成 na/ni/nu/nya 等假名（例如「恋愛(れんあい)」若打 renai 会变成「れない」，必须打 rennai）！',
    ],
  },
  {
    id: 'choon',
    title: '长音 (Chōon) 延长规则',
    subtitle: '多拖一拍意思大变：おばさん vs おばあさん',
    iconType: 'clock',
    tag: '易混陷阱',
    summary: '长音指把前一个假名的元音拖长整整一拍（持续两拍长度）。在日语中长短音有着严格区别词义的作用（如「叔母」与「祖母」）。',
    coreRule: '平假名长音规律：あ段+あ、い段+い、う段+う、え段+え(少数词)或い(多名词/汉字音)、お段+お(少数词)或う(绝大多数)。片假名长音一律用长横线「ー」表示。',
    examples: [
      { word: 'おばさん', reading: 'おばさん', romaji: 'obasan (短音)', meaning: '阿姨/大婶', note: 'ba 为普通单音拍' },
      { word: 'おばあさん', reading: 'おばあさん', romaji: 'obaasan (长音)', meaning: '老奶奶/外婆', note: 'baa 拖长两拍，含义截然不同！' },
      { word: 'お父さん', reading: 'おとうさん', romaji: 'otousan', meaning: '父亲', note: 'お段+う，读成长音 [otoːsaɴ]' },
      { word: 'コーヒー', reading: 'コーヒー', romaji: 'koohii', meaning: '咖啡', note: '片假名用「ー」表示两处长音' },
    ],
    audioText: 'おばさん。おばあさん。おとうさん。コーヒー。',
    practicalTips: [
      '在电脑键盘上，片假名长音符号「ー」是通过主键盘数字0右边的减号键「-」直接输入的（无需切换至中文输入法）。',
      '平假名汉字音读中，几乎所有的“欧”段长音都是写成「～う」（如「こうこう(高校)」「とうきょう(東京)」），不要打错成「～お」。',
    ],
  },
  {
    id: 'mora-pitch',
    title: '音拍 (Mora) 与音调高低',
    subtitle: '拍节器般的等时语言 & 声调四大核型',
    iconType: 'activity',
    tag: '进阶发音',
    summary: '汉语是声调语言（有阴平、阳平、上声、去声的变化），而日语是“音拍等时性”的音高型语言（Pitch Accent）。每个假名、促音、拨音、长音各占一拍，像打拍子一样等速进行。',
    coreRule: '日语声调核心只有“高”与“低”两级。一个单词从低升到高，或者从高降到低。声调类型分为四大类：①平板型(⓪型, 低高高...)、②头高型(①型, 高低低...)、③中高型(②③④型, 低高...低)、④尾高型(单词末尾高，后接助词断崖式下跌)。',
    examples: [
      { word: '雨', reading: 'あめ ①型', romaji: 'a(高)me(低)', meaning: '雨 (头高型)', note: '第一拍高，第二拍低' },
      { word: '飴', reading: 'あめ ⓪型', romaji: 'a(低)me(高)', meaning: '糖果 (平板型)', note: '第一拍低，第二拍高，后接助词继续高' },
      { word: '橋', reading: 'はし ②型', romaji: 'ha(低)shi(高)', meaning: '桥 (尾高型)', note: '接助词时「はしが」ga 变低' },
      { word: '箸', reading: 'はし ①型', romaji: 'ha(高)shi(低)', meaning: '筷子 (头高型)', note: '与“桥”音调相反' },
    ],
    audioText: 'あめ。あめ。はし。はし。',
    practicalTips: [
      '同一组假名拼写，由于高低音调不同，意思可能完全相反（如 あめ 下雨 vs 糖果；はし 筷子 vs 桥梁）。',
      '第一拍和第二拍的音高永远是相反的！第一拍若是低，第二拍必为高；第一拍若是高，第二拍必降为低。',
    ],
  },
  {
    id: 'unaspirated',
    title: '送气与不送气音辨析',
    subtitle: '为什么「わたし」听起来像「わだし」？',
    iconType: 'volume-2',
    tag: '消除误区',
    summary: '许多初学者经常困惑：日本人在说「わたし (watashi)」时，为什么 ta 听起来像 da？说「あなた」像 anada？难道词中清音都变成浊音了吗？答案是：绝对不是！',
    coreRule: '这其实是汉语母语者的听觉错觉。汉语拼音依靠“送气 vs 不送气”区分声母（如 p是送气，b是不送气清音）。而日语是用“声带是否振动”区分清音与浊音。日语的 か 行、た 行假名在词头时正常送气，但在词中或词尾时气流变弱，变成“不送气清音”。此时声带仍然没有振动，但中国耳朵会误以为听到了拼音里的 d 或 g！',
    examples: [
      { word: '私', reading: 'わたし', romaji: 'watashi', meaning: '我', note: 'ta 在词中不送气，听感近拼音 da，但声带不震动，绝不是わだし！' },
      { word: 'あなた', reading: 'あなた', romaji: 'anata', meaning: '你', note: '词末 ta 弱送气' },
      { word: '大学', reading: 'だいがく', romaji: 'daigaku', meaning: '大学', note: '真浊音！发 dai 时从发音最初一瞬间声带就剧烈振动' },
      { word: '高かった', reading: 'たかかった', romaji: 'takakatta', meaning: '很贵(过去式)', note: '第一个 ta 送气，后面 ka、ka、ta 均弱送气' },
    ],
    audioText: 'わたし。あなた。だいがく。たかかった。',
    practicalTips: [
      '用手摸着喉结发「だ(da)」时，声带在发辅音的瞬间就会振动。而发「わたし」的「た」时，声带在发辅音瞬间是不震动的。',
      '日常练习时，不要故意把词中的 ta/ka 读成带有强震动感的 da/ga，只需自然收敛吐出的气流即可。',
    ],
  },
  {
    id: 'particles',
    title: '助词的特殊读音法则',
    subtitle: 'は、へ、を 的读音与历史变迁',
    iconType: 'alert-circle',
    tag: '基础核心',
    summary: '现代日语中有三个假名作为语法助词出现时，发音与五十音图原本读音不同。这是日本历史假名遣现代改革遗留下的痕迹。',
    coreRule: '① 主题提示助词「は」读作「わ(wa)」，不再读 ha；② 移动方向助词「へ」读作「え(e)」，不再读 he；③ 宾语助词「を」读作「お(o)」，发音与 お 完全相同，现专用于助词。',
    examples: [
      { word: 'こんにちは', reading: 'こんにちは', romaji: 'konnichiwa', meaning: '你好', note: '句末的「は」本质是助词，读 wa' },
      { word: '日本へ行く', reading: 'にほんへいく', romaji: 'nihon e iku', meaning: '去日本', note: '「へ」表示方向，读作 e' },
      { word: 'ご飯を食べる', reading: 'ごはんをたべる', romaji: 'gohan o taberu', meaning: '吃饭', note: '「を」读作 o，输入法击键打 wo' },
      { word: '母は花が好き', reading: 'ははははながすき', romaji: 'haha wa hana ga suki', meaning: '母亲喜欢花', note: '词内的「は」读 ha，助词「は」读 wa' },
    ],
    audioText: 'こんにちは。にほんへいく。ごはんをたべる。ははははながすき。',
    practicalTips: [
      '打字输入时：助词「は」依然输入 `ha`；助词「へ」输入 `he`；助词「を」必须输入 `wo`（输入 o 会变成普通假名「お」）。',
      '寒暄语「こんばんは(晚上好)」「では(那么)」末尾也是助词「は」，同样读 wa，打字同样打 ha。',
    ],
  },
];

/** 26键键盘日文罗马字打字攻略与分类速查指南 */
export const KEYBOARD_TYPING_GUIDE = {
  generalRules: [
    {
      title: '基本原理与输入法状态',
      content: '日文输入法（如 Windows 微软日文输入法、Mac 日文输入法、Gboard）核心基于【罗马字输入 (Romaji Input)】。用户在标准的 26 键英文键盘上敲击对应罗马字字母，系统会即时转化为平假名，按【空格键】转为汉字/候选词，按【Enter回车】确认当前假名。',
    },
    {
      title: '小假名独立输入秘籍（x 与 l 前缀）',
      content: '所有缩小版的小假名（小っ、小ゃ、小ゅ、小ょ、小ぁ、小ぃ、小ぅ、小ぇ、小ぉ 等），只需要在字母前加上「x」或者「l」(little 之意)！例如：输入 xtsu 或 ltsu 即可单独打出「っ」；输入 xya 或 lya 即可打出「ゃ」；输入 xa 或 la 即可打出「ぁ」。',
    },
    {
      title: '促音输入两大流派',
      content: '① 推荐【辅音双打流】：打促音最快速的方法是直接双敲后一个假名的第一个辅音字母。例如想打「きって(kitte)」，只需打 k-i-t-t-e，打第二个 t 的瞬间系统就会自动补出小「っ」！同理：がっこう -> gakkou、ざっし -> zasshi。\n② 【独立输入流】：如果促音位于句子最末尾或独立出现（如漫画中的惊叹「あぁっ！」），使用 xtsu 或 ltsu 即可直接打出单独的「っ」。',
    },
    {
      title: '拨音「ん」防翻车必读',
      content: '① 永远建议按两次【nn】：输入法中按一次 n 往往处于待定状态，连按两次【nn】是 100% 稳妥生成「ん」的工业标准打法！\n② 危险陷阱：当「ん」后方紧跟元音（a/i/u/e/o）或 ya/yu/yo 时，若只打一个 n 会被强行拼成下一个音！例如想输入「れんあい(恋爱)」，如果打 renai 会直接变成「れない」！必须输入【rennai】；想打「しんゆう(亲友)」，必须打【shinnyuu】。\n③ 也可以输入【xn】直接输出单个「ん」。',
    },
    {
      title: '长音符号「ー」与日文标点按键映射',
      content: '① 片假名长音「ー」：直接按主键盘右上角数字 0 右侧的减号键【-】（在日文输入模式下会自动输入全角长音符，切勿切换至中文输入法下按破折号）。\n② 日文句号「。」：直接按键盘句点键【.】。\n③ 日文逗号「、」：直接按键盘逗号键【,】。\n④ 日文间隔号中黑点「・」：直接按斜杠键【/】。\n⑤ 日文引号「」：直接按方括号键【[】和【]】。',
    },
    {
      title: '大神必备：F6 ~ F10 一键无缝转换神器',
      content: '打出一串假名后，无需在候选词列表翻页，直接按键盘顶部的功能键即可瞬间定型：\n• 【F6】：一键全部转换为【平假名】（如打 nihon 按 F6 变 にほん）\n• 【F7】：一键全部转换为【全角片假名】（外来语神器！如打 tokyo 按 F7 变 トウキョウ）\n• 【F8】：一键全部转换为【半角片假名】（如 ﾄｳｷｮｳ）\n• 【F9】：一键转换为【全角英数】（如 ｎｉｈｏｎ）\n• 【F10】：一键转换为【半角英数/小写大写轮换】（直接把输错的内容切回英文，不用删掉重打！）',
    },
  ],

  // 常见假名多重击键对照表
  multiKeyKana: [
    { kana: 'し / シ', default: 'shi', alternatives: ['si'], note: '日本训令式常用 si，两键更快' },
    { kana: 'ち / チ', default: 'chi', alternatives: ['ti'], note: 'ti 更省手指距离' },
    { kana: 'つ / ツ', default: 'tsu', alternatives: ['tu'], note: 'tu 仅需敲两键，极力推荐！' },
    { kana: 'ふ / フ', default: 'fu', alternatives: ['hu'], note: 'hu 或 fu 皆可' },
    { kana: 'じ / ジ', default: 'ji', alternatives: ['zi'], note: 'zi 为训令式' },
    { kana: 'ぢ / ヂ', default: 'ji', alternatives: ['di'], note: '若与じ区分推荐打 di' },
    { kana: 'づ / ヅ', default: 'zu', alternatives: ['du'], note: '若与ず区分推荐打 du' },
    { kana: 'しゃ / シャ', default: 'sha', alternatives: ['sya'], note: 'sya 打法整齐' },
    { kana: 'ちゃ / チャ', default: 'cha', alternatives: ['tya'], note: 'tya 方便快速' },
    { kana: 'じゃ / ジャ', default: 'ja', alternatives: ['zya', 'jya'], note: '打 ja 键数最少' },
    { kana: 'を / ヲ', default: 'wo', alternatives: [], note: '输入法中必须打 wo 才能出来！' },
    { kana: 'ん / ン', default: 'nn', alternatives: ['xn', "n'"], note: '稳妥首推 nn' },
    { kana: 'っ / ッ', default: '双写后继辅音', alternatives: ['xtsu', 'ltsu', 'xtu', 'ltu'], note: '词中双写辅音，单字打 xtsu' },
  ],

  // 外来语特殊假名打法速查
  specialLoanwords: [
    { kana: 'ティ', keystrokes: 'ti 或 thi', example: 'パーティー (party)', tip: '推荐打 ti' },
    { kana: 'ディ', keystrokes: 'di 或 dhi', example: 'ディズニー (Disney)', tip: '推荐打 di' },
    { kana: 'デュ', keystrokes: 'dhu 或 de+xyu', example: 'デュエット (duet)', tip: '推荐打 dhu' },
    { kana: 'ファ', keystrokes: 'fa', example: 'ファイル (file)', tip: '直接敲 fa' },
    { kana: 'フィ', keystrokes: 'fi', example: 'フィクション (fiction)', tip: '直接敲 fi' },
    { kana: 'フェ', keystrokes: 'fe', example: 'カフェ (cafe)', tip: '直接敲 fe' },
    { kana: 'フォ', keystrokes: 'fo', example: 'フォント (font)', tip: '直接敲 fo' },
    { kana: 'ウィ', keystrokes: 'wi 或 whi', example: 'ウィスキー (whisky)', tip: '打 wi 最快' },
    { kana: 'ウェ', keystrokes: 'we 或 whe', example: 'ウェブ (web)', tip: '打 we 最快' },
    { kana: 'ウォ', keystrokes: 'who 或 u+xo', example: 'ウォーター (water)', tip: '打 who 最省事' },
    { kana: 'シェ', keystrokes: 'she 或 sye', example: 'シェフ (chef)', tip: '打 she' },
    { kana: 'チェ', keystrokes: 'che 或 tye', example: 'チェック (check)', tip: '打 che' },
    { kana: 'ジェ', keystrokes: 'je 或 zye', example: 'ジャケット (jacket)', tip: '打 je' },
    { kana: 'ヴァ', keystrokes: 'va', example: 'ヴァイオリン (violin)', tip: '直接敲 va' },
    { kana: 'ヴィ', keystrokes: 'vi', example: 'ヴィーナス (Venus)', tip: '直接敲 vi' },
    { kana: 'ヴ',   keystrokes: 'vu', example: 'ヴ (vu 浊音)', tip: '直接敲 vu' },
    { kana: 'ヴェ', keystrokes: 've', example: 'ヴェネツィア (Venice)', tip: '直接敲 ve' },
    { kana: 'ヴォ', keystrokes: 'vo', example: 'ヴォーカル (vocal)', tip: '直接敲 vo' },
    { kana: 'トゥ', keystrokes: 'twu 或 to+xu', example: 'トゥルー (true)', tip: '打 twu' },
    { kana: 'ドゥ', keystrokes: 'dwu 或 do+xu', example: 'ドゥ (do)', tip: '打 dwu' },
  ],
};

/** 互动打字练兵场预设题目库 */
export const TYPING_DRILL_PRESETS: import('../types').TypingDrillItem[] = [
  // basic
  { id: 'b1', word: 'あい', reading: 'あい', kanjiMeaning: '爱 / 喜欢', validKeys: ['ai'], category: 'basic', tip: '基本元音连续敲击 a -> i' },
  { id: 'b2', word: 'さくら', reading: 'さくら', kanjiMeaning: '樱花', validKeys: ['sakura'], category: 'basic', tip: '清音连击 sa -> ku -> ra' },
  { id: 'b3', word: 'すし', reading: 'すし', kanjiMeaning: '寿司', validKeys: ['sushi', 'susi'], category: 'basic', tip: 'shi 或 si 皆可' },
  { id: 'b4', word: 'ふじさん', reading: 'ふじさん', kanjiMeaning: '富士山', validKeys: ['fujisan', 'fuzisan', 'hujisan', 'huzisan'], category: 'basic', tip: 'fu/hu 与 ji/zi 均可，末尾加 nn' },
  { id: 'b5', word: 'ともだち', reading: 'ともだち', kanjiMeaning: '朋友', validKeys: ['tomodachi', 'tomodati'], category: 'basic', tip: 'chi 或 ti 均可' },

  // yoon (拗音专项)
  { id: 'y1', word: 'きょう', reading: 'きょう', kanjiMeaning: '今天', validKeys: ['kyou', 'kyo-u'], category: 'yoon', tip: 'ky + o + u 快速打出' },
  { id: 'y2', word: 'しゃしん', reading: 'しゃしん', kanjiMeaning: '照片', validKeys: ['shashin', 'syasin', 'shasinn', 'syasinn'], category: 'yoon', tip: 'sha 亦可敲 sya，shin 敲两次 n 稳妥' },
  { id: 'y3', word: 'おちゃ', reading: 'おちゃ', kanjiMeaning: '茶水', validKeys: ['ocha', 'otya'], category: 'yoon', tip: 'cha 或 tya 皆可' },
  { id: 'y4', word: 'じゅぎょう', reading: 'じゅぎょう', kanjiMeaning: '授课/上课', validKeys: ['jugyou', 'zyugyou'], category: 'yoon', tip: 'ju+gyo+u 两个拗音连击' },
  { id: 'y5', word: 'びょういん', reading: 'びょういん', kanjiMeaning: '医院', validKeys: ['byouin', 'byouinn'], category: 'yoon', tip: 'byo + u + i + nn' },
  { id: 'y6', word: 'りょこう', reading: 'りょこう', kanjiMeaning: '旅行', validKeys: ['ryokou'], category: 'yoon', tip: 'ryo + ko + u' },

  // sokuon & hatsuon (促音拨音避坑专项)
  { id: 's1', word: 'きって', reading: 'きって', kanjiMeaning: '邮票', validKeys: ['kitte', 'kixtsute', 'kiltsute'], category: 'sokuon', tip: '重点推荐：双写辅音 t 连打 kitte！' },
  { id: 's2', word: 'がっこう', reading: 'がっこう', kanjiMeaning: '学校', validKeys: ['gakkou', 'gaxtsukou', 'galtsukou'], category: 'sokuon', tip: '双写辅音 k 连打 gakkou' },
  { id: 's3', word: 'れんあい', reading: 'れんあい', kanjiMeaning: '恋爱 (避坑必练!)', validKeys: ['rennai', 'ren-ai', 'renxnai'], category: 'sokuon', tip: '高危词！必须连打 nn，输入 rennai，只打 renai 会变成“れない”！' },
  { id: 's4', word: 'しんゆう', reading: 'しんゆう', kanjiMeaning: '挚友/亲友', validKeys: ['shinnyuu', 'synnyuu', 'sinnyuu'], category: 'sokuon', tip: '必须连按两次 n (shinnyuu)，否则会变成 しにゅう！' },
  { id: 's5', word: 'ざっし', reading: 'ざっし', kanjiMeaning: '杂志', validKeys: ['zasshi', 'zassi', 'zaxtsushi'], category: 'sokuon', tip: '双写 s，打 zasshi 或 zassi' },

  // katakana (外来语与特殊音专项)
  { id: 'k1', word: 'コーヒー', reading: 'コーヒー', kanjiMeaning: '咖啡', validKeys: ['ko-hi-', 'koohii'], category: 'katakana', tip: '长音符用减号键「-」敲出：ko-hi-' },
  { id: 'k2', word: 'パーティー', reading: 'パーティー', kanjiMeaning: '聚会/派对', validKeys: ['pa-ti-', 'pa-thi-'], category: 'katakana', tip: '特殊假名 ティ 直接打 ti 或 thi，连带长音 pa-ti-' },
  { id: 'k3', word: 'カフェ', reading: 'カフェ', kanjiMeaning: '咖啡馆', validKeys: ['kafe', 'cafe'], category: 'katakana', tip: '特殊假名 フェ 直接打 fe' },
  { id: 'k4', word: 'ディズニー', reading: 'ディズニー', kanjiMeaning: '迪士尼', validKeys: ['dizuni-', 'dizunii', 'disuni-'], category: 'katakana', tip: '特殊假名 ディ 直接打 di，接着打 zu -> ni -> -' },
  { id: 'k5', word: 'ウェブサイト', reading: 'ウェブサイト', kanjiMeaning: '互联网站', validKeys: ['webusaito'], category: 'katakana', tip: '特殊假名 ウェ 直接打 we' },

  // daily (高频日常会话词)
  { id: 'd1', word: 'ありがとう', reading: 'ありがとう', kanjiMeaning: '非常感谢', validKeys: ['arigatou'], category: 'daily', tip: '连贯输入 a-ri-ga-to-u' },
  { id: 'd2', word: 'すみません', reading: 'すみません', kanjiMeaning: '不好意思 / 借过', validKeys: ['sumimasen', 'sumimasenn'], category: 'daily', tip: 'su-mi-ma-se-nn' },
  { id: 'd3', word: 'だいじょうぶ', reading: 'だいじょうぶ', kanjiMeaning: '没关系 / 没问题', validKeys: ['daijoubu', 'daizyoubu'], category: 'daily', tip: 'dai-jo-u-bu' },
  { id: 'd4', word: 'ちょっとまって', reading: 'ちょっとまって', kanjiMeaning: '稍微等一下', validKeys: ['chottomatte', 'tyottomatte'], category: 'daily', tip: '双促音连贯敲击：chotto + matte' },
];

