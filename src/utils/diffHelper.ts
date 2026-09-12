// Diff calculation helper for Japanese sentences in correction cards
// Highlights only the erroneous parts in "original" compared to "corrected"

export interface DiffSegment {
  text: string;
  isError: boolean;
}

const PARTICLES = new Set(['は', 'が', 'を', 'に', 'へ', 'で', 'と', 'も', 'か', 'ね', 'よ', 'から', 'まで', 'より']);

function cleanOrphanBrackets(text: string): string {
  if (!text) return '';
  return text.replace(/\[\d+\]/g, '');
}

interface CorrectedToken {
  surface: string;
  reading?: string;
  isRuby?: boolean;
  isPlain?: boolean;
  isSpace?: boolean;
  isPunct?: boolean;
}

function tokenizeCorrected(text: string): CorrectedToken[] {
  const cleaned = cleanOrphanBrackets(text);
  const rubyRegex = /([一-龯々〆ヵヶぁ-んァ-ヶーa-zA-Z0-9]+)\[([ぁ-んァ-ヶー]+)(?:\|(\d+))?\]/g;
  const rawTokens: { text?: string; surface?: string; reading?: string; isRuby: boolean }[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = rubyRegex.exec(cleaned)) !== null) {
    if (match.index > lastIndex) {
      rawTokens.push({ text: cleaned.substring(lastIndex, match.index), isRuby: false });
    }
    rawTokens.push({
      surface: match[1],
      reading: match[2],
      isRuby: true,
    });
    lastIndex = rubyRegex.lastIndex;
  }

  if (lastIndex < cleaned.length) {
    rawTokens.push({ text: cleaned.substring(lastIndex), isRuby: false });
  }

  const tokens: CorrectedToken[] = [];
  for (const rt of rawTokens) {
    if (rt.isRuby && rt.surface && rt.reading) {
      tokens.push({
        surface: rt.surface,
        reading: rt.reading,
        isRuby: true,
      });
    } else if (rt.text) {
      const parts = rt.text.split(/([、，。！？!?；;:：\s]+)/g);
      for (const part of parts) {
        if (!part) continue;
        if (/^[\s]+$/.test(part)) {
          tokens.push({ surface: part, reading: part, isSpace: true });
        } else if (/^[、，。！？!?；;:：]+$/.test(part)) {
          tokens.push({ surface: part, reading: part, isPunct: true });
        } else {
          const morphChunks = part.split(/([一-龯々〆]+|[ぁ-んー]+|[ァ-ヶー]+|[a-zA-Z0-9]+)/g);
          for (const chunk of morphChunks) {
            if (!chunk) continue;
            tokens.push({ surface: chunk, reading: chunk, isPlain: true });
          }
        }
      }
    }
  }

  return tokens;
}

interface OrigUnit {
  raw: string;
  surface: string;
  reading?: string;
}

/**
 * Computes difference segments between the original sentence and the corrected sentence.
 * Erroneous/deleted parts in `original` are marked with `isError: true`.
 */
