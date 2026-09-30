const fs=require('node:fs');

function createReliability(file){
  let history={};
  try{history=JSON.parse(fs.readFileSync(file,'utf8'));if(!history||typeof history!=='object')history={};}catch{}
  let saveTimer=null;
  const save=()=>{clearTimeout(saveTimer);saveTimer=null;try{fs.writeFileSync(file,JSON.stringify(history));}catch{}};
  const schedule=()=>{if(!saveTimer)saveTimer=setTimeout(save,1000);};
  const keyOf=entry=>`${entry.type}://${entry.address}`;
  function record(entry,ok){
    const key=keyOf(entry),item=history[key]||{recent:[],successes:0,failures:0};
    item.recent.push(ok?1:0);if(item.recent.length>20)item.recent.shift();
    item[ok?'successes':'failures']++;
    item[ok?'lastSuccess':'lastFailure']=Date.now();
    history[key]=item;schedule();
  }
  function decorate(entry){
    const item=history[keyOf(entry)];
    const recent=Array.isArray(item?.recent)?item.recent:[];
    const score=(recent.reduce((sum,value)=>sum+(value?1:0),0)+2)/(recent.length+4);
    const latestFailure=Number(item?.lastFailure)||0,latestSuccess=Number(item?.lastSuccess)||0;
    const penalty=latestFailure>latestSuccess&&Date.now()-latestFailure<10*60*1000?150:0;
    return {...entry,reliability:recent.length>=3?Math.round(score*100):null,rank:Math.round((entry.latency||1000)+(1-score)*400+penalty)};
  }
  return {record,decorate,save};
}

module.exports={createReliability};
