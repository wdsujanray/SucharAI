import express from "express";
import path from "path";
import fs from "fs";
import { pathToFileURL } from "url";
import { createServer as createViteServer } from "vite";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import dotenv from "dotenv";
import mammoth from "mammoth";
import puppeteer from "puppeteer";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { GoogleGenAI } from "@google/genai";
import { OAuth2Client } from "google-auth-library";
import { User, Conversation, Message, readDb, writeDb } from "./server/db.js";
import { searchDocumentChunks } from "./server/rag.js";
import { extractTextFromOfficeBuffer } from "./server/extraction.js";

// Load environment variables
dotenv.config();

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID || "");

const isMobileServer = process.env.MOBILE_SERVER === "true";
const app = express();
const PORT = Number(process.env.PORT || process.env.MOBILE_PORT || (isMobileServer ? 3001 : 3000));
const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key-change-in-production";
const uploadsDir = path.join(process.cwd(), "uploads");

// Configure multer for file uploads in memory
const upload = multer({ storage: multer.memoryStorage() });

app.use("/uploads", express.static(uploadsDir));

// Initialize Gemini clients from multiple configured API keys.
const GEMINI_API_KEYS = [
  (process.env.GEMINI_API_KEY || "").trim()
].filter(Boolean);

const geminiClients = GEMINI_API_KEYS.map((key) => new GoogleGenAI({
  apiKey: key,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
}));

function getAvailableGeminiClientIndex(attemptIndex: number) {
  return Math.min(Math.max(attemptIndex, 0), geminiClients.length - 1);
}

function getGeminiClientForAttempt(attemptIndex: number) {
  return geminiClients[getAvailableGeminiClientIndex(attemptIndex)] || null;
}

function buildOfflineChatReply(content: string) {
  const prompt = (content || "").trim() || "your last message";
  return [
    "I’m currently responding in fallback mode because the live AI provider is unavailable.",
    `Your message: ${prompt}`,
    "Set a valid GEMINI_API_KEY in your environment to restore live AI responses."
  ].join("\n\n");
}

function shouldUseOfflineFallback(error: any) {
  const message = error?.message || "";
  return geminiClients.length === 0 || /API key|PERMISSION_DENIED|403|401|quota|not configured/i.test(message);
}

function normalizeExtractedText(rawText: string, fallbackLabel: string) {
  const cleaned = String(rawText || "")
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/[\t ]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .split("\n")
    .map((line) => line.replace(/^[\s\u200B\u200C\u200D]+/g, "").replace(/[\s\u200B\u200C\u200D]+$/g, ""))
    .filter((line) => line.trim().length > 0)
    .filter((line) => !/^(page|p\.?)(\s+\d+)?$/i.test(line.trim()))
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned || `Unable to extract machine-readable text from ${fallbackLabel}. The file was uploaded successfully, but no readable text could be recovered.`;
}

function convertPcmToWav(buffer: Buffer, sampleRate = 24000, channels = 1, bitDepth = 16) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + buffer.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * (bitDepth / 8), 28);
  header.writeUInt16LE(channels * (bitDepth / 8), 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write("data", 36);
  header.writeUInt32LE(buffer.length, 40);

  return Buffer.concat([header, buffer]);
}

async function extractTextFromUpload(file: any, options?: { fastMode?: boolean }) {
  const { fastMode = false } = options || {};
  const mimetype = file?.mimetype || "";
  const filename = file?.originalname || "unnamed_file";
  const buffer = file?.buffer || Buffer.from("");
  const ext = path.extname(filename).toLowerCase();

  const isText = mimetype.startsWith("text/") ||
    mimetype === "application/javascript" ||
    mimetype === "application/json" ||
    mimetype === "application/xml" ||
    textExtensions.includes(ext);

  if (isText) {
    return {
      text: normalizeExtractedText(buffer.toString("utf-8"), filename),
      format: "text/plain",
    };
  }

  const officeText = [".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx"].includes(ext)
    ? await extractTextFromOfficeBuffer(buffer, filename)
    : "";

  if (officeText && officeText.trim()) {
    return {
      text: normalizeExtractedText(officeText, filename),
      format: "text/plain",
    };
  }

  const fastConfig = fastMode ? {
    temperature: 0.1,
    topP: 0.95,
    candidateCount: 1,
    maxOutputTokens: 4000,
  } : undefined;

  const promptText = fastMode
    ? `Extract every readable word, number, heading, and line from this file. Preserve all punctuation, symbols, and special characters exactly as they appear in the source. Return plain text only, preserving the reading order. Remove only empty lines and obvious page numbers. Do not add commentary or headings.`
    : `You are an expert document analyzer, OCR engine, and layout specialist. Please read and extract all content, figures, tables, data points, or text from this file named "${filename}". Preserve all punctuation, symbols, and special characters exactly as they appear in the source. Return the result as clean plain text that can be searched and summarized.`;

  if (mimetype.startsWith("image/") || mimetype === "application/pdf") {
    try {
      const documentPart = {
        inlineData: {
          mimeType: mimetype,
          data: buffer.toString("base64"),
        },
      };
      const promptPart = {
        text: promptText,
      };
      const response = await generateContentWithFallback({
        contents: { parts: [documentPart, promptPart] },
        defaultModel: fastMode ? "gemini-3.1-flash-lite" : "gemini-3.5-flash",
        config: fastConfig,
      });
      return {
        text: normalizeExtractedText(response.text || "", filename),
        format: "text/plain",
      };
    } catch (geminiError: any) {
      console.error("Gemini OCR extraction failed, falling back to raw extraction:", geminiError);
      return {
        text: normalizeExtractedText(buffer.toString("utf-8"), filename),
        format: "text/plain",
      };
    }
  }

  try {
    const docPart = {
      inlineData: {
        mimeType: mimetype || "application/octet-stream",
        data: buffer.toString("base64"),
      },
    };
    const promptPart = {
      text: promptText,
    };
    const response = await generateContentWithFallback({
      contents: { parts: [docPart, promptPart] },
      defaultModel: fastMode ? "gemini-3.1-flash-lite" : "gemini-3.5-flash",
      config: fastConfig,
    });
    return {
      text: normalizeExtractedText(response.text || "", filename),
      format: "text/plain",
    };
  } catch (binError: any) {
    return {
      text: normalizeExtractedText(buffer.toString("utf-8"), filename),
      format: "text/plain",
    };
  }
}

