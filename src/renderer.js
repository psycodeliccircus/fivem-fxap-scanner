// src/renderer.js
window.addEventListener('DOMContentLoaded', async () => {
  // Preencher versão no footer
  try {
    const info = await window.api.getAppInfo();
    const footer = document.getElementById('footerVersion');
    if (footer) footer.textContent = `${info.name} v${info.version}`;
  } catch (e) {
    console.error('Erro ao obter info do app:', e);
  }

  // Controles de janela
  const minBtn = document.getElementById('min-btn');
  const maxBtn = document.getElementById('max-btn');
  const closeBtn = document.getElementById('close-btn');
  if (minBtn)   minBtn.addEventListener('click', () => window.api.minimize());
  if (maxBtn)   maxBtn.addEventListener('click', () => window.api.maximize());
  if (closeBtn) closeBtn.addEventListener('click', () => window.api.close());

  // Auto-update
  const btnUpdate = document.getElementById('btnUpdate');
  const progCt    = document.getElementById('progressContainer');
  const progBar   = document.getElementById('progressBar');
  const progTxt   = document.getElementById('progressText');
  if (btnUpdate) {
    btnUpdate.addEventListener('click', () => window.api.checkForUpdates());
    window.api.onChecking(() => btnUpdate.textContent = 'Checando...');
    window.api.onUpdateAvailable(() => {
      btnUpdate.textContent = 'Baixar update';
      btnUpdate.onclick = () => window.api.downloadUpdate();
    });
    window.api.onUpdateNotAvailable(() => {
      btnUpdate.textContent = 'Sem updates';
      setTimeout(() => btnUpdate.textContent = 'Verificar Update', 2000);
    });
    window.api.onError(err => {
      console.error(err);
      btnUpdate.textContent = 'Erro';
      setTimeout(() => btnUpdate.textContent = 'Verificar Update', 2000);
    });
    window.api.onDownloadProgress(p => {
      progCt.style.display = 'flex';
      progBar.value = Math.round(p.percent);
      progTxt.textContent = `Baixando ${Math.round(p.percent)}%`;
    });
    window.api.onUpdateDownloaded(() => {
      btnUpdate.textContent = 'Instalar e Reiniciar';
      btnUpdate.onclick = () => window.api.installUpdate();
      setTimeout(() => progCt.style.display = 'none', 500);
    });
  }

  // Scan UI
  const btnFolder  = document.getElementById('btnSelectFolder');
  const btnFile    = document.getElementById('btnSelectFile');
  const btnCheck   = document.getElementById('btnCheck');
  const btnDelete  = document.getElementById('btnDeleteAll');
  const pathDisp   = document.getElementById('pathDisplay');
  const ulNo       = document.getElementById('ulNo');
  const ulYes      = document.getElementById('ulYes');

  let selectedPaths = [];

  if (btnFolder) {
    btnFolder.addEventListener('click', async () => {
      const dirs = await window.api.selectFolder();
      if (dirs && dirs.length) {
        selectedPaths = dirs;
        pathDisp.textContent = dirs.join(', ');
        btnCheck.disabled = false;
      }
    });
  }

  if (btnFile) {
    btnFile.addEventListener('click', async () => {
      const files = await window.api.selectFile();
      if (files && files.length) {
        selectedPaths = files;
        pathDisp.textContent = files.join(', ');
        btnCheck.disabled = false;
      }
    });
  }

  window.api.onProgress(({ processed, total, entry }) => {
    // mostra progresso
    progCt.style.display = 'flex';
    progBar.max   = total;
    progBar.value = processed;
    progTxt.textContent = `${processed}/${total} — ${entry.full}`;

    if (processed === 1) {
      ulNo.innerHTML  = '';
      ulYes.innerHTML = '';
      if (btnDelete) btnDelete.style.display = 'none';
    }

    // ignora a raiz vazia
    const isRootEmpty = selectedPaths.includes(entry.full) && entry.files.length === 0;
    if (isRootEmpty) {
      if (processed === total) setTimeout(() => progCt.style.display = 'none', 300);
      return;
    }

    // adiciona na lista certa
    const li = document.createElement('li');
    li.textContent = entry.full;

    if (entry.files.length > 0) {
      const del = document.createElement('button');
      del.textContent = 'Excluir';
      del.classList.add('btn-delete');
      del.dataset.path = entry.full;
      del.addEventListener('click', async () => {
        await window.api.deleteResource(entry.full);
        btnCheck.click();
      });
      li.appendChild(del);
      ulYes.appendChild(li);
      if (btnDelete) btnDelete.style.display = 'inline-block';
    } else {
      ulNo.appendChild(li);
    }

    if (processed === total) {
      setTimeout(() => progCt.style.display = 'none', 300);
      if (btnDelete) {
        btnDelete.addEventListener('click', async () => {
          for (const b of ulYes.querySelectorAll('.btn-delete')) {
            await window.api.deleteResource(b.dataset.path);
          }
          btnCheck.click();
        }, { once: true });
      }
    }
  });

  if (btnCheck) {
    btnCheck.addEventListener('click', async () => {
      btnCheck.disabled = true;
      await window.api.scanResources(selectedPaths);
      btnCheck.disabled = false;
    });
  }
});
