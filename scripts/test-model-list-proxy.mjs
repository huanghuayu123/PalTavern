import { createServer } from 'node:http';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startIndependentChatServer } from './independent-chat-server.mjs';

// 小注释：流式接口先发第一段，等测试那边确认已经收到后才发剩下的，用来证明代理是边收边转发的。
let releaseRest = () => {};
const restReleased = new Promise(resolve => { releaseRest = resolve; });
let upstreamStreamFlag;

const upstream = createServer((request, response) => {
  if (request.url === '/v1/chat/completions' && request.method === 'POST') {
    let raw = '';
    request.on('data', chunk => { raw += chunk; });
    request.on('end', async () => {
      upstreamStreamFlag = JSON.parse(raw).stream;
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: '你' } }] })}\n\n`);
      await restReleased;
      response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: '好' } }] })}\n\n`);
      response.end('data: [DONE]\n\n');
    });
    return;
  }
  if (request.url !== '/v1/models' || request.headers.authorization !== 'Bearer secret') {
    response.writeHead(401);
    response.end('unauthorized');
    return;
  }
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ data: [{ id: 'model-a' }, { id: 'model-b' }] }));
});
await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
const address = upstream.address();
const upstreamPort = typeof address === 'object' && address ? address.port : 0;

const root = await mkdtemp(path.join(tmpdir(), 'tavern-social-model-test-'));
await writeFile(path.join(root, 'index.html'), '<main>ok</main>');
const app = await startIndependentChatServer({ root, host: '127.0.0.1', port: 0, quiet: true });

try {
  const response = await fetch(`${app.url}api/models`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiUrl: `http://127.0.0.1:${upstreamPort}/v1/models`,
      apiKey: 'secret',
    }),
  });
  const payload = await response.json();
  if (!response.ok || payload.data?.[1]?.id !== 'model-b') {
    throw new Error('Model list proxy did not forward the upstream response.');
  }

  const streamResponse = await fetch(`${app.url}api/chat-completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiUrl: `http://127.0.0.1:${upstreamPort}/v1/chat/completions`,
      apiKey: 'secret',
      model: 'model-a',
      messages: [{ role: 'user', content: 'hi' }],
      stream: true,
    }),
  });
  if (!/text\/event-stream/.test(streamResponse.headers.get('content-type') ?? '')) {
    throw new Error('Chat proxy should keep the event-stream content type.');
  }
  const reader = streamResponse.body.getReader();
  const decoder = new TextDecoder();
  let streamed = '';
  while (!streamed.includes('你')) {
    const { done, value } = await reader.read();
    if (done) throw new Error('Chat proxy closed the stream before forwarding the first chunk.');
    streamed += decoder.decode(value, { stream: true });
  }
  releaseRest();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    streamed += decoder.decode(value, { stream: true });
  }
  if (upstreamStreamFlag !== true || !streamed.includes('好') || !streamed.includes('[DONE]')) {
    throw new Error('Chat proxy should forward stream: true and pass every SSE chunk through.');
  }
  console.log(JSON.stringify({ proxy: true, authorization: true, response: true, streaming: true }));
} finally {
  await new Promise(resolve => app.server.close(resolve));
  await new Promise(resolve => upstream.close(resolve));
}
