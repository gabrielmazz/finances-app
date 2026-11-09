// No package downloads; compile operator-only guards using installed Node headers.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const directory = path.join(os.homedir(),'.cache','lumus-operator-protection');
fs.mkdirSync(directory,{recursive:true,mode:0o700});
if ((fs.statSync(directory).mode & 0o077) !== 0) throw Error('Private build directory required');
const source = path.join(__dirname,'operator-no-dump.c');
const headers = path.resolve(path.dirname(process.execPath),'../include/node');
execFileSync('/usr/bin/gcc',['-shared','-fPIC','-O2',source,'-o',path.join(directory,'no-core.so')]);
execFileSync('/usr/bin/gcc',['-shared','-fPIC','-O2','-DNODE_ADDON','-I',headers,source,'-o',path.join(directory,'protection.node')]);
execFileSync('/usr/bin/gcc',['-shared','-fPIC','-O2','-DBROWSER_GUARD',source,'-o',path.join(directory,'browser-no-core.so')]);
fs.chmodSync(path.join(directory,'browser-no-core.so'),0o600);
fs.chmodSync(path.join(directory,'no-core.so'),0o600);fs.chmodSync(path.join(directory,'protection.node'),0o600);
console.log(directory);
