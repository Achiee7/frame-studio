import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const scripts=fs.readdirSync('scripts').filter(name=>/^test-.*\.mjs$/.test(name)).sort();
for(const script of scripts){const r=spawnSync(process.execPath,[path.join('scripts',script)],{stdio:'inherit'});if(r.status!==0)process.exit(r.status??1);}
console.log(`All ${scripts.length} test suites passed.`);