function normalizeDetectedObject(raw: any) {
  if (!raw || typeof raw !== "object") return null;

  const box = Array.isArray(raw.box_2d) ? raw.box_2d : [];
  if (box.length !== 4) return null;

  const values = box.map((value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return Math.min(1000, Math.max(0, num));
  });

  const [ymin, xmin, ymax, xmax] = values;
  const label = String(raw.label || "").trim();
  const confidence = Number(raw.confidence);

  if (!label || label.length < 2) return null;

  const normalizedBox: [number, number, number, number] = [
    Math.min(ymin, ymax),
    Math.min(xmin, xmax),
    Math.max(ymin, ymax),
    Math.max(xmin, xmax),
  ];

  const safeConfidence = Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.5;

  return {
    box_2d: normalizedBox,
    label: label.replace(/\s+/g, " "),
    confidence: safeConfidence,
  };
}

async function detectObjectsFromImage(file: any) {
  const mimetype = file?.mimetype || "";
  const filename = file?.originalname || "unnamed_file";
  const buffer = file?.buffer || Buffer.from("");

  if (!mimetype.startsWith("image/")) {
    return [];
  }

  const docPart = {
    inlineData: {
      mimeType: mimetype,
      data: buffer.toString("base64"),
    },
  };

  const promptPart = {
    text: `Analyze this image for object detection. Detect all major, distinct objects in the image. For each object detected, provide: 1. A concise label/name. 2. The normalized bounding box [ymin, xmin, ymax, xmax] as integers between 0 and 1000. 3. A confidence score between 0.00 and 1.00. Return only a valid JSON array with objects matching this schema: [{"box_2d": [ymin, xmin, ymax, xmax], "label": "string", "confidence": number}]. Prefer realistic labels like person, dog, car, laptop, bottle, chair, table, book, tree, phone, cup, plant, bag, window, door, keyboard, television, bicycle, motorcycle, appliance, backpack, shoe, mug, bottle, monitor, food, fruit. Do not include explanations, markdown, or extra text.`,
  };

  try {
    const response = await generateContentWithFallback({
      contents: { parts: [docPart, promptPart] },
      defaultModel: "gemini-3.5-flash"
    });

    const text = response.text || "[]";
    let cleanText = String(text).trim();
    if (cleanText.startsWith("```")) {
      cleanText = cleanText.replace(/^```[a-zA-Z]*\n/, "").replace(/\n```$/, "");
    }
    cleanText = cleanText.trim();

    let parsed: any = [];
    try {
      parsed = JSON.parse(cleanText);
    } catch (parseErr) {
      const match = cleanText.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch (_) {
          parsed = [];
        }
      }
    }

    const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.objects) ? parsed.objects : [];
    const normalized = list
      .map(normalizeDetectedObject)
      .filter(Boolean)
      .filter((item, index, arr) => {
        const duplicate = arr.findIndex((candidate) => candidate.label.toLowerCase() === item.label.toLowerCase() && candidate.box_2d.every((value, idx) => Math.abs(value - item.box_2d[idx]) < 25));
        return duplicate === index;
      });

    return normalized.slice(0, 12);
  } catch (error: any) {
    console.error(`Object detection fallback failed for ${filename}:`, error);
    return [];
  }
}

/**
 * Helper to call Gemini generateContent with standard multi-tier fallback mechanism
 */
async function generateContentWithFallback(options: { contents: any, config?: any, defaultModel?: string }) {
  const models = [
    options.defaultModel || "gemini-3.5-flash",
    "gemini-flash-latest",
    "gemini-2.5-flash",
    "gemini-3.1-flash-lite"
  ];

  const modelChain = Array.from(new Set(models.filter(Boolean)));
  let lastError: any = null;

  for (let keyIndex = 0; keyIndex < geminiClients.length; keyIndex += 1) {
    const client = geminiClients[keyIndex];
    if (!client) continue;

    for (const model of modelChain) {
      try {
        console.log(`[Gemini API] Attempting generateContent with model: ${model} using key ${keyIndex + 1}`);
        const response = await client.models.generateContent({
          model,
          contents: options.contents,
          config: options.config,
        });
        console.log(`[Gemini API] Successfully completed generateContent with model: ${model} using key ${keyIndex + 1}`);
        return response;
      } catch (err: any) {
        console.warn(`[Gemini API] Model ${model} failed for key ${keyIndex + 1}:`, err.message || err);
        lastError = err;
      }
    }
  }

  console.error("[Gemini API] All models in fallback chain failed.");
  throw lastError || new Error("All model generation attempts failed.");
}

/**
 * Helper to call Gemini generateContentStream with standard multi-tier fallback mechanism
 */
async function generateContentStreamWithFallback(options: { contents: any, config?: any, defaultModel?: string }) {
  const models = [
    options.defaultModel || "gemini-3.5-flash",
    "gemini-flash-latest",
    "gemini-2.5-flash",
    "gemini-3.1-flash-lite"
  ];

  const modelChain = Array.from(new Set(models.filter(Boolean)));
  let lastError: any = null;

  for (let keyIndex = 0; keyIndex < geminiClients.length; keyIndex += 1) {
    const client = geminiClients[keyIndex];
    if (!client) continue;

    for (const model of modelChain) {
      try {
        console.log(`[Gemini API] Attempting generateContentStream with model: ${model} using key ${keyIndex + 1}`);
        const stream = await client.models.generateContentStream({
          model,
          contents: options.contents,
          config: options.config,
        });
        console.log(`[Gemini API] Successfully initialized generateContentStream with model: ${model} using key ${keyIndex + 1}`);
        return { stream, activeModel: model, activeKeyIndex: keyIndex + 1 };
      } catch (err: any) {
        console.warn(`[Gemini API] Stream initialization failed with model ${model} for key ${keyIndex + 1}:`, err.message || err);
        lastError = err;
      }
    }
  }

  console.error("[Gemini API] All stream initialization attempts failed.");
  throw lastError || new Error("All stream generation attempts failed.");
}

