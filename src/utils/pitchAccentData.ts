// Japanese mora segmentation and pitch accent line calculator
// Replicates the immersive textbook line annotation (教材式高低线标注法 / NHK发音辞典折线)

export interface MoraPitch {
  mora: string;
  isHigh: boolean;
  hasDrop: boolean; // Downward tick ┓ at the end of this mora
}

// Split kana string into moras (handling small ゃ, ゅ, ょ, etc.)
export function splitIntoMoras(reading: string): string[] {
  const moras: string[] = [];
  const smallKana = new Set(['ゃ', 'ゅ', 'ょ', 'ゎ', 'ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ', 'ャ', 'ュ', 'ョ', 'ァ', 'ィ', 'ゥ', 'ェ', 'ォ']);
  
  for (let i = 0; i < reading.length; i++) {
    const char = reading[i];
    const next = reading[i + 1];
    if (next && smallKana.has(next)) {
      moras.push(char + next);
      i++; // Skip the small kana
    } else {
      moras.push(char);
    }
  }
  return moras;
}

// Calculate pitch pattern for each mora based on Tokyo pitch accent rules
export function calculateMoraPitches(reading: string, pitchNum: number): MoraPitch[] {
  const moras = splitIntoMoras(reading);
  const m = moras.length;
  if (m === 0) return [];

  // Special case: single mora word
  if (m === 1) {
    if (pitchNum === 1) {
      return [{ mora: moras[0], isHigh: true, hasDrop: true }];
    } else {
      // 0 or unspecified
      return [{ mora: moras[0], isHigh: false, hasDrop: false }];
    }
  }

  const result: MoraPitch[] = [];

  if (pitchNum === 0) {
    // 平板型: 1st Low, 2nd onwards High (no drop)
    for (let i = 0; i < m; i++) {
      result.push({
        mora: moras[i],
        isHigh: i > 0,
        hasDrop: false,
      });
    }
  } else if (pitchNum === 1) {
    // 头高型: 1st High (drops at end of 1st), 2nd onwards Low
    for (let i = 0; i < m; i++) {
      result.push({
        mora: moras[i],
        isHigh: i === 0,
        hasDrop: i === 0,
      });
    }
  } else {
    // 中高型 / 尾高型 (pitchNum >= 2)
    // 1st Low, 2nd to pitchNum-th High, then drops!
    for (let i = 0; i < m; i++) {
      const moraIndex1Based = i + 1;
      const isHigh = moraIndex1Based > 1 && moraIndex1Based <= pitchNum;
      const hasDrop = moraIndex1Based === pitchNum;
      result.push({
        mora: moras[i],
        isHigh,
        hasDrop,
      });
    }
  }

  return result;
}

