const $=selector=>document.querySelector(selector);
const {t}=VeyralI18n;
const emptyFlagIcon=$('#selectedFlag').innerHTML;
let regions=new Intl.DisplayNames([VeyralI18n.language],{type:'region'});
let entries=[],selectedKey=null,connectedKey=null,connectionVerified=false,scanning=false,scanDone=false,busy=false,toastTimer,lastVisualKey=null;
let lastScanProgress={checked:0,total:0};
let globe;
let settings={routing:{mode:'all',apps:[]},wireguard:null};
const wireguardKey='wireguard://private';
function syncWireGuard(){
  entries=entries.filter(item=>item.type!=='wireguard');
  if(settings.wireguard)entries.unshift({type:'wireguard',address:'private',name:settings.wireguard.name,countryCode:'',city:t('Свой сервер'),latency:null});
  if(selectedKey===wireguardKey&&!settings.wireguard)selectedKey=null;
  render();
}
const rowNodes=new Map();
let previousVisible=new Set();
const keyOf=item=>`${item.type}://${item.address}`;
const esc=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const dropdowns=new Map();
function initDropdown(select){
  const shell=document.createElement('div');
  shell.className=`dropdown dropdown-${select.id}`;
  select.before(shell);
  shell.append(select);
  select.classList.add('native-dropdown');
  select.tabIndex=-1;
  select.setAttribute('aria-hidden','true');
  const trigger=document.createElement('button');
  trigger.type='button';trigger.id=`${select.id}Button`;trigger.className='dropdown-trigger';
  trigger.setAttribute('aria-label',select.getAttribute('aria-label')||t('Маршрутизация'));
  trigger.setAttribute('aria-haspopup','menu');trigger.setAttribute('aria-expanded','false');
  trigger.innerHTML='<span class="dropdown-value"></span><span class="dropdown-chevron" aria-hidden="true"></span>';
  const menu=document.createElement('div');
  menu.id=`${select.id}Menu`;menu.className='dropdown-menu';menu.setAttribute('role','menu');menu.inert=true;
  trigger.setAttribute('aria-controls',menu.id);
  const options=[...select.options];
  for(const option of options){
    const item=document.createElement('button');item.type='button';item.className='dropdown-option';item.dataset.value=option.value;
    item.setAttribute('role','menuitemradio');item.tabIndex=-1;
    item.textContent=option.textContent;menu.append(item);
  }
  shell.append(trigger,menu);
  const items=[...menu.querySelectorAll('.dropdown-option')];
  function sync(){
    trigger.querySelector('.dropdown-value').textContent=select.selectedOptions[0]?.textContent||'';
    trigger.disabled=select.disabled;
    for(const item of items){const selected=item.dataset.value===select.value;item.textContent=options.find(option=>option.value===item.dataset.value)?.textContent||'';item.classList.toggle('is-selected',selected);item.setAttribute('aria-checked',String(selected));}
    if(select.disabled)close();
  }
  function close(restoreFocus=false){shell.classList.remove('open');trigger.setAttribute('aria-expanded','false');menu.inert=true;if(restoreFocus)trigger.focus();}
  function open(){
    if(trigger.disabled)return;
    for(const dropdown of dropdowns.values())dropdown.close();
    shell.classList.add('open');trigger.setAttribute('aria-expanded','true');menu.inert=false;
    (items.find(item=>item.dataset.value===select.value)||items[0]).focus();
  }
  trigger.addEventListener('click',()=>shell.classList.contains('open')?close(true):open());
  trigger.addEventListener('keydown',event=>{if(['ArrowDown','ArrowUp','Enter',' '].includes(event.key)){event.preventDefault();open();}});
  menu.addEventListener('click',event=>{
    const item=event.target.closest('.dropdown-option');if(!item)return;
    if(select.value!==item.dataset.value){select.value=item.dataset.value;select.dispatchEvent(new Event('change',{bubbles:true}));}
    sync();close(true);
  });
  menu.addEventListener('keydown',event=>{
    const index=items.indexOf(document.activeElement);
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);return;}
    if(event.key==='Tab'){
      event.preventDefault();event.stopPropagation();
      const focusable=[...document.querySelectorAll('button:not(:disabled),input:not(:disabled)')].filter(element=>element.tabIndex>=0&&!element.closest('.dropdown-menu')&&!element.closest('[inert]')&&element.getClientRects().length);
      const current=focusable.indexOf(trigger);
      close();(focusable[current+(event.shiftKey?-1:1)]||trigger).focus();return;
    }
    let next=index;
    if(event.key==='ArrowDown')next=(index+1)%items.length;
    else if(event.key==='ArrowUp')next=(index-1+items.length)%items.length;
    else if(event.key==='Home')next=0;
    else if(event.key==='End')next=items.length-1;
    else if(event.key==='Enter'||event.key===' '){event.preventDefault();document.activeElement.click();return;}
    else return;
    event.preventDefault();items[next].focus();
  });
  document.addEventListener('pointerdown',event=>{if(!shell.contains(event.target))close();});
  select.addEventListener('change',sync);
  const controller={sync,close};dropdowns.set(select.id,controller);sync();return controller;
}