async function tryFallbackContentStreamWithAlternateKey(options: { contents: any, config?: any, activeModel: string, activeKeyIndex: number }) {
  const fallbackModels = [
    options.activeModel,
    "gemini-3.5-flash",
    "gemini-flash-latest",
    "gemini-2.5-flash",
    "gemini-3.1-flash-lite"
  ];

  const modelChain = Array.from(new Set(fallbackModels.filter(Boolean)));
  const startKeyIndex = getAvailableGeminiClientIndex((options.activeKeyIndex || 1) - 1 + 1);

  for (let keyIndex = startKeyIndex; keyIndex < geminiClients.length; keyIndex += 1) {
    const client = geminiClients[keyIndex];
    if (!client) continue;

    for (const model of modelChain) {
      try {
        const stream = await client.models.generateContentStream({
          model,
          contents: options.contents,
          config: options.config,
        });
        return { stream, activeModel: model, activeKeyIndex: keyIndex + 1 };
      } catch (err: any) {
        console.warn(`[Gemini API] Alternate key fallback failed with model ${model} using key ${keyIndex + 1}:`, err.message || err);
      }
    }
  }

  throw new Error("No alternate online API key could continue the stream.");
}

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// --- Authentication Middleware ---
interface AuthenticatedRequest extends express.Request {
  user?: User;
}

const buildGuestUser = (): User => ({
  id: "guest",
  email: "guest@sucharai.local",
  passwordHash: "",
  fullName: "Guest User",
  avatarUrl: "https://api.dicebear.com/7.x/adventurer/svg?seed=guest",
  createdAt: new Date().toISOString(),
  bio: "Authenticated as a local guest user",
});

const authenticateToken = (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    req.user = buildGuestUser();
    return next();
  }

  jwt.verify(token, JWT_SECRET, (err, decoded: any) => {
    if (err || !decoded || !decoded.sub) {
      req.user = buildGuestUser();
      return next();
    }

    req.user = {
      id: decoded.sub,
      email: "firebase@sucharai.com",
      passwordHash: "",
      fullName: "Firebase User",
      avatarUrl: "https://api.dicebear.com/7.x/adventurer/svg?seed=fb-user",
      createdAt: new Date().toISOString(),
      bio: "Authenticated via Firebase DB"
    } as User;
    next();
  });
};

// ==========================================
// API ROUTES
// ==========================================

// --- Auth Endpoints ---

app.post("/api/auth/register", (_req, res) => {
  res.status(403).json({ detail: "Registration disabled. Use Google Sign-In via /api/auth/google" });
});

app.post("/api/auth/login", (_req, res) => {
  res.status(403).json({ detail: "Login with email/password is disabled. Use Google Sign-In via /api/auth/google" });
});

