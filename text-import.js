'use strict';

// Match explicit labels only; never guess identities or combine borrowers.
function parseTextDetails(text, fields) {
  if (!text.trim()) throw new Error('This text file is empty.');
  if (/[\u0000-\u0008\u000e-\u001f\ufffd]/.test(text)) throw new Error('Please upload a plain UTF-8 text file.');
  if (/^Student First Name:/im.test(text) && /^File Source:.*NSLDS/im.test(text)) return parseStudentAid(text, fields);
  const normalize = label => label.toLowerCase().replace(/[^a-z0-9]/g, '');
  const keys = new Map(fields.map(f => [normalize(f.key), f.key]));
  const labels = new Map();
  for (const f of fields) {
    const label = normalize(f.label);
    labels.set(label, labels.has(label) ? null : f.key);
  }
  for (const [label, key] of labels) if (key && !keys.has(label)) keys.set(label, key);
  const aliases = {
    dob: 'Date of Birth', birthdate: 'Date of Birth', socialsecuritynumber: 'SSN',
    last4ssn: 'SSN', ssnlast4: 'SSN', email: 'Email Address', phone: 'Phone Number',
    mobile: 'Phone Number', cellphone: 'Phone Number', address: 'Permanent Address',
    streetaddress: 'Permanent Address', zip: 'Zip Code', zipcode: 'Zip Code',
    employer: 'Employers Name', mailingaddress: 'Mailing Address if different from permanent address',
    mailingcity: 'City_2', mailingstate: 'State_2', mailingzip: 'Zip Code_2',
    mailingzipcode: 'Zip Code_2', employercity: 'City_3', employerstate: 'State_3', employerzip: 'Zip Code_3'
  };
  for (let n = 1; n <= 2; n++) {
    for (const key of ['First Name', 'Middle Name', 'Last Name', 'Name Suffix', 'Permanent Address', 'Phone Number', 'Email Address']) {
      aliases[normalize(`Reference ${n} ${key}`)] = `${key}_${n + 1}`;
    }
    for (const key of ['City', 'State', 'Zip Code']) aliases[normalize(`Reference ${n} ${key}`)] = `${key}_${n + 3}`;
    aliases[`reference${n}relationship`] = `Relationship to You${n === 1 ? '' : '_2'}`;
  }
  for (const [alias, key] of Object.entries(aliases)) if (fields.some(f => f.key === key)) keys.set(alias, key);
  const values = {}, issues = [];
  text.replace(/^\ufeff/, '').split(/\r\n?|\n/).forEach((line, index) => {
    if (!line.trim() || line.trim().startsWith('#')) return;
    const match = line.match(/^\s*([^:=]+?)\s*[:=]\s*(.*?)\s*$/);
    const key = match && keys.get(normalize(match[1]));
    if (!key) { issues.push(`Line ${index + 1}: unrecognized field or missing colon.`); return; }
    if (Object.hasOwn(values, key)) throw new Error(`Line ${index + 1}: repeated field "${key}". Use one borrower per file and unique labels for references and loans.`);
    const value = match[2];
    const limit = /HolderServicer|^Mail pages/.test(key) ? 1000 : 250;
    if (value.length > limit) { issues.push(`Line ${index + 1}: ${key} exceeds ${limit} characters; skipped.`); return; }
    if (key === 'SSN' && value && !/^(?:[0-9]{4}|[0-9]{9}|[0-9]{3}-[0-9]{2}-[0-9]{4})$/.test(value)) {
      issues.push(`Line ${index + 1}: invalid SSN format; skipped.`); return;
    }
    values[key] = value;
  });
  if (!Object.values(values).some(value => value.trim())) throw new Error('No details recognized. Use one field per line, such as First Name: Alex.');
  return {values, issues};
}

