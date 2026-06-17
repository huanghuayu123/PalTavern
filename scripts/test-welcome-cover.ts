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

const welcomeCover = require('../src/independent-chat/ui/welcome-cover');
const firstRunGuide = require('../src/independent-chat/ui/first-run-guide');

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

values.clear();
const firstRunState = {
  modelDone: false,
  characterDone: false,
  contentDone: false,
  dismissed: firstRunGuide.isFirstRunGuideDismissed(),
};
if (!firstRunGuide.shouldShowFirstRunGuide(firstRunState)) {
  throw new Error('First-run guide should show while setup is incomplete and not dismissed.');
}
const guideHtml = firstRunGuide.renderFirstRunGuide(firstRunState);
if (
  !guideHtml.includes('id="dismiss-first-run-guide"')
  || !guideHtml.includes('aria-label="关闭新手引导"')
  || !guideHtml.includes('三步就能跑起来')
) {
  throw new Error('First-run guide should render a dismiss button beside the setup copy.');
}
firstRunGuide.markFirstRunGuideDismissed();
if (values.get(firstRunGuide.FIRST_RUN_GUIDE_DISMISSED_KEY) !== 'done') {
  throw new Error('First-run guide did not persist the dismissed state.');
}
if (!firstRunGuide.isFirstRunGuideDismissed()) {
  throw new Error('First-run guide dismissed state should be readable from storage.');
}
if (firstRunGuide.shouldShowFirstRunGuide({ ...firstRunState, dismissed: true })) {
  throw new Error('First-run guide should stay hidden after dismissal.');
}

const uiSource = fs.readFileSync(path.join(process.cwd(), 'src/independent-chat/ui/app.ts'), 'utf8');
if (
  !uiSource.includes('renderWelcomeCover()')
  || !uiSource.includes('markWelcomeCoverSeen()')
  || !uiSource.includes('welcomeCoverOpen = false')
) {
  throw new Error('UI should render the welcome cover and dismiss it through the enter button.');
}
if (
  !uiSource.includes('markFirstRunGuideDismissed()')
  || !uiSource.includes("'#dismiss-first-run-guide'")
  || !uiSource.includes('dismissed: isFirstRunGuideDismissed()')
) {
  throw new Error('UI should render and persistently dismiss the first-run guide.');
}

console.log(JSON.stringify({
  firstOpen: true,
  dismissedState: true,
  firstRunGuideDismissedState: true,
  requestedBrandOrder: true,
  uiBinding: true,
}));