function country(item){if(item.type==='wireguard')return item.name||t('Мой WireGuard');try{return regions.of(item.countryCode)||item.country||t('Неизвестная страна');}catch{return item.country||t('Неизвестная страна');}}
function flag(code){return /^[A-Z]{2}$/.test(code||'')?`<span class="fi fi-${code.toLowerCase()}"></span>`:emptyFlagIcon;}
function level(ms){return ms<160?4:ms<350?3:ms<700?2:1;}
function quality(ms){const n=level(ms);return n===4?'fast':n===3?'medium':'slow';}
function bars(ms){const n=level(ms);return `<span class="bars level-${n}" aria-label="${t('Качество пинга')}: ${n} ${t('из')} 4"><i></i><i></i><i></i><i></i></span>`;}
function selected(){return entries.find(item=>keyOf(item)===selectedKey)||null;}
function countCountries(n){return VeyralI18n.countries(n);}

function updateSelected(){
  const item=selected();
  if(item&&lastVisualKey!==keyOf(item)){lastVisualKey=keyOf(item);const panel=$('.selected');panel.classList.remove('changing');requestAnimationFrame(()=>panel.classList.add('changing'));}
  if(!item)lastVisualKey=null;
  $('#selectedFlag').classList.toggle('loading',!item&&scanning);
  $('#selectedFlag').innerHTML=item?flag(item.countryCode):emptyFlagIcon;
  $('#selectedName').textContent=item?country(item):t('Выберите локацию');
  $('#selectedCity').textContent=item?connectedKey&&item.googleLocation?`Google: ${item.googleLocation}`:t(item.city||'Город не определён'):scanning?t('Проверяем серверы в фоне'):t('Нажмите на страну в списке');
  $('#selectedIp').textContent=connectedKey?connectionVerified&&item?.exitIp?`${t('Выходной IP ПК')}: ${item.exitIp} · ${t('проверить ↗')}`:t('Маршрут включён · проверьте IP в программе'):'';
  $('#selectedIp').disabled=!connectedKey||!connectionVerified;
  $('#googleLocation').disabled=!connectedKey||!connectionVerified;
  $('#selectedBars').innerHTML=item&&Number.isFinite(item.latency)?bars(item.latency):'';
  $('#selectedLatency').textContent=item&&Number.isFinite(item.latency)?VeyralI18n.latency(item.latency):'—';
  $('#connectionLabel').textContent=t(connectedKey?'ТУННЕЛЬ ВКЛЮЧЁН':item?'СЕРВЕР ВЫБРАН · НЕ ПОДКЛЮЧЕНО':'ПОДКЛЮЧЕНИЕ ВЫКЛЮЧЕНО');
  $('#selectedPing').hidden=!item;
  const button=$('#start');
  button.disabled=busy||!item;
  button.classList.toggle('connected',!!connectedKey);
  button.innerHTML=busy?`<span class="start-label">${t('Подождите…')}</span>`:connectedKey?`<span class="start-label">${t('Стоп')}</span><span class="start-arrow">×</span>`:item?`<span class="start-label">${t('Пуск')}</span><span class="start-arrow">→</span>`:`<span class="start-label">${t('Выберите')}</span><span class="start-arrow">→</span>`;
  $('#refresh').disabled=scanning||!!connectedKey;
}

function renderMap(visible){
  const locations=new Map();
  for(const item of visible){
    if(!Number.isFinite(item.latitude)||!Number.isFinite(item.longitude))continue;
    const key=`${item.latitude.toFixed(1)},${item.longitude.toFixed(1)}`;
    if(!locations.has(key)||locations.get(key).latency>item.latency||keyOf(item)===selectedKey)locations.set(key,item);
  }
  globe.setPoints([...locations.values()].map(item=>({item,quality:quality(item.latency)})));
  $('#mapCountries').textContent=countCountries(new Set(visible.filter(item=>Number.isFinite(item.latitude)&&item.countryCode).map(item=>item.countryCode)).size);
  $('#mapEmpty').classList.toggle('hidden',locations.size>0);
}

