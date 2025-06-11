// main.js
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');
const axios  = require('axios');
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

// --- Portable Update ---
async function checkPortableUpdate() {
  log.info('checkPortableUpdate(): verificando última versão em GitHub');
  try {
    const latestUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
    const resp = await axios.get(latestUrl, { maxRedirects:0, validateStatus:s=>s===302 });
    const tag = resp.headers.location.split('/').pop().replace(/^v/, '');
    log.info(`Latest tag: ${tag}, versão atual: ${app.getVersion()}`);
    if (tag === app.getVersion()) return log.info('Portátil: já na versão mais recente');
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
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(),'update-'));
    const tmpName=path.basename(downloadUrl);
    const tmpPath=path.join(tmpDir,tmpName);
    const writer = fs.createWriteStream(tmpPath);
    const resp = await axios({ url: downloadUrl, responseType:'stream' });
    const total = parseInt(resp.headers['content-length'],10) || 0;
    let dl=0, lt=Date.now(), lb=0;
    resp.data.on('data', chunk => {
      dl += chunk.length;
      const now = Date.now(), dt=(now-lt)/1000;
      const speed = Math.round((dl-lb)/1024/(dt||1));
      const pct = total ? Math.round(dl*100/total) : 0;
      send('portable-download-progress',{ percent:pct, kb:speed });
      lt = now; lb = dl;
    });
    resp.data.pipe(writer);
    await new Promise((r,rej)=>writer.on('finish',r).on('error',rej));
    tmpDownloadedExePath = tmpPath;
    log.info('downloadPortableToTemp(): concluído em', tmpPath);
    send('portable-download-complete',{ message:'Download concluído' });
  } catch (err) {
    log.error('Erro em downloadPortableToTemp():', err);
    send('update-error',{ message: err.message });
  }
}

function replaceAndRestartPortable() {
  log.info('replaceAndRestartPortable(): substituindo executável');
  if (!tmpDownloadedExePath) return log.warn('Nenhum binário temporário definido');
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
  if (!portableDir) return log.error('PORTABLE_EXECUTABLE_DIR não definido');
  const real = path.join(portableDir,PORTABLE_EXE_NAME);
  const temp = tmpDownloadedExePath;
  const bat = `@echo off
:wait
rename "${real}" "${PORTABLE_EXE_NAME}.old" 2>nul || (timeout /T 1>nul & goto wait)
copy "${temp}" "${real}" >nul
start "" "${real}"`;
  const batDir=fs.mkdtempSync(path.join(os.tmpdir(),'update-bat-'));
  const batPath=path.join(batDir,'update-portable.bat');
  fs.writeFileSync(batPath, bat, 'utf8');
  spawn('cmd.exe',['/c',batPath],{ detached:true, stdio:'ignore' }).unref();
  app.exit(0);
}

// --- Create Window ---
function createWindow() {
  log.info('createWindow(): criando BrowserWindow');
  win = new BrowserWindow({
    width:900, height:700, frame:false,
    icon:getAssetPath('icon.png'),
    minimizable:true, maximizable:true, closable:true,
    webPreferences:{ preload:path.join(__dirname,'preload.js'), contextIsolation:true }
  });
  const url = app.isPackaged ?
    path.join(__dirname,'../dist/index.html') : 'http://localhost:3000';
  log.info('Carregando URL:', url);
  if (app.isPackaged) win.loadFile(url);
  else win.loadURL(url);
  win.webContents.setWindowOpenHandler(()=>({ action:'deny' }));
}

function getAssetPath(f) {
  return app.isPackaged
    ? path.join(process.resourcesPath,'assets',f)
    : path.join(__dirname,'../src/assets',f);
}

// --- IPC Window Controls ---
ipcMain.on('window:minimize',()=>{ log.info('IPC: minimizar janela'); if(win) win.minimize(); });
ipcMain.on('window:maximize',()=>{ log.info('IPC: maximizar/janela'); if(win) win.isMaximized()?win.unmaximize():win.maximize(); });
ipcMain.on('window:close',   ()=>{ log.info('IPC: fechar janela'); if(win) win.close(); });

