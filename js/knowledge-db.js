/*
 * Fase 11: capa de persistencia del conocimiento aprendido (contrato fichas.knowledge.v1).
 *
 * Única puerta de entrada a la base IndexedDB `fichasProductoKnowledge`: ningún otro módulo toca indexedDB.
 * Flujo obligatorio:  módulo → Knowledge (knowledge.js) → KnowledgeDB (este archivo) → IndexedDB.
 *
 * - Coexiste con la persistencia existente (localStorage y el espejo `fichas-state`): NO la reemplaza ni la migra.
 * - Esquema versionado con migraciones (DB_VERSION). Un cambio incompatible exige subir la versión y agregar su migración.
 * - Dos backends con el mismo contrato asíncrono: IDBBackend (IndexedDB real) y MemoryBackend (pruebas y
 *   navegadores sin IndexedDB). Si IndexedDB no abre, la capa se degrada a memoria y lo informa; nunca rompe la app.
 * - Las consultas usan índices; ninguna validación recorre una tabla completa.
 * Funciona en navegador (window.FichasKnowledgeDB y window.FP.KnowledgeDB) y en Node (require).
 */
(function (root) {
'use strict';
const isNode = typeof module !== 'undefined' && module.exports;

const DB_NAME = 'fichasProductoKnowledge';
const DB_VERSION = 1;
const SCHEMA = 'fichas.knowledge.v1';

/* Arquitectura genérica: 8 stores en lugar de uno por tipo de entidad (ver docs/phases/PHASE_11_KNOWLEDGE.md).
 * Los 11 tipos de entidad (sustancia, laboratorio, marca, fabricante, forma, concentración, unidad, presentación,
 * categoría, subcategoría, producto) viven en `entities` y se distinguen por el índice `type`. */
const STORES = Object.freeze({
  entities: { keyPath: 'id', indexes: [
    { name: 'type', keyPath: 'type' },
    { name: 'normalized', keyPath: 'normalizedValue' },
    { name: 'typeNormalized', keyPath: ['type', 'normalizedValue'] },
    { name: 'typeStatus', keyPath: ['type', 'status'] },
    { name: 'tokens', keyPath: 'tokens', multiEntry: true },
    { name: 'status', keyPath: 'status' },
    { name: 'confidence', keyPath: 'confidence' },
    { name: 'sources', keyPath: 'sources', multiEntry: true },
    { name: 'updatedAt', keyPath: 'updatedAt' }
  ] },
  aliases: { keyPath: 'id', indexes: [
    { name: 'entityId', keyPath: 'entityId' },
    { name: 'typeAlias', keyPath: ['type', 'normalizedAlias'] },
    { name: 'normalized', keyPath: 'normalizedAlias' },
    { name: 'status', keyPath: 'status' },
    { name: 'updatedAt', keyPath: 'updatedAt' }
  ] },
  relationships: { keyPath: 'id', indexes: [
    { name: 'subject', keyPath: 'subject' },
    { name: 'object', keyPath: 'object' },
    { name: 'relationshipType', keyPath: 'predicate' },
    { name: 'subjectPredicate', keyPath: ['subject', 'predicate'] },
    { name: 'objectPredicate', keyPath: ['object', 'predicate'] },
    { name: 'status', keyPath: 'status' }
  ] },
  evidence: { keyPath: 'id', indexes: [
    { name: 'targetId', keyPath: 'targetId' },
    { name: 'productRef', keyPath: 'productRef' },
    { name: 'source', keyPath: 'source' }
  ] },
  corrections: { keyPath: 'id', indexes: [
    { name: 'knowledgeId', keyPath: 'knowledgeId' },
    { name: 'status', keyPath: 'status' },
    { name: 'createdAt', keyPath: 'createdAt' }
  ] },
  conflicts: { keyPath: 'id', indexes: [
    { name: 'status', keyPath: 'status' },
    { name: 'subject', keyPath: 'subject' },
    { name: 'updatedAt', keyPath: 'updatedAt' }
  ] },
  rules: { keyPath: 'id', indexes: [
    { name: 'status', keyPath: 'status' },
    { name: 'kind', keyPath: 'kind' },
    { name: 'field', keyPath: 'field' },
    { name: 'updatedAt', keyPath: 'updatedAt' }
  ] },
  knowledgeMeta: { keyPath: 'id', indexes: [] }
});
const STORE_NAMES = Object.freeze(Object.keys(STORES));

/* Migraciones: la clave es la versión a la que se llega. Nunca se edita una ya publicada; se agrega la siguiente. */
const MIGRATIONS = {
  1: db => { STORE_NAMES.forEach(name => createStore(db, name)); }
};
function createStore(db, name) {
  const def = STORES[name];
  const os = db.createObjectStore(name, { keyPath: def.keyPath });
  def.indexes.forEach(ix => os.createIndex(ix.name, ix.keyPath, { multiEntry: !!ix.multiEntry, unique: !!ix.unique }));
}

class KnowledgeError extends Error {
  constructor(code, message, cause) { super(message); this.name = 'KnowledgeError'; this.code = code; if (cause) this.cause = cause; }
}
const wrap = (code, message, cause) => cause instanceof KnowledgeError ? cause : new KnowledgeError(code, message, cause);

/* Valor de un índice para un registro (ruta simple o compuesta). Devuelve lista de claves (multiEntry produce varias). */
function indexKeys(rec, ix) {
  const get = p => rec == null ? undefined : rec[p];
  if (Array.isArray(ix.keyPath)) {
    const parts = ix.keyPath.map(get);
    return parts.some(p => p === undefined || p === null) ? [] : [parts];
  }
  const v = get(ix.keyPath);
  if (v === undefined || v === null) return [];
  if (ix.multiEntry) return (Array.isArray(v) ? v : [v]).filter(x => x !== undefined && x !== null);
  return [v];
}
/* Orden total compatible con IndexedDB para strings, números y arreglos de esos. */
function cmpKey(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) {
    const x = Array.isArray(a) ? a : [a], y = Array.isArray(b) ? b : [b];
    for (let i = 0; i < Math.min(x.length, y.length); i++) { const c = cmpKey(x[i], y[i]); if (c) return c; }
    return x.length - y.length;
  }
  if (typeof a === typeof b) return a < b ? -1 : a > b ? 1 : 0;
  return typeof a === 'number' ? -1 : 1;
}
const keyId = k => JSON.stringify(k);

/* ================= MemoryBackend ================= */
class MemoryBackend {
  constructor() {
    this.kind = 'memory'; this.persistent = false; this.opened = false;
    this.data = {}; this.ix = {}; this.sorted = {};
    this.stats = { gets: 0, puts: 0, indexQueries: 0, fullScans: 0 };
  }
  async open() {
    STORE_NAMES.forEach(n => {
      this.data[n] = new Map(); this.ix[n] = {}; this.sorted[n] = {};
      STORES[n].indexes.forEach(ix => { this.ix[n][ix.name] = new Map(); });
    });
    this.opened = true;
    return { mode: 'memory', version: DB_VERSION, persistent: false };
  }
  close() { this.opened = false; }
  _unindex(store, rec) {
    STORES[store].indexes.forEach(ix => {
      indexKeys(rec, ix).forEach(k => { const m = this.ix[store][ix.name]; const id = keyId(k); const s = m.get(id); if (s) { s.ids.delete(rec.id); if (!s.ids.size) m.delete(id); } });
      this.sorted[store][ix.name] = null;
    });
  }
  _index(store, rec) {
    STORES[store].indexes.forEach(ix => {
      indexKeys(rec, ix).forEach(k => { const m = this.ix[store][ix.name]; const id = keyId(k); let s = m.get(id); if (!s) { s = { key: k, ids: new Set() }; m.set(id, s); } s.ids.add(rec.id); });
      this.sorted[store][ix.name] = null;
    });
  }
  _put(store, rec) {
    const old = this.data[store].get(rec.id);
    if (old) this._unindex(store, old);
    const copy = JSON.parse(JSON.stringify(rec));
    this.data[store].set(rec.id, copy); this._index(store, copy); this.stats.puts++;
  }
  _del(store, id) { const old = this.data[store].get(id); if (old) { this._unindex(store, old); this.data[store].delete(id); } }
  async get(store, id) { this.stats.gets++; const r = this.data[store].get(id); return r ? JSON.parse(JSON.stringify(r)) : undefined; }
  async getMany(store, ids) { return ids.map(id => { this.stats.gets++; const r = this.data[store].get(id); return r ? JSON.parse(JSON.stringify(r)) : undefined; }); }
  async put(store, rec) { this._put(store, rec); return rec; }
  async putMany(store, recs) { recs.forEach(r => this._put(store, r)); return recs.length; }
  async delete(store, id) { this._del(store, id); }
  /* Atómico: se valida todo antes de aplicar nada. */
  async batch(ops) {
    ops.forEach(o => { if (!STORES[o.store]) throw new KnowledgeError('bad_store', `Almacén desconocido: ${o.store}`); if (o.op === 'put' && (!o.rec || o.rec.id == null)) throw new KnowledgeError('bad_record', 'Registro sin id.'); });
    ops.forEach(o => { if (o.op === 'put') this._put(o.store, o.rec); else this._del(o.store, o.id); });
    return ops.length;
  }
  _bucket(store, index, key) { this.stats.indexQueries++; const s = this.ix[store][index]; if (!s) throw new KnowledgeError('bad_index', `Índice desconocido: ${store}.${index}`); const b = s.get(keyId(key)); return b ? [...b.ids] : []; }
  async getByIndex(store, index, key, opts) {
    const ids = this._bucket(store, index, key).sort(); const lim = opts && opts.limit;
    return (lim ? ids.slice(0, lim) : ids).map(id => JSON.parse(JSON.stringify(this.data[store].get(id))));
  }
  async countByIndex(store, index, key) { return this._bucket(store, index, key).length; }
  _sortedKeys(store, index) {
    if (!this.ix[store][index]) throw new KnowledgeError('bad_index', `Índice desconocido: ${store}.${index}`);
    if (!this.sorted[store][index]) this.sorted[store][index] = [...this.ix[store][index].values()].sort((a, b) => cmpKey(a.key, b.key));
    return this.sorted[store][index];
  }
  /* Rango ordenado por índice: {lower, upper, lowerOpen, upperOpen, direction:'next'|'prev', limit, offset}. */
  async range(store, index, o) {
    o = o || {}; this.stats.indexQueries++;
    let keys = this._sortedKeys(store, index);
    keys = keys.filter(e => (o.lower === undefined || (o.lowerOpen ? cmpKey(e.key, o.lower) > 0 : cmpKey(e.key, o.lower) >= 0)) && (o.upper === undefined || (o.upperOpen ? cmpKey(e.key, o.upper) < 0 : cmpKey(e.key, o.upper) <= 0)));
    if (o.direction === 'prev') keys = keys.slice().reverse();
    const out = []; const seen = new Set(); let skipped = 0; const offset = o.offset || 0;
    for (const e of keys) {
      for (const id of [...e.ids].sort()) {
        if (seen.has(id)) continue; seen.add(id);
        if (skipped < offset) { skipped++; continue; }
        out.push(JSON.parse(JSON.stringify(this.data[store].get(id))));
        if (o.limit && out.length >= o.limit) return out;
      }
    }
    return out;
  }
  async count(store) { return this.data[store].size; }
  /* Recorrido completo paginado: solo para exportar, restaurar y estadísticas. Se cuenta para detectar abusos. */
  async scan(store, o) {
    this.stats.fullScans++; o = o || {};
    const all = [...this.data[store].values()].sort((a, b) => (a.id < b.id ? -1 : 1));
    const start = o.after == null ? 0 : all.findIndex(r => r.id > o.after);
    if (start < 0) return [];
    const page = all.slice(start, o.limit ? start + o.limit : undefined);
    return page.map(r => JSON.parse(JSON.stringify(r)));
  }
  async clear(store) { [...this.data[store].keys()].forEach(id => this._del(store, id)); }
  async destroy() { await this.open(); }
  describe() { return { mode: 'memory', persistent: false, version: DB_VERSION }; }
}

/* ================= IDBBackend ================= */
class IDBBackend {
  constructor(o) {
    o = o || {};
    this.kind = 'indexeddb'; this.persistent = true; this.opened = false; this.db = null;
    this.idb = o.indexedDB || (typeof indexedDB !== 'undefined' ? indexedDB : null);
    this.name = o.name || DB_NAME; this.version = o.version || DB_VERSION;
    this.stats = { gets: 0, puts: 0, indexQueries: 0, fullScans: 0 };
  }
  static available() { return typeof indexedDB !== 'undefined' && !!indexedDB; }
  open() {
    if (!this.idb) return Promise.reject(new KnowledgeError('unavailable', 'IndexedDB no está disponible en este navegador.'));
    return new Promise((resolve, reject) => {
      let req;
      try { req = this.idb.open(this.name, this.version); } catch (e) { reject(wrap('open_failed', 'No se pudo abrir la base de conocimiento.', e)); return; }
      req.onupgradeneeded = ev => {
        const db = req.result, from = ev.oldVersion || 0;
        for (let v = from + 1; v <= this.version; v++) { if (MIGRATIONS[v]) MIGRATIONS[v](db, req.transaction); }
      };
      req.onblocked = () => reject(new KnowledgeError('blocked', 'Cierra otras pestañas de la aplicación para actualizar la base de conocimiento.'));
      req.onerror = () => reject(wrap(req.error && req.error.name === 'VersionError' ? 'version' : 'open_failed', req.error && req.error.name === 'VersionError' ? 'La base de conocimiento es de una versión más nueva que esta aplicación.' : 'No se pudo abrir la base de conocimiento.', req.error));
      req.onsuccess = () => {
        this.db = req.result; this.opened = true;
        this.db.onversionchange = () => { try { this.db.close(); } catch (_) { /* ya cerrada */ } this.opened = false; };
        this.db.onclose = () => { this.opened = false; };
        resolve({ mode: 'indexeddb', version: this.db.version, persistent: true });
      };
    });
  }
  close() { if (this.db) { try { this.db.close(); } catch (_) { /* ya cerrada */ } } this.opened = false; }
  _tx(stores, mode) {
    if (!this.opened || !this.db) throw new KnowledgeError('closed', 'La base de conocimiento no está abierta.');
    return this.db.transaction(stores, mode);
  }
  _run(stores, mode, fn) {
    return new Promise((resolve, reject) => {
      let tx, result;
      try { tx = this._tx(stores, mode); result = fn(tx); } catch (e) { reject(wrap('tx_failed', 'Falló la transacción de conocimiento.', e)); return; }
      tx.oncomplete = () => resolve(result && result.__done ? result.value : result);
      tx.onerror = () => reject(wrap(tx.error && tx.error.name === 'QuotaExceededError' ? 'quota' : 'tx_failed', tx.error && tx.error.name === 'QuotaExceededError' ? 'No hay espacio de almacenamiento para guardar más conocimiento.' : 'Falló la transacción de conocimiento.', tx.error));
      tx.onabort = () => reject(wrap(tx.error && tx.error.name === 'QuotaExceededError' ? 'quota' : 'aborted', tx.error && tx.error.name === 'QuotaExceededError' ? 'No hay espacio de almacenamiento para guardar más conocimiento.' : 'La transacción de conocimiento se canceló.', tx.error));
    });
  }
  _req(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(wrap('request_failed', 'Falló una lectura de conocimiento.', r.error)); }); }
  async get(store, id) { this.stats.gets++; const tx = this._tx(store, 'readonly'); return this._req(tx.objectStore(store).get(id)); }
  async getMany(store, ids) {
    const tx = this._tx(store, 'readonly'); const os = tx.objectStore(store);
    this.stats.gets += ids.length;
    return Promise.all(ids.map(id => this._req(os.get(id))));
  }
  async put(store, rec) { this.stats.puts++; await this._run(store, 'readwrite', tx => { tx.objectStore(store).put(rec); }); return rec; }
  async putMany(store, recs) { this.stats.puts += recs.length; await this._run(store, 'readwrite', tx => { const os = tx.objectStore(store); recs.forEach(r => os.put(r)); }); return recs.length; }
  async delete(store, id) { await this._run(store, 'readwrite', tx => { tx.objectStore(store).delete(id); }); }
  async batch(ops) {
    ops.forEach(o => { if (!STORES[o.store]) throw new KnowledgeError('bad_store', `Almacén desconocido: ${o.store}`); if (o.op === 'put' && (!o.rec || o.rec.id == null)) throw new KnowledgeError('bad_record', 'Registro sin id.'); });
    const names = [...new Set(ops.map(o => o.store))]; if (!names.length) return 0;
    this.stats.puts += ops.filter(o => o.op === 'put').length;
    /* Una referencia al almacén por tabla (no por operación): con miles de registros es 2–3 veces más rápido. */
    await this._run(names, 'readwrite', tx => {
      const stores = {}; names.forEach(n => { stores[n] = tx.objectStore(n); });
      for (let i = 0; i < ops.length; i++) { const o = ops[i]; if (o.op === 'put') stores[o.store].put(o.rec); else stores[o.store].delete(o.id); }
    });
    return ops.length;
  }
  _index(store, index) {
    if (!STORES[store] || !STORES[store].indexes.some(i => i.name === index)) throw new KnowledgeError('bad_index', `Índice desconocido: ${store}.${index}`);
    this.stats.indexQueries++;
    return this._tx(store, 'readonly').objectStore(store).index(index);
  }
  async getByIndex(store, index, key, opts) {
    const ix = this._index(store, index); const lim = opts && opts.limit;
    return this._req(lim ? ix.getAll(key, lim) : ix.getAll(key));
  }
  async countByIndex(store, index, key) { return this._req(this._index(store, index).count(key)); }
  async range(store, index, o) {
    o = o || {}; const ix = this._index(store, index);
    const K = this.idb === (typeof indexedDB !== 'undefined' ? indexedDB : null) ? IDBKeyRange : (root.IDBKeyRange || IDBKeyRange);
    let range = null;
    if (o.lower !== undefined && o.upper !== undefined) range = K.bound(o.lower, o.upper, !!o.lowerOpen, !!o.upperOpen);
    else if (o.lower !== undefined) range = K.lowerBound(o.lower, !!o.lowerOpen);
    else if (o.upper !== undefined) range = K.upperBound(o.upper, !!o.upperOpen);
    const out = []; const seen = new Set(); let skipped = 0; const offset = o.offset || 0;
    return new Promise((resolve, reject) => {
      const req = ix.openCursor(range, o.direction === 'prev' ? 'prev' : 'next');
      req.onerror = () => reject(wrap('request_failed', 'Falló una búsqueda de conocimiento.', req.error));
      req.onsuccess = () => {
        const c = req.result;
        if (!c) { resolve(out); return; }
        const id = c.primaryKey;
        if (!seen.has(id)) {
          seen.add(id);
          if (skipped < offset) skipped++; else { out.push(c.value); if (o.limit && out.length >= o.limit) { resolve(out); return; } }
        }
        c.continue();
      };
    });
  }
  async count(store) { return this._req(this._tx(store, 'readonly').objectStore(store).count()); }
  async scan(store, o) {
    this.stats.fullScans++; o = o || {};
    const os = this._tx(store, 'readonly').objectStore(store);
    const K = root.IDBKeyRange || IDBKeyRange;
    const range = o.after == null ? null : K.lowerBound(o.after, true);
    return this._req(o.limit ? os.getAll(range, o.limit) : os.getAll(range));
  }
  async clear(store) { await this._run(store, 'readwrite', tx => { tx.objectStore(store).clear(); }); }
  async destroy() {
    this.close();
    await new Promise((res, rej) => { const r = this.idb.deleteDatabase(this.name); r.onsuccess = () => res(); r.onerror = () => rej(wrap('delete_failed', 'No se pudo reiniciar la base de conocimiento.', r.error)); r.onblocked = () => rej(new KnowledgeError('blocked', 'Cierra otras pestañas de la aplicación para reiniciar la base de conocimiento.')); });
    return this.open();
  }
  describe() { return { mode: 'indexeddb', persistent: true, version: this.db ? this.db.version : this.version }; }
}

