export {};
declare const require: (id: string) => any;
declare const process: { exitCode?: number };

const fs = require('node:fs') as typeof import('node:fs');
const path = require('node:path') as typeof import('node:path');

const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
const stylesPath = path.join(root, 'android', 'app', 'src', 'main', 'res', 'values', 'styles.xml');
const activityPath = path.join(
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
const buildGradlePath = path.join(root, 'android', 'app', 'build.gradle');
const variablesGradlePath = path.join(root, 'android', 'variables.gradle');
const appSourceRoot = path.join(root, 'android', 'app', 'src', 'main');

function read(file: string) {
  return fs.readFileSync(file, 'utf8');
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function styleBlock(styles: string, name: string) {
  const match = styles.match(new RegExp(`<style\\s+name="${name}"[^>]*>[\\s\\S]*?<\\/style>`));
  assert(match, `Missing Android style ${name}.`);
  return match[0];
}

function styleParent(styles: string, name: string) {
  const match = styles.match(new RegExp(`<style\\s+name="${name}"\\s+parent="([^"]+)"`));
  return match?.[1] ?? '';
}

function itemValue(block: string, name: string) {
  const match = block.match(new RegExp(`<item\\s+name="${name}">([^<]+)<\\/item>`));
  return match?.[1]?.trim() ?? '';
}

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return entry.isFile() && /\.(?:java|kt|xml)$/.test(entry.name) ? [fullPath] : [];
  });
}

function relative(file: string) {
  return path.relative(root, file).replace(/\\/g, '/');
}

try {
  const manifest = read(manifestPath);
  const styles = read(stylesPath);
  const activity = read(activityPath);
  const buildGradle = read(buildGradlePath);
  const variablesGradle = read(variablesGradlePath);
  const launchStyle = styleBlock(styles, 'AppTheme.NoActionBarLaunch');

  assert(
    /android:name="\.MainActivity"[\s\S]*?android:theme="@style\/AppTheme\.NoActionBarLaunch"/.test(manifest),
    'MainActivity must use the dedicated launch splash theme.',
  );
  assert(
    styleParent(styles, 'AppTheme.NoActionBarLaunch') === 'Theme.SplashScreen',
    'The launch theme must inherit AndroidX Theme.SplashScreen for Android 12+ splash compatibility.',
  );
  assert(
    itemValue(launchStyle, 'postSplashScreenTheme') === '@style/AppTheme.NoActionBar',
    'The splash theme must switch back to the AppCompat app theme through postSplashScreenTheme.',
  );
  assert(
    itemValue(launchStyle, 'windowSplashScreenBackground').startsWith('@color/'),
    'The splash theme must define a color windowSplashScreenBackground.',
  );
  assert(
    itemValue(launchStyle, 'windowSplashScreenAnimatedIcon').length > 0,
    'The splash theme must define windowSplashScreenAnimatedIcon.',
  );
  assert(
    !itemValue(launchStyle, 'android:background'),
    'The launch splash theme should use SplashScreen window attributes instead of android:background.',
  );
  assert(
    /androidx\.core:core-splashscreen:\$coreSplashScreenVersion/.test(buildGradle)
      && /coreSplashScreenVersion\s*=\s*'[^']+'/.test(variablesGradle),
    'AndroidX core-splashscreen must stay wired through Gradle.',
  );
  assert(
    /import\s+androidx\.core\.splashscreen\.SplashScreen;/.test(activity),
    'MainActivity must import AndroidX SplashScreen.',
  );
  const installIndex = activity.indexOf('SplashScreen.installSplashScreen(this);');
  const superIndex = activity.indexOf('super.onCreate(savedInstanceState);');
  assert(installIndex >= 0, 'MainActivity must call SplashScreen.installSplashScreen(this).');
  assert(
    superIndex >= 0 && installIndex < superIndex,
    'SplashScreen.installSplashScreen(this) must run before super.onCreate(savedInstanceState).',
  );

  const edgeToEdgePatterns = [
    /\bEdgeToEdge\b/,
    /\benableEdgeToEdge\s*\(/,
    /\bWindowCompat\s*\./,
    /\bsetDecorFitsSystemWindows\s*\(/,
  ];
  const explicitEdgeToEdgeCalls = walk(appSourceRoot).flatMap(file => {
    const content = read(file);
    return edgeToEdgePatterns.some(pattern => pattern.test(content)) ? [relative(file)] : [];
  });
  assert(
    explicitEdgeToEdgeCalls.length === 0,
    `App source should not enable edge-to-edge during launch: ${explicitEdgeToEdgeCalls.join(', ')}`,
  );

  console.log(JSON.stringify({
    launchThemeUsesSplashScreen: true,
    postSplashThemeRestoresAppCompat: true,
    splashInstalledBeforeSuperCreate: true,
    noExplicitEdgeToEdgeLaunchCalls: true,
  }));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
