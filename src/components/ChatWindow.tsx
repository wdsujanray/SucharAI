import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import {
  Send, Mic, MicOff, Volume2, VolumeX, Paperclip, Loader2, FileText, Search, Sparkles, X, Check, HelpCircle, FilePlus, Plus,
  Brain, Globe, ChevronDown, ChevronUp, SearchCheck, Menu, Wifi, WifiOff, Printer, Download, Eye, Camera, MessageSquare, Star,
  Copy, Edit3
} from "lucide-react";
import { useChatStore, api } from "../store.js";
import { containsProfanity } from "../lib/searchUtils.js";
import { Message, DocumentRecord } from "../types.js";
import MessageFeedback from "./MessageFeedback.js";
import ObjectDetectionPanel from "./ObjectDetectionPanel.js";
import { logoUrl } from "../lib/logo.ts";

interface InlineDetectionState {
  isVisible: boolean;
  isDetecting: boolean;
  imageSrc: string | null;
  objects: Array<{ box_2d: [number, number, number, number]; label: string; confidence: number }>;
  error: string | null;
}

const syntaxHighlightCode = (code: string) => {
  const escaped = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const tokens = escaped.split(/(\s+|\/\/.*$|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:function|class|return|const|let|var|if|else|for|while|async|await|import|export|from|new|try|catch|switch|case|default|public|private|protected|extends|implements|package|def|print|true|false|null|undefined)\b|\b(?:[A-Z][A-Za-z0-9_]*|[a-zA-Z_][a-zA-Z0-9_]*)\b|\b\d+(?:\.\d+)?\b|\.[A-Za-z0-9_-]+|#(?:[A-Za-z0-9_-]+)|\b(?:class|id|value|key|name|type|src|href|alt|disabled|checked|placeholder|for|style|data-[A-Za-z0-9_-]+)\b|<[/]?[A-Za-z0-9:-]+|\{\}|\{|\}|\(|\)|\[|\]|:|;|,|\+|-|\*|\/|=|\.|!|&|\||<|>)/g);

  return tokens.map((token, index) => {
    if (!token) return null;

    const trimmed = token.trim();
    if (!trimmed) {
      return <span key={`${token}-${index}`} className="text-slate-200">{token}</span>;
    }

    if (/^\/\//.test(trimmed) || /^\/\*/.test(trimmed) || /\*\/$/.test(trimmed)) {
      return <span key={`${token}-${index}`} className="text-slate-500">{token}</span>;
    }

    if (/^"/.test(trimmed) || /^'/.test(trimmed)) {
      return <span key={`${token}-${index}`} className="text-[#ce9178]">{token}</span>;
    }

    if (/^\d/.test(trimmed) && /^\d+(?:\.\d+)?$/.test(trimmed)) {
      return <span key={`${token}-${index}`} className="text-[#b5cea8]">{token}</span>;
    }

    if (/^(function|class|return|const|let|var|if|else|for|while|async|await|import|export|from|new|try|catch|switch|case|default|public|private|protected|extends|implements|package|def|print|true|false|null|undefined)$/.test(trimmed)) {
      return <span key={`${token}-${index}`} className="text-[#569cd6]">{token}</span>;
    }

    if (/^\.[A-Za-z0-9_-]+$/.test(trimmed)) {
      return <span key={`${token}-${index}`} className="text-[#d7ba7d]">{token}</span>;
    }

    if (/^#[A-Za-z0-9_-]+$/.test(trimmed)) {
      return <span key={`${token}-${index}`} className="text-[#ff79c6]">{token}</span>;
    }

    if (/^(class|id|value|key|name|type|src|href|alt|disabled|checked|placeholder|for|style|data-[A-Za-z0-9_-]+)$/.test(trimmed)) {
      return <span key={`${token}-${index}`} className="text-[#9cdcfe]">{token}</span>;
    }

    if (/^<\/?[A-Za-z0-9:-]+$/.test(trimmed)) {
      return <span key={`${token}-${index}`} className="text-[#8080ff]">{token}</span>;
    }

    if (/^(\{|\}|\(|\)|\[|\]|:|;|,|\+|-|\*|\/|=|\.|!|&|\||<|>)$/.test(trimmed)) {
      return <span key={`${token}-${index}`} className="text-slate-300">{token}</span>;
    }

    if (/^class$/.test(trimmed) || /^function$/.test(trimmed)) {
      return <span key={`${token}-${index}`} className="text-[#4ec9b0]">{token}</span>;
    }

    if (/^[A-Z][A-Za-z0-9_]*$/.test(trimmed)) {
      return <span key={`${token}-${index}`} className="text-[#4fc1ff]">{token}</span>;
    }

    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed) && !/^(true|false|null|undefined)$/.test(trimmed)) {
      return <span key={`${token}-${index}`} className="text-[#d4d4d4]">{token}</span>;
    }

    return <span key={`${token}-${index}`} className="text-slate-100">{token}</span>;
  });
};

