/* Google credentials remain in memory; this app only writes to the configured spreadsheet. */
const sheetExport = (() => {
  const clientId = '953717601487-vtl50kq3hhvdin4tema0fj5k3bmiukeu.apps.googleusercontent.com';
  const sheetId = '1Oebl4RgsnvRPhiwz1kT9xifbJjkFeQY7zKcqpib55cI';
  const scope = 'https://www.googleapis.com/auth/spreadsheets';
  let token = '', expires = 0;
  const connected = () => !!token && Date.now() < expires;
  async function request(path, method = 'GET', body) {
    if (!connected()) throw new Error('Connect Google Sheets first, or reconnect if your session expired.');
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}${path}`, {
      method, headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
      ...(body ? {body: JSON.stringify(body)} : {}), signal: AbortSignal.timeout(30000)
    });
    if (response.status === 401) { token = ''; throw new Error('Google session expired. Connect Google Sheets again.'); }
    if (!response.ok) throw new Error(`Google Sheets returned ${response.status}. Check that Sheets API is enabled and your signed-in account can edit the destination sheet.`);
    return response.json();
  }
  function connect() {
    return new Promise((resolve, reject) => {
      if (!globalThis.google?.accounts?.oauth2) return reject(new Error('Google sign-in has not loaded. Check your connection and try again.'));
      const client = google.accounts.oauth2.initTokenClient({client_id: clientId, scope,
        hint: 'nimdabali@gmail.com', callback: response => {
          if (response.error || !response.access_token) return reject(new Error(response.error || 'Google sign-in failed.'));
          if (!google.accounts.oauth2.hasGrantedAllScopes(response, scope)) return reject(new Error('Google Sheets permission was not granted.'));
          token = response.access_token; expires = Date.now() + (Number(response.expires_in) - 60) * 1000; resolve();
        }, error_callback: () => reject(new Error('Google sign-in was closed or blocked. Try connecting again.'))});
      client.requestAccessToken();
    });
  }
  function disconnect() { token = ''; expires = 0; }
  const cardHeaders = ['Dummy card number', 'Dummy card expiry', 'Dummy cardholder name'];
  function record(fields, values, payment, name, includeSSN) {
    const selected = fields;
    return {id: crypto.randomUUID(), headers: ['Export ID', 'Generated at (UTC)', 'Profile', ...selected.map(f => f.key), 'Payment total (USD)', 'Installments', 'Payment dates', ...cardHeaders],
      row: ['', new Date().toISOString(), name, ...selected.map(f => f.key === 'SSN' && !includeSSN ? '' : values[f.key] || ''), payment.amount || '', payment.installments || '', payment.dates.join(', '), payment.cardNumber || '', payment.cardExpiry || '', payment.cardholderName || '']};
  }
  async function append(entry) {
    const info = await request('?fields=sheets.properties');
    const target = info.sheets.find(s => s.properties.sheetId === 0);
    if (!target) throw new Error('The original sheet tab (gid=0) is missing. Restore it before exporting.');
    const range = `'${target.properties.title.replace(/'/g, "''")}'`;
    const existing = await request('/values/' + encodeURIComponent(range + '!1:1'));
    let headers = existing.values?.[0] || [];
    const missing = entry.headers.filter(h => !headers.includes(h));
    if (headers.length && (headers[0] !== 'Export ID' || missing.some(h => !cardHeaders.includes(h)))) throw new Error('Sheet columns do not match this app. Keep the export headers intact.');
    if (!headers.length || missing.length) {
      headers = headers.length ? [...headers, ...missing] : entry.headers;
      if (target.properties.gridProperties.columnCount < headers.length) {
        await request(':batchUpdate', 'POST', {requests: [{updateSheetProperties: {properties: {sheetId: 0, gridProperties: {columnCount: headers.length}}, fields: 'gridProperties.columnCount'}}]});
      }
      await request('/values/' + encodeURIComponent(range + '!A1') + '?valueInputOption=RAW', 'PUT', {values: [headers]});
    }
    if (headers[0] !== 'Export ID' || entry.headers.some(h => !headers.includes(h))) throw new Error('Sheet columns do not match this app. Keep the export headers intact and include an SSN column if enabling SSN export.');
    const ids = await request('/values/' + encodeURIComponent(range + '!A2:A'));
    if (ids.values?.some(row => row[0] === entry.id)) return;
    const map = Object.fromEntries(entry.headers.map((header, i) => [header, i === 0 ? entry.id : entry.row[i]]));
    await request('/values/' + encodeURIComponent(range + '!A1') + ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS', 'POST', {values: [headers.map(h => map[h] ?? '')]});
  }
  return {connect, disconnect, connected, record, append};
})();
