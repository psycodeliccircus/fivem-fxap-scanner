// main.js
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');
const axios  = require('axios');
const si     = require('systeminformation');
const { spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');
const AdmZip = require('adm-zip');
const log    = require('electron-log');

// Configurações de log
log.transports.file.level    = 'info';
log.transports.file.file     = path.join(app.getPath('userData'), 'logs/main.log');
log.transports.console.level = 'debug';

let win;
const ARCHIVE_EXTS = ['.zip','fxzip','rpf'];

// Detecta portable vs instalado
const execName   = path.basename(process.execPath).toLowerCase();
const isPortable = execName.endsWith('-portable.exe') || execName.endsWith('.appimage');
log.info(`App iniciado. Build: ${isPortable ? 'Portátil' : 'Instalada'}`);

// Config do portable update
const GITHUB_OWNER      = 'psycodeliccircus';
const GITHUB_REPO       = 'fivem-fxap-scanner';
const PORTABLE_EXE_NAME = `${app.getName()}-${app.getVersion()}-portable.exe`;
let tmpDownloadedExePath = null;

function send(channel, payload) {
  if (win && win.webContents) win.webContents.send(channel, payload);
}

// --- Portable Update Helpers ---
async function checkPortableUpdate() {
  log.info('checkPortableUpdate(): verificando última versão em GitHub');
  try {
    const latestUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
    const resp = await axios.get(latestUrl, { maxRedirects:0, validateStatus:s=>s===302 });
    const tag = resp.headers.location.split('/').pop().replace(/^v/, '');
    log.info(`Latest tag: ${tag}, versão atual: ${app.getVersion()}`);
    if (tag === app.getVersion()) {
      log.info('Portátil: já na versão mais recente');
      return;
    }
    const downloadUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${tag}/${PORTABLE_EXE_NAME}`;
    await axios.head(downloadUrl, { validateStatus:s=>s<400 });
    log.info(`Portable update disponível: ${downloadUrl}`);
    send('portable-update-available', { message:`Nova versão: ${tag}`, downloadUrl });
  } catch (err) {
    log.error('Erro em checkPortableUpdate():', err);
    send('update-error', { message: err.message });
  }
}

async function downloadPortableToTemp(downloadUrl) {
  log.info('downloadPortableToTemp(): iniciando download', downloadUrl);
  try {
    const tmpDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'update-'));
    const tmpName = path.basename(downloadUrl);
    const tmpPath = path.join(tmpDir, tmpName);
    const writer  = fs.createWriteStream(tmpPath);
    const resp    = await axios({ url: downloadUrl, responseType:'stream' });
    const total   = parseInt(resp.headers['content-length'],10) || 0;
    let dl = 0, lt = Date.now(), lb = 0;

    resp.data.on('data', chunk => {
      dl += chunk.length;
      const now = Date.now(), dt = (now - lt) / 1000;
      const speed = Math.round((dl - lb) / 1024 / (dt || 1));
      const pct   = total ? Math.round(dl * 100 / total) : 0;
      send('portable-download-progress', { percent: pct, kb: speed });
      lt = now; lb = dl;
    });

    resp.data.pipe(writer);
    await new Promise((res, rej) => writer.on('finish', res).on('error', rej));

    tmpDownloadedExePath = tmpPath;
    log.info('downloadPortableToTemp(): concluído em', tmpPath);
    send('portable-download-complete', { message:'Download concluído' });
  } catch (err) {
    log.error('Erro em downloadPortableToTemp():', err);
    send('update-error', { message: err.message });
  }
}

function replaceAndRestartPortable() {
  log.info('replaceAndRestartPortable(): substituindo executável');
  if (!tmpDownloadedExePath) return log.warn('Nenhum binário temporário definido');
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
  if (!portableDir) return log.error('PORTABLE_EXECUTABLE_DIR não definido');

  const real = path.join(portableDir, PORTABLE_EXE_NAME);
  const temp = tmpDownloadedExePath;
  const bat = `@echo off
:wait
rename "${real}" "${PORTABLE_EXE_NAME}.old" 2>nul || (timeout /T 1>nul & goto wait)
copy "${temp}" "${real}" >nul
start "" "${real}"`;

  const batDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'update-bat-'));
  const batPath = path.join(batDir, 'update-portable.bat');
  fs.writeFileSync(batPath, bat, 'utf8');

  spawn('cmd.exe', ['/c', batPath], { detached:true, stdio:'ignore' }).unref();
  app.exit(0);
}

// --- Criação da Janela ---
function createWindow() {
  log.info('createWindow(): criando BrowserWindow');
  win = new BrowserWindow({
    width: 900,
    height: 700,
    frame: false,
    icon: getAssetPath('icon.png'),
    minimizable: true,
    maximizable: true,
    closable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  });

  const url = app.isPackaged
    ? path.join(__dirname, '../dist/index.html')
    : 'http://localhost:3000';

  if (app.isPackaged) win.loadFile(url);
  else win.loadURL(url);

  // Impede abertura de links externos
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // Dispara checagem de update assim que o conteúdo renderizar
  win.webContents.on('did-finish-load', () => {
    if (isPortable) {
      checkPortableUpdate();
    } else {
      log.info('did-finish-load: checando updates (instalado)');
      autoUpdater.checkForUpdates();
    }
  });
}

function getAssetPath(filename) {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'assets', filename)
    : path.join(__dirname, '../src/assets', filename);
}

// --- IPC: Controles de Janela ---
ipcMain.on('window:minimize', () => win && win.minimize());
ipcMain.on('window:maximize', () => {
  if (win) win.isMaximized() ? win.unmaximize() : win.maximize();
});
ipcMain.on('window:close', () => win && win.close());

// --- AutoUpdater (instalado) ---
if (!isPortable) {
  log.info('Inicializando autoUpdater (instalado)');
  autoUpdater.autoDownload = false;

  autoUpdater.on('checking-for-update', () => send('update-checking'));
  autoUpdater.on('update-available', info => send('update-available', info));
  autoUpdater.on('update-not-available', () => send('update-not-available'));
  autoUpdater.on('error', err => send('update-error', err.toString()));
  autoUpdater.on('download-progress', prog => send('update-progress', prog));
  autoUpdater.on('update-downloaded', () => send('update-downloaded'));

  ipcMain.on('update-check',   () => autoUpdater.checkForUpdates());
  ipcMain.on('update-download',() => autoUpdater.downloadUpdate());
  ipcMain.on('update-install', () => autoUpdater.quitAndInstall());
} else {
  log.info('Auto-update desativado em build portátil');
}

// --- App Lifecycle ---
app.whenReady().then(() => {
  createWindow();
});
app.on('window-all-closed', () => app.quit());

// --- IPC Portable ---
ipcMain.on('portable-update-download', (_, data) => {
  downloadPortableToTemp(data.downloadUrl);
});
ipcMain.on('portable-update-restart', () => {
  replaceAndRestartPortable();
});

// --- IPC Dialogs / Scan / Delete ---
ipcMain.handle('dialog:selectFolder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory','multiSelections']
  });
  return canceled ? [] : filePaths;
});

ipcMain.handle('dialog:selectFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile','multiSelections'],
    filters: [{ name:'Compactados', extensions: ARCHIVE_EXTS.map(e=>e.slice(1)) }]
  });
  return canceled ? [] : filePaths;
});

ipcMain.handle('scan-resources', async (_, paths) => {
  for (const base of paths) {
    await scanResources([base]);
  }
});

ipcMain.handle('delete-resource', (_, fullPath) => {
  try {
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) fs.rmSync(fullPath, { recursive:true, force:true });
    else fs.unlinkSync(fullPath);
    return { success:true };
  } catch (e) {
    return { success:false, error:e.message };
  }
});

ipcMain.handle('app:get-info', () => ({
  name: app.getName(),
  version: app.getVersion()
}));

// --- IPC SystemInformation ---
ipcMain.handle('sysinfo:getAll', async () => {
  const [osInfo, cpu, mem, disk] = await Promise.all([
    si.osInfo(),
    si.cpu(),
    si.mem(),
    si.fsSize()
  ]);
  return { osInfo, cpu, mem, disk };
});

// --- Helpers de Scan ---
async function scanResources(paths) {
  for (const base of paths) {
    const all = walkAll(base);
    for (let i = 0; i < all.length; i++) {
      const full = all[i];
      let fxaps = [];
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        fxaps = fs.readdirSync(full).filter(n => n.toLowerCase().endsWith('.fxap'));
      } else if (stat.isFile() && ARCHIVE_EXTS.includes(path.extname(full).toLowerCase())) {
        const zip = new AdmZip(full);
        fxaps = zip.getEntries()
                  .map(e => e.entryName)
                  .filter(n => n.toLowerCase().endsWith('.fxap'));
      }
      send('scan-progress', {
        processed: i + 1,
        total: all.length,
        entry: { full, files: fxaps }
      });
    }
  }
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
