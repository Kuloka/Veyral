const fs=require('node:fs');
const path=require('node:path');
const {spawn,execFile}=require('node:child_process');
const {promisify}=require('node:util');
const crypto=require('node:crypto');
const dns=require('node:dns').promises;
const net=require('node:net');
const {app}=require('electron');

const runFile=promisify(execFile);
const platform=process.platform==='win32'?'windows':process.platform==='darwin'?'darwin':'linux';
const architecture=process.arch==='arm64'?'arm64':'amd64';
const engineFolder=`sing-box-1.14.1-${platform}-${architecture}`;
const engineRoot=app.isPackaged?process.resourcesPath:__dirname;
const binary=path.join(engineRoot,'vendor',engineFolder,process.platform==='win32'?'sing-box.exe':'sing-box');
const EXPECTED_HASH='b838de45bd0b2e6ddbed1977e4745622f7dffab3b293807ff4c6b1b640fed909';
const endpointCache=new Map();
async function endpointIp(host){
  if(net.isIP(host))return host;
  const cached=endpointCache.get(host);
  if(cached&&cached.expires>Date.now())return cached.address;
  const lookup=await Promise.race([dns.lookup(host,{family:4}),new Promise((_,reject)=>setTimeout(()=>reject(new Error('DNS сервера WireGuard не ответил за 3 секунды')),3000))]);
  endpointCache.set(host,{address:lookup.address,expires:Date.now()+300000});
  return lookup.address;
}

function configFor(entry,routing={mode:'all',apps:[]},upstreamInterface=null){
  const wireguard=entry.type==='wireguard';
  let proxy;
  if(wireguard){
    proxy={type:'wireguard',tag:'proxy',system:false,mtu:entry.mtu,address:entry.address,private_key:entry.privateKey,peers:entry.peers.map(peer=>({address:peer.host,port:peer.port,public_key:peer.publicKey,...(peer.preSharedKey?{pre_shared_key:peer.preSharedKey}:{}),allowed_ips:peer.allowedIPs,persistent_keepalive_interval:peer.keepalive||25}))};
  }else{
    const [server,rawPort]=entry.address.split(':');
    const server_port=Number(rawPort);
    if(!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(server)||!Number.isInteger(server_port)||server_port<1||server_port>65535)throw new Error('Invalid proxy address');
    proxy=entry.type==='http'?{type:'http',tag:'proxy',server,server_port}:{type:'socks',tag:'proxy',server,server_port,version:entry.type==='socks4'?'4':'5',network:'tcp'};
  }
  const rules=[{port:53,action:'hijack-dns'},{ip_cidr:['172.19.0.0/30','fdfe:dcba:9876::/126'],action:'reject',method:'drop'},{ip_is_private:true,action:'route',outbound:'direct'}];
  if(routing.mode==='exclude'&&routing.apps?.length)rules.push({process_path:routing.apps,action:'route',outbound:'direct'});
  if(!wireguard)rules.push({network:'udp',action:'reject'});
  if(routing.mode==='include'&&routing.apps?.length)rules.push({process_path:routing.apps,action:'route',outbound:'proxy'});
  return {log:{level:'warn'},dns:{servers:[{type:'https',tag:'remote-dns',server:'1.1.1.1',tls:{server_name:'cloudflare-dns.com'},detour:'proxy'}],final:'remote-dns'},inbounds:[{type:'tun',tag:'tun-in',...(process.platform==='darwin'?{}:{interface_name:'Veyral'}),address:['172.19.0.1/30','fdfe:dcba:9876::1/126'],auto_route:true,strict_route:process.platform!=='darwin',...(process.platform==='linux'?{auto_redirect:true}:{}),dns_mode:'hijack',stack:'gvisor'}],...(wireguard?{endpoints:[proxy],outbounds:[{type:'direct',tag:'direct'}]}:{outbounds:[proxy,{type:'direct',tag:'direct'}]}),route:{...(process.platform==='win32'&&upstreamInterface?{default_interface:upstreamInterface}:{auto_detect_interface:true}),final:routing.mode==='include'?'direct':'proxy',rules}};
}

async function windowsUpstreamInterface(ip){
  if(net.isIP(ip)!==4)throw new Error('Cannot select the network interface for a non-IPv4 server');
  const command=`$ErrorActionPreference='Stop'; $route=Find-NetRoute -RemoteIPAddress '${ip}' | Where-Object { $_.DestinationPrefix } | Select-Object -Last 1; if (-not $route -or $route.InterfaceAlias -eq 'Veyral') { throw 'No physical route to server' }; $interface=Get-NetIPInterface -InterfaceIndex $route.InterfaceIndex -AddressFamily IPv4; if ($interface.ConnectionState -ne 'Connected') { throw 'Server network interface is disconnected' }; [string]$route.InterfaceAlias`;
  const {stdout}=await runFile('powershell.exe',['-NoProfile','-Command',command],{windowsHide:true,timeout:5000});
  const name=stdout.trim();
  if(!name||name.includes('\n'))throw new Error('Could not identify the upstream network interface');
  return name;
}

async function isAdministrator(){
  const {stdout}=await runFile('powershell.exe',['-NoProfile','-Command','([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)'],{windowsHide:true,timeout:5000});
  return stdout.trim().toLowerCase()==='true';
}

