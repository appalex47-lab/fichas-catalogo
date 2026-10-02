/* Fase 7: conectores operativos para Google Sheets y REST API.
 * Seguridad: solo lectura por defecto; la importación entra al lote y nunca sobrescribe productos automáticamente.
 */
(function(root){
'use strict';
const VERSION='1.0';
const SCHEMA='fichas.connector.v1';
const GOOGLE_BASE='https://sheets.googleapis.com/v4/spreadsheets';
const REST_METHODS=['GET','POST'];
const now=()=>new Date().toISOString();
const hash=s=>{let h=2166136261;for(const c of String(s??'')){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(16).padStart(8,'0');};
function cleanToken(v){return String(v||'').trim();}
function extractSpreadsheetId(input){const s=cleanToken(input);if(!s)return '';const m=s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);return m?m[1]:s;}
function toRows(values){const rows=Array.isArray(values)?values:[];if(!rows.length)return [];const headers=(rows[0]||[]).map((h,i)=>String(h??'').trim()||`col_${i+1}`);return rows.slice(1).filter(r=>Array.isArray(r)&&r.some(v=>String(v??'').trim()!=='')).map((r,i)=>{const o={};headers.forEach((h,j)=>o[h]=r[j]??'');o.__row=i+2;return o;});}
function normalizeRestPayload(payload){if(Array.isArray(payload))return payload;for(const k of ['data','items','results','rows','records'])if(Array.isArray(payload?.[k]))return payload[k];return payload&&typeof payload==='object'?[payload]:[];}
function headersFromConfig(config,extra={}){const h={'Accept':'application/json',...(config.headers||{}),...(extra||{})};const token=cleanToken(config.token);if(token)h.Authorization=`Bearer ${token}`;return h;}
async function request(url,options={},fetchImpl=fetch){const res=await fetchImpl(url,options);let body=null;const text=await res.text();try{body=text?JSON.parse(text):null}catch(_){body=text;}if(!res.ok){const err=new Error(`http_${res.status}`);err.status=res.status;err.body=body;throw err;}return {status:res.status,headers:res.headers,body};}
async function readGoogleSheets(config,fetchImpl=fetch){const id=extractSpreadsheetId(config.spreadsheetId||config.url);if(!id)throw new Error('spreadsheet_id_required');const range=cleanToken(config.range)||'Sheet1';const params=new URLSearchParams();params.set('majorDimension','ROWS');if(config.apiKey)params.set('key',cleanToken(config.apiKey));const url=`${GOOGLE_BASE}/${encodeURIComponent(id)}/values/${encodeURIComponent(range)}?${params}`;const r=await request(url,{method:'GET',headers:headersFromConfig(config)},fetchImpl);const values=r.body?.values||[];return {schema:SCHEMA,version:VERSION,sourceId:'google-sheets',sourceRecordId:id,fetchedAt:now(),etag:r.headers?.get?.('etag')||'',checksum:hash(JSON.stringify(values)),spreadsheetId:id,range:r.body?.range||range,rows:toRows(values),raw:r.body};}
function buildRestUrl(config){const u=cleanToken(config.url);if(!u)throw new Error('rest_url_required');return u;}
async function readRest(config,fetchImpl=fetch){const method=cleanToken(config.method||'GET').toUpperCase();if(!REST_METHODS.includes(method))throw new Error('rest_method_not_supported');const headers=headersFromConfig(config);const init={method,headers};if(method==='POST'){init.body=typeof config.body==='string'?config.body:JSON.stringify(config.body||{});headers['Content-Type']=headers['Content-Type']||'application/json';}const r=await request(buildRestUrl(config),init,fetchImpl);const rows=normalizeRestPayload(r.body);return {schema:SCHEMA,version:VERSION,sourceId:'rest-api',sourceRecordId:cleanToken(config.name)||buildRestUrl(config),fetchedAt:now(),etag:r.headers?.get?.('etag')||'',checksum:hash(JSON.stringify(r.body)),rows,raw:r.body,status:r.status};}
function mapRow(row,map={}){const out={};Object.entries(map||{}).forEach(([target,source])=>{const key=String(source||'').trim();if(key&&Object.prototype.hasOwnProperty.call(row,key))out[target]=row[key];});return out;}
function prepareRecords(result,config={}){const rows=result?.rows||[];const sourceId=result?.sourceId||config.sourceId||'external';return rows.map((row,i)=>{const data=mapRow(row,config.fieldMap||{});const fallbackId=row.SKU??row.sku??row.id??row.ID??row.__row??i+1;return {sourceId,sourceRecordId:String(fallbackId),fetchedAt:result.fetchedAt||now(),etag:result.etag||'',checksum:hash(JSON.stringify(data)),data,raw:row};});}
function safeConfig(config){const c={...(config||{})};delete c.token;delete c.apiKey;return c;}
const api={VERSION,SCHEMA,GOOGLE_BASE,REST_METHODS,cleanToken,extractSpreadsheetId,toRows,normalizeRestPayload,request,readGoogleSheets,readRest,mapRow,prepareRecords,safeConfig,hash,now};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FichasConnector=api;
})(typeof self!=='undefined'?self:this);
