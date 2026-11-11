export {};
declare const require: (id: string) => any;

// 大注释：逐字显示回复的测试。
// 覆盖三层：SSE 分段拼接、模型请求（流式 / 退回普通请求）、私聊回复流程里的预览和最终消息。

const values = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
    removeItem(key: string) { values.delete(key); },
    clear() { values.clear(); },
  },
});

const stream = require('../src/independent-chat/model/stream');
const format = require('../src/independent-chat/chat/format');
const model = require('../src/independent-chat/model/client');
const stateModule = require('../src/independent-chat/core/state');

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function sseEvent(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
}

function sseResponse(chunks: string[], init: ResponseInit = {}): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach(chunk => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' }, ...init });
}

function assertAccumulator(): void {
  const acc = new stream.SseCompletionAccumulator();
  const whole = `${sseEvent('你')}${sseEvent('好')}: keep-alive\n\n${sseEvent('呀')}data: [DONE]\n\n${sseEvent('不该出现')}`;
  // 小注释：故意从一行中间切开，模拟网络分包。
  const cut = whole.indexOf('好') + 1;
  acc.push(whole.slice(0, cut));
  assert(acc.text === '你', 'Accumulator should only emit complete events.');
  acc.push(whole.slice(cut));
  acc.finish();
  assert(acc.text === '你好呀', `Accumulator should join deltas and stop at [DONE], got ${acc.text}`);

  const loose = new stream.SseCompletionAccumulator();
  loose.push(`data: ${JSON.stringify({ choices: [{ delta: { content: 'A' } }] })}\ndata: ${JSON.stringify({ choices: [{ delta: { content: 'B' } }] })}\n`);
  loose.finish();
  assert(loose.text === 'AB', 'Accumulator should fall back to per-line parsing when events are not separated.');

  const reasoning = new stream.SseCompletionAccumulator();
  reasoning.push(`data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: '想一想' } }] })}\n\n${sseEvent('正文')}`);
  assert(reasoning.text === '正文', 'Reasoning deltas must not leak into chat text.');

  const failing = new stream.SseCompletionAccumulator();
  let failed = '';
  try {
    failing.push(`data: ${JSON.stringify({ error: { message: 'quota exceeded' } })}\n\n`);
  } catch (error) {
    failed = error instanceof Error ? error.message : String(error);
  }
  assert(failed.includes('quota exceeded'), 'Error chunks should surface as request failures.');
}

async function assertReadChatCompletion(): Promise<void> {
  const seen: string[] = [];
  const streamed = await stream.readChatCompletion(sseResponse([sseEvent('一'), sseEvent('二'), 'data: [DONE]\n\n']), (text: string) => seen.push(text));
  assert(streamed.kind === 'text' && streamed.text === '一二', 'Streaming responses should resolve to the joined text.');
  assert(seen.join('|') === '一|一二', `Streaming responses should report growing text, got ${seen.join('|')}`);

  const json = await stream.readChatCompletion(new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
    headers: { 'Content-Type': 'application/json' },
  }), () => { throw new Error('JSON responses should not report partial text.'); });
  assert(json.kind === 'json' && json.json.choices[0].message.content === 'ok', 'Plain JSON responses should pass through.');

  const buffered: string[] = [];
  const bufferedResult = await stream.readChatCompletion(new Response(`${sseEvent('整')}${sseEvent('段')}data: [DONE]\n\n`), (text: string) => buffered.push(text));
  assert(bufferedResult.kind === 'text' && bufferedResult.text === '整段' && buffered.length === 1, 'Buffered SSE text (Android native HTTP) should still parse.');

  let notJson = '';
  try {
    await stream.readChatCompletion(new Response('<<oops>>'), () => undefined);
  } catch (error) {
    notJson = error instanceof Error ? error.message : String(error);
  }
  assert(notJson.includes('不是 JSON'), 'Non-JSON bodies should explain the failure.');
}

