const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../js/logic');

const keep = new Set();
const meta = F.defMeta();
const med = { marca:'Marca, Demo', principio:'Principio activo', concentracion:'10 mg', forma:'Tableta', contenido:'20 tabletas', laboratorio:'Laboratorio', receta:'si' };

test('contrato Magento: coma separa columnas y los textos exportados no llevan comas internas', () => {
  const ex = F.magentoBatch([{sku:'SKU,001', cat:'med', v:med}], keep, meta, F.defExp());
  assert.equal(ex.contract.ok, true);
  const row = ex.rows[0];
  assert.equal(row.length, F.MAG_HEADER.length);
  for (const v of row) assert.equal(String(v).includes(','), false);
  assert.match(row[F.MAG_IDX.description], /;/);
});

test('contrato Magento: los saltos de línea internos se normalizan', () => {
  const v = {...med, marca:'Marca\nDemo'};
  const ex = F.magentoBatch([{sku:'SKU2', cat:'med', v}], keep, meta, F.defExp());
  assert.equal(ex.contract.ok, true);
  for (const v of ex.rows[0]) assert.equal(/[\r\n]/.test(String(v)), false);
});

test('contrato Magento: valida exactamente 104 columnas', () => {
  const bad = {header:F.MAG_HEADER, rows:[new Array(F.MAG_HEADER.length-1).fill('')]};
  const r = F.validateMagentoExport(bad);
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /104/);
});

test('contrato Magento: campos multivalor reservan |', () => {
  assert.equal(F.sanitizeMagentoCell('A,B,C', 'related_skus'), 'A|B|C');
  assert.equal(F.sanitizeMagentoCell('A,B,C', 'name'), 'A;B;C');
});


test('CSV Magento: al volver a parsearlo cada producto conserva 104 columnas', () => {
  const ex = F.magentoBatch([{sku:'SKU3', cat:'med', v:med}], keep, meta, F.defExp());
  const csv = F.batchCsv(ex);
  const parsed = F.parseCSV(csv);
  assert.equal(parsed.rows[0].length, 104);
  assert.equal(parsed.rows[1].length, 104);
});
