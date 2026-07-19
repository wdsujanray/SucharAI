export interface User {
  id: string | number;
  email: string;
  fullName: string;
  avatarUrl: string;
  createdAt: string;
  bio?: string;
}

export interface Conversation {
  id: string | number;
  userId: string | number;
  title: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string | number;
  conversationId: string | number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  hasVoice?: boolean;
}

export interface DocumentRecord {
  id: string | number;
  conversationId?: string | number;
  filename: string;
  mimeType?: string;
  size?: number;
  content?: string;
  text?: string;
  format?: string;
  storageUrl?: string;
  createdAt: string;
}
