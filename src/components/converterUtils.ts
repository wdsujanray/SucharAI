import { Document, Packer, Paragraph, TextRun } from "docx";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import PptxGenJS from "pptxgenjs";
import mammoth from "mammoth";
import { api } from "../store.js";

export interface ConversionOption {
    id: string;
    label: string;
    target: string;
}

export const SUPPORTED_CONVERTER_EXTENSIONS = ["jpg", "jpeg", "png", "pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx"];
export const SUPPORTED_FILE_ACCEPT = SUPPORTED_CONVERTER_EXTENSIONS.map((extension) => `.${extension}`).join(",");

export function getFileExtension(fileName: string) {
    return (fileName.split(".").pop() || "").toLowerCase();
}

export function getFileCategory(fileName: string) {
    const ext = getFileExtension(fileName);
    if (["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp", "tiff", "tif"].includes(ext)) return "image";
    if (["pdf"].includes(ext)) return "pdf";
    if (["doc", "docx"].includes(ext)) return "docx";
    if (["ppt", "pptx"].includes(ext)) return "ppt";
    if (["xls", "xlsx"].includes(ext)) return "xlsx";
    return "other";
}

export function supportsEditorWorkflow(fileName: string | null | undefined) {
    if (!fileName) return false;
    const ext = getFileExtension(fileName);
    return ["pdf", "doc", "docx", "ppt", "pptx"].includes(ext);
}

function sanitizeVisibleText(value: string) {
    const cleaned = String(value || "")
        .replace(/\r\n/g, "\n")
        .replace(/\u0000/g, " ")
        .replace(/\u00a0/g, " ")
        .replace(/[\u200B-\u200D\u2060]/g, "")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .split("\n")
        .map((line) => line.replace(/^[\s\W_]+|[\s\W_]+$/g, " ").trim())
        .filter((line) => {
            const trimmed = line.trim();
            if (!trimmed) return false;
            if (/^(?:<!doctype|doctype|html|body|head|meta|link|script|style|svg|path|rect|circle|ellipse|g|defs|div|span|p|a|li|ul|ol|table|tr|td|th|section|article|header|footer)\b/i.test(trimmed) && /[:;{}]/.test(trimmed)) return false;
            if (/^\.[\w-]+|^#[\w-]+|^@media|^@import/i.test(trimmed)) return false;
            return true;
        })
        .join("\n")
        .replace(/[ \t]{2,}/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

    return cleaned || "No readable text could be extracted from this file.";
}

function looksLikeExtractedText(value: string) {
    return Boolean(value && value.trim() && !/(unable to extract|could not extract|no readable content|no extractable text|not yield any extractable)/i.test(value));
}

function sanitizePdfText(value: string) {
    return String(value || "")
        .replace(/\r\n/g, "\n")
        .replace(/\u0000/g, " ")
        .replace(/\u00a0/g, " ")
        .replace(/[\u200B-\u200D\u2060]/g, "")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\x00-\x7F]/g, " ")
        .replace(/[^\t\n\r\x20-\x7E]/g, " ")
        .split("\n")
        .map((line) => line.replace(/\s+/g, " ").trim())
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim() || "No readable text could be extracted from this file.";
}

function decodeXmlText(value: string) {
    return value
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'");
}

function collectXmlTextMatches(xml: string, patterns: RegExp[]) {
    const chunks: string[] = [];
    patterns.forEach((pattern) => {
        Array.from(xml.matchAll(pattern)).forEach((match) => {
            const value = decodeXmlText(match[1] || "");
            const normalized = value.replace(/\s+/g, " ").trim();
            if (normalized) chunks.push(normalized);
        });
    });
    return chunks;
}

