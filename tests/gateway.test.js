import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { seal, unseal, validateUpstream } from '../src/security.js';
async function port(){const s=createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const n=s.address().port;await new Promise(r=>s.close(r));return n}
function mockServer(mode){const s=createServer(async(req,res)=>{let b='';for await(const chunk of req)b+=chunk;let data={};try{data=JSON.parse(b)}catch{}if(mode==='fail'){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{message:'upstream unavailable'}}));return}if(!req.headers.authorization?.startsWith('Bearer secret-')){res.writeHead(401);res.end('bad authorization');return}if(req.url==='/v1/chat/completions'&&data.stream){res.writeHead(200,{'Content-Type':'text/event-stream'});res.write('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n');setTimeout(()=>res.end('data: [DONE]\n\n'),15);return}if(req.url==='/v1/embeddings'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({object:'list',data:[{embedding:[0.1,0.2],index:0}],model:data.model,usage:{prompt_tokens:2,total_tokens:2}}));return}res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({id:'mock',object:'chat.completion',model:data.model,choices:[{message:{role:'assistant',content:'Hello from '+data.model}}],usage:{prompt_tokens:12,completion_tokens:5,total_tokens:17}}))});return s}
async function listen(s){s.listen(0,'127.0.0.1');await once(s,'listening');return `http://127.0.0.1:${s.address().port}`}
const json=(path,method,body,cookie,host,key)=>fetch(host+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(key?{Authorization:'Bearer '+key}:{}),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
test('crypto rejects insecure upstream and decrypts stored credentials',()=>{const key=randomBytes(32).toString('hex');assert.equal(unseal(seal('private',key),key),'private');assert.throws(()=>validateUpstream('http://example.com/v1'));assert.equal(validateUpstream('http://localhost:1234/v1',true),'http://localhost:1234/v1')});
test('real routing, retry/fallback, model list, streaming, logs and revocation',async(t)=>{
 const dir=mkdtempSync(join(tmpdir(),'rift-test-'));const fail=mockServer('fail'),ok=mockServer('ok');const failURL=await listen(fail),okURL=await listen(ok),n=await port(),host=`http://127.0.0.1:${n}`;
 const child=spawn(process.execPath,['src/server.js'],{cwd:process.cwd(),env:{...process.env,ADMIN_PASSWORD:'a-long-admin-password-for-tests',ENCRYPTION_KEY:randomBytes(32).toString('hex'),SESSION_SECRET:randomBytes(32).toString('hex'),HOST:'127.0.0.1',PORT:String(n),DATABASE_PATH:join(dir,'aethinkai.db'),ALLOW_HTTP_UPSTREAM:'true'},stdio:'pipe'});
 let output='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);
 t.after(async()=>{child.kill();await Promise.all([new Promise(r=>fail.close(r)),new Promise(r=>ok.close(r))]);rmSync(dir,{recursive:true,force:true})});
 for(let i=0;i<90;i++){try{const r=await fetch(host+'/healthz');if(r.ok)break}catch{}await new Promise(r=>setTimeout(r,70));if(i===89)throw Error('Server did not start: '+output)}
 const login=await json('/admin/login','POST',{password:'a-long-admin-password-for-tests'},null,host);assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
 let r=await json('/admin/providers','POST',{name:'Failing',baseUrl:failURL+'/v1',apiKey:'secret-a'},cookie,host);assert.equal(r.status,201);const failId=(await r.json()).id;
 r=await json('/admin/providers','POST',{name:'Healthy',baseUrl:okURL+'/v1',apiKey:'secret-b'},cookie,host);assert.equal(r.status,201);const okId=(await r.json()).id;
 r=await json('/admin/routes','POST',{alias:'smart-chat',candidates:[{providerId:failId,model:'model-primary'},{providerId:okId,model:'model-fallback'}]},cookie,host);assert.equal(r.status,201);
 r=await json('/admin/keys','POST',{name:'integration-test',rpm:30,allowedRoutes:['smart-chat']},cookie,host);assert.equal(r.status,201);const key=(await r.json()).key;assert.match(key,/^aet_/);
 r=await json('/v1/models','GET',undefined,null,host,key);assert.deepEqual((await r.json()).data.map(x=>x.id),['smart-chat']);
 r=await json('/v1/chat/completions','POST',{model:'smart-chat',messages:[{role:'user',content:'Hi'}]},null,host,key);assert.equal(r.status,200);const response=await r.json();assert.equal(response.model,'model-fallback');assert.equal(response.choices[0].message.content,'Hello from model-fallback');
 r=await json('/v1/embeddings','POST',{model:'smart-chat',input:'test'},null,host,key);assert.equal(r.status,200);assert.deepEqual((await r.json()).data[0].embedding,[.1,.2]);
 r=await json('/v1/chat/completions','POST',{model:'smart-chat',stream:true,messages:[{role:'user',content:'Hi'}]},null,host,key);assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/text\/event-stream/);const stream=await r.text();assert.match(stream,/data: \[DONE\]/);
 const adminRequests=await json('/admin/requests','GET',undefined,cookie,host);const logs=await adminRequests.json();assert.equal(logs.length,3);assert.equal(logs[0].attempts[0].status,503);assert.equal(logs[0].attempts[1].status,200);
 r=await json('/admin/overview','GET',undefined,cookie,host);assert.equal((await r.json()).requests,3);
 const keys=await(await json('/admin/keys','GET',undefined,cookie,host)).json();assert.equal(keys[0].digest,undefined);assert.equal(keys[0].prefix.startsWith('aet_'),true);
 r=await json('/admin/keys/'+keys[0].id,'DELETE',{},cookie,host);assert.equal(r.status,200);
 r=await json('/v1/models','GET',undefined,null,host,key);assert.equal(r.status,401);
});