function render(){
  const query=$('#search').value.trim().toLocaleLowerCase(VeyralI18n.language);
  const protocol=$('#protocol').value;
  const visible=entries.filter(item=>(protocol==='all'||item.type===protocol)&&`${country(item)} ${t(item.city||'')} ${item.address}`.toLocaleLowerCase(VeyralI18n.language).includes(query));
  $('#availableCount').textContent=VeyralI18n.availability(entries.length,scanning);
  const list=$('#proxyList');
  const scroll=list.scrollTop;
  const oldPositions=new Map([...list.querySelectorAll('.proxy-row')].map(row=>[row.dataset.key,row.getBoundingClientRect().top]));
  const nextVisible=new Set();
  if(visible.length){
    const rows=[];
    visible.forEach((item,index)=>{
      const key=keyOf(item);
      nextVisible.add(key);
      let row=rowNodes.get(key);
      if(!row){row=document.createElement('button');row.type='button';row.className='proxy-row';row.dataset.key=key;row.addEventListener('animationend',event=>{if(event.animationName==='row-in')row.classList.remove('enter');});rowNodes.set(key,row);}
      const markup=`<span class="row-place"><span class="row-flag">${flag(item.countryCode)}</span><span class="row-copy"><span class="row-country">${esc(country(item))}</span><span class="row-city">${esc(t(item.city||'Город не определён'))} <span class="row-type">${esc(item.type.toUpperCase())}${item.reliability!==null&&item.reliability!==undefined?` · ${VeyralI18n.reliability(item.reliability)}`:''}</span></span></span></span><span class="row-ping">${Number.isFinite(item.latency)?`${bars(item.latency)} ${VeyralI18n.latency(item.latency)}`:'—'}</span>`;
      if(row._markup!==markup){row.innerHTML=markup;row._markup=markup;}
      row.setAttribute('aria-label',VeyralI18n.selectCountry(country(item)));
      row.classList.toggle('selected-row',selectedKey===key);
      if(!previousVisible.has(key)){row.classList.remove('enter');void row.offsetWidth;row.classList.add('enter');}
      row.style.setProperty('--row-delay',`${Math.min(index,8)*32}ms`);
      rows.push(row);
    });
    rows.forEach((row,index)=>{if(list.children[index]!==row)list.insertBefore(row,list.children[index]||null);});
    for(const child of [...list.children])if(!nextVisible.has(child.dataset.key))child.remove();
    if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
      for(const row of list.querySelectorAll('.proxy-row')){
        const before=oldPositions.get(row.dataset.key);
        if(before===undefined||row.classList.contains('enter'))continue;
        const delta=before-row.getBoundingClientRect().top;
        if(Math.abs(delta)>2&&Math.abs(delta)<500)row.animate([{transform:`translateY(${delta}px)`},{transform:'translateY(0)'}],{duration:360,easing:'cubic-bezier(.2,.8,.2,1)'});
      }
    }
  }else{
    if(protocol==='wireguard'&&!settings.wireguard&&!query){
      list.innerHTML=`<div class="empty"><img class="empty-logo" src="assets/icon.svg" alt=""><strong>${t('Профиль WireGuard не добавлен')}</strong><p>${t('Импортируйте файл .conf в настройках.')}</p></div>`;
    }else{
      list.innerHTML=`<div class="empty"><div class="empty-symbol">◌</div><strong>${t(scanning?'Ищем доступные локации':query||protocol!=='all'?'Ничего не найдено':scanDone?'Нет доступных серверов':'Подготовка')}</strong><p>${t(scanning?'Серверы появятся здесь по мере проверки.':query||protocol!=='all'?'Попробуйте другой город, страну или тип.':scanDone?'Обновите список позже.':'Загружаем публичные списки.')}</p></div>`;
    }
  }
  list.scrollTop=scroll;
  previousVisible=nextVisible;
  const activeKeys=new Set(entries.map(keyOf));
  for(const key of rowNodes.keys())if(!activeKeys.has(key))rowNodes.delete(key);
  updateSelected();
  renderMap(visible);
}

function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),2800);}
async function scan(){
  if(scanning||connectedKey)return;
  scanning=true;scanDone=false;render();
  $('#scanState').textContent=t(entries.length?'Обновление списка':'Загрузка списка');$('#refresh').classList.add('scanning');
  try{await window.veyral.scan();}catch{scanning=false;$('#scanState').textContent=t('Ошибка загрузки');$('#refresh').classList.remove('scanning');render();}
}

