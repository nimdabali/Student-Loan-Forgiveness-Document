'use strict';
const assert = require('node:assert/strict');
const {parseTextDetails} = require('./text-import.js');
const fields = [{key: 'First Name', label: 'First name'}, {key: 'SSN', label: 'SSN'}, ...require('./docs/schema.json').fields];
const parse = text => parseTextDetails(text, fields);
const result = parse('\ufeffFirst Name: Alex\r\nLast Name = Sample\r\nDOB: 01/02/1990\r\nSSN: 0123\r\nEmail: alex@example.com\r\nReference 1 First Name: Pat\r\nReference 2 City: Albany\r\nCity: Boston\r\nMailing City: Cambridge\r\nUnknown: ignored');
assert.equal(result.values['First Name'], 'Alex');
assert.equal(result.values['Date of Birth'], '01/02/1990');
assert.equal(result.values.SSN, '0123');
assert.equal(result.values['First Name_2'], 'Pat');
assert.equal(result.values.City_5, 'Albany');
assert.equal(result.values.City, 'Boston');
assert.equal(result.values.City_2, 'Cambridge');
assert.equal(result.issues.length, 1);
assert.throws(() => parse('First Name: Alex\nFirst Name: Sam'), /repeated field/);
assert.throws(() => parse('Phone: 123\nPhone Number: 456'), /repeated field/);
assert.throws(() => parse(''), /empty/);
assert.throws(() => parse('unstructured text'), /No details/);
assert.throws(() => parse('First Name: A\u0000'), /UTF-8/);
assert.equal(parse('First Name: Alex\nSSN: 123').values.SSN, undefined);
assert.equal(parse('First Name: Alex\nLast Name: ' + 'x'.repeat(251)).issues.length, 1);
assert.equal(parse('First Name: Second').values.SSN, undefined);
// Every exact field key, including numbered reference and loan fields, round-trips.
for (const field of fields) {
  const value = field.key === 'SSN' ? '0123' : 'Sample';
  assert.equal(parse(`${field.key}: ${value}`).values[field.key], value, field.key);
}
console.log('Text import checks passed.');
const aid = `File Source:National Student Loan Data System (NSLDS)
Student First Name:Alex
Student Last Name:Sample
Student Street Address 1:123 Example St
Student Street Address 2:Apt 2
Student Home Phone Number:2025550100
Student Cell Phone Number:2025550101
Student Cell Phone Preferred:Yes
Loan Type Code:D2
Loan Outstanding Principal Balance:$0.00
Loan Outstanding Interest Balance:$0.00
Loan Type Code:D5
Loan Type Description:Example loan
Loan Award ID:masked-award-id
Loan Outstanding Principal Balance:$1,200.01
Loan Outstanding Interest Balance:$12.02
Loan Status:RP
Loan Status:FB
Loan Contact Type:Previous Servicer
Loan Contact Name:Old servicer
Loan Contact Type:Current ED Servicer
Loan Contact Name:Example servicer
Loan Contact Street Address 1:42 Example Rd
Most Relevant:Yes`;
const imported = parse(aid);
assert.equal(imported.values['Phone Number'], '2025550101');
assert.equal(imported.values['Alternate Phone Number'], '2025550100');
assert.equal(imported.values['Permanent Address'], '123 Example St, Apt 2');
assert.equal(imported.values.SSN, undefined);
assert.equal(imported.loans.length, 1);
assert.equal(imported.loans[0].balance, '1212.03');
assert.equal(imported.loans[0].servicer, 'Example servicer, 42 Example Rd');
assert.equal(Object.keys(imported.values).some(k => /Loan Account/.test(k)), false);
assert.throws(() => parse(aid + '\nStudent First Name:Another'), /Repeated student/);
assert.equal(parse(aid.replace('$1,200.01', 'invalid')).issues.length, 1);
assert.equal(parse(aid.replace('$1,200.01', '$0.00')).loans.length, 1); // Interest-only debt remains visible.
assert.equal(parse(aid.replace(/Student .*Phone.*\n/g, '')).values['Phone Number'], undefined);
assert.equal(parse('First Name: Another').loans, undefined);
console.log('Student-aid import checks passed.');
