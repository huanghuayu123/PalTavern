import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const manifestPath = path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
const capacitorConfigPath = path.join(root, 'capacitor.config.json');
const androidStringsPath = path.join(root, 'android', 'app', 'src', 'main', 'res', 'values', 'strings.xml');
const androidBuildGradlePath = path.join(root, 'android', 'app', 'build.gradle');
const mainActivityPath = path.join(
  root,
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'tavernsocial',
  'app',
  'MainActivity.java',
);
const nativeDir = path.dirname(mainActivityPath);
const manifest = existsSync(manifestPath) ? readFileSync(manifestPath, 'utf8') : '';
const capacitorConfig = existsSync(capacitorConfigPath) ? readFileSync(capacitorConfigPath, 'utf8') : '';
const androidStrings = existsSync(androidStringsPath) ? readFileSync(androidStringsPath, 'utf8') : '';
const androidBuildGradle = existsSync(androidBuildGradlePath) ? readFileSync(androidBuildGradlePath, 'utf8') : '';
const mainActivity = existsSync(mainActivityPath) ? readFileSync(mainActivityPath, 'utf8') : '';

const checks = [
  {
    name: 'Independent web build',
    ok: existsSync(path.join(root, 'dist', 'independent-chat', 'index.html')),
    detail: 'dist/independent-chat/index.html',
  },
  {
    name: 'Capacitor config',
    ok: existsSync(path.join(root, 'capacitor.config.json')),
    detail: 'capacitor.config.json',
  },
  {
    name: 'Capacitor app name',
    ok: capacitorConfig.includes('"appName": "Pal Tavern"'),
    detail: 'capacitor.config.json appName Pal Tavern',
  },
  {
    name: 'Android launcher label',
    ok: androidStrings.includes('<string name="app_name">Pal Tavern</string>')
      && androidStrings.includes('<string name="title_activity_main">Pal Tavern</string>'),
    detail: 'android/app/src/main/res/values/strings.xml Pal Tavern',
  },
  {
    name: 'Android version v1.0.8',
    ok: androidBuildGradle.includes('versionCode 9')
      && androidBuildGradle.includes('versionName "1.0.8"'),
    detail: 'android/app/build.gradle versionCode 9 versionName 1.0.8',
  },
  {
    name: 'Capacitor CLI dependency',
    ok: existsSync(path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'cap.cmd' : 'cap')),
    detail: 'node_modules/.bin/cap',
  },
  {
    name: 'Capacitor Android package',
    ok: existsSync(path.join(root, 'node_modules', '@capacitor', 'android')),
    detail: 'node_modules/@capacitor/android',
  },
  {
    name: 'Native Android project',
    ok: existsSync(path.join(root, 'android')),
    detail: 'android/',
  },
  {
    name: 'WorkManager worker',
    ok: existsSync(path.join(nativeDir, 'TavernSocialBackgroundWorker.java')),
    detail: 'TavernSocialBackgroundWorker.java',
  },
  {
    name: 'Capacitor background plugin',
    ok: existsSync(path.join(nativeDir, 'TavernSocialBackgroundPlugin.java')),
    detail: 'TavernSocialBackgroundPlugin.java',
  },
  {
    name: 'Native plugin registration',
    ok: mainActivity.includes('registerPlugin(TavernSocialBackgroundPlugin.class)'),
    detail: 'MainActivity.java',
  },
  {
    name: 'Native in-app back bridge',
    ok: mainActivity.includes('OnBackPressedCallback')
      && mainActivity.includes('tavern-social-android-back')
      && mainActivity.includes('evaluateJavascript'),
    detail: 'MainActivity.java dispatches Android back into the web app',
  },
  {
    name: 'Android notification permission',
    ok: manifest.includes('android.permission.POST_NOTIFICATIONS'),
    detail: 'AndroidManifest.xml',
  },
  {
    name: 'Debug APK',
    ok: existsSync(path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')),
    detail: 'android/app/build/outputs/apk/debug/app-debug.apk',
  },
];

console.log('Tavern Social Android readiness check');
for (const check of checks) {
  console.log(`${check.ok ? 'PASS' : 'MISSING'} ${check.name}: ${check.detail}`);
}

const missing = checks.filter(check => !check.ok);
if (missing.length > 0) {
  console.log('');
  console.log('Android background work is not yet runnable in this workspace.');
  console.log('Run pnpm android:build after restoring the missing dependency, native source, or build artifact.');
  process.exitCode = 1;
} else {
  console.log('');
  console.log('Android background scheduling sources and the debug APK are ready.');
}