// Google Sign-In: accept an ID token from the client, verify it, create/find user, and return JWT
app.post("/api/auth/google", async (req, res) => {
  try {
    const { id_token } = req.body || {};
    if (!id_token || typeof id_token !== "string") {
      return res.status(400).json({ detail: "id_token is required in request body" });
    }

    const ticket = await googleClient.verifyIdToken({ idToken: id_token, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return res.status(400).json({ detail: "Invalid Google ID token" });
    }

    const email = String(payload.email).toLowerCase();
    const fullName = String(payload.name || email.split("@")[0]);
    const avatarUrl = String(payload.picture || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(email)}`);

    const db = readDb();
    let user = db.users.find((u) => u.email.toLowerCase() === email);
    if (!user) {
      const newUser: User = {
        id: db.users.length > 0 ? Math.max(...db.users.map((u) => typeof u.id === "number" ? u.id : 0)) + 1 : 1,
        email,
        passwordHash: "",
        fullName,
        avatarUrl,
        createdAt: new Date().toISOString(),
        bio: "",
      };
      db.users.push(newUser);
      writeDb(db);
      user = newUser;
    }

    const token = jwt.sign({ sub: user.id.toString() }, JWT_SECRET, { expiresIn: "1d" });
    const { passwordHash: _, ...userOut } = user as any;
    return res.json({ access_token: token, token_type: "bearer", user: userOut });
  } catch (error: any) {
    console.error("Google auth error:", error);
    return res.status(500).json({ detail: error.message || "Failed to authenticate with Google" });
  }
});

app.get("/api/auth/me", authenticateToken, (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ detail: "Unauthorized" });
  const { passwordHash: _, ...userOut } = req.user;
  res.json(userOut);
});

app.put("/api/auth/me", authenticateToken, (req: AuthenticatedRequest, res) => {
  try {
    if (!req.user) return res.status(401).json({ detail: "Unauthorized" });
    const { fullName, avatarUrl, password, bio } = req.body;

    const db = readDb();
    const userIndex = db.users.findIndex((u) => u.id === req.user!.id);
    if (userIndex === -1) return res.status(404).json({ detail: "User not found" });

    if (fullName !== undefined) db.users[userIndex].fullName = fullName;
    if (avatarUrl !== undefined) db.users[userIndex].avatarUrl = avatarUrl;
    if (bio !== undefined) db.users[userIndex].bio = bio;
    if (password) {
      db.users[userIndex].passwordHash = bcrypt.hashSync(password, 10);
    }

    writeDb(db);
    const { passwordHash: _, ...userOut } = db.users[userIndex];
    res.json(userOut);
  } catch (error: any) {
    res.status(500).json({ detail: error.message || "Failed to update profile" });
  }
});

// --- Conversations Endpoints ---

app.post("/api/conversations", authenticateToken, (req: AuthenticatedRequest, res) => {
  try {
    const { title } = req.body;
    const db = readDb();
    const newConv: Conversation = {
      id: db.conversations.length > 0 ? Math.max(...db.conversations.map((c) => typeof c.id === "number" ? c.id : 0)) + 1 : 1,
      userId: req.user!.id,
      title: title || "New Conversation",
      isArchived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    db.conversations.push(newConv);
    writeDb(db);
    res.status(201).json(newConv);
  } catch (error: any) {
    res.status(500).json({ detail: error.message || "Failed to create conversation" });
  }
});

app.get("/api/conversations", authenticateToken, (req: AuthenticatedRequest, res) => {
  try {
    const db = readDb();
    const userConvs = db.conversations
      .filter((c) => c.userId === req.user!.id)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    res.json(userConvs);
  } catch (error: any) {
    res.status(500).json({ detail: error.message || "Failed to fetch conversations" });
  }
});

app.put("/api/conversations/:id", authenticateToken, (req: AuthenticatedRequest, res) => {
  try {
    const rawConvId = req.params.id;
    const convId = isNaN(Number(rawConvId)) ? rawConvId : Number(rawConvId);
    const { title, isArchived } = req.body;
    const db = readDb();
    const convIndex = db.conversations.findIndex((c) => c.id.toString() === convId.toString() && c.userId.toString() === req.user!.id.toString());

    if (convIndex === -1) {
      return res.status(404).json({ detail: "Conversation not found" });
    }

    if (title !== undefined) db.conversations[convIndex].title = title;
    if (isArchived !== undefined) db.conversations[convIndex].isArchived = isArchived;
    db.conversations[convIndex].updatedAt = new Date().toISOString();

    writeDb(db);
    res.json(db.conversations[convIndex]);
  } catch (error: any) {
    res.status(500).json({ detail: error.message || "Failed to update conversation" });
  }
});

app.delete("/api/conversations/:id", authenticateToken, (req: AuthenticatedRequest, res) => {
  try {
    const rawConvId = req.params.id;
    const convId = isNaN(Number(rawConvId)) ? rawConvId : Number(rawConvId);
    const db = readDb();
    const convIndex = db.conversations.findIndex((c) => c.id.toString() === convId.toString() && c.userId.toString() === req.user!.id.toString());

    if (convIndex === -1) {
      return res.status(404).json({ detail: "Conversation not found" });
    }

    db.conversations.splice(convIndex, 1);
    // Cascade delete messages and documents
    db.messages = db.messages.filter((m) => m.conversationId.toString() !== convId.toString());
    db.documents = db.documents.filter((d) => d.conversationId.toString() !== convId.toString());

    writeDb(db);
    res.status(204).end();
  } catch (error: any) {
    res.status(500).json({ detail: error.message || "Failed to delete conversation" });
  }
});

// --- Messages Endpoints ---

app.get("/api/conversations/:id/messages", authenticateToken, (req: AuthenticatedRequest, res) => {
  try {
    const rawConvId = req.params.id;
    const convId = isNaN(Number(rawConvId)) ? rawConvId : Number(rawConvId);
    const db = readDb();
    const conv = db.conversations.find((c) => c.id.toString() === convId.toString() && c.userId.toString() === req.user!.id.toString());
    if (!conv) {
      return res.status(404).json({ detail: "Conversation not found" });
    }

    const messages = db.messages
      .filter((m) => m.conversationId.toString() === convId.toString())
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    res.json(messages);
  } catch (error: any) {
    res.status(500).json({ detail: error.message || "Failed to fetch messages" });
  }
});

app.post("/api/conversations/:id/messages", authenticateToken, (req: AuthenticatedRequest, res) => {
  try {
    const rawConvId = req.params.id;
    const convId = isNaN(Number(rawConvId)) ? rawConvId : Number(rawConvId);
    const { role, content } = req.body;
    if (!role || !content) {
      return res.status(400).json({ detail: "Role and content are required" });
    }
    const db = readDb();
    const conv = db.conversations.find((c) => c.id.toString() === convId.toString() && c.userId.toString() === req.user!.id.toString());
    if (!conv) {
      return res.status(404).json({ detail: "Conversation not found" });
    }
    const newMsg: Message = {
      id: db.messages.length > 0 ? Math.max(...db.messages.map((m) => typeof m.id === "number" ? m.id : 0)) + 1 : 1,
      conversationId: convId,
      role,
      content,
      createdAt: new Date().toISOString(),
    };
    db.messages.push(newMsg);
    conv.updatedAt = new Date().toISOString();
    writeDb(db);
    res.status(201).json(newMsg);
  } catch (error: any) {
    res.status(500).json({ detail: error.message || "Failed to save message" });
  }
});

// --- RAG Document Upload Endpoint ---

const textExtensions = [
  ".txt", ".md", ".json", ".csv", ".py", ".js", ".ts", ".tsx", ".jsx",
  ".html", ".css", ".scss", ".xml", ".sql", ".sh", ".bash", ".bat",
  ".ps1", ".rb", ".java", ".cpp", ".c", ".h", ".cs", ".go", ".rs",
  ".php", ".ini", ".cfg", ".conf", ".log", ".env", ".yaml", ".yml",
  ".toml", ".gradle", ".properties", ".kt", ".swift", ".m", ".r",
  ".pl", ".pm", ".t", ".pod", ".tex", ".bib", ".sty", ".cls", ".txt"
];

app.post("/api/conversations/:id/upload", authenticateToken, upload.single("file"), async (req: AuthenticatedRequest, res) => {
  try {
    const rawConvId = req.params.id;
    const convId = isNaN(Number(rawConvId)) ? rawConvId : Number(rawConvId);
    if (!req.file) {
      return res.status(400).json({ detail: "No file was uploaded" });
    }

    const { text: finalText, format } = await extractTextFromUpload(req.file);

    res.status(201).json({
      id: `doc-${Date.now()}`,
      filename: req.file.originalname || "unnamed_file",
      createdAt: new Date().toISOString(),
      text: finalText,
      normalizedText: finalText,
      format,
    });
  } catch (error: any) {
    res.status(500).json({ detail: error.message || "Failed to upload document" });
  }
});

// Raw Text/Code Snippet Direct Import Endpoint
app.post("/api/conversations/:id/import-text", authenticateToken, (req: AuthenticatedRequest, res) => {
  try {
    const rawConvId = req.params.id;
    const convId = isNaN(Number(rawConvId)) ? rawConvId : Number(rawConvId);
    const { filename, content } = req.body;
    if (!filename || !content) {
      return res.status(400).json({ detail: "Filename and content are required" });
    }

    res.status(201).json({ id: `doc-${Date.now()}`, filename, createdAt: new Date().toISOString(), text: content });
  } catch (error: any) {
    res.status(500).json({ detail: error.message || "Failed to import text" });
  }
});

// Submit/Update Feedback for an AI response
app.post("/api/messages/:id/feedback", authenticateToken, (req: AuthenticatedRequest, res) => {
  try {
    const messageId = isNaN(Number(req.params.id)) ? req.params.id : Number(req.params.id);
    const { rating, feedbackText, permissionGranted, conversationId } = req.body;

    if (!rating) {
      return res.status(400).json({ detail: "Rating is required" });
    }

    res.status(200).json({ detail: "Feedback submitted successfully", feedback: { messageId, conversationId: conversationId || "", rating, feedbackText: feedbackText || "", permissionGranted: !!permissionGranted, createdAt: new Date().toISOString() } });
  } catch (error: any) {
    res.status(500).json({ detail: error.message || "Failed to submit feedback" });
  }
});

app.post("/api/google-image-search", authenticateToken, upload.single("image"), async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.file || !req.file.mimetype?.startsWith("image/")) {
      return res.status(400).json({ detail: "Please upload an image file for Google reverse-image search." });
    }

    await fs.promises.mkdir(uploadsDir, { recursive: true });

    const safeName = String(req.file.originalname || "image").replace(/[^a-zA-Z0-9._-]/g, "_");
    const fileName = `${Date.now()}-${safeName}`;
    const targetPath = path.join(uploadsDir, fileName);
    await fs.promises.writeFile(targetPath, req.file.buffer);

    const imageUrl = `${req.protocol}://${req.get("host")}/uploads/${fileName}`;
    return res.json({ imageUrl });
  } catch (error: any) {
    console.error("Google image search upload failed:", error);
    return res.status(500).json({ detail: "Failed to prepare the image for Google reverse-image search." });
  }
});

app.post("/api/object-detection", authenticateToken, upload.single("image"), async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ detail: "No image file was uploaded" });
    }
    const mimetype = req.file.mimetype || "";
    if (!mimetype.startsWith("image/")) {
      return res.status(400).json({ detail: "File must be an image" });
    }

    const objects = await detectObjectsFromImage(req.file);

    res.status(200).json({ objects });
  } catch (error: any) {
    res.status(500).json({ detail: error.message || "Failed to run object detection" });
  }
});

