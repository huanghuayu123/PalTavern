# PalTavern

这是从 `D:\tavern_helper_template-main` 整理出来的干净 PalTavern 项目目录。

保留内容：

- `src/independent-chat`：PalTavern 主应用源码。
- `android`：Android/Capacitor 原生工程。
- `desktop`：Electron 桌面入口。
- `scripts`：PalTavern 构建、测试、Android/桌面检查脚本。
- `docs`、`assets`、`outputs`、`release`：项目文档、图标、预览图和 PalTavern 发布包。

没有搬入：

- 旧模板示例、local-phone、小手机脚本、xiaoxi 发布脚本。
- `node_modules`、`dist`、Android build 缓存、临时日志、旧迁移目录、备份目录。

常用命令：

```powershell
pnpm install --frozen-lockfile
pnpm typecheck:independent
pnpm test:independent
pnpm build:dev
pnpm local:serve
pnpm android:build
```

