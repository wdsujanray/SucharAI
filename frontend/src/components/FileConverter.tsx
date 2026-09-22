import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, FileText, Menu, PencilLine, PlusCircle, Settings, Sparkles, Trash2, UploadCloud, XCircle } from "lucide-react";
import PngToConvert from "./PngToConvert.js";
import JpgToConvert from "./JpgToConvert.js";
import PdfToConvert from "./PdfToConvert.js";
import DocxToConvert from "./DocxToConvert.js";
import PptToConvert from "./PptToConvert.js";
import XlsxToConvert from "./XlsxToConvert.js";
import { createBatchZipArchive, createOutputBlob, createPdfBlobFromImagesWithOptions, SUPPORTED_FILE_ACCEPT, supportsEditorWorkflow, type CombineLayoutOptions } from "./converterUtils.js";
import { useChatStore } from "../store.js";

interface FileConverterProps {
    onBackToChat: () => void;
    onOpenSettings?: () => void;
}

interface HistoryEntry {
    id: string;
    title: string;
    sourceName: string;
    createdAt: string;
    mimeType: string;
    target: string;
    blobDataUrl: string;
    size: number;
}

const ACCEPTED_FILE_TYPES = SUPPORTED_FILE_ACCEPT;

function getFileCategory(fileName: string) {
    const ext = (fileName.split(".").pop() || "").toLowerCase();
    if (ext === "png") return "png";
    if (["jpg", "jpeg"].includes(ext)) return "jpg";
    if (ext === "pdf") return "pdf";
    if (["doc", "docx"].includes(ext)) return "docx";
    if (["ppt", "pptx"].includes(ext)) return "ppt";
    if (["xls", "xlsx"].includes(ext)) return "xlsx";
    return "other";
}

