# Android 后台桥接实现说明

更新日期：2026-06-05

## 当前实现

Android 原生工程位于 `android/`，基于 Capacitor 8 和 Android WorkManager。

原生组件：

- `MainActivity.java`：注册 Capacitor 插件，并向正在运行的 WebView 派发后台检查事件。
- `TavernSocialBackgroundPlugin.java`：接收 Web 端排期、申请通知权限、发送本地通知。
- `TavernSocialBackgroundWorker.java`：由 WorkManager 在系统允许时尝试触发检查。

Web 端入口位于 `src/independent-chat/platform.ts`，通过 Capacitor 插件名
`TavernSocialBackground` 调用原生能力。

## 调度行为

1. Web 调度器计算所有启用角色中最近的 `nextAttemptAt`。
2. 原生插件使用唯一 WorkManager 任务登记下一次尝试。
3. 任务约束为网络可用且电量不低。
4. 到期时，Worker 只在应用 WebView 仍可接收事件时派发
   `tavern-social-background-check`。
5. Web 调度器收到事件后执行一次正常的到期检查，并重新登记下一次任务。

## 明确限制

- Android 后台执行不是强实时保证，系统可以延迟或跳过。
- 首版不使用常驻前台服务。
- 应用进程和 WebView 已被系统彻底回收时，Worker 安全跳过。
- 跳过的任务不会在下次打开应用时补算或补发。
- 无网络、模型配置无效、预算不足、安静时段或每日上限触发时，不生成消息。

## 通知

- Android 13 及以上使用 `POST_NOTIFICATIONS` 运行时权限。
- 主动消息生成成功后，先写入对应私聊，再调用原生通知。
- 通知正文遵守完整内容、通用提示、隐藏角色名三种隐私等级。

## 验证

```powershell
pnpm android:check
pnpm android:build
```

调试 APK：

`android/app/build/outputs/apk/debug/app-debug.apk`
