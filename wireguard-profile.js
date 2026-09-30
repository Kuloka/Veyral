const fs=require('node:fs');
const net=require('node:net');
const path=require('node:path');
const {safeStorage}=require('electron');

function validCidr(value){
  const [ip,bits,...extra]=value.split('/'),family=net.isIP(ip),max=family===4?32:family===6?128:-1;
  return !extra.length&&max>=0&&/^\d+$/.test(bits||'')&&Number(bits)<=max;
}
function validKey(value){return /^[A-Za-z0-9+/]{43}=$/.test(value)&&Buffer.from(value,'base64').length===32;}
function parseWireGuard(source,name='Мой WireGuard'){
  if(typeof source!=='string'||source.length>65536)throw new Error('Файл WireGuard слишком большой');
  const interfaceFields={},peers=[];let current=null;
  for(const raw of source.replace(/^\uFEFF/,'').split(/\r?\n/)){
    const line=raw.trim();if(!line||line.startsWith('#')||line.startsWith(';'))continue;
    const section=/^\[([^\]]+)\]$/.exec(line);
    if(section){const label=section[1].toLowerCase();current=label==='interface'?interfaceFields:label==='peer'?(peers.push({}),peers.at(-1)):null;continue;}
    const separator=line.indexOf('=');if(separator<1||!current)continue;
    current[line.slice(0,separator).trim().toLowerCase()]=line.slice(separator+1).trim();
  }
  const privateKey=interfaceFields.privatekey||'';
  if(!validKey(privateKey))throw new Error('В файле нет корректного PrivateKey');
  const address=String(interfaceFields.address||'').split(',').map(item=>item.trim()).filter(Boolean);
  if(!address.length||address.some(item=>!validCidr(item)))throw new Error('Некорректное поле Address');
  if(!peers.length)throw new Error('В файле нет секции [Peer]');
  const parsedPeers=peers.map(peer=>{
    if(!validKey(peer.publickey||''))throw new Error('Некорректный PublicKey');
    if(peer.presharedkey&&!validKey(peer.presharedkey))throw new Error('Некорректный PresharedKey');
    const match=/^(?:\[([^\]]+)\]|([^:]+)):(\d{1,5})$/.exec(peer.endpoint||'');
    if(!match||Number(match[3])<1||Number(match[3])>65535)throw new Error('Некорректный Endpoint');
    const host=match[1]||match[2];
    if(!net.isIP(host)&&!/^([a-z\d-]+\.)*[a-z\d-]+$/i.test(host))throw new Error('Некорректный адрес Endpoint');
    const allowedIPs=String(peer.allowedips||'').split(',').map(item=>item.trim()).filter(Boolean);
    if(!allowedIPs.length||allowedIPs.some(item=>!validCidr(item)))throw new Error('Некорректное поле AllowedIPs');
    return {host,port:Number(match[3]),publicKey:peer.publickey,preSharedKey:peer.presharedkey||'',allowedIPs,keepalive:Math.min(120,Math.max(0,Number(peer.persistentkeepalive)||0))};
  });
  if(!parsedPeers.some(peer=>peer.allowedIPs.includes('0.0.0.0/0')))throw new Error('Для смены IP нужен AllowedIPs = 0.0.0.0/0');
  return {type:'wireguard',name:path.basename(name).replace(/\.conf$/i,'').slice(0,48)||'Мой WireGuard',privateKey,address,peers:parsedPeers,mtu:Math.min(9000,Math.max(576,Number(interfaceFields.mtu)||1408))};
}
function saveProfile(file,profile){
  if(!safeStorage.isEncryptionAvailable())throw new Error('Защищённое хранилище Windows недоступно');
  fs.writeFileSync(file,safeStorage.encryptString(JSON.stringify(profile)).toString('base64'));
}
function loadProfile(file){
  try{if(!safeStorage.isEncryptionAvailable())return null;return JSON.parse(safeStorage.decryptString(Buffer.from(fs.readFileSync(file,'utf8'),'base64')));}catch{return null;}
}
function publicInfo(profile){return profile?{name:profile.name,address:profile.address,endpoint:profile.peers[0]?.host}:null;}

module.exports={parseWireGuard,saveProfile,loadProfile,publicInfo};