/* ================= KnowledgeDB (fachada) ================= */
const PAGE = 500;
function create(opts) {
  opts = opts || {};
  let backend = opts.backend || (IDBBackend.available() ? new IDBBackend({ name: opts.name }) : new MemoryBackend());
  const status = { mode: 'closed', persistent: false, degraded: false, error: '', version: DB_VERSION, fallbackReason: '' };
  let opening = null;

  async function open() {
    if (opening) return opening;
    opening = (async () => {
      try {
        const r = await backend.open();
        Object.assign(status, { mode: r.mode, persistent: !!r.persistent, version: r.version, degraded: false, error: '' });
      } catch (e) {
        /* Recuperación: la app sigue funcionando con conocimiento en memoria y lo dice. */
        const reason = e && e.message ? e.message : 'No se pudo abrir la base de conocimiento.';
        if (backend.kind !== 'memory') {
          backend = new MemoryBackend(); await backend.open();
          Object.assign(status, { mode: 'memory', persistent: false, degraded: true, error: reason, fallbackReason: (e && e.code) || 'open_failed', version: DB_VERSION });
        } else throw wrap('open_failed', reason, e);
      }
      return Object.assign({}, status);
    })();
    return opening;
  }
  const guard = async fn => { await open(); try { return await fn(); } catch (e) { throw wrap('db_error', (e && e.message) || 'Error en la base de conocimiento.', e); } };
  const checkStore = s => { if (!STORES[s]) throw new KnowledgeError('bad_store', `Almacén desconocido: ${s}`); };

  /* ----- respaldo y restauración ----- */
  async function exportAll() {
    return guard(async () => {
      const stores = {};
      for (const name of STORE_NAMES) {
        const out = []; let after = null;
        for (;;) { const page = await backend.scan(name, { after, limit: PAGE }); if (!page.length) break; out.push(...page); after = page[page.length - 1].id; if (page.length < PAGE) break; }
        stores[name] = out;
      }
      return { schema: SCHEMA, dbName: DB_NAME, dbVersion: DB_VERSION, createdAt: new Date().toISOString(), counts: Object.fromEntries(STORE_NAMES.map(n => [n, stores[n].length])), stores };
    });
  }
  /* Valida la estructura de un respaldo sin tocar nada. Devuelve {ok, errors[], warnings[], counts}. */
  function validateBackup(data) {
    const errors = [], warnings = [];
    if (!data || typeof data !== 'object') return { ok: false, errors: ['El respaldo de conocimiento no es válido.'], warnings, counts: {} };
    if (data.schema !== SCHEMA) errors.push('El archivo no es un respaldo de conocimiento de esta aplicación.');
    if (typeof data.dbVersion !== 'number') errors.push('El respaldo no indica la versión de la base.');
    else if (data.dbVersion > DB_VERSION) errors.push(`El respaldo es de una versión más nueva (${data.dbVersion}) que esta aplicación (${DB_VERSION}). Actualiza la aplicación.`);
    else if (data.dbVersion < DB_VERSION) warnings.push(`El respaldo es de una versión anterior (${data.dbVersion}); se actualizará.`);
    const st = data.stores;
    if (!st || typeof st !== 'object') errors.push('El respaldo no contiene datos de conocimiento.');
    const counts = {};
    if (st && typeof st === 'object') {
      Object.keys(st).forEach(name => {
        if (!STORES[name]) { warnings.push(`Se ignora el almacén desconocido «${name}».`); return; }
        if (!Array.isArray(st[name])) { errors.push(`El almacén «${name}» está dañado.`); return; }
        const seen = new Set(); let bad = 0, dup = 0;
        st[name].forEach(r => { if (!r || typeof r !== 'object' || r.id == null || r.id === '') { bad++; return; } if (seen.has(r.id)) dup++; seen.add(r.id); });
        counts[name] = st[name].length - bad;
        if (bad) errors.push(`El almacén «${name}» tiene ${bad} registro(s) sin identificador.`);
        if (dup) warnings.push(`El almacén «${name}» repite ${dup} identificador(es); se conserva el más reciente.`);
      });
    }
    return { ok: errors.length === 0, errors, warnings, counts };
  }
  const stamp = r => String(r.updatedAt || r.createdAt || r.openedAt || r.at || '');
  /* mode 'merge' (por defecto): no borra nada, evita duplicados y conserva el registro más reciente; la evidencia nunca se pierde.
   * mode 'replace': reconstruye la base con el contenido del respaldo. */
  async function importAll(data, o) {
    o = o || {}; const mode = o.mode === 'replace' ? 'replace' : 'merge';
    const v = validateBackup(data);
    if (!v.ok) throw new KnowledgeError('invalid_backup', v.errors[0], null);
    return guard(async () => {
      const report = { mode, added: 0, updated: 0, kept: 0, skipped: 0, byStore: {}, warnings: v.warnings };
      if (mode === 'replace') for (const n of STORE_NAMES) await backend.clear(n);
      for (const name of STORE_NAMES) {
        const incoming = Array.isArray(data.stores[name]) ? data.stores[name].filter(r => r && r.id != null && r.id !== '') : [];
        const latest = new Map(); incoming.forEach(r => { const p = latest.get(r.id); if (!p || stamp(r) >= stamp(p)) latest.set(r.id, r); });
        const rows = [...latest.values()]; const st = { added: 0, updated: 0, kept: 0 };
        for (let i = 0; i < rows.length; i += PAGE) {
          const chunk = rows.slice(i, i + PAGE);
          const existing = await backend.getMany(name, chunk.map(r => r.id));
          const ops = [];
          chunk.forEach((r, j) => {
            const cur = existing[j];
            if (!cur) { ops.push({ op: 'put', store: name, rec: r }); st.added++; }
            else if (name === 'evidence') { st.kept++; }        // la evidencia es inmutable: no se sobrescribe
            else if (stamp(r) > stamp(cur)) { ops.push({ op: 'put', store: name, rec: r }); st.updated++; }
            else st.kept++;
          });
          if (ops.length) await backend.batch(ops);
        }
        report.byStore[name] = st; report.added += st.added; report.updated += st.updated; report.kept += st.kept;
      }
      return report;
    });
  }

  const api = {
    open, status: () => Object.assign({}, status), backend: () => backend,
    get: (s, id) => guard(() => { checkStore(s); return backend.get(s, id); }),
    getMany: (s, ids) => guard(() => { checkStore(s); return ids.length ? backend.getMany(s, ids) : []; }),
    put: (s, rec) => guard(() => { checkStore(s); return backend.put(s, rec); }),
    putMany: (s, recs) => guard(() => { checkStore(s); return recs.length ? backend.putMany(s, recs) : 0; }),
    delete: (s, id) => guard(() => { checkStore(s); return backend.delete(s, id); }),
    batch: ops => guard(() => ops.length ? backend.batch(ops) : 0),
    byIndex: (s, ix, key, o) => guard(() => { checkStore(s); return backend.getByIndex(s, ix, key, o); }),
    countByIndex: (s, ix, key) => guard(() => { checkStore(s); return backend.countByIndex(s, ix, key); }),
    range: (s, ix, o) => guard(() => { checkStore(s); return backend.range(s, ix, o); }),
    count: s => guard(() => { checkStore(s); return backend.count(s); }),
    scan: (s, o) => guard(() => { checkStore(s); return backend.scan(s, o); }),
    clear: s => guard(() => { checkStore(s); return backend.clear(s); }),
    reset: () => guard(() => backend.destroy()),
    exportAll, importAll, validateBackup,
    health: async () => { await open(); const counts = {}; for (const n of STORE_NAMES) counts[n] = await backend.count(n); return Object.assign({ dbName: DB_NAME, schema: SCHEMA, counts }, status, { stats: Object.assign({}, backend.stats) }); },
    meta: {
      get: async key => { const r = await api.get('knowledgeMeta', key); return r ? r.value : undefined; },
      set: (key, value) => api.put('knowledgeMeta', { id: key, value, updatedAt: new Date().toISOString() })
    }
  };
  return api;
}

const api = { DB_NAME, DB_VERSION, SCHEMA, STORES, STORE_NAMES, MIGRATIONS, KnowledgeError, MemoryBackend, IDBBackend, create, indexKeys, cmpKey };
if (isNode) module.exports = api;
else { root.FichasKnowledgeDB = api; root.FP = root.FP || {}; root.FP.KnowledgeDB = api; }
})(typeof self !== 'undefined' ? self : this);
