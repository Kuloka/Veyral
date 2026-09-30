const fs = require('node:fs');
const path = require('node:path');
const { NtExecutable, NtExecutableResource } = require('resedit');

const version = require('../package.json').version;
const files = [
  path.join(__dirname, '..', 'dist', `Veyral-${version}-win-x64.exe`),
  path.join(__dirname, '..', 'dist', 'win-unpacked', 'Veyral.exe'),
];

for (const file of files) {
  const executable = NtExecutable.from(fs.readFileSync(file));
  const resources = NtExecutableResource.from(executable);
  const manifest = resources.entries.find(entry => entry.type === 24 && entry.id === 1);
  const xml = manifest ? Buffer.from(manifest.bin).toString('utf8') : '';
  if (!/<requestedExecutionLevel\b[^>]*\blevel="requireAdministrator"/i.test(xml)) {
    throw new Error(`${file} does not request administrator permission`);
  }
  console.log(`${file}: administrator permission requested`);
}
