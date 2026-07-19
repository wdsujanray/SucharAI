import { createOutputBlob } from './src/components/converterUtils.ts';
import fs from 'fs';

const fileBuffer = fs.readFileSync('./tmp-office-test/sample.docx');
const file = new File([fileBuffer], 'sample.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
const blob = await createOutputBlob(file, 'pdf', '#10b981', true);
console.log(JSON.stringify({ type: blob.type, size: blob.size }));
fs.writeFileSync('./tmp-office-test/sample-output.pdf', Buffer.from(await blob.arrayBuffer()));
