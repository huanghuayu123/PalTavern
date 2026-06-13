export {};
declare const require: (id: string) => any;

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

const stateModule = require('../src/independent-chat/core/state');
const chapters = require('../src/independent-chat/world/chapters');
const backup = require('../src/independent-chat/data/backup');

const chapter = chapters.createWorldChapter({
  title: 'Festival Arc',
  summary: 'A longer roleplay arc around the festival.',
});
if (chapter.worldId !== 'world_default' || chapter.status !== 'active') {
  throw new Error('New world chapter did not attach to the active world.');
}
if (stateModule.state.activeWorldChapterIdByWorldId.world_default !== chapter.id) {
  throw new Error('New world chapter was not made active for its world.');
}

const firstScene = chapters.createWorldScene(chapter.id, {
  title: 'Arrival',
  summary: 'The cast arrives at the venue.',
  sourceEventId: 'event_arrival',
});
const secondScene = chapters.createWorldScene(chapter.id, {
  title: 'Backstage',
  summary: 'The private backstage scene.',
});
if (chapter.activeSceneId !== secondScene.id || chapter.scenes.length !== 2) {
  throw new Error('World scenes were not appended and activated.');
}

chapters.setActiveWorldScene(chapter.id, firstScene.id);
if (chapter.activeSceneId !== firstScene.id) {
  throw new Error('Active world scene did not switch.');
}

chapters.endWorldScene(chapter.id, firstScene.id, 'Arrival ended after everyone met.');
if (firstScene.status !== 'ended' || !firstScene.endedAt || firstScene.summary !== 'Arrival ended after everyone met.') {
  throw new Error('World scene did not end with a saved summary.');
}

chapters.endWorldChapter(chapter.id, 'Festival arc wrapped for the night.');
if (chapter.status !== 'ended' || !chapter.endedAt || chapter.summary !== 'Festival arc wrapped for the night.') {
  throw new Error('World chapter did not end with a saved summary.');
}
if (stateModule.state.activeWorldChapterIdByWorldId.world_default === chapter.id) {
  throw new Error('Ended world chapter should no longer be active.');
}

const text = backup.createBackupText();
stateModule.replaceState(stateModule.defaultState());
const restored = backup.restoreBackupText(text);
const restoredChapter = restored.worldChapters.find((item: any) => item.id === chapter.id);
if (
  !restoredChapter
  || restoredChapter.scenes.length !== 2
  || restoredChapter.scenes[0].status !== 'ended'
  || restoredChapter.status !== 'ended'
) {
  throw new Error('World chapters did not survive backup restore.');
}

console.log(JSON.stringify({
  worldChapterCreate: true,
  worldSceneCreate: true,
  worldSceneSwitch: true,
  worldSceneEnd: true,
  worldChapterEnd: true,
  backupRestore: true,
}));
