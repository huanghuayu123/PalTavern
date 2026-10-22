# 参与贡献

谢谢你愿意改 PalTavern。改动请尽量小，并保持现有聊天、世界隔离和输入框行为不变。

## 开始之前

1. 使用 Node.js 22 和 pnpm。仓库用 `pnpm-lock.yaml` 锁定依赖。
2. 阅读 [README.md](README.md) 里的安装与验证命令。
3. 如果要改界面或数据结构，先看 `docs/AI_HANDOFF.md` 和 `docs/ai-handoff/SEMANTIC_GUARDRAILS.md`。那里记录了不能被刷新清掉的输入框、世界之间的数据隔离，以及世界 RP 不能混进私聊。

## 提交流程

1. 从 `main` 拉出分支。
2. 只改和问题相关的文件。不要顺手重排大文件，也不要改用户能看见的文案，除非这个 PR 就是在改文案。
3. 提交前在仓库根目录运行：

```bash
pnpm typecheck:independent
pnpm test:independent
pnpm build:dev
```

4. 在 Pull Request 里写清：改了什么、怎么验证、有没有没跑的检查（例如 Android 打包）。

## 报告问题

用 GitHub Issues 里的缺陷报告或功能建议模板。请附上 PalTavern 版本、运行方式（网页、Electron 或 Android）和复现步骤。不要贴 API Key、聊天记录或备份文件。

---

# Contributing

Thanks for working on PalTavern. Keep changes small, and do not change chat behavior, world isolation, or in-progress input text unless that is the bug you are fixing.

## Before you start

1. Use Node.js 22 and pnpm. Dependencies are locked in `pnpm-lock.yaml`.
2. Follow the install and check commands in [README.md](README.md).
3. For UI or saved-data changes, read `docs/AI_HANDOFF.md` and `docs/ai-handoff/SEMANTIC_GUARDRAILS.md` first. They record rules for input stability, per-world data, and keeping world roleplay out of private chat.

## Pull requests

1. Branch from `main`.
2. Touch only the files the change needs. Do not reformat large files, and do not edit user-visible copy unless the PR is about that copy.
3. Before opening a PR, run:

```bash
pnpm typecheck:independent
pnpm test:independent
pnpm build:dev
```

4. Say what changed, how you checked it, and which checks you could not run (for example Android packaging).

## Issues

Use the bug report or feature request template. Include the PalTavern version, whether you used the web app, Electron, or Android, and steps to reproduce. Do not paste API keys, chat logs, or backup files.
