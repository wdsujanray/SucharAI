import JSZip from "jszip";
import * as XLSX from "xlsx";
import mammoth from "mammoth";

function decodeXmlEntities(value: string) {
    return value
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'");
}

function normalizeWhitespace(value: string) {
    return value.replace(/\s+/g, " ").trim();
}

function collectXmlText(xml: string, tagPatterns: RegExp[]) {
    const chunks: string[] = [];
    tagPatterns.forEach((tagPattern) => {
        const matches = Array.from(xml.matchAll(tagPattern));
        matches.forEach((match) => {
            const decoded = decodeXmlEntities(match[1] || "");
            const normalized = normalizeWhitespace(decoded);
            if (normalized) chunks.push(normalized);
        });
    });
    return chunks;
}

export async function extractTextFromDocx(buffer: Buffer) {
    try {
        const mammothResult = await mammoth.extractRawText({ buffer });
        const extracted = String(mammothResult.value || "").trim();
        if (extracted) {
            return extracted;
        }
    } catch {
        // Fall back to the XML extraction below.
    }

    const zip = await JSZip.loadAsync(buffer);
    const xmlFiles = Object.keys(zip.files).filter((name) => name.endsWith(".xml") && name.startsWith("word/"));

    const chunks: string[] = [];
    for (const fileName of xmlFiles) {
        const xml = await zip.file(fileName)?.async("string");
        if (!xml) continue;
        chunks.push(...collectXmlText(xml, [/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/gi, /<w:instrText(?:\s[^>]*)?>([\s\S]*?)<\/w:instrText>/gi, /<vt:lpstr(?:\s[^>]*)?>([\s\S]*?)<\/vt:lpstr>/gi, /<vt:lpwstr(?:\s[^>]*)?>([\s\S]*?)<\/vt:lpwstr>/gi]));
    }

    return chunks.join("\n").trim();
}

export async function extractTextFromPptx(buffer: Buffer) {
    const zip = await JSZip.loadAsync(buffer);
    const slideFiles = Object.keys(zip.files).filter((name) => /ppt\/(?:slides\/slide\d+\.xml|notesSlides\/.*\.xml)$/i.test(name));

    const chunks: string[] = [];
    for (const fileName of slideFiles) {
        const xml = await zip.file(fileName)?.async("string");
        if (!xml) continue;
        chunks.push(...collectXmlText(xml, [/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/gi, /<a:fld(?:\s[^>]*)?>([\s\S]*?)<\/a:fld>/gi]));
    }

    return chunks.join("\n").trim();
}

export function extractTextFromXlsx(buffer: Buffer) {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const chunks: string[] = [];

    workbook.SheetNames.forEach((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as Array<Array<string | number | boolean | null>>;
        rows.forEach((row) => {
            const values = row
                .filter((value) => value !== null && value !== undefined && value !== "")
                .map((value) => String(value))
                .filter(Boolean);
            if (values.length > 0) {
                chunks.push(values.join(" | "));
            }
        });
    });

    return chunks.join("\n").trim();
}

export async function extractTextFromOfficeBuffer(buffer: Buffer, filename: string) {
    const ext = (filename.split(".").pop() || "").toLowerCase();
    if (["docx", "doc"].includes(ext)) {
        return extractTextFromDocx(buffer);
    }
    if (["xlsx", "xls"].includes(ext)) {
        return extractTextFromXlsx(buffer);
    }
    if (["pptx", "ppt"].includes(ext)) {
        return extractTextFromPptx(buffer);
    }
    return "";
}