function assertPreviewParsing(): void {
  stateModule.replaceState(stateModule.defaultState());
  const character = stateModule.state.characters[0];
  const tagged = format.parseModelChatPreview('<msg>第一条</msg><msg>第二条还在写', character);
  assert(tagged.length === 2 && tagged[0].content === '第一条' && tagged[1].content === '第二条还在写', 'Preview should show closed and still-open <msg> parts.');

  const halfTag = format.parseModelChatPreview('<msg>好</msg><ms', character);
  assert(halfTag.length === 1 && halfTag[0].content === '好', 'Half-written tags must not show up in the preview.');

  const thinking = format.parseModelChatPreview('<thinking>先想想', character);
  assert(thinking.length === 0, 'Unclosed thinking blocks must stay hidden while streaming.');

  const plain = format.parseModelChatPreview('第一段\n\n第二段', character);
  assert(plain.length === 2 && plain[1].content === '第二段', 'Untagged replies should split on blank lines like final messages.');

  const final = format.parseModelChatOutput('<msg>第一条</msg><msg>第二条</msg>', character);
  const preview = format.parseModelChatPreview('<msg>第一条</msg><msg>第二条</msg>', character);
  assert(JSON.stringify(final) === JSON.stringify(preview), 'A finished preview should match the final message split.');

  assert(model.previewModelText('<thinking>想</thinking>你好') === '你好', 'Preview text should drop finished thinking blocks.');
  assert(model.previewModelText('你好<thinking>还在想') === '你好', 'Preview text should drop unfinished thinking blocks.');
}

function configureModel(): any {
  stateModule.replaceState(stateModule.defaultState());
  stateModule.state.modelConfig.apiUrl = 'https://example.com';
  stateModule.state.modelConfig.model = 'stream-model';
  stateModule.state.modelConfig.apiKey = 'secret';
  return stateModule.state.characters[0];
}

