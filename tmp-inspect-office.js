const fs = require('fs');
const JSZip = require('jszip');
const file = 'tmp-office-test/sample.docx';
(async () => {
  const buffer = fs.readFileSync(file);
  const zip = await JSZip.loadAsync(buffer);
  console.log('entries', Object.keys(zip.files).length);
  const xmlFiles = Object.keys(zip.files).filter((name) => name.endsWith('.xml') && name.startsWith('word/'));
  console.log('word xml', xmlFiles.slice(0,10));
  for (const name of xmlFiles.slice(0,5)) {
    const xml = await zip.file(name).async('string');
    console.log('---', name, '---');
    console.log(xml.slice(0, 400));
  }
})();