export default function FileConverter({ onBackToChat, onOpenSettings }: FileConverterProps) {
    const { user, isSidebarOpen, setSidebarOpen } = useChatStore();
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [selectedTarget, setSelectedTarget] = useState("pdf");
    const [isDragging, setIsDragging] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
    const [combinePreset, setCombinePreset] = useState<CombineLayoutOptions["pageSize"]>("A4");
    const [combineWidthMm, setCombineWidthMm] = useState(210);
    const [combineHeightMm, setCombineHeightMm] = useState(297);
    const [combineMaxMb, setCombineMaxMb] = useState(5);
    const [combineDpi, setCombineDpi] = useState(220);
    const [combineQuality, setCombineQuality] = useState(0.9);
    const [editorOpen, setEditorOpen] = useState(false);
    const [editorTitle, setEditorTitle] = useState("Edited document");
    const [editorContent, setEditorContent] = useState("");
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const selectedFile = selectedFiles[selectedFiles.length - 1] || null;
    const category = useMemo(() => selectedFile ? getFileCategory(selectedFile.name) : null, [selectedFile]);
    const editorEnabled = useMemo(() => supportsEditorWorkflow(selectedFile?.name), [selectedFile]);
    const storageKey = `sucharai:converter-history:${user?.id ?? "guest"}`;

    useEffect(() => {
        if (typeof window === "undefined") return;
        try {
            const raw = localStorage.getItem(storageKey);
            if (!raw) {
                setHistoryEntries([]);
                return;
            }
            const parsed = JSON.parse(raw);
            setHistoryEntries(Array.isArray(parsed) ? parsed : []);
        } catch {
            setHistoryEntries([]);
        }
    }, [storageKey]);

    const resetState = () => {
        setSelectedFiles([]);
        setError(null);
        setStatusMessage(null);
    };

    const openFilePicker = () => {
        fileInputRef.current?.click();
    };

    const handleFileSelection = (files: FileList | File[] | null) => {
        if (!files || (Array.isArray(files) ? files.length === 0 : files.length === 0)) return;

        const acceptedFiles = Array.from(files).filter((file) => getFileCategory(file.name) !== "other");

        if (acceptedFiles.length === 0) {
            setError("Please upload a supported image, PDF, Word, Excel, or PowerPoint file.");
            return;
        }

        setSelectedFiles((previous) => {
            const merged = [...previous];
            acceptedFiles.forEach((file) => {
                const exists = merged.some((existing) => existing.name === file.name && existing.size === file.size);
                if (!exists) merged.push(file);
            });
            return merged;
        });
        setError(null);
        setStatusMessage(null);
    };

    const handleRemoveFile = (index: number) => {
        setSelectedFiles((previous) => previous.filter((_, currentIndex) => currentIndex !== index));
        setStatusMessage("Removed the selected file. You can add another one anytime.");
    };

    const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error || new Error("Failed to read file blob"));
        reader.readAsDataURL(blob);
    });

    const persistHistoryEntry = async (sourceFiles: File[], outputName: string, outputBlob: Blob, target: string) => {
        const dataUrl = await blobToDataUrl(outputBlob);
        const entry: HistoryEntry = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            title: outputName,
            sourceName: sourceFiles.map((file) => file.name).join(", "),
            createdAt: new Date().toISOString(),
            mimeType: outputBlob.type || "application/octet-stream",
            target,
            blobDataUrl: dataUrl,
            size: outputBlob.size,
        };

        setHistoryEntries((previous) => {
            const nextEntries = [entry, ...previous].slice(0, 12);
            if (typeof window !== "undefined") {
                localStorage.setItem(storageKey, JSON.stringify(nextEntries));
            }
            return nextEntries;
        });
    };

    const downloadHistoryEntry = (entry: HistoryEntry) => {
        const url = entry.blobDataUrl;
        const link = document.createElement("a");
        link.href = url;
        link.download = entry.title;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const removeHistoryEntry = (id: string) => {
        setHistoryEntries((previous) => {
            const nextEntries = previous.filter((entry) => entry.id !== id);
            if (typeof window !== "undefined") {
                localStorage.setItem(storageKey, JSON.stringify(nextEntries));
            }
            return nextEntries;
        });
    };

    const openEditor = async (sourceFile?: File | null) => {
        if (!supportsEditorWorkflow(sourceFile?.name)) {
            setError("The editor workspace is available for PDF and Microsoft Office files only.");
            return;
        }

        let initialText = "";
        if (sourceFile) {
            try {
                initialText = await sourceFile.text();
            } catch {
                initialText = "";
            }
        }
        setEditorTitle(sourceFile?.name || "edited-document.txt");
        setEditorContent(initialText);
        setEditorOpen(true);
    };

    const saveEditorContent = async () => {
        const safeTitle = editorTitle.includes(".") ? editorTitle : `${editorTitle}.txt`;
        const blob = new Blob([editorContent], { type: "text/plain;charset=utf-8" });
        const file = new File([blob], safeTitle, { type: blob.type });
        await persistHistoryEntry([file], safeTitle, blob, "txt");
        setEditorOpen(false);
        setStatusMessage(`Saved ${safeTitle} to your conversion history.`);
    };

    const handleBatchConvert = async () => {
        if (selectedFiles.length === 0) return;

        try {
            setIsProcessing(true);
            setError(null);
            setStatusMessage("Preparing the batch conversion...");

            const fileExtensions = selectedFiles.map((file) => getFileCategory(file.name));
            const isPdfToPngBatch = fileExtensions.every((extension) => extension === "pdf") && selectedTarget === "png";
            const isImageToPdfBatch = fileExtensions.every((extension) => extension === "png" || extension === "jpg") && selectedTarget === "pdf";
            const layoutOptions: CombineLayoutOptions = {
                pageSize: combinePreset,
                widthMm: combinePreset === "Custom" ? combineWidthMm : undefined,
                heightMm: combinePreset === "Custom" ? combineHeightMm : undefined,
                maxFileSizeMb: combineMaxMb,
                resolutionDpi: combineDpi,
                quality: combineQuality,
            };

            if (isPdfToPngBatch) {
                const outputs: Array<{ outputName: string; outputBlob: Blob }> = [];
                for (let index = 0; index < selectedFiles.length; index += 1) {
                    const file = selectedFiles[index];
                    const outputBlob = await createOutputBlob(file, "png", "#10b981", true);
                    const safeName = file.name.replace(/\.[^.]+$/, "");
                    outputs.push({ outputName: `${safeName}.png`, outputBlob });
                    setStatusMessage(`Converted ${index + 1} of ${selectedFiles.length} files...`);
                }

                const archiveBlob = await createBatchZipArchive(outputs);
                const url = URL.createObjectURL(archiveBlob);
                const link = document.createElement("a");
                link.href = url;
                link.download = "converted-pngs.zip";
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
                await persistHistoryEntry(selectedFiles, "converted-pngs.zip", archiveBlob, "png");
                setStatusMessage(`Downloaded ${selectedFiles.length} converted PNG files.`);
                return;
            }

            if (isImageToPdfBatch) {
                const pdfBlob = await createPdfBlobFromImagesWithOptions(selectedFiles, layoutOptions);
                const url = URL.createObjectURL(pdfBlob);
                const link = document.createElement("a");
                link.href = url;
                link.download = `combined-${combinePreset.toLowerCase()}.pdf`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
                await persistHistoryEntry(selectedFiles, `combined-${combinePreset.toLowerCase()}.pdf`, pdfBlob, "pdf");
                setStatusMessage(`Downloaded a combined PDF sized for ${combinePreset} with ${selectedFiles.length} images.`);
                return;
            }

            const outputs: Array<{ outputName: string; outputBlob: Blob }> = [];
            for (let index = 0; index < selectedFiles.length; index += 1) {
                const file = selectedFiles[index];
                const outputBlob = await createOutputBlob(file, selectedTarget, "#10b981", true);
                const safeName = file.name.replace(/\.[^.]+$/, "");
                const extension = selectedTarget === "docx" ? "docx" : selectedTarget === "txt" ? "txt" : selectedTarget === "md" ? "md" : selectedTarget === "png" ? "png" : selectedTarget === "jpg" ? "jpg" : selectedTarget === "webp" ? "webp" : selectedTarget === "svg" ? "svg" : "pdf";
                outputs.push({ outputName: `${safeName}.${extension}`, outputBlob });
                setStatusMessage(`Converted ${index + 1} of ${selectedFiles.length} files...`);
            }

            const archiveBlob = await createBatchZipArchive(outputs);
            const url = URL.createObjectURL(archiveBlob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "converted-files.zip";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            await persistHistoryEntry(selectedFiles, "converted-files.zip", archiveBlob, selectedTarget);
            setStatusMessage(`Finished converting ${selectedFiles.length} files into a ZIP archive.`);
        } catch (err: any) {
            setError(err.message || "Batch conversion failed.");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleConverterFileSelection = (file: File | null) => {
        if (!file) {
            resetState();
            return;
        }

        setSelectedFiles((previous) => {
            const merged = [...previous];
            const exists = merged.some((existing) => existing.name === file.name && existing.size === file.size);
            if (!exists) merged.push(file);
            return merged;
        });
        setError(null);
        setStatusMessage(null);
    };

    const renderActiveConverter = () => {
        if (!selectedFile) return null;
        if (category === "png") return <PngToConvert onBackToChat={onBackToChat} onOpenSettings={onOpenSettings} initialFile={selectedFile} onConverted={(outputName, blob, target) => { void persistHistoryEntry([selectedFile], outputName, blob, target); }} onFileSelected={handleConverterFileSelection} />;
        if (category === "jpg") return <JpgToConvert onBackToChat={onBackToChat} onOpenSettings={onOpenSettings} initialFile={selectedFile} onConverted={(outputName, blob, target) => { void persistHistoryEntry([selectedFile], outputName, blob, target); }} onFileSelected={handleConverterFileSelection} />;
        if (category === "pdf") return <PdfToConvert onBackToChat={onBackToChat} onOpenSettings={onOpenSettings} initialFile={selectedFile} onConverted={(outputName, blob, target) => { void persistHistoryEntry([selectedFile], outputName, blob, target); }} onFileSelected={handleConverterFileSelection} />;
        if (category === "docx") return <DocxToConvert onBackToChat={onBackToChat} onOpenSettings={onOpenSettings} initialFile={selectedFile} onConverted={(outputName, blob, target) => { void persistHistoryEntry([selectedFile], outputName, blob, target); }} onFileSelected={handleConverterFileSelection} />;
        if (category === "ppt") return <PptToConvert onBackToChat={onBackToChat} onOpenSettings={onOpenSettings} initialFile={selectedFile} onConverted={(outputName, blob, target) => { void persistHistoryEntry([selectedFile], outputName, blob, target); }} onFileSelected={handleConverterFileSelection} />;
        if (category === "xlsx") return <XlsxToConvert onBackToChat={onBackToChat} onOpenSettings={onOpenSettings} initialFile={selectedFile} onConverted={(outputName, blob, target) => { void persistHistoryEntry([selectedFile], outputName, blob, target); }} onFileSelected={handleConverterFileSelection} />;
        return null;
    };

    if (selectedFiles.length === 1 && category !== "other") {
        return renderActiveConverter();
    }

    return (
        <div className="flex h-full w-full flex-col bg-app text-theme">
            <div className="flex items-center justify-between border-b border-theme bg-panel/90 px-4 py-3 shadow-sm">
                <div className="flex items-center gap-3">
                    <button type="button" onClick={() => setSidebarOpen(!isSidebarOpen)} className="rounded-lg border border-theme bg-surface p-2 text-theme transition hover:bg-surface-soft md:hidden" title="Toggle Sidebar">
                        <Menu className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={onBackToChat} className="rounded-lg border border-theme bg-surface p-2 text-theme transition hover:bg-surface-soft" title="Back to chat">
                        <ArrowLeft className="h-4 w-4" />
                    </button>
                    {onOpenSettings ? (
                        <button type="button" onClick={onOpenSettings} className="rounded-lg border border-theme bg-surface p-2 text-theme transition hover:bg-surface-soft" title="Open settings">
                            <Settings className="h-4 w-4" />
                        </button>
                    ) : null}
                    <div>
                        <h2 className="text-base font-semibold tracking-tight">SucharAI File Converter</h2>
                        <p className="text-xs text-secondary">Upload, remove, combine, and revisit your converted files from one place.</p>
                    </div>
                </div>
                <div className="hidden items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-400 md:flex">
                    <Sparkles className="h-3.5 w-3.5" />
                    Step 1 • Upload
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 lg:px-6">
                <div className="mx-auto flex max-w-6xl flex-col gap-4">
                    <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                        <div className="rounded-2xl border border-theme bg-panel p-4 shadow-sm">
                            <div className={`rounded-2xl border-2 border-dashed p-6 text-center transition ${isDragging ? "border-emerald-400 bg-emerald-500/10" : "border-theme bg-surface/60"}`} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={(event) => { event.preventDefault(); setIsDragging(false); handleFileSelection(event.dataTransfer.files || null); }}>
                                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-theme bg-input text-theme">
                                    <UploadCloud className="h-7 w-7" />
                                </div>
                                <h3 className="mt-4 text-lg font-semibold">Upload and manage your files</h3>
                                <p className="mt-2 text-sm text-secondary">Add more files whenever you need, remove any selected file, or keep working with the batch combine options below.</p>
                                <div className="mt-4 flex flex-wrap justify-center gap-2">
                                    <button type="button" onClick={openFilePicker} className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-400 transition hover:bg-emerald-500/20">
                                        <PlusCircle className="h-4 w-4" />Add files
                                    </button>
                                    {editorEnabled ? (
                                        <button type="button" onClick={() => void openEditor(selectedFile)} className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-400 transition hover:bg-emerald-500/20">
                                            <PencilLine className="h-4 w-4" />Open workshop
                                        </button>
                                    ) : (
                                        <div className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-400">
                                            Workshop unavailable for this file type
                                        </div>
                                    )}
                                </div>
                                <input ref={fileInputRef} type="file" accept={ACCEPTED_FILE_TYPES} multiple className="hidden" onChange={(event) => handleFileSelection(event.target.files || null)} />
                            </div>

                            {selectedFiles.length > 0 && (
                                <div className="mt-4 rounded-2xl border border-theme bg-surface/70 p-4">
                                    <div className="flex items-center justify-between gap-2">
                                        <div>
                                            <p className="text-sm font-semibold">Current uploads</p>
                                            <p className="text-xs text-secondary">Remove any file before uploading a replacement.</p>
                                        </div>
                                        <button type="button" onClick={resetState} className="rounded-lg border border-theme bg-panel px-3 py-2 text-sm text-secondary transition hover:text-theme">Clear all</button>
                                    </div>
                                    <div className="mt-3 space-y-2">
                                        {selectedFiles.map((file, index) => (
                                            <div key={`${file.name}-${file.size}-${index}`} className="flex items-center justify-between gap-2 rounded-lg border border-theme bg-panel/70 px-3 py-2 text-sm">
                                                <div className="min-w-0">
                                                    <p className="truncate font-medium text-theme">{file.name}</p>
                                                    <p className="text-xs text-secondary">{Math.round(file.size / 1024)} KB</p>
                                                </div>
                                                <button type="button" onClick={() => handleRemoveFile(index)} className="rounded-lg border border-theme bg-surface p-2 text-secondary transition hover:text-theme" title="Remove file">
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {selectedFiles.length > 1 && (
                                <div className="mt-4 rounded-2xl border border-theme bg-surface/70 p-4">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div>
                                            <p className="text-sm font-semibold">Combine layout</p>
                                            <p className="text-xs text-secondary">Set the target page size, file weight, and resolution for combined output.</p>
                                        </div>
                                    </div>

                                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                                        <label className="text-sm text-secondary">
                                            <span className="mb-1 block font-medium text-theme">Target size</span>
                                            <select value={combinePreset} onChange={(event) => setCombinePreset(event.target.value as CombineLayoutOptions["pageSize"])} className="w-full rounded-lg border border-theme bg-panel px-3 py-2 text-sm text-theme">
                                                <option value="A4">A4</option>
                                                <option value="A3">A3</option>
                                                <option value="Letter">Letter</option>
                                                <option value="Legal">Legal</option>
                                                <option value="Custom">Custom</option>
                                            </select>
                                        </label>
                                        <label className="text-sm text-secondary">
                                            <span className="mb-1 block font-medium text-theme">Max output size (MB)</span>
                                            <input type="number" min="1" max="50" value={combineMaxMb} onChange={(event) => setCombineMaxMb(Number(event.target.value))} className="w-full rounded-lg border border-theme bg-panel px-3 py-2 text-sm text-theme" />
                                        </label>
                                        <label className="text-sm text-secondary">
                                            <span className="mb-1 block font-medium text-theme">Width (mm)</span>
                                            <input type="number" min="50" max="1000" value={combineWidthMm} onChange={(event) => setCombineWidthMm(Number(event.target.value))} className="w-full rounded-lg border border-theme bg-panel px-3 py-2 text-sm text-theme" disabled={combinePreset !== "Custom"} />
                                        </label>
                                        <label className="text-sm text-secondary">
                                            <span className="mb-1 block font-medium text-theme">Height (mm)</span>
                                            <input type="number" min="50" max="1000" value={combineHeightMm} onChange={(event) => setCombineHeightMm(Number(event.target.value))} className="w-full rounded-lg border border-theme bg-panel px-3 py-2 text-sm text-theme" disabled={combinePreset !== "Custom"} />
                                        </label>
                                        <label className="text-sm text-secondary">
                                            <span className="mb-1 block font-medium text-theme">Resolution (DPI)</span>
                                            <input type="number" min="96" max="600" value={combineDpi} onChange={(event) => setCombineDpi(Number(event.target.value))} className="w-full rounded-lg border border-theme bg-panel px-3 py-2 text-sm text-theme" />
                                        </label>
                                        <label className="text-sm text-secondary">
                                            <span className="mb-1 block font-medium text-theme">Quality</span>
                                            <input type="range" min="0.4" max="1" step="0.05" value={combineQuality} onChange={(event) => setCombineQuality(Number(event.target.value))} className="w-full" />
                                            <span className="mt-1 block text-xs text-secondary">{combineQuality.toFixed(2)}</span>
                                        </label>
                                    </div>

                                    <div className="mt-4 flex flex-wrap gap-2">
                                        {(["pdf", "docx", "txt", "md", "png", "jpg", "webp", "svg"] as const).map((target) => (
                                            <button key={target} type="button" onClick={() => setSelectedTarget(target)} className={`rounded-full border px-3 py-1.5 text-sm transition ${selectedTarget === target ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-theme bg-surface text-secondary hover:text-theme"}`}>
                                                {target.toUpperCase()}
                                            </button>
                                        ))}
                                    </div>

                                    <button type="button" onClick={() => void handleBatchConvert()} disabled={isProcessing} className="mt-4 flex w-full items-center justify-center rounded-xl bg-emerald-500/15 px-4 py-3 text-sm font-semibold text-emerald-400 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60">
                                        {isProcessing ? "Converting..." : `Convert all files to ${selectedTarget.toUpperCase()}`}
                                    </button>
                                </div>
                            )}

                            {statusMessage && (
                                <div className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
                                    {statusMessage}
                                </div>
                            )}

                            {error && (
                                <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                                    <XCircle className="h-4 w-4" />
                                    {error}
                                </div>
                            )}
                        </div>

                        <div className="space-y-4">
                            <div className="rounded-2xl border border-theme bg-panel p-4 shadow-sm">
                                <div className="flex items-center justify-between gap-2">
                                    <div>
                                        <p className="text-sm font-semibold">Saved conversions</p>
                                        <p className="text-xs text-secondary">Stored in your account workspace for later download.</p>
                                    </div>
                                    <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-400">{historyEntries.length}</div>
                                </div>
                                <div className="mt-4 space-y-2">
                                    {historyEntries.length === 0 ? (
                                        <div className="rounded-xl border border-dashed border-theme bg-surface/60 p-4 text-sm text-secondary">Your converted files will appear here after you finish a conversion.</div>
                                    ) : historyEntries.map((entry) => (
                                        <div key={entry.id} className="rounded-xl border border-theme bg-surface/70 p-3">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-semibold text-theme">{entry.title}</p>
                                                    <p className="mt-1 text-xs text-secondary">{entry.sourceName}</p>
                                                    <p className="mt-1 text-[11px] text-secondary">{new Date(entry.createdAt).toLocaleString()}</p>
                                                </div>
                                                <button type="button" onClick={() => removeHistoryEntry(entry.id)} className="rounded-lg border border-theme bg-panel p-2 text-secondary transition hover:text-theme" title="Remove saved conversion">
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                <button type="button" onClick={() => downloadHistoryEntry(entry)} className="inline-flex items-center gap-1 rounded-full border border-theme bg-panel px-3 py-1.5 text-xs text-secondary transition hover:text-theme">
                                                    <Download className="h-3.5 w-3.5" />Download
                                                </button>
                                                {editorEnabled && (
                                                    <button type="button" onClick={() => void openEditor()} className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/20">
                                                        <PencilLine className="h-3.5 w-3.5" />Edit label
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="rounded-2xl border border-theme bg-panel p-4 shadow-sm">
                                <div className="flex items-center justify-between gap-2">
                                    <div>
                                        <p className="text-sm font-semibold">Online workspace</p>
                                        <p className="text-xs text-secondary">Edit text-based outputs and save them back into your history list.</p>
                                    </div>
                                    <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-400">Live</div>
                                </div>
                                <div className="mt-3 rounded-xl border border-theme bg-surface/70 p-3">
                                    {!editorEnabled ? (
                                        <div className="rounded-lg border border-dashed border-theme bg-panel/60 p-4 text-sm text-secondary">
                                            The editor workspace is available for PDF and Microsoft Office files only.
                                        </div>
                                    ) : (
                                        <>
                                            <textarea value={editorContent} onChange={(event) => setEditorContent(event.target.value)} rows={8} className="editor-surface w-full rounded-lg border border-slate-700 p-3 text-sm outline-none" placeholder="Write or edit your document text here..." />
                                            <div className="mt-3 flex items-center justify-between gap-2">
                                                <input value={editorTitle} onChange={(event) => setEditorTitle(event.target.value)} className="w-full rounded-lg border border-theme bg-panel px-3 py-2 text-sm text-theme" placeholder="Document name" />
                                                <button type="button" onClick={() => void saveEditorContent()} className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-400 transition hover:bg-emerald-500/20">Save</button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {editorOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-panel/80 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-3xl rounded-2xl border border-theme bg-panel p-4 shadow-2xl">
                        <div className="flex items-center justify-between gap-2">
                            <div>
                                <p className="text-sm font-semibold">Editor workspace</p>
                                <p className="text-xs text-secondary">Use this lightweight office-style editor for text-based files.</p>
                            </div>
                            <button type="button" onClick={() => setEditorOpen(false)} className="rounded-lg border border-theme bg-surface p-2 text-theme transition hover:bg-surface-soft" title="Close editor">
                                <XCircle className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="mt-4 rounded-xl border border-theme bg-surface/70 p-3">
                            <textarea value={editorContent} onChange={(event) => setEditorContent(event.target.value)} rows={12} className="editor-surface w-full rounded-lg border border-slate-700 p-3 text-sm outline-none" />
                        </div>
                        <div className="mt-4 flex items-center justify-between gap-2">
                            <input value={editorTitle} onChange={(event) => setEditorTitle(event.target.value)} className="w-full rounded-lg border border-theme bg-panel px-3 py-2 text-sm text-theme" />
                            <button type="button" onClick={() => void saveEditorContent()} className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-400 transition hover:bg-emerald-500/20">Save to history</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
