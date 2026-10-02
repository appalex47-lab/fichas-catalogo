/* Fase 6: orquestación segura de sincronización, sin acceso directo a productos. */
(function(root){'use strict';
const I=(typeof module!=='undefined'&&module.exports)?require('./integration.js'):root.FichasIntegration;
const VERSION='1.0';
function plan(sourceId,records,opts={}){
 const job=I.createJob(sourceId,opts); const normalized=(records||[]).map(r=>I.adapters[sourceId].normalize(r));
 const unique=I.dedupe(normalized); const changed=opts.mode==='incremental'?I.incremental(unique,opts.cache||{}):unique;
 job.stats.fetched=normalized.length; job.stats.skipped=unique.length-changed.length; job.stats.review=changed.length; return {job,records:changed};
}
function classify(local,external,opts={}){
 const cmp=I.compare(local,external); if(cmp.same)return {action:'noop',compare:cmp};
 if(opts.autoAccept===true&&opts.allowedFields instanceof Set&&cmp.changes.every(c=>opts.allowedFields.has(c.field)))return {action:'suggest',compare:cmp};
 return {action:'review',compare:cmp};
}
function applyDecision(local,external,decision){
 if(decision!=='accept')return {accepted:false,record:local,decision};
 return {accepted:true,record:{...(local||{}),...(external||{})},decision};
}
function summarize(job,results){const out={...job,stats:{...job.stats}}; for(const r of results||[]){if(r.action==='accept')out.stats.accepted++;else if(r.action==='suggest')out.stats.suggested++;else if(r.action==='review')out.stats.review++;else out.stats.skipped++;} return out;}
const api={VERSION,plan,classify,applyDecision,summarize};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FichasSync=api;
})(typeof self!=='undefined'?self:this);
