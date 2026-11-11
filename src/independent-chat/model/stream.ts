/**
 * 大注释：流式回复解析。
 * 请求带 stream: true 时，兼容 OpenAI 的接口会用 SSE（一行行 "data: {...}"）分段返回正文。
 * 这里把分段拼回完整文本，并在每段到达时回调当前累计的文本，界面就能边收边显示。
 * 接口不支持流式、直接回了普通 JSON，或者安卓原生网络层把整段响应一次性交回来时，也都能正常解析。
 */
import { firstString, isRecord } from '../core/utils';

export type CompletionReadResult =
  | { kind: 'text'; text: string }
  | { kind: 'json'; json: Record<string, unknown> };

function partText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(partText).join('');
  if (isRecord(value)) return firstString(value.text, value.content, value.output_text) ?? '';
  return '';
}

// 小注释：只取正文增量；reasoning_content 之类的思考内容不进聊天。
export function streamChunkText(chunk: unknown): string {
  if (!isRecord(chunk)) return '';
  const first = Array.isArray(chunk.choices) ? chunk.choices[0] : undefined;
  if (!isRecord(first)) return '';
  if (isRecord(first.delta)) return partText(first.delta.content);
  if (typeof first.text === 'string') return first.text;
  if (isRecord(first.message)) return partText(first.message.content);
  return '';
}

function streamChunkError(chunk: unknown): string {
  if (!isRecord(chunk) || chunk.error === undefined || chunk.error === null) return '';
  if (typeof chunk.error === 'string') return chunk.error;
  if (isRecord(chunk.error)) return firstString(chunk.error.message, chunk.error.type) ?? '未知错误';
  return '未知错误';
}

/** 逐块喂入 SSE 文本，返回累计正文。遇到 [DONE] 后忽略后续内容。 */
export class SseCompletionAccumulator {
  private buffer = '';

  private done = false;

  text = '';

  push(chunk: string): boolean {
    if (this.done) return false;
    this.buffer += chunk;
    const events = this.buffer.split(/\r?\n\r?\n/);
    this.buffer = events.pop() ?? '';
    let changed = false;
    for (const event of events) {
      if (this.done) break;
      changed = this.consumeEvent(event) || changed;
    }
    if (this.done) this.buffer = '';
    return changed;
  }

  finish(): boolean {
    if (this.done || !this.buffer.trim()) return false;
    const rest = this.buffer;
    this.buffer = '';
    return this.consumeEvent(rest);
  }

  private consumeEvent(event: string): boolean {
    const dataLines = event.split(/\r?\n/)
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).replace(/^ /, ''));
    if (dataLines.length === 0) return false;
    // 小注释：标准做法是一个事件一段 JSON；有些中转站不空行分隔，就退回到逐行解析。
    const joined = dataLines.join('\n').trim();
    const payloads = joined === '[DONE]' || isJsonText(joined) ? [joined] : dataLines.map(line => line.trim());
    let changed = false;
    for (const payload of payloads) {
      if (!payload) continue;
      if (payload === '[DONE]') {
        this.done = true;
        break;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }
      const error = streamChunkError(parsed);
      if (error) throw new Error(`模型请求失败：${error}`);
      const delta = streamChunkText(parsed);
      if (delta) {
        this.text += delta;
        changed = true;
      }
    }
    return changed;
  }
}

function isJsonText(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

function looksLikeSse(text: string): boolean {
  return /^\s*data:/m.test(text) && !/^\s*[{[]/.test(text);
}

/**
 * 读取一次聊天补全响应。
 * 是 SSE 就边读边回调累计文本；是普通 JSON 就原样交给调用方按老逻辑取正文。
 */
export async function readChatCompletion(
  response: Response,
  onText: (text: string) => void,
): Promise<CompletionReadResult> {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  const reader = contentType.includes('text/event-stream') && response.body && typeof response.body.getReader === 'function'
    ? response.body.getReader()
    : null;
  if (reader) {
    const decoder = new TextDecoder();
    const accumulator = new SseCompletionAccumulator();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (accumulator.push(decoder.decode(value, { stream: true }))) onText(accumulator.text);
    }
    if (accumulator.push(decoder.decode()) || accumulator.finish()) onText(accumulator.text);
    return { kind: 'text', text: accumulator.text };
  }
  const raw = await response.text().catch(() => '');
  if (looksLikeSse(raw)) {
    const accumulator = new SseCompletionAccumulator();
    accumulator.push(raw);
    accumulator.finish();
    if (accumulator.text) onText(accumulator.text);
    return { kind: 'text', text: accumulator.text };
  }
  try {
    return { kind: 'json', json: JSON.parse(raw) as Record<string, unknown> };
  } catch {
    const summary = raw.replace(/\s+/g, ' ').trim().slice(0, 120);
    throw new Error(`模型接口返回的不是 JSON${summary ? `：${summary}` : ''}`);
  }
}
