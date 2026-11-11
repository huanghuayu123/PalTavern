declare const require: (id: string) => any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

// 大注释：app.ts 里能独立出去的界面函数已经拆成下面这些模块。
// 测试检查的是“整个界面源码”里的约定，所以这里把 app.ts 和这些模块按固定顺序拼起来读。
export const APP_UI_SPLIT_MODULES = [
  'viewport-layout',
  'ui-types',
  'composer-input',
  'private-chat-identity',
  'character-pages',
  'group-chat-view',
  'world-view',
  'settings-panels',
  'card-ai-import',
];

export function readAppUiSource(): string {
  const dir = path.join(__dirname, '../src/independent-chat/ui');
  return [
    fs.readFileSync(path.join(dir, 'app.ts'), 'utf8'),
    ...APP_UI_SPLIT_MODULES.map(name => fs.readFileSync(path.join(dir, `${name}.ts`), 'utf8')),
  ].join('\n');
}