export function computeCorrectionDiff(original: string, corrected?: string): DiffSegment[] {
  if (!original) return [];
  if (!corrected) {
    return [{ text: original, isError: false }];
  }

  // Parse original into atomic visual units while preserving ruby annotations if present
  const rubyRegex = /([一-龯々〆ヵヶぁ-んァ-ヶーa-zA-Z0-9]+)\[([ぁ-んァ-ヶー]+)(?:\|(\d+))?\]/g;
  const origUnits: OrigUnit[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;

  while ((m = rubyRegex.exec(original)) !== null) {
    if (m.index > lastIdx) {
      const plain = original.substring(lastIdx, m.index);
      for (const char of plain) {
        origUnits.push({ raw: char, surface: char, reading: char });
      }
    }
    origUnits.push({
      raw: m[0],
      surface: m[1],
      reading: m[2],
    });
    lastIdx = rubyRegex.lastIndex;
  }

  if (lastIdx < original.length) {
    const plain = original.substring(lastIdx);
    for (const char of plain) {
      origUnits.push({ raw: char, surface: char, reading: char });
    }
  }

  const corrTokens = tokenizeCorrected(corrected);
  const M = origUnits.length;
  const N = corrTokens.length;

  interface DpResult {
    score: number;
    matches: { origStart: number; origEnd: number; cand: string }[];
  }

  const memo = new Map<string, DpResult>();

  function solve(i: number, j: number): DpResult {
    if (i >= M) {
      return { score: 0, matches: [] };
    }
    const key = `${i},${j}`;
    const cached = memo.get(key);
    if (cached) return cached;

    let best: DpResult = { score: -Infinity, matches: [] };

    // Option A: Skip original character (marked as error)
    const isOrigSpace = /^[\s]+$/.test(origUnits[i].surface);
    const skipOrig = solve(i + 1, j);
    const skipScore = isOrigSpace ? skipOrig.score : skipOrig.score - 0.5;
    if (skipScore > best.score) {
      best = { score: skipScore, matches: skipOrig.matches };
    }

    if (j < N) {
      const token = corrTokens[j];

      // Option B: Skip token in corrected
      const skipTokenCost = (token.isSpace || token.isPunct) ? 0 : -0.01;
      const skipToken = solve(i, j + 1);
      if (skipToken.score + skipTokenCost > best.score) {
        best = { score: skipToken.score + skipTokenCost, matches: skipToken.matches };
      }

      // Option C: Match token starting at origUnits[i]
      const candidates: string[] = [];
      if (token.surface) candidates.push(token.surface);
      if (token.reading && token.reading !== token.surface) candidates.push(token.reading);

      for (const cand of candidates) {
        let matchUnitsCount = 0;
        let candIdx = 0;

        for (let u = i; u < M && candIdx < cand.length; u++) {
          const unit = origUnits[u];
          if (cand.startsWith(unit.surface, candIdx)) {
            candIdx += unit.surface.length;
            matchUnitsCount++;
          } else if (unit.reading && cand.startsWith(unit.reading, candIdx)) {
            candIdx += unit.reading.length;
            matchUnitsCount++;
          } else {
            break;
          }
        }

        if (candIdx === cand.length && matchUnitsCount > 0) {
          const res = solve(i + matchUnitsCount, j + 1);
          const score = res.score + cand.length * 10;
          if (score > best.score) {
            best = {
              score,
              matches: [{ origStart: i, origEnd: i + matchUnitsCount, cand }, ...res.matches],
            };
          }
        }
      }

      // Single-unit match for plain tokens
      if (token.isPlain && token.surface.length > 0) {
        const u = origUnits[i];
        if (token.surface === u.surface || token.surface.startsWith(u.surface)) {
          const res = solve(i + 1, j + (token.surface.length === u.surface.length ? 1 : 0));
          const score = res.score + u.surface.length * 8;
          if (score > best.score) {
            best = {
              score,
              matches: [{ origStart: i, origEnd: i + 1, cand: u.surface }, ...res.matches],
            };
          }
        }
      }
    }

    memo.set(key, best);
    return best;
  }

  const result = solve(0, 0);

  const isUnitError = new Array<boolean>(M).fill(true);
  for (const m of result.matches) {
    for (let k = m.origStart; k < m.origEnd; k++) {
      isUnitError[k] = false;
    }
  }

  // Cleanup 1: If an isolated matched segment is only 1 single kana char (and not a known particle)
  // surrounded by errors or edges, treat it as an accidental character match and mark it as error.
  let runStart = -1;
  for (let k = 0; k <= M; k++) {
    if (k < M && !isUnitError[k]) {
      if (runStart === -1) runStart = k;
    } else {
      if (runStart !== -1) {
        const runLen = k - runStart;
        if (runLen === 1) {
          const text = origUnits[runStart].surface;
          const isKana = /^[ぁ-んァ-ヶ]$/.test(text);
          const isParticle = PARTICLES.has(text);
          if (isKana && !isParticle) {
            const prevError = runStart === 0 || isUnitError[runStart - 1];
            const nextError = k === M || isUnitError[k];
            if (prevError && nextError) {
              isUnitError[runStart] = true;
            }
          }
        }
        runStart = -1;
      }
    }
  }

  // Cleanup 2: If a short suffix (<= 2 chars of kana, e.g. "した") at the end of the sentence
  // is immediately preceded by an error block (e.g. "会ったでした" vs "会いました"),
  // merge it into the error block so the whole inflected ending is struck through.
  if (M >= 3 && !isUnitError[M - 1]) {
    let suffixLen = 0;
    for (let k = M - 1; k >= 0; k--) {
      if (!isUnitError[k]) {
        suffixLen++;
      } else {
        break;
      }
    }
    if (suffixLen > 0 && suffixLen <= 2) {
      const suffixText = origUnits.slice(M - suffixLen).map((u) => u.surface).join('');
      if (/^[ぁ-ん]+$/.test(suffixText)) {
        for (let k = M - suffixLen; k < M; k++) {
          isUnitError[k] = true;
        }
      }
    }
  }

  // Group contiguous segments in original raw text
  const segments: DiffSegment[] = [];
  let currText = '';
  let currError = isUnitError[0];

  for (let k = 0; k < M; k++) {
    // Preserve whitespace
    if (/^\s+$/.test(origUnits[k].surface)) {
      currText += origUnits[k].raw;
      continue;
    }

    if (isUnitError[k] === currError) {
      currText += origUnits[k].raw;
    } else {
      if (currText) segments.push({ text: currText, isError: currError });
      currText = origUnits[k].raw;
      currError = isUnitError[k];
    }
  }
  if (currText) {
    segments.push({ text: currText, isError: currError });
  }

  return segments;
}
