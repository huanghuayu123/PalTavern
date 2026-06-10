const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, Menu, Notification, Tray, nativeImage, session, shell } = require('electron');

let localServer;
let mainWindow;
let tray;
let isQuitting = false;
let hasShownTrayNotice = false;

const singleInstanceLock = app.requestSingleInstanceLock();
const appRoot = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..');
const smokeTest = process.env.TAVERN_SOCIAL_SMOKE_TEST === '1';

if (!singleInstanceLock) {
  app.quit();
}

if (process.platform === 'win32') {
  app.setAppUserModelId('com.tavernsocial.desktop');
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
  const win = new BrowserWindow({
    show: !smokeTest,
    width: 1180,
    height: 780,
    minWidth: 920,
    minHeight: 620,
    title: 'Tavern Social',
    backgroundColor: '#eef2f8',
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.webContents.setWindowOpenHandler(({ url: target }) => {
    void shell.openExternal(target);
    return { action: 'deny' };
  });

  // Keep the independent app alive in the tray; the renderer scheduler keeps running while hidden.
  win.on('close', event => {
    if (isQuitting) {
      return;
    }
    event.preventDefault();
    hideToTray(win);
  });

  win.on('minimize', event => {
    event.preventDefault();
    hideToTray(win);
  });

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
  ensureTray();
}

function hideToTray(win) {
  win.hide();
  ensureTray();
  if (!hasShownTrayNotice && Notification.isSupported()) {
    hasShownTrayNotice = true;
    new Notification({
      title: 'Tavern Social is still running',
      body: 'The app is minimized to the tray. Active message checks continue while the desktop app stays open.',
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
  tray.setToolTip('Tavern Social');
  updateTrayMenu();
  tray.on('click', showMainWindow);
}

function showMainWindow() {
  mainWindow?.show();
  mainWindow?.focus();
}

function updateTrayMenu() {
  tray?.setContextMenu(Menu.buildFromTemplate([
    {
      label: 'Tavern Social is running in the background',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Show Tavern Social',
      click: showMainWindow,
    },
    {
      label: 'Quit',
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
  localServer?.server?.close();
});
