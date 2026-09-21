'use strict';
const $ = id => document.getElementById(id);
const storageKey = 'consolidation-profiles-v1';
let fields = [], slots = [], values = {}, section = 0, dirty = false, profiles = {};
let sameMailingAddress = false;
const states = 'AL:Alabama|AK:Alaska|AZ:Arizona|AR:Arkansas|CA:California|CO:Colorado|CT:Connecticut|DE:Delaware|DC:District of Columbia|FL:Florida|GA:Georgia|HI:Hawaii|ID:Idaho|IL:Illinois|IN:Indiana|IA:Iowa|KS:Kansas|KY:Kentucky|LA:Louisiana|ME:Maine|MD:Maryland|MA:Massachusetts|MI:Michigan|MN:Minnesota|MS:Mississippi|MO:Missouri|MT:Montana|NE:Nebraska|NV:Nevada|NH:New Hampshire|NJ:New Jersey|NM:New Mexico|NY:New York|NC:North Carolina|ND:North Dakota|OH:Ohio|OK:Oklahoma|OR:Oregon|PA:Pennsylvania|RI:Rhode Island|SC:South Carolina|SD:South Dakota|TN:Tennessee|TX:Texas|UT:Utah|VT:Vermont|VA:Virginia|WA:Washington|WV:West Virginia|WI:Wisconsin|WY:Wyoming|AS:American Samoa|GU:Guam|MP:Northern Mariana Islands|PR:Puerto Rico|VI:U.S. Virgin Islands'.split('|').map(s => s.split(':'));
const isState = key => /^State(?:_\d+)?$/.test(key);
const isSuffix = key => /^Name Suffix(?:_\d+)?$/.test(key);
const suffixes = ['N/A', 'Jr.', 'Sr.', 'II', 'III', 'IV', 'V'];
const isPhone = key => /^(?:(?:Alternate |Work )?Phone Number(?:_\d+)?|For help completing this form.*)$/.test(key);
function formatPhone(value) {
  const text = value.trim();
  if (!text || /^n\/?a$/i.test(text)) return text ? 'N/A' : '';
  if (!/^[+\d\s().-]+$/.test(text)) return text;
  let digits = text.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  return digits.length === 10 ? `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}` : text;
}
function normalizeContactValues() {
  for (const key of Object.keys(values)) {
    if (isPhone(key)) values[key] = formatPhone(values[key]);
    if (isState(key)) {
      const state = states.find(([code, name]) => [code, name.toUpperCase()].includes(values[key].trim().toUpperCase()));
      if (state) values[key] = state[0];
    }
  }
}
const addressPairs = [
  ['Permanent Address', 'Mailing Address if different from permanent address'],
  ['City', 'City_2'], ['State', 'State_2'], ['Zip Code', 'Zip Code_2']
];
function syncMailingAddress() {
  if (!sameMailingAddress) return;
  addressPairs.forEach(([source, target]) => {
    values[target] = values[source] || '';
    const input = Array.from($('form').querySelectorAll('[data-field]')).find(el => el.dataset.field === target);
    if (input) input.value = values[target];
  });
}
const sections = [
  ['Your details', 'Enter your full SSN or just the last four digits. Four digits appear as XXX-XX-1234; a full SSN appears as 123-45-6789 throughout the PDF.'],
  ['Contact & employment', 'Enter your addresses, contact details, and employer information.'],
  ['References', 'Add two adults with different addresses who do not live with you. See page 4 for the full instructions.'],
  ['Loans to consolidate', 'List each loan separately. Loan codes and instructions are on pages 5–6 of the original form.'],
  ['Other loans', 'Loans you do not want to consolidate, as described on page 8.'],
  ['Finish & review', 'Optional servicer information and dates. Your full name will appear on the borrower signature line.']
];
function group(f) {
  if (/^(15 |16 |17 |18 )/.test(f.key)) return 3;
  if (/^(20 |21 |22 |23 )/.test(f.key)) return 4;
  if (/^(Mail pages|For help|Expected Grace|Todays Date)/.test(f.key)) return 5;
  return f.page === 2 ? 0 : f.page === 3 ? 1 : 2;
}
function message(text, error = false) { $('status').textContent = text; $('status').classList.toggle('error', error); }
function listProfiles(selected = '') {
  $('profiles').replaceChildren(new Option('Choose a profile', ''));
  Object.entries(profiles).forEach(([id,p]) => $('profiles').add(new Option(p.name, id)));
  $('profiles').value = selected;
}
function refreshProgress() { $('progress').textContent = `${Object.values(values).filter(v => v.trim()).length} fields entered`; }
function draw() {
  $('title').textContent = sections[section][0];
  $('description').textContent = sections[section][1];
  $('step').textContent = `SECTION ${section + 1} OF ${sections.length}`;
  $('nav').replaceChildren();
  sections.forEach(([name],i) => { const b = document.createElement('button'); b.textContent = `${String(i+1).padStart(2,'0')}  ${name}`; b.className = i === section ? 'active' : ''; b.onclick = () => { section = i; draw(); }; $('nav').append(b); });
  $('form').replaceChildren();
  let subset = fields.filter(f => group(f) === section);
  if (section === 3 || section === 4) subset.sort((a,b) => Number(a.key.match(/Row(\d+)/)[1]) - Number(b.key.match(/Row(\d+)/)[1]) || parseInt(a.key)-parseInt(b.key));
  let lastRow = '';
  subset.forEach((f,index) => {
    if (f.key === addressPairs[0][1]) {
      const option = document.createElement('label');
      option.className = 'check wide';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox'; checkbox.id = 'sameMailingAddress'; checkbox.checked = sameMailingAddress;
      checkbox.onchange = () => {
        sameMailingAddress = checkbox.checked; syncMailingAddress(); dirty = true; draw();
        $('sameMailingAddress').focus();
        message(sameMailingAddress ? 'Mailing address now matches your permanent address and will stay in sync.' : 'You can now edit the mailing address separately.');
      };
      option.append(checkbox, 'Mailing address is the same as permanent address');
      $('form').append(option);
    }
    const row = f.key.match(/Row(\d+)/)?.[1];
    if (row && row !== lastRow) { const h = document.createElement('h3'); h.className = 'row-heading'; h.textContent = `Loan ${row}`; $('form').append(h); lastRow = row; }
    if (section === 2 && /^First Name_/.test(f.key)) { const h = document.createElement('h3'); h.className = 'row-heading'; h.textContent = f.key.endsWith('_2') ? 'Reference 1' : 'Reference 2'; $('form').append(h); }
    const wrap = document.createElement('div');
    const multiline = /HolderServicer|^Mail pages/.test(f.key);
    if (/^Mail pages|^For help/.test(f.key)) wrap.className = 'wide';
    const label = document.createElement('label'); label.htmlFor = `field-${index}`;
    label.textContent = f.label.replace(/ Row \d+$/, '').replace(/_Row_\d+$/, '');
    const input = document.createElement(isState(f.key) || isSuffix(f.key) ? 'select' : multiline ? 'textarea' : 'input');
    if (isSuffix(f.key)) {
      input.add(new Option('Select a suffix', ''));
      suffixes.forEach(suffix => input.add(new Option(suffix, suffix)));
      // Keep existing profile entries available when they use another suffix.
      if (values[f.key] && !suffixes.includes(values[f.key])) input.add(new Option(values[f.key], values[f.key]));
    }
    if (isState(f.key)) {
      input.add(new Option('Select a state', ''));
      states.forEach(([code, name]) => input.add(new Option(`${name} (${code})`, code)));
      // Preserve older profiles without silently changing an unrecognized entry.
      if (values[f.key] && !states.some(([code]) => code === values[f.key])) input.add(new Option(values[f.key], values[f.key]));
    }
    input.id = label.htmlFor; input.value = values[f.key] || ''; input.maxLength = multiline ? 1000 : 250;
    input.dataset.field = f.key;
    input.readOnly = sameMailingAddress && addressPairs.some(([, target]) => target === f.key);
    if (isState(f.key)) input.disabled = input.readOnly;
    if (isPhone(f.key)) {
      input.type = 'tel'; input.placeholder = '(555) 123-4567 or N/A';
      input.onblur = () => {
        const formatted = formatPhone(input.value);
        if (formatted !== input.value) { input.value = formatted; values[f.key] = formatted; dirty = true; }
        input.setCustomValidity(!formatted || formatted === 'N/A' || /^\(\d{3}\) \d{3}-\d{4}$/.test(formatted) ? '' : 'Enter a 10-digit U.S. phone number, optionally with +1, or N/A.');
        input.reportValidity();
      };
    }
    if (f.key === 'SSN') { input.type = 'text'; input.inputMode = 'numeric'; input.maxLength = 11; input.pattern = '(?:[0-9]{4}|[0-9]{9}|[0-9]{3}-[0-9]{2}-[0-9]{4})'; input.placeholder = '123-45-6789 or 6789'; input.autocomplete = 'off'; }
    if (/Date of Birth|Todays Date/.test(f.key)) input.placeholder = 'mm/dd/yyyy';
    if (/Expected Grace/.test(f.key)) input.placeholder = 'mm/yyyy';
    input.oninput = () => { input.setCustomValidity(''); values[f.key] = input.value; syncMailingAddress(); dirty = true; refreshProgress(); message('Unsaved changes. Save your profile to reuse these details.'); };
    wrap.append(label,input); $('form').append(wrap);
  });
  $('back').disabled = section === 0; $('next').disabled = section === sections.length-1; refreshProgress();
}
$('form').onsubmit = e => e.preventDefault();
function showImportedLoans(loans = []) {
  $('importLoans').replaceChildren();
  loans.forEach(loan => {
    const row = document.createElement('div'); row.className = 'import-loan';
    const label = document.createElement('p');
    label.textContent = `${loan.description} — reported balance $${loan.balance} (${loan.date}). ${loan.servicer || 'Current servicer unavailable; enter manually.'}`;
    row.append(label);
    for (const [caption, target, prefix, amount] of [['Add to loans to consolidate', 3, 15, '18 Estimated Payoff Amount'], ['Add to other loans', 4, 20, '23 Current Balance']]) {
      const button = document.createElement('button'); button.className = 'secondary'; button.textContent = caption;
      button.onclick = () => {
        const candidates = fields.filter(f => f.key.startsWith(`${prefix} `));
        const available = candidates.map(f => f.key.match(/Row(\d+)/)?.[1]).filter(Boolean).sort((a,b) => a-b).find(n =>
          fields.filter(f => group(f) === target && f.key.endsWith(`Row${n}`)).every(f => !values[f.key]?.trim()));
        if (!available) { message('No empty loan rows remain in this section. Review additional loans separately.', true); return; }
        const servicer = fields.find(f => group(f) === target && /HolderServicer/.test(f.key) && f.key.endsWith(`Row${available}`));
        values[`${amount}Row${available}`] = loan.balance;
        if (servicer) values[servicer.key] = loan.servicer;
        row.querySelectorAll('button').forEach(b => b.disabled = true);
        label.textContent += ` Added to ${sections[target][0]}, loan ${available}.`;
        dirty = true; section = target; draw();
        message('Loan added. Enter the form’s loan code and servicer account number, and verify the balance before downloading.');
      };
      row.append(button);
    }
    $('importLoans').append(row);
  });
}
$('uploadText').onclick = () => $('textFile').click();
$('textTemplate').onclick = () => {
  const text = '# One borrower per file. Fill the fields you need; leave other lines blank.\n' + fields.map(f => `${f.key}: `).join('\n');
  const url = URL.createObjectURL(new Blob([text], {type: 'text/plain;charset=utf-8'}));
  const link = document.createElement('a'); link.href = url; link.download = 'borrower-details-template.txt'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
};
$('textFile').onchange = async () => {
  const file = $('textFile').files[0];
  if (!file) return;
  $('uploadText').disabled = true;
  try {
    if (!/\.txt$/i.test(file.name)) throw new Error('Please choose a .txt file.');
    if (file.size > 500000) throw new Error('Please choose a text file smaller than 500 KB.');
    const result = parseTextDetails(await file.text(), fields);
    if (dirty && !confirm('Replace unsaved entries with this borrower’s details? Saved profiles will remain available.')) return;
    values = result.values; normalizeContactValues(); sameMailingAddress = false;
    $('profiles').value = ''; $('saveSSN').checked = false;
    $('profileName').value = [values['First Name'], values['Last Name']].filter(Boolean).join(' ') || file.name.replace(/\.txt$/i, '');
    section = 0; dirty = true; draw();
    const summary = `Imported ${Object.values(values).filter(v => v.trim()).length} fields from ${file.name}.`;
    $('importReport').textContent = [summary, ...(result.notes || []), ...result.issues].join('\n');
    showImportedLoans(result.loans);
    $('importReport').parentElement.open = result.issues.length > 0 || !!result.notes;
    message(`${summary} ${result.issues.length ? `${result.issues.length} import issues; see import results. ` : ''}Review the details${result.loans?.length ? ' and choose loans below' : ''}, then save this user’s profile.`, result.issues.length > 0);
  } catch (error) {
    $('importReport').textContent = error.message;
    $('importReport').parentElement.open = true;
    message(error.message, true);
  } finally { $('textFile').value = ''; $('uploadText').disabled = false; }
};
$('back').onclick = () => { section--; draw(); };
$('next').onclick = () => { section++; draw(); };
$('save').onclick = () => {
  const name = $('profileName').value.trim();
  if (!name) { message('Give this profile a name before saving.',true); $('profileName').focus(); return; }
  const id = $('profiles').value || crypto.randomUUID();
  normalizeContactValues();
  const saved = {...values}; if (!$('saveSSN').checked) delete saved.SSN;
  const updated = {...profiles, [id]: {name, values:saved, sameMailingAddress}};
  try { localStorage.setItem(storageKey,JSON.stringify(updated)); profiles = updated; listProfiles(id); dirty = false; message(`Saved “${name}” in this browser${$('saveSSN').checked ? ', including SSN' : ', without SSN'}.`); }
  catch { message('Could not save: browser storage is unavailable or full. Your current entries are still here.',true); }
};
$('profiles').onchange = () => {
  if (dirty && !confirm('Discard unsaved changes and load this profile?')) { $('profiles').value = ''; return; }
  const p = profiles[$('profiles').value]; if (!p) return;
  showImportedLoans(); $('importReport').textContent = 'Saved profile loaded.';
  values = {...p.values};
  normalizeContactValues();
  sameMailingAddress = p.sameMailingAddress === true;
  syncMailingAddress();
  $('profileName').value = p.name; $('saveSSN').checked = !!values.SSN; dirty = false; draw();
  message('Profile loaded. Update any details, then download your PDF.');
};
$('new').onclick = () => { if (dirty && !confirm('Discard unsaved changes and start a new profile?')) return; values = {}; sameMailingAddress = false; dirty = false; $('profileName').value = ''; $('profiles').value = ''; $('saveSSN').checked = false; showImportedLoans(); $('importReport').textContent = 'No file imported yet.'; section = 0; draw(); message('New blank profile.'); };
$('delete').onclick = () => {
  const id = $('profiles').value; if (!id) { message('Choose a saved profile to delete.',true); return; }
  if (!confirm(`Delete saved profile “${profiles[id].name}” from this browser?`)) return;
  const updated = {...profiles}; delete updated[id];
  try { localStorage.setItem(storageKey,JSON.stringify(updated)); profiles = updated; listProfiles(); message('Saved profile deleted. Current form entries remain until you choose New or close the app.'); }
  catch { message('Could not delete the saved profile.',true); }
};
$('download').onclick = async () => {
  normalizeContactValues();
  const invalidPhone = fields.find(f => isPhone(f.key) && values[f.key] && values[f.key] !== 'N/A' && !/^\(\d{3}\) \d{3}-\d{4}$/.test(values[f.key]));
  if (invalidPhone) {
    section = group(invalidPhone); draw();
    const input = Array.from($('form').querySelectorAll('[data-field]')).find(el => el.dataset.field === invalidPhone.key);
    input.focus(); input.setCustomValidity('Enter a 10-digit U.S. phone number, optionally with +1, or N/A.'); input.reportValidity();
    message('Please correct the highlighted phone number before downloading.', true); return;
  }
  $('download').disabled = true; message('Preparing your PDF…');
  try {
    const response = await fetch('./template.pdf');
    if (!response.ok) throw new Error('Could not load the PDF template. Please reload and try again.');
    const bytes = await createFilledPDF(values, slots, await response.arrayBuffer());
    const url = URL.createObjectURL(new Blob([bytes], {type:'application/pdf'})); const a = document.createElement('a'); a.href = url; a.download = 'Consolidation-filled.pdf'; a.click(); setTimeout(() => URL.revokeObjectURL(url),60000);
    message('PDF downloaded with your name on the signature line and your full or masked SSN. Review all entries and any separate required forms.');
  } catch (e) { message(e.message || 'Download failed. Please reload the page and try again.',true); }
  finally { $('download').disabled = false; }
};
window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
async function initializeApp() {
  $('retryLoad').hidden = true;
  $('uploadState').textContent = 'Loading form fields…';
  try {
    const response = await fetch('./schema.json', {cache: 'no-store', signal: AbortSignal.timeout(15000)}); if (!response.ok) throw new Error('Could not load the PDF fields.');
    const data = await response.json(); slots = data.slots;
    fields = [{key:'First Name',label:'First name',page:2},...data.fields];
    fields.splice(fields.findIndex(f => f.key === 'Date of Birth'),0,{key:'SSN',label:'SSN - full number or last four digits',page:2});
    try { profiles = JSON.parse(localStorage.getItem(storageKey) || '{}'); if (!profiles || typeof profiles !== 'object' || Array.isArray(profiles)) profiles = {}; }
    catch { profiles = {}; message('Saved profiles could not be read. You can still fill and download the form.',true); }
    listProfiles(); draw(); $('uploadText').disabled = false; $('textTemplate').disabled = false;
    $('download').disabled = false;
    $('uploadState').textContent = 'Ready to upload a text file.';
  } catch(e) {
    message(e.message,true); $('download').disabled = true;
    $('uploadState').textContent = `Form loading failed: ${e.message}. Check your connection and retry.`;
    $('retryLoad').hidden = false;
  }
}
$('retryLoad').onclick = initializeApp;
initializeApp();
