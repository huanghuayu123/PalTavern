export {};
declare const require: (id: string) => any;
declare const process: { cwd(): string };

const fs = require('fs');

const { readAppUiSource } = require('./read-ui-source');
const path = require('path');

// 大注释：界面性能与存储安全回归测试。
// 锁住这几条：存储写满不能抛异常打断流程；图片不能原样拼进每条消息；不能逐条测量气泡高度；
// 拼音组字时搜索框不重画；聊天记录分段渲染；新消息入场动效只给新消息并尊重“减少动态效果”。

const values = new Map<string, string>();
let failWrites = false;
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      if (failWrites) {
        const error = new Error("Failed to execute 'setItem' on 'Storage': exceeded the quota.");
        error.name = 'QuotaExceededError';
        throw error;
      }
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
    clear() {
      values.clear();
    },
  },
});
Object.defineProperty(globalThis, 'window', { value: { setInterval, clearInterval } });
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node-test' } });

const stateModule = require('../src/independent-chat/core/state');
const imageUrls = require('../src/independent-chat/ui/image-urls');

const statusChanges: boolean[] = [];
stateModule.onStorageSaveStatusChange((failing: boolean) => statusChanges.push(failing));

if (stateModule.saveState() !== true || stateModule.isStorageSaveFailing()) {
  throw new Error('saveState should report success when storage accepts the write.');
}
failWrites = true;
let threw = false;
let failedResult: unknown;
try {
  failedResult = stateModule.saveState();
} catch {
  threw = true;
}
if (threw || failedResult !== false || !stateModule.isStorageSaveFailing()) {
  throw new Error('saveState must not throw when storage is full; it should return false and flag the failure.');
}
failWrites = false;
if (stateModule.saveState() !== true || stateModule.isStorageSaveFailing()) {
  throw new Error('saveState should clear the failure flag once a later write succeeds.');
}
if (statusChanges.join(',') !== 'true,false') {
  throw new Error(`Storage status listeners should fire once per change, got: ${statusChanges.join(',')}`);
}

const avatarDataUrl = `data:image/webp;base64,${Buffer.from('fake-avatar-bytes').toString('base64')}`;
const firstUrl = imageUrls.displayImageUrl(avatarDataUrl);
const secondUrl = imageUrls.displayImageUrl(avatarDataUrl);
if (!firstUrl.startsWith('blob:') || firstUrl !== secondUrl || firstUrl.length > 120) {
  throw new Error('displayImageUrl should turn a data URL into one cached short blob URL.');
}
if (imageUrls.displayImageUrl('https://example.com/a.png') !== 'https://example.com/a.png' || imageUrls.displayImageUrl(undefined) !== '') {
  throw new Error('displayImageUrl should leave non-data URLs untouched.');
}

const root = process.cwd();
const appSource = readAppUiSource();
const chatSurfaceSource = fs.readFileSync(path.join(root, 'src/independent-chat/ui/chat-surface.ts'), 'utf8');
const styleSource = fs.readFileSync(path.join(root, 'src/independent-chat/styles.css'), 'utf8');

if (
  appSource.includes('message.style.height =')
  || appSource.includes('applyContentHeight')
  || !styleSource.includes('.message:not(.sticker-message) {\n  padding-top: 8px;\n  padding-bottom: 8px;')
) {
  throw new Error('Message bubbles must size themselves with CSS instead of measuring every bubble after each render.');
}

if (
  !chatSurfaceSource.includes("from './image-urls'")
  || !chatSurfaceSource.includes('displayImageUrl(character.avatar)')
  || !chatSurfaceSource.includes('displayImageUrl(backgroundImage)')
  || appSource.includes('src="${escapeHtml(sticker.dataUrl)}"')
) {
  throw new Error('Avatars, stickers and chat backgrounds must render through cached short image URLs.');
}

if (
  !chatSurfaceSource.includes('CHAT_BACKGROUND_MAX_SIDE = 1600')
  || !chatSurfaceSource.includes("canvas.toDataURL('image/webp', CHAT_BACKGROUND_QUALITY)")
  || !appSource.includes('STORAGE_FULL_IMAGE_MESSAGE')
  || !appSource.includes('if (!saveState()) {')
  || !appSource.includes('function renderStorageWarning(): string')
  || !styleSource.includes('.storage-warning-banner {')
) {
  throw new Error('Chat backgrounds must be compressed, roll back when storage is full, and show a persistent warning.');
}

if (
  !appSource.includes('function isImeComposing(event: Event): boolean')
  || (appSource.match(/if \(isImeComposing\(event\)\) return;/g) ?? []).length < 2
  || (appSource.match(/addEventListener\('compositionend'/g) ?? []).length < 2
) {
  throw new Error('Search inputs must not re-render while an IME is composing.');
}

if (
  !appSource.includes('const MESSAGE_RENDER_WINDOW = 120;')
  || !appSource.includes("messageWindowStart('private'")
  || !appSource.includes("messageWindowStart('group'")
  || !appSource.includes("messageWindowStart('direct'")
  || !appSource.includes('data-load-earlier-messages')
) {
  throw new Error('Chat views must render only the latest messages and load earlier ones on demand.');
}

if (
  !appSource.includes('beginMessageArrivalTracking();')
  || !appSource.includes('function messageArrivalMarkup(')
  || !styleSource.includes('@keyframes messageArrive')
  || !styleSource.includes('var(--message-arrival-delay, 0ms)')
  || !/@media \(prefers-reduced-motion: reduce\) \{\s*\.messages \.message-row\.is-arriving/.test(styleSource)
) {
  throw new Error('Only newly arrived messages may animate in, and the animation must respect reduced motion.');
}

console.log(JSON.stringify({
  storageFullDoesNotThrow: true,
  cachedImageUrls: true,
  cssBubbleHeight: true,
  compressedBackgrounds: true,
  imeSafeSearch: true,
  windowedMessages: true,
  arrivalMotion: true,
}));
