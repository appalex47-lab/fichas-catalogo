/*
 * Fase 6: contrato de integración y sincronización.
 * Los conectores producen datos externos; nunca escriben directamente sobre el registro fuente.
 */
(function(root){
'use strict';
const VERSION='1.0';
const SCHEMA='fichas.integration.v1';
const STATES=['pending','running','success','partial','error','cancelled'];
const SOURCES=['csv','xlsx','google-sheets','rest-api','ga4','bigquery','microsoft-graph','pim','erp'];
const now=()=>new Date().toISOString();
const hash=s=>{let h=2166136261; for(const c of String(s??'')){h^=c.charCodeAt(0); h=Math.imul(h,16777619);} return (h>>>0).toString(16).padStart(8,'0');};
function normalizeRecord(raw,meta={}){
 const r=raw&&typeof raw==='object'?raw:{};
 const sourceId=String(meta.sourceId||r.sourceId||'').trim();
 const sourceRecordId=String(meta.sourceRecordId??r.sourceRecordId??r.id??'').trim();
 const data=Object.prototype.hasOwnProperty.call(r,'data')&&r.data&&typeof r.data==='object'?r.data:{...r};
 delete data.sourceId; delete data.sourceRecordId;
 return {schema:SCHEMA,version:VERSION,sourceId,sourceRecordId,fetchedAt:meta.fetchedAt||r.fetchedAt||now(),etag:String(meta.etag||r.etag||''),checksum:String(meta.checksum||r.checksum||hash(JSON.stringify(data))),data};
}
function compare(local,external){
 const a=local&&typeof local==='object'?local:{}; const b=external&&typeof external==='object'?external:{};
 const keys=[...new Set([...Object.keys(a),...Object.keys(b)])].sort();
 const changes=keys.filter(k=>String(a[k]??'')!==String(b[k]??'')).map(field=>({field,local:a[field]??'',external:b[field]??''}));
 return {same:changes.length===0,changes,action:changes.length?'review':'noop'};
}
function createJob(sourceId,opts={}){if(!SOURCES.includes(sourceId)) throw new Error('source_not_supported'); return {schema:SCHEMA,version:VERSION,id:String(opts.id||('sync-'+Date.now().toString(36))),sourceId,state:'pending',mode:opts.mode==='incremental'?'incremental':'full',dryRun:opts.dryRun!==false,createdAt:now(),startedAt:null,finishedAt:null,retries:0,stats:{fetched:0,accepted:0,suggested:0,review:0,skipped:0,errors:0},errors:[],cancelRequested:false};}
function transition(job,state){if(!job||!STATES.includes(state)) throw new Error('invalid_state'); if(state==='running'&&!job.startedAt) job.startedAt=now(); if(['success','partial','error','cancelled'].includes(state)) job.finishedAt=now(); job.state=state; return job;}
function cancel(job){job.cancelRequested=true; if(job.state==='pending'||job.state==='running') transition(job,'cancelled'); return job;}
function backoff(attempt,base=500,max=15000){return Math.min(max,Math.max(0,base*Math.pow(2,Math.max(0,attempt-1))));}
function dedupe(records){const seen=new Set(),out=[]; for(const r of Array.isArray(records)?records:[]){const k=`${r.sourceId}::${r.sourceRecordId||r.checksum}`; if(seen.has(k)) continue; seen.add(k); out.push(r);} return out;}
function incremental(records,cache={}){return dedupe(records).filter(r=>{const old=cache[`${r.sourceId}::${r.sourceRecordId}`]; return !old||old.checksum!==r.checksum||old.etag!==r.etag;});}
function cachePut(cache,records){const out={...(cache||{})}; for(const r of dedupe(records)) out[`${r.sourceId}::${r.sourceRecordId}`]={checksum:r.checksum,etag:r.etag,fetchedAt:r.fetchedAt,expiresAt:now()}; return out;}
function cacheGet(cache,key,ttlMs=3600000){const x=cache?.[key]; if(!x) return null; const t=Date.parse(x.fetchedAt||''); if(Number.isFinite(t)&&Date.now()-t>ttlMs)return null; return x;}
const adapters=Object.freeze(Object.fromEntries(SOURCES.map(id=>[id,{id,normalize:(raw,meta)=>normalizeRecord(raw,{...meta,sourceId:id})}])));
const api={VERSION,SCHEMA,STATES,SOURCES,adapters,backoff,cacheGet,cachePut,cancel,compare,createJob,dedupe,hash,incremental,normalizeRecord,transition,now};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FichasIntegration=api;
})(typeof self!=='undefined'?self:this);