async function extractOfficeTextLocally(file: File) {
    const extension = getFileExtension(file.name);
    const arrayBuffer = await file.arrayBuffer();

    if (["docx", "doc"].includes(extension)) {
        try {
            const mammothResult = await mammoth.extractRawText({ arrayBuffer });
            const extractedText = sanitizeVisibleText(mammothResult.value || "");
            if (looksLikeExtractedText(extractedText)) {
                return extractedText;
            }
        } catch {
            // Fall back to the XML-based extractor below.
        }

        try {
            const zip = await JSZip.loadAsync(arrayBuffer);
            const xmlFiles = Object.keys(zip.files).filter((name) => name.endsWith(".xml") && name.startsWith("word/"));
            const chunks: string[] = [];
            for (const fileName of xmlFiles) {
                const xml = await zip.file(fileName)?.async("string");
                if (!xml) continue;
                chunks.push(...collectXmlTextMatches(xml, [/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/gi, /<w:instrText(?:\s[^>]*)?>([\s\S]*?)<\/w:instrText>/gi, /<vt:lpstr(?:\s[^>]*)?>([\s\S]*?)<\/vt:lpstr>/gi, /<vt:lpwstr(?:\s[^>]*)?>([\s\S]*?)<\/vt:lpwstr>/gi]));
            }
            return chunks.join("\n").trim();
        } catch {
            return "";
        }
    }

    if (["pptx", "ppt"].includes(extension)) {
        try {
            const zip = await JSZip.loadAsync(arrayBuffer);
            const slideFiles = Object.keys(zip.files).filter((name) => /ppt\/(?:slides\/slide\d+\.xml|slides\/slide\d+\.xml|notesSlides\/.*\.xml)$/i.test(name));
            const chunks: string[] = [];
            for (const fileName of slideFiles) {
                const xml = await zip.file(fileName)?.async("string");
                if (!xml) continue;
                chunks.push(...collectXmlTextMatches(xml, [/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/gi, /<a:fld(?:\s[^>]*)?>([\s\S]*?)<\/a:fld>/gi]));
            }
            return chunks.join("\n").trim();
        } catch {
            return "";
        }
    }

    if (["xlsx", "xls"].includes(extension)) {
        try {
            const workbook = XLSX.read(arrayBuffer, { type: "array" });
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
        } catch {
            return "";
        }
    }

    return "";
}

export async function createTextFromFile(file: File) {
    const extension = getFileExtension(file.name);
    const officeExtensions = new Set(["doc", "docx", "ppt", "pptx", "xls", "xlsx"]);

    if (officeExtensions.has(extension)) {
        const officeText = sanitizeVisibleText(await extractOfficeTextLocally(file));
        if (looksLikeExtractedText(officeText)) {
            return officeText;
        }

        const fallbackText = sanitizeVisibleText(await extractOfficeTextLocally(file));
        if (looksLikeExtractedText(fallbackText)) {
            return fallbackText;
        }

        return "No readable text could be extracted from this file.";
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
        const response = await api.post("/api/fast-convert", formData);
        const extracted = sanitizeVisibleText(String(response.data?.extractedText || ""));
        if (looksLikeExtractedText(extracted)) {
            return extracted;
        }
    } catch (error) {
        console.warn("Fast conversion failed, trying local fallback:", error);
    }

    const textFallbackExtensions = new Set(["txt", "md", "json", "csv", "html", "xml", "rtf", "yaml", "yml", "log"]);
    if (textFallbackExtensions.has(extension)) {
        return await file.text();
    }

    return "No readable text could be extracted from this file.";
}

