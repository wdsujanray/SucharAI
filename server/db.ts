import fs from "fs";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "db.json");

export interface User {
  id: number | string;
  email: string;
  passwordHash: string;
  fullName: string;
  avatarUrl: string;
  createdAt: string;
  bio?: string;
}

export interface Conversation {
  id: number | string;
  userId: number | string;
  title: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: number | string;
  conversationId: number | string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  hasVoice?: boolean;
}

export interface DocumentRecord {
  id: number | string;
  conversationId: number | string;
  filename: string;
  text: string;
  createdAt: string;
}

export interface FeedbackRecord {
  id: number | string;
  messageId: number | string;
  conversationId: number | string;
  rating: "helpful" | "unhelpful";
  feedbackText: string;
  permissionGranted: boolean;
  createdAt: string;
}

export interface Schema {
  users: User[];
  conversations: Conversation[];
  messages: Message[];
  documents: DocumentRecord[];
  feedbacks?: FeedbackRecord[];
}

function ensureDbExists() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    const initialDb: Schema = {
      users: [],
      conversations: [],
      messages: [],
      documents: [],
      feedbacks: [],
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(initialDb, null, 2));
  } else {
    // Migrate existing database to have feedbacks if it doesn't
    try {
      const data = fs.readFileSync(DB_PATH, "utf-8");
      const parsed = JSON.parse(data);
      if (!parsed.feedbacks) {
        parsed.feedbacks = [];
        fs.writeFileSync(DB_PATH, JSON.stringify(parsed, null, 2));
      }
    } catch (e) {
      console.error("Migration error:", e);
    }
  }
}

export function readDb(): Schema {
  ensureDbExists();
  const data = fs.readFileSync(DB_PATH, "utf-8");
  const parsed = JSON.parse(data);
  if (!parsed.feedbacks) {
    parsed.feedbacks = [];
  }
  return parsed;
}

export function writeDb(db: Schema) {
  ensureDbExists();
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}
