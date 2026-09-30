const {app,BrowserWindow,Tray,Menu,ipcMain,session,shell,dialog}=require('electron');
const path=require('node:path');
const https=require('node:https');
const net=require('node:net');
const dns=require('node:dns');
const fs=require('node:fs');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {SocksProxyAgent}=require('socks-proxy-agent');
const {HttpsProxyAgent}=require('https-proxy-agent');
const countryCoordinates=require('./assets/country-coordinates.json');
const {startTun}=require('./tun');
const {createReliability}=require('./reliability');
const routingSettings=require('./routing-settings');
const wireguardProfile=require('./wireguard-profile');
const runFile=promisify(execFile);
https.globalAgent.keepAlive=true;
https.globalAgent.maxSockets=16;

const PROXY_SOURCES=[
  {name:'proxyscrape',urls:['https://cdn.jsdelivr.net/gh/proxyscrape/free-proxy-list@main/proxies/all/data.json','https://raw.githubusercontent.com/ProxyScrape/free-proxy-list/main/proxies/all/data.json']},
  {name:'hproxy',urls:['https://raw.githubusercontent.com/hproxy-com/free-proxy-list/main/live.json','https://cdn.jsdelivr.net/gh/hproxy-com/free-proxy-list@main/live.json']},
  {name:'monosans',urls:['https://raw.githubusercontent.com/monosans/proxy-list/main/proxies.json']}
];
let mainWindow;
let tray;
let uiLanguage='en';
const trayText={
  en:{connected:'connected',open:'Open Veyral',disconnect:'Disconnect',quit:'Quit Veyral'},
  ru:{connected:'подключено',open:'Открыть Veyral',disconnect:'Отключить',quit:'Выйти из Veyral'},
  tr:{connected:'bağlı',open:'Veyral’i aç',disconnect:'Bağlantıyı kes',quit:'Veyral’den çık'},
  de:{connected:'verbunden',open:'Veyral öffnen',disconnect:'Trennen',quit:'Veyral beenden'},
  fr:{connected:'connecté',open:'Ouvrir Veyral',disconnect:'Déconnecter',quit:'Quitter Veyral'},
  es:{connected:'conectado',open:'Abrir Veyral',disconnect:'Desconectar',quit:'Salir de Veyral'}
};
let googleWindow;
let scanning=false;
let scanController=null;
let active=null;
let switching=false;
let quitting=false;
function showWindow(){if(!mainWindow||mainWindow.isDestroyed())createWindow();else{if(mainWindow.isMinimized())mainWindow.restore();mainWindow.show();mainWindow.focus();}}
function updateTray(){
  if(!tray)return;
  const labels=trayText[uiLanguage];
  tray.setToolTip(active?`Veyral — ${labels.connected}`:'Veyral');
  tray.setContextMenu(Menu.buildFromTemplate([
    {label:labels.open,click:showWindow},
    {label:labels.disconnect,enabled:!!active&&!switching,click:async()=>{await disconnectSystem();if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('connection-state',{connected:false});updateTray();}},
    {type:'separator'},
    {label:labels.quit,click:async()=>{if(quitting)return;quitting=true;while(switching)await new Promise(resolve=>setTimeout(resolve,100));await disconnectSystem();app.quit();}}
  ]));
}
function ensureTray(){if(!tray){tray=new Tray(path.join(__dirname,'assets',process.platform==='win32'?'icon.ico':'icon.png'));tray.on('double-click',showWindow);}updateTray();}
const available=new Map();
let reliability;
let routing={mode:'all',apps:[]};
let wireguard=null;
const routingPath=()=>path.join(app.getPath('userData'),'routing.json');
const wireguardPath=()=>path.join(app.getPath('userData'),'wireguard-profile.enc');
const backupPath=()=>path.join(app.getPath('userData'),'proxy-settings-backup.json');
const cachePath=()=>path.join(app.getPath('userData'),'verified-proxies.json');
const locationCachePath=()=>path.join(app.getPath('userData'),'location-cache.json');
const lastSuccessPath=()=>path.join(app.getPath('userData'),'last-success.json');
const locations=new Map(),pendingLocations=new Map();
const dnsCache=new Map();
const dnsLookup=(host,options,callback)=>{
  const key=`${host}:4`,cached=dnsCache.get(key);
  if(cached&&cached.expires>Date.now()){queueMicrotask(()=>callback(null,cached.address,4));return;}
  dns.lookup(host,{family:4},(error,address)=>{
    if(!error)dnsCache.set(key,{address,expires:Date.now()+5*60*1000});
    callback(error,address,4);
  });
};
function logConnection(stage,data={}){
  const line=JSON.stringify({time:new Date().toISOString(),stage,...data})+'\n';
  try{const file=path.join(app.getPath('userData'),'connection.log');if(fs.existsSync(file)&&fs.statSync(file).size>1024*1024)fs.truncateSync(file,0);fs.appendFileSync(file,line);}catch{}
}
function connectStage(state){if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('connect-stage',state);}
let candidateCache=null,candidateCacheTime=0;
let directIpCache=null,directIpCacheTime=0,directIpPending=null;
function getDirectIp(){
  if(directIpCache&&Date.now()-directIpCacheTime<10*60*1000)return Promise.resolve(directIpCache);
  if(directIpPending)return directIpPending;
  directIpPending=pcExitIp().then(ip=>{directIpCache=ip;directIpCacheTime=Date.now();return ip;}).finally(()=>{directIpPending=null;});
  return directIpPending;
}
function withTimeout(promise,ms,message){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(message)),ms);Promise.resolve(promise).then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});}
function systemProxy(mode,proxyAddress=''){
  return runFile('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'tools','system-proxy.ps1'),'-Mode',mode,'-BackupPath',backupPath(),'-ProxyAddress',proxyAddress],{windowsHide:true,timeout:12000});
}
async function disconnectSystem(){
  if(!active)return {ok:true};
  const current=active;
  clearInterval(current.timer);
  if(googleWindow&&!googleWindow.isDestroyed()){googleWindow.close();googleWindow=null;}
  active=null;
  current.tun.stop();
  updateTray();
  return {ok:true};
}
async function monitorProxy(){
  if(!active||switching)return;
  if(active.routing?.mode==='include'||active.routing?.apps?.some(item=>path.basename(item).toLowerCase()===(process.platform==='win32'?'curl.exe':'curl'))){
    if(active.tun.child.exitCode===null&&active.tun.child.signalCode===null)return;
    switching=true;await disconnectSystem();switching=false;
    if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('connection-state',{connected:false});
    return;
  }
  const ip=await pcExitIp().catch(()=>null);
  if(ip===active.entry.exitIp&&active.tun.child.exitCode===null){active.failures=0;return;}
  active.failures++;
  if(active.failures<2)return;
  if(active.entry.type!=='wireguard')reliability.record(active.entry,false);
  switching=true;
  const result=await disconnectSystem();
  switching=false;
  if(result.ok&&mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('connection-state',{connected:false});
}

function createWindow(){
  mainWindow=new BrowserWindow({width:1200,height:760,minWidth:900,minHeight:620,frame:false,icon:path.join(__dirname,'assets',process.platform==='win32'?'icon.ico':'icon.png'),backgroundColor:'#090a0d',show:false,autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  mainWindow.loadFile('index.html');
  mainWindow.once('ready-to-show',()=>mainWindow.show());
  mainWindow.on('close',event=>{
    if((active||switching)&&!quitting){event.preventDefault();ensureTray();mainWindow.hide();}
  });
}
if(!app.requestSingleInstanceLock())app.quit();
else app.whenReady().then(async()=>{if(process.platform==='win32')app.setAppUserModelId('Veyral');reliability=createReliability(path.join(app.getPath('userData'),'proxy-reliability.json'));routing=routingSettings.load(routingPath());wireguard=wireguardProfile.loadProfile(wireguardPath());try{fs.unlinkSync(path.join(app.getPath('userData'),'veyral-tun.json'));}catch{}try{for(const [ip,value] of Object.entries(JSON.parse(fs.readFileSync(locationCachePath(),'utf8'))))if(Date.now()-value.time<24*60*60*1000)locations.set(ip,value);}catch{}if(process.platform==='win32'&&fs.existsSync(backupPath())){try{await systemProxy('disconnect');}catch{}}createWindow();getDirectIp().catch(()=>{});app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});});
app.on('second-instance',showWindow);
app.on('window-all-closed',()=>{if(process.platform!=='darwin'&&!active&&!switching)app.quit();});
app.on('before-quit',()=>{quitting=true;if(active)active.tun.stop();reliability?.save();});
ipcMain.on('window-action',(event,action)=>{const target=BrowserWindow.fromWebContents(event.sender);if(!target)return;if(action==='minimize')target.minimize();if(action==='maximize')target.isMaximized()?target.unmaximize():target.maximize();if(action==='close')target.close();});
ipcMain.on('set-language',(_event,value)=>{uiLanguage=Object.hasOwn(trayText,value)?value:'en';updateTray();});
ipcMain.handle('get-settings',()=>({routing,wireguard:wireguardProfile.publicInfo(wireguard)}));
ipcMain.handle('save-routing',(_event,value)=>{
  if(active||switching)return {ok:false,error:'Сначала остановите соединение'};
  routing=routingSettings.save(routingPath(),value);
  return {ok:true,routing};
});
ipcMain.handle('choose-program',async()=>{
  const result=await dialog.showOpenDialog(mainWindow,{title:'Choose a program',properties:['openFile'],...(process.platform==='win32'?{filters:[{name:'Windows programs',extensions:['exe']}]}:{})});
  return result.canceled?null:result.filePaths[0];
});
ipcMain.handle('import-wireguard',async()=>{
  if(active||switching)return {ok:false,error:'Сначала остановите соединение'};
  const result=await dialog.showOpenDialog(mainWindow,{title:'Импорт WireGuard',properties:['openFile'],filters:[{name:'WireGuard',extensions:['conf']}]});
  if(result.canceled)return {ok:false,canceled:true};
  try{const file=result.filePaths[0];const profile=wireguardProfile.parseWireGuard(fs.readFileSync(file,'utf8'),path.basename(file));wireguardProfile.saveProfile(wireguardPath(),profile);wireguard=profile;return {ok:true,profile:wireguardProfile.publicInfo(profile)};}
  catch(error){return {ok:false,error:error.message};}
});
ipcMain.handle('remove-wireguard',()=>{
  if(active||switching)return {ok:false,error:'Сначала остановите соединение'};
  wireguard=null;try{fs.unlinkSync(wireguardPath());}catch{}return {ok:true};
});
function connectionCandidates(selected){
  const others=[...available.values()].filter(item=>item.address!==selected.address&&item.countryCode===selected.countryCode);
  others.sort((a,b)=>Number(a.city!==selected.city)-Number(b.city!==selected.city)||(a.rank??a.latency)-(b.rank??b.latency));
  return [selected,...others.slice(0,2)];
}
async function firstWorkingProxy(selected,directIpPromise){
  const candidates=connectionCandidates(selected),controllers=candidates.map(()=>new AbortController());
  try{return await Promise.any(candidates.map(async(entry,index)=>{
    if(index)await new Promise(resolve=>setTimeout(resolve,index*80));
    if(controllers[index].signal.aborted)throw new Error('Cancelled');
    const latency=await tcpSample(entry,controllers[index].signal);
    logConnection('proxy.tcp',{proxy:entry.address,tcpConnectMs:latency===null?2000:Math.round(latency),ok:latency!==null});
    if(latency===null){reliability.record(entry,false);throw new Error('TCP timeout');}
    connectStage('Рукопожатие');
    const result=await probe(entry,{signal:controllers[index].signal,skipLocation:true,log:true});
    if(!result){if(!controllers[index].signal.aborted)reliability.record(entry,false);throw new Error('Proxy handshake failed');}
    const directIp=await directIpPromise;
    if(!directIp||result.exitIp===directIp){reliability.record(entry,false);throw new Error('Proxy did not change IP');}
    return reliability.decorate(result);
  }));}catch{return null;}finally{controllers.forEach(controller=>controller.abort());}
}
ipcMain.handle('connect-proxy',async(_event,key)=>{
  if(switching||active)return {ok:false,error:'Соединение уже включено'};
  const entry=available.get(key);
  if(routing.mode==='include'&&!routing.apps.length)return {ok:false,error:'Выберите программу в настройках маршрутизации'};
  if(!entry)return {ok:false,error:'Обновите список и выберите сервер'};
  switching=true;
  try{
    scanController?.abort();
    const started=performance.now();
    connectStage('Поиск сервера');
    logConnection('connection.start',{selected:key,candidates:connectionCandidates(entry).map(item=>item.address)});
    const directIpPromise=getDirectIp().catch(()=>null);
    const verified=await firstWorkingProxy(entry,directIpPromise);
    if(!verified)return {ok:false,error:'Серверы этой страны не ответили за 4 секунды. Выберите другую локацию'};
    logConnection('connection.selected',{proxy:verified.address,type:verified.type,searchMs:Math.round(performance.now()-started)});
    const canVerify=routing.mode!=='include'&&!routing.apps.some(item=>path.basename(item).toLowerCase()===(process.platform==='win32'?'curl.exe':'curl'));
    let tun;
    try{
      connectStage('Маршрутизация');
      await session.defaultSession.setProxy({mode:'direct'});
      const tunStarted=performance.now();
      tun=await startTun(verified,app.getPath('userData'),routing);
      logConnection('tunnel.ready',{proxy:verified.address,routeMs:Math.round(performance.now()-tunStarted),...tun.timings});
      connectStage('Проверка IP');
      let routedIp=null;
      const checkStarted=performance.now();
      routedIp=canVerify?await pcExitIp().catch(()=>null):null;
      logConnection('pc.verify',{expectedIp:verified.exitIp,actualIp:routedIp,verificationMs:Math.round(performance.now()-checkStarted)});
      if(canVerify&&routedIp!==verified.exitIp){
        const diagnostic={time:new Date().toISOString(),proxy:verified.address,expectedIp:verified.exitIp,actualIp:routedIp,route:await pcRoute().catch(()=>null),tunLog:tun.error()};
        fs.writeFileSync(path.join(app.getPath('userData'),'veyral-diagnostic.json'),JSON.stringify(diagnostic,null,2));
        throw new Error(`Трафик ПК не прошёл через выбранный прокси (${routedIp||'нет ответа'}). Диагностика сохранена в veyral-diagnostic.json`);
      }
    }catch(error){
      if(tun)tun.stop();
      logConnection('connection.failed',{proxy:verified.address,error:error.message,totalMs:Math.round(performance.now()-started)});
      return {ok:false,error:`Не удалось включить туннель: ${error.message}`};
    }
    reliability.record(verified,true);
    active={entry:reliability.decorate(verified),tun,routing,failures:0,timer:setInterval(()=>monitorProxy(),20000)};updateTray();
    try{fs.writeFileSync(lastSuccessPath(),JSON.stringify(verified));}catch{}
    logConnection('connection.ready',{proxy:verified.address,totalMs:Math.round(performance.now()-started)});
    return {ok:true,entry:active.entry,verified:canVerify};
  }finally{switching=false;}
});
ipcMain.handle('disconnect-proxy',async()=>{if(switching)return {ok:false,error:'Подождите завершения подключения'};switching=true;try{return await disconnectSystem();}finally{switching=false;}});
ipcMain.handle('connect-wireguard',async()=>{
  if(active||switching)return {ok:false,error:'Соединение уже включено'};
  if(!wireguard)return {ok:false,error:'Сначала импортируйте файл WireGuard .conf'};
  if(routing.mode==='include'&&!routing.apps.length)return {ok:false,error:'Выберите программу в настройках маршрутизации'};
  switching=true;let tun;
  try{
    scanController?.abort();
    connectStage('Запуск WireGuard');
    const directIp=await getDirectIp().catch(()=>null);
    const started=performance.now();
    tun=await startTun(wireguard,app.getPath('userData'),routing);
    logConnection('wireguard.route',{routeMs:Math.round(performance.now()-started),...tun.timings});
    const canVerify=routing.mode!=='include'&&!routing.apps.some(item=>path.basename(item).toLowerCase()===(process.platform==='win32'?'curl.exe':'curl'));
    let exitIp=null;
    if(canVerify){
      connectStage('Проверка IP');
      const verificationStarted=performance.now();
      exitIp=await pcExitIp().catch(()=>null);
      logConnection('wireguard.verify',{verificationMs:Math.round(performance.now()-verificationStarted),actualIp:exitIp});
      if(!exitIp||exitIp===directIp)throw new Error('Выходной IP ПК не изменился. Проверьте конфигурацию сервера');
    }
    const location=exitIp?await lookupLocation(exitIp).catch(()=>null):null;
    const entry={type:'wireguard',address:'private',name:wireguard.name,city:location?.city||'',countryCode:location?.countryCode||'',latitude:location?.latitude,longitude:location?.longitude,exitIp,latency:null};
    active={entry,tun,routing,failures:0,timer:setInterval(()=>monitorProxy(),20000)};updateTray();
    return {ok:true,entry,verified:canVerify};
  }catch(error){tun?.stop();logConnection('wireguard.failed',{error:error.message});return {ok:false,error:error.message};}
  finally{switching=false;}
});
ipcMain.handle('open-ip-check',async()=>{if(!active)return false;await shell.openExternal(`https://api.ipify.org?format=json&t=${Date.now()}`);return true;});
async function openGoogleLocation(show=true){
  if(!active)return {ok:false,error:'Сначала подключитесь к серверу'};
  if(active.routing?.mode==='include')return {ok:false,error:'В режиме выбранных программ проверяйте IP внутри этих программ'};
  if(googleWindow&&!googleWindow.isDestroyed()){if(show){googleWindow.show();googleWindow.focus();}return {ok:true};}
  const connection=active;
  const {latitude,longitude}=connection.entry;
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude))return {ok:false,error:'Координаты выхода неизвестны'};
  const isolated=session.fromPartition('persist:veyral-google');
  try{
    isolated.setUserAgent(`Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`);
    await isolated.setProxy({mode:'direct'});
    const isGoogle=url=>{try{const host=new URL(url).hostname;return host==='google.com'||host.endsWith('.google.com');}catch{return false;}};
    isolated.setPermissionRequestHandler((contents,permission,callback,details)=>callback(permission==='geolocation'&&isGoogle(details.requestingUrl||contents.getURL())));
    isolated.setPermissionCheckHandler((_contents,permission,origin)=>permission==='geolocation'&&isGoogle(origin));
    googleWindow=new BrowserWindow({width:1100,height:760,minWidth:800,minHeight:600,show,title:'Veyral · Google',backgroundColor:'#fff',autoHideMenuBar:true,webPreferences:{partition:'persist:veyral-google',contextIsolation:true,nodeIntegration:false,sandbox:true}});
    googleWindow.on('closed',()=>{googleWindow=null;});
    googleWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    googleWindow.webContents.on('did-finish-load',async()=>{
      if(active!==connection||!googleWindow||googleWindow.isDestroyed()||!googleWindow.webContents.getURL().startsWith('https://www.google.com/search'))return;
      try{
        const footer=await googleWindow.webContents.executeJavaScript('document.body?.innerText.slice(-1200)||""');
        const location=footer.match(/([^\n]{2,100})\s*-\s*From your IP address/i)?.[1]?.trim();
        if(location){connection.entry.googleLocation=location;if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('google-location',{key:`${connection.entry.type}://${connection.entry.address}`,location});}
      }catch{}
    });
    await withTimeout(googleWindow.loadURL('about:blank'),3000,'Окно Google не открылось');
    googleWindow.webContents.debugger.attach('1.3');
    await withTimeout(googleWindow.webContents.debugger.sendCommand('Emulation.setGeolocationOverride',{latitude,longitude,accuracy:1000}),3000,'Не удалось установить геолокацию');
    if(active!==connection)throw new Error('Соединение остановлено');
    try{await withTimeout(googleWindow.loadURL('https://www.google.com/search?q=where+am+i&hl=en'),15000,'Google не ответил за 15 секунд');}
    catch(error){if(!googleWindow.webContents.getURL().startsWith('https://www.google.com/sorry/'))throw error;}
    if(show)googleWindow.show();
    return {ok:true,captcha:googleWindow.webContents.getURL().includes('/sorry/')};
  }catch(error){
    if(googleWindow&&!googleWindow.isDestroyed())googleWindow.close();
    return {ok:false,error:`Не удалось открыть Google через выбранный прокси: ${error.message}`};
  }
}
ipcMain.handle('open-google-location',()=>openGoogleLocation(true));