// Common dictionary for offline lookup of pitch accents when AI doesn't explicitly output them
export const COMMON_PITCH_DICT: Record<string, { reading: string; pitch: number; meaning: string; pos?: string }> = {
  // Classic homophones to avoid confusion
  '雨': { reading: 'あめ', pitch: 1, meaning: '雨 (头高型)' },
  '飴': { reading: 'あめ', pitch: 0, meaning: '糖果 (平板型)' },
  '橋': { reading: 'はし', pitch: 2, meaning: '桥 (尾高型)' },
  '箸': { reading: 'はし', pitch: 1, meaning: '筷子 (头高型)' },
  '端': { reading: 'はし', pitch: 0, meaning: '边缘 (平板型)' },
  '花': { reading: 'はな', pitch: 2, meaning: '花 (尾高型)' },
  '鼻': { reading: 'はな', pitch: 0, meaning: '鼻子 (平板型)' },
  '牡蛎': { reading: 'かき', pitch: 2, meaning: '生蚝 (尾高型)' },
  '柿': { reading: 'かき', pitch: 0, meaning: '柿子 (平板型)' },
  '垣': { reading: 'かき', pitch: 1, meaning: '篱笆 (头高型)' },
  '酒': { reading: 'さけ', pitch: 0, meaning: '酒 (平板型)' },
  '鮭': { reading: 'さけ', pitch: 1, meaning: '三文鱼 (头高型)' },
  '雲': { reading: 'くも', pitch: 1, meaning: '云 (头高型)' },
  '蜘蛛': { reading: 'くも', pitch: 2, meaning: '蜘蛛 (尾高型)' },
  '神': { reading: 'かみ', pitch: 1, meaning: '神明 (头高型)' },
  '紙': { reading: 'かみ', pitch: 2, meaning: '纸张 (尾高型)' },
  '髪': { reading: 'かみ', pitch: 2, meaning: '头发 (尾高型)' },

  // Daily high-frequency words
  '本当': { reading: 'ほんとう', pitch: 0, meaning: '真的，事实 (平板型)' },
  '最近': { reading: 'さいきん', pitch: 0, meaning: '最近，近来 (平板型)' },
  '練習': { reading: 'れんしゅう', pitch: 0, meaning: '练习 (平板型)' },
  '会話': { reading: 'かいわ', pitch: 0, meaning: '会话，谈话 (平板型)' },
  '日常': { reading: 'にちじょう', pitch: 0, meaning: '日常，平时 (平板型)' },
  '日常会話': { reading: 'にちじょうかいわ', pitch: 5, meaning: '日常会话 (中高型)' },
  '表現': { reading: 'ひょうげん', pitch: 3, meaning: '表达，用语 (中高型)' },
  '話': { reading: 'はなし', pitch: 3, meaning: '谈话，故事 (尾高型)' },
  '日本語': { reading: 'にほんご', pitch: 0, meaning: '日语 (平板型)' },
  '日本': { reading: 'にほん', pitch: 2, meaning: '日本 (中高型)' },
  '私': { reading: 'わたし', pitch: 0, meaning: '我 (平板型)' },
  '学生': { reading: 'がくせい', pitch: 0, meaning: '学生 (平板型)' },
  '先生': { reading: 'せんせい', pitch: 3, meaning: '老师 (中高型)' },
  '友達': { reading: 'ともだち', pitch: 0, meaning: '朋友 (平板型)' },
  '学校': { reading: 'がっこう', pitch: 0, meaning: '学校 (平板型)' },
  '掃除': { reading: 'そうじ', pitch: 0, meaning: '打扫，大扫除 (平板型)' },
  '洗濯': { reading: 'せんたく', pitch: 0, meaning: '洗衣服，洗涤 (平板型)' },
  '散歩': { reading: 'さんぽ', pitch: 0, meaning: '散步 (平板型)' },
  '買い物': { reading: 'かいもの', pitch: 0, meaning: '买东西，购物 (平板型)' },
  '買物': { reading: 'かいもの', pitch: 0, meaning: '买东西 (平板型)' },
  '宿題': { reading: 'しゅくだい', pitch: 0, meaning: '作业 (平板型)' },
  '運転': { reading: 'うんてん', pitch: 0, meaning: '驾驶，开车 (平板型)' },
  '勉強': { reading: 'べんきょう', pitch: 0, meaning: '学习 (平板型)' },
  '仕事': { reading: 'しごと', pitch: 0, meaning: '工作 (平板型)' },
  '今日': { reading: 'きょう', pitch: 1, meaning: '今天 (头高型)' },
  '明日': { reading: 'あした', pitch: 3, meaning: '明天 (尾高型)' },
  '昨日': { reading: 'きのう', pitch: 2, meaning: '昨天 (中高型)' },
  '時間': { reading: 'じかん', pitch: 0, meaning: '时间 (平板型)' },
  '名前': { reading: 'なまえ', pitch: 0, meaning: '名字 (平板型)' },
  '会社': { reading: 'かいしゃ', pitch: 0, meaning: '公司 (平板型)' },
  '電車': { reading: 'でんしゃ', pitch: 0, meaning: '电车 (平板型)' },
  '駅': { reading: 'えき', pitch: 1, meaning: '车站 (头高型)' },
  '店': { reading: 'みせ', pitch: 2, meaning: '商店 (尾高型)' },
  '料理': { reading: 'りょうり', pitch: 1, meaning: '料理 (头高型)' },
  '本': { reading: 'ほん', pitch: 1, meaning: '书 (头高型)' },
  '映画': { reading: 'えいが', pitch: 0, meaning: '电影 (平板型)' },
  '音楽': { reading: 'おんがく', pitch: 1, meaning: '音乐 (头高型)' },
  '写真': { reading: 'しゃしん', pitch: 0, meaning: '照片 (平板型)' },
  '何': { reading: 'なに', pitch: 1, meaning: '什么 (头高型)', pos: '代词' },
  '何か': { reading: 'なにか', pitch: 1, meaning: '某物/不知为何 (头高型)', pos: '代词' },
  '何時': { reading: 'なんじ', pitch: 1, meaning: '几点 (头高型)', pos: '代词' },
  '何人': { reading: 'なんにん', pitch: 1, meaning: '几人 (头高型)', pos: '代词' },
  '何度': { reading: 'なんど', pitch: 1, meaning: '几次/几度 (头高型)', pos: '代词' },
  '何日': { reading: 'なんにち', pitch: 1, meaning: '几号/几天 (头高型)', pos: '代词' },
  '何故': { reading: 'なぜ', pitch: 1, meaning: '为什么 (头高型)', pos: '副词' },

  '朝': { reading: 'あさ', pitch: 1, meaning: '早晨 (头高型)' },
  '昼': { reading: 'ひる', pitch: 2, meaning: '白天 (尾高型)' },
  '夜': { reading: 'よる', pitch: 1, meaning: '夜晚 (头高型)' },
  '食べる': { reading: 'たべる', pitch: 2, meaning: '吃 (中高型)' },
  '飲む': { reading: 'のむ', pitch: 1, meaning: '喝 (头高型)' },
  '行く': { reading: 'いく', pitch: 0, meaning: '去 (平板型)' },
  '来る': { reading: 'くる', pitch: 1, meaning: '来 (头高型)' },
  '見る': { reading: 'みる', pitch: 1, meaning: '看 (头高型)' },
  '聞く': { reading: 'きく', pitch: 0, meaning: '听/问 (平板型)' },
  '話す': { reading: 'はなす', pitch: 2, meaning: '说 (中高型)' },
  '書く': { reading: 'かく', pitch: 1, meaning: '写 (头高型)' },
  '買う': { reading: 'かう', pitch: 0, meaning: '买 (平板型)' },
  '高い': { reading: 'たかい', pitch: 2, meaning: '高/贵 (中高型)' },
  '安い': { reading: 'やすい', pitch: 2, meaning: '便宜 (中高型)' },
  '新しい': { reading: 'あたらしい', pitch: 4, meaning: '新 (中高型)' },
  '古い': { reading: 'ふるい', pitch: 2, meaning: '旧 (中高型)' },
  '美味しい': { reading: 'おいしい', pitch: 3, meaning: '美味 (中高型)' },
  '面白い': { reading: 'おもしろい', pitch: 4, meaning: '有趣 (中高型)' },
  '好き': { reading: 'すき', pitch: 2, meaning: '喜欢 (尾高型)' },
  '上手': { reading: 'じょうず', pitch: 3, meaning: '擅长 (尾高型)' },
  '下手': { reading: 'へた', pitch: 2, meaning: '不擅长 (尾高型)' },
  '大丈夫': { reading: 'だいじょうぶ', pitch: 3, meaning: '没关系 (中高型)' },
  '有難う': { reading: 'ありがとう', pitch: 2, meaning: '谢谢 (中高型)' },

  // Core Positional & Foundational Nouns
  '中': { reading: 'なか', pitch: 1, meaning: '里面，内部，中间 (头高型)' },
  '気': { reading: 'き', pitch: 0, meaning: '心情，精神，气息 (平板型)' },
  'やる気': { reading: 'やるき', pitch: 0, meaning: '干劲，积极性 (平板型)' },
  '上': { reading: 'うえ', pitch: 0, meaning: '上面，上方 (平板型)' },
  '下': { reading: 'した', pitch: 0, meaning: '下面，下方 (平板型)' },
  '前': { reading: 'まえ', pitch: 1, meaning: '前面，前方 (头高型)' },
  '後ろ': { reading: 'うしろ', pitch: 0, meaning: '后面，后方 (平板型)' },
  '外': { reading: 'そと', pitch: 1, meaning: '外面，室外 (头高型)' },
  '横': { reading: 'よこ', pitch: 0, meaning: '旁边，侧面 (平板型)' },
  '隣': { reading: 'となり', pitch: 0, meaning: '邻居，隔壁 (平板型)' },
  '間': { reading: 'あいだ', pitch: 0, meaning: '中间，期间 (平板型)' },
  '足': { reading: 'あし', pitch: 2, meaning: '脚，足 (尾高型)' },

  // Daily Food & Meal Nouns
  'カレー': { reading: 'かれー', pitch: 0, meaning: '咖喱 (平板型)' },
  'ご飯': { reading: 'ごはん', pitch: 1, meaning: '米饭；饭，餐 (头高型)' },
  'ごはん': { reading: 'ごはん', pitch: 1, meaning: '米饭；饭，餐 (头高型)' },
  '昼ご飯': { reading: 'ひるごはん', pitch: 3, meaning: '午饭，午餐 (中高型)' },
  '昼ごはん': { reading: 'ひるごはん', pitch: 3, meaning: '午饭，午餐 (中高型)' },
  '朝ご飯': { reading: 'あさごはん', pitch: 3, meaning: '早饭，早餐 (中高型)' },
  '晩ご飯': { reading: 'ばんごはん', pitch: 3, meaning: '晚饭，晚餐 (中高型)' },
};

import { CORE_JUKUGO_DICT } from './kanjiJukugoData';
for (const [w, item] of Object.entries(CORE_JUKUGO_DICT)) {
  if (!COMMON_PITCH_DICT[w]) {
    COMMON_PITCH_DICT[w] = {
      reading: item.reading,
      pitch: item.pitch,
      meaning: item.meaning || '',
      pos: item.pos,
    };
  }
}