window.veyral.onProgress(progress=>{
  if(Number.isFinite(progress.checked))lastScanProgress={checked:progress.checked,total:progress.total||0};
  if(progress.state&&!busy)$('#scanState').textContent=t(progress.state);
  if(Number.isFinite(progress.checked)&&Number.isFinite(progress.total)&&!busy)$('#scanState').textContent=VeyralI18n.checked(progress.checked,progress.total);
  if(progress.entry){const index=entries.findIndex(item=>keyOf(item)===keyOf(progress.entry));if(index<0)entries.push(progress.entry);else entries[index]=progress.entry;entries.sort((a,b)=>(a.rank??a.latency)-(b.rank??b.latency));render();}
  if(progress.unavailable&&!busy){entries=entries.filter(item=>keyOf(item)!==progress.unavailable);if(selectedKey===progress.unavailable)selectedKey=null;render();}
  if(progress.done){if(progress.keys){const keys=new Set(progress.keys);entries=entries.filter(item=>item.type==='wireguard'||keys.has(keyOf(item)));if(!entries.some(item=>keyOf(item)===selectedKey))selectedKey=null;}scanning=false;scanDone=true;$('#refresh').classList.remove('scanning');if(!busy)$('#scanState').textContent=progress.error?t('Не удалось загрузить список'):VeyralI18n.checked(progress.checked);render();}
});