export async function createZipArchive(outputName: string, outputBlob: Blob) {
    const zip = new JSZip();
    zip.file(outputName, outputBlob);
    return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

export async function createBatchZipArchive(items: Array<{ outputName: string; outputBlob: Blob }>) {
    const zip = new JSZip();
    items.forEach(({ outputName, outputBlob }) => {
        zip.file(outputName, outputBlob);
    });
    return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

export function createTextBlob(text: string, extension: string) {
    const normalized = sanitizeVisibleText(text || "No text extracted.");
    const mimeType = extension === "md" ? "text/markdown" : extension === "html" ? "text/html" : "text/plain";
    return new Blob([normalized], { type: mimeType });
}

export async function createDocxBlob(text: string, accentColor: string, applyTheme: boolean) {
    const sanitizedText = sanitizeVisibleText(text || "No text extracted.");
    const doc = new Document({
        sections: [{
            properties: {},
            children: [
                new Paragraph({
                    children: [new TextRun({ text: "SucharAI File Converter", bold: true, size: 34, color: applyTheme ? accentColor : "1F2937" })],
                    spacing: { after: 240 },
                }),
                new Paragraph({
                    children: [new TextRun({ text: sanitizedText, size: 24, color: "000000" })],
                    spacing: { after: 200 },
                }),
            ],
        }],
    });

    const buffer = await Packer.toBuffer(doc);
    const docxBytes = new Uint8Array(buffer);
    return new Blob([docxBytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

function toArrayBuffer(bytes: Uint8Array | ArrayBuffer): ArrayBuffer {
    if (bytes instanceof ArrayBuffer) return bytes;
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    return buffer;
}

export async function createPdfBlob(text: string, accentColor: string, applyTheme: boolean) {
    const pdfDoc = await PDFDocument.create();
    const pageWidth = 816;
    const pageHeight = 1056;
    const baseText = sanitizePdfText(text || "No text extracted.");
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const marginX = 72;
    const marginY = 72;
    const lineHeight = 14;
    const paragraphGap = 8;
    const maxLineWidth = pageWidth - marginX * 2;

    const normalizeLine = (line: string) => line.replace(/\s+/g, " ").trim();

    const wrapParagraph = (paragraph: string) => {
        const words = paragraph.split(/(\s+)/).filter(Boolean).map((word) => normalizeLine(word));
        const lines: string[] = [];
        let current = "";
        words.forEach((word) => {
            const candidate = current ? `${current}${word}` : word;
            if (!candidate || font.widthOfTextAtSize(candidate, 12) <= maxLineWidth || !current) {
                current = candidate;
            } else {
                lines.push(current);
                current = word;
            }
        });
        if (current) lines.push(current);
        return lines.filter(Boolean);
    };

    const paragraphs = baseText.split(/\n{2,}/).filter(Boolean);
    const contentLines: string[] = [];

    if (paragraphs.length > 0) {
        paragraphs.forEach((paragraph) => {
            contentLines.push(...wrapParagraph(paragraph));
            contentLines.push("");
        });
    } else {
        contentLines.push(...wrapParagraph(baseText));
    }

    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    let y = pageHeight - marginY;

    const drawLine = (line: string, size: number, drawFont: any, color: [number, number, number], addGap = false) => {
        const safeLine = normalizeLine(line);
        if (!safeLine && line !== "") {
            return;
        }
        if (y < marginY) {
            page = pdfDoc.addPage([pageWidth, pageHeight]);
            y = pageHeight - marginY;
        }
        page.drawText(safeLine || " ", {
            x: marginX,
            y,
            size,
            font: drawFont,
            color: rgb(color[0], color[1], color[2]),
        });
        y -= lineHeight * (size >= 16 ? 1.2 : 1);
        if (addGap) {
            y -= paragraphGap;
        }
    };

    drawLine("SucharAI Document Export", 16, boldFont, [0.06, 0.07, 0.11]);
    drawLine("", 12, font, [0.06, 0.07, 0.11]);

    contentLines.forEach((line, index) => {
        if (!line.trim()) {
            drawLine("", 12, font, [0.06, 0.07, 0.11], true);
            return;
        }
        const isParagraphStart = index > 0 && contentLines[index - 1].trim() === "";
        drawLine(line, 12, font, [0.06, 0.07, 0.11], isParagraphStart);
    });

    const pdfBytes = await pdfDoc.save();
    return new Blob([toArrayBuffer(pdfBytes)], { type: "application/pdf" });
}

export async function createImageBlobFromFile(file: File, target: string) {
    const imageUrl = URL.createObjectURL(file);
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("The selected image could not be loaded."));
        img.src = imageUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available in this browser.");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    const mimeType = target === "jpg" ? "image/jpeg" : target === "webp" ? "image/webp" : target === "png" ? "image/png" : target === "svg" ? "image/svg+xml" : "image/png";
    if (target === "svg") {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${image.width}" height="${image.height}"><image href="${imageUrl}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" /></svg>`;
        URL.revokeObjectURL(imageUrl);
        return new Blob([svg], { type: "image/svg+xml" });
    }

    return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
            URL.revokeObjectURL(imageUrl);
            if (!blob) reject(new Error("Image conversion failed"));
            else resolve(blob);
        }, mimeType, 0.92);
    });
}

