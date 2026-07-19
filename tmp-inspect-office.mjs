import fs from 'node:fs';
import JSZip from 'jszip';

function decodeXmlText(value) {
    return value
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'");
}

function collectXmlTextMatches(xml, patterns) {
    const chunks = [];
    patterns.forEach((pattern) => {
        Array.from(xml.matchAll(pattern)).forEach((match) => {
            const value = decodeXmlText(match[1] || '');
            const normalized = value.replace(/\s+/g, ' ').trim();
            if (normalized) chunks.push(normalized);
        });
    });
    return chunks;
}

async function extractOfficeTextLocally(filePath) {
    const arrayBuffer = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(arrayBuffer);
    const xmlFiles = Object.keys(zip.files).filter((name) => name.endsWith('.xml') && name.startsWith('word/'));
    const chunks = [];
    for (const fileName of xmlFiles) {
        const xml = await zip.file(fileName)?.async('string');
        if (!xml) continue;
        chunks.push(...collectXmlTextMatches(xml, [/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/gi, /<w:instrText(?:\s[^>]*)?>([\s\S]*?)<\/w:instrText>/gi, /<vt:lpstr(?:\s[^>]*)?>([\s\S]*?)<\/vt:lpstr>/gi, /<vt:lpwstr(?:\s[^>]*)?>([\s\S]*?)<\/vt:lpwstr>/gi]));
    }
    return chunks.join('\n').trim();
}

const filePath = './tmp-office-test/sample.docx';
const text = await extractOfficeTextLocally(filePath);
console.log(text.slice(0, 800));
