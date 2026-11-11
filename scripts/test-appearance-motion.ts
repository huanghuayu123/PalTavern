export {};
declare const require: (id: string) => any;

// 外观设置（主题色、深浅色、动效档位）和动效引擎里的纯计算部分。

const fs = require('node:fs');
const path = require('node:path');

const values = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    clear: () => values.clear(),
  },
});

const stateModule = require('../src/independent-chat/core/state');
const appearance = require('../src/independent-chat/ui/appearance');
const { motionMath, MOTION_MS, MOTION_EASE } = require('../src/independent-chat/ui/motion');

function check(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.001;
const box = (left: number, top: number, width: number, height: number, radius = 0) => ({ left, top, width, height, radius });

// ---------------------------------------------------------------- 外观设置

const defaults = stateModule.DEFAULT_APPEARANCE;
check(
  defaults.accent === 'teal' && defaults.colorScheme === 'system' && defaults.motion === 'full',
  'Appearance defaults should be teal, follow the system, and use full motion.',
);

const fresh = stateModule.defaultState();
check(
  JSON.stringify(fresh.appearance) === JSON.stringify(defaults) && fresh.appearance !== defaults,
  'A new save should start from a copy of the appearance defaults.',
);

// 小注释：旧存档里没有 appearance 字段，读进来要补上默认值，其余数据不受影响。
const legacy = JSON.parse(JSON.stringify(fresh));
delete legacy.appearance;
const migrated = stateModule.normalizeState(legacy);
check(
  JSON.stringify(migrated.appearance) === JSON.stringify(defaults),
  'Old saves without appearance settings should load with the defaults.',
);
check(
  migrated.characters.length === fresh.characters.length && migrated.activeWorldId === fresh.activeWorldId,
  'Filling in appearance defaults must not touch the rest of an old save.',
);

const accents: string[] = stateModule.APPEARANCE_ACCENTS;
check(
  accents.join(',') === 'teal,sky,terracotta,sakura,lavender,graphite',
  'There should be six accent presets with teal first.',
);
accents.forEach(accent => {
  check(stateModule.normalizeAppearance({ accent }).accent === accent, `Accent ${accent} should survive a reload.`);
});
['system', 'light', 'dark'].forEach(colorScheme => {
  check(
    stateModule.normalizeAppearance({ colorScheme }).colorScheme === colorScheme,
    `Color scheme ${colorScheme} should survive a reload.`,
  );
});
['full', 'reduced'].forEach(motion => {
  check(stateModule.normalizeAppearance({ motion }).motion === motion, `Motion level ${motion} should survive a reload.`);
});

const junk = stateModule.normalizeAppearance({ accent: 'neon', colorScheme: 'auto', motion: 'none' });
check(
  JSON.stringify(junk) === JSON.stringify(defaults),
  'Unknown appearance values should fall back to the defaults one field at a time.',
);
check(
  JSON.stringify(stateModule.normalizeAppearance(null)) === JSON.stringify(defaults)
  && JSON.stringify(stateModule.normalizeAppearance('dark')) === JSON.stringify(defaults),
  'A broken appearance field should fall back to the defaults.',
);
const partial = stateModule.normalizeAppearance({ accent: 'sakura', colorScheme: 'dark' });
check(
  partial.accent === 'sakura' && partial.colorScheme === 'dark' && partial.motion === 'full',
  'Missing appearance fields should be filled in without dropping the ones that are there.',
);

const saved = stateModule.normalizeState({ ...fresh, appearance: { accent: 'lavender', colorScheme: 'light', motion: 'reduced' } });
check(
  saved.appearance.accent === 'lavender' && saved.appearance.colorScheme === 'light' && saved.appearance.motion === 'reduced',
  'Saved appearance choices should be kept when the save is loaded again.',
);

// 小注释：强制深浅色和“精简动效”靠改写媒体查询实现。
const rewrite = appearance.rewriteMediaText;
const darkQuery = ['(prefers-color-scheme: dark)'];
check(rewrite(darkQuery, 'dark', 'system') === '(prefers-color-scheme: dark)', 'Following the system should keep the dark query untouched.');
check(rewrite(darkQuery, 'dark', 'on') === '(min-width: 0px)', 'Forcing dark mode should make dark rules always apply.');
check(rewrite(darkQuery, 'dark', 'off') === 'not all', 'Forcing light mode should switch dark rules off.');
check(
  rewrite(['screen and (prefers-color-scheme: dark)', '(max-width: 700px)'], 'dark', 'on') === 'screen and (min-width: 0px), (max-width: 700px)',
  'Forcing dark mode should only replace the dark condition and keep the rest of the query list.',
);
check(
  rewrite(['(max-width: 700px) and (prefers-color-scheme:dark)'], 'dark', 'off') === 'not all',
  'Forcing light mode should switch off combined dark queries too.',
);
check(
  rewrite(['(prefers-reduced-motion: reduce)'], 'reduced-motion', 'on') === '(min-width: 0px)'
  && rewrite(['(prefers-reduced-motion: reduce)'], 'reduced-motion', 'system') === '(prefers-reduced-motion: reduce)',
  'Reduced motion should turn the reduced-motion rules on, and full motion should leave them to the system.',
);
check(
  rewrite(['(prefers-color-scheme: dark)'], 'reduced-motion', 'on') === '(prefers-color-scheme: dark)',
  'The motion switch must not touch dark-mode queries.',
);

const appearanceCss = fs.readFileSync(path.join(process.cwd(), 'src/independent-chat/styles-appearance.css'), 'utf8');
accents.filter(accent => accent !== 'teal').forEach(accent => {
  check(appearanceCss.includes(`:root[data-accent="${accent}"]`), `Accent ${accent} should define its own colors.`);
});

// ---------------------------------------------------------------- 动效的纯计算

check(
  MOTION_MS.fast < MOTION_MS.base && MOTION_MS.base < MOTION_MS.emphasized && MOTION_MS.exit < MOTION_MS.base,
  'Motion durations should go fast < standard < emphasized, with exits shorter than entrances.',
);
check(
  Object.values(MOTION_EASE).every(value => /^cubic-bezier\(/.test(String(value))),
  'Motion easings should be cubic-bezier curves.',
);

const a = box(0, 0, 100, 50, 10);
const b = box(200, 100, 300, 150, 0);
const mid = motionMath.lerpBox(a, b, 0.5);
check(
  near(mid.left, 100) && near(mid.top, 50) && near(mid.width, 200) && near(mid.height, 100) && near(mid.radius, 5),
  'Box interpolation should move every edge and the corner radius halfway at t = 0.5.',
);
check(JSON.stringify(motionMath.lerpBox(a, b, 0)) === JSON.stringify(a), 'Box interpolation should start at the first box.');
check(JSON.stringify(motionMath.lerpBox(a, b, 1)) === JSON.stringify(b), 'Box interpolation should end at the second box.');

check(motionMath.flyTransform(40, -20, 0.5, 0) === 'translate(40.0px, -20.0px) scale(0.500)', 'A flight should start at the old position and size.');
check(motionMath.flyTransform(40, -20, 0.5, 1) === 'translate(0.0px, 0.0px) scale(1.000)', 'A flight should land with no offset and full size.');
check(motionMath.flyTransform(40, -20, 0.5, 0.5) === 'translate(20.0px, -10.0px) scale(0.750)', 'A flight should be halfway at t = 0.5.');

const frame = box(0, 0, 400, 800);
check(
  motionMath.insetFor(box(20, 100, 360, 60, 12), frame) === 'inset(100.0px 20.0px 640.0px 20.0px round 12.0px)',
  'The clip box should cut the page down to the tapped row with its corner radius.',
);
check(
  motionMath.insetFor(box(-50, -10, 600, 900, 0), frame) === 'inset(0.0px 0.0px 0.0px 0.0px round 0.0px)',
  'A clip box larger than the page should never produce negative insets.',
);

check(
  motionMath.morphTransform(box(10, 20, 50, 50), box(110, 220, 100, 100), 0, 0, true) === 'translate(-100.00px, -200.00px) scale(0.5000, 0.5000)',
  'A shared element should start from its old box: offset back and scaled down to the old size.',
);
check(
  motionMath.morphTransform(box(10, 20, 50, 50), box(110, 220, 100, 100), 30, -10, true) === 'translate(-130.00px, -190.00px) scale(0.5000, 0.5000)',
  'A shared element riding along with a moving page should subtract the page shift.',
);
check(
  motionMath.morphTransform(box(0, 0, 200, 20), box(0, 0, 100, 40), 0, 0, false) === 'translate(0.00px, 0.00px) scale(2.0000, 0.5000)',
  'Free scaling should stretch width and height separately.',
);
check(
  motionMath.morphTransform(box(0, 0, 200, 20), box(0, 0, 100, 40), 0, 0, true) === 'translate(0.00px, 0.00px) scale(1.0000, 1.0000)',
  'Uniform scaling (avatars) should keep the aspect ratio.',
);

const union = motionMath.unionBox(box(0, 0, 100, 100), box(300, 50, 100, 400));
check(near(union.left, 0) && near(union.top, 0) && near(union.width, 400) && near(union.height, 450), 'The union of two boxes should cover both.');

const page = box(320, 0, 960, 800);
check(motionMath.isBesidePage(box(0, 100, 320, 64), page), 'A list row left of the detail page counts as beside it (desktop swap).');
check(!motionMath.isBesidePage(box(340, 100, 300, 64), page), 'A button inside the page is not beside it.');
check(motionMath.isRowSource(box(320, 100, 900, 64), page), 'A full-width row inside the page should grow into the page.');
check(!motionMath.isRowSource(box(1200, 20, 40, 40), page), 'A small button is not a row.');

console.log(JSON.stringify({ appearanceDefaults: true, appearanceMigration: true, colorSchemes: 3, motionLevels: 2, mediaRewrite: true, motionMath: true }));
