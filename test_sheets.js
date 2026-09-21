const vm = require('node:vm');
const fs = require('node:fs');
const assert = require('node:assert/strict');
let headers = [], rows = [], failAfterWrite = false;
const calls = [];
const context = vm.createContext({crypto: require('node:crypto').webcrypto, AbortSignal,
  google: {accounts: {oauth2: {
    hasGrantedAllScopes: () => true,
    initTokenClient: options => ({requestAccessToken: () => options.callback({access_token: 'test', expires_in: 3600})})
  }}},
  fetch: async (url, options) => {
    calls.push({url, options});
    const body = options.body ? JSON.parse(options.body) : null;
    let result;
    if (url.includes('?fields=')) result = {properties: {title:'Test export'}, sheets: [{properties: {sheetId: 0, title: "Borrower's records", gridProperties: {columnCount: 2}}}]};
    else if (url.endsWith(':batchUpdate')) result = {};
    else if (options.method === 'PUT') { headers = body.values[0]; result = {}; }
    else if (url.includes(':append?')) {
      rows.push(body.values[0]);
      if (failAfterWrite) {failAfterWrite = false; throw new Error('Connection lost after write');}
      result = {updates: {updatedRange: `Sheet1!A${rows.length + 1}:Z${rows.length + 1}`, updatedRows: 1}};
    } else if (decodeURIComponent(url).endsWith('!A2:A')) result = {values: rows.map(r => [r[0]])};
    else result = {values: headers.length ? [headers] : []};
    return {ok: true, status: 200, json: async () => result};
  }
});
vm.runInContext(fs.readFileSync('sheets.js', 'utf8') + '\nglobalThis.api = sheetExport;', context);
(async () => {
  const api = context.api;
  const fields = [{key:'First Name'}, {key:'SSN'}];
  const entry = api.record(fields, {'First Name':'=not-a-formula', SSN:'1234'}, {amount:'500', installments:'2', dates:['2026-10-01','2026-11-01']}, 'Example', false);
  assert.equal(entry.row[entry.headers.indexOf('SSN')], '');
  await assert.rejects(api.append(entry), /Connect Google/);
  await api.connect();
  assert.equal((await api.checkAccess()).title, 'Test export');
  failAfterWrite = true;
  await assert.rejects(api.append(entry), /Connection lost/);
  const retried = await api.append(entry);
  assert(retried.url.includes('range=A2'));
  assert.equal(rows.length, 1);
  const second = api.record(fields, {SSN:'1234'}, {dates:[]}, 'Other', true);
  await api.append(second);
  assert.equal(rows.length, 2);
  assert.equal(rows[1][headers.indexOf('SSN')], '1234');
  assert.equal(rows[0][headers.indexOf('Payment total (USD)')], '500');
  // Upgrade a pre-card export sheet without changing existing rows or column order.
  headers = headers.filter(h => !h.startsWith('Dummy card'));
  const previous = JSON.stringify(rows);
  const cardEntry = api.record(fields, {}, {dates: [], cardNumber:'0000000000000000', cardExpiry:'12/30', cardholderName:'Test Person'}, 'Dummy', false);
  await api.append(cardEntry);
  assert.equal(JSON.stringify(rows.slice(0, 2)), previous);
  assert.equal(rows[2][headers.indexOf('Dummy card number')], '0000000000000000');
  assert.equal(rows[2][headers.indexOf('Dummy card expiry')], '12/30');
  assert.equal(rows[2][headers.indexOf('Dummy cardholder name')], 'Test Person');
  assert(calls.filter(c => c.url.includes(':append?')).every(c => c.url.includes('valueInputOption=RAW')));
  headers = ['Unrelated data'];
  await assert.rejects(api.append(second), /columns do not match/);
  api.disconnect(); assert.equal(api.connected(), false);
  console.log('Sheet export checks passed: snapshots, optional SSN, same destination, retry deduplication, RAW cells, header protection.');
})().catch(error => {console.error(error); process.exitCode=1;});
