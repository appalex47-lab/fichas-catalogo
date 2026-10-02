const test = require('node:test');
const assert = require('node:assert/strict');
const N = require('../js/normalization');

test('normalización: limpia espacios sin cambiar el contenido semántico', () => {
  const r=N.normalizeText('  Omron\t HEM-7121\n ');
  assert.equal(r.normalized,'Omron HEM-7121');
  assert.equal(r.changed,true);
});

test('diccionario: exacto y alias tienen prioridad sobre aproximación', () => {
  const r=N.dictionarySuggestions('LILLY', [{alias:'LILLY',canon:'Eli Lilly'},{alias:'LILLY MEDICAL',canon:'Otro'}]);
  assert.equal(r[0].canon,'Eli Lilly');
  assert.equal(r[0].exact,true);
});

test('diccionario: encuentra coincidencia aproximada conservadora', () => {
  const r=N.dictionarySuggestions('escitalopram', [{alias:'escitalopram',canon:'Escitalopram'},{alias:'sertralina',canon:'Sertralina'}]);
  assert.equal(r[0].canon,'Escitalopram');
  assert.equal(r[0].exact,true);
});

test('duplicados avanzados: detecta títulos casi iguales pero no idénticos', () => {
  const r=N.detectNearDuplicates(['Omron HEM 7121','Omron HEM 7122'], x=>x,{threshold:.90});
  assert.equal(r.length,1);
  assert.equal(r[0].indexes.join(','),'0,1');
});

test('duplicados avanzados: no marca textos claramente distintos', () => {
  const r=N.detectNearDuplicates(['Mounjaro 2.5 mg','Omron HEM 7122'], x=>x,{threshold:.90});
  assert.equal(r.length,0);
});
