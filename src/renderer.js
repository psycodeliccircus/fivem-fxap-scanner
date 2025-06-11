// renderer.js
window.addEventListener('DOMContentLoaded', async () => {
  // Função para criar alertas temporários
  function showTempAlert(message, duration = 3000) {
    const alert = document.createElement('div');
    alert.className = 'temp-alert';
    alert.textContent = message;
    document.body.appendChild(alert);

    // Esconde e remove após a transição
    setTimeout(() => alert.classList.add('hide'), duration);
    alert.addEventListener('transitionend', () => alert.remove());
  }

  // Preencher versão no footer
  try {
    const info = await window.api.getAppInfo();
    document.getElementById('footerVersion').textContent = `${info.name} v${info.version}`;
  } catch (e) {
    console.error('Erro ao obter info do app:', e);
  }

  // Controles de janela
  document.getElementById('min-btn').addEventListener('click', () => window.api.minimize());
  document.getElementById('max-btn').addEventListener('click', () => window.api.maximize());
  document.getElementById('close-btn').addEventListener('click', () => window.api.close());

  // Elementos de update
  const btnUpdate = document.getElementById('btnUpdate');
  const progCt    = document.getElementById('progressContainer');
  const progBar   = document.getElementById('progressBar');
  const progTxt   = document.getElementById('progressText');

  // Lida com eventos de auto-update
  btnUpdate.addEventListener('click', () => window.api.checkForUpdates());
  window.api.onChecking(() => {
    btnUpdate.textContent = 'Checando…';
    btnUpdate.disabled = true;
  });
  window.api.onUpdateAvailable(() => {
    showTempAlert('🌟 Update disponível! Clique para baixar.', 4000);
    btnUpdate.textContent = 'Baixar update';
    btnUpdate.onclick = () => window.api.downloadUpdate();
    btnUpdate.disabled = false;
  });
  window.api.onUpdateNotAvailable(() => {
    showTempAlert('✅ O aplicativo já está atualizado.', 3000);
    btnUpdate.textContent = 'Verificar Update';
    btnUpdate.disabled = false;
  });
  window.api.onError(err => {
    console.error(err);
    showTempAlert(`❌ Erro ao verificar updates: ${err}`, 4000);
    btnUpdate.textContent = 'Verificar Update';
    btnUpdate.disabled = false;
  });
  window.api.onDownloadProgress(p => {
    progCt.style.display = 'flex';
    progBar.max   = 100;
    progBar.value = Math.round(p.percent);
    progTxt.textContent = `Baixando ${Math.round(p.percent)}%`;
  });
  window.api.onUpdateDownloaded(() => {
    showTempAlert('✅ Update baixado! Pronto para instalar.', 3000);
    btnUpdate.textContent = 'Instalar e Reiniciar';
    btnUpdate.onclick = () => window.api.installUpdate();
    setTimeout(() => progCt.style.display = 'none', 500);
  });

  // Resto do código de scan (sem alterações)…
  const btnFolder  = document.getElementById('btnSelectFolder');
  const btnFile    = document.getElementById('btnSelectFile');
  const btnCheck   = document.getElementById('btnCheck');
  const btnDelete  = document.getElementById('btnDeleteAll');
  const pathDisp   = document.getElementById('pathDisplay');
  const ulNo       = document.getElementById('ulNo');
  const ulYes      = document.getElementById('ulYes');
  let selectedPaths = [];

  btnFolder.addEventListener('click', async () => {
    const dirs = await window.api.selectFolder();
    if (dirs.length) {
      selectedPaths = dirs;
      pathDisp.textContent = dirs.join(', ');
      btnCheck.disabled = false;
    }
  });

  btnFile.addEventListener('click', async () => {
    const files = await window.api.selectFile();
    if (files.length) {
      selectedPaths = files;
      pathDisp.textContent = files.join(', ');
      btnCheck.disabled = false;
    }
  });

  window.api.onProgress(({ processed, total, entry }) => {
    progCt.style.display = 'flex';
    progBar.max   = total;
    progBar.value = processed;
    progTxt.textContent = `${processed}/${total} — ${entry.full}`;

    if (processed === 1) {
      ulNo.innerHTML  = '';
      ulYes.innerHTML = '';
      btnDelete.style.display = 'none';
    }

    const isRootEmpty = selectedPaths.includes(entry.full) && entry.files.length === 0;
    if (!isRootEmpty) {
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
        btnDelete.style.display = 'inline-block';
      } else {
        ulNo.appendChild(li);
      }
    }

    if (processed === total) {
      setTimeout(() => progCt.style.display = 'none', 300);
      btnDelete.addEventListener('click', async () => {
        for (const b of ulYes.querySelectorAll('.btn-delete')) {
          await window.api.deleteResource(b.dataset.path);
        }
        btnCheck.click();
      }, { once: true });
    }
  });

  btnCheck.addEventListener('click', async () => {
    btnCheck.disabled = true;
    await window.api.scanResources(selectedPaths);
    btnCheck.disabled = false;
  });
});
