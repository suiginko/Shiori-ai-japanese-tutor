import React from 'react';
import { splitStemAndOkurigana } from '../../utils/rubyParser';

export interface FuriganaTitleProps {
  surface: string;
  reading?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * 振假名标题组件：
 * 将日文单词（无论是否含送假名，如 "少し"、"本当"、"食べる"）精准渲染为上标振假名格式，
 * 代替原本在词后附加的【假名】整体注音，实现与正统日语词典一致的专业排版。
 */
export const FuriganaTitle: React.FC<FuriganaTitleProps> = ({
  surface,
  reading,
  className = '',
  style,
}) => {
  if (!surface) return null;

  const hasKanji = /[一-龯々〆]/.test(surface);

  // 若无汉字、或无读音、或读音与表面词一致（纯假名词如 "カレー"），直接渲染原词
  if (!hasKanji || !reading || reading === surface) {
    return (
      <span className={`furigana-title-wrap ${className}`} style={style}>
        <span className="furigana-title-base">{surface}</span>
      </span>
    );
  }

  // 智能拆分词干与送假名（如 "少し" / "すこし" -> 少[すこ] + し；"本当" / "ほんとう" -> 本当[ほんとう]）
  const split = splitStemAndOkurigana(surface, reading);

  return (
    <span className={`furigana-title-wrap ${className}`} style={style}>
      <ruby className="furigana-title-ruby">
        <span className="furigana-title-kanji">{split.surface}</span>
        <rt className="furigana-title-rt">{split.reading}</rt>
      </ruby>
      {split.okurigana && (
        <span className="furigana-title-okurigana">{split.okurigana}</span>
      )}
    </span>
  );
};
