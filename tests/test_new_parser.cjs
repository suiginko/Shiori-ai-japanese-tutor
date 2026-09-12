const fs = require('fs');
const ts = require('typescript');

function requireTs(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  const js = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const m = { exports: {} };
  const fn = new Function('require', 'module', 'exports', '__dirname', '__filename', js);
  fn((id) => {
    if (id.startsWith('.')) {
      const p = require('path').resolve(require('path').dirname(filePath), id);
      return requireTs(fs.existsSync(p + '.ts') ? p + '.ts' : p);
    }
    return require(id);
  }, m, m.exports, require('path').dirname(filePath), filePath);
  return m.exports;
}

const { CORE_JUKUGO_DICT, deriveJukugoReading, isAllKanji } = requireTs('./src/utils/kanjiJukugoData.ts');
const { DICT_BY_WORD } = requireTs('./src/data/dictionaryData.ts');
const { deinflect } = requireTs('./src/utils/deinflector.ts');
const { COMMON_PITCH_DICT } = requireTs('./src/utils/pitchAccentData.ts');

const segmenter = new Intl.Segmenter('ja', { granularity: 'word' });

function testSegment(text) {
  const tokens = [];
  const segments = [...segmenter.segment(text)].map(s => s.segment);
  
  for (const seg of segments) {
    if (/^[\s、。！？!?,.:;…~「」『』()（）\[\]\d+a-zA-Z\-_]+$/.test(seg)) {
      tokens.push({ type: 'text', surface: seg });
      continue;
    }

    const hasKanji = /[一-龯々〆]/.test(seg);
    if (!hasKanji) {
      tokens.push({ type: 'plain-word', surface: seg, isPureKana: true });
      continue;
    }

    // Has kanji
    const dictItem = DICT_BY_WORD.get(seg) || CORE_JUKUGO_DICT[seg] || COMMON_PITCH_DICT[seg];
    if (dictItem) {
      tokens.push({
        type: 'plain-word',
        surface: seg,
        reading: dictItem.reading,
        fullWord: seg,
        fullReading: dictItem.reading
      });
      continue;
    }

    // Deinflect
    const deinflected = deinflect(seg);
    const valid = deinflected.find(d => DICT_BY_WORD.has(d.lemma) || CORE_JUKUGO_DICT[d.lemma]);
    if (valid) {
      const base = DICT_BY_WORD.get(valid.lemma) || CORE_JUKUGO_DICT[valid.lemma];
      tokens.push({
        type: 'plain-word',
        surface: seg,
        lemma: valid.lemma,
        reading: base.reading
      });
      continue;
    }

    // Jukugo guard
    if (isAllKanji(seg) && seg.length >= 2) {
      const derived = deriveJukugoReading(seg);
      if (derived) {
        tokens.push({
          type: 'plain-word',
          surface: seg,
          reading: derived.reading
        });
        continue;
      }
    }

    tokens.push({ type: 'text', surface: seg });
  }

  return tokens;
}

console.log('Test 心配しないでください:');
console.log(testSegment('心配しないでください。'));

console.log('\nTest ぜひ教えてください:');
console.log(testSegment('ぜひ教えてください。'));

console.log('\nTest ぜひ教[ぜひおしえ]てください (bracket handling):');
