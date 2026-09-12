import { DICT_BY_WORD } from './src/data/dictionaryData';
import { deinflect } from './src/utils/deinflector';

console.log('DICT_BY_WORD has で:', DICT_BY_WORD.has('で'));
console.log('DICT_BY_WORD has よく:', DICT_BY_WORD.has('よく'));
console.log('DICT_BY_WORD has 使う:', DICT_BY_WORD.has('使う'));
console.log('DICT_BY_WORD has 会話:', DICT_BY_WORD.has('会話'));
console.log('DICT_BY_WORD has 日常:', DICT_BY_WORD.has('日常'));
console.log('DICT_BY_WORD has 表現:', DICT_BY_WORD.has('表現'));
console.log('DICT_BY_WORD has です:', DICT_BY_WORD.has('です'));
console.log('DICT_BY_WORD has 本当:', DICT_BY_WORD.has('本当'));
