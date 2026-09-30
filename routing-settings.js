const fs=require('node:fs');
const path=require('node:path');

function normalize(value){
  const mode=['all','include','exclude'].includes(value?.mode)?value.mode:'all';
  const apps=[...new Set((Array.isArray(value?.apps)?value.apps:[]).filter(item=>typeof item==='string'&&path.isAbsolute(item)&&(process.platform!=='win32'||/\.exe$/i.test(item))).slice(0,20))];
  return {mode,apps};
}
function load(file){try{return normalize(JSON.parse(fs.readFileSync(file,'utf8')));}catch{return normalize(null);}}
function save(file,value){const normalized=normalize(value);fs.writeFileSync(file,JSON.stringify(normalized));return normalized;}
module.exports={normalize,load,save};
