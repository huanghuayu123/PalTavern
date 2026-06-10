import { createServer } from 'node:http';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startIndependentChatServer } from './independent-chat-server.mjs';

const upstream = createServer((request, response) => {
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
  console.log(JSON.stringify({ proxy: true, authorization: true, response: true }));
} finally {
  await new Promise(resolve => app.server.close(resolve));
  await new Promise(resolve => upstream.close(resolve));
}