function CodeBlockEditor({ language, content }: { language?: string; content: string }) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  const [copied, setCopied] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    setDraft(content);
  }, [content]);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = window.setTimeout(() => setStatusMessage(null), 1800);
    return () => window.clearTimeout(timer);
  }, [statusMessage]);

  const stopAction = (event: React.SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const showStatus = (message: string) => {
    setStatusMessage(message);
  };

  const handleCopy = async (event: React.MouseEvent<HTMLButtonElement>) => {
    stopAction(event);

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(draft);
      } else {
        const fallback = document.createElement("textarea");
        fallback.value = draft;
        fallback.setAttribute("readonly", "");
        fallback.style.position = "fixed";
        fallback.style.left = "-9999px";
        document.body.appendChild(fallback);
        fallback.select();
        document.execCommand("copy");
        fallback.remove();
      }

      setCopied(true);
      showStatus("Copied to clipboard");
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
      showStatus("Copy failed. Please try again.");
    }
  };

  const handleDownload = (event: React.MouseEvent<HTMLButtonElement>) => {
    stopAction(event);

    const safeLanguage = (language || "snippet").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "snippet";
    const blob = new Blob([draft], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeLanguage}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showStatus("Downloaded to your browser Downloads folder");
  };

  const handleEditToggle = (event: React.MouseEvent<HTMLButtonElement>) => {
    stopAction(event);
    const nextValue = !isEditing;
    setIsEditing(nextValue);
    showStatus(nextValue ? "Edit mode enabled" : "Edit mode disabled");
  };

  return (
    <div
      className="my-2 overflow-hidden rounded-lg border border-theme/60 bg-black/25"
      onMouseDown={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onClickCapture={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-theme/50 bg-slate-950/80 px-2.5 py-1.5">
        <div className="flex items-center gap-2">
          <span className="rounded bg-teal-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-teal-300">
            {language || "code"}
          </span>
          <span className="text-[10px] text-slate-400">Editor</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onMouseDown={(event) => event.stopPropagation()}
            onTouchStart={(event) => event.stopPropagation()}
            onClickCapture={(event) => event.stopPropagation()}
            onClick={handleCopy}
            className="rounded border border-teal-400/20 bg-teal-500/10 px-2 py-1 text-[10px] text-teal-200 transition hover:bg-teal-500/20"
            title="Copy code"
          >
            {copied ? <Check className="w-3 h-3 text-teal-300" /> : <Copy className="w-3 h-3" />}
          </button>
          <button
            type="button"
            onMouseDown={(event) => event.stopPropagation()}
            onTouchStart={(event) => event.stopPropagation()}
            onClickCapture={(event) => event.stopPropagation()}
            onClick={handleDownload}
            className="rounded border border-teal-400/20 bg-teal-500/10 px-2 py-1 text-[10px] text-teal-200 transition hover:bg-teal-500/20"
            title="Download code"
          >
            <Download className="w-3 h-3" />
          </button>
          <button
            type="button"
            onMouseDown={(event) => event.stopPropagation()}
            onTouchStart={(event) => event.stopPropagation()}
            onClickCapture={(event) => event.stopPropagation()}
            onClick={handleEditToggle}
            className={`rounded border px-2 py-1 text-[10px] transition ${isEditing ? "border-teal-400/30 bg-teal-500/15 text-teal-100 hover:bg-teal-500/20" : "border-slate-600/60 bg-slate-800/70 text-slate-300 hover:bg-slate-700/70"}`}
            title={isEditing ? "Finish editing" : "Edit code"}
          >
            {isEditing ? <Check className="w-3 h-3 text-teal-300" /> : <Edit3 className="w-3 h-3" />}
          </button>
        </div>
      </div>
      {isEditing ? (
        <div className="border-b border-slate-800/80 bg-[#0b1020] p-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="min-h-40 w-full resize-y rounded-md border border-slate-700/60 bg-[#111827] px-3 py-2 font-mono text-[11px] leading-5 text-slate-100 outline-none ring-0"
            spellCheck={false}
          />
        </div>
      ) : (
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap wrap-break-word bg-[#020617] px-3 py-2 font-mono text-[11px] leading-5 text-theme">
          {syntaxHighlightCode(draft)}
        </pre>
      )}
      {statusMessage && (
        <div className="animate-fade-in border-t border-theme/50 bg-surface/80 px-3 py-2 text-[10px] font-medium text-teal-300">
          {statusMessage}
        </div>
      )}
    </div>
  );
}

// Helper to parse deep thinking tags in real-time
const parseThinkingContent = (content: string) => {
  const thoughtStartTag = "<thought>";
  const thoughtEndTag = "</thought>";

  const startIndex = content.indexOf(thoughtStartTag);
  if (startIndex === -1) {
    return { thinkingText: null, cleanContent: content, isThinking: false, completed: false };
  }

  const contentAfterStart = content.substring(startIndex + thoughtStartTag.length);
  const endIndex = contentAfterStart.indexOf(thoughtEndTag);

  if (endIndex === -1) {
    return {
      thinkingText: contentAfterStart,
      cleanContent: "",
      isThinking: true,
      completed: false
    };
  } else {
    const thinkingText = contentAfterStart.substring(0, endIndex);
    const cleanContent = contentAfterStart.substring(endIndex + thoughtEndTag.length);
    return {
      thinkingText,
      cleanContent,
      isThinking: false,
      completed: true
    };
  }
};

// Converts basic markdown syntax to styled HTML elements for clean print/PDF layouts
const cleanMarkdownToHtml = (markdown: string): string => {
  if (!markdown) return "";
  let html = markdown;

  // Escape basic HTML tags to prevent arbitrary HTML injections, except what we generate
  html = html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Replace Code blocks
  html = html.replace(/```([\s\S]*?)```/g, (_, code) => {
    return `<pre class="code-block">${code.trim()}</pre>`;
  });

  // Replace Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  // Replace Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Replace Italic
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

  // Replace Headers (### to #)
  html = html.replace(/^(?:######)\s+(.+)$/gm, '<h6 class="md-heading md-heading-6">$1</h6>');
  html = html.replace(/^(?:#####)\s+(.+)$/gm, '<h5 class="md-heading md-heading-5">$1</h5>');
  html = html.replace(/^(?:####)\s+(.+)$/gm, '<h4 class="md-heading md-heading-4">$1</h4>');
  html = html.replace(/^(?:###)\s+(.+)$/gm, '<h3 class="md-heading md-heading-3">$1</h3>');
  html = html.replace(/^(?:##)\s+(.+)$/gm, '<h2 class="md-heading md-heading-2">$1</h2>');
  html = html.replace(/^(?:#)\s+(.+)$/gm, '<h1 class="md-heading md-heading-1">$1</h1>');

  // Replace bullet points (unordered lists)
  const lines = html.split('\n');
  let inList = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('- ') || line.startsWith('* ') || line.startsWith('• ')) {
      const content = line.replace(/^(?:-\s*|\*\s*|•\s*)/, '');
      lines[i] = (inList ? '' : '<ul class="md-list">') + `<li class="md-list-item">${content}</li>`;
      inList = true;
    } else if (inList && line !== "") {
      lines[i] = '</ul>' + lines[i];
      inList = false;
    }
  }
  if (inList) {
    lines[lines.length - 1] += '</ul>';
  }
  html = lines.join('\n');

  // Convert remaining newlines to break tags
  html = html.replace(/\n/g, "<br/>");

  return html;
};

// Strips out all raw markdown formatting tags (like **, _, #) for clean plain text exports
const stripMarkdown = (markdown: string): string => {
  if (!markdown) return "";
  let text = markdown;

  // Remove bold markdown (**text** or __text__)
  text = text.replace(/\*\*([^*]+)\*\*/g, "$1");
  text = text.replace(/__([^_]+)__/g, "$1");

  // Remove italic markdown (*text* or _text_)
  text = text.replace(/\*([^*]+)\*/g, "$1");
  text = text.replace(/_([^_]+)_/g, "$1");

  // Remove markdown headers
  text = text.replace(/^(?:#+)\s+(.+)$/gm, "$1");

  // Remove blockquotes (> )
  text = text.replace(/^>\s+(.+)$/gm, "$1");

  // Remove inline code block (`code`)
  text = text.replace(/`([^`]+)`/g, "$1");

  // Remove code blocks (```code```)
  text = text.replace(/```([\s\S]*?)```/g, "$1");

  return text;
};

const expandShortcutPrompt = (text: string) => {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return text;

  const shortcuts: Record<string, string> = {
    "q&a": "Answer the question based on the uploaded content and explain clearly.",
    "qa": "Answer the question based on the uploaded content and explain clearly.",
    "faq": "Summarize the uploaded content and answer the most relevant questions clearly.",
    "who": "Identify who is being referred to in the uploaded content and explain their role or significance.",
    "what": "Explain what the uploaded content describes or refers to in detail.",
    "where": "Locate and explain where the relevant information appears in the uploaded content.",
    "when": "Explain when the event, date, or period mentioned in the uploaded content occurs.",
    "why": "Explain the reason, purpose, or cause described in the uploaded content.",
    "how": "Explain how the process, method, or event works based on the uploaded content.",
    "summary": "Summarize the uploaded content clearly and concisely.",
    "summarize": "Summarize the uploaded content clearly and concisely.",
    "search": "Search the uploaded content for the requested information and answer directly.",
    "find": "Find the requested information in the uploaded content and explain it clearly.",
    "analyze": "Analyze the uploaded content and provide a useful explanation.",
    "review": "Review the uploaded content and highlight the key points.",
    "explain": "Explain the uploaded content clearly and in detail.",
    "translate": "Translate the relevant information from the uploaded content into clear language.",
    "extract": "Extract the key information from the uploaded content and present it clearly.",
    "compare": "Compare the relevant points in the uploaded content and explain the differences.",
    "list": "List the important points from the uploaded content clearly.",
  };

  const direct = shortcuts[normalized.replace(/[^a-z0-9]+/g, "")];
  if (direct) return direct;

  return text;
};

const getPrintThemeCss = () => {
  const computed = typeof window !== "undefined" ? getComputedStyle(document.documentElement) : null;
  const vars = {
    bgApp: computed?.getPropertyValue("--bg-app").trim() || "#09090b",
    panel: computed?.getPropertyValue("--panel").trim() || "#0c0c0e",
    surface: computed?.getPropertyValue("--surface").trim() || "#111827",
    surfaceSoft: computed?.getPropertyValue("--surface-soft").trim() || "#0f172a",
    textTheme: computed?.getPropertyValue("--text-theme").trim() || "#e5e7eb",
    textSecondary: computed?.getPropertyValue("--text-secondary").trim() || "#94a3b8",
    borderTheme: computed?.getPropertyValue("--border-theme").trim() || "rgba(148, 163, 184, 0.2)",
    accent: "#10b981",
  };

  return `
    :root {
      --bg-app: ${vars.bgApp};
      --panel: ${vars.panel};
      --surface: ${vars.surface};
      --surface-soft: ${vars.surfaceSoft};
      --text-theme: ${vars.textTheme};
      --text-secondary: ${vars.textSecondary};
      --border-theme: ${vars.borderTheme};
      --accent: ${vars.accent};
    }

    * {
      box-sizing: border-box;
    }

    body {
      font-family: 'Inter', sans-serif;
      color: var(--text-theme);
      background-color: var(--bg-app);
      margin: 0;
      padding: 40px;
      position: relative;
    }

    .watermark-container {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: -1;
      pointer-events: none;
      user-select: none;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      grid-template-rows: repeat(4, 1fr);
      gap: 40px;
      opacity: 0.05;
      transform: rotate(-25deg) scale(1.2);
    }

    .watermark-text {
      color: var(--accent);
      font-size: 3rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      display: flex;
      align-items: center;
      justify-content: center;
      white-space: nowrap;
    }

    .header {
      border-bottom: 2px solid rgba(148, 163, 184, 0.3);
      padding-bottom: 20px;
      margin-bottom: 30px;
      position: relative;
    }

    .header h1 {
      font-size: 24px;
      margin: 0 0 8px 0;
      color: var(--text-theme);
    }

    .header .metadata {
      font-size: 13px;
      color: var(--text-secondary);
    }

    .watermark-badge {
      position: absolute;
      top: 0;
      right: 0;
      background-color: var(--accent);
      color: white;
      font-size: 11px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 9999px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .messages {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .message {
      padding: 16px;
      border-radius: 8px;
      background-color: var(--surface);
      border: 1px solid var(--border-theme);
      page-break-inside: avoid;
    }

    .message.user {
      background-color: #f3f4f6;
      border-left: 4px solid #4b5563;
      color: #111827;
    }

    .message.assistant {
      background-color: var(--surface-soft);
      border-left: 4px solid var(--accent);
    }

    .sender {
      font-weight: 600;
      font-size: 14px;
      margin-bottom: 4px;
      color: var(--text-theme);
    }

    .time {
      font-size: 11px;
      color: var(--text-secondary);
      margin-bottom: 12px;
    }

    .thought-process {
      background-color: #fef3c7;
      border: 1px solid #fcd34d;
      border-radius: 6px;
      padding: 10px;
      margin-bottom: 12px;
      font-size: 12px;
      color: #92400e;
    }

    .content {
      font-size: 14px;
      line-height: 1.6;
      color: var(--text-secondary);
    }

    .code-block {
      background: var(--surface-soft);
      padding: 12px;
      border-radius: 6px;
      font-family: monospace;
      white-space: pre-wrap;
      font-size: 12px;
      margin: 10px 0;
      border: 1px solid var(--border-theme);
      color: var(--text-theme);
    }

    .inline-code {
      background: var(--surface);
      padding: 2px 5px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 12px;
      border: 1px solid var(--border-theme);
      color: var(--text-theme);
    }

    .md-heading {
      margin: 10px 0;
      font-weight: bold;
      color: var(--text-theme);
    }
    .md-heading-1 { font-size: 22px; }
    .md-heading-2 { font-size: 18px; }
    .md-heading-3 { font-size: 16px; }
    .md-heading-4 { font-size: 14px; }
    .md-heading-5 { font-size: 13px; }
    .md-heading-6 { font-size: 12px; }

    .md-list {
      margin: 8px 0;
      padding-left: 20px;
      list-style-type: disc;
    }

    .md-list-item {
      margin-bottom: 4px;
      line-height: 1.6;
      color: var(--text-secondary);
    }

    .footer {
      margin-top: 50px;
      border-top: 1px solid rgba(148, 163, 184, 0.3);
      padding-top: 20px;
      text-align: center;
      font-size: 12px;
      color: var(--text-secondary);
      page-break-inside: avoid;
    }

    @media print {
      body {
        padding: 20px;
      }
    }
  `;
};

// Collapsible reasoning block like DeepSeek
function ThinkingAccordion({ text, completed }: { text: string; completed: boolean }) {
  const [isOpen, setIsOpen] = useState(true);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const isTracking = useRef<boolean>(false);
  const startTime = useRef<number>(Date.now());

  // Set up highly responsive thinking stopwatch
  useEffect(() => {
    if (!completed) {
      if (!isTracking.current) {
        startTime.current = Date.now();
        isTracking.current = true;
      }
      const interval = setInterval(() => {
        const diff = (Date.now() - startTime.current) / 1000;
        setElapsedTime(Number(diff.toFixed(1)));
      }, 100);
      return () => clearInterval(interval);
    } else {
      isTracking.current = false;
      // If mounted as completed, estimate a realistic duration based on the character length of the thoughts
      if (elapsedTime === 0) {
        const estimated = Math.max(1.5, Math.round((text.length / 42) * 10) / 10);
        setElapsedTime(estimated);
      }
    }
  }, [completed, text]);

  return (
    <div className="mb-4 border border-theme rounded-xl bg-surface-soft/40 overflow-hidden text-left shadow-sm">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-2.5 flex items-center justify-between text-[11px] font-medium text-secondary hover:text-theme bg-surface/10 hover:bg-surface/20 transition-all border-none outline-none cursor-pointer select-none"
      >
        <div className="flex items-center gap-2">
          {completed ? (
            <div className="w-4 h-4 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/20 shrink-0">
              <Check className="w-2.5 h-2.5" />
            </div>
          ) : (
            <div className="relative flex items-center justify-center shrink-0">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
            </div>
          )}
          <span className="font-semibold text-secondary">
            {completed ? "Thought Process" : "Thinking Process"}
          </span>
          <span className="text-secondary font-mono text-[10px] bg-surface-soft/40 px-1.5 py-0.5 rounded border border-theme">
            {completed ? `Thought for ${elapsedTime}s` : `${elapsedTime}s`}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-secondary">
          <span>{completed ? "Expanded" : "Analyzing..."}</span>
          {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </button>

      {isOpen && (
        <div className="px-4 py-3 border-t border-theme bg-surface-soft/40 text-xs font-mono text-secondary space-y-2">
          {/* Simulated search stages */}
          <div className="flex flex-col gap-1 pb-2 border-b border-theme font-sans text-[10px] text-secondary">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
              <span>Analyzing intent and keywords</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${completed ? "bg-emerald-400" : "bg-amber-400 animate-pulse"}`} />
              <span>{completed ? "Retrieved 'www' context indexes" : "Retrieving 'www' context indexes..."}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${completed ? "bg-emerald-400" : "bg-surface"}`} />
              <span>{completed ? "Formulated response references" : "Formulating response references..."}</span>
            </div>
          </div>

          <div className="whitespace-pre-wrap text-[11px] leading-relaxed font-sans text-secondary mt-2 pl-3 border-l-2 border-emerald-500/40 bg-surface/5 py-1">
            {text}
          </div>
        </div>
      )}
    </div>
  );
}

// Extended SpeechRecognition type for TypeScript
interface SpeechRecognitionEvent {
  resultIndex: number;
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
    };
  };
}

interface SpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onstart: () => void;
  onend: () => void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: any) => void;
}

function getDocumentPreviewStyle(file: File | null) {
  const name = file?.name?.toLowerCase() || "";
  if (name.endsWith(".doc") || name.endsWith(".docx")) {
    return {
      fontFamily: '"Segoe UI", "Arial", sans-serif',
      fontSize: "15px",
      lineHeight: 1.65,
      backgroundColor: "#f8f6ef",
      color: "#1f2937",
      borderColor: "#d8cdb3",
    };
  }
  if (name.endsWith(".pdf")) {
    return {
      fontFamily: '"Georgia", "Times New Roman", serif',
      fontSize: "15px",
      lineHeight: 1.7,
      backgroundColor: "#fdfbf6",
      color: "#2c2a24",
      borderColor: "#d9d0b8",
    };
  }
  if (name.endsWith(".ppt") || name.endsWith(".pptx")) {
    return {
      fontFamily: '"Calibri", "Segoe UI", sans-serif',
      fontSize: "15px",
      lineHeight: 1.6,
      backgroundColor: "#f5f7fb",
      color: "#223042",
      borderColor: "#c6cfdf",
    };
  }
  if (name.endsWith(".xls") || name.endsWith(".xlsx") || name.endsWith(".csv")) {
    return {
      fontFamily: '"Arial", sans-serif',
      fontSize: "14px",
      lineHeight: 1.5,
      backgroundColor: "#f7fbf7",
      color: "#16311d",
      borderColor: "#c9dec8",
    };
  }
  return {
    fontFamily: '"Inter", "Segoe UI", sans-serif',
    fontSize: "14px",
    lineHeight: 1.6,
    backgroundColor: "#f9fafb",
    color: "#111827",
    borderColor: "#d1d5db",
  };
}

export default function ChatWindow() {
  const {
    user,
    activeConversationId,
    setActiveConversationId,
    createConversation,
    conversations,
    messages,
    documents,
    isStreaming,
    sendChatMessage,
    uploadFile,
    importText,
    isThinkingEnabled,
    setThinkingEnabled,
    isSearchEnabled,
    setSearchEnabled,
    isOfflineMode,
    setOfflineMode,
    isSidebarOpen,
    setSidebarOpen,
    theme,
    chatBackground,
  } = useChatStore();

  const [input, setInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [docSearchQuery, setDocSearchQuery] = useState("");
  const [isKBOpen, setIsKBOpen] = useState(typeof window !== "undefined" ? window.innerWidth >= 1024 : true);
  const [isRecording, setIsRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [currentlyPlayingId, setCurrentlyPlayingId] = useState<string | number | null>(null);
  const [isTtsLoading, setIsTtsLoading] = useState<string | number | null>(null);
  const [ttsLanguage, setTtsLanguage] = useState("en-US");
  const [showTtsLanguagePicker, setShowTtsLanguagePicker] = useState<string | number | null>(null);
  const [messageTranslations, setMessageTranslations] = useState<Record<string | number, { language: string; text: string; loading: boolean; error: string | null }>>({});
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [activeAction, setActiveAction] = useState<"detect" | "search" | null>(null);
  const [showAnalysisOption, setShowAnalysisOption] = useState(false);
  const [lastAnalyzedFileName, setLastAnalyzedFileName] = useState<string | null>(null);
  const [isObjectDetectionOpen, setIsObjectDetectionOpen] = useState(false);
  const [objectDetectionPreview, setObjectDetectionPreview] = useState<string | null>(null);
  const [objectDetectionFile, setObjectDetectionFile] = useState<File | null>(null);
  const [previewItem, setPreviewItem] = useState<{ kind: "file"; file: File } | { kind: "document"; document: DocumentRecord } | null>(null);
  const [previewText, setPreviewText] = useState<string>("");
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [inlineDetectionState, setInlineDetectionState] = useState<InlineDetectionState>({
    isVisible: false,
    isDetecting: false,
    imageSrc: null,
    objects: [],
    error: null,
  });

  const chatSurfaceStyle: React.CSSProperties = (() => {
    switch (chatBackground.type) {
      case "gradient":
        return {
          backgroundImage: chatBackground.gradient || "linear-gradient(135deg, #020617 0%, #2563eb 100%)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat"
        };
      case "image":
        return {
          backgroundImage: chatBackground.imageUrl
            ? `linear-gradient(135deg, rgba(2, 6, 23, 0.7), rgba(2, 6, 23, 0.35)), url(${chatBackground.imageUrl})`
            : "linear-gradient(135deg, rgba(2, 6, 23, 0.75), rgba(15, 23, 42, 0.4))",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat"
        };
      case "solid":
      default:
        return {
          backgroundColor: chatBackground.color || "#0f172a"
        };
    }
  })();

  const handlePrintChat = () => {
    const activeConv = conversations.find((c) => c.id === activeConversationId);
    if (!activeConv || messages.length === 0) return;

    // Create a new window for a clean print
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Please allow popups to print the conversation.");
      return;
    }

    const messagesHtml = messages
      .map((m) => {
        const isUser = m.role === "user";
        const sender = isUser ? (user?.fullName || "User") : "SucharAI";
        // Clean thinking content for print if thinking exists
        const parsed = !isUser ? parseThinkingContent(m.content) : null;
        const mainContent = parsed ? parsed.cleanContent : m.content;
        const thoughtContent = parsed && parsed.thinkingText ? `
          <div class="thought-process">
            <strong>Thought Process (${parsed.completed ? 'Completed' : 'Running'}):</strong>
            <p>${cleanMarkdownToHtml(parsed.thinkingText)}</p>
          </div>
        ` : "";

        return `
          <div class="message ${isUser ? 'user' : 'assistant'}">
            <div class="sender">${sender}</div>
            <div class="time">${new Date(m.createdAt).toLocaleString()}</div>
            ${thoughtContent}
            <div class="content">${cleanMarkdownToHtml(mainContent)}</div>
          </div>
        `;
      })
      .join("");

    const themeCss = getPrintThemeCss();
    const htmlContent = `
      <html>
        <head>
          <title>${activeConv.title} - SucharAI Export</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
            ${themeCss}
          </style>
        </head>
        <body>
          <div class="watermark-container">
            <div class="watermark-text">Expert</div>
            <div class="watermark-text">Expert</div>
            <div class="watermark-text">Expert</div>
            <div class="watermark-text">Expert</div>
            <div class="watermark-text">Expert</div>
            <div class="watermark-text">Expert</div>
            <div class="watermark-text">Expert</div>
            <div class="watermark-text">Expert</div>
            <div class="watermark-text">Expert</div>
            <div class="watermark-text">Expert</div>
            <div class="watermark-text">Expert</div>
            <div class="watermark-text">Expert</div>
          </div>

          <div class="header">
            <h1>${activeConv.title}</h1>
            <div class="metadata">
              Exported on ${new Date().toLocaleString()} | User: ${user?.fullName || "User"} (${user?.email || ""})
            </div>
            <div class="watermark-badge">Expert</div>
          </div>
          
          <div class="messages">
            ${messagesHtml}
          </div>

          <div class="footer">
            Generated via <strong>SucharAI</strong> | Developed by Sujan Chandra Ray | Google Search <strong>sucharbd</strong>
          </div>

          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
              }, 500);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    setIsExportDropdownOpen(false);
  };

  const handleExportText = (format: "txt" | "md") => {
    const activeConv = conversations.find((c) => c.id === activeConversationId);
    if (!activeConv || messages.length === 0) return;

    let textContent = "";
    if (format === "md") {
      textContent = `<!--
==================================================================
                 WATERMARK: Expert
     Developed by Sujan Chandra Ray - Search Google: "sucharbd"
==================================================================
-->

# SucharAI Chat Export: ${activeConv.title}
*Exported on: ${new Date().toLocaleString()}*
*User: ${user?.fullName || "User"} (${user?.email || ""})*

---

`;
      textContent += messages
        .map((m) => {
          const sender = m.role === "user" ? `**${user?.fullName || "User"}**` : `**SucharAI (Assistant)**`;
          const parsed = m.role === "assistant" ? parseThinkingContent(m.content) : null;
          const mainContent = parsed ? parsed.cleanContent : m.content;
          const thoughtPart = parsed && parsed.thinkingText ? `> **Thought Process:**\n> ${parsed.thinkingText.replace(/\n/g, "\n> ")}\n\n` : "";

          return `### ${sender} _(${new Date(m.createdAt).toLocaleString()})_\n\n${thoughtPart}${mainContent}\n\n---\n`;
        })
        .join("\n");

      textContent += `\n\n_Watermark: Generated via SucharAI | Developed by Sujan Chandra Ray (sucharbd)_`;
    } else {
      textContent = `==================================================================
                 WATERMARK: Expert
     Developed by Sujan Chandra Ray - Search Google: "sucharbd"
==================================================================

Chat Title: ${activeConv.title}
Exported on: ${new Date().toLocaleString()}
User: ${user?.fullName || "User"} (${user?.email || ""})

==================================================================

`;
      textContent += messages
        .map((m) => {
          const sender = m.role === "user" ? (user?.fullName || "User") : "SucharAI";
          const parsed = m.role === "assistant" ? parseThinkingContent(m.content) : null;
          const mainContent = parsed ? parsed.cleanContent : m.content;
          const thoughtPart = parsed && parsed.thinkingText ? `[Thought Process]:\n${stripMarkdown(parsed.thinkingText)}\n\n` : "";

          return `[${new Date(m.createdAt).toLocaleString()}] ${sender}:\n${thoughtPart}${stripMarkdown(mainContent)}\n\n--------------------------------------------------\n`;
        })
        .join("\n");

      textContent += `\n\n[SucharAI Watermark - Developed by Sujan Chandra Ray (sucharbd)]`;
    }

    const blob = new Blob([textContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${activeConv.title.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_sucharai_export.${format}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setIsExportDropdownOpen(false);
  };

  const [isDragging, setIsDragging] = useState(false);
  const [isPasteImportOpen, setIsPasteImportOpen] = useState(false);
  const [pasteFilename, setPasteFilename] = useState("");
  const [pasteContent, setPasteContent] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Sync Knowledge Base panel open state on screen width change
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsKBOpen(true);
      } else {
        setIsKBOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Keep the assistant in the mode the user selected; do not switch automatically on network changes.

  const lastMessageContent = messages[messages.length - 1]?.content;

  // Scroll to bottom when messages array or last message content changes
  useEffect(() => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 250;
      if (isAtBottom || isStreaming) {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, lastMessageContent, isStreaming]);

  // Handle Speech Recognition setup
  useEffect(() => {
    const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognitionClass) {
      const recognition = new SpeechRecognitionClass() as SpeechRecognition;
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-US";

      recognition.onstart = () => setIsRecording(true);
      recognition.onend = () => setIsRecording(false);
      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const transcript = event.results[0][0].transcript;
        setInput((prev) => (prev ? prev + " " + transcript : transcript));
      };
      recognition.onerror = () => setIsRecording(false);

      recognitionRef.current = recognition;
    }
  }, []);

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      alert("Speech recognition is not supported in this browser. Try Chrome or Safari.");
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.start();
    }
  };

  const clearUploadedFiles = () => {
    setUploadedFiles([]);
    setObjectDetectionFile(null);
    setObjectDetectionPreview(null);
    setInlineDetectionState({
      isVisible: false,
      isDetecting: false,
      imageSrc: null,
      objects: [],
      error: null,
    });
    setShowAnalysisOption(false);
    setLastAnalyzedFileName(null);
  };

  const closePreview = () => {
    setPreviewItem(null);
    setPreviewText("");
    setPreviewImageUrl(null);
  };

  const openPreview = async (item: { kind: "file"; file: File } | { kind: "document"; document: DocumentRecord }) => {
    setPreviewItem(item);
    setPreviewText("");
    setPreviewImageUrl(null);

    if (item.kind === "file") {
      const file = item.file;
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = () => setPreviewImageUrl(reader.result as string);
        reader.readAsDataURL(file);
        return;
      }

      const isTextLike = file.type.startsWith("text/") || [
        "application/json",
        "application/xml",
        "application/javascript",
        "application/typescript",
        "application/x-yaml",
        "application/yaml"
      ].includes(file.type) || /\.(txt|md|json|csv|ts|tsx|js|jsx|py|html|css|xml|yaml|yml)$/i.test(file.name);

      if (isTextLike) {
        try {
          const text = await file.text();
          setPreviewText(text.slice(0, 20000));
        } catch {
          setPreviewText("The file could not be read as text.");
        }
      }
      return;
    }

    const documentText = (item.document.content || item.document.text || "").trim();
    if (documentText) {
      setPreviewText(documentText.slice(0, 20000));
    }
  };

  const handleOpenObjectDetectionPanel = () => {
    const latestImageFile = uploadedFiles.find((file) => file.type.startsWith("image/"));
    if (latestImageFile) {
      setObjectDetectionFile(latestImageFile);
      const reader = new FileReader();
      reader.onload = () => setObjectDetectionPreview(reader.result as string);
      reader.readAsDataURL(latestImageFile);
    } else {
      setObjectDetectionFile(null);
      setObjectDetectionPreview(null);
    }
    setIsObjectDetectionOpen(true);
  };

  const handleInjectObjectDetectionPrompt = (prompt: string) => {
    setInput(prompt);
    setIsObjectDetectionOpen(false);
  };

  useEffect(() => {
    if (!isObjectDetectionOpen) {
      setInlineDetectionState((current) => ({ ...current, isVisible: false }));
    }
  }, [isObjectDetectionOpen]);

  const handleObjectDetectionStateChange = (state: { isDetecting: boolean; imageSrc: string | null; objects: Array<{ box_2d: [number, number, number, number]; label: string; confidence: number }>; error: string | null }) => {
    setInlineDetectionState({
      isVisible: isObjectDetectionOpen && (state.isDetecting || Boolean(state.imageSrc) || state.objects.length > 0 || Boolean(state.error)),
      ...state,
    });
  };

  const handleObjectDetectionResult = async (objects: Array<{ label: string; confidence: number }>, sourceName?: string) => {
    if (!objects.length) {
      const fallbackMessage = sourceName
        ? `No distinct objects could be identified in ${sourceName}.`
        : "No distinct objects could be identified in the selected image.";
      if (activeConversationId) {
        await sendChatMessage(activeConversationId, fallbackMessage, () => { });
      }
      return;
    }

    const summary = objects
      .map((obj) => `${obj.label} (${Math.round(obj.confidence * 100)}% confidence)`)
      .join("; ");
    const message = `Object detection result${sourceName ? ` for ${sourceName}` : ""}: ${summary}`;

    if (activeConversationId) {
      await sendChatMessage(activeConversationId, message, () => { });
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() && !uploadedFiles.length) return;
    if (isStreaming) return;

    const textToSend = input.trim();
    const resolvedSearchPrompt = expandShortcutPrompt(textToSend);
    setInput("");

    if (uploadedFiles.length) {
      let currentConvId = activeConversationId;
      if (!currentConvId) {
        try {
          const queryTitle = textToSend.split(/\s+/).filter(Boolean).slice(0, 4).join(" ") || uploadedFiles[uploadedFiles.length - 1].name;
          currentConvId = await createConversation(`File Search: ${queryTitle}`);
          setActiveConversationId(currentConvId, true);
        } catch (err) {
          console.error("Failed to auto-create conversation for uploaded file search:", err);
          alert("Could not start conversation for file search");
          return;
        }
      }

      if (currentConvId) {
        const latestImage = uploadedFiles.find((file) => file.type.startsWith("image/"));
        if (latestImage) {
          setObjectDetectionFile(latestImage);
          const reader = new FileReader();
          reader.onload = () => {
            setObjectDetectionPreview(reader.result as string);
            setInlineDetectionState({
              isVisible: true,
              isDetecting: true,
              imageSrc: reader.result as string,
              objects: [],
              error: null,
            });
          };
          reader.readAsDataURL(latestImage);
        }
        await runInlineFileSearch(resolvedSearchPrompt, currentConvId);
      }
      return;
    }

    // Check if it's a copy-paste import command: /import filename.ext content
    if (textToSend.startsWith("/import ")) {
      const commandBody = textToSend.substring(8).trim();
      const firstSpaceIdx = commandBody.search(/\s/);
      let filename = "";
      let content = "";

      if (firstSpaceIdx === -1) {
        filename = commandBody;
        content = "";
      } else {
        filename = commandBody.substring(0, firstSpaceIdx).trim();
        content = commandBody.substring(firstSpaceIdx).trim();
      }

      if (!filename) {
        alert("Please specify a filename. E.g. `/import code.py print('hello')` or paste content.");
        return;
      }

      let currentConvId = activeConversationId;
      if (!currentConvId) {
        try {
          currentConvId = await createConversation(`Analysis: ${filename}`);
          setActiveConversationId(currentConvId, true);
        } catch (err) {
          console.error(err);
          alert("Failed to start a conversation for this document.");
          return;
        }
      }

      setUploading(true);
      try {
        await importText(currentConvId, filename, content);
      } catch (err: any) {
        alert(err.response?.data?.detail || "Failed to import content");
      } finally {
        setUploading(false);
      }
      return;
    }

    let currentConvId = activeConversationId;
    if (!currentConvId) {
      try {
        const chatTitle = textToSend.split(" ").slice(0, 4).join(" ") || "New Chat";
        currentConvId = await createConversation(chatTitle);
        setActiveConversationId(currentConvId, true);
      } catch (err) {
        console.error("Failed to auto-create conversation:", err);
        alert("Could not start conversation");
        return;
      }
    }

    if (currentConvId) {
      await sendChatMessage(currentConvId, textToSend, () => { });
    }
  };

  const handleAnalysisSelection = async () => {
    if (!uploadedFiles.length) return;

    const file = uploadedFiles[uploadedFiles.length - 1];
    let targetConvId = activeConversationId;
    if (!targetConvId) {
      try {
        const baseTitle = (input.trim() || file.name).split(/\s+/).filter(Boolean).slice(0, 4).join(" ") || file.name;
        targetConvId = await createConversation(`Analysis: ${baseTitle}`);
        setActiveConversationId(targetConvId, true);
      } catch (err) {
        console.error(err);
        alert("Failed to start a conversation for analysis.");
        return;
      }
    }

    setUploading(true);
    try {
      const analysisPrompt = `Analyze the uploaded file "${file.name}" in detail and summarize the most important contents, structure, and key takeaways.`;
      await sendChatMessage(targetConvId, analysisPrompt, () => { });
      setUploadedFiles([]);
      setShowAnalysisOption(false);
      setLastAnalyzedFileName(file.name);
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.detail || "Failed to analyze uploaded file.");
    } finally {
      setUploading(false);
    }
  };

  const createConversationForUpload = async (suggestedTitle: string) => {
    let targetConvId = activeConversationId;
    if (!targetConvId) {
      targetConvId = await createConversation(suggestedTitle);
      setActiveConversationId(targetConvId, true);
    }
    return targetConvId;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const uploadQuery = input.trim() || files[0].name;
    let targetConvId: string | number | null = activeConversationId;
    try {
      const suggestedTitle = uploadQuery.split(/\s+/).filter(Boolean).slice(0, 4).join(" ") || files[0].name;
      targetConvId = await createConversationForUpload(`Search: ${suggestedTitle}`);
    } catch (err) {
      console.error(err);
      alert("Failed to start a conversation for these documents.");
      return;
    }

    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadedFiles((current) => [...current, file]);
        const uploadResult = await uploadFile(targetConvId, file);
        if (uploadResult?.text) {
          setPreviewItem({ kind: "file", file });
          setPreviewText(uploadResult.text.slice(0, 20000));
          setPreviewImageUrl(null);
        }
      }

      if (targetConvId) {
        await runInlineFileSearch(undefined, targetConvId, Array.from(files));
      }
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to upload files");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const runInlineDetection = async (filesOverride?: File[]) => {
    const filesToUse = filesOverride ?? uploadedFiles;
    if (!filesToUse.length) {
      alert("Please upload a file first to detect objects.");
      return;
    }

    const file = filesToUse[filesToUse.length - 1];
    const formData = new FormData();
    formData.append("image", file);

    setUploading(true);
    setActiveAction("detect");
    try {
      const response = await api.post("/api/object-detection", formData);
      const objects = response.data?.objects || [];
      const objectSummary = objects.length
        ? objects.map((obj: any) => `${obj.label} (${Math.round(obj.confidence * 100)}%)`).join(", ")
        : "No objects detected.";

      const content = `Detected Objects:\n${objectSummary}`;
      let targetConvId = activeConversationId;
      if (!targetConvId) {
        const baseTitle = (input.trim() || file.name).split(/\s+/).filter(Boolean).slice(0, 4).join(" ") || file.name;
        targetConvId = await createConversation(`Image Analysis: ${baseTitle}`);
        setActiveConversationId(targetConvId, true);
      }
      if (targetConvId) {
        await sendChatMessage(targetConvId, content, () => { });
        await handleObjectDetectionResult(objects, file.name);
        setLastAnalyzedFileName(file.name);
        setShowAnalysisOption(true);
      }
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.detail || "Failed to detect objects. Please try again.");
    } finally {
      setUploading(false);
      setActiveAction(null);
    }
  };

  const runInlineFileSearch = async (queryOverride?: string, conversationIdOverride?: string | number | null, filesOverride?: File[]) => {
    const filesToUse = filesOverride ?? uploadedFiles;
    if (!filesToUse.length) {
      alert("Please upload a file first to search its contents.");
      return;
    }

    const file = filesToUse[filesToUse.length - 1];
    const rawQuery = (queryOverride ?? input.trim()).trim() || "Summarize this file and answer the user's question.";
    const query = expandShortcutPrompt(rawQuery);
    const isImageFile = file.type?.startsWith("image/");

    if (isImageFile) {
      const previewReader = new FileReader();
      previewReader.onload = () => {
        setInlineDetectionState({
          isVisible: true,
          isDetecting: true,
          imageSrc: previewReader.result as string,
          objects: [],
          error: null,
        });
      };
      previewReader.readAsDataURL(file);
    }

    setUploading(true);
    setActiveAction("search");
    try {
      let answer = "No content could be extracted from that file.";

      const formData = new FormData();
      formData.append("file", file);
      formData.append("query", query);
      const userText = queryOverride ?? input.trim();
      if (userText) {
        formData.append("userText", userText);
      }

      try {
        const fastConvertFormData = new FormData();
        fastConvertFormData.append("file", file);
        const fastResponse = await api.post("/api/fast-convert", fastConvertFormData);
        const fastConvertedText = fastResponse.data?.extractedText || "";
        if (fastConvertedText) {
          const cleanedText = fastConvertedText.slice(0, 20000);
          setInput(cleanedText);
          setPreviewItem({ kind: "file", file });
          setPreviewText(cleanedText);
          setPreviewImageUrl(null);
        }
      } catch (fastConvertError) {
        console.warn("Fast conversion failed, continuing with the full search flow:", fastConvertError);
      }

      const response = await api.post("/api/file-search", formData);
      answer = response.data?.answer || answer;
      const extractedText = response.data?.extractedText || "";
      if (extractedText) {
        const cleanedText = extractedText.slice(0, 20000);
        setInput(cleanedText);
        setPreviewItem({ kind: "file", file });
        setPreviewText(cleanedText);
        setPreviewImageUrl(null);
      }

      setInlineDetectionState((current) => ({
        ...current,
        isVisible: isImageFile || current.isVisible,
        isDetecting: false,
        error: null,
      }));

      let targetConvId = conversationIdOverride ?? activeConversationId;
      if (!targetConvId) {
        const searchTitle = (queryOverride ?? input.trim()).split(/\s+/).filter(Boolean).slice(0, 4).join(" ") || file.name;
        targetConvId = await createConversation(`File Search: ${searchTitle}`);
        setActiveConversationId(targetConvId, true);
      }
      if (targetConvId) {
        await sendChatMessage(targetConvId, answer, () => { });
      }
    } catch (err: any) {
      console.error(err);
      const detail = err?.response?.data?.detail || err?.message || "Failed to search file content.";
      setInlineDetectionState((current) => ({
        ...current,
        isVisible: isImageFile || current.isVisible,
        isDetecting: false,
        error: detail,
      }));
      alert(detail);
    } finally {
      setUploading(false);
      setActiveAction(null);
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const files = e.clipboardData?.files;
    if (files && files.length > 0) {
      e.preventDefault(); // Intercept file paste to handle programmatically

      let targetConvId = activeConversationId;
      try {
        targetConvId = await createConversationForUpload(`Search: ${files[0].name}`);
      } catch (err) {
        console.error(err);
        alert("Failed to start a conversation for pasted files.");
        return;
      }

      setUploading(true);
      try {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          setUploadedFiles((current) => [...current, file]);
          await uploadFile(targetConvId, file);
        }

        if (targetConvId) {
          const promptText = files[0]?.name || "Analyze this uploaded file";
          await runInlineFileSearch(promptText, targetConvId, Array.from(files));
        }
      } catch (err: any) {
        alert(err.response?.data?.detail || "Failed to upload pasted files");
      } finally {
        setUploading(false);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      let targetConvId = activeConversationId;
      try {
        targetConvId = await createConversationForUpload(`Search: ${files[0].name}`);
      } catch (err) {
        console.error(err);
        alert("Failed to start a conversation for dropped files.");
        return;
      }

      setUploading(true);
      try {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          setUploadedFiles((current) => [...current, file]);
          await uploadFile(targetConvId, file);
        }

        if (targetConvId) {
          const promptText = files[0]?.name || "Analyze this uploaded file";
          await runInlineFileSearch(promptText, targetConvId, Array.from(files));
        }
      } catch (err: any) {
        alert(err.response?.data?.detail || "Failed to upload dropped files");
      } finally {
        setUploading(false);
      }
    }
  };
  const getApiBaseUrl = () => {
    const envUrl = (import.meta.env as Record<string, any>).VITE_API_BASE_URL || (import.meta.env as Record<string, any>).VITE_APP_API_BASE_URL;
    if (envUrl && typeof envUrl === "string" && envUrl.trim() !== "") {
      return envUrl.trim().replace(/\/$/, "");
    }
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    if (!origin) {
      return "http://localhost:3000";
    }
    if (origin.startsWith("capacitor://") || origin.startsWith("file://")) {
      return "http://localhost:3000";
    }
    if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
      return origin.replace(/\/$/, "").includes(":") && !origin.replace(/\/$/, "").endsWith(":3000")
        ? "http://localhost:3000"
        : origin.replace(/\/$/, "");
    }
    return origin.replace(/\/$/, "");
  };

  const translateMessageText = async (msg: Message, languageCode: string) => {
    const normalizedLanguage = languageCode || "en-US";
    setMessageTranslations((prev) => ({
      ...prev,
      [msg.id]: {
        language: normalizedLanguage,
        text: prev[msg.id]?.text || "",
        loading: true,
        error: null,
      },
    }));

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${getApiBaseUrl()}/api/messages/${msg.id}/translate?lang=${encodeURIComponent(normalizedLanguage)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to translate message");
      }

      const data = await response.json();
      const translatedText = typeof data?.translatedText === "string" ? data.translatedText : "";
      setMessageTranslations((prev) => ({
        ...prev,
        [msg.id]: {
          language: normalizedLanguage,
          text: translatedText || msg.content,
          loading: false,
          error: null,
        },
      }));
    } catch (err) {
      console.error(err);
      setMessageTranslations((prev) => ({
        ...prev,
        [msg.id]: {
          language: normalizedLanguage,
          text: "",
          loading: false,
          error: "Translation is unavailable right now.",
        },
      }));
    }
  };

  const playTTS = async (msg: Message, languageOverride?: string, textOverride?: string) => {
    const sourceText = textOverride ?? msg.content ?? "";
    const textToSpeak = stripMarkdown(sourceText).replace(/\s+/g, " ").trim();
    const selectedLanguage = languageOverride || ttsLanguage || "en-US";
    if (!textToSpeak) {
      alert("There is no speech-ready text to play for this message.");
      return;
    }

    if (currentlyPlayingId === msg.id) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      setCurrentlyPlayingId(null);
      return;
    }

    setIsTtsLoading(msg.id);

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.lang = selectedLanguage;
        utterance.rate = 1;
        utterance.pitch = 1;
        utterance.volume = 1;
        utterance.onstart = () => {
          setIsTtsLoading(null);
          setCurrentlyPlayingId(msg.id);
        };
        utterance.onend = () => {
          setCurrentlyPlayingId(null);
        };
        utterance.onerror = () => {
          setIsTtsLoading(null);
          setCurrentlyPlayingId(null);
        };
        window.speechSynthesis.speak(utterance);
        return;
      } catch (err) {
        console.warn("Browser speech synthesis failed, falling back to server TTS:", err);
      }
    }

    try {
      const token = localStorage.getItem("token");
      const headers: Record<string, string> = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const response = await fetch(`${getApiBaseUrl()}/api/messages/${msg.id}/tts?lang=${encodeURIComponent(selectedLanguage)}&text=${encodeURIComponent(textToSpeak)}`, {
        headers,
      });

      if (!response.ok) {
        throw new Error("Failed to generate speech");
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      if (audioRef.current) {
        audioRef.current.pause();
      }

      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.preload = "auto";

      audio.oncanplaythrough = () => {
        setIsTtsLoading(null);
        setCurrentlyPlayingId(msg.id);
        void audio.play().catch(() => {
          setIsTtsLoading(null);
          setCurrentlyPlayingId(null);
        });
      };

      audio.onended = () => {
        setCurrentlyPlayingId(null);
        URL.revokeObjectURL(audioUrl);
      };

      audio.onerror = () => {
        setIsTtsLoading(null);
        setCurrentlyPlayingId(null);
        URL.revokeObjectURL(audioUrl);
      };
    } catch (err) {
      console.error(err);
      setIsTtsLoading(null);
      setCurrentlyPlayingId(null);
    }
  };

  const toggleListenResponse = (msg: Message) => {
    if (currentlyPlayingId === msg.id) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      setCurrentlyPlayingId(null);
      return;
    }

    if (showTtsLanguagePicker === msg.id) {
      setShowTtsLanguagePicker(null);
      return;
    }

    setShowTtsLanguagePicker(msg.id);
    void playTTS(msg, ttsLanguage, msg.content);
  };

  const toggleTranslatePicker = (msg: Message) => {
    void translateMessageText(msg, "en-US");
  };

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  // Filter messages based on local message search
  const filteredMessages = messages.filter((m) =>
    m.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Filter documents based on local document search
  const filteredDocuments = documents.filter((doc) =>
    doc.filename.toLowerCase().includes(docSearchQuery.toLowerCase())
  );

  // Fast search when user input prompt
  const fastSearchQuery = input.trim().toLowerCase();
  const showFastSearchResults = fastSearchQuery.length >= 2;

  const matchedMessages = showFastSearchResults
    ? messages
      .filter((m) => m.content.toLowerCase().includes(fastSearchQuery))
      .slice(0, 3)
    : [];

  const matchedDocs = showFastSearchResults
    ? documents
      .filter(
        (d) =>
          d.filename.toLowerCase().includes(fastSearchQuery)
      )
      .slice(0, 3)
    : [];

  const handleMessageClick = (msgId: string | number) => {
    const el = document.getElementById(`message-${msgId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("bg-emerald-500/10", "rounded-xl", "ring-2", "ring-emerald-500/30", "transition-all", "duration-500");
      setTimeout(() => {
        el.classList.remove("bg-emerald-500/10", "ring-2", "ring-emerald-500/30");
      }, 2000);
    }
  };

  const handleDocClick = (filename: string) => {
    setInput((prev) => {
      const tag = `@Doc:"${filename}" `;
      if (prev.includes(tag)) return prev;
      return prev + tag;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter") {
      if (e.ctrlKey || e.metaKey || e.shiftKey) {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const start = e.currentTarget.selectionStart;
          const end = e.currentTarget.selectionEnd;
          const val = e.currentTarget.value;
          const newVal = val.substring(0, start) + "\n" + val.substring(end);
          setInput(newVal);
          setTimeout(() => {
            if (e.currentTarget) {
              e.currentTarget.selectionStart = e.currentTarget.selectionEnd = start + 1;
            }
          }, 0);
        }
      } else {
        e.preventDefault();
        if (!isStreaming) {
          const form = e.currentTarget.form;
          if (form) {
            form.requestSubmit();
          }
        }
      }
    }
  };

  return (
    <div
      className="flex-1 h-full bg-app flex flex-col min-w-0 relative"
      onPaste={handlePaste}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Gorgeous Drag & Drop File Upload Overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-emerald-500/10 border-4 border-dashed border-emerald-500/50 rounded-2xl flex flex-col items-center justify-center z-50 pointer-events-none backdrop-blur-sm">
          <div className="bg-panel border border-theme p-6 rounded-2xl flex flex-col items-center gap-3 shadow-2xl max-w-sm text-center">
            <div className="p-3.5 bg-emerald-500/20 rounded-full">
              <FilePlus className="w-8 h-8 text-emerald-400 animate-bounce" />
            </div>
            <p className="text-theme font-semibold text-sm">Drop your files here</p>
            <p className="text-secondary text-xs">Release to convert and import multiple files instantly</p>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="h-16 border-b border-theme px-3 sm:px-4 md:px-5 flex items-center justify-between bg-surface/40 backdrop-blur shrink-0 z-20">
        <div className="flex items-center gap-2.5">
          {/* Sidebar Menu Toggle Button */}
          <button
            onClick={() => setSidebarOpen(!isSidebarOpen)}
            className="p-1.5 hover:bg-surface/60 rounded-lg text-secondary hover:text-theme transition cursor-pointer"
            title="Toggle Sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>

          <Sparkles className="w-4 h-4 text-emerald-400 max-sm:hidden" />
          <span className="font-medium text-theme text-xs truncate max-w-35 sm:max-w-60">
            {activeConversationId
              ? conversations.find((c) => c.id === activeConversationId)?.title || "Active Session"
              : "SucharAI Companion"
            }
          </span>
        </div>

        {/* Message Local Keyword Search & Knowledge Base Toggle */}
        <div className="flex items-center gap-2">
          {/* Offline/Online Mode Selector Toggle */}
          <button
            onClick={() => setOfflineMode(!isOfflineMode)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all duration-300 shadow-sm cursor-pointer select-none ${isOfflineMode
              ? "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20"
              : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
              }`}
            title={isOfflineMode ? "Switch to Online Mode (Gemini AI)" : "Switch to Offline Mode (Local AI Dataset)"}
          >
            {isOfflineMode ? (
              <>
                <WifiOff className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Offline Mode</span>
                <span className="sm:hidden">Offline</span>
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              </>
            ) : (
              <>
                <Wifi className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Online Mode</span>
                <span className="sm:hidden">Online</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              </>
            )}
          </button>

          {activeConversationId && (
            <div className="relative w-36 sm:w-64 max-xs:hidden">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
              <input
                type="text"
                placeholder="Search chat..."
                value={searchQuery}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  if (containsProfanity(nextValue)) {
                    return;
                  }
                  setSearchQuery(nextValue);
                }}
                className="w-full pl-9 pr-8 py-1.5 bg-input border border-theme/50 rounded-lg text-xs text-theme placeholder-text-secondary focus:outline-none focus:border-emerald-500/50"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-secondary hover:text-theme"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {activeConversationId && (
            <button
              onClick={() => setIsKBOpen(!isKBOpen)}
              className={`p-1.5 sm:p-2 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${isKBOpen
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                : "bg-panel border-theme text-secondary hover:text-theme"
                }`}
              title="Toggle Knowledge Base panel (RAG)"
            >
              <FileText className="w-4 h-4" />
              <span className="max-sm:hidden">Files ({documents.length})</span>
            </button>
          )}

          {activeConversationId && (
            <div className="relative">
              <button
                onClick={() => setIsExportDropdownOpen(!isExportDropdownOpen)}
                className={`p-1.5 sm:p-2 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer bg-panel border-theme text-secondary hover:text-theme ${isExportDropdownOpen ? "border-emerald-500/50 text-theme" : ""}`}
                title="Export / Print Conversation"
              >
                <Download className="w-4 h-4" />
                <span className="max-sm:hidden">Export</span>
              </button>

              {isExportDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsExportDropdownOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-48 bg-panel border border-theme rounded-xl shadow-xl py-1 z-50 animate-fade-in text-secondary">
                    <button
                      onClick={handlePrintChat}
                      className="w-full text-left px-4 py-2 hover:bg-surface text-xs flex items-center gap-2 transition duration-150 cursor-pointer text-secondary hover:text-theme"
                    >
                      <Printer className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Print / Save to PDF</span>
                    </button>
                    <button
                      onClick={() => handleExportText("md")}
                      className="w-full text-left px-4 py-2 hover:bg-surface text-xs flex items-center gap-2 transition duration-150 cursor-pointer text-secondary hover:text-theme"
                    >
                      <FileText className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Export as Markdown</span>
                    </button>
                    <button
                      onClick={() => handleExportText("txt")}
                      className="w-full text-left px-4 py-2 hover:bg-surface text-xs flex items-center gap-2 transition duration-150 cursor-pointer text-secondary hover:text-theme"
                    >
                      <FileText className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Export as Plain Text</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Area: Messages + Side panel */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        <div className="flex-1 flex flex-col min-w-0 h-full relative">



          {/* Messages List Container */}
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto px-1 sm:px-2 md:px-2.5 py-2 sm:py-3 md:py-4 space-y-3 sm:space-y-4"
            style={chatSurfaceStyle}
          >
            {!activeConversationId ? (
              /* Welcome / Starting Screen Dashboard (Rendered in place when no active chat) */
              <div className="h-full max-w-md mx-auto flex flex-col items-center justify-center text-center text-theme py-10 space-y-6 animate-fade-in">
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Sparkles className="w-8 h-8" />
                </div>
                <div>
                  <h2 className="font-display font-semibold text-theme text-xl mb-1 tracking-tight">SucharAI</h2>
                  <p className="text-emerald-400 text-xs font-semibold">Developed by Sujan Chandra Ray</p>
                  <a
                    href="https://www.google.com/search?q=sucharbd"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-secondary hover:text-emerald-400 text-[11px] hover:underline block mt-1.5 transition duration-150 cursor-pointer"
                  >
                    More Details....... search google: <span className="text-emerald-400 font-semibold font-mono">"sucharbd"</span>
                  </a>
                </div>
                <p className="text-secondary text-xs leading-relaxed">
                  Start a session by entering a question below, or drag documents directly into the chat list to synthesize instant OCR data and voice transcripts. Voice and remote synthesis features may be limited on localhost.
                </p>

                {/* Big, obvious click & drag-and-drop uploader for step 1 on starting screen */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-theme hover:border-emerald-500/40 bg-surface-soft/40 hover:bg-surface-soft/70 p-6 rounded-2xl flex flex-col items-center gap-3.5 transition duration-200 cursor-pointer group shadow-lg shadow-black/20"
                >
                  <div className="p-3 bg-emerald-500/10 rounded-full border border-emerald-500/20 group-hover:bg-emerald-500/20 group-hover:border-emerald-500/35 transition duration-200">
                    <FilePlus className="w-6 h-6 text-emerald-400" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-theme text-xs font-bold group-hover:text-emerald-400 transition duration-200">Upload & Analyze All Files (*.*)</p>
                    <p className="text-secondary text-[10px] leading-normal max-w-sm mx-auto">Click to select or drag & drop multiple files, documents, code scripts, or images here to automatically start a session and analyze context.</p>
                  </div>
                </div>

                <div className="flex flex-col gap-3 text-left bg-panel border border-theme p-5 rounded-xl w-full">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-1">Key Features Available</span>
                  <div className="flex items-start gap-2.5 text-xs text-secondary">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>**Secure Authentication**: Accounts, JWT sessions, and custom settings profiles.</span>
                  </div>
                  <div className="flex items-start gap-2.5 text-xs text-secondary">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>**Full-Stack RAG**: Upload document files (TXT, PDF, Docx, CSV, PNG, JPG) to ground response context.</span>
                  </div>
                  <div className="flex items-start gap-2.5 text-xs text-secondary">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>**Voice & Synthesis**: Speech recognition and server-side text-to-speech. Some audio features may be unavailable from localhost.</span>
                  </div>
                  <div className="flex items-start gap-2.5 text-xs text-secondary">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>**Offline & Online AI Modes**: Toggle between local high-fidelity dataset matching (offline) and live Gemini Core (online).</span>
                  </div>
                </div>
              </div>
            ) : filteredMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-secondary text-xs max-w-sm mx-auto">
                <p className="leading-relaxed">This conversation is empty. Type a prompt below or click the attachment icon to feed text-analysis contexts.</p>
              </div>
            ) : (
              <div className="w-full max-w-full md:max-w-3xl mx-auto space-y-3 sm:space-y-4">
                {filteredMessages.map((msg) => {
                  const isUser = msg.role === "user";
                  const isPlaying = currentlyPlayingId === msg.id;
                  const isLoadingTts = isTtsLoading === msg.id;
                  const parsed = !isUser ? parseThinkingContent(msg.content) : null;

                  return (
                    <div
                      key={msg.id}
                      id={"message-" + msg.id}
                      className={`flex gap-2 sm:gap-3 max-w-[98%] sm:max-w-[94%] md:max-w-[92%] ${isUser ? "ml-auto flex-row-reverse" : "mr-auto"} fade-in`}
                    >
                      {/* Avatar */}
                      {!isUser && (
                        <img src={logoUrl} alt="SucharAI" className="w-8 h-8 rounded-lg border border-emerald-500/40 object-cover shrink-0" />
                      )}

                      {/* Message bubble */}
                      <div className={`flex flex-col gap-1.5 w-full max-w-full ${isUser ? "items-end" : "items-start"}`}>
                        <div className={`rounded-xl px-4 py-3 text-xs leading-relaxed shadow-sm relative overflow-hidden ${isUser
                          ? "bg-surface border border-theme text-theme"
                          : `bg-panel border border-theme text-theme ${isStreaming && messages.length > 0 && msg.id === messages[messages.length - 1].id ? "streaming-bubble" : ""}`
                          }`}>
                          {isStreaming && messages.length > 0 && msg.id === messages[messages.length - 1].id && !isUser && (
                            <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-400">
                              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                              <span>Generating response</span>
                            </div>
                          )}
                          {isUser ? (
                            <p className="whitespace-pre-wrap text-left">{msg.content}</p>
                          ) : (
                            <div className="markdown-body prose prose-invert max-w-none text-theme prose-pre:bg-black/30 prose-pre:border border-theme prose-code:font-mono prose-code:text-xs">
                              {parsed && parsed.thinkingText ? (
                                <>
                                  <ThinkingAccordion
                                    text={parsed.thinkingText}
                                    completed={parsed.completed}
                                  />
                                  {parsed.completed && parsed.cleanContent ? (
                                    <div className={isStreaming && messages.length > 0 && msg.id === messages[messages.length - 1].id ? "streaming-active" : ""}>
                                      <ReactMarkdown
                                        components={{
                                          code({ className, children, ...props }: any) {
                                            const codeContent = String(children).replace(/\n$/, "");
                                            const language = className?.replace(/^language-/, "") || undefined;
                                            const isInline = Boolean(props.inline);
                                            if (!isInline) {
                                              return <CodeBlockEditor language={language} content={codeContent} />;
                                            }
                                            return (
                                              <code className={className} {...props}>
                                                {children}
                                              </code>
                                            );
                                          }
                                        }}
                                      >
                                        {parsed.cleanContent}
                                      </ReactMarkdown>
                                    </div>
                                  ) : parsed.thinkingText && !parsed.completed ? (
                                    <div className="flex items-center gap-2 text-secondary py-1 font-sans text-[11px] select-none">
                                      <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                                      <span>Preparing final answer...</span>
                                    </div>
                                  ) : null}
                                </>
                              ) : parsed && parsed.cleanContent ? (
                                <div className={isStreaming && messages.length > 0 && msg.id === messages[messages.length - 1].id ? "streaming-active" : ""}>
                                  <ReactMarkdown
                                    components={{
                                      code({ className, children, ...props }: any) {
                                        const codeContent = String(children).replace(/\n$/, "");
                                        const language = className?.replace(/^language-/, "") || undefined;
                                        const isInline = Boolean(props.inline);
                                        if (!isInline) {
                                          return <CodeBlockEditor language={language} content={codeContent} />;
                                        }
                                        return (
                                          <code className={className} {...props}>
                                            {children}
                                          </code>
                                        );
                                      }
                                    }}
                                  >
                                    {parsed.cleanContent}
                                  </ReactMarkdown>
                                </div>
                              ) : (
                                parsed && parsed.isThinking && (
                                  <div className="flex items-center gap-2 text-secondary py-1 font-sans text-[11px] select-none">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                                    <span>Generating response...</span>
                                  </div>
                                )
                              )}
                            </div>
                          )}
                        </div>

                        {/* Metadata / TTS playback */}
                        {!isUser && msg.content && (
                          <div className="flex flex-col gap-2 px-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                onClick={() => toggleListenResponse(msg)}
                                disabled={isLoadingTts}
                                className={`flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded transition ${isPlaying
                                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                  : "bg-surface hover:bg-surface-soft text-secondary hover:text-theme border border-theme"
                                  }`}
                              >
                                {isLoadingTts ? (
                                  <>
                                    <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />
                                    <span>Generating...</span>
                                  </>
                                ) : isPlaying ? (
                                  <>
                                    <VolumeX className="w-3 h-3 text-emerald-400" />
                                    <span>Stop Speech</span>
                                  </>
                                ) : (
                                  <>
                                    <Volume2 className="w-3 h-3" />
                                    <span>Listen Response</span>
                                  </>
                                )}
                              </button>
                              <MessageFeedback
                                messageId={msg.id}
                                conversationId={activeConversationId || msg.conversationId}
                              />
                            </div>
                            {messageTranslations[msg.id]?.loading ? (
                              <div className="rounded-lg border border-theme/60 bg-surface/70 px-3 py-2 text-[10px] text-secondary">
                                Translating for the selected language...
                              </div>
                            ) : messageTranslations[msg.id]?.error ? (
                              <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-[10px] text-red-400">
                                {messageTranslations[msg.id]?.error}
                              </div>
                            ) : messageTranslations[msg.id]?.text ? (
                              <div className="rounded-lg border border-theme/60 bg-surface/70 px-3 py-2 text-[11px] leading-relaxed text-theme">
                                <div className="mb-1 flex items-center gap-2">
                                  <span className="text-[9px] font-semibold uppercase tracking-wider text-emerald-400">Translated text</span>
                                  <span className="text-[9px] text-secondary">{messageTranslations[msg.id]?.language || "en-US"}</span>
                                </div>
                                <p className="whitespace-pre-wrap">{messageTranslations[msg.id]?.text}</p>
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {inlineDetectionState.isVisible && (
              <div className="mb-4 rounded-2xl border border-theme bg-panel/80 p-3 shadow-lg shadow-black/20">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-semibold text-theme">Live object detection</p>
                    <p className="text-[10px] text-secondary">Previewing the current image and detected items inside the chat window.</p>
                  </div>
                  <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-400">
                    {inlineDetectionState.isDetecting ? "Analyzing..." : "Ready"}
                  </span>
                </div>

                <div className="mt-3 flex flex-col gap-3 lg:flex-row">
                  <div className="flex-1 min-h-45 rounded-xl border border-theme/70 bg-surface-soft/50 p-2 flex items-center justify-center">
                    {inlineDetectionState.imageSrc ? (
                      <img src={inlineDetectionState.imageSrc} alt="Detection preview" className="max-h-55 max-w-full rounded-lg object-contain" />
                    ) : (
                      <div className="text-center text-[11px] text-secondary">
                        {inlineDetectionState.isDetecting ? "Preparing image preview..." : "No image selected yet."}
                      </div>
                    )}
                  </div>

                  <div className="w-full lg:w-72 rounded-xl border border-theme/70 bg-surface-soft/40 p-3">
                    {inlineDetectionState.isDetecting ? (
                      <div className="flex h-full min-h-35 items-center justify-center text-center text-[11px] text-secondary">
                        <div>
                          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-emerald-400" />
                          Detecting objects and building the live preview...
                        </div>
                      </div>
                    ) : inlineDetectionState.error ? (
                      <div className="text-[11px] text-red-400">{inlineDetectionState.error}</div>
                    ) : inlineDetectionState.objects.length > 0 ? (
                      <div className="space-y-2">
                        {inlineDetectionState.objects.map((obj, idx) => (
                          <div key={`${obj.label}-${idx}`} className="rounded-lg border border-theme/70 bg-surface/60 p-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-semibold text-theme">{obj.label}</span>
                              <span className="text-[10px] font-semibold text-emerald-400">{Math.round(obj.confidence * 100)}%</span>
                            </div>
                            <p className="mt-1 text-[10px] text-secondary">Bounding box: [{obj.box_2d.join(", ")}]</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[11px] text-secondary">Detection results will appear here once the analysis completes.</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Sidebar Panel for Indexed RAG Documents */}
        {
          activeConversationId && isKBOpen && (
            <>
              {/* Mobile backdrop for Knowledge Base */}
              <div
                className="fixed inset-0 bg-surface/60 z-30 lg:hidden"
                onClick={() => setIsKBOpen(false)}
              />

              <div className="fixed inset-y-0 right-0 z-40 w-72 h-full border-l border-theme bg-panel p-4 flex flex-col gap-4 shrink-0 lg:static lg:w-64 lg:z-auto lg:h-auto lg:bg-panel/40 animate-slide-in">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsKBOpen(false)}
                      className="lg:hidden p-1 hover:bg-surface-soft rounded text-secondary hover:text-theme transition"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-secondary">Knowledge Base</span>
                  </div>
                  <span className="text-[9px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-semibold">RAG Index</span>
                </div>

                {/* Document search filter */}
                {documents.length > 0 && (
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-secondary" />
                    <input
                      type="text"
                      placeholder="Search uploaded files..."
                      value={docSearchQuery}
                      onChange={(e) => setDocSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-input border border-theme rounded-lg text-[10px] text-secondary placeholder-text-secondary focus:outline-none focus:border-emerald-500/50"
                    />
                    {docSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setDocSearchQuery("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-secondary hover:text-theme"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}

                {/* List of uploaded documents in this chat */}
                <div className="flex-1 overflow-y-auto space-y-2">
                  {filteredDocuments.length === 0 ? (
                    <div className="text-center py-8 text-xs text-secondary font-medium leading-relaxed">
                      {docSearchQuery ? "No matching files found." : "No files attached yet. Upload PDFs, JPG/PNG images, or sheets to convert & analyze context!"}
                    </div>
                  ) : (
                    filteredDocuments.map((doc) => (
                      <button
                        key={doc.id}
                        type="button"
                        onClick={() => void openPreview({ kind: "document", document: doc })}
                        className="flex w-full items-center gap-2 bg-surface-soft/30 border border-theme p-2.5 rounded-lg text-xs text-secondary hover:border-emerald-500/40 hover:text-theme transition duration-150 text-left"
                      >
                        <FileText className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span className="truncate flex-1 font-mono text-[11px]" title={doc.filename}>{doc.filename}</span>
                      </button>
                    ))
                  )}
                </div>

              </div>
            </>
          )
        }
      </div>

      {/* Hidden file input for programmatically triggered uploads */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept="*"
        multiple
        className="hidden"
      />

      <ObjectDetectionPanel
        isOpen={isObjectDetectionOpen}
        onClose={() => setIsObjectDetectionOpen(false)}
        onInjectPrompt={handleInjectObjectDetectionPrompt}
        initialImageFile={objectDetectionFile}
        initialImageDataUrl={objectDetectionPreview}
        autoRun={Boolean(objectDetectionFile && objectDetectionFile.type.startsWith("image/"))}
        onDetectionStateChange={handleObjectDetectionStateChange}
      />

      {previewItem && (
        <div className="fixed inset-0 z-70 bg-surface/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-2xl border border-theme bg-panel shadow-2xl">
            <div className="flex items-center justify-between border-b border-theme px-4 py-3">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-theme truncate">
                    {previewItem.kind === "file" ? previewItem.file.name : previewItem.document.filename}
                  </p>
                  <p className="text-[11px] text-secondary">Preview window • Close with the button below</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closePreview}
                className="rounded-full p-1.5 border border-theme bg-surface text-secondary hover:text-theme transition"
                title="Close preview"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-auto p-4">
              {previewImageUrl ? (
                <img src={previewImageUrl} alt="Preview" className="max-w-full max-h-[60vh] rounded-xl border border-theme object-contain mx-auto" />
              ) : previewText ? (
                <div className="rounded-2xl border border-theme bg-white/95 p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Converted text</p>
                      <p className="text-xs text-slate-500">Document-style preview</p>
                    </div>
                    <div className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                      {previewItem?.kind === "document" ? "Stored document" : "Uploaded file"}
                    </div>
                  </div>
                  <div
                    className="max-h-[55vh] overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 p-4"
                    style={{
                      ...getDocumentPreviewStyle(previewItem?.kind === "file" ? (previewItem.file as File) : null),
                    }}
                  >
                    {previewText}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-theme bg-surface/40 p-6 text-center text-secondary text-sm">
                  Preview is not available for this file type. You can still inspect the file details and remove it from the upload list.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bottom composer area */}
      <div className="border-t border-theme bg-panel/70 px-3 py-3 sm:px-4 flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="cursor-pointer rounded-xl p-2 bg-surface border border-theme text-secondary hover:text-theme hover:bg-surface-soft transition"
            title="Attach files"
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={toggleRecording}
            className={`cursor-pointer rounded-xl p-2 border border-theme transition ${isRecording ? "bg-emerald-500/10 text-emerald-300" : "bg-surface text-secondary hover:text-theme hover:bg-surface-soft"}`}
            title={isRecording ? "Stop voice input" : "Start voice input"}
          >
            {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={handleOpenObjectDetectionPanel}
            className="cursor-pointer rounded-xl border border-theme px-3 py-2 text-[10px] sm:text-xs font-semibold flex items-center gap-2 transition bg-panel text-secondary hover:text-theme"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Object Detection</span>
          </button>
          <button
            type="button"
            onClick={() => setThinkingEnabled(!isThinkingEnabled)}
            className={`cursor-pointer rounded-xl border px-3 py-2 text-[10px] sm:text-xs font-semibold flex items-center gap-2 transition ${isThinkingEnabled ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-panel border-theme text-secondary hover:text-theme"}`}
          >
            <Brain className="w-3.5 h-3.5" />
            <span>Reason</span>
          </button>
          <button
            type="button"
            onClick={() => void runInlineFileSearch()}
            disabled={!uploadedFiles.length || uploading}
            className="cursor-pointer rounded-xl border border-theme px-3 py-2 text-[10px] sm:text-xs font-semibold flex items-center gap-2 transition bg-panel text-secondary hover:text-theme disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <SearchCheck className="w-3.5 h-3.5" />
            <span>Search</span>
          </button>
        </div>

        {uploadedFiles.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {uploadedFiles.map((file, index) => (
              <div key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] sm:text-xs text-emerald-400">
                <button
                  type="button"
                  onClick={() => void openPreview({ kind: "file", file })}
                  className="flex items-center gap-2 hover:text-emerald-200 transition cursor-pointer"
                  title={`Preview ${file.name}`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span className="max-w-35 truncate">{file.name}</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setUploadedFiles((current) => {
                      const nextFiles = current.filter((_, itemIndex) => itemIndex !== index);
                      if (nextFiles.length === 0) {
                        setObjectDetectionFile(null);
                        setObjectDetectionPreview(null);
                        setInlineDetectionState({
                          isVisible: false,
                          isDetecting: false,
                          imageSrc: null,
                          objects: [],
                          error: null,
                        });
                      }
                      return nextFiles;
                    });
                  }}
                  className="ml-1 text-emerald-300 hover:text-emerald-100 transition"
                  title={`Remove ${file.name}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={clearUploadedFiles}
              className="rounded-full border border-theme bg-surface px-2.5 py-1 text-[10px] sm:text-xs font-semibold text-secondary hover:text-theme transition"
            >
              Clear all
            </button>
          </div>
        )}

        {showAnalysisOption && uploadedFiles.length > 0 && (
          <div className="flex items-center justify-between rounded-xl border border-theme bg-surface/70 px-3 py-2">
            <div className="text-[10px] sm:text-xs text-secondary">
              Analysis ready for <span className="font-semibold text-theme">{lastAnalyzedFileName || "the uploaded file"}</span>
            </div>
            <button
              type="button"
              onClick={handleAnalysisSelection}
              className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[10px] sm:text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/20"
            >
              Analysis
            </button>
          </div>
        )}

        <form onSubmit={handleSend} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message or ask for help..."
            className="min-h-11 max-h-32 w-full resize-none rounded-2xl border border-theme bg-input px-4 py-3 text-sm text-theme placeholder:text-muted focus:outline-none"
          />
          <button
            type="submit"
            disabled={(!input.trim() && !uploadedFiles.length) || isStreaming}
            className="w-full rounded-2xl px-4 py-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-panel disabled:text-secondary text-black text-sm font-bold transition sm:w-auto"
            title="Send message"
          >
            <Send className="w-4 h-4 mx-auto sm:mx-0" />
          </button>
        </form>
      </div>
    </div>
  );
}
