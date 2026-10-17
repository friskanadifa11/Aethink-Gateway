import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname,resolve } from 'node:path';
export function openDb(filename){const target=resolve(filename);mkdirSync(dirname(target),{recursive:true});const db=new DatabaseSync(target);db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');db.exec(`
CREATE TABLE IF NOT EXISTS providers (
 id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, base_url TEXT NOT NULL, credential TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS routes (
 id TEXT PRIMARY KEY, alias TEXT NOT NULL UNIQUE, candidates TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS api_keys (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, prefix TEXT NOT NULL, digest TEXT NOT NULL UNIQUE, enabled INTEGER NOT NULL DEFAULT 1, rpm INTEGER NOT NULL DEFAULT 60,
 allowed_routes TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL DEFAULT (datetime('now')), last_used_at TEXT
);
CREATE TABLE IF NOT EXISTS requests (
 id TEXT PRIMARY KEY, api_key_id TEXT, route TEXT, provider TEXT, model TEXT, endpoint TEXT, status INTEGER, latency_ms INTEGER, input_tokens INTEGER DEFAULT 0,
 output_tokens INTEGER DEFAULT 0, error_code TEXT, attempts TEXT, started_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS requests_started ON requests(started_at);
CREATE INDEX IF NOT EXISTS requests_key ON requests(api_key_id);
CREATE TABLE IF NOT EXISTS audits (id TEXT PRIMARY KEY, action TEXT NOT NULL, entity TEXT, occurred_at TEXT NOT NULL DEFAULT (datetime('now')));
`);return db}
export function toProvider(p){return {id:p.id,name:p.name,baseUrl:p.base_url,enabled:!!p.enabled,hasCredential:true,createdAt:p.created_at}}
export function toRoute(r){return {id:r.id,alias:r.alias,candidates:JSON.parse(r.candidates),enabled:!!r.enabled,createdAt:r.created_at}}
export function toKey(k){return {id:k.id,name:k.name,prefix:k.prefix,enabled:!!k.enabled,rpm:k.rpm,allowedRoutes:JSON.parse(k.allowed_routes),createdAt:k.created_at,lastUsedAt:k.last_used_at}}
export function listProviders(db){return db.prepare('SELECT * FROM providers ORDER BY created_at DESC').all().map(toProvider)}
export function listRoutes(db){return db.prepare('SELECT * FROM routes ORDER BY created_at DESC').all().map(toRoute)}
export function listKeys(db){return db.prepare('SELECT * FROM api_keys ORDER BY created_at DESC').all().map(toKey)}
export function overview(db){
 const o=db.prepare(`SELECT COUNT(*) AS requests,COALESCE(SUM(CASE WHEN status>=200 AND status<400 THEN 1 ELSE 0 END),0) AS ok,COALESCE(SUM(input_tokens),0) AS inputTokens,COALESCE(SUM(output_tokens),0) AS outputTokens,COALESCE(ROUND(AVG(latency_ms)),0) AS avgLatency FROM requests WHERE started_at>=datetime('now','-1 day')`).get();
 const timeline=db.prepare(`SELECT strftime('%Y-%m-%d %H:00',started_at) as hour,COUNT(*) as count FROM requests WHERE started_at>=datetime('now','-1 day') GROUP BY hour ORDER BY hour`).all();
 return {...o,successRate:o.requests?Number((100*o.ok/o.requests).toFixed(1)):null,providers:db.prepare('SELECT COUNT(*) AS count FROM providers WHERE enabled=1').get().count,routes:db.prepare('SELECT COUNT(*) AS count FROM routes WHERE enabled=1').get().count,keys:db.prepare('SELECT COUNT(*) AS count FROM api_keys WHERE enabled=1').get().count,timeline};
}