async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      margin: { top: "20mm", right: "20mm", bottom: "20mm", left: "20mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

function wrapOfficeHtml(bodyContent: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;margin:40px;line-height:1.6;color:#111;}h1{font-size:24px;margin-bottom:18px;}p,pre{margin:0 0 12px;white-space:pre-wrap;word-break:break-word;}</style></head><body>${bodyContent}</body></html>`;
}

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function convertOfficeBufferToPdf(file: any) {
  const filename = String(file.originalname || "document");
  const ext = path.extname(filename).toLowerCase();
  if ([".docx", ".doc"].includes(ext)) {
    const result = await mammoth.convertToHtml({ buffer: file.buffer });
    const html = wrapOfficeHtml(result.value || "");
    return renderHtmlToPdf(html);
  }

  if ([".pptx", ".ppt"].includes(ext)) {
    const text = await extractTextFromOfficeBuffer(file.buffer, filename);
    const bodyHtml = `<h1>${escapeHtml(path.basename(filename, ext))}</h1><pre>${escapeHtml(text)}</pre>`;
    const html = wrapOfficeHtml(bodyHtml);
    return renderHtmlToPdf(html);
  }

  throw new Error("Unsupported office format for PDF conversion. Only DOCX, PPTX, and PPT are supported.");
}

async function convertPdfBufferToDocx(file: any) {
  const filename = String(file.originalname || "document.pdf");
  const extracted = await extractTextFromUpload(file);
  const text = normalizeExtractedText(extracted.text, filename);
  const paragraphs = text.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  const doc = new Document({
    sections: [{
      properties: {},
      children: paragraphs.map((paragraph) => new Paragraph({
        children: [new TextRun({ text: paragraph, size: 24, color: "000000" })],
        spacing: { after: 120 },
      })),
    }],
  });
  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}

app.post("/api/convert/office-to-pdf", authenticateToken, upload.single("file"), async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ detail: "No file was uploaded" });
    }
    const pdfBuffer = await convertOfficeBufferToPdf(req.file);
    const filename = String(req.file.originalname || "converted.pdf");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${path.basename(filename, path.extname(filename))}.pdf"`);
    res.send(pdfBuffer);
  } catch (error: any) {
    res.status(500).json({ detail: error.message || "Failed to convert office file to PDF" });
  }
});

app.post("/api/convert/pdf-to-docx", authenticateToken, upload.single("file"), async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ detail: "No file was uploaded" });
    }
    const docxBuffer = await convertPdfBufferToDocx(req.file);
    const filename = String(req.file.originalname || "converted.docx");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${path.basename(filename, path.extname(filename))}.docx"`);
    res.send(docxBuffer);
  } catch (error: any) {
    res.status(500).json({ detail: error.message || "Failed to convert PDF to DOCX" });
  }
});

app.post("/api/fast-convert", authenticateToken, upload.single("file"), async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ detail: "No file was uploaded" });
    }

    const result = await extractTextFromUpload(req.file, { fastMode: true });
    res.status(200).json({ extractedText: result.text });
  } catch (error: any) {
    res.status(500).json({ detail: error.message || "Failed to quickly convert the uploaded file" });
  }
});

