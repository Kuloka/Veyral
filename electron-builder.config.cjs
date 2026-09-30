const path=require('node:path');
const platform=process.platform==='win32'?'windows':process.platform==='darwin'?'darwin':'linux';
const arch=process.arch==='arm64'?'arm64':'amd64';
const engine=`sing-box-1.14.1-${platform}-${arch}`;

module.exports={
  appId:'com.veyral.desktop',
  productName:'Veyral',
  asar:false,
  electronDist:path.join(__dirname,'node_modules','electron','dist'),
  directories:{output:'dist'},
  files:[
    '*.js','index.html','styles.css','package.json',
    'assets/**/*','tools/*.ps1','tools/*.cs',
    '!vendor/**','!Veyral.exe','!node_modules/.cache/**'
  ],
  extraResources:[{from:path.join('vendor',engine),to:path.join('vendor',engine)}],
  win:{target:[{target:'portable',arch:['x64']}],icon:'assets/icon.ico',requestedExecutionLevel:'requireAdministrator'},
  linux:{target:[{target:'AppImage',arch:['x64']}],icon:'assets/icon.png',category:'Network'},
  mac:{target:[{target:'dmg',arch:[process.arch==='arm64'?'arm64':'x64']}],icon:'assets/icon.png'},
  artifactName:'Veyral-${version}-${os}-${arch}.${ext}'
};