// --- AutoUpdater (instalado) ---
if (!isPortable) {
  log.info('Inicializando autoUpdater (instalado)');
  autoUpdater.autoDownload = false;
  autoUpdater.on('checking-for-update',()=>{ log.info('AutoUpdater: checando'); send('update-checking'); });
  autoUpdater.on('update-available',info=>{ log.info('AutoUpdater: disponível',info); send('update-available',info); });
  autoUpdater.on('update-not-available',()=>{ log.info('AutoUpdater: não disponível'); send('update-not-available'); });
  autoUpdater.on('error',err=>{ log.error('AutoUpdater: erro',err); send('update-error',err.toString()); });
  autoUpdater.on('download-progress',pr=>{ log.info('AutoUpdater: progresso',pr); send('update-progress',pr); });
  autoUpdater.on('update-downloaded',()=>{ log.info('AutoUpdater: baixado'); send('update-downloaded'); });
  ipcMain.on('update-check',()=>autoUpdater.checkForUpdates());
  ipcMain.on('update-download',()=>autoUpdater.downloadUpdate());
  ipcMain.on('update-install',()=>autoUpdater.quitAndInstall());
} else log.info('Auto-update desativado em build portátil');

// --- App Lifecycle ---
app.whenReady().then(()=>{ log.info('App ready'); createWindow(); if(isPortable) checkPortableUpdate(); });
app.on('window-all-closed',()=>{ log.info('window-all-closed'); app.quit(); });

// --- IPC Portable ---
ipcMain.on('portable-update-download',(_,d)=>{ log.info('IPC: portable-download',d); downloadPortableToTemp(d.downloadUrl); });
ipcMain.on('portable-update-restart',()=>{ log.info('IPC: portable-restart'); replaceAndRestartPortable(); });

// --- IPC Dialogs / Scan / Delete ---
ipcMain.handle('dialog:selectFolder', async ()=>{
  log.info('IPC: dialog:selectFolder');
  const { canceled, filePaths } = await dialog.showOpenDialog({ properties:['openDirectory','multiSelections'] });
  log.info('Pastas selecionadas:', filePaths);
  return canceled ? [] : filePaths;
});
ipcMain.handle('dialog:selectFile', async ()=>{
  log.info('IPC: dialog:selectFile');
  const { canceled, filePaths } = await dialog.showOpenDialog({ properties:['openFile','multiSelections'], filters:[{name:'Compactados',extensions:ARCHIVE_EXTS.map(e=>e.slice(1))}] });
  log.info('Arquivos selecionados:', filePaths);
  return canceled ? [] : filePaths;
});
ipcMain.handle('scan-resources', async (_, paths)=>{
  log.info('IPC: scan-resources', paths);
  for(const base of paths) await scanResources([base]);
});
ipcMain.handle('delete-resource', (_, fullPath)=>{
  log.info('IPC: delete-resource', fullPath);
  try { const stat = fs.statSync(fullPath); stat.isDirectory()?fs.rmSync(fullPath,{recursive:true,force:true}):fs.unlinkSync(fullPath); return {success:true}; }
  catch(e) { log.error('Erro delete-resource', e); return {success:false,error:e.message}; }
});
ipcMain.handle('app:get-info',()=>({ name:app.getName(), version:app.getVersion() }));

// --- Scan Helpers ---
async function scanResources(paths) {
  for(const base of paths) {
    const all = walkAll(base);
    for(let i=0;i<all.length;i++){
      const full = all[i];
      let fxaps = [];
      const stat = fs.statSync(full);
      if(stat.isDirectory()) fxaps = fs.readdirSync(full).filter(n=>n.toLowerCase().endsWith('.fxap'));
      else if(stat.isFile()&&ARCHIVE_EXTS.includes(path.extname(full).toLowerCase())){
        const zip=new AdmZip(full);
        fxaps=zip.getEntries().map(e=>e.entryName).filter(n=>n.toLowerCase().endsWith('.fxap'));
      }
      send('scan-progress',{processed:i+1,total:all.length,entry:{full,files:fxaps}});
    }
  }
}

function walkAll(base) {
  const out=[]; (function r(p){ out.push(p); if(fs.statSync(p).isDirectory()){ for(const n of fs.readdirSync(p))r(path.join(p,n)); } })(base); return out;
}