app.post("/api/file-search", authenticateToken, upload.single("file"), async (req: AuthenticatedRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ detail: "No file was uploaded" });
    }

    const { query, userText } = req.body || {};
    const filename = req.file.originalname || "uploaded_file";

    let extractedText = (await extractTextFromUpload(req.file)).text;
    const isImage = (req.file.mimetype || "").startsWith("image/");
    const hasUsableText = Boolean(extractedText && extractedText.trim() && !/unable to extract|could not extract|no readable content|no extractable text|not yield any extractable/i.test(extractedText));

    if (!hasUsableText && isImage && req.body?.query) {
      const objects = await detectObjectsFromImage(req.file);
      const objectSummary = objects.length
        ? objects.map((obj: any) => `${obj.label || "object"} (${Math.round((obj.confidence || 0) * 100)}%)`).join(", ")
        : "No distinct objects detected.";
      extractedText = `Detected objects in the image: ${objectSummary}`;
    }

    const promptText = [query, userText].filter((value) => typeof value === "string" && value.trim()).map((value) => String(value).trim()).join("\n\n");
    const prompt = promptText || `Summarize this file and answer what is most important.`;
    const searchContext = `EXTRACTED FILE CONTENT (PRIMARY CONTEXT):\n${extractedText}\n\nUSER QUERY / INPUT:\n${prompt}`;
    let answerText = "No answer could be generated from this file.";

    try {
      const answerResponse = await generateContentWithFallback({
        contents: {
          parts: [{
            text: `You are a helpful assistant analyzing uploaded content. Use the extracted file content below as the primary source of truth to answer the user's request.\n\nFile name: ${filename}\n\n${searchContext}`
          }]
        },
        defaultModel: "gemini-3.5-flash"
      });
      answerText = answerResponse.text || answerText;
    } catch (answerError: any) {
      console.error("File search generation failed, using fallback text:", answerError);
      const fallbackPrompt = [prompt, extractedText].filter(Boolean).join("\n\n");
      answerText = `I could not reach the live AI service, but I still processed the uploaded file content as follows.\n\nFile: ${filename}\n\nRequest: ${prompt}\n\nContent preview:\n${extractedText.slice(0, 1800) || "No readable content was extracted."}`;
      if (fallbackPrompt.trim()) {
        answerText += `\n\nYou can try a simpler prompt such as “summarize this file” or “what is in this file?”`;
      }
    }

    res.status(200).json({ answer: answerText, extractedText });
  } catch (error: any) {
    res.status(500).json({ detail: error.message || "Failed to search uploaded file" });
  }
});

app.get("/api/conversations/:id/documents", authenticateToken, (req: AuthenticatedRequest, res) => {
  try {
    const rawConvId = req.params.id;
    const convId = isNaN(Number(rawConvId)) ? rawConvId : Number(rawConvId);
    res.json([]);
  } catch (error: any) {
    res.status(500).json({ detail: error.message || "Failed to fetch documents" });
  }
});

// --- Stream AI Chat completions (with real-time Gemini Streaming & RAG context lookup) ---

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, mode: isMobileServer ? "mobile" : "web", port: PORT });
});

app.get("/", (_req, res, next) => {
  if (process.env.NODE_ENV === "test" || process.env.NODE_ENV === "production" || isMobileServer) {
    res.sendFile(path.join(process.cwd(), "frontend", "index.html"));
    return;
  }
  next();
});