export async function createImageBlobFromText(text: string, target: string, accentColor: string, applyTheme: boolean) {
    const canvas = document.createElement("canvas");
    canvas.width = 1400;
    canvas.height = 1800;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available in this browser.");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (applyTheme) {
        ctx.fillStyle = accentColor;
        ctx.fillRect(0, 0, canvas.width, 240);
    }

    ctx.fillStyle = "#111827";
    ctx.font = "bold 56px sans-serif";
    ctx.fillText("SucharAI Converter", 70, 120);
    ctx.font = "24px sans-serif";
    ctx.fillStyle = "#475569";
    ctx.fillText("Converted from uploaded content", 70, 170);

    ctx.fillStyle = "#0f172a";
    ctx.font = "32px sans-serif";
    ctx.fillText(`Output: ${target.toUpperCase()}`, 70, 320);

    ctx.font = "24px sans-serif";
    const words = (text || "No text extracted.").split(/(\s+)/).filter(Boolean);
    const lines: string[] = [];
    let current = "";
    words.forEach((word) => {
        const candidate = current ? `${current} ${word}` : word;
        if (ctx.measureText(candidate).width <= 1100 || current.length === 0) {
            current = candidate;
        } else {
            lines.push(current);
            current = word;
        }
    });
    if (current) lines.push(current);

    let y = 390;
    lines.slice(0, 40).forEach((line) => {
        ctx.fillText(line, 70, y);
        y += 34;
    });

    const mimeType = target === "jpg" ? "image/jpeg" : target === "webp" ? "image/webp" : "image/png";
    return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (!blob) reject(new Error("Image conversion failed"));
            else resolve(blob);
        }, mimeType, 0.92);
    });
}