async function assertCallModelStreaming(): Promise<void> {
  const character = configureModel();
  const originalFetch = globalThis.fetch;
  const bodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input) === '/api/chat-completions') return new Response('missing', { status: 404 });
    bodies.push(JSON.parse(String(init?.body ?? '{}')));
    return sseResponse([sseEvent('<thinking>想</thinking>'), sseEvent('<msg>你'), sseEvent('好</msg>'), 'data: [DONE]\n\n']);
  }) as typeof fetch;
  try {
    const previews: string[] = [];
    const reply = await model.callModel(character, '', false, true, undefined, { onStream: (text: string) => previews.push(text) });
    assert(bodies[0]?.stream === true, 'Streaming requests should ask for stream: true.');
    assert(reply.includes('你好'), `Streaming replies should resolve to the full text, got ${reply}`);
    assert(previews.length >= 2 && previews.every(text => !text.includes('thinking')), 'Stream previews should grow and hide thinking.');
  } finally {
    globalThis.fetch = originalFetch;
  }

  const fallbackBodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input) === '/api/chat-completions') return new Response('missing', { status: 404 });
    const body = JSON.parse(String(init?.body ?? '{}'));
    fallbackBodies.push(body);
    if (body.stream) return new Response('stream not supported', { status: 400 });
    return new Response(JSON.stringify({ choices: [{ message: { content: '普通回复' } }] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  try {
    const reply = await model.callModel(character, '', false, true, undefined, { onStream: () => undefined });
    assert(reply === '普通回复', 'Services that reject stream should be retried without it.');
    assert(fallbackBodies.length === 2 && fallbackBodies[1].stream === false, 'The retry should send stream: false.');
  } finally {
    globalThis.fetch = originalFetch;
  }

  const plainBodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input) === '/api/chat-completions') return new Response('missing', { status: 404 });
    plainBodies.push(JSON.parse(String(init?.body ?? '{}')));
    return new Response(JSON.stringify({ choices: [{ message: { content: '没开流式' } }] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  try {
    await model.callModel(character, '', false, true);
    assert(plainBodies[0]?.stream === false, 'Calls without onStream should keep stream: false.');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function assertPrivateChatStreaming(): Promise<void> {
  const character = configureModel();
  stateModule.state.activeCharacterId = character.id;
  const originalFetch = globalThis.fetch;
  const originalDocument = (globalThis as any).document;
  (globalThis as any).document = { visibilityState: 'hidden' };
  const chat = require('../src/independent-chat/chat/private-chat');
  const snapshots: Array<{ parts: string[]; finished: string[] }> = [];
  const stop = chat.onReplyStreamChange((finished: string[]) => {
    snapshots.push({ parts: (chat.currentReplyStreamPreview()?.parts ?? []).map((part: any) => part.content), finished });
  });
  globalThis.fetch = (async (input: string | URL | Request) => {
    if (String(input) === '/api/chat-completions') return new Response('missing', { status: 404 });
    return sseResponse([sseEvent('<msg>早'), sseEvent('上好</msg><msg>今天'), sseEvent('去哪</msg>'), 'data: [DONE]\n\n']);
  }) as typeof fetch;
  try {
    assert(chat.canStreamReplies(), 'Browsers should stream replies by default.');
    const started = Date.now();
    await chat.sendMessage('在吗', () => undefined);
    const elapsed = Date.now() - started;
    const messages = stateModule.state.messages
      .filter((message: any) => message.characterId === character.id && message.role === 'assistant');
    const last = messages.slice(-2).map((message: any) => message.content);
    assert(last.join('|') === '早上好|今天去哪', `Final messages should come from the full reply, got ${last.join('|')}`);
    const growing = snapshots.filter(item => item.parts.length > 0).map(item => item.parts.join('/'));
    assert(growing[0] === '早' && growing.includes('早上好/今天'), `Preview should grow bubble by bubble, got ${growing.join(' | ')}`);
    const finish = snapshots.find(item => item.finished.length > 0);
    assert(finish && finish.parts.length === 0 && finish.finished.length === 2, 'Finishing should clear the preview and report the new message ids.');
    assert(!chat.currentReplyStreamPreview() && !chat.isReplying(), 'Nothing should stay in streaming state after the reply.');
    assert(elapsed < 600, `Streamed replies should skip the simulated typing delay (took ${elapsed}ms).`);

    stateModule.state.modelConfig.streamReplies = false;
    assert(!chat.canStreamReplies(), 'The settings switch should turn streaming off.');
    stateModule.state.modelConfig.streamReplies = true;
    (globalThis as any).Capacitor = { isNativePlatform: () => true };
    assert(!chat.canStreamReplies(), 'Android native builds buffer responses, so streaming should stay off there.');
    delete (globalThis as any).Capacitor;
  } finally {
    stop();
    globalThis.fetch = originalFetch;
    (globalThis as any).document = originalDocument;
  }
}

function assertConfigNormalization(): void {
  const normalized = stateModule.normalizeState({ ...stateModule.defaultState(), modelConfig: { apiUrl: '', apiKey: '', model: '' } });
  assert(normalized.modelConfig.streamReplies === true, 'Old saves without the switch should stream by default.');
  const off = stateModule.normalizeState({ ...stateModule.defaultState(), modelConfig: { apiUrl: '', apiKey: '', model: '', streamReplies: false } });
  assert(off.modelConfig.streamReplies === false, 'Turning streaming off should survive a reload.');
}

(async () => {
  assertAccumulator();
  await assertReadChatCompletion();
  assertPreviewParsing();
  await assertCallModelStreaming();
  await assertPrivateChatStreaming();
  assertConfigNormalization();
  console.log(JSON.stringify({ sse: true, fallback: true, preview: true, privateChat: true, settings: true }));
})().catch(error => {
  console.error(error);
  process.exit(1);
});
