const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');
const axios  = require('axios');
const { spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');
const AdmZip = require('adm-zip');

let win;
const ARCHIVE_EXTS = ['.zip','fxzip','rpf'];

// Build portátil vs instalada
const execName = path.basename(process.execPath).toLowerCase();
const isPortable = execName.endsWith('-portable.exe') || execName.endsWith('.appimage');

// GitHub portable update
const GITHUB_OWNER      = 'psycodeliccircus';
const GITHUB_REPO       = 'fivem-fxap-scanner';
const PORTABLE_EXE_NAME = `${app.getName()}-${app.getVersion()}-portable.exe`;
let tmpDownloadedExePath = null;

function send(channel, payload) {
  if (win && win.webContents) win.webContents.send(channel, payload);
}

// --- Atualização PORTÁTIL ---
async function checkPortableUpdate() {
  try {
    const latestUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
    const resp = await axios.get(latestUrl, { maxRedirects:0, validateStatus:s=>s===302 });
    const tag = resp.headers.location.split('/').pop().replace(/^v/, '');
    if (tag === app.getVersion()) return;
    const downloadUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${tag}/${PORTABLE_EXE_NAME}`;
    await axios.head(downloadUrl, { validateStatus:s=>s<400 });
    send('portable-update-available', { message:`Nova versão: ${tag}`, downloadUrl });
  } catch (e) {
    send('update-error', { message:e.message });
  }
}
async function downloadPortableToTemp(url) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(),'update-'));
  const tmpName=path.basename(url), tmpPath=path.join(tmpDir,tmpName);
  const writer = fs.createWriteStream(tmpPath);
  const resp = await axios({url, responseType:'stream'});
  const total=+resp.headers['content-length']||0;
  let dl=0, lt=Date.now(), lb=0;
  resp.data.on('data',c=>{
    dl+=c.length; const n=Date.now(),dt=(n-lt)/1000;
    const speed=Math.round((dl-lb)/1024/(dt||1));
    const pct=total?Math.round(dl*100/total):0;
    send('portable-download-progress',{percent:pct,kb:speed});
    lt=n; lb=dl;
  });
  resp.data.pipe(writer);
  await new Promise(r=>writer.on('finish',r));
  tmpDownloadedExePath=tmpPath;
  send('portable-download-complete',{message:'Download concluído'});
}
function replaceAndRestartPortable() {
  const dir=process.env.PORTABLE_EXECUTABLE_DIR;
  const real=path.join(dir,PORTABLE_EXE_NAME);
  const temp=tmpDownloadedExePath;
  const bat=`@echo off
:wait
rename "${real}" "${PORTABLE_EXE_NAME}.old" 2>nul || (timeout /T 1>nul&goto wait)
copy "${temp}" "${real}" >nul
start "" "${real}"`
  const batDir=fs.mkdtempSync(path.join(os.tmpdir(),'update-bat-'));
  const batPath=path.join(batDir,'update.bat');
  fs.writeFileSync(batPath,bat);
  spawn('cmd.exe',['/c',batPath],{detached:true,stdio:'ignore'}).unref();
  app.exit(0);
}

// --- Criar window ---
function createWindow() {
  win=new BrowserWindow({
    width:900,height:700,frame:false,
    icon:getAssetPath('icon.png'),
    minimizable:true, maximizable:true, closable:true,
    webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true}
  });
  if(app.isPackaged) win.loadFile(path.join(__dirname,'../dist/index.html'));
  else win.loadURL('http://localhost:3000');
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.on('closed',()=>app.quit());
}
function getAssetPath(f) { return app.isPackaged
  ? path.join(process.resourcesPath,'assets',f)
  : path.join(__dirname,'../src/assets',f);
}

// --- IPC Window Controls ---
ipcMain.on('window:minimize',()=>win&&win.minimize());
ipcMain.on('window:maximize',()=>win&&
  (win.isMaximized()?win.unmaximize():win.maximize())
);
ipcMain.on('window:close',   ()=>win&&win.close());

// --- Auto-updater instalado ---
if(!isPortable) {
  autoUpdater.autoDownload=false;
  autoUpdater.on('checking-for-update',()=>send('update-checking'));
  autoUpdater.on('update-available',info=>send('update-available',info));
  autoUpdater.on('update-not-available',()=>send('update-not-available'));
  autoUpdater.on('error',err=>send('update-error',err.toString()));
  autoUpdater.on('download-progress',pr=>send('update-progress',pr));
  autoUpdater.on('update-downloaded',()=>send('update-downloaded'));
  ipcMain.on('update-check',  ()=>autoUpdater.checkForUpdates());
  ipcMain.on('update-download',()=>autoUpdater.downloadUpdate());
  ipcMain.on('update-install',()=>autoUpdater.quitAndInstall());
} else console.log('🔒 Auto-update desativado em build portátil.');

// --- App ready ---
app.whenReady().then(()=>{
  createWindow(); if(isPortable) checkPortableUpdate();
});

// --- IPC portable ---
ipcMain.on('portable-update-download',(_,d)=>downloadPortableToTemp(d.downloadUrl));
ipcMain.on('portable-update-restart',replaceAndRestartPortable);

// --- IPC dialogs & scan & delete ---
ipcMain.handle('dialog:selectFolder', async()=>{
  const {canceled,filePaths}=await dialog.showOpenDialog({properties:['openDirectory','multiSelections']});
  return canceled?[]:filePaths;
});
ipcMain.handle('dialog:selectFile', async()=>{
  const {canceled,filePaths}=await dialog.showOpenDialog({
    properties:['openFile','multiSelections'],
    filters:[{name:'Compactados',extensions:ARCHIVE_EXTS.map(e=>e.slice(1))}]
  }); return canceled?[]:filePaths;
});
ipcMain.handle('scan-resources', async(_,paths)=>{ for(const b of paths) await scanResources([b]); });
ipcMain.handle('delete-resource',(_,fp)=>{ try{ const s=fs.statSync(fp); s.isDirectory()?fs.rmSync(fp,{recursive:true,force:true}):fs.unlinkSync(fp); return {success:true}; }catch(e){return {success:false,error:e.message};} });
ipcMain.handle('app:get-info',()=>({name:app.getName(),version:app.getVersion()}));

async function scanResources(paths){ for(const b of paths){ const all=walkAll(b); for(let i=0;i<all.length;i++){ const full=all[i], s=fs.statSync(full); let fx=[]; if(s.isDirectory()) fx=fs.readdirSync(full).filter(n=>n.toLowerCase().endsWith('.fxap')); else if(ARCHIVE_EXTS.includes(path.extname(full).toLowerCase())){ const zip=new AdmZip(full); fx=zip.getEntries().map(e=>e.entryName).filter(n=>n.toLowerCase().endsWith('.fxap')); } send('scan-progress',{processed:i+1,total:all.length,entry:{full,files:fx}});}}}
function walkAll(base){ const out=[]; (function r(p){ out.push(p); if(fs.statSync(p).isDirectory()){ for(const n of fs.readdirSync(p))r(path.join(p,n)); }})(base); return out; }