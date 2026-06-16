export {};
declare const require: (id: string) => any;
declare const process: { exitCode?: number };

const fs = require('node:fs') as typeof import('node:fs');
const path = require('node:path') as typeof import('node:path');

const root = path.resolve(__dirname, '..');
const webpackConfigPath = path.join(root, 'webpack.tavern-social.config.mjs');
const bundlePath = path.join(root, 'dist', 'independent-chat', 'index.js');
const sourceRoot = path.join(root, 'src', 'independent-chat');

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return entry.isFile() && /\.(?:ts|tsx|js|mjs)$/.test(entry.name) ? [fullPath] : [];
  });
}

function relative(file: string): string {
  return path.relative(root, file).replace(/\\/g, '/');
}

try {
  const webpackConfig = fs.readFileSync(webpackConfigPath, 'utf8');
  if (!/target:\s*\[[^\]]*['"]web['"][^\]]*,[^\]]*['"]es2019['"][^\]]*\]/.test(webpackConfig)) {
    throw new Error('Android WebView build must target web + ES2019.');
  }
  if (!/target:\s*['"]ES2019['"]/.test(webpackConfig)) {
    throw new Error('TypeScript output for Android WebView must target ES2019.');
  }
  if (!/ecma:\s*2019/.test(webpackConfig)) {
    throw new Error('Terser output for Android WebView must target ecma 2019.');
  }

  const sourceAtViolations = walk(sourceRoot)
    .map(file => ({
      file,
      matches: Array.from(fs.readFileSync(file, 'utf8').matchAll(/\.at\(/g)),
    }))
    .flatMap(({ file, matches }) => matches.map(match => `${relative(file)}:${match.index ?? 0}`));
  if (sourceAtViolations.length > 0) {
    throw new Error(`Android 10 WebView does not support Array/String .at(): ${sourceAtViolations.slice(0, 12).join(', ')}`);
  }

  if (fs.existsSync(bundlePath)) {
    const bundle = fs.readFileSync(bundlePath, 'utf8');
    const forbidden = [
      { label: 'optional chaining', pattern: /\?\.[A-Za-z_$[\(]/ },
      { label: 'nullish coalescing', pattern: /\?\?/ },
      { label: 'Array/String .at()', pattern: /\.at\(/ },
    ].filter(item => item.pattern.test(bundle));
    if (forbidden.length > 0) {
      throw new Error(`Android WebView bundle still contains unsupported syntax/API: ${forbidden.map(item => item.label).join(', ')}`);
    }
  }

  console.log(JSON.stringify({
    androidWebViewTarget: true,
    noAtRuntimeApi: true,
    bundleHasNoModernSyntax: true,
  }));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
