import { randomBytes } from 'node:crypto';
import { existsSync,writeFileSync,mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const env=resolve('.env');
if(existsSync(env)){console.error('.env already exists; will not overwrite credentials');process.exit(1)}
const password=randomBytes(24).toString('base64url');
const key=randomBytes(32).toString('hex');
const secret=randomBytes(32).toString('hex');
mkdirSync('.data',{recursive:true});
writeFileSync(env,`ADMIN_PASSWORD=${password}\nENCRYPTION_KEY=${key}\nSESSION_SECRET=${secret}\nHOST=127.0.0.1\nPORT=8787\nDATABASE_PATH=.data/aethinkai.db\nALLOW_HTTP_UPSTREAM=false\nTRUST_PROXY_HTTPS=false\n`,{mode:0o600,flag:'wx'});
console.log('Created .env (keep private).\nAdmin password (SAVE NOW): '+password+'\nRun: npm start\nLocal console: http://127.0.0.1:8787');
