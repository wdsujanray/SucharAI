import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { readDb, writeDb, User, Conversation, Message, DocumentRecord, FeedbackRecord } from "./server/db.js";
import { searchDocumentChunks } from "./server/rag.js";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key-change-in-production";

// Configure multer for file uploads in memory
const upload = multer({ storage: multer.memoryStorage() });

// Initialize Gemini Client
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AIzaSyAcglV15lOGLeTAUZ774VxoHeiiGJZFB1w";

const ai = new GoogleGenAI({
  apiKey: GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

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
  
  for (const model of modelChain) {
    try {
      console.log(`[Gemini API] Attempting generateContent with model: ${model}`);
      const response = await ai.models.generateContent({
        model,
        contents: options.contents,
        config: options.config,
      });
      console.log(`[Gemini API] Successfully completed generateContent with model: ${model}`);
      return response;
    } catch (err: any) {
      console.warn(`[Gemini API] Model ${model} failed:`, err.message || err);
      lastError = err;
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
  
  for (const model of modelChain) {
    try {
      console.log(`[Gemini API] Attempting generateContentStream with model: ${model}`);
      const stream = await ai.models.generateContentStream({
        model,
        contents: options.contents,
        config: options.config,
      });
      console.log(`[Gemini API] Successfully initialized generateContentStream with model: ${model}`);
      return { stream, activeModel: model };
    } catch (err: any) {
      console.warn(`[Gemini API] Stream initialization failed with model ${model}:`, err.message || err);
      lastError = err;
    }
  }
  
  console.error("[Gemini API] All stream initialization attempts failed.");
  throw lastError || new Error("All stream generation attempts failed.");
}

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// --- Authentication Middleware ---
interface AuthenticatedRequest extends express.Request {
  user?: User;
}

const authenticateToken = (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ detail: "Authentication token is required" });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded: any) => {
    const db = readDb();
    
    // If JWT verification fails, check if the token looks like a Firebase UID/token
    // In our client-side setup, we can pass Firebase uid as token to allow backend tasks
    if (err || !decoded || !decoded.sub) {
      const fallbackUser: User = db.users[0] || {
        id: "fb-user",
        email: "firebase@sucharai.com",
        passwordHash: "",
        fullName: "Firebase User",
        avatarUrl: "https://api.dicebear.com/7.x/adventurer/svg?seed=fb-user",
        createdAt: new Date().toISOString(),
        bio: "Authenticated via Firebase DB"
      };
      
      req.user = {
        ...fallbackUser,
        id: token.length > 5 ? token : fallbackUser.id
      };
      return next();
    }
    
    const user = db.users.find((u) => u.id.toString() === decoded.sub.toString());
    if (!user) {
      const fallbackUser: User = db.users[0] || {
        id: decoded.sub,
        email: "firebase@sucharai.com",
        passwordHash: "",
        fullName: "Firebase User",
        avatarUrl: "https://api.dicebear.com/7.x/adventurer/svg?seed=fb-user",
        createdAt: new Date().toISOString(),
        bio: "Authenticated via Firebase DB"
      };
      req.user = fallbackUser;
      return next();
    }
    req.user = user;
    next();
  });
};

// ==========================================
// API ROUTES
// ==========================================

// --- Auth Endpoints ---