app.post("/api/conversations/:id/chat", authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const rawConvId = req.params.id;
    const convId = isNaN(Number(rawConvId)) ? rawConvId : Number(rawConvId);
    const {
      content,
      thinkingEnabled,
      searchEnabled,
      chatHistory: clientHistory
    } = req.body;

    if (!content) {
      return res.status(400).json({ detail: "Message content is required" });
    }

    const db = readDb();
    const conv = db.conversations.find((c) => c.id.toString() === convId.toString());

    // Guest and fresh local chats should still be allowed; the server will use empty history when needed.
    if (conv) {
      const userMsg: Message = {
        id: db.messages.length > 0 ? Math.max(...db.messages.map((m) => typeof m.id === "number" ? m.id : 0)) + 1 : 1,
        conversationId: convId,
        role: "user",
        content,
        createdAt: new Date().toISOString(),
      };
      db.messages.push(userMsg);
    }

    // Setup Server-Sent Events headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Retrieve previous messages for chat session
    let chatHistory: any[] = [];
    if (Array.isArray(clientHistory) && clientHistory.length > 0) {
      chatHistory = clientHistory;
    } else if (conv) {
      chatHistory = db.messages
        .filter((m) => m.conversationId.toString() === convId.toString())
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }

    // Perform RAG Search across uploaded files (fallback to empty if not found)
    const ragContext = typeof convId === "number" ? searchDocumentChunks(content, convId) : "";

    // Build model prompts
    let systemInstruction = "You are SucharAI, an advanced AI Assistant. Maintain a professional, helpful, warm, and well-structured communication style. Additionally, prioritize delivering extremely fast, structured, and step-by-step answers. Avoid long, verbose paragraphs; instead, break down information logically using ordered steps, numbered phases, or precise bullet points so it is fast to display and easy to follow. You must NEVER introduce yourself as Gemini or mention Gemini in responses to the user. Do not mention your developer, creator, Sujan Chandra Ray, or search terms like 'sucharbd' in standard responses (keep them completely clean and focused on the query). However, if the user explicitly asks about the AI's details, who created or developed you, or asks for details/sources of your developer, you MUST provide full, rich details about SucharAI and its developer/creator Sujan Chandra Ray, and suggest searching Google for 'sucharbd' to find more of his work, profiles, and sources.";

    if (thinkingEnabled) {
      systemInstruction += "\n\nCRITICAL DIRECTIVE ON DEEP THINKING & KNOWLEDGE RETRIEVAL:\nBefore providing your final response, you MUST deeply reason, analyze, and outline your thought process step-by-step. Wrap this entire analytical session inside a <thought>...</thought> block at the absolute start of your response.\nIn your thought block:\n1. State what query intent you are analyzing.\n2. Detail what searches you are simulating (e.g., 'Searching www for latest info on...', 'Looking up files/database for...').\n3. Synthesize your knowledge with any provided context.\nOnly after closing your </thought> block, provide your direct, beautifully formatted markdown response to the user. Do not reference the thought tags in the final user response.";
    }
    if (searchEnabled) {
      systemInstruction += "\n\nGOOGLE SEARCH GROUNDING ENABLED:\nYou have real-time search capabilities via Google Search. Whenever the user asks for fresh information, news, or something needing active web verification, use your search tools. Ground your response in the retrieved search results.";
    }
    if (ragContext) {
      systemInstruction += "\n\nDOCUMENT CONTEXT FROM UPLOADED FILES:\nThe user has uploaded one or more files for this conversation. Use the extracted file content below as context when answering. If the user asks about the files, summarize them or answer based on the content. If the uploaded file contains an introduction, questions, or structured content, use that information directly. Do not mention that you are using a file unless the user asks.";
      systemInstruction += `\n\nUse the following retrieved context from the uploaded documents to answer the user's question. If the information is not present in the context, helpfully state that and answer to the best of your general knowledge, referencing that it wasn't in the uploaded documents.\n\n[Retrieved Context]\n${ragContext}`;
    }

    // Initialize Chat contents array matching @google/genai format
    const contents: any[] = [];
    // Convert message history to contents parts
    // Note: We skip the system role as we pass it in config.systemInstruction
    for (const msg of chatHistory) {
      contents.push({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content }]
      });
    }

    // Fallback if chatHistory doesn't contain the current user message yet
    if (contents.length === 0 || contents[contents.length - 1].parts[0].text !== content) {
      contents.push({
        role: "user",
        parts: [{ text: content }]
      });
    }

    const modelConfig: any = {
      systemInstruction: systemInstruction,
    };

    if (searchEnabled) {
      modelConfig.tools = [{ googleSearch: {} }];
    }

    let assistantReply = "";

    if (geminiClients.length === 0) {
      const fallbackText = buildOfflineChatReply(content);
      const chunks = fallbackText.match(/[\s\S]{1,24}/g) || [fallbackText];
      for (const chunk of chunks) {
        assistantReply += chunk;
        res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      }
    } else {
      try {
        // Call Gemini Stream API with robust fallbacks
        const { stream: responseStream, activeModel, activeKeyIndex } = await generateContentStreamWithFallback({
          contents: contents,
          config: modelConfig,
          defaultModel: "gemini-3.5-flash"
        });

        try {
          for await (const chunk of responseStream) {
            const textChunk = chunk.text || "";
            assistantReply += textChunk;
            res.write(`data: ${JSON.stringify({ text: textChunk })}\n\n`);
          }
        } catch (err: any) {
          if (!assistantReply) {
            console.warn(`${activeModel} stream iteration failed using key ${activeKeyIndex || "unknown"}, falling back to next model:`, err);
            try {
              const fallbackResult = await tryFallbackContentStreamWithAlternateKey({
                contents,
                config: modelConfig,
                activeModel: activeModel,
                activeKeyIndex: activeKeyIndex || 1,
              });
              const fallbackStream = fallbackResult.stream;
              const fallbackUsedModel = fallbackResult.activeModel;

              for await (const chunk of fallbackStream) {
                const textChunk = chunk.text || "";
                assistantReply += textChunk;
                res.write(`data: ${JSON.stringify({ text: textChunk })}\n\n`);
              }
              console.log(`[Gemini API] Successfully completed fallback stream with model: ${fallbackUsedModel}`);
            } catch (fallbackErr: any) {
              console.error("Fallback stream failed during iteration:", fallbackErr);
              throw fallbackErr;
            }
          } else {
            throw err;
          }
        }
      } catch (error: any) {
        if (shouldUseOfflineFallback(error)) {
          const fallbackText = buildOfflineChatReply(content);
          const chunks = fallbackText.match(/[\s\S]{1,24}/g) || [fallbackText];
          for (const chunk of chunks) {
            assistantReply += chunk;
            res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
          }
        } else {
          throw error;
        }
      }
    }

    // Save assistant message to local DB only if conversation exists locally
    if (conv) {
      const assistantMsg: Message = {
        id: db.messages.length > 0 ? Math.max(...db.messages.map((m) => typeof m.id === "number" ? m.id : 0)) + 1 : 1,
        conversationId: convId,
        role: "assistant",
        content: assistantReply,
        createdAt: new Date().toISOString(),
      };
      db.messages.push(assistantMsg);

      // Update conversation timestamp
      const convIndex = db.conversations.findIndex((c) => c.id.toString() === convId.toString());
      if (convIndex !== -1) {
        db.conversations[convIndex].updatedAt = new Date().toISOString();
      }

      writeDb(db);
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (error: any) {
    console.error("Chat Stream Error:", error);
    res.write(`data: ${JSON.stringify({ error: error.message || "Failed to generate completion" })}\n\n`);
    res.end();
  }
});

const getTtsVoiceName = (languageCode: string) => {
  const normalized = (languageCode || "en-US").toLowerCase();
  const voiceMap: Record<string, string> = {
    "en-us": "Zephyr",
    "en-gb": "Zephyr",
    "bn-bd": "Puck",
    "hi-in": "Kore",
    "ar-sa": "Charon",
    "cs-cz": "Fenrir",
    "da-dk": "Puck",
    "nl-nl": "Charon",
    "fi-fi": "Fenrir",
    "fr-fr": "Puck",
    "de-de": "Fenrir",
    "el-gr": "Charon",
    "gu-in": "Kore",
    "he-il": "Zephyr",
    "hu-hu": "Fenrir",
    "id-id": "Puck",
    "it-it": "Charon",
    "ja-jp": "Kore",
    "kn-in": "Puck",
    "ko-kr": "Zephyr",
    "ml-in": "Kore",
    "mr-in": "Fenrir",
    "nb-no": "Puck",
    "pl-pl": "Charon",
    "pt-br": "Puck",
    "ro-ro": "Fenrir",
    "ru-ru": "Charon",
    "sk-sk": "Fenrir",
    "es-es": "Puck",
    "sv-se": "Zephyr",
    "ta-in": "Kore",
    "te-in": "Fenrir",
    "th-th": "Puck",
    "tr-tr": "Charon",
    "uk-ua": "Zephyr",
    "ur-pk": "Kore",
    "vi-vn": "Puck",
    "zh-cn": "Kore",
    "zh-tw": "Fenrir",
  };

  return voiceMap[normalized] || "Kore";
};

