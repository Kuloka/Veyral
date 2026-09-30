import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';

const version='1.14.1';
const targets={
  'win32-x64':['windows-amd64','zip','5197f16d492d93202dc623622149a6ed040f8eca263128f91d603f2b901baa89','b838de45bd0b2e6ddbed1977e4745622f7dffab3b293807ff4c6b1b640fed909'],
  'linux-x64':['linux-amd64','tar.gz','12cb2816b52febb356f6a885b740cc8758c3f30b8ae0ca8edba80f0d2d35343f'],
  'darwin-x64':['darwin-amd64','tar.gz','b34381b047106fe84895df14f7aaae06f3182130b728006944deb0d59d8590c3'],
  'darwin-arm64':['darwin-arm64','tar.gz','b9024642ef7b4848252df5469b7f60ef3c18bb5e217a16a0934f0174f8ad11b4']
};
const target=targets[`${process.platform}-${process.arch}`];
if(!target)throw new Error(`Unsupported sing-box target: ${process.platform}-${process.arch}`);
const [suffix,extension,archiveHash,binaryHash]=target;
const folder=`sing-box-${version}-${suffix}`;
const root=path.resolve(import.meta.dirname,'..');
const vendor=path.join(root,'vendor');
const executable=path.join(vendor,folder,process.platform==='win32'?'sing-box.exe':'sing-box');
const sha256=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
if(fs.existsSync(executable)&&(!binaryHash||sha256(executable)===binaryHash)){
  console.log(`sing-box ${version} is ready for ${suffix}`);
  process.exit(0);
}
const asset=`${folder}.${extension}`;
const url=`https://github.com/SagerNet/sing-box/releases/download/v${version}/${asset}`;
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'veyral-engine-'));
try{
  const archive=path.join(temp,asset);
  const response=await fetch(url,{headers:{'User-Agent':'Veyral/1.0'}});
  if(!response.ok)throw new Error(`Failed to download sing-box: HTTP ${response.status}`);
  fs.writeFileSync(archive,Buffer.from(await response.arrayBuffer()));
  if(sha256(archive)!==archiveHash)throw new Error('sing-box archive SHA-256 mismatch');
  fs.mkdirSync(vendor,{recursive:true});
  execFileSync('tar',['-xf',archive,'-C',vendor],{stdio:'inherit'});
  if(!fs.existsSync(executable))throw new Error(`Archive did not contain ${executable}`);
  if(binaryHash&&sha256(executable)!==binaryHash)throw new Error('sing-box executable SHA-256 mismatch');
  if(process.platform!=='win32')fs.chmodSync(executable,0o755);
  console.log(`Installed verified sing-box ${version} for ${suffix}`);
}finally{fs.rmSync(temp,{recursive:true,force:true});}
