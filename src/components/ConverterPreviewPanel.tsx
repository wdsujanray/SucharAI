import React, { useEffect, useMemo, useState } from "react";
import { Copy, FileText, MessageSquarePlus, X } from "lucide-react";

interface ConverterPreviewPanelProps {
    uploadedFile: File | null;
    convertedBlob: Blob | null;
    convertedName?: string;
    selectedTarget?: string;
    onUseInChat?: (text: string) => void;
}

function isTextLikeName(fileName: string) {
    return /\.(txt|md|json|csv|ts|tsx|js|jsx|py|html|css|xml|yaml|yml)$/i.test(fileName);
}

function isTextLikeType(type: string, name: string) {
    if (!type) return isTextLikeName(name);
    return ["text/", "application/json", "application/xml", "application/javascript", "application/typescript", "application/x-yaml", "application/yaml"].some((candidate) => type.includes(candidate) || type === candidate) || isTextLikeName(name);
}

export default function ConverterPreviewPanel({ uploadedFile, convertedBlob, convertedName, selectedTarget, onUseInChat }: ConverterPreviewPanelProps) {
    const [modalKind, setModalKind] = useState<"uploaded" | "converted" | null>(null);
    const [modalTitle, setModalTitle] = useState("");
    const [modalText, setModalText] = useState("");
    const [modalImageUrl, setModalImageUrl] = useState<string | null>(null);
    const [modalPdfUrl, setModalPdfUrl] = useState<string | null>(null);
    const [modalError, setModalError] = useState<string | null>(null);
    const [modalLoading, setModalLoading] = useState(false);
    const [inlinePreview, setInlinePreview] = useState<{ type: "image" | "text" | "pdf" | "unsupported"; text?: string; imageUrl?: string; pdfUrl?: string; title: string } | null>(null);

    useEffect(() => {
        return () => {
            if (modalImageUrl) URL.revokeObjectURL(modalImageUrl);
            if (modalPdfUrl) URL.revokeObjectURL(modalPdfUrl);
        };
    }, [modalImageUrl, modalPdfUrl]);

    const closeModal = () => {
        setModalKind(null);
        setModalTitle("");
        setModalText("");
        setModalImageUrl(null);
        setModalPdfUrl(null);
        setModalError(null);
        setModalLoading(false);
    };

    const buildPreviewState = async (source: File | Blob | null, title: string) => {
        if (!source) return null;
        const isFile = source instanceof File;
        const type = isFile ? source.type : source.type;
        const name = isFile ? source.name : title;

        if (type.startsWith("image/") || /\.(png|jpg|jpeg|gif|webp|svg|bmp|tiff|tif)$/i.test(name)) {
            const url = isFile ? URL.createObjectURL(source) : URL.createObjectURL(source);
            return { type: "image" as const, imageUrl: url, title };
        }

        if (type === "application/pdf" || /\.pdf$/i.test(name)) {
            const url = isFile ? URL.createObjectURL(source) : URL.createObjectURL(source);
            return { type: "pdf" as const, pdfUrl: url, title };
        }

        if (isTextLikeType(type, name)) {
            const text = isFile ? await source.text() : await source.text();
            return { type: "text" as const, text: text.slice(0, 20000), title };
        }

        return { type: "unsupported" as const, title };
    };

    const openModal = async (kind: "uploaded" | "converted") => {
        setModalLoading(true);
        setModalKind(kind);
        setModalError(null);
        setModalText("");
        setModalImageUrl(null);
        setModalPdfUrl(null);
        const source = kind === "uploaded" ? uploadedFile : convertedBlob;
        const title = kind === "uploaded" ? (uploadedFile?.name || "Uploaded file") : (convertedName || `Converted ${selectedTarget || "file"}`);
        setModalTitle(title);
        if (!source) {
            setModalError("No file is available to preview yet.");
            setModalLoading(false);
            return;
        }

        try {
            const previewState = await buildPreviewState(source, title);
            if (!previewState) {
                setModalError("Preview is not available for this file type.");
                return;
            }

            if (previewState.type === "image") {
                setModalImageUrl(previewState.imageUrl || null);
            } else if (previewState.type === "pdf") {
                setModalPdfUrl(previewState.pdfUrl || null);
            } else if (previewState.type === "text") {
                setModalText(previewState.text || "");
            } else {
                setModalError("Preview is not available for this file type.");
            }
        } catch {
            setModalError("The selected file could not be previewed.");
        } finally {
            setModalLoading(false);
        }
    };

    const showInlinePreview = useMemo(() => {
        if (!convertedBlob) return null;
        return { type: "unsupported" as const, title: convertedName || "Converted file" };
    }, [convertedBlob, convertedName]);

    const openInlinePreview = async () => {
        if (!convertedBlob) return;
        const previewState = await buildPreviewState(convertedBlob, convertedName || "Converted file");
        if (!previewState) return;
        setInlinePreview(previewState);
    };

    useEffect(() => {
        if (convertedBlob) {
            void openInlinePreview();
        } else {
            setInlinePreview(null);
        }
    }, [convertedBlob, convertedName]);

    const copyTextToClipboard = async (text: string) => {
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            // ignore
        }
    };

    return (
        <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void openModal("uploaded")} className="rounded-full border border-theme bg-surface px-3 py-1.5 text-sm text-theme transition hover:bg-surface-soft">Preview uploaded file</button>
                <button type="button" onClick={() => void openModal("converted")} disabled={!convertedBlob} className="rounded-full border border-theme bg-surface px-3 py-1.5 text-sm text-theme transition hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-60">Preview converted file</button>
            </div>

            {inlinePreview && (
                <div className="rounded-2xl border border-theme bg-panel p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                        <div>
                            <p className="text-sm font-semibold">Converted preview</p>
                            <p className="text-xs text-secondary">This preview stays on the converter page.</p>
                        </div>
                        {inlinePreview.type === "text" && onUseInChat && (
                            <button type="button" onClick={() => onUseInChat(inlinePreview.text || "")} className="flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/20">
                                <MessageSquarePlus className="h-3.5 w-3.5" />Use in chat
                            </button>
                        )}
                    </div>
                    <div className="mt-3 overflow-hidden rounded-xl border border-theme bg-surface/70">
                        {inlinePreview.type === "image" && inlinePreview.imageUrl ? <img src={inlinePreview.imageUrl} alt="Converted preview" className="max-h-80 w-full object-contain" /> : null}
                        {inlinePreview.type === "pdf" && inlinePreview.pdfUrl ? <iframe src={inlinePreview.pdfUrl} title="Converted preview" className="h-80 w-full rounded-xl" /> : null}
                        {inlinePreview.type === "text" && inlinePreview.text ? <pre className="max-h-80 overflow-auto whitespace-pre-wrap p-3 text-sm text-theme">{inlinePreview.text}</pre> : null}
                        {inlinePreview.type === "unsupported" ? <div className="p-4 text-sm text-secondary">Preview is not available for this converted file type yet.</div> : null}
                    </div>
                    {inlinePreview.type === "text" && inlinePreview.text ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                            <button type="button" onClick={() => void copyTextToClipboard(inlinePreview.text || "")} className="flex items-center gap-1 rounded-full border border-theme bg-surface px-3 py-1.5 text-xs text-secondary transition hover:text-theme">
                                <Copy className="h-3.5 w-3.5" />Copy text
                            </button>
                            {onUseInChat ? <button type="button" onClick={() => onUseInChat(inlinePreview.text || "")} className="flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/20"><MessageSquarePlus className="h-3.5 w-3.5" />Use in chat</button> : null}
                        </div>
                    ) : null}
                </div>
            )}

            {modalKind && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-panel/80 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-4xl rounded-2xl border border-theme bg-panel shadow-2xl">
                        <div className="flex items-center justify-between border-b border-theme px-4 py-3">
                            <div>
                                <p className="text-sm font-semibold">{modalTitle}</p>
                                <p className="text-xs text-secondary">{modalKind === "uploaded" ? "Opened as a popup while staying on the converter page." : "Previewing the converted output."}</p>
                            </div>
                            <button type="button" onClick={closeModal} className="rounded-lg border border-theme bg-surface p-2 text-theme transition hover:bg-surface-soft" title="Close preview">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="max-h-[75vh] overflow-auto p-4">
                            {modalLoading ? <div className="py-8 text-center text-sm text-secondary">Preparing preview...</div> : null}
                            {modalError ? <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-400">{modalError}</div> : null}
                            {modalImageUrl ? <img src={modalImageUrl} alt={modalTitle} className="max-h-[65vh] w-full object-contain" /> : null}
                            {modalPdfUrl ? <iframe src={modalPdfUrl} title={modalTitle} className="h-[65vh] w-full rounded-xl" /> : null}
                            {modalText ? <pre className="whitespace-pre-wrap wrap-break-word rounded-xl border border-theme bg-surface/70 p-4 text-sm text-theme">{modalText}</pre> : null}
                            {!modalLoading && !modalError && !modalImageUrl && !modalPdfUrl && !modalText ? <div className="flex items-center gap-2 rounded-xl border border-dashed border-theme bg-surface/50 p-4 text-sm text-secondary"><FileText className="h-4 w-4" />Preview is currently unavailable for this file.</div> : null}
                        </div>
                        {modalText ? (
                            <div className="flex flex-wrap gap-2 border-t border-theme px-4 py-3">
                                <button type="button" onClick={() => void copyTextToClipboard(modalText)} className="flex items-center gap-1 rounded-full border border-theme bg-surface px-3 py-1.5 text-xs text-secondary transition hover:text-theme"><Copy className="h-3.5 w-3.5" />Copy text</button>
                                {onUseInChat ? <button type="button" onClick={() => { onUseInChat(modalText); closeModal(); }} className="flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/20"><MessageSquarePlus className="h-3.5 w-3.5" />Use in chat</button> : null}
                            </div>
                        ) : null}
                    </div>
                </div>
            )}
        </div>
    );
}
