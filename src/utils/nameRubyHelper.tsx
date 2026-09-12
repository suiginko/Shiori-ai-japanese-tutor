import React from 'react';
import { setGlobalCustomNameReadings, CustomNameEntry } from './rubyParser';

/**
 * 剥除名字或文本中的所有注音标记
 * 例如："{高咲[たかさき]}{侑[ゆう]}" -> "高咲侑"
 *       "薫子[かおるこ]" -> "薫子"
 */
export function stripRubyMarkers(text?: string): string {
  if (!text) return '';
  return text
    // 剥离 {原文[读音]} 块
    .replace(/\{([^{}\[\]]+)(?:\[[^\]]*\])?\}/g, '$1')
    // 剥离 原文[读音] 形式
    .replace(/([一-龯々〆ヵヶぁ-んァ-ヶーa-zA-Z0-9]+)\[[^\]]*\]/g, '$1')
    // 剥离残留孤立的花括号
    .replace(/[{}｛｝]/g, '')
    .trim();
}

/**
 * 从可能包含注音的名字中提取简要读音（用于大模型提示词中自然告知读法，避免使用冗长输出契约）
 * 例如："{高咲[たかさき]}{侑[ゆう]}" -> "たかさき ゆう"
 *       "薫子[かおるこ]" -> "かおるこ"
 *       "李明" -> ""
 */
export function extractFullReading(text?: string): string {
  if (!text) return '';
  const readings: string[] = [];
  const regex = /\[\s*([ぁ-んァ-ヶー]+)(?:\|\d+)?\s*\]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match[1]) readings.push(match[1]);
  }
  return readings.join(' ');
}

/**
 * 获取名称的首字符（用于头像徽章），安全剥除注音符号，避免取到 "{" 或 "[" 等系统符号
 */
export function getNameInitial(name?: string, fallback: string = '日'): string {
  if (!name) return fallback;
  const clean = stripRubyMarkers(name);
  if (!clean) return fallback;
  const firstCharMatch = clean.match(/[一-龯々〆ヵヶぁ-んァ-ヶーa-zA-Z0-9]/);
  return firstCharMatch ? firstCharMatch[0] : clean.slice(0, 1);
}

/**
 * 从文本（双方名字输入框、私教人设等）中解析出所有汉字与读音映射：
 * 精巧支持子单元记录（如 "高咲侑" 记录子单元 "高咲"->"たかさき" 和 "侑"->"ゆう"）
 * 这样前端在渲染整名时可实现按字切分对齐的极致注音排版。
 */
export function extractRubyNameMappings(
  ...sources: (string | undefined)[]
): Map<string, CustomNameEntry> {
  const map = new Map<string, CustomNameEntry>();

  for (const source of sources) {
    if (!source) continue;

    // 匹配花括号注音块 {汉字[读音]} 或 普通方括号 汉字[读音]
    const blockRegex = /\{?\s*([一-龯々〆ヵヶ]+)\s*\[\s*([ぁ-んァ-ヶー]+)(?:\|\d+)?\s*\]\s*\}?/g;
    let match: RegExpExecArray | null;

    let currentSequenceKanji = '';
    let currentSequenceReading = '';
    let currentSubUnits: Array<{ surface: string; reading: string }> = [];
    let lastMatchEnd = -1;

    while ((match = blockRegex.exec(source)) !== null) {
      const kanji = match[1];
      const reading = match[2];
      const matchStart = match.index;
      const matchEnd = blockRegex.lastIndex;

      // 登记单个汉字块
      map.set(kanji, { reading });

      // 判断是否与上一块紧邻（中间仅有空格、空字符串或闭合/打开括号）
      const gap = source.slice(lastMatchEnd === -1 ? matchStart : lastMatchEnd, matchStart);
      const isContiguous = lastMatchEnd !== -1 && /^[\s{}｛｝]*$/.test(gap);

      if (isContiguous) {
        currentSequenceKanji += kanji;
        currentSequenceReading += reading;
        currentSubUnits.push({ surface: kanji, reading });
        map.set(currentSequenceKanji, {
          reading: currentSequenceReading,
          subUnits: [...currentSubUnits],
        });
      } else {
        currentSequenceKanji = kanji;
        currentSequenceReading = reading;
        currentSubUnits = [{ surface: kanji, reading }];
      }

      lastMatchEnd = matchEnd;
    }
  }

  return map;
}

/**
 * 依据当前设置（私教名字、用户名字、私教人设）同步注音解析器的全局人名读音字典与未注音名字集合
 */
export function syncNameRubyFromSettings(settings?: {
  aiTutorName?: string;
  userName?: string;
  aiPersona?: string;
}) {
  if (!settings) return;
  const mappings = extractRubyNameMappings(
    settings.aiTutorName,
    settings.userName,
    settings.aiPersona
  );

  // 收集没有特意添加注音格式的双方名字（若含有汉字），用于在对话中抑制自动注音
  const unannotatedNames = new Set<string>();
  if (settings.aiTutorName && !hasRubyAnnotation(settings.aiTutorName)) {
    const cleanTutor = stripRubyMarkers(settings.aiTutorName);
    if (cleanTutor && /[一-龯々〆]/.test(cleanTutor)) {
      unannotatedNames.add(cleanTutor);
    }
  }
  if (settings.userName && !hasRubyAnnotation(settings.userName)) {
    const cleanUser = stripRubyMarkers(settings.userName);
    if (cleanUser && /[一-龯々〆]/.test(cleanUser)) {
      unannotatedNames.add(cleanUser);
    }
  }

  setGlobalCustomNameReadings(mappings, unannotatedNames);
}

/**
 * 检查字符串是否含有注音标记（如 {高咲[たかさき]} 或 高咲[たかさき]）
 */
export function hasRubyAnnotation(text?: string): boolean {
  if (!text) return false;
  return /\{?\s*[一-龯々〆ヵヶぁ-んァ-ヶーa-zA-Z0-9]+\s*\[\s*[ぁ-んァ-ヶー]+(?:\|\d+)?\s*\]\s*\}?/.test(text);
}

/**
 * 在消息气泡或界面上渲染附带注音的名字组件
 */
export const NameWithRuby: React.FC<{ text?: string; className?: string }> = ({
  text,
  className,
}) => {
  if (!text) return null;
  if (!hasRubyAnnotation(text)) {
    return <span className={className}>{text}</span>;
  }

  const regex = /\{?\s*([一-龯々〆ヵヶぁ-んァ-ヶーa-zA-Z0-9]+)\s*\[\s*([ぁ-んァ-ヶー]+)(?:\|\d+)?\s*\]\s*\}?/g;
  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIndex = 0;

  while ((match = regex.exec(text)) !== null) {
    const matchStart = match.index;
    const matchEnd = regex.lastIndex;

    if (matchStart > lastIndex) {
      const plain = text.slice(lastIndex, matchStart).replace(/[{}｛｝]/g, '');
      if (plain) {
        elements.push(<span key={`plain-${keyIndex++}`}>{plain}</span>);
      }
    }

    const kanji = match[1];
    const reading = match[2];
    elements.push(
      <ruby key={`ruby-${keyIndex++}`} className="name-ruby-item">
        {kanji}
        <rt>{reading}</rt>
      </ruby>
    );

    lastIndex = matchEnd;
  }

  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex).replace(/[{}｛｝]/g, '');
    if (remaining) {
      elements.push(<span key={`plain-${keyIndex++}`}>{remaining}</span>);
    }
  }

  return <span className={`name-with-ruby-container ${className || ''}`}>{elements}</span>;
};
