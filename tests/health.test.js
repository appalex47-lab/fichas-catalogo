'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../health');

test('health: ficha sin hallazgos obtiene 100', () => {
  const r = H.scoreReport({ status:'listo', issues:[], counts:{error:0,warning:0,info:0} }, { provenance:{marca:{source:'manual'}} });
  assert.equal(r.score,100);
  assert.equal(r.band,'excelente');
});

test('health: errores pesan más que avisos y el score es explicable', () => {
  const r = H.scoreReport({ status:'critico', issues:[{severity:'error',code:'invalid-option',field:'x'},{severity:'warning',code:'language-review',field:'y'}], counts:{error:1,warning:1,info:0} }, { provenance:{x:{source:'manual'}} });
  assert.equal(r.score,74);
  assert.equal(r.band,'revisar');
  assert.match(r.explain,/corrige 1 error/);
});

test('health: resume lote con promedio y rango', () => {
  const a=H.scoreReport({counts:{error:0,warning:0,info:0},issues:[]},{provenance:{x:{source:'manual'}}});
  const b=H.scoreReport({counts:{error:1,warning:0,info:0},issues:[{severity:'error',code:'invalid-option'}]},{provenance:{x:{source:'manual'}}});
  const s=H.summarize([{health:a},{health:b}]);
  assert.equal(s.average,90);
  assert.equal(s.min,80);
  assert.equal(s.max,100);
});

test('health: historial se limita sin mutar el arreglo original', () => {
  const base=[{at:1},{at:2}];
  const out=H.appendHistory(base,{at:3},2);
  assert.deepEqual(base,[{at:1},{at:2}]);
  assert.deepEqual(out,[{at:2},{at:3}]);
});
