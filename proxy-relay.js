const http=require('node:http');
const net=require('node:net');
const dns=require('node:dns').promises;
const {SocksClient}=require('socks');
const {SocksProxyAgent}=require('socks-proxy-agent');
const {HttpProxyAgent}=require('http-proxy-agent');

function upstreamSocket(entry,host,port){
  if(entry.type!=='http')return (async()=>{
    const ip=entry.address.split(':')[0],proxyPort=Number(entry.address.split(':')[1]);
    const destination=entry.type==='socks4'?(await dns.lookup(host,{family:4})).address:host;
    const result=await SocksClient.createConnection({proxy:{host:ip,port:proxyPort,type:entry.type==='socks4'?4:5},destination:{host:destination,port},command:'connect',timeout:8000});
    return result.socket;
  })();
  return new Promise((resolve,reject)=>{
    const [ip,proxyPort]=entry.address.split(':');
    const socket=net.connect(Number(proxyPort),ip);
    socket.on('error',()=>socket.destroy());
    let header=Buffer.alloc(0),done=false;
    const fail=error=>{if(done)return;done=true;socket.destroy();reject(error);};
    socket.setTimeout(8000,()=>fail(new Error('Proxy timeout')));
    socket.once('error',fail);
    socket.once('connect',()=>socket.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\nProxy-Connection: keep-alive\r\n\r\n`));
    const onData=chunk=>{
      header=Buffer.concat([header,chunk]);
      if(header.length>8192)return fail(new Error('Proxy response too large'));
      const end=header.indexOf('\r\n\r\n');if(end<0)return;
      socket.removeListener('data',onData);
      if(!/^HTTP\/1\.[01] 200\b/.test(header.toString('latin1',0,end)))return fail(new Error('Proxy refused tunnel'));
      done=true;socket.setTimeout(0);socket.removeListener('error',fail);
      if(header.length>end+4)socket.unshift(header.subarray(end+4));
      resolve(socket);
    };
    socket.on('data',onData);
  });
}

async function createRelay(entry){
  const proxyUrl=`${entry.type}://${entry.address}`;
  const connections=new Set();
  const server=http.createServer((request,response)=>{
    let target;
    try{target=new URL(request.url);if(target.protocol!=='http:')throw new Error('Unsupported protocol');}
    catch{response.writeHead(400).end();return;}
    const agent=entry.type==='http'?new HttpProxyAgent(proxyUrl):new SocksProxyAgent(proxyUrl,{timeout:8000});
    const outgoing=http.request(target,{method:request.method,headers:request.headers,agent,timeout:8000},upstream=>{
      response.writeHead(upstream.statusCode,upstream.headers);upstream.pipe(response);
    });
    outgoing.on('error',()=>{if(!response.headersSent)response.writeHead(502);response.end();});
    outgoing.on('timeout',()=>outgoing.destroy(new Error('Proxy timeout')));
    response.on('close',()=>{outgoing.destroy();agent.destroy();});
    request.pipe(outgoing);
  });
  server.on('connect',(request,client,head)=>{
    client.on('error',()=>client.destroy());
    const match=/^([^:]+):(\d{1,5})$/.exec(request.url||'');
    if(!match||Number(match[2])>65535){client.end('HTTP/1.1 400 Bad Request\r\n\r\n');return;}
    upstreamSocket(entry,match[1],Number(match[2])).then(remote=>{
      remote.on('error',()=>client.destroy());
      if(client.destroyed){remote.destroy();return;}
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if(head.length)remote.write(head);
      client.pipe(remote);remote.pipe(client);
      client.on('error',()=>remote.destroy());
      client.on('close',()=>remote.destroy());remote.on('close',()=>client.destroy());
    }).catch(()=>{if(!client.destroyed)client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');});
  });
  server.on('connection',socket=>{connections.add(socket);socket.on('error',()=>socket.destroy());socket.on('close',()=>connections.delete(socket));});
  server.stop=()=>{for(const socket of connections)socket.destroy();server.close();};
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  return server;
}

module.exports={createRelay};
