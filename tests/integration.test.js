const test=require('node:test'); const assert=require('node:assert/strict'); const I=require('../integration.js');

test('normaliza registro externo con identidad y checksum',()=>{const r=I.normalizeRecord({id:'42',sku:'A-1',name:'X'},{sourceId:'rest-api'}); assert.equal(r.sourceId,'rest-api'); assert.equal(r.sourceRecordId,'42'); assert.ok(r.checksum);});
test('deduplica por fuente e id',()=>{const a=I.normalizeRecord({id:'1',x:1},{sourceId:'csv'}); const b=I.normalizeRecord({id:'1',x:2},{sourceId:'csv'}); assert.equal(I.dedupe([a,b]).length,1);});
test('incremental detecta cambios por checksum/etag',()=>{const a=I.normalizeRecord({id:'1',x:1},{sourceId:'rest-api',etag:'a'}); const b=I.normalizeRecord({id:'1',x:2},{sourceId:'rest-api',etag:'b'}); const cache=I.cachePut({},[a]); assert.equal(I.incremental([a],cache).length,0); assert.equal(I.incremental([b],cache).length,1);});
test('compare no modifica datos y reporta diferencias',()=>{const c=I.compare({a:1,b:2},{a:1,b:3}); assert.equal(c.same,false); assert.equal(c.changes[0].field,'b');});
test('job admite estados y cancelación',()=>{const j=I.createJob('ga4',{dryRun:true}); I.transition(j,'running'); I.cancel(j); assert.equal(j.state,'cancelled'); assert.equal(j.cancelRequested,true);});
test('backoff crece con límite',()=>{assert.equal(I.backoff(1,100),100); assert.equal(I.backoff(3,100),400); assert.equal(I.backoff(99,100,500),500);});
