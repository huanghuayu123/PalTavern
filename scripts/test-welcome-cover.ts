export {};
declare const require: (id: string) => any;

const fs = require('node:fs');
const path = require('node:path');

const values = new Map<string, string>();

Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
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

const welcomeCover = require('../src/independent-chat/welcome-cover');

values.clear();
if (!welcomeCover.shouldShowWelcomeCover()) {
  throw new Error('Welcome cover should show before the user has entered once.');
}

welcomeCover.markWelcomeCoverSeen();
if (values.get(welcomeCover.WELCOME_COVER_KEY) !== 'done') {
  throw new Error('Welcome cover did not persist the dismissed state.');
}
if (welcomeCover.shouldShowWelcomeCover()) {
  throw new Error('Welcome cover should stay hidden after the user enters once.');
}

const html = welcomeCover.renderWelcomeCover();
const titleIndex = html.indexOf('<h1 id="welcome-cover-title">PalTavern</h1>');
const subtitleIndex = html.indexOf('<p>让角色成为会主动联系你的联系人</p>');
if (titleIndex < 0 || subtitleIndex < 0 || titleIndex > subtitleIndex) {
  throw new Error('Welcome cover should render PalTavern above the requested subtitle.');
}
if (!html.includes('id="enter-welcome-cover"')) {
  throw new Error('Welcome cover should provide an enter button.');
}

const uiSource = fs.readFileSync(path.join(process.cwd(), 'src/independent-chat/ui.ts'), 'utf8');
if (
  !uiSource.includes('renderWelcomeCover()')
  || !uiSource.includes('markWelcomeCoverSeen()')
  || !uiSource.includes('welcomeCoverOpen = false')
) {
  throw new Error('UI should render the welcome cover and dismiss it through the enter button.');
}

console.log(JSON.stringify({
  firstOpen: true,
  dismissedState: true,
  requestedBrandOrder: true,
  uiBinding: true,
}));
