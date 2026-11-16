// Build a dependency-free ZIP of the corresponding source for every static release.
import fs from 'node:fs';
import path from 'node:path';
import {deflateRawSync} from 'node:zlib';
const root=process.cwd(),publicDir=path.join(root,'public');
fs.mkdirSync(publicDir,{recursive:true});
fs.copyFileSync('LICENSE',path.join(publicDir,'LICENSE.txt'));
let notices='Frame Studio third-party notices\n\nApplication source: GPL-3.0-only. Dependencies retain their own licenses.\n';
for(const name of ['react','react-dom','scheduler','lucide-react','vite','katex']){
 const directory=path.join(root,'node_modules',name),pkg=JSON.parse(fs.readFileSync(path.join(directory,'package.json'),'utf8'));
 const license=fs.readdirSync(directory).find(file=>/^licen[sc]e(\.|$)/i.test(file));
 if(!license)throw Error(`No license notice found for ${name}`);
 notices+=`\n${'='.repeat(70)}\n${name} ${pkg.version} — ${pkg.license}\n\n${fs.readFileSync(path.join(directory,license),'utf8')}\n`;
}
fs.writeFileSync(path.join(publicDir,'THIRD_PARTY_NOTICES.txt'),notices);
const table=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(buffer){let crc=0xffffffff;for(const byte of buffer)crc=table[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
const ignored=new Set(['node_modules','.git','dist','coverage','.sites-runtime','.wrangler','.agents','.codex']);
const files=[];
function walk(directory){for(const item of fs.readdirSync(directory,{withFileTypes:true})){if(ignored.has(item.name)||item.name.startsWith('.env')||/\.(zip|log|tsbuildinfo)$/.test(item.name))continue;const full=path.join(directory,item.name);if(item.isSymbolicLink())throw Error(`Source must not contain symlinks: ${item.name}`);if(item.isDirectory())walk(full);else files.push(full);}}
walk(root);files.sort();
let offset=0;const entries=[],central=[];
for(const full of files){const name=Buffer.from(path.relative(root,full).split(path.sep).join('/')),data=fs.readFileSync(full),packed=deflateRawSync(data),crc=crc32(data),local=Buffer.alloc(30),record=Buffer.alloc(46);
 local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(8,8);local.writeUInt16LE(0x21,12);local.writeUInt32LE(crc,14);local.writeUInt32LE(packed.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(name.length,26);
 record.writeUInt32LE(0x02014b50,0);record.writeUInt16LE(20,4);record.writeUInt16LE(20,6);record.writeUInt16LE(0x800,8);record.writeUInt16LE(8,10);record.writeUInt16LE(0x21,14);record.writeUInt32LE(crc,16);record.writeUInt32LE(packed.length,20);record.writeUInt32LE(data.length,24);record.writeUInt16LE(name.length,28);record.writeUInt32LE(offset,42);
 entries.push(local,name,packed);central.push(record,name);offset+=local.length+name.length+packed.length;
}
const centralBuffer=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(centralBuffer.length,12);end.writeUInt32LE(offset,16);
fs.writeFileSync(path.join(publicDir,'frame-studio-source.zip'),Buffer.concat([...entries,centralBuffer,end]));
console.log(`Packaged ${files.length} source files with GPL and dependency notices.`);
