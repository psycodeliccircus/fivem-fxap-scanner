const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Scan & Dialogs
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  selectFile:   () => ipcRenderer.invoke('dialog:selectFile'),
  scanResources: paths => ipcRenderer.invoke('scan-resources', paths),
  deleteResource: fullPath => ipcRenderer.invoke('delete-resource', fullPath),
  onProgress: fn => ipcRenderer.on('scan-progress', (_, data) => fn(data)),

  // Window controls
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close:    () => ipcRenderer.send('window:close'),

  // App info
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),

  // Auto-update instalado
  checkForUpdates: () => ipcRenderer.send('update-check'),
  downloadUpdate:  () => ipcRenderer.send('update-download'),
  installUpdate:   () => ipcRenderer.send('update-install'),
  onChecking: fn              => ipcRenderer.on('update-checking', fn),
  onUpdateAvailable: fn       => ipcRenderer.on('update-available', (_, info) => fn(info)),
  onUpdateNotAvailable: fn    => ipcRenderer.on('update-not-available', fn),
  onError: fn                 => ipcRenderer.on('update-error', (_, err) => fn(err)),
  onDownloadProgress: fn      => ipcRenderer.on('update-progress', (_, pr) => fn(pr)),
  onUpdateDownloaded: fn      => ipcRenderer.on('update-downloaded', fn),

  // Atualização portátil
  portableUpdateDownload: ({ downloadUrl }) => ipcRenderer.send('portable-update-download', { downloadUrl }),
  portableUpdateRestart: ()               => ipcRenderer.send('portable-update-restart'),
  onPortableUpdateAvailable: fn          => ipcRenderer.on('portable-update-available', (_, data) => fn(data)),
  onPortableDownloadProgress: fn         => ipcRenderer.on('portable-download-progress', (_, data) => fn(data)),
  onPortableDownloadComplete: fn         => ipcRenderer.on('portable-download-complete', (_, data) => fn(data)),
});