export async function createSvgBlob(text: string, accentColor: string, applyTheme: boolean) {
    const body = (text || "No text extracted.").split(/\n/).slice(0, 28).map((line, index) => `<text x="40" y="${120 + index * 28}" font-size="22" fill="#0f172a">${line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</text>`).join("");
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="1400" height="1800">
    <rect width="100%" height="100%" fill="#ffffff" />
    <rect x="0" y="0" width="1400" height="220" fill="${applyTheme ? accentColor : "#10b981"}" />
    <text x="40" y="110" font-family="Arial" font-size="48" font-weight="700" fill="#ffffff">SucharAI Converter</text>
    <text x="40" y="155" font-family="Arial" font-size="24" fill="#f8fafc">Converted from uploaded content</text>
    <text x="40" y="300" font-family="Arial" font-size="28" font-weight="600" fill="#0f172a">SVG export</text>
    ${body}
  </svg>`;
    return new Blob([svg], { type: "image/svg+xml" });
}

export async function createXlsxBlob(text: string) {
    const sanitizedText = sanitizeVisibleText(text || "No text extracted.");
    const rows = sanitizedText.split(/\n/).slice(0, 80).map((line) => [line]);
    const worksheet = XLSX.utils.aoa_to_sheet([["SucharAI Converter"], ["Converted content"], ...rows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Converted");
    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const xlsxBytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer as ArrayLike<number>);
    return new Blob([xlsxBytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export async function createPptxBlob(text: string, accentColor: string, applyTheme: boolean) {
    const sanitizedText = sanitizeVisibleText(text || "No text extracted.");
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_16x9";
    const slide = pptx.addSlide();
    slide.background = { color: "F8FAFC" };
    slide.addShape(pptx.ShapeType.rect, { x: 0.5, y: 0.3, w: 10.5, h: 0.2, fill: { color: applyTheme ? accentColor.replace("#", "") : "10B981" } });
    slide.addText("SucharAI File Converter", { x: 0.7, y: 0.6, fontFace: "Arial", fontSize: 24, bold: true, color: "0F172A" });
    slide.addText(sanitizedText.split(/\n/).slice(0, 12).join("\n"), {
        x: 0.7,
        y: 1.5,
        w: 9.5,
        h: 5.7,
        fontFace: "Arial",
        fontSize: 18,
        color: "334155",
        breakLine: true,
        margin: 0.1,
    });

    const pptxBuffer = await pptx.write({ outputType: "nodebuffer" as any });
    const pptxBytes = new Uint8Array(pptxBuffer as Uint8Array | ArrayBuffer);
    return new Blob([pptxBytes], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
}

export async function createPdfBlobFromImage(file: File) {
    const imageUrl = URL.createObjectURL(file);
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("The selected image could not be loaded."));
        img.src = imageUrl;
    });

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([image.width, image.height]);
    const imageBytes = await file.arrayBuffer();
    const embeddedImage = file.type === "image/png"
        ? await pdfDoc.embedPng(imageBytes)
        : await pdfDoc.embedJpg(imageBytes);

    page.drawImage(embeddedImage, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
    const pdfBytes = await pdfDoc.save();
    URL.revokeObjectURL(imageUrl);
    return new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" });
}

export interface CombineLayoutOptions {
    pageSize: "A4" | "A3" | "Letter" | "Legal" | "Custom";
    widthMm?: number;
    heightMm?: number;
    maxFileSizeMb?: number;
    resolutionDpi?: number;
    quality?: number;
}

export async function createPdfBlobFromImagesWithOptions(files: File[], options: CombineLayoutOptions) {
    const pdfDoc = await PDFDocument.create();
    const pageWidth = (options.widthMm || 210) / 25.4 * 72;
    const pageHeight = (options.heightMm || 297) / 25.4 * 72;
    const dpi = Math.max(96, Math.min(options.resolutionDpi || 220, 600));
    const quality = Math.max(0.4, Math.min(options.quality || 0.9, 1));

    for (const file of files) {
        const imageBytes = await file.arrayBuffer();
        const isPng = file.type === "image/png" || /\.png$/i.test(file.name);
        const embeddedImage = isPng ? await pdfDoc.embedPng(imageBytes) : await pdfDoc.embedJpg(imageBytes);
        const page = pdfDoc.addPage([pageWidth, pageHeight]);

        const imageWidthPoints = embeddedImage.width / (dpi / 72);
        const imageHeightPoints = embeddedImage.height / (dpi / 72);
        const scale = Math.min(page.getWidth() / imageWidthPoints, page.getHeight() / imageHeightPoints) * 0.9;
        const drawWidth = imageWidthPoints * scale;
        const drawHeight = imageHeightPoints * scale;

        page.drawImage(embeddedImage, {
            x: (page.getWidth() - drawWidth) / 2,
            y: (page.getHeight() - drawHeight) / 2,
            width: drawWidth,
            height: drawHeight,
        });
    }

    const pdfBytes = await pdfDoc.save();
    return new Blob([toArrayBuffer(pdfBytes)], { type: "application/pdf" });
}

export async function createPdfBlobFromImages(files: File[]) {
    return createPdfBlobFromImagesWithOptions(files, { pageSize: "A4", widthMm: 210, heightMm: 297, resolutionDpi: 220, quality: 0.9 });
}

export async function createOutputBlob(file: File, target: string, accentColor: string, applyTheme: boolean) {
    const isImageFile = file.type.startsWith("image/") || /\.(png|jpg|jpeg|gif|webp|svg|ico|bmp|tiff|tif)$/i.test(file.name);
    if (isImageFile && target === "pdf") {
        return createPdfBlobFromImage(file);
    }

    if (isImageFile && ["png", "jpg", "webp", "svg"].includes(target)) {
        return createImageBlobFromFile(file, target);
    }

    const text = await createTextFromFile(file);
    switch (target) {
        case "pdf":
        case "pdf-layout":
            return createPdfBlob(text, accentColor, applyTheme);
        case "docx":
            return createDocxBlob(text, accentColor, applyTheme);
        case "txt":
            return createTextBlob(text, "txt");
        case "md":
            return createTextBlob(text, "md");
        case "html":
            return createTextBlob(`<h1>SucharAI Converter</h1><p>${text.replace(/\n/g, "<br />")}</p>`, "html");
        case "png":
        case "jpg":
        case "webp":
            return createImageBlobFromText(text, target, accentColor, applyTheme);
        case "svg":
            return createSvgBlob(text, accentColor, applyTheme);
        case "xlsx":
            return createXlsxBlob(text);
        case "pptx":
            return createPptxBlob(text, accentColor, applyTheme);
        default:
            return createTextBlob(text, "txt");
    }
}