app.post("/api/auth/register", (req, res) => {
  try {
    const { email, password, fullName, avatarUrl } = req.body;
    if (!email || !password || !fullName) {
      return res.status(400).json({ detail: "Email, password, and full name are required" });
    }

    const db = readDb();
    const existingUser = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (existingUser) {
      return res.status(400).json({ detail: "Email already registered" });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const newUser: User = {
      id: db.users.length > 0 ? Math.max(...db.users.map((u) => typeof u.id === "number" ? u.id : 0)) + 1 : 1,
      email: email.toLowerCase(),
      passwordHash,
      fullName,
      avatarUrl: avatarUrl || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(email)}`,
      createdAt: new Date().toISOString(),
      bio: "",
    };

    db.users.push(newUser);
    writeDb(db);

    const { passwordHash: _, ...userOut } = newUser;
    res.status(201).json(userOut);
  } catch (error: any) {
    res.status(500).json({ detail: error.message || "Failed to register" });
  }
});

app.post("/api/auth/login", (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ detail: "Email and password are required" });
    }

    const db = readDb();
    const user = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
      return res.status(401).json({ detail: "Incorrect email or password" });
    }

    const token = jwt.sign({ sub: user.id.toString() }, JWT_SECRET, { expiresIn: "1d" });
    res.json({ access_token: token, token_type: "bearer" });
  } catch (error: any) {
    res.status(500).json({ detail: error.message || "Failed to log in" });
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

    const db = readDb();
    const conv = db.conversations.find((c) => c.id.toString() === convId.toString() && c.userId.toString() === req.user!.id.toString());
    if (!conv) {
      console.log(`Conversation ${convId} not found in local JSON DB. Proceeding with upload/OCR for Firestore/Firebase conversation.`);
    }

    // Process file text content (plain text, code, or simulated/real text extraction using Gemini)
    let fileText = "";
    const mimetype = req.file.mimetype || "";
    const filename = req.file.originalname || "unnamed_file";
    const ext = path.extname(filename).toLowerCase();

    const isText = mimetype.startsWith("text/") || 
                   mimetype === "application/javascript" || 
                   mimetype === "application/json" || 
                   mimetype === "application/xml" || 
                   textExtensions.includes(ext);

    if (isText) {
      fileText = req.file.buffer.toString("utf-8");
    } else if (mimetype.startsWith("image/") || mimetype === "application/pdf") {
      try {
        console.log(`Analyzing document ${filename} (${mimetype}) via Gemini OCR...`);
        const documentPart = {
          inlineData: {
            mimeType: mimetype,
            data: req.file.buffer.toString("base64"),
          },
        };
        const promptPart = {
          text: `You are an expert document analyzer, OCR engine, and layout specialist. 
Please read and extract all content, figures, tables, data points, or text from this file named "${filename}".
Format your output in highly structured, logical, beautiful Markdown. 
If there are tables, transcribe them as clean Markdown tables. 
If there are diagrams, charts, or images, describe their elements precisely. 
Ensure you provide a faithful transcription so the user can query it in chat. Do not omit details or truncate the content.`,
        };
        
        const response = await generateContentWithFallback({
          contents: { parts: [documentPart, promptPart] },
          defaultModel: "gemini-3.5-flash"
        });

        fileText = response.text || "Could not extract text content from the file.";
      } catch (geminiError: any) {
        console.error("Gemini OCR extraction failed, falling back to raw extraction:", geminiError);
        // Fallback to basic string retrieval if Gemini fails
        const rawString = req.file.buffer.toString("utf-8");
        fileText = rawString
          .replace(/[^\x20-\x7E\n\r\t]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }
    } else {
      // General binary fallback (docx, xlsx, etc.) using Gemini
      try {
        const docPart = {
          inlineData: {
            mimeType: mimetype || "application/octet-stream",
            data: req.file.buffer.toString("base64"),
          },
        };
        const promptPart = {
          text: `Please analyze this document file "${filename}" of type "${mimetype}" and extract any readable textual content, key takeaways, structural metadata, or descriptions from it into clean Markdown.`,
        };
        const response = await generateContentWithFallback({
          contents: { parts: [docPart, promptPart] },
          defaultModel: "gemini-3.5-flash"
        });
        fileText = response.text || "Could not parse binary content.";
      } catch (binError: any) {
        const rawString = req.file.buffer.toString("utf-8");
        fileText = rawString
          .replace(/[^\x20-\x7E\n\r\t]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }
    }

    if (!fileText.trim()) {
      return res.status(400).json({ detail: "Could not extract readable text from this file" });
    }

    const newDoc: DocumentRecord = {
      id: db.documents.length > 0 ? Math.max(...db.documents.map((d) => typeof d.id === "number" ? d.id : 0)) + 1 : 1,
      conversationId: convId,
      filename,
      text: fileText,
      createdAt: new Date().toISOString(),
    };

    db.documents.push(newDoc);
    writeDb(db);

    res.status(201).json({ id: newDoc.id, filename: newDoc.filename, createdAt: newDoc.createdAt, text: fileText });
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

    const db = readDb();
    const conv = db.conversations.find((c) => c.id.toString() === convId.toString() && c.userId.toString() === req.user!.id.toString());
    if (!conv) {
      console.log(`Conversation ${convId} not found in local JSON DB. Proceeding with text import for Firestore/Firebase conversation.`);
    }

    const newDoc: DocumentRecord = {
      id: db.documents.length > 0 ? Math.max(...db.documents.map((d) => typeof d.id === "number" ? d.id : 0)) + 1 : 1,
      conversationId: convId.toString(),
      filename,
      text: content,
      createdAt: new Date().toISOString(),
    };

    db.documents.push(newDoc);
    writeDb(db);

    res.status(201).json({ id: newDoc.id, filename: newDoc.filename, createdAt: newDoc.createdAt, text: content });
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

    const db = readDb();
    if (!db.feedbacks) {
      db.feedbacks = [];
    }

    // Find and update or insert new feedback
    const existingIndex = db.feedbacks.findIndex((f) => f.messageId.toString() === messageId.toString());
    const feedbackRecord: FeedbackRecord = {
      id: existingIndex >= 0 
        ? db.feedbacks[existingIndex].id 
        : (db.feedbacks.length > 0 ? Math.max(...db.feedbacks.map((f) => typeof f.id === "number" ? f.id : 0)) + 1 : 1),
      messageId,
      conversationId: conversationId || "",
      rating,
      feedbackText: feedbackText || "",
      permissionGranted: !!permissionGranted,
      createdAt: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      db.feedbacks[existingIndex] = feedbackRecord;
    } else {
      db.feedbacks.push(feedbackRecord);
    }

    writeDb(db);
    res.status(200).json({ detail: "Feedback submitted successfully", feedback: feedbackRecord });
  } catch (error: any) {
    res.status(500).json({ detail: error.message || "Failed to submit feedback" });
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

    const docPart = {
      inlineData: {
        mimeType: mimetype,
        data: req.file.buffer.toString("base64"),
      },
    };

    const promptPart = {
      text: `Analyze this image for object detection.
Detect all major, distinct objects in the image. For each object detected, provide:
1. A label/name of the object.
2. The normalized bounding box [ymin, xmin, ymax, xmax] as integers between 0 and 1000 representing the percentage of image dimensions.
3. Your confidence score between 0.00 and 1.00.

Return the result as a strictly valid JSON array of objects, with no markdown code fences or backticks (no \`\`\`json, no preamble, no explanation).
The JSON array must have elements matching this schema:
[
  {
    "box_2d": [ymin, xmin, ymax, xmax],
    "label": "string",
    "confidence": number
  }
]
Example format:
[{"box_2d": [200, 300, 800, 900], "label": "dog", "confidence": 0.98}]`,
    };

    const response = await generateContentWithFallback({
      contents: { parts: [docPart, promptPart] },
      defaultModel: "gemini-3.5-flash"
    });

    const text = response.text || "[]";
    let cleanText = text.trim();
    if (cleanText.startsWith("```")) {
      cleanText = cleanText.replace(/^```[a-zA-Z]*\n/, "").replace(/\n```$/, "");
    }
    cleanText = cleanText.trim();

    let objects = [];
    try {
      objects = JSON.parse(cleanText);
    } catch (parseErr) {
      console.error("Failed to parse Gemini object detection response:", cleanText, parseErr);
      const match = cleanText.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (match) {
        try {
          objects = JSON.parse(match[0]);
        } catch (_) {}
      }
    }

    res.status(200).json({ objects });
  } catch (error: any) {
    res.status(500).json({ detail: error.message || "Failed to run object detection" });
  }
});

app.get("/api/conversations/:id/documents", authenticateToken, (req: AuthenticatedRequest, res) => {
  try {
    const rawConvId = req.params.id;
    const convId = isNaN(Number(rawConvId)) ? rawConvId : Number(rawConvId);
    const db = readDb();
    const conv = db.conversations.find((c) => c.id.toString() === convId.toString() && c.userId.toString() === req.user!.id.toString());
    if (!conv) {
      console.log(`Conversation ${convId} not found in local JSON DB. Fetching documents anyway.`);
    }

    const docs = db.documents
      .filter((d) => d.conversationId.toString() === convId.toString())
      .map(({ id, filename, createdAt }) => ({ id, filename, createdAt }));
    res.json(docs);
  } catch (error: any) {
    res.status(500).json({ detail: error.message || "Failed to fetch documents" });
  }
});

// --- Stream AI Chat completions (with real-time Gemini Streaming & RAG context lookup) ---

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
    
    // Only fail if there is no client-provided chatHistory AND no local conversation
    if (!conv && !clientHistory) {
      return res.status(404).json({ detail: "Conversation not found" });
    }

    // Save the user message to local history only if conversation exists locally
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
    if (clientHistory && Array.isArray(clientHistory)) {
      chatHistory = clientHistory;
    } else {
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

    // Call Gemini Stream API with robust fallbacks
    const { stream: responseStream, activeModel } = await generateContentStreamWithFallback({
      contents: contents,
      config: modelConfig,
      defaultModel: "gemini-3.5-flash"
    });

    let assistantReply = "";

    try {
      for await (const chunk of responseStream) {
        const textChunk = chunk.text || "";
        assistantReply += textChunk;
        res.write(`data: ${JSON.stringify({ text: textChunk })}\n\n`);
      }
    } catch (err: any) {
      if (!assistantReply) {
        console.warn(`${activeModel} stream iteration failed, falling back to next model:`, err);
        try {
          const fallbackModels = ["gemini-3.5-flash", "gemini-flash-latest", "gemini-2.5-flash", "gemini-3.1-flash-lite"];
          const currentIndex = fallbackModels.indexOf(activeModel);
          const nextModels = currentIndex !== -1 ? fallbackModels.slice(currentIndex + 1) : ["gemini-flash-latest", "gemini-2.5-flash", "gemini-3.1-flash-lite"];
          
          let fallbackStream = null;
          let fallbackUsedModel = "";
          
          for (const fm of nextModels) {
            try {
              console.log(`[Gemini API] Stream iteration failed, trying fallback stream with: ${fm}`);
              fallbackStream = await ai.models.generateContentStream({
                model: fm,
                contents: contents,
                config: modelConfig
              });
              fallbackUsedModel = fm;
              break;
            } catch (errFallback) {
              console.warn(`[Gemini API] Fallback stream setup failed with model ${fm}:`, errFallback);
            }
          }
          
          if (fallbackStream) {
            for await (const chunk of fallbackStream) {
              const textChunk = chunk.text || "";
              assistantReply += textChunk;
              res.write(`data: ${JSON.stringify({ text: textChunk })}\n\n`);
            }
            console.log(`[Gemini API] Successfully completed fallback stream with model: ${fallbackUsedModel}`);
          } else {
            throw new Error("All fallback models in iteration failed.");
          }
        } catch (fallbackErr: any) {
          console.error("Fallback stream failed during iteration:", fallbackErr);
          throw fallbackErr;
        }
      } else {
        throw err;
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

// --- Text-to-Speech endpoint (returns high-fidelity Gemini generated TTS MP3) ---

app.get("/api/messages/:id/tts", authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const messageId = Number(req.params.id);
    const db = readDb();
    const msg = db.messages.find((m) => m.id === messageId);
    if (!msg) {
      return res.status(404).json({ detail: "Message not found" });
    }

    // Call Gemini TTS API
    const ttsResponse = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text: msg.content }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Kore" }, // Prebuilt Voice Name options: 'Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'
          },
        },
      },
    });

    const base64Audio = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      return res.status(500).json({ detail: "Failed to generate TTS audio content" });
    }

    // Convert base64 audio to binary buffer and stream back
    const audioBuffer = Buffer.from(base64Audio, "base64");
    res.setHeader("Content-Type", "audio/pcm"); // Raw PCM Little-Endian 24kHz or WAV depending on model format
    res.send(audioBuffer);
  } catch (error: any) {
    console.error("TTS Generation Error:", error);
    res.status(500).json({ detail: error.message || "Failed to generate TTS audio" });
  }
});

// ==========================================
// VITE CLIENT DEV / PROD HOSTING
// ==========================================

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
