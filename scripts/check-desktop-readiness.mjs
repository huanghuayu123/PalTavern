import { existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const executable = process.platform === 'win32' ? '.cmd' : '';
const checks = [
  ['Independent web build', path.join(root, 'dist', 'independent-chat', 'index.html')],
  ['Electron desktop entry', path.join(root, 'desktop', 'main.cjs')],
  ['Desktop package metadata', path.join(root, 'desktop', 'package.json')],
  ['Electron runtime', path.join(root, 'node_modules', '.bin', `electron${executable}`)],
  ['Electron Builder', path.join(root, 'node_modules', '.bin', `electron-builder${executable}`)],
  ['Electron Builder config', path.join(root, 'electron-builder.yml')],
  ['Windows unpacked executable', path.join(root, 'release', 'win-unpacked', 'TavernSocial.exe')],
  ['Windows installer', path.join(root, 'release', 'Tavern Social-0.1.0-x64.exe')],
];

console.log('Tavern Social desktop readiness check');
let ready = true;
for (const [name, target] of checks) {
  const ok = existsSync(target);
  ready &&= ok;
  console.log(`${ok ? 'PASS' : 'MISSING'} ${name}: ${path.relative(root, target)}`);
}
if (!ready) {
  console.log('');
  console.log('Desktop runtime logic exists, but a distributable package cannot be produced until missing dependencies are installed.');
  process.exitCode = 1;
} else {
  console.log('');
  console.log('Desktop runtime, unpacked application, and installer are ready.');
}
