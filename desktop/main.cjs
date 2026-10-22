const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, Menu, Notification, Tray, nativeImage, screen, session, shell } = require('electron');

let localServer;
let mainWindow;
let tray;
let isQuitting = false;
let hasShownTrayNotice = false;
let windowStateTimer;

const singleInstanceLock = app.requestSingleInstanceLock();
const appRoot = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..');
const smokeTest = process.env.TAVERN_SOCIAL_SMOKE_TEST === '1';
const PHONE_LAYOUT_BREAKPOINT = 980;

if (!singleInstanceLock) {
  app.quit();
}

if (process.platform === 'win32') {
  app.setAppUserModelId('com.tavernsocial.desktop');
}

function windowStateFile() {
  return path.join(app.getPath('userData'), 'paltavern-window-state.json');
}

function readSavedWindowState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(windowStateFile(), 'utf8'));
    const width = Number(parsed?.width);
    const height = Number(parsed?.height);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
    const x = Number(parsed.x);
    const y = Number(parsed.y);
    return {
      width,
      height,
      x: Number.isFinite(x) ? x : undefined,
      y: Number.isFinite(y) ? y : undefined,
      maximized: parsed.maximized === true,
    };
  } catch {
    return null;
  }
}

function boundsStayOnADisplay(bounds) {
  if (typeof bounds.x !== 'number' || typeof bounds.y !== 'number') return false;
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  return screen.getAllDisplays().some(display => {
    const area = display.workArea;
    return centerX >= area.x
      && centerX < area.x + area.width
      && centerY >= area.y
      && centerY < area.y + area.height;
  });
}

function rememberWindowState(win) {
  if (smokeTest || !win || win.isDestroyed()) return;
  const maximized = win.isMaximized();
  const normal = maximized ? win.getNormalBounds() : win.getBounds();
  const payload = {
    width: normal.width,
    height: normal.height,
    x: normal.x,
    y: normal.y,
    maximized,
  };
  try {
    fs.mkdirSync(path.dirname(windowStateFile()), { recursive: true });
    fs.writeFileSync(windowStateFile(), JSON.stringify(payload));
  } catch (error) {
    console.warn('Could not save the PalTavern window size.', error);
  }
}

function scheduleWindowStateSave(win) {
  if (smokeTest) return;
  clearTimeout(windowStateTimer);
  windowStateTimer = setTimeout(() => rememberWindowState(win), 300);
}

function desktopWindowOptions() {
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  const saved = readSavedWindowState();
  // The web layout switches to the phone shell at 980px. Keep a normal desktop
  // window above that line when the screen itself is wider.
  const minWidth = workArea.width > PHONE_LAYOUT_BREAKPOINT
    ? Math.min(1100, workArea.width)
    : workArea.width;
  const minHeight = Math.min(720, workArea.height);
  const width = Math.min(Math.max(saved?.width || 1280, minWidth), workArea.width);
  const height = Math.min(Math.max(saved?.height || 840, Math.min(640, workArea.height)), workArea.height);
  const options = {
    show: false,
    width,
    height,
    minWidth,
    minHeight,
    title: 'PalTavern',
    backgroundColor: '#eef2f8',
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };
  if (saved && boundsStayOnADisplay({ x: saved.x, y: saved.y, width: options.width, height: options.height })) {
    options.x = saved.x;
    options.y = saved.y;
  }
  return { options, restoreMaximized: Boolean(saved?.maximized) };
}

async function startServer() {
  const serverModulePath = pathToFileURL(
    path.join(appRoot, 'scripts', 'independent-chat-server.mjs'),
  ).href;
  const { startIndependentChatServer } = await import(serverModulePath);
  localServer = await startIndependentChatServer({
    root: path.join(appRoot, 'dist', 'independent-chat'),
    host: '127.0.0.1',
    port: 0,
    quiet: true,
  });
  return localServer.url;
}

async function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }

  const url = await startServer();
  const { options, restoreMaximized } = desktopWindowOptions();
  const win = new BrowserWindow(options);

  win.webContents.setWindowOpenHandler(({ url: target }) => {
    void shell.openExternal(target);
    return { action: 'deny' };
  });
  win.on('page-title-updated', event => {
    event.preventDefault();
  });

  // Keep the independent app alive in the tray; the renderer scheduler keeps running while hidden.
  win.on('close', event => {
    if (isQuitting) {
      rememberWindowState(win);
      return;
    }
    event.preventDefault();
    rememberWindowState(win);
    hideToTray(win);
  });

  win.on('minimize', event => {
    event.preventDefault();
    rememberWindowState(win);
    hideToTray(win);
  });
  win.on('resize', () => scheduleWindowStateSave(win));
  win.on('move', () => scheduleWindowStateSave(win));
  win.on('maximize', () => rememberWindowState(win));
  win.on('unmaximize', () => rememberWindowState(win));

  await win.loadURL(url);
  mainWindow = win;
  if (smokeTest) {
    const hasAppShell = await win.webContents.executeJavaScript(
      "Boolean(document.querySelector('#app') && document.body.textContent.trim())",
    );
    if (!hasAppShell) {
      throw new Error('Desktop smoke test could not find the rendered application shell.');
    }
    isQuitting = true;
    app.quit();
    return;
  }
  if (restoreMaximized) win.maximize();
  win.show();
  ensureTray();
}

function hideToTray(win) {
  win.hide();
  ensureTray();
  if (!hasShownTrayNotice && Notification.isSupported()) {
    hasShownTrayNotice = true;
    new Notification({
      title: 'PalTavern 仍在后台运行',
      body: '窗口已收到系统托盘。应用保持打开时，主动消息会继续检查。',
    }).show();
  }
}

function ensureTray() {
  if (tray) {
    updateTrayMenu();
    return;
  }
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAAMElEQVR42mNgGAWjYBSMglEwCkbBKBgFo2AUjIJRMApGwSgYBaNgFIyCUTAKRsEoGAUAAP//AwA2dQERqJ8mWQAAAABJRU5ErkJggg==',
  );
  tray = new Tray(icon);
  tray.setToolTip('PalTavern');
  updateTrayMenu();
  tray.on('click', showMainWindow);
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function updateTrayMenu() {
  tray?.setContextMenu(Menu.buildFromTemplate([
    {
      label: 'PalTavern 正在后台运行',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: '显示窗口',
      click: showMainWindow,
    },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]));
}

function installPermissionPolicy() {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'notifications');
  });
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => permission === 'notifications');
}

if (singleInstanceLock) {
  app.whenReady()
    .then(() => {
      installPermissionPolicy();
      return createWindow();
    })
    .catch(error => {
      console.error(error);
      process.exitCode = 1;
      isQuitting = true;
      app.quit();
    });
}

app.on('second-instance', () => {
  showMainWindow();
});

app.on('activate', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    showMainWindow();
  } else if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});

app.on('window-all-closed', () => {
  // The tray owns the desktop lifetime; closing the window should not stop the app host.
});

app.on('before-quit', () => {
  isQuitting = true;
  if (mainWindow && !mainWindow.isDestroyed()) rememberWindowState(mainWindow);
  localServer?.server?.close();
});
