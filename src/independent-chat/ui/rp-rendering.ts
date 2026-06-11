/**
 * 大注释：RP rendering helpers.
 * Converts long-RP text into PalTavern's narration/dialogue reading units without copying any external plugin UI.
 */

export type RpRenderSegmentKind = 'narration' | 'dialogue' | 'thought';

export interface RpRenderSegment {
  kind: RpRenderSegmentKind;
  speaker?: string;
  emotion?: string;
  text: string;
}

export interface RpRenderParseOptions {
  fallbackSpeaker: string;
  fallbackEmotion: string;
  plainTextMode?: 'narration' | 'dialogue';
}

const BUBBLE_LINE_PATTERN = /^@bubble:([^|\n]+)\|([^|\n]+)\|(?:\[(.*)\]|(.+))$/;

function cleanText(value: string): string {
  return value.replace(/\r/g, '').trim();
}

function stripThoughtMarks(value: string): { text: string; thought: boolean } {
  const text = cleanText(value);
  // 小注释：外层 *...* 表示内心活动；正文内部的星号不强行解释。
  if (text.startsWith('*') && text.endsWith('*') && text.length >= 2) {
    return { text: cleanText(text.slice(1, -1)), thought: true };
  }
  return { text, thought: false };
}

export function parseRpRenderSegments(content: string, options: RpRenderParseOptions): RpRenderSegment[] {
  const fallbackSpeaker = cleanText(options.fallbackSpeaker) || '角色';
  const fallbackEmotion = cleanText(options.fallbackEmotion) || '日常';
  const plainTextMode = options.plainTextMode ?? 'narration';
  const segments: RpRenderSegment[] = [];
  let narrationBuffer: string[] = [];

  const flushNarration = () => {
    const text = cleanText(narrationBuffer.join('\n'));
    narrationBuffer = [];
    if (!text) return;
    if (plainTextMode === 'dialogue' && segments.length === 0) {
      segments.push({ kind: 'dialogue', speaker: fallbackSpeaker, emotion: fallbackEmotion, text });
      return;
    }
    segments.push({ kind: 'narration', text });
  };

  for (const rawLine of content.split('\n')) {
    const line = cleanText(rawLine);
    if (!line) {
      flushNarration();
      continue;
    }
    const bubbleMatch = line.match(BUBBLE_LINE_PATTERN);
    if (!bubbleMatch) {
      narrationBuffer.push(line);
      continue;
    }
    flushNarration();
    const speaker = cleanText(bubbleMatch[1]) || fallbackSpeaker;
    const emotion = cleanText(bubbleMatch[2]) || fallbackEmotion;
    // 小注释：模型有时会省略方括号，仍然要当作气泡解析，不能把 @bubble 标记露给用户。
    const thought = stripThoughtMarks(bubbleMatch[3] ?? bubbleMatch[4] ?? '');
    if (!thought.text) continue;
    segments.push({
      kind: thought.thought ? 'thought' : 'dialogue',
      speaker,
      emotion,
      text: thought.text,
    });
  }

  flushNarration();
  if (segments.length === 0 && cleanText(content)) {
    segments.push({
      kind: plainTextMode === 'dialogue' ? 'dialogue' : 'narration',
      speaker: plainTextMode === 'dialogue' ? fallbackSpeaker : undefined,
      emotion: plainTextMode === 'dialogue' ? fallbackEmotion : undefined,
      text: cleanText(content),
    });
  }
  return segments;
}
