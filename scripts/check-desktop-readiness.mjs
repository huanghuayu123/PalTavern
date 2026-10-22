import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const executable = process.platform === 'win32' ? '.cmd' : '';
const desktopPackagePath = path.join(root, 'desktop', 'package.json');
const desktopPackage = existsSync(desktopPackagePath)
  ? JSON.parse(readFileSync(desktopPackagePath, 'utf8'))
  : {};
const desktopVersion = typeof desktopPackage.version === 'string' ? desktopPackage.version : '0.0.0';
// electron-builder.yml sets productName and executableName to PalTavern.
const installerName = `PalTavern-${desktopVersion}-x64.exe`;
const checks = [
  ['Independent web build', path.join(root, 'dist', 'independent-chat', 'index.html')],
  ['Electron desktop entry', path.join(root, 'desktop', 'main.cjs')],
  ['Desktop package metadata', path.join(root, 'desktop', 'package.json')],
  ['Electron runtime', path.join(root, 'node_modules', '.bin', `electron${executable}`)],
  ['Electron Builder', path.join(root, 'node_modules', '.bin', `electron-builder${executable}`)],
  ['Electron Builder config', path.join(root, 'electron-builder.yml')],
  ['Windows unpacked executable', path.join(root, 'release', 'win-unpacked', 'PalTavern.exe')],
  ['Windows installer', path.join(root, 'release', installerName)],
];

console.log('PalTavern desktop readiness check');
let ready = true;
for (const [name, target] of checks) {
  const ok = existsSync(target);
  ready &&= ok;
  console.log(`${ok ? 'PASS' : 'MISSING'} ${name}: ${path.relative(root, target)}`);
}
if (!ready) {
  console.log('');
  console.log('Desktop readiness is incomplete. Missing items may be dependencies from pnpm install, the web build from pnpm build, or Windows artifacts from pnpm electron:dist.');
  process.exitCode = 1;
} else {
  console.log('');
  console.log('Desktop runtime, unpacked application, and installer are ready.');
}
