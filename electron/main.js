const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs   = require('fs');
const { autoUpdater } = require('electron-updater');
const AdmZip = require('adm-zip');

let win;
const ARCHIVE_EXTS = ['.zip','fxzip','rpf'];

function getAssetPath(fileName) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'assets', fileName);
  } else {
    return path.join(__dirname, '../src/assets', fileName);
  }
}

function collectFxapFromDir(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(dirent => {
    const full = path.join(dir, dirent.name);
    if (dirent.isDirectory()) return collectFxapFromDir(full);
    if (dirent.isFile() && dirent.name.toLowerCase().endsWith('.fxap'))
      return [dirent.name];
    return [];
  });
}

function walkAll(base) {
  const out = [];
  (function recurse(p) {
    out.push(p);
    if (fs.statSync(p).isDirectory()) {
      for (const name of fs.readdirSync(p)) {
        recurse(path.join(p, name));
      }
    }
  })(base);
  return out;
}

async function scanResources(paths) {
  for (const base of paths) {
    const all = walkAll(base);
    const total = all.length;
    for (let i = 0; i < total; i++) {
      const full = all[i];
      let fxaps = [];
      const stat = fs.statSync(full);

      if (stat.isDirectory()) {
        fxaps = fs.readdirSync(full)
          .filter(n => n.toLowerCase().endsWith('.fxap'));
      } else if (
        stat.isFile() &&
        ARCHIVE_EXTS.includes(path.extname(full).toLowerCase())
      ) {
        const zip = new AdmZip(full);
        fxaps = zip.getEntries()
          .map(e => e.entryName)
          .filter(n => n.toLowerCase().endsWith('.fxap'));
      }

      win.webContents.send('scan-progress', {
        processed: i + 1,
        total,
        entry: { full, files: fxaps }
      });
    }
  }
}

function createWindow() {
  if (process.platform === 'darwin') {
    app.dock.setIcon(getAssetPath('icon.png'));
  }

  win = new BrowserWindow({
    width: 900,
    height: 700,
    frame: false,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  });

  if (app.isPackaged) {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  } else {
    win.loadURL('http://localhost:3000');
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.on('closed', () => app.quit());
}

// ─── Auto-Updater ────────────────────────────────────────────────
autoUpdater.autoDownload = false;
autoUpdater.on('checking-for-update', () => win.webContents.send('update-checking'));
autoUpdater.on('update-available',       info => win.webContents.send('update-available', info));
autoUpdater.on('update-not-available',    ()   => win.webContents.send('update-not-available'));
autoUpdater.on('error',                   err  => win.webContents.send('update-error', err.toString()));
autoUpdater.on('download-progress',       pr   => win.webContents.send('update-progress', pr));
autoUpdater.on('update-downloaded',       ()   => win.webContents.send('update-downloaded'));

// ─── App Events ─────────────────────────────────────────────────
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

// ─── IPC Window & Dialogs ────────────────────────────────────────
ipcMain.on('window:minimize',  () => win.minimize());
ipcMain.on('window-maximize',  () => win.isMaximized() ? win.unmaximize() : win.maximize());
ipcMain.on('window-close',     () => win.close());

ipcMain.handle('dialog:selectFolder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory','multiSelections']
  });
  return canceled ? [] : filePaths;
});
ipcMain.handle('dialog:selectFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile','multiSelections'],
    filters: [{ name: 'Compactados', extensions: ARCHIVE_EXTS.map(e => e.slice(1)) }]
  });
  return canceled ? [] : filePaths;
});

// ─── IPC Scan & Delete ────────────────────────────────────────────
ipcMain.handle('scan-resources', async (_, paths) => {
  await scanResources(paths);
});
ipcMain.handle('delete-resource', (_, fullPath) => {
  try {
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) fs.rmSync(fullPath, { recursive:true, force:true });
    else fs.unlinkSync(fullPath);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ─── IPC App Info & Updates ──────────────────────────────────────
ipcMain.handle('app:get-info', () => ({
  name: app.getName(),
  version: app.getVersion()
}));
ipcMain.on('update-check',     () => autoUpdater.checkForUpdates());
ipcMain.on('update-download',  () => autoUpdater.downloadUpdate());
ipcMain.on('update-install',   () => autoUpdater.quitAndInstall());
