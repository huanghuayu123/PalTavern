# 更新日志 / Changelog

记录来自仓库提交说明。2026-06-10 之前的开发在本地模板目录里完成，没有单独的公开发布说明。版本号以根目录 `package.json` 为准。

Entries below are taken from the repository history. Work before 2026-06-10 happened in a local template directory and has no separate public release notes. Version numbers follow the root `package.json`.

## [Unreleased]

### 新增 / Added

- 中英双语 README、CONTRIBUTING、CHANGELOG，以及缺陷报告和功能建议模板。
- Bilingual README, CONTRIBUTING, CHANGELOG, plus bug-report and feature-request templates.

### 变更 / Changed

- 整个仓库使用 MIT。原先根目录文本是 Aladdin Free Public License，正文仍在描述 AFPL Ghostscript。构建和编辑器用的配置文件已按本项目重写，不再保留另一份许可证。
- The whole repository is MIT. The previous root license was the Aladdin Free Public License and still described AFPL Ghostscript. Build and editor config files were rewritten for this project, so no second license remains.
- `desktop/package.json` 的版本从 `0.1.0` 对齐到 `1.1.04`。桌面就绪检查改为按这个版本查找安装包文件名。
- `desktop/package.json` now matches `1.1.04`. The desktop readiness check looks up the installer name from that version.
- 没有本地 `tavern-social-debug.keystore` 时，Android debug 构建使用 Gradle 默认调试签名。文件还在时，签名方式不变。
- Android debug builds use the Gradle default debug keystore when `tavern-social-debug.keystore` is absent. Existing keystores are still used.
- `.gitignore` 增加 `.env`、编辑器目录和覆盖率输出。
- `.gitignore` now covers `.env` files, editor directories, and coverage output.

### 修正 / Fixed

- Android 后台说明中的网页入口路径改为 `src/independent-chat/platform/runtime.ts`。
- The Android background note now points at `src/independent-chat/platform/runtime.ts`.

## [1.1.04] - 2026-06-18

- 发布准备。
- Release preparation.

## [1.1.03] - 2026-06-17

- 发布准备。
- Release preparation.

## [1.1.02] - 2026-06-17

- Android 发布准备。
- Android release preparation.

## [1.1.01] - 2026-06-17

- 打磨移动端交互。
- 修复世界设置齿轮重复开关。
- Mobile interaction polish.
- Fix the world settings gear toggling twice.

## [1.1.0] - 2026-06-17

- Android 发布准备，并支持 Android 10 启动。
- 调整底部导航、群聊头像、移动端导航动画和滚动状态。
- Android release preparation and Android 10 launch support.
- Bottom navigation, group avatars, mobile navigation animation, and scroll state.

## [0.x 开发记录] - 2026-06-10 至 2026-06-16

公开仓库从 2026-06-10 的初始提交开始。随后几次提交做了这些事：

The public history starts with the 2026-06-10 initial commit. Later commits in this range did the following:

- 整理独立聊天和世界工作台界面，收紧世界记忆与事件。
- 增加世界包导出，并整理写卡输出。
- 加强群聊热闹程度和世界 RP 控制。
- 用应用内对话框替换浏览器原生弹窗。
- 可见品牌文案对齐为 PalTavern。
- 从主界面文件中抽出过渡、图标、聊天气泡、模型设置、设置片段和显示文案。
- Reorganize the independent chat and world workbench, and tighten world memory and events.
- Add world bundles and clean up authoring output.
- Improve group-chat liveliness and world roleplay controls.
- Replace browser dialogs with in-app dialogs.
- Align visible brand copy with PalTavern.
- Extract transitions, icons, chat chrome, model settings, settings fragments, and display labels from the main UI file.