function download(url){return new Promise((resolve,reject)=>{const request=https.get(url,{timeout:4000,signal:AbortSignal.timeout(4500),headers:{'User-Agent':'Veyral/0.2'}},response=>{if(response.statusCode!==200){response.resume();reject(new Error(`Source returned ${response.statusCode}`));return;}let data='';response.setEncoding('utf8');response.on('data',chunk=>{data+=chunk;if(data.length>12_000_000)request.destroy(new Error('Source too large'));});response.on('end',()=>resolve(data));});request.on('timeout',()=>request.destroy(new Error('Source timeout')));request.on('error',reject);});}
async function pcExitIp(){
  const {stdout}=await runFile(process.platform==='win32'?'curl.exe':'curl',['-4','--silent','--show-error','--fail','--noproxy','*','--max-time','4',`https://api.ipify.org?format=json&t=${Date.now()}`],{windowsHide:true,timeout:5000});
  const ip=JSON.parse(stdout).ip;
  if(net.isIP(ip)!==4)throw new Error('Некорректный IP при проверке ПК');
  return ip;
}
async function pcRoute(){
  if(process.platform==='linux')return (await runFile('ip',['-4','route','get','9.9.9.9'],{timeout:5000})).stdout.trim();
  if(process.platform==='darwin')return (await runFile('route',['-n','get','9.9.9.9'],{timeout:5000})).stdout.trim();
  const command="$route=Find-NetRoute -RemoteIPAddress 9.9.9.9 -ErrorAction SilentlyContinue | Where-Object { $_.DestinationPrefix } | Select-Object -Last 1; $route | Select-Object InterfaceAlias,DestinationPrefix,NextHop,RouteMetric,InterfaceMetric | ConvertTo-Json -Compress";
  const {stdout}=await runFile('powershell.exe',['-NoProfile','-Command',command],{windowsHide:true,timeout:5000});
  return JSON.parse(stdout);
}
function lookupLocation(ip){
  const cached=locations.get(ip);
  if(cached&&Date.now()-cached.time<24*60*60*1000)return Promise.resolve(cached);
  if(pendingLocations.has(ip))return pendingLocations.get(ip);
  const promise=new Promise(resolve=>{
    const request=https.get(`https://ipwho.is/${ip}`,{timeout:2000},response=>{
      if(response.statusCode!==200){response.resume();resolve(null);return;}
      let body='';response.setEncoding('utf8');response.on('data',chunk=>{body+=chunk;if(body.length>10000)request.destroy();});
      response.on('end',()=>{try{const data=JSON.parse(body);if(data.success!==true||!/^[A-Z]{2}$/.test(data.country_code)||!Number.isFinite(data.latitude)||!Number.isFinite(data.longitude))return resolve(null);const location={time:Date.now(),countryCode:data.country_code,city:String(data.city||''),latitude:data.latitude,longitude:data.longitude};locations.set(ip,location);resolve(location);}catch{resolve(null);}});
    });
    const timer=setTimeout(()=>{request.destroy();resolve(null);},2000);
    request.on('close',()=>clearTimeout(timer));request.on('error',()=>resolve(null));
  }).finally(()=>pendingLocations.delete(ip));
  pendingLocations.set(ip,promise);return promise;
}
async function loadCandidates(){
  if(candidateCache&&Date.now()-candidateCacheTime<10*60*1000)return candidateCache;
  const sources=await Promise.all(PROXY_SOURCES.map(async source=>{
    try{return await Promise.any(source.urls.map(async url=>{const rows=JSON.parse(await download(url));if(!Array.isArray(rows))throw new Error('Invalid source');return {name:source.name,rows};}));}
    catch{return null;}
  }));
  if(!sources.some(Boolean))throw new Error('Proxy lists unavailable');
  const perCountry=new Map(),seen=new Set();
  const add=(source,ip,port,type,countryCode,country,city,latency)=>{
    const code=String(countryCode||'').toUpperCase(),address=`${ip}:${port}`,key=`${type}:${address}`;
    if(!['socks4','socks5','http'].includes(type)||net.isIP(ip)!==4||!Number.isInteger(port)||port<1||port>65535||!/^[A-Z]{2}$/.test(code)||seen.has(key))return;
    seen.add(key);
    const entry={address,type,countryCode:code,country:String(country||''),city:String(city||''),sourceLatency:Number.isFinite(latency)&&latency>0?latency:5000};
    const groups=perCountry.get(code)||new Map(),group=groups.get(source)||[];group.push(entry);groups.set(source,group);perCountry.set(code,groups);
  };
  for(const source of sources){if(!source)continue;
    for(const item of source.rows){
      if(source.name==='proxyscrape')add(source.name,String(item.ip||''),Number(item.port),item.protocol,item.country_code,item.country,item.city,Number(item.latency_ms)+100);
      else if(source.name==='hproxy'){
        if(item.alive!==true||item.anonymity==='transparent'||Number(item.uptime_24h)<50)continue;
        for(const type of item.protocols||[])add(source.name,String(item.ip||''),Number(item.port),type,item.country,'',item.city,Number(item.latency_ms)+(100-Number(item.uptime_24h))*8);
      }else if(source.name==='monosans'){
        if(item.username||item.password)continue;
        const geo=item.geolocation||{};
        add(source.name,String(item.host||''),Number(item.port),item.protocol,geo.country?.iso_code,geo.country?.names?.en,geo.city?.names?.en,Number(item.timeout)*1000);
      }
    }
  }
  const selected=[];
  for(const groups of perCountry.values())for(const group of groups.values()){group.sort((a,b)=>a.sourceLatency-b.sourceLatency);selected.push(...group.slice(0,4));}
  candidateCache=selected.sort((a,b)=>a.sourceLatency-b.sourceLatency).slice(0,360);
  candidateCacheTime=Date.now();
  return candidateCache;
}
function median(values){const sorted=[...values].sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);return sorted.length?sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2:null;}
function tcpSample(entry,signal){return new Promise(resolve=>{
  const [host,rawPort]=entry.address.split(':');
  if(signal?.aborted)return resolve(null);
  const started=performance.now(),socket=net.connect({host,port:Number(rawPort),family:4});
  let done=false;
  const finish=value=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);socket.destroy();resolve(value);};
  const abort=()=>finish(null);
  const timer=setTimeout(()=>finish(null),2000);
  signal?.addEventListener('abort',abort,{once:true});
  socket.once('connect',()=>finish(performance.now()-started));
  socket.once('error',()=>finish(null));
});}
async function tcpPing(entry,signal){
  const values=[];
  for(let i=0;i<3;i++){
    if(signal?.aborted)return null;
    const sample=await tcpSample(entry,signal);
    if(sample!==null)values.push(sample);
    else if(i===0)return null;
  }
  return values.length>=2?median(values):null;
}
function probe(entry,{signal,skipLocation=false,log=false}={}){return new Promise(resolve=>{
  if(signal?.aborted)return resolve(null);
  const started=performance.now(),url=`${entry.type}://${entry.address}`;
  const agent=entry.type==='http'?new HttpsProxyAgent(url,{keepAlive:true}):new SocksProxyAgent(url,{timeout:4000,keepAlive:true});
  const timings={dnsMs:0,tcpPingMedianMs:entry.latency??null,authorizationMs:0,proxyHandshakeWithTcpMs:null,tlsMs:null,firstByteMs:null};
  let finished=false,timer,proxyReady=null,tlsReady=null,dnsStarted=null;
  const finish=result=>{
    if(finished)return;finished=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);agent.destroy();
    if(log)logConnection('proxy.preflight',{proxy:entry.address,type:entry.type,ok:!!result,...timings,totalMs:Math.round(performance.now()-started)});
    resolve(result);
  };
  const request=https.get('https://api.ipify.org?format=json',{agent,timeout:4000,family:4,lookup:(host,options,callback)=>{dnsStarted=performance.now();dnsLookup(host,options,(error,address,family)=>{timings.dnsMs=Math.round(performance.now()-dnsStarted);callback(error,address,family);});},headers:{'User-Agent':'Veyral/0.3','Accept':'application/json'}},response=>{
    timings.firstByteMs=Math.round(performance.now()-(tlsReady??proxyReady??started));
    if(response.statusCode!==200){response.resume();finish(null);return;}
    let body='';response.setEncoding('utf8');
    response.on('data',chunk=>{body+=chunk;if(body.length>512)request.destroy(new Error('IP response too large'));});
    response.on('end',async()=>{
      try{
        const exitIp=JSON.parse(body).ip;if(!net.isIP(exitIp))return finish(null);
        clearTimeout(timer);
        const location=skipLocation?null:await lookupLocation(exitIp);
        const countryCode=location?.countryCode||entry.countryCode;
        const fallback=countryCoordinates[countryCode]||[];
        const {sourceLatency,...publicEntry}=entry;
        finish({...publicEntry,exitIp,countryCode,city:location?.city||entry.city||'',latitude:location?.latitude??entry.latitude??fallback[1],longitude:location?.longitude??entry.longitude??fallback[0],latency:entry.latency,locationSource:location?'ipwhois':entry.locationSource||'source'});
      }catch{finish(null);}
    });
  });
  const abort=()=>{request.destroy();finish(null);};
  signal?.addEventListener('abort',abort,{once:true});
  request.on('proxy',()=>{proxyReady=performance.now();timings.proxyHandshakeWithTcpMs=Math.round(proxyReady-started-timings.dnsMs);});
  request.on('socket',socket=>socket.once('secureConnect',()=>{tlsReady=performance.now();timings.tlsMs=Math.round(tlsReady-(proxyReady??started));}));
  request.on('timeout',()=>request.destroy(new Error('Proxy timeout')));
  request.on('error',()=>finish(null));
  timer=setTimeout(()=>{request.destroy(new Error('Proxy timeout'));finish(null);},4000);
});}
ipcMain.handle('scan',async event=>{
  if(scanning)return false;scanning=true;scanController=new AbortController();
  const send=payload=>{if(!event.sender.isDestroyed())event.sender.send('scan-progress',payload);};
  try{
    if(!available.size){
      try{const entry=JSON.parse(fs.readFileSync(lastSuccessPath(),'utf8'));if(entry?.exitIp&&Number.isFinite(entry.latency)){const rated=reliability.decorate(entry);available.set(`${rated.type}://${rated.address}`,rated);send({entry:rated,lastSuccess:true});}}catch{}
      try{const cache=JSON.parse(fs.readFileSync(cachePath(),'utf8'));if(cache.version===2&&Date.now()-cache.time<60*60*1000)for(const entry of cache.entries){if(!entry.locationSource)continue;const rated=reliability.decorate(entry);available.set(`${rated.type}://${rated.address}`,rated);send({entry:rated});}}catch{}
    }
    const candidates=await loadCandidates();let checked=0;
    send({total:candidates.length,checked:0,state:'Проверка серверов'});
    if(!candidates.length){send({done:true,error:true,checked:0});return false;}
    let index=0;const fresh=new Map();
    await Promise.all(Array.from({length:12},async()=>{while(index<candidates.length&&!scanController.signal.aborted){const entry=candidates[index++];const latency=await tcpPing(entry,scanController.signal);const result=latency===null?null:await probe({...entry,latency},{signal:scanController.signal});checked++;if(!scanController.signal.aborted)reliability.record(entry,!!result);if(result){const rated=reliability.decorate(result),key=`${rated.type}://${rated.address}`;fresh.set(key,rated);available.set(key,rated);send({entry:rated});}else if(!scanController.signal.aborted){const key=`${entry.type}://${entry.address}`;available.delete(key);send({unavailable:key});}if(checked%4===0||checked===candidates.length)send({total:candidates.length,checked});}}));
    if(scanController.signal.aborted){send({done:true,checked,keys:[...available.keys()]});return true;}
    available.clear();for(const [key,entry] of fresh)available.set(key,entry);
    try{fs.writeFileSync(cachePath(),JSON.stringify({version:2,time:Date.now(),entries:[...fresh.values()]}));}catch{}
    try{fs.writeFileSync(locationCachePath(),JSON.stringify(Object.fromEntries(locations)));}catch{}
    send({done:true,checked,keys:[...available.keys()]});return true;
  }catch{send({done:true,error:true,checked:0});return false;}finally{scanning=false;scanController=null;}
});
