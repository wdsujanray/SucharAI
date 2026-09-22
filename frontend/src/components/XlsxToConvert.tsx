import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Copy, Download, Loader2, Settings, Sparkles, Trash2, UploadCloud } from "lucide-react";
import { createOutputBlob, createZipArchive, getFileExtension, SUPPORTED_CONVERTER_EXTENSIONS, SUPPORTED_FILE_ACCEPT, supportsEditorWorkflow } from "./converterUtils.js";
import ConverterPreviewPanel from "./ConverterPreviewPanel.js";
import { useChatStore } from "../store.js";

interface Props {
    onBackToChat: () => void;
    onOpenSettings?: () => void;
    initialFile?: File | null;
    onConverted?: (outputName: string, blob: Blob, target: string) => void;
    onFileSelected?: (file: File | null) => void;
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

export default function XlsxToConvert({ onBackToChat, onOpenSettings, initialFile, onConverted, onFileSelected }: Props) {
    const [selectedFile, setSelectedFile] = useState<File | null>(initialFile || null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [selectedTarget, setSelectedTarget] = useState<"pdf" | "pdf-layout" | "txt" | "md" | "xlsx">("pdf");
    const [lastMessage, setLastMessage] = useState<string | null>(null);
    const [convertedBlob, setConvertedBlob] = useState<Blob | null>(null);
    const [convertedName, setConvertedName] = useState<string>("");
    const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const { setSettingsOpen, user } = useChatStore();
    const storageKey = `sucharai:converter-history:${user?.id ?? "guest"}`;
    const editorEnabled = useMemo(() => supportsEditorWorkflow(selectedFile?.name), [selectedFile]);

    useEffect(() => {
        setSelectedFile(initialFile || null);
    }, [initialFile]);

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

    const isValid = useMemo(() => {
        const ext = getFileExtension(selectedFile?.name || "");
        return Boolean(selectedFile && SUPPORTED_CONVERTER_EXTENSIONS.includes(ext));
    }, [selectedFile]);

    const handleUploadAnotherFile = () => fileInputRef.current?.click();

    const handleFileSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const ext = getFileExtension(file.name);
        if (!SUPPORTED_CONVERTER_EXTENSIONS.includes(ext)) {
            setError("Please choose a supported file type.");
            event.target.value = "";
            return;
        }
        setSelectedFile(file);
        onFileSelected?.(file);
        setConvertedBlob(null);
        setConvertedName("");
        setLastMessage(null);
        setError(null);
        setCopied(false);
        event.target.value = "";
    };

    const handleRemoveCurrentFile = () => {
        setSelectedFile(null);
        onFileSelected?.(null);
        setConvertedBlob(null);
        setConvertedName("");
        setLastMessage(null);
        setError(null);
        setCopied(false);
    };

    const downloadBlob = (blob: Blob, fileName: string) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error || new Error("Unable to read blob"));
        reader.readAsDataURL(blob);
    });

    const persistHistoryEntry = async (outputName: string, blob: Blob, target: string) => {
        const dataUrl = await blobToDataUrl(blob);
        const entry: HistoryEntry = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            title: outputName,
            sourceName: selectedFile?.name || "uploaded-file",
            createdAt: new Date().toISOString(),
            mimeType: blob.type || "application/octet-stream",
            target,
            blobDataUrl: dataUrl,
            size: blob.size,
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
        const link = document.createElement("a");
        link.href = entry.blobDataUrl;
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

    const handleConvert = async () => {
        if (!selectedFile) return;
        try {
            setIsProcessing(true);
            setError(null);
            setCopied(false);
            const blob = await createOutputBlob(selectedFile, selectedTarget, "#10b981", true);
            setConvertedBlob(blob);
            const outputExtension = selectedTarget === "pdf" || selectedTarget === "pdf-layout" ? "pdf" : selectedTarget === "txt" ? "txt" : selectedTarget === "md" ? "md" : "xlsx";
            const outputName = `${selectedFile.name.replace(/\.[^.]+$/, "")}-${selectedTarget}.${outputExtension}`;
            setConvertedName(outputName);
            await persistHistoryEntry(outputName, blob, selectedTarget);
            onConverted?.(outputName, blob, selectedTarget);
            setLastMessage(`Ready to download the ${selectedTarget.toUpperCase()} conversion.`);
        } catch (err: any) {
            setError(err.message || "Conversion failed.");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDownloadZip = async () => {
        if (!selectedFile || !convertedBlob) return;
        try {
            setIsProcessing(true);
            const archiveBlob = await createZipArchive(convertedName, convertedBlob);
            downloadBlob(archiveBlob, `${selectedFile.name.replace(/\.[^.]+$/, "")}-archive.zip`);
            setLastMessage("Downloaded the ZIP archive.");
        } catch (err: any) {
            setError(err.message || "ZIP export failed.");
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="flex h-full w-full flex-col bg-app text-theme">
            <div className="flex items-center justify-between border-b border-theme bg-panel/90 px-4 py-3 shadow-sm">
                <div className="flex items-center gap-3">
                    <button type="button" onClick={onBackToChat} className="rounded-lg border border-theme bg-surface p-2 text-theme transition hover:bg-surface-soft" title="Back to chat">
                        <ArrowLeft className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => (onOpenSettings ? onOpenSettings() : setSettingsOpen(true))} className="rounded-lg border border-theme bg-surface p-2 text-theme transition hover:bg-surface-soft" title="Open settings">
                        <Settings className="h-4 w-4" />
                    </button>
                    <div>
                        <h2 className="text-base font-semibold tracking-tight">Excel Converter</h2>
                        <p className="text-xs text-secondary">Convert Excel workbooks into PDF, TXT, Markdown, or XLSX.</p>
                    </div>
                </div>
                <div className="hidden items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-400 md:flex">
                    <Sparkles className="h-3.5 w-3.5" />Step 2 • Convert
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 lg:px-6">
                <div className="mx-auto flex max-w-5xl flex-col gap-4">
                    <div className="rounded-2xl border border-theme bg-panel p-4 shadow-sm">
                        <div className="rounded-2xl border-2 border-dashed border-theme bg-surface/60 p-6 text-center">
                            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-theme bg-input text-theme">
                                <UploadCloud className="h-7 w-7" />
                            </div>
                            <h3 className="mt-4 text-lg font-semibold">Excel conversion workspace</h3>
                            <p className="mt-2 text-sm text-secondary">Upload an XLS or XLSX file, choose an output format, and download the result.</p>
                            {convertedBlob && (
                                <div className="mt-4 flex flex-wrap justify-center gap-2">
                                    <button type="button" onClick={handleUploadAnotherFile} className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-400 transition hover:bg-emerald-500/20">Upload another file</button>
                                    <button type="button" onClick={handleRemoveCurrentFile} className="rounded-full border border-theme bg-surface px-4 py-2 text-sm font-semibold text-theme transition hover:bg-surface-soft">Remove current file</button>
                                </div>
                            )}
                            <input ref={fileInputRef} type="file" accept={SUPPORTED_FILE_ACCEPT} className="hidden" onChange={handleFileSelection} />
                        </div>
                    </div>

                    {!selectedFile || !isValid ? (
                        <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-400">
                            Please upload an Excel workbook.
                        </div>
                    ) : (
                        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                            <div className="rounded-2xl border border-theme bg-panel p-4 shadow-sm">
                                <div className="border-b border-theme pb-3">
                                    <p className="text-sm font-semibold">Step 2 • Pick a format</p>
                                    <p className="text-xs text-secondary">Choose one of the buttons below and press Convert.</p>
                                </div>
                                <div className="mt-4 flex flex-wrap gap-2">
                                    {(["pdf", "pdf-layout", "txt", "md", "xlsx"] as const).map((target) => (
                                        <button
                                            key={target}
                                            type="button"
                                            onClick={() => setSelectedTarget(target)}
                                            className={`rounded-full border px-3 py-1.5 text-sm transition ${selectedTarget === target ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-theme bg-surface text-secondary hover:text-theme"}`}
                                        >
                                            {target === "pdf-layout" ? "PDF (Layout)" : target.toUpperCase()}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => { void handleConvert(); }}
                                    disabled={isProcessing}
                                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500/15 px-4 py-3 text-sm font-semibold text-emerald-400 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    <Loader2 className={`h-4 w-4 ${isProcessing ? "animate-spin" : ""}`} />
                                    {isProcessing ? "Converting..." : `Convert to ${selectedTarget.toUpperCase()}`}
                                </button>
                                {error && <div className="mt-3 rounded-lg border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}
                            </div>

                            <div className="rounded-2xl border border-theme bg-panel p-4 shadow-sm">
                                <div className="border-b border-theme pb-3">
                                    <p className="text-sm font-semibold">Step 3 • Download</p>
                                    <p className="text-xs text-secondary">These controls are enabled after a conversion is created.</p>
                                </div>
                                <div className="mt-4 space-y-3">
                                    {lastMessage && (
                                        <div className="rounded-xl border border-theme bg-surface/70 p-3 text-sm text-secondary">
                                            <div className="flex items-center justify-between gap-2">
                                                <span>{lastMessage}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        void navigator.clipboard.writeText(lastMessage);
                                                        setCopied(true);
                                                        setTimeout(() => setCopied(false), 1400);
                                                    }}
                                                    className="rounded-lg border border-theme bg-panel px-2 py-1 text-xs text-theme transition hover:bg-surface-soft"
                                                >
                                                    {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => { void handleDownloadZip(); }}
                                        disabled={isProcessing || !convertedBlob}
                                        className={`flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition hover:bg-surface-soft disabled:cursor-not-allowed ${convertedBlob ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400" : "border-theme bg-surface text-theme"}`}
                                    >
                                        <Download className="h-4 w-4" />
                                        Download ZIP Archive
                                    </button>
                                    {!convertedBlob && (
                                        <div className="rounded-xl border border-dashed border-theme bg-surface/50 p-4 text-sm text-secondary">
                                            Convert once to enable the download actions.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="rounded-2xl border border-theme bg-panel p-4 shadow-sm">
                        <div className="flex items-center justify-between gap-2">
                            <div>
                                <p className="text-sm font-semibold">Saved conversions</p>
                                <p className="text-xs text-secondary">Your recent outputs stay available in this workspace.</p>
                            </div>
                            <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-400">{historyEntries.length}</div>
                        </div>
                        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
                            <div className="space-y-2">
                                {historyEntries.length === 0 ? <div className="rounded-xl border border-dashed border-theme bg-surface/60 p-4 text-sm text-secondary">Converted files appear here after you finish a conversion.</div> : historyEntries.map((entry) => (
                                    <div key={entry.id} className="rounded-xl border border-theme bg-surface/70 p-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-semibold text-theme">{entry.title}</p>
                                                <p className="mt-1 text-xs text-secondary">{entry.sourceName}</p>
                                                <p className="mt-1 text-[11px] text-secondary">{new Date(entry.createdAt).toLocaleString()}</p>
                                            </div>
                                            <button type="button" onClick={() => removeHistoryEntry(entry.id)} className="rounded-lg border border-theme bg-panel p-2 text-secondary transition hover:text-theme" title="Remove saved conversion"><Trash2 className="h-4 w-4" /></button>
                                        </div>
                                        <div className="mt-3 flex gap-2">
                                            <button type="button" onClick={() => downloadHistoryEntry(entry)} className="inline-flex items-center gap-1 rounded-full border border-theme bg-panel px-3 py-1.5 text-xs text-secondary transition hover:text-theme"><Download className="h-3.5 w-3.5" />Download</button>
                                            {editorEnabled && (
                                                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400">Editor ready</span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="rounded-xl border border-theme bg-surface/70 p-3">
                                <p className="text-sm font-semibold">Quick note</p>
                                <p className="mt-1 text-xs text-secondary">This workspace keeps your latest conversions handy while you work.</p>
                                <div className="mt-3 rounded-xl border border-dashed border-theme bg-surface/60 p-4 text-sm text-secondary">
                                    Excel conversions are now part of the same flow as images, PDFs, Word, and PowerPoint files.
                                </div>
                            </div>
                        </div>
                    </div>
                    <ConverterPreviewPanel
                        uploadedFile={selectedFile}
                        convertedBlob={convertedBlob}
                        convertedName={convertedName}
                        selectedTarget={selectedTarget}
                        onUseInChat={onBackToChat}
                    />
                </div>
            </div>
        </div>
    );
}
