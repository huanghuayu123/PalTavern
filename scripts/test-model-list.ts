export {};
declare const require: (id: string) => any;

Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem() { return null; },
    setItem() {},
  },
});

const model = require('../src/independent-chat/model');

const urls = [
  ['https://example.com', 'https://example.com/v1/models'],
  ['https://example.com/v1', 'https://example.com/v1/models'],
  ['https://example.com/v1/chat/completions', 'https://example.com/v1/models'],
  ['https://example.com/v1/models', 'https://example.com/v1/models'],
];
for (const [input, expected] of urls) {
  if (model.normalizeModelsUrl(input) !== expected) {
    throw new Error(`Unexpected models URL for ${input}`);
  }
}

const ids = model.parseModelIds({
  data: [
    { id: 'gpt-b' },
    { id: 'gpt-a' },
    { id: 'gpt-a' },
  ],
});
if (ids.join(',') !== 'gpt-a,gpt-b') {
  throw new Error('OpenAI model list was not normalized and deduplicated.');
}

const alternate = model.parseModelIds({
  models: [{ name: 'model-z' }, { model: 'model-y' }],
});
if (alternate.join(',') !== 'model-y,model-z') {
  throw new Error('Alternate model list shape was not supported.');
}

async function testHtmlProxyFallback(): Promise<void> {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    if (url === '/api/models') {
      return new Response('<head><meta charset="utf-8"></head>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    }
    return new Response(JSON.stringify({ data: [{ id: 'direct-model' }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  try {
    const fallbackModels = await model.fetchModelList('https://example.com/', 'secret');
    if (
      fallbackModels.join(',') !== 'direct-model'
      || calls[1]?.url !== 'https://example.com/v1/models'
      || (calls[1]?.init?.headers as Record<string, string>)?.Authorization !== 'Bearer secret'
    ) {
      throw new Error('HTML app-shell response did not fall back to the direct models endpoint.');
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testModelConnectionUsesCurrentFormConfig(): Promise<void> {
  if (typeof model.testModelConnection !== 'function') {
    throw new Error('Model connection test helper is missing.');
  }
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; body: Record<string, any> }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const body = JSON.parse(String(init?.body ?? '{}'));
    calls.push({ url, body });
    if (url !== '/api/chat-completions') {
      throw new Error(`Unexpected model connection test URL: ${url}`);
    }
    if (
      body.apiUrl !== 'https://example.com/v1/chat/completions'
      || body.apiKey !== 'secret'
      || body.model !== 'unit-test-model'
      || body.temperature !== 0.15
      || body.stream !== false
      || !Array.isArray(body.messages)
    ) {
      throw new Error('Model connection test did not send the current form config through the proxy.');
    }
    return new Response(JSON.stringify({
      choices: [{ message: { content: 'pong from model' } }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  try {
    const result = await model.testModelConnection({
      apiUrl: 'https://example.com',
      apiKey: ' secret ',
      model: ' unit-test-model ',
      temperature: 0.15,
    });
    if (calls.length !== 1 || !result.preview.includes('pong from model')) {
      throw new Error('Model connection test did not return a readable response preview.');
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testModelConnectionRequiresModelName(): Promise<void> {
  if (typeof model.testModelConnection !== 'function') {
    throw new Error('Model connection test helper is missing.');
  }
  try {
    await model.testModelConnection({ apiUrl: 'https://example.com', apiKey: '', model: '' });
  } catch (error) {
    if (error instanceof Error && error.message.includes('模型名称')) return;
    throw error;
  }
  throw new Error('Model connection test should require a model name.');
}

async function main(): Promise<void> {
  await testHtmlProxyFallback();
  await testModelConnectionUsesCurrentFormConfig();
  await testModelConnectionRequiresModelName();
}

void main().then(() => {
  console.log(JSON.stringify({
    urlNormalization: true,
    openAiShape: true,
    alternateShape: true,
    deduplicated: true,
    htmlProxyFallback: true,
    modelConnectionTest: true,
  }));
});
