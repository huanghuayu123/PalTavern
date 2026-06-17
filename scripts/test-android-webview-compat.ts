export {};
declare const require: (id: string) => any;
declare const process: { exitCode?: number };

const fs = require('node:fs') as typeof import('node:fs');
const path = require('node:path') as typeof import('node:path');

const root = path.resolve(__dirname, '..');
const webpackConfigPath = path.join(root, 'webpack.tavern-social.config.mjs');
const bundlePath = path.join(root, 'dist', 'independent-chat', 'index.js');
const htmlPath = path.join(root, 'dist', 'independent-chat', 'index.html');
const stylesPath = path.join(root, 'src', 'independent-chat', 'styles.css');
const entryPath = path.join(root, 'src', 'independent-chat', 'index.ts');
const polyfillPath = path.join(root, 'src', 'independent-chat', 'polyfills', 'old-android.ts');
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
  if (!/target:\s*\[[^\]]*['"]web['"][^\]]*,[^\]]*['"]es2015['"][^\]]*\]/.test(webpackConfig)) {
    throw new Error('Old Android WebView build must target web + ES2015.');
  }
  if (/outputModule:\s*true/.test(webpackConfig) || /type:\s*['"]module['"]/.test(webpackConfig)) {
    throw new Error('Old Android WebView build must not emit module scripts.');
  }
  if (!/scriptLoading:\s*['"]defer['"]/.test(webpackConfig)) {
    throw new Error('Old Android WebView build must use classic deferred scripts.');
  }
  if (!/target:\s*['"]ES2015['"]/.test(webpackConfig)) {
    throw new Error('TypeScript output for old Android WebView must target ES2015.');
  }
  if (!/ecma:\s*2015/.test(webpackConfig)) {
    throw new Error('Terser output for old Android WebView must target ecma 2015.');
  }

  const entrySource = fs.readFileSync(entryPath, 'utf8');
  const polyfillSource = fs.readFileSync(polyfillPath, 'utf8');
  const styleSource = fs.readFileSync(stylesPath, 'utf8');
  if (!entrySource.includes("import './polyfills/old-android';")) {
    throw new Error('Old Android WebView polyfills must load before the app.');
  }
  for (const required of ['Array.prototype.flatMap', 'Object.fromEntries', 'String.prototype.matchAll']) {
    if (!polyfillSource.includes(required)) {
      throw new Error(`Missing old Android WebView polyfill: ${required}`);
    }
  }
  if (
    !styleSource.includes('Old Android WebView fallback')
    || !styleSource.includes('@supports not (color: color-mix')
    || !styleSource.includes('@supports not (height: 100dvh)')
  ) {
    throw new Error('Old Android WebView stylesheet fallbacks are missing.');
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
      { label: 'native dynamic import', pattern: /\bimport\s*\(/ },
    ].filter(item => item.pattern.test(bundle));
    if (forbidden.length > 0) {
      throw new Error(`Android WebView bundle still contains unsupported syntax/API: ${forbidden.map(item => item.label).join(', ')}`);
    }
  }

  if (fs.existsSync(htmlPath)) {
    const html = fs.readFileSync(htmlPath, 'utf8');
    if (/<script[^>]+type=["']module["']/.test(html)) {
      throw new Error('Old Android WebView HTML must not use type=module scripts.');
    }
  }

  console.log(JSON.stringify({
    oldAndroidWebViewTarget: true,
    classicScriptOutput: true,
    runtimePolyfills: true,
    cssFallbacks: true,
    noAtRuntimeApi: true,
    bundleHasNoModernSyntax: true,
  }));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