async function routeIsReady(){
  if(process.platform==='linux'){
    try{await runFile('ip',['link','show','Veyral'],{timeout:2000});return true;}catch{return false;}
  }
  if(process.platform==='darwin'){
    try{const {stdout}=await runFile('route',['-n','get','9.9.9.9'],{timeout:2000});return /interface:\s*utun\d+/i.test(stdout);}catch{return false;}
  }
  const command="$route=Find-NetRoute -RemoteIPAddress 9.9.9.9 -ErrorAction SilentlyContinue | Where-Object { $_.DestinationPrefix } | Select-Object -Last 1; if ($route.InterfaceAlias -eq 'Veyral') { 'ready' }";
  const {stdout}=await runFile('powershell.exe',['-NoProfile','-Command',command],{windowsHide:true,timeout:5000});
  return stdout.includes('ready');
}

const shellQuote=value=>`'${String(value).replace(/'/g,"'\\''")}'`;
function launchTun(configPath,userData){
  if(process.platform==='win32')return {child:spawn(binary,['run','-c',configPath],{windowsHide:true,stdio:['ignore','ignore','pipe']}),pidFile:null};
  const pidFile=path.join(userData,'veyral-engine.pid');
  try{fs.unlinkSync(pidFile);}catch{}
  const command=`echo $$ > ${shellQuote(pidFile)}; (while kill -0 ${process.pid} 2>/dev/null && kill -0 $$ 2>/dev/null; do sleep 2; done; kill -TERM $$ 2>/dev/null) & exec ${shellQuote(binary)} run -c ${shellQuote(configPath)}`;
  if(process.platform==='linux'){
    const args=process.getuid?.()===0?['-c',command]:['/bin/sh','-c',command];
    return {child:spawn(process.getuid?.()===0?'/bin/sh':'pkexec',args,{stdio:['ignore','ignore','pipe']}),pidFile};
  }
  const appleScript=`do shell script ${JSON.stringify(`/bin/sh -c ${shellQuote(command)}`)} with administrator privileges`;
  return {child:spawn('osascript',['-e',appleScript],{stdio:['ignore','ignore','pipe']}),pidFile};
}
function stopTun(child,pidFile){
  if(!child.killed)child.kill();
  if(!pidFile)return;
  let pid;
  try{pid=Number(fs.readFileSync(pidFile,'utf8').trim());}catch{return;}
  if(!Number.isSafeInteger(pid)||pid<2)return;
  const command=`kill -TERM ${pid}`;
  if(process.platform==='linux'&&process.getuid?.()!==0)spawn('pkexec',['/bin/sh','-c',command],{detached:true,stdio:'ignore'}).unref();
  else if(process.platform==='darwin')spawn('osascript',['-e',`do shell script ${JSON.stringify(command)} with administrator privileges`],{detached:true,stdio:'ignore'}).unref();
  else try{process.kill(pid,'SIGTERM');}catch{}
  try{fs.unlinkSync(pidFile);}catch{}
}

async function startTun(entry,userData,routing){
  const timings={};let stageStarted=performance.now();
  if(!fs.existsSync(binary))throw new Error('sing-box is missing. Run npm run prepare:engine');
  if(process.platform==='win32'&&!await isAdministrator())throw new Error('Run Veyral as administrator to enable the tunnel');
  timings.windowsAuthorizationMs=Math.round(performance.now()-stageStarted);
  stageStarted=performance.now();
  const hash=crypto.createHash('sha256').update(fs.readFileSync(binary)).digest('hex');
  if(process.platform==='win32'&&!app.isPackaged&&hash!==EXPECTED_HASH)throw new Error('sing-box SHA-256 does not match the official release');
  const configPath=path.join(userData,'veyral-tun.json');
  let configured=entry;
  if(entry.type==='wireguard'){
    const peers=await Promise.all(entry.peers.map(async peer=>({...peer,host:await endpointIp(peer.host)})));
    configured={...entry,peers};
  }
  const upstreamInterface=process.platform==='win32'?await windowsUpstreamInterface(entry.type==='wireguard'?configured.peers[0].host:entry.address.split(':')[0]):null;
  timings.upstreamInterface=upstreamInterface;
  fs.writeFileSync(configPath,JSON.stringify(configFor(configured,routing,upstreamInterface)),{mode:0o600});
  try{await runFile(binary,['check','-c',configPath],{windowsHide:true,timeout:10000});}
  catch(error){if(entry.type==='wireguard')try{fs.unlinkSync(configPath);}catch{}throw error;}
  timings.configCheckMs=Math.round(performance.now()-stageStarted);
  stageStarted=performance.now();
  const {child,pidFile}=launchTun(configPath,userData);
  let stderr='';
  child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-4000);});
  child.on('error',error=>{stderr=error.message;});
  try{
    const deadline=Date.now()+(process.platform==='win32'?6000:45000);let ready=false;
    while(Date.now()<deadline){
      if(child.exitCode!==null||child.signalCode!==null)throw new Error(stderr||`sing-box завершился с кодом ${child.exitCode}`);
      if(await routeIsReady()){ready=true;break;}
      await new Promise(resolve=>setTimeout(resolve,700));
    }
    if(!ready)throw new Error(`Veyral could not create the system route. ${stderr}`.trim());
  }catch(error){stopTun(child,pidFile);if(entry.type==='wireguard')try{fs.unlinkSync(configPath);}catch{}throw error;}
  if(entry.type==='wireguard')try{fs.unlinkSync(configPath);}catch{}
  timings.routeReadyMs=Math.round(performance.now()-stageStarted);
  if(process.platform==='win32'){
    const watcher=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'tools','watch-tun.ps1'),'-ParentPid',String(process.pid),'-TunPid',String(child.pid)],{windowsHide:true,stdio:'ignore',detached:true});
    watcher.unref();
  }
  return {child,timings,stop:()=>stopTun(child,pidFile),error:()=>stderr};
}

module.exports={startTun,configFor,binary};
