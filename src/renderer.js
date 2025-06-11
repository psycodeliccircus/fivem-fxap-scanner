// renderer.js
window.addEventListener('DOMContentLoaded', async() => {
  const showTempAlert = (msg,d=3000) => {
    const a=document.createElement('div'); a.className='temp-alert'; a.textContent=msg;
    document.body.appendChild(a);
    setTimeout(()=>a.classList.add('hide'),d);
    a.addEventListener('transitionend',()=>a.remove());
  };

  // versão
  try{ const i=await window.api.getAppInfo(); document.getElementById('footerVersion').textContent=`${i.name} v${i.version}`; }
  catch(e){ console.error(e); }

  // window controls
  document.getElementById('min-btn').onclick = () => window.api.minimize();
  document.getElementById('max-btn').onclick = () => window.api.maximize();
  document.getElementById('close-btn').onclick = () => window.api.close();

  // update instalado
  const btnUpdate=document.getElementById('btnUpdate');
  const progCt=document.getElementById('progressContainer');
  const progBar=document.getElementById('progressBar');
  const progTxt=document.getElementById('progressText');
  btnUpdate.onclick=()=>window.api.checkForUpdates();
  window.api.onChecking(()=>{ btnUpdate.textContent='Checando…'; btnUpdate.disabled=true; });
  window.api.onUpdateAvailable(()=>{ showTempAlert('🌟 Update disponível!',4000);
    btnUpdate.textContent='Baixar update'; btnUpdate.onclick=()=>window.api.downloadUpdate(); btnUpdate.disabled=false;
  });
  window.api.onUpdateNotAvailable(()=>{ showTempAlert('✅ App atualizado',3000);
    btnUpdate.textContent='Verificar Update'; btnUpdate.disabled=false;
  });
  window.api.onError(err=>{ showTempAlert(`❌ Erro: ${err}`,4000);
    btnUpdate.textContent='Verificar Update'; btnUpdate.disabled=false;
  });
  window.api.onDownloadProgress(p=>{
    progCt.style.display='flex'; progBar.value=Math.round(p.percent); progTxt.textContent=`Baixando ${Math.round(p.percent)}%`;
  });
  window.api.onUpdateDownloaded(()=>{
    showTempAlert('✅ Update baixado!',3000);
    btnUpdate.textContent='Instalar e Reiniciar'; btnUpdate.onclick=()=>window.api.installUpdate();
    setTimeout(()=>progCt.style.display='none',500);
  });

  // update portátil
  let portableUrl='';
  const btnPD=document.getElementById('btnPortableDownload');
  const btnPR=document.getElementById('btnPortableRestart');
  btnPD.onclick=()=>{ btnPD.disabled=true; window.api.portableUpdateDownload({downloadUrl:portableUrl}); };
  btnPR.onclick=()=>window.api.portableUpdateRestart();
  window.api.onPortableUpdateAvailable(({message,downloadUrl})=>{
    showTempAlert(message,4000); portableUrl=downloadUrl;
    btnPD.style.display='inline-block'; btnPD.disabled=false;
  });
  window.api.onPortableDownloadProgress(({percent,kb})=>{
    progCt.style.display='flex'; progBar.value=percent;
    progTxt.textContent=`Baixando portable ${percent}% — ${kb} KB/s`;
  });
  window.api.onPortableDownloadComplete(({message})=>{
    showTempAlert(message,3000);
    btnPD.style.display='none'; progCt.style.display='none'; btnPR.style.display='inline-block';
  });

  // scan recursos
  const btnFolder=document.getElementById('btnSelectFolder');
  const btnFile  =document.getElementById('btnSelectFile');
  const pathDisp=document.getElementById('pathDisplay');
  const btnCheck =document.getElementById('btnCheck');
  const btnDelControls=document.getElementById('btnDeleteAllControls');
  const ulNo     =document.getElementById('ulNo');
  const ulYes    =document.getElementById('ulYes');
  let selectedPaths=[];

  console.log('btnFolder=',btnFolder,'btnFile=',btnFile);
  btnFolder.onclick=async()=>{
    const dirs=await window.api.selectFolder(); console.log('dirs',dirs);
    if(dirs.length){ selectedPaths=dirs; pathDisp.textContent=dirs.join(', '); btnCheck.disabled=false; }
  };
  btnFile.onclick=async()=>{
    const files=await window.api.selectFile(); console.log('files',files);
    if(files.length){ selectedPaths=files; pathDisp.textContent=files.join(', '); btnCheck.disabled=false; }
  };

  window.api.onProgress(({processed,total,entry})=>{
    progCt.style.display='flex'; progBar.max=total; progBar.value=processed;
    progTxt.textContent=`${processed}/${total} — ${entry.full}`;
    if(processed===1){ ulNo.innerHTML=''; ulYes.innerHTML=''; btnDelControls.style.display='none'; }
    const isRootEmpty=selectedPaths.includes(entry.full)&&entry.files.length===0;
    if(!isRootEmpty){
      const li=document.createElement('li'); li.textContent=entry.full;
      if(entry.files.length>0){
        const del=document.createElement('button'); del.textContent='Excluir';
        del.classList.add('btn-delete'); del.dataset.path=entry.full;
        del.onclick=async()=>{ await window.api.deleteResource(entry.full); btnCheck.click(); };
        li.appendChild(del); ulYes.appendChild(li); btnDelControls.style.display='inline-block';
      } else ulNo.appendChild(li);
    }
    if(processed===total){
      setTimeout(()=>progCt.style.display='none',300);
      btnDelControls.addEventListener('click',async()=>{
        for(const b of ulYes.querySelectorAll('.btn-delete')) await window.api.deleteResource(b.dataset.path);
        btnCheck.click();
      },{once:true});
    }
  });

  btnCheck.onclick=async()=>{ btnCheck.disabled=true; await window.api.scanResources(selectedPaths); btnCheck.disabled=false; };
});