function parseStudentAid(text, fields) {
  const student = new Map(), loans = [];
  let loan = null, contact = null;
  for (const line of text.replace(/^\ufeff/, '').split(/\r\n?|\n/)) {
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim(), value = line.slice(colon + 1).trim();
    if (key.startsWith('Student ')) {
      if (student.has(key)) throw new Error('Repeated student details. Upload one student-aid export per borrower.');
      student.set(key, value);
    }
    if (key === 'Loan Type Code') { loan = {data: new Map(), contacts: []}; loans.push(loan); contact = null; }
    if (/^(Grant Type Code|Program School Name|Award School Name|Enrolled School Name)$/.test(key)) { loan = null; contact = null; }
    if (!loan) continue;
    if (key === 'Loan Contact Type') { contact = new Map(); loan.contacts.push(contact); }
    if (contact && (key.startsWith('Loan Contact ') || key === 'Most Relevant')) contact.set(key, value);
    else if (!loan.data.has(key)) loan.data.set(key, value);
  }
  const values = {}, issues = [], notes = [];
  const put = (key, value) => {
    if (!value || !fields.some(f => f.key === key)) return;
    if (value.length > 250) { issues.push(`${key} is too long; enter it manually.`); return; }
    values[key] = value;
  };
  const mapping = {'Student First Name': 'First Name', 'Student Middle Initial': 'Middle Name', 'Student Last Name': 'Last Name',
    'Student City': 'City', 'Student State Code': 'State', 'Student Zip Code': 'Zip Code', 'Student Email Address': 'Email Address'};
  for (const [source, target] of Object.entries(mapping)) put(target, student.get(source));
  put('Permanent Address', ['Student Street Address 1', 'Student Street Address 2'].map(k => student.get(k)).filter(Boolean).join(', '));
  const phones = ['Cell', 'Home', 'Work'].map(type => ({type, number: student.get(`Student ${type} Phone Number`),
    country: student.get(`Student ${type} Phone Country Code`), preferred: /^yes$/i.test(student.get(`Student ${type} Phone Preferred`) || '')})).filter(p => p.number);
  phones.sort((a, b) => Number(b.preferred) - Number(a.preferred));
  const phoneValue = p => p.country && p.country !== '1' ? `+${p.country} ${p.number}` : p.number;
  if (phones[0]) put('Phone Number', phoneValue(phones[0]));
  const alternate = phones.find(p => p.number !== phones[0].number);
  if (alternate) put('Alternate Phone Number', phoneValue(alternate));
  const work = phones.find(p => p.type === 'Work');
  if (work) put('Work Phone Number', phoneValue(work));
  const cents = value => {
    if (!/^\$?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{2})?$/.test(value || '')) return null;
    return Math.round(Number(value.replace(/[$,]/g, '')) * 100);
  };
  const outstanding = [];
  let closed = 0;
  loans.forEach(({data, contacts}, index) => {
    const principal = cents(data.get('Loan Outstanding Principal Balance')), interest = cents(data.get('Loan Outstanding Interest Balance'));
    if (principal === 0 && interest === 0) { closed++; return; }
    if (principal === null || interest === null) { issues.push(`Loan record ${index + 1}: missing or invalid balance; review the source file manually.`); return; }
    const current = contacts.filter(c => /^Current /i.test(c.get('Loan Contact Type') || ''));
    const selected = current.find(c => /^yes$/i.test(c.get('Most Relevant') || '')) || (current.length === 1 ? current[0] : null);
    const servicer = selected ? ['Loan Contact Name', 'Loan Contact Street Address 1', 'Loan Contact Street Address 2', 'Loan Contact City', 'Loan Contact State Code', 'Loan Contact Zip Code', 'Loan Contact Phone Number'].map(k => selected.get(k)).filter(Boolean).join(', ') : '';
    outstanding.push({description: data.get('Loan Type Description') || `Loan record ${index + 1}`, servicer,
      balance: ((principal + interest) / 100).toFixed(2), date: data.get('Loan Outstanding Principal Balance as of Date') || 'date unavailable'});
  });
  notes.push(`Student-aid export: ${loans.length} loan records; ${closed} zero-balance records omitted; ${outstanding.length} outstanding loans available below.`);
  notes.push('SSN, birth date, employer, and references were not imported. Complete missing details manually.');
  notes.push('Loan balances are reported principal plus interest, not payoff quotes. Choose loans below and verify their details. Loan codes and servicer account numbers must be entered manually; NSLDS award IDs are not used as account numbers.');
  if (!Object.keys(values).length) throw new Error('No borrower contact details recognized in this export.');
  return {values, issues, notes, loans: outstanding};
}

if (typeof module !== 'undefined') module.exports = {parseTextDetails};
