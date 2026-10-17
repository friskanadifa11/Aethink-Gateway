import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { openDb, listProviders, listRoutes, listKeys, overview } from './db.js';
import { randomId, token, hashToken, safeEqual, seal, unseal, sessionSign, sessionVerify, extractBearer, validateUpstream } from './security.js';
const envFile=resolve('.env');
if(existsSync(envFile))for(const line of readFileSync(envFile,'utf8').split(/\r?\n/)){const m=line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2]}
const {ADMIN_PASSWORD,ENCRYPTION_KEY,SESSION_SECRET}=process.env;
if(!ADMIN_PASSWORD||ADMIN_PASSWORD.length<16||!ENCRYPTION_KEY||!/^[0-9a-f]{64}$/i.test(ENCRYPTION_KEY)||!SESSION_SECRET||SESSION_SECRET.length<32)throw Error('Missing/weak settings: run `npm run setup` or configure strong ADMIN_PASSWORD, ENCRYPTION_KEY, SESSION_SECRET');
const HOST=process.env.HOST||'127.0.0.1',PORT=Number(process.env.PORT||8787),db=openDb(process.env.DATABASE_PATH||'.data/aethinkai.db');
const allowHttp=process.env.ALLOW_HTTP_UPSTREAM==='true';
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
const limiters=new Map(),loginLimits=new Map();
setInterval(()=>{const cutoff=Date.now()-900000;for(const [k,v] of limiters){const fresh=v.filter(t=>t>cutoff);if(!fresh.length)limiters.delete(k);else limiters.set(k,fresh)}for(const [ip,v] of loginLimits){if(!v.some(t=>t>cutoff))loginLimits.delete(ip)}},300000).unref();
const json=(res,status,value,headers={})=>{if(res.headersSent||res.destroyed)return;const body=JSON.stringify(value);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Content-Length':Buffer.byteLength(body),'Cache-Control':'no-store',...headers});res.end(body)};
const fail=(res,status,message,code='bad_request')=>json(res,status,{error:{message,type:'gateway_error',code}});
async function parseBody(req,max=1024*1024){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>max){const e=Error('Payload too large');e.status=413;throw e}chunks.push(chunk)}const src=Buffer.concat(chunks).toString('utf8');try{return JSON.parse(src||'{}')}catch{const e=Error('Invalid JSON body');e.status=400;throw e}}
function logAudit(action,entity=''){db.prepare('INSERT INTO audits (id,action,entity) VALUES (?,?,?)').run(randomId(),action,entity)}
function userSession(req){const raw=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('aethinkai_session='))?.slice('aethinkai_session='.length);return sessionVerify(raw,SESSION_SECRET)}
function sameOrigin(req){const origin=req.headers.origin;if(!origin)return true;try{const host=(req.headers['x-forwarded-host']||req.headers.host||'').split(',')[0].trim();const url=new URL(origin);const protocol=(req.socket.encrypted||process.env.TRUST_PROXY_HTTPS==='true')?'https:':'http:';if(url.host===host&&url.protocol===protocol)return true;const pub=process.env.PUBLIC_ORIGIN;if(pub){const p=new URL(pub);if(url.host===p.host&&url.protocol===p.protocol)return true}return false}catch{return false}}
function adminGate(req,res,method){if(!userSession(req)){fail(res,401,'Admin login required','unauthorized');return false}if(method!=='GET'&&!sameOrigin(req)){fail(res,403,'Cross-origin mutation blocked','csrf_rejected');return false}return true}
function authenticatedKey(req){const raw=extractBearer(req);if(!raw||!raw.startsWith('aet_'))return null;const key=db.prepare('SELECT * FROM api_keys WHERE digest=? AND enabled=1').get(hashToken(raw));if(!key)return null;db.prepare("UPDATE api_keys SET last_used_at=datetime('now') WHERE id=?").run(key.id);return key}
function keyRateLimit(k){const now=Date.now(),bucket=limiters.get(k.id)||[];const recent=bucket.filter(t=>now-t<60000);if(recent.length>=k.rpm){limiters.set(k.id,recent);return false}recent.push(now);limiters.set(k.id,recent);return true}
function validateCandidates(c){if(!Array.isArray(c)||!c.length||c.length>12)throw Error('Provide 1 to 12 fallback candidates');return c.map(item=>{if(!item||typeof item.providerId!=='string'||typeof item.model!=='string'||!/^[a-zA-Z0-9._:/+-]{1,150}$/.test(item.model))throw Error('Invalid providerId or model name');const p=db.prepare('SELECT id FROM providers WHERE id=?').get(item.providerId);if(!p)throw Error('Unknown provider: '+item.providerId);return {providerId:item.providerId,model:item.model}})}
function safeName(v,max=70){if(typeof v!=='string'||!v.trim()||v.trim().length>max)throw Error('Invalid name');return v.trim()}
function validateAlias(a){if(typeof a!=='string'||!/^[a-z0-9][a-z0-9._-]{1,79}$/i.test(a))throw Error('Alias must be 2-80 alphanumeric, dash, underscore, dot');return a}
function publicRequests(limit=100){return db.prepare('SELECT id,route,provider,model,endpoint,status,latency_ms,input_tokens,output_tokens,error_code,attempts,started_at FROM requests ORDER BY started_at DESC,id DESC LIMIT ?').all(limit).map(x=>({...x,attempts:JSON.parse(x.attempts||'[]')}))}
async function admin(req,res,path,method){
 if(path==='/admin/login'&&method==='POST'){
  if(!sameOrigin(req))return fail(res,403,'Cross-origin login blocked');
  const ip=req.socket.remoteAddress||'unknown',now=Date.now(),bucket=(loginLimits.get(ip)||[]).filter(t=>now-t<900000);
  if(bucket.length>=12)return fail(res,429,'Too many login attempts. Try again later','rate_limited');
  const data=await parseBody(req);
  if(!safeEqual(data.password||'',ADMIN_PASSWORD)){bucket.push(now);loginLimits.set(ip,bucket);return fail(res,401,'Incorrect password','unauthorized')}
  loginLimits.delete(ip);let originProto='';try{originProto=new URL(req.headers.origin||'').protocol}catch{}const secure=req.socket.encrypted||process.env.TRUST_PROXY_HTTPS==='true'||originProto==='https:';const cookie=`aethinkai_session=${sessionSign({role:'admin',exp:Date.now()+8*3600000},SESSION_SECRET)}; HttpOnly; Path=/; SameSite=Strict; Max-Age=28800${secure?'; Secure':''}`;
  return json(res,200,{authenticated:true},{'Set-Cookie':cookie});
 }
 if(!adminGate(req,res,method))return;
 if(path==='/admin/logout'&&method==='POST')return json(res,200,{ok:true},{'Set-Cookie':'aethinkai_session=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0'});
 if(path==='/admin/session'&&method==='GET')return json(res,200,{authenticated:true});
 if(path==='/admin/overview'&&method==='GET')return json(res,200,overview(db));
 if(path==='/admin/providers'&&method==='GET')return json(res,200,listProviders(db));
 if(path==='/admin/providers'&&method==='POST'){
  const b=await parseBody(req),id=randomId(),name=safeName(b.name),baseUrl=validateUpstream(b.baseUrl,allowHttp);
  if(typeof b.apiKey!=='string'||!b.apiKey.trim()||b.apiKey.length>2048)throw Error('Provider API key is required');
  db.prepare('INSERT INTO providers (id,name,base_url,credential) VALUES (?,?,?,?)').run(id,name,baseUrl,seal(b.apiKey,ENCRYPTION_KEY));logAudit('provider.created',id);return json(res,201,{id,name,baseUrl,enabled:true});
 }
 let t=path.match(/^\/admin\/providers\/([a-f0-9]{24})\/test$/);
 if(t&&method==='POST'){
  const p=db.prepare('SELECT * FROM providers WHERE id=?').get(t[1]);if(!p)return fail(res,404,'Provider not found');
  const begin=Date.now();try{const response=await fetch(p.base_url.replace(/\/$/,'')+'/models',{headers:{Authorization:'Bearer '+unseal(p.credential,ENCRYPTION_KEY)},signal:AbortSignal.timeout(12000),redirect:'error'});await response.body?.cancel();return json(res,200,{reachable:response.ok,httpStatus:response.status,latencyMs:Date.now()-begin})}catch(e){return json(res,200,{reachable:false,error:'Connection failed or timed out',latencyMs:Date.now()-begin})}
 }
 let m=path.match(/^\/admin\/providers\/([a-f0-9]{24})$/);
 if(m&&method==='PATCH'){const b=await parseBody(req);if(typeof b.enabled!=='boolean')throw Error('enabled must be a boolean');const q=db.prepare('UPDATE providers SET enabled=? WHERE id=?').run(b.enabled?1:0,m[1]);if(!q.changes)return fail(res,404,'Provider not found');logAudit('provider.updated',m[1]);return json(res,200,{ok:true})}
 if(m&&method==='DELETE'){const count=db.prepare('SELECT candidates FROM routes').all().some(r=>JSON.parse(r.candidates).some(x=>x.providerId===m[1]));if(count)return fail(res,409,'Remove this provider from routing policies first');const q=db.prepare('DELETE FROM providers WHERE id=?').run(m[1]);if(!q.changes)return fail(res,404,'Provider not found');logAudit('provider.deleted',m[1]);return json(res,200,{ok:true})}
 let tm=path.match(/^\/admin\/providers\/([a-f0-9]{24})\/models$/);
 if(tm&&method==='POST'){
  const p=db.prepare('SELECT * FROM providers WHERE id=?').get(tm[1]);if(!p)return fail(res,404,'Provider not found');
  try{const response=await fetch(p.base_url.replace(/\/$/,'')+'/models',{headers:{Authorization:'Bearer '+unseal(p.credential,ENCRYPTION_KEY)},signal:AbortSignal.timeout(15000),redirect:'error'});if(!response.ok){await response.body?.cancel().catch(()=>{});return fail(res,502,'Upstream /models returned HTTP '+response.status)}const data=await response.json().catch(()=>null);const models=Array.isArray(data?.data)?[...new Set(data.data.map(m=>String(m.id??m.name??'')).filter(Boolean))]:[];return json(res,200,{models})}catch(e){return fail(res,502,'Could not reach upstream /models')}
 }
 if(path==='/admin/routes'&&method==='GET')return json(res,200,listRoutes(db));
 if(path==='/admin/routes'&&method==='POST'){const b=await parseBody(req),alias=validateAlias(b.alias),c=validateCandidates(b.candidates),id=randomId();db.prepare('INSERT INTO routes (id,alias,candidates) VALUES (?,?,?)').run(id,alias,JSON.stringify(c));logAudit('route.created',id);return json(res,201,{id,alias,candidates:c})}
 m=path.match(/^\/admin\/routes\/([a-f0-9]{24})$/);
 if(m&&method==='PATCH'){const b=await parseBody(req),r=db.prepare('SELECT * FROM routes WHERE id=?').get(m[1]);if(!r)return fail(res,404,'Route not found');const alias=b.alias===undefined?r.alias:validateAlias(b.alias),c=b.candidates===undefined?JSON.parse(r.candidates):validateCandidates(b.candidates),enabled=b.enabled===undefined?r.enabled:b.enabled?1:0;db.prepare('UPDATE routes SET alias=?,candidates=?,enabled=? WHERE id=?').run(alias,JSON.stringify(c),enabled,m[1]);logAudit('route.updated',m[1]);return json(res,200,{ok:true})}
 if(m&&method==='DELETE'){const q=db.prepare('DELETE FROM routes WHERE id=?').run(m[1]);if(!q.changes)return fail(res,404,'Route not found');logAudit('route.deleted',m[1]);return json(res,200,{ok:true})}
 if(path==='/admin/simulate'&&method==='POST'){const b=await parseBody(req),r=db.prepare('SELECT * FROM routes WHERE alias=?').get(b.alias);if(!r)return fail(res,404,'Route not found');const steps=JSON.parse(r.candidates).map((c,i)=>{const p=db.prepare('SELECT name,enabled FROM providers WHERE id=?').get(c.providerId);return {priority:i+1,model:c.model,provider:p?.name||'missing',available:!!p?.enabled}});return json(res,200,{alias:r.alias,selected:steps.find(s=>s.available)||null,steps,dryRun:true})}
 if(path==='/admin/keys'&&method==='GET')return json(res,200,listKeys(db));
 if(path==='/admin/keys'&&method==='POST'){const b=await parseBody(req),name=safeName(b.name),rpm=b.rpm===undefined?60:Number(b.rpm);if(!Number.isInteger(rpm)||rpm<1||rpm>10000)throw Error('RPM must be an integer from 1 to 10000');const routes=Array.isArray(b.allowedRoutes)?b.allowedRoutes:[];if(routes.some(x=>typeof x!=='string'))throw Error('Invalid allowedRoutes');const raw='aet_'+token(),id=randomId();db.prepare('INSERT INTO api_keys (id,name,prefix,digest,rpm,allowed_routes) VALUES (?,?,?,?,?,?)').run(id,name,raw.slice(0,13)+'…',hashToken(raw),rpm,JSON.stringify(routes));logAudit('key.created',id);return json(res,201,{id,name,key:raw,notice:'Copy this key now. It will never be shown again.'})}
 m=path.match(/^\/admin\/keys\/([a-f0-9]{24})$/);
 if(m&&method==='DELETE'){const q=db.prepare('UPDATE api_keys SET enabled=0 WHERE id=?').run(m[1]);if(!q.changes)return fail(res,404,'Key not found');logAudit('key.revoked',m[1]);return json(res,200,{ok:true})}
 if(path==='/admin/requests'&&method==='GET')return json(res,200,publicRequests(150));
 if(path==='/admin/audits'&&method==='GET')return json(res,200,db.prepare('SELECT * FROM audits ORDER BY occurred_at DESC LIMIT 100').all());
 return fail(res,404,'Not found','not_found');
}
function logRequest(row){try{db.prepare('INSERT INTO requests (id,api_key_id,route,provider,model,endpoint,status,latency_ms,input_tokens,output_tokens,error_code,attempts) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(row.id,row.keyId,row.route,row.provider||null,row.model||null,row.endpoint,row.status,Date.now()-row.started,row.input||0,row.output||0,row.error||null,JSON.stringify(row.attempts))}catch(e){console.error('Request log failed:',e.message)}}
async function gateway(req,res,path,method){
 const key=authenticatedKey(req);
 if(!key){res.setHeader('WWW-Authenticate','Bearer');return fail(res,401,'Invalid or missing aethinkAi API key','invalid_api_key')}
 if(!keyRateLimit(key)){res.setHeader('Retry-After','60');return fail(res,429,'Requests per minute exceeded','rate_limit_exceeded')}
 if(path==='/v1/models'&&method==='GET'){
  const allowed=JSON.parse(key.allowed_routes),routes=listRoutes(db).filter(r=>r.enabled&&(!allowed.length||allowed.includes(r.alias)));
  return json(res,200,{object:'list',data:routes.map(r=>({id:r.alias,object:'model',created:0,owned_by:'aethinkai-gateway'}))});
 }
 const endpointMap={'/v1/chat/completions':'chat/completions','/v1/embeddings':'embeddings','/v1/responses':'responses'};
 if(!endpointMap[path]||method!=='POST')return fail(res,404,'Endpoint not implemented','not_found');
 const started=Date.now(),id=randomId(),row={id,keyId:key.id,route:null,endpoint:path,started,status:502,attempts:[]};
 let b;
 try{b=await parseBody(req,2*1024*1024)}catch(e){return fail(res,e.status||400,e.message)}
 if(!b||typeof b.model!=='string'){row.status=400;row.error='invalid_model';logRequest(row);return fail(res,400,'model must be a route alias')}
 row.route=b.model;const allowed=JSON.parse(key.allowed_routes);
 if(allowed.length&&!allowed.includes(b.model)){row.status=403;row.error='model_forbidden';logRequest(row);return fail(res,403,'API key cannot access this route','model_forbidden')}
 const route=db.prepare('SELECT * FROM routes WHERE alias=? AND enabled=1').get(b.model);
 if(!route){row.status=404;row.error='model_not_found';logRequest(row);return fail(res,404,'Unknown or disabled model alias','model_not_found')}
 const candidates=JSON.parse(route.candidates),timeoutMs=Math.min(Math.max(Number(process.env.UPSTREAM_TIMEOUT_MS)||120000,1000),300000);
 for(let i=0;i<candidates.length;i++){
  const c=candidates[i],provider=db.prepare('SELECT * FROM providers WHERE id=? AND enabled=1').get(c.providerId);
  if(!provider){row.attempts.push({candidate:i+1,providerId:c.providerId,status:'skipped'});continue}
  const attemptStarted=Date.now(),ac=new AbortController();const cancel=()=>ac.abort();req.once('aborted',cancel);res.once('close',cancel);
  const timeout=setTimeout(()=>ac.abort(),timeoutMs);
  let upstream;
  try{
   const upstreamBody={...b,model:c.model};
   upstream=await fetch(provider.base_url.replace(/\/$/,'')+'/'+endpointMap[path],{method:'POST',headers:{'Authorization':'Bearer '+unseal(provider.credential,ENCRYPTION_KEY),'Content-Type':'application/json','Accept':b.stream?'text/event-stream':'application/json'},body:JSON.stringify(upstreamBody),signal:ac.signal,redirect:'error'});
   const duration=Date.now()-attemptStarted;
   row.attempts.push({candidate:i+1,provider:provider.name,model:c.model,status:upstream.status,latencyMs:duration});
   const retryable=[408,409,429,500,502,503,504].includes(upstream.status);
   if(retryable&&i<candidates.length-1){await upstream.body?.cancel().catch(()=>{});continue}
   row.provider=provider.name;row.model=c.model;row.status=upstream.status;
   res.setHeader('X-AethinkAi-Request-Id',id);res.setHeader('Cache-Control','no-store');
   if(b.stream&&upstream.ok){
    res.writeHead(upstream.status,{'Content-Type':upstream.headers.get('content-type')||'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no'});
    // Streaming is piped chunk-for-chunk with backpressure. Never retry after headers/bytes are sent.
    const reader=upstream.body.getReader();
    try{while(true){const {done,value}=await reader.read();if(done)break;if(!res.write(Buffer.from(value)))await new Promise(resolve=>res.once('drain',resolve))}res.end()}
    catch(e){row.error='stream_interrupted';if(!res.destroyed)res.destroy(e)}
    finally{reader.releaseLock();clearTimeout(timeout);req.off('aborted',cancel);res.off('close',cancel);logRequest(row)}
    return;
   }
   const buffer=Buffer.from(await upstream.arrayBuffer());
   clearTimeout(timeout);req.off('aborted',cancel);res.off('close',cancel);
   if(buffer.length>10*1024*1024){row.status=502;row.error='upstream_response_too_large';logRequest(row);return fail(res,502,'Upstream response too large')}
   try{const parsed=JSON.parse(buffer.toString());if(parsed.usage){row.input=parsed.usage.prompt_tokens??parsed.usage.input_tokens??0;row.output=parsed.usage.completion_tokens??parsed.usage.output_tokens??0}}catch{}
   if(!upstream.ok)row.error='upstream_'+upstream.status;
   logRequest(row);
   if(!res.headersSent){res.writeHead(upstream.status,{'Content-Type':upstream.headers.get('content-type')?.startsWith('application/json')?'application/json; charset=utf-8':'text/plain; charset=utf-8','Content-Length':buffer.length,'Cache-Control':'no-store'});res.end(buffer)}return;
  }catch(e){row.attempts.push({candidate:i+1,provider:provider.name,model:c.model,status:'network_error',latencyMs:Date.now()-attemptStarted});row.error=ac.signal.aborted?'upstream_timeout_or_cancel':'upstream_network_error';if(res.destroyed)break}
  finally{clearTimeout(timeout);req.off('aborted',cancel);res.off('close',cancel)}
 }
 if(!res.destroyed)fail(res,502,'All configured upstreams failed','upstream_unavailable');row.status=502;logRequest(row);
}
function staticFile(req,res,path){if(req.method!=='GET'&&req.method!=='HEAD')return fail(res,405,'Method not allowed');let file=path==='/'?'index.html':path.slice(1);if(!['index.html','app.js','style.css'].includes(file))return fail(res,404,'Not found');const payload=readFileSync(resolve('public',file));res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Content-Length':payload.length,'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",'Referrer-Policy':'no-referrer','Cache-Control':'no-store'});if(req.method==='HEAD')res.end();else res.end(payload)}
const server=http.createServer(async(req,res)=>{const path=new URL(req.url,'http://localhost').pathname;try{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 if(path==='/healthz'||path==='/readyz')return json(res,200,{status:'ok',service:'aethinkai-gateway',time:new Date().toISOString()});
 if(path.startsWith('/admin/'))return await admin(req,res,path,req.method);
 if(path.startsWith('/v1/'))return await gateway(req,res,path,req.method);
 return staticFile(req,res,path)
 }catch(e){if(e?.code==='SQLITE_CONSTRAINT_UNIQUE')return fail(res,409,'Name or alias already exists','duplicate');console.error('Request failed:',e.message);if(!res.headersSent)fail(res,e.status||400,e.status?'Request rejected':e.message?.startsWith('Invalid')||e.message?.startsWith('Unknown')||e.message?.startsWith('Provide')||e.message?.startsWith('Upstream')||e.message?.startsWith('Alias')||e.message?.startsWith('RPM')||e.message?.includes('required')?e.message:'Request could not be completed');else res.destroy()}});
if(import.meta.url===`file://${process.argv[1]}`){server.listen(PORT,HOST,()=>console.log(`aethinkAi Gateway listening on http://${HOST}:${PORT}`))}
export {server,db};
