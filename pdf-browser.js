/* PDF generation runs entirely in the visitor's browser. */
async function createFilledPDF(values, slots, template, paymentDates = [], paymentAmount = '', paymentStatus = 'Pending') {
  const {PDFDocument, StandardFonts, rgb} = PDFLib;
  let ssn = (values.SSN || '').trim();
  if (ssn && !/^(?:[0-9]{4}|[0-9]{9}|[0-9]{3}-[0-9]{2}-[0-9]{4})$/.test(ssn)) {
    throw new Error('Enter the last four SSN digits or the full nine-digit SSN (123-45-6789).');
  }
  if (ssn.length === 4) ssn = 'XXX-XX-' + ssn;
  else if (ssn.length === 9) ssn = `${ssn.slice(0,3)}-${ssn.slice(3,5)}-${ssn.slice(5)}`;
  const name = ['First Name','Middle Name','Last Name','Name Suffix'].map(k => (values[k] || '').trim()).filter(v => v && v.toUpperCase() !== 'N/A').join(' ');
  const doc = await PDFDocument.load(template);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  for (const slot of slots) {
    const value = (slot.key === "Borrower's Name" ? name : slot.key === "Borrower's SSN" ? ssn : values[slot.key] || '').trim();
    if (!value) continue;
    const [x0,y0,x1,y1] = slot.rect;
    const width = x1-x0-4, height = y1-y0-1;
    let fitted;
    try {
      for (let size=10; size>=6; size-=0.5) {
        const lines = [];
        for (const paragraph of value.split(/\r?\n/)) {
          let line = '';
          for (const word of paragraph.split(/\s+/)) {
            if (line && font.widthOfTextAtSize(`${line} ${word}`,size) > width) { lines.push(line); line = ''; }
            line = line ? `${line} ${word}` : word;
          }
          lines.push(line);
        }
        if (lines.every(line => font.widthOfTextAtSize(line,size)<=width) && lines.length*size*1.2 <= height) { fitted={lines,size}; break; }
      }
    } catch { throw new Error(`Unsupported character in "${slot.key}". Please use standard Latin characters.`); }
    if (!fitted) throw new Error(`Text is too long for "${slot.key}" on page ${slot.page+1}. Please shorten it.`);
    fitted.lines.forEach((line,i) => pages[slot.page].drawText(line,{x:x0+2,y:pages[slot.page].getHeight()-y0-1-fitted.size-i*fitted.size*1.2,size:fitted.size,font,color:rgb(0,0,0)}));
  }
  const selectedDates = paymentDates.map((date, index) => ({date, number: index + 1})).filter(entry => entry.date);
  if (selectedDates.length || paymentAmount !== '') {
    const page = doc.addPage([612, 792]);
    page.drawText('Payment details', {x: 42, y: 746, size: 20, font});
    page.drawText('For your records', {x: 42, y: 725, size: 10, font});
    if (paymentAmount !== '') {
      const amount = Number(paymentAmount).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
      page.drawText(`Total payment amount: USD ${amount}`, {x: 42, y: 702, size: 11, font});
    }
    page.drawText(`Payment status: ${paymentStatus === 'Cleared' ? 'Cleared' : 'Pending'}`, {x: 42, y: 684, size: 11, font});
    // Three columns of 40 rows keep all 120 supported dates on the final page.
    selectedDates.forEach(({date, number}, index) => {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
      const formatted = match ? `${match[2]}/${match[3]}/${match[1]}` : date;
      const column = Math.floor(index / 40);
      const row = index % 40;
      page.drawText(`Payment ${number}: ${formatted}`, {
        x: 42 + column * 180, y: 660 - row * 15, size: 10, font
      });
    });
  }
  return doc.save();
}
if (typeof module !== 'undefined') module.exports = {createFilledPDF};