const getGoogleTranslateCode = (languageCode: string) => {
  const normalized = (languageCode || "en-US").trim().toLowerCase();
  const codeMap: Record<string, string> = {
    "en-us": "en",
    "en-gb": "en",
    "bn-bd": "bn",
    "hi-in": "hi",
    "ar-sa": "ar",
    "cs-cz": "cs",
    "da-dk": "da",
    "nl-nl": "nl",
    "fi-fi": "fi",
    "fr-fr": "fr",
    "de-de": "de",
    "el-gr": "el",
    "gu-in": "gu",
    "he-il": "iw",
    "hu-hu": "hu",
    "id-id": "id",
    "it-it": "it",
    "ja-jp": "ja",
    "kn-in": "kn",
    "ko-kr": "ko",
    "ml-in": "ml",
    "mr-in": "mr",
    "nb-no": "no",
    "pl-pl": "pl",
    "pt-br": "pt",
    "pt-pt": "pt",
    "ro-ro": "ro",
    "ru-ru": "ru",
    "sk-sk": "sk",
    "es-es": "es",
    "sv-se": "sv",
    "ta-in": "ta",
    "te-in": "te",
    "th-th": "th",
    "tr-tr": "tr",
    "uk-ua": "uk",
    "ur-pk": "ur",
    "vi-vn": "vi",
    "zh-cn": "zh-CN",
    "zh-tw": "zh-TW",
  };

  return codeMap[normalized] || normalized.split("-")[0] || "en";
};

const translateWithGoogleTranslate = async (text: string, languageCode: string) => {
  const targetCode = getGoogleTranslateCode(languageCode);
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetCode)}&dt=t&q=${encodeURIComponent(text)}`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Google Translate request failed with status ${response.status}`);
  }

  const payload = await response.json();
  if (Array.isArray(payload) && Array.isArray(payload[0])) {
    const translatedText = payload[0]
      .map((item: any) => item?.[0] ?? "")
      .join("")
      .trim();

    if (translatedText) {
      return translatedText;
    }
  }

  throw new Error("Google Translate returned no text");
};

app.get("/api/messages/:id/translate", authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const messageId = Number(req.params.id);
    const requestedLanguage = typeof req.query.lang === "string" && req.query.lang.trim() ? req.query.lang : "en-US";
    const db = readDb();
    const msg = db.messages.find((m) => m.id === messageId);
    if (!msg) {
      return res.status(404).json({ detail: "Message not found" });
    }

    if (!msg.content || !String(msg.content).trim()) {
      return res.json({ translatedText: msg.content || "" });
    }

    let translatedText = msg.content;

    if (requestedLanguage && requestedLanguage !== "en-US") {
      try {
        translatedText = await translateWithGoogleTranslate(String(msg.content), requestedLanguage);
      } catch (googleError) {
        console.warn("Google Translate failed, falling back to Gemini:", googleError);
        const translationPrompt = `Translate the following text into ${requestedLanguage}. Return only the translated text and nothing else. Do not add commentary. Text:\n${msg.content}`;

        const translationResponse = await generateContentWithFallback({
          defaultModel: "gemini-3.5-flash",
          contents: [{ parts: [{ text: translationPrompt }] }],
        });

        translatedText = String(translationResponse?.text || "").trim() || msg.content;
      }
    }

    return res.json({ translatedText });
  } catch (error: any) {
    console.error("Translation Error:", error);
    res.status(500).json({ detail: error.message || "Failed to translate message" });
  }
});

app.get("/api/messages/:id/tts", authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const messageId = Number(req.params.id);
    const requestedLanguage = typeof req.query.lang === "string" && req.query.lang.trim() ? req.query.lang : "en-US";
    const textOverride = typeof req.query.text === "string" && req.query.text.trim() ? req.query.text : "";
    const db = readDb();
    const msg = db.messages.find((m) => m.id === messageId);
    if (!msg) {
      return res.status(404).json({ detail: "Message not found" });
    }

    const speechText = textOverride || msg.content;
    const ttsPrompt = requestedLanguage && requestedLanguage !== "en-US"
      ? `Speak the following text naturally in ${requestedLanguage}. Do not add any commentary. Text:\n${speechText}`
      : speechText;

    const voiceName = getTtsVoiceName(requestedLanguage);

    // Call Gemini TTS API
    const ttsResponse = await generateContentWithFallback({
      defaultModel: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text: ttsPrompt }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    });

    const base64Audio = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      return res.status(500).json({ detail: "Failed to generate TTS audio content" });
    }

    const audioBuffer = Buffer.from(base64Audio, "base64");
    const isWav = audioBuffer.subarray(0, 4).toString("ascii") === "RIFF" && audioBuffer.subarray(8, 12).toString("ascii") === "WAVE";
    const audioToSend = isWav ? audioBuffer : convertPcmToWav(audioBuffer);

    res.setHeader("Content-Type", "audio/wav");
    res.setHeader("Content-Length", String(audioToSend.length));
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Accept-Ranges", "bytes");
    res.send(audioToSend);
  } catch (error: any) {
    console.error("TTS Generation Error:", error);
    res.status(500).json({ detail: error.message || "Failed to generate TTS audio" });
  }
});

// ==========================================
// VITE CLIENT DEV / PROD HOSTING
// ==========================================

async function startServer() {
  if (!isMobileServer) {
    const distPath = path.join(process.cwd(), "dist");
    app.get("/", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running on http://127.0.0.1:${PORT}`);
  });
}

const isDirectExecution = typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectExecution) {
  startServer();
}

export { app, startServer };