function choose(item){if(connectedKey){toast(t('Сначала остановите текущее подключение'));return;}selectedKey=keyOf(item);globe.select(item);render();}
$('#proxyList').addEventListener('click',event=>{const row=event.target.closest('[data-key]');if(!row)return;const item=entries.find(entry=>keyOf(entry)===row.dataset.key);if(item)choose(item);});
$('#start').addEventListener('click',async()=>{
  if(busy)return;busy=true;updateSelected();
  try{
    if(connectedKey){const result=await window.veyral.disconnect();if(!result.ok){toast(t(result.error||'Не удалось отключить прокси'));return;}connectedKey=null;connectionVerified=false;toast(t('Прокси отключён'));queueMicrotask(scan);}
    else{const item=selected();if(!item)return;const result=item.type==='wireguard'?await window.veyral.connectWireGuard():await window.veyral.connect(keyOf(item));if(!result.ok){$('#scanState').textContent=t('Ошибка подключения');toast(t(result.error||'Не удалось включить туннель'));return;}if(result.entry){const index=entries.findIndex(entry=>keyOf(entry)===keyOf(result.entry));if(index>=0)entries[index]=result.entry;else entries.push(result.entry);selectedKey=keyOf(result.entry);connectedKey=selectedKey;connectionVerified=!!result.verified;globe.select(result.entry);}$('#scanState').textContent=t(result.verified?'Подключено':'Маршрут выбранных программ включён');toast(t(result.verified?'Туннель включён; выходной IP проверен':'Маршрут включён. Проверьте IP в выбранной программе'));}
  }catch{toast(t('Не удалось изменить настройки Windows'));}
  finally{busy=false;render();}
});
window.veyral.onConnection(state=>{if(state.error){toast(t(state.error));return;}if(!state.connected&&connectedKey){connectedKey=null;connectionVerified=false;toast(t('Прокси отключён: сервер перестал отвечать'));render();queueMicrotask(scan);}});
window.veyral.onConnectStage(stage=>{if(busy)$('#scanState').textContent=t(stage);});
window.veyral.onGoogleLocation(({key,location})=>{const entry=entries.find(item=>keyOf(item)===key);if(entry){entry.googleLocation=location;render();}});
$('#search').addEventListener('input',render);
$('#protocol').addEventListener('change',render);
$('#refresh').addEventListener('click',scan);
$('#selectedIp').addEventListener('click',()=>window.veyral.openIpCheck());
$('#googleLocation').addEventListener('click',async()=>{const result=await window.veyral.openGoogleLocation();if(!result.ok)$('#scanState').textContent=t(result.error);else if(result.captcha)$('#scanState').textContent=t('Пройдите CAPTCHA в открытом окне Google');});
function renderSettings(){
  $('#routingMode').value=settings.routing.mode;
  $('#routingApps').innerHTML=settings.routing.apps.map((file,index)=>`<div class="setting-app"><span title="${esc(file)}">${esc(file.split(/[\\/]/).pop())}</span><button type="button" data-remove-app="${index}" aria-label="${t('Удалить программу')}">×</button></div>`).join('');
  $('#wireguardName').textContent=settings.wireguard?`${settings.wireguard.name} · ${settings.wireguard.endpoint}`:t('Профиль не импортирован');
  $('#removeWireGuard').disabled=!settings.wireguard||busy||!!connectedKey;
  $('#importWireGuard').disabled=busy||!!connectedKey;
  $('#routingMode').disabled=busy||!!connectedKey;
  $('#addProgram').disabled=busy||!!connectedKey;
  dropdowns.get('routingMode')?.sync();
  $('#language').value=VeyralI18n.language;
  dropdowns.get('language')?.sync();
}
$('#language').addEventListener('change',event=>{
  VeyralI18n.setLanguage(event.target.value);
  window.veyral.setLanguage(VeyralI18n.language);
  regions=new Intl.DisplayNames([VeyralI18n.language],{type:'region'});
  for(const item of entries)if(item.type==='wireguard')item.city=t('Свой сервер');
  for(const dropdown of dropdowns.values())dropdown.sync();
  renderSettings();render();
  $('#scanState').textContent=connectedKey?t('Подключено'):scanning?lastScanProgress.total?VeyralI18n.checked(lastScanProgress.checked,lastScanProgress.total):t('Загрузка списка'):scanDone?VeyralI18n.checked(lastScanProgress.checked):t('Загружаем список');
});
let settingsCloseTimer;
function openSettings(){clearTimeout(settingsCloseTimer);const backdrop=$('#settingsBackdrop');backdrop.classList.remove('closing');backdrop.hidden=false;$('.app').inert=true;renderSettings();$('#settingsClose').focus();}
function closeSettings(){const backdrop=$('#settingsBackdrop');if(backdrop.hidden||backdrop.classList.contains('closing'))return;backdrop.classList.add('closing');settingsCloseTimer=setTimeout(()=>{backdrop.hidden=true;backdrop.classList.remove('closing');$('.app').inert=false;$('#settingsButton').focus();},180);}
$('#settingsButton').addEventListener('click',openSettings);
$('#settingsClose').addEventListener('click',closeSettings);
$('#settingsBackdrop').addEventListener('click',event=>{if(event.target.id==='settingsBackdrop')closeSettings();});
document.addEventListener('keydown',event=>{
  if($('#settingsBackdrop').hidden)return;
  if(event.key==='Escape'){event.preventDefault();closeSettings();return;}
  if(event.key!=='Tab')return;
  const controls=[...$('#settingsBackdrop').querySelectorAll('button:not(:disabled),select:not(:disabled)')].filter(element=>element.getClientRects().length&&!element.closest('[inert]'));
  const first=controls[0],last=controls.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
});
$('#routingMode').addEventListener('change',async event=>{const result=await window.veyral.saveRouting({...settings.routing,mode:event.target.value});if(!result.ok){toast(result.error);renderSettings();return;}settings.routing=result.routing;renderSettings();});
$('#addProgram').addEventListener('click',async()=>{const file=await window.veyral.chooseProgram();if(!file)return;const result=await window.veyral.saveRouting({...settings.routing,apps:[...settings.routing.apps,file]});if(!result.ok){toast(result.error);return;}settings.routing=result.routing;renderSettings();});
$('#routingApps').addEventListener('click',async event=>{const button=event.target.closest('[data-remove-app]');if(!button)return;const apps=settings.routing.apps.filter((_,index)=>index!==Number(button.dataset.removeApp));const result=await window.veyral.saveRouting({...settings.routing,apps});if(!result.ok){toast(result.error);return;}settings.routing=result.routing;renderSettings();});
$('#importWireGuard').addEventListener('click',async()=>{const result=await window.veyral.importWireGuard();if(!result.ok){if(!result.canceled)toast(t(result.error));return;}settings.wireguard=result.profile;syncWireGuard();renderSettings();toast(t('Профиль WireGuard импортирован'));});
$('#removeWireGuard').addEventListener('click',async()=>{const result=await window.veyral.removeWireGuard();if(!result.ok){toast(result.error);return;}settings.wireguard=null;syncWireGuard();renderSettings();});
for(const action of ['minimize','maximize','close'])$('#'+action).addEventListener('click',()=>window.veyral.windowAction(action));
globe=new window.VeyralGlobe($('#globe'),choose,item=>{
  const hover=$('#mapHover');
  if(!item){hover.classList.remove('show');return;}
  hover.textContent=`${country(item)} · ${t(item.city||'город не определён')}${Number.isFinite(item.latency)?` · ${VeyralI18n.latency(item.latency)}`:''}`;
  hover.classList.add('show');
});
VeyralI18n.applyStatic();
window.veyral.setLanguage(VeyralI18n.language);
initDropdown($('#protocol'));initDropdown($('#routingMode'));initDropdown($('#language'));
render();window.veyral.getSettings().then(value=>{settings=value;syncWireGuard();renderSettings();});scan();
