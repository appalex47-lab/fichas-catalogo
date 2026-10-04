const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/canonical');

test('canónico: genera esquema estable sin mutar el registro fuente', () => {
  const item = { id:'1', cat:'dis', sku:' OM-1 ', v:{ marca:' OMRON ', modelo:' HEM-7121\n' } };
  const before = JSON.stringify(item);
  const r = C.canonicalize(item, { c:{id:'dis'}, title:{title:'Omron HEM-7121'}, mc:{text:'x'}, mg:{html:'<p>x</p>',blocked:[]}, meta:{mt:{text:'x'},md:{text:'y'},alt:{text:'z'}} }, {status:'listo',counts:{error:0,warning:0,info:1}}, {}, []);
  assert.equal(r.schema,'fichas.canonical.v1');
  assert.equal(r.identity.sku,'OM-1');
  assert.equal(r.fields.marca,'OMRON');
  assert.equal(r.fields.modelo,'HEM-7121');
  assert.equal(JSON.stringify(item), before);
});

test('canónico: normaliza claves para comparación', () => {
  const r=C.normalizeForComparison({identity:{sku:'OM 01',title:'Cámara Ágil'},fields:{marca:' Omrón '}});
  assert.equal(r.sku,'om 01');
  assert.equal(r.title,'camara agil');
  assert.equal(r.brand,'omron');
});

test('canónico: diff distingue cambios de identidad y campos', () => {
  const a={identity:{sku:'A',title:'Uno',brand:'X',model:'M'},fields:{marca:'X',color:'Rojo'}};
  const b={identity:{sku:'A',title:'Dos',brand:'X',model:'M'},fields:{marca:'X',color:'Azul'}};
  assert.deepEqual(C.diff(a,b),['title','fields.color']);
});

test('canónico: conserva bloqueos y datos derivados como proyección', () => {
  const r=C.canonicalize({id:'1',cat:'med',sku:'A',v:{marca:'X'}},{c:{id:'med'},title:{title:'X'},mc:{text:'MC'},mg:{html:'',blocked:['receta']},meta:{mt:{text:'T'},md:{text:'D'},alt:{text:'A'}}},{status:'critico',counts:{error:1,warning:2,info:0}},{marca:{source:'manual'}},[{type:'duplicate-sku'}]);
  assert.deepEqual(r.derived.magentoBlocked,['receta']);
  assert.equal(r.quality.status,'critico');
  assert.deepEqual(r.anomalyTypes,['duplicate-sku']);
});
