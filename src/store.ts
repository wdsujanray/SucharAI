import { create } from "zustand";
import axios from "axios";
import { User, Conversation, Message, DocumentRecord } from "./types.js";

export type ThemeOption = "black" | "white" | "gray";
export type FeedbackRating = "helpful" | "unhelpful" | "1-star" | "2-star" | "3-star" | "4-star" | "5-star";

export interface ChatBackgroundSettings {
  type: "solid" | "gradient" | "image";
  color: string;
  gradient: string;
  imageUrl: string;
}

import { getOfflineAIResponse } from "./lib/offlineDataset.js";
import { auth, firestore, storage } from "./lib/firebase.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential
} from "firebase/auth";

export function getApiBaseUrl(): string {
  const env = (import.meta.env as Record<string, any>);
  const envUrl = env.VITE_API_BASE_URL || env.VITE_APP_API_BASE_URL;
  const envMobile = env.VITE_MOBILE_API_BASE_URL || envUrl;
  if (envMobile && typeof envMobile === "string" && envMobile.trim() !== "") {
    return envMobile.trim().replace(/\/$/, "");
  }

  if (typeof window === "undefined") {
    return "http://localhost:3000";
  }

  const origin = window.location.origin;
  if (origin.startsWith("capacitor://") || origin.startsWith("file://")) {
    // Running inside native WebView / Capacitor. For Android emulators use 10.0.2.2 (default)
    // For Genymotion use 10.0.3.2. For physical devices, set VITE_MOBILE_API_BASE_URL to your machine's LAN IP.
    const fallbackEmulator = "http://10.0.2.2:3000";
    console.warn("Mobile app detected (capacitor/file). If running on a physical device, set VITE_MOBILE_API_BASE_URL to your dev machine IP. Falling back to " + fallbackEmulator);
    return fallbackEmulator;
  }

  if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
    return origin.replace(/\/$/, "");
  }

  return origin.replace(/\/$/, "");
}
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  deleteDoc,
  limit
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

const LOCAL_UPLOAD_PREFIX = "sucharai_local_uploads";
const LOCAL_UPLOAD_META_KEY = `${LOCAL_UPLOAD_PREFIX}:meta`;
const LOCAL_UPLOAD_RETENTION_MS = 24 * 60 * 60 * 1000;

interface LocalUploadMetaEntry {
  key: string;
  conversationId: string | number;
  fileName: string;
  storedAt: number;
}

function getLocalUploadStorageKey(conversationId: string | number, fileName: string) {
  return `${LOCAL_UPLOAD_PREFIX}:${conversationId}:${encodeURIComponent(fileName)}`;
}

function readLocalUploadMeta(): LocalUploadMetaEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_UPLOAD_META_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalUploadMeta(entries: LocalUploadMetaEntry[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCAL_UPLOAD_META_KEY, JSON.stringify(entries));
}

function pruneExpiredLocalUploadFallbacks() {
  if (typeof window === "undefined") return;
  const now = Date.now();
  const entries = readLocalUploadMeta().filter((entry) => now - entry.storedAt < LOCAL_UPLOAD_RETENTION_MS);
  writeLocalUploadMeta(entries);

  for (const entry of readLocalUploadMeta()) {
    if (now - entry.storedAt >= LOCAL_UPLOAD_RETENTION_MS) {
      localStorage.removeItem(entry.key);
    }
  }
}

async function saveLocalUploadFallback(conversationId: string | number, file: File) {
  if (typeof window === "undefined") return null;

  try {
    pruneExpiredLocalUploadFallbacks();
    const dataUrl = await fileToDataUrl(file);
    const key = getLocalUploadStorageKey(conversationId, file.name);
    localStorage.setItem(key, dataUrl);
    const entries = readLocalUploadMeta();
    const nextEntries = entries.filter((entry) => entry.key !== key);
    nextEntries.push({ key, conversationId, fileName: file.name, storedAt: Date.now() });
    writeLocalUploadMeta(nextEntries);
    return key;
  } catch (err) {
    console.warn("Local upload fallback failed:", err);
    return null;
  }
}

async function fileToDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function removeLocalUploadFallback(conversationId: string | number, fileName: string) {
  if (typeof window === "undefined") return;
  const key = getLocalUploadStorageKey(conversationId, fileName);
  localStorage.removeItem(key);
  const entries = readLocalUploadMeta().filter((entry) => entry.key !== key);
  writeLocalUploadMeta(entries);
}

function getLocalUploadFallback(conversationId: string | number, fileName: string) {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(getLocalUploadStorageKey(conversationId, fileName));
}

// Setup Axios instance with default configuration.
// Use an explicit backend URL for mobile builds, since native WebViews may use file:// or capacitor:// origins.
export const api = axios.create({
  baseURL: getApiBaseUrl(),
});

// Check if the configured API base URL is reachable (simple GET to root)
export async function checkApiReachable(timeoutMs = 3000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    await api.get("/", { signal: controller.signal });
    clearTimeout(id);
    return true;
  } catch (err) {
    return false;
  }
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

interface ChatState {
  token: string | null;
  user: User | null;
  authChecked: boolean;
  conversations: Conversation[];
  activeConversationId: string | number | null;
  messages: Message[];
  documents: DocumentRecord[];
  searchQuery: string;
  isSidebarOpen: boolean;
  isSettingsOpen: boolean;
  isStreaming: boolean;
  isThinkingEnabled: boolean;
  isSearchEnabled: boolean;
  isOfflineMode: boolean;
  isDetectionOpen: boolean;
  theme: ThemeOption;
  chatBackground: ChatBackgroundSettings;

  // Actions
  setToken: (token: string | null) => void;
  setUser: (user: User | null) => void;
  setSearchQuery: (query: string) => void;
  setSidebarOpen: (isOpen: boolean) => void;
  setSettingsOpen: (isOpen: boolean) => void;
  setThinkingEnabled: (enabled: boolean) => void;
  setSearchEnabled: (enabled: boolean) => void;
  setOfflineMode: (enabled: boolean) => void;
  setDetectionOpen: (open: boolean) => void;
  setTheme: (theme: ThemeOption) => void;
  setChatBackground: (background: Partial<ChatBackgroundSettings>) => void;
  setActiveConversationId: (id: string | number | null, isNew?: boolean) => void;

  // Async Actions
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string, avatarUrl?: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => void;
  fetchUser: () => Promise<void>;
  updateUser: (fullName: string, password?: string, avatarUrl?: string, bio?: string, currentPassword?: string) => Promise<void>;

  fetchConversations: () => Promise<void>;
  createConversation: (title?: string) => Promise<string | number>;
  renameConversation: (id: string | number, title: string) => Promise<void>;
  archiveConversation: (id: string | number, isArchived: boolean) => Promise<void>;
  deleteConversation: (id: string | number) => Promise<void>;
  deleteConversations: (ids: Array<string | number>) => Promise<void>;

  fetchMessages: (conversationId: string | number) => Promise<void>;
  fetchDocuments: (conversationId: string | number) => Promise<void>;
  uploadFile: (conversationId: string | number, file: File) => Promise<{ text: string; filename: string; format: string; createdAt: string }>;
  importText: (conversationId: string | number, filename: string, content: string) => Promise<void>;
  submitFeedback: (messageId: string | number, conversationId: string | number, rating: FeedbackRating, feedbackText: string, permissionGranted: boolean) => Promise<void>;
  sendChatMessage: (conversationId: string | number, content: string, onChunk: (text: string) => void) => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => {
  // Listen to Firebase Auth changes to sync state seamlessly
  onAuthStateChanged(auth, async (fbUser) => {
    if (fbUser) {
      localStorage.setItem("token", fbUser.uid);
      set({ token: fbUser.uid });

      // Fetch user profile from Firestore
      try {
        const userDocRef = doc(firestore, "users", fbUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const profile = userDocSnap.data() as User;
          set({ user: profile });
          localStorage.setItem("user_cache", JSON.stringify(profile));
        } else {
          // Fallback if profile doc wasn't created yet
          const fallbackProfile: User = {
            id: fbUser.uid,
            email: fbUser.email || "",
            fullName: fbUser.displayName || "SucharAI User",
            avatarUrl: fbUser.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(fbUser.email || "user")}`,
            createdAt: new Date().toISOString(),
            bio: "Member since " + new Date().toLocaleDateString()
          };
          await setDoc(userDocRef, fallbackProfile);
          set({ user: fallbackProfile });
          localStorage.setItem("user_cache", JSON.stringify(fallbackProfile));
        }
      } catch (err) {
        console.warn("Could not fetch user doc (offline mode active):", err);
        const cached = localStorage.getItem("user_cache");
        if (cached) {
          set({ user: JSON.parse(cached) });
        }
      }

      // Trigger load conversations
      get().fetchConversations();
      set({ authChecked: true });
    } else {
      localStorage.removeItem("token");
      localStorage.removeItem("user_cache");
      set({ token: null, user: null, authChecked: true, conversations: [], activeConversationId: null, messages: [], documents: [] });
    }
  });

  const savedTheme = typeof window !== "undefined" ? localStorage.getItem("theme") : null;
  const initialTheme: ThemeOption = savedTheme === "white" || savedTheme === "gray" ? savedTheme : "black";

  const savedChatBackground = typeof window !== "undefined" ? localStorage.getItem("chatBackground") : null;
  let initialChatBackground: ChatBackgroundSettings = {
    type: "solid",
    color: "#0f172a",
    gradient: "linear-gradient(135deg, #020617 0%, #2563eb 100%)",
    imageUrl: ""
  };

  if (savedChatBackground) {
    try {
      const parsed = JSON.parse(savedChatBackground) as Partial<ChatBackgroundSettings>;
      initialChatBackground = {
        ...initialChatBackground,
        ...parsed
      };
    } catch {
      // Ignore invalid stored value and fall back to defaults.
    }
  }

  return {
    token: null,
    user: null,
    authChecked: false,
    conversations: [],
    activeConversationId: null,
    messages: [],
    documents: [],
    searchQuery: "",
    isSidebarOpen: true,
    isSettingsOpen: false,
    isStreaming: false,
    isThinkingEnabled: false,
    isSearchEnabled: false,
    isDetectionOpen: false,
    isOfflineMode: false,
    theme: initialTheme,
    chatBackground: initialChatBackground,

    setToken: (token) => {
      if (token) {
        localStorage.setItem("token", token);
      } else {
        localStorage.removeItem("token");
      }
      set({ token });
    },

    setUser: (user) => {
      if (user) {
        localStorage.setItem("user_cache", JSON.stringify(user));
      } else {
        localStorage.removeItem("user_cache");
      }
      set({ user });
    },

    setSearchQuery: (searchQuery) => set({ searchQuery }),
    setSidebarOpen: (isSidebarOpen) => set({ isSidebarOpen }),
    setSettingsOpen: (isSettingsOpen) => set({ isSettingsOpen }),
    setThinkingEnabled: (isThinkingEnabled) => set({ isThinkingEnabled }),
    setSearchEnabled: (isSearchEnabled) => set({ isSearchEnabled }),
    setDetectionOpen: (isDetectionOpen) => set({ isDetectionOpen }),
    setOfflineMode: (isOfflineMode) => set({ isOfflineMode }),
    setTheme: (theme) => {
      if (typeof window !== "undefined") {
        localStorage.setItem("theme", theme);
      }
      set({ theme });
    },

    setChatBackground: (background) => {
      const nextBackground = { ...get().chatBackground, ...background };
      if (typeof window !== "undefined") {
        localStorage.setItem("chatBackground", JSON.stringify(nextBackground));
      }
      set({ chatBackground: nextBackground });
    },

    setActiveConversationId: (id, isNew) => {
      set({ activeConversationId: id, messages: [], documents: [] });
      if (id && !isNew) {
        get().fetchMessages(id);
        get().fetchDocuments(id);
      }
    },

    // --- Authentication Actions (Firebase Auth + Firestore) ---

    login: async (email, password) => {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const fbUser = userCredential.user;
      get().setToken(fbUser.uid);

      const userDocRef = doc(firestore, "users", fbUser.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        const profile = userDocSnap.data() as User;
        get().setUser(profile);
      }
    },

    register: async (email, password, fullName, avatarUrl) => {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const fbUser = userCredential.user;

      const newProfile: User = {
        id: fbUser.uid,
        email: email.toLowerCase(),
        fullName: fullName,
        avatarUrl: avatarUrl || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(email)}`,
        createdAt: new Date().toISOString(),
        bio: "Explorer and conversationalist"
      };

      const userDocRef = doc(firestore, "users", fbUser.uid);
      await setDoc(userDocRef, newProfile);
      get().setToken(fbUser.uid);
      get().setUser(newProfile);
    },

    loginWithGoogle: async () => {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      const fbUser = userCredential.user;
      get().setToken(fbUser.uid);

      const userDocRef = doc(firestore, "users", fbUser.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        const profile = userDocSnap.data() as User;
        get().setUser(profile);
      } else {
        const emailVal = fbUser.email || "";
        const newProfile: User = {
          id: fbUser.uid,
          email: emailVal.toLowerCase(),
          fullName: fbUser.displayName || "SucharAI User",
          avatarUrl: fbUser.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(emailVal || "user")}`,
          createdAt: new Date().toISOString(),
          bio: "Explorer and conversationalist"
        };
        await setDoc(userDocRef, newProfile);
        get().setUser(newProfile);
      }
    },

    logout: async () => {
      await signOut(auth);
      get().setToken(null);
      get().setUser(null);
      set({ conversations: [], activeConversationId: null, messages: [], documents: [] });
    },

    fetchUser: async () => {
      const current = auth.currentUser;
      if (current) {
        const userDocRef = doc(firestore, "users", current.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          get().setUser(userDocSnap.data() as User);
        }
      }
    },

    updateUser: async (fullName, password, avatarUrl, bio, currentPassword) => {
      const current = auth.currentUser;
      if (!current) return;

      const userDocRef = doc(firestore, "users", current.uid);
      const updates: any = {};
      if (fullName !== undefined) updates.fullName = fullName;
      if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl;
      if (bio !== undefined) updates.bio = bio;

      await updateDoc(userDocRef, updates);

      if (password) {
        if (!currentPassword) {
          throw new Error("Current password is required to update your password.");
        }
        if (!current.email) {
          throw new Error("Your account has no email address associated.");
        }
        try {
          const credential = EmailAuthProvider.credential(current.email, currentPassword);
          await reauthenticateWithCredential(current, credential);
        } catch (authErr: any) {
          console.error("Reauthentication failed:", authErr);
          throw new Error("Incorrect current password. Please verify and try again.");
        }
        await updatePassword(current, password);
      }

      const updatedSnap = await getDoc(userDocRef);
      if (updatedSnap.exists()) {
        get().setUser(updatedSnap.data() as User);
      }
    },

    // --- Conversations Sync (Firestore Database) ---

    fetchConversations: async () => {
      const currentUid = auth.currentUser?.uid || get().token;
      if (!currentUid) return;

      try {
        const conversationsRef = collection(firestore, "conversations");
        const q = query(
          conversationsRef,
          where("userId", "==", currentUid)
        );
        const querySnapshot = await getDocs(q);
        const list: Conversation[] = [];
        querySnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          list.push({
            id: docSnap.id,
            userId: data.userId,
            title: data.title,
            isArchived: !!data.isArchived,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt
          });
        });
        list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        set({ conversations: list });
      } catch (err) {
        console.warn("fetchConversations failed (using local offline cache):", err);
      }
    },

    createConversation: async (title) => {
      const currentUid = auth.currentUser?.uid || get().token;
      if (!currentUid) throw new Error("User not authenticated");

      // Generate local doc reference with custom string ID
      const newConvRef = doc(collection(firestore, "conversations"));
      const newConv: Conversation = {
        id: newConvRef.id,
        userId: currentUid,
        title: title || "New Conversation",
        isArchived: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await setDoc(newConvRef, newConv);
      set((state) => ({ conversations: [newConv, ...state.conversations] }));
      return newConv.id;
    },

    renameConversation: async (id, title) => {
      const docRef = doc(firestore, "conversations", id.toString());
      await updateDoc(docRef, { title, updatedAt: new Date().toISOString() });
      set((state) => ({
        conversations: state.conversations.map((c) => (c.id === id ? { ...c, title } : c)),
      }));
    },

    archiveConversation: async (id, isArchived) => {
      const docRef = doc(firestore, "conversations", id.toString());
      await updateDoc(docRef, { isArchived, updatedAt: new Date().toISOString() });
      set((state) => ({
        conversations: state.conversations.map((c) => (c.id === id ? { ...c, isArchived } : c)),
      }));
    },

    deleteConversation: async (id) => {
      const docRef = doc(firestore, "conversations", id.toString());
      await deleteDoc(docRef);
      set((state) => ({
        conversations: state.conversations.filter((c) => c.id !== id),
        activeConversationId: state.activeConversationId === id ? null : state.activeConversationId,
        messages: state.activeConversationId === id ? [] : state.messages,
        documents: state.activeConversationId === id ? [] : state.documents,
      }));
    },

    deleteConversations: async (ids) => {
      const normalizedIds = ids.map((id) => id.toString());
      const currentUid = auth.currentUser?.uid || get().token;
      if (!currentUid) throw new Error("User not authenticated");

      await Promise.all(normalizedIds.map((id) => deleteDoc(doc(firestore, "conversations", id))));

      set((state) => {
        const activeRemoved = state.activeConversationId !== null && normalizedIds.includes(state.activeConversationId.toString());
        return {
          conversations: state.conversations.filter((c) => !normalizedIds.includes(c.id.toString())),
          activeConversationId: activeRemoved ? null : state.activeConversationId,
          messages: activeRemoved ? [] : state.messages,
          documents: activeRemoved ? [] : state.documents,
        };
      });
    },

    // --- Messages Sync (Firestore Database) ---

    fetchMessages: async (conversationId) => {
      try {
        const messagesRef = collection(firestore, "messages");
        const q = query(
          messagesRef,
          where("conversationId", "==", conversationId.toString())
        );
        const querySnapshot = await getDocs(q);
        const list: Message[] = [];
        querySnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          list.push({
            id: docSnap.id,
            conversationId: data.conversationId,
            role: data.role,
            content: data.content,
            createdAt: data.createdAt,
            hasVoice: !!data.hasVoice
          });
        });
        list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        set({ messages: list });
      } catch (err) {
        console.warn("fetchMessages failed (using offline cached database):", err);
      }
    },

    fetchDocuments: async (conversationId) => {
      const pathStr = "documents";
      try {
        const documentsRef = collection(firestore, pathStr);
        const q = query(
          documentsRef,
          where("conversationId", "==", conversationId.toString())
        );
        const querySnapshot = await getDocs(q);
        const list: DocumentRecord[] = [];
        querySnapshot.forEach((docSnap) => {
          const data = docSnap.data();
          list.push({
            id: docSnap.id,
            conversationId: data.conversationId,
            filename: data.filename,
            mimeType: data.mimeType || "",
            size: data.size || 0,
            content: data.content || data.text || "",
            text: data.text || data.content || "",
            createdAt: data.createdAt,
          });
        });
        list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        set({ documents: list });
      } catch (err) {
        console.warn("fetchDocuments from Firestore failed (trying local API):", err);
        try {
          const response = await api.get(`/api/conversations/${conversationId}/documents`);
          set({ documents: response.data });
        } catch (apiErr) {
          handleFirestoreError(err, OperationType.GET, pathStr);
        }
      }
    },

    uploadFile: async (conversationId, file) => {
      const pathStr = "documents";
      let docId: string | null = null;
      try {
        const currentUid = auth.currentUser?.uid || get().token || "anonymous";
        const storagePath = `uploads/${currentUid}/${conversationId}/${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
        const fileRef = ref(storage, storagePath);
        await uploadBytes(fileRef, file);
        const storageUrl = await getDownloadURL(fileRef);

        const formData = new FormData();
        formData.append("file", file);
        const response = await api.post(`/api/conversations/${conversationId}/upload`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });

        const docData = response.data;
        const extractedText = docData.normalizedText || docData.text || "";
        docId = docData.id ? String(docData.id) : doc(collection(firestore, pathStr)).id;
        const firestoreDoc = {
          id: docId,
          conversationId: conversationId.toString(),
          filename: docData.filename || file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size || 0,
          content: extractedText,
          text: extractedText,
          format: docData.format || "text/plain",
          storageUrl,
          createdAt: docData.createdAt || new Date().toISOString()
        };
        await setDoc(doc(firestore, pathStr, docId), firestoreDoc);
        return {
          text: extractedText,
          filename: docData.filename || file.name,
          format: docData.format || file.type || "text/plain",
          createdAt: docData.createdAt || new Date().toISOString(),
        };
      } catch (err) {
        try {
          const fallbackKey = await saveLocalUploadFallback(conversationId, file);
          if (fallbackKey) {
            console.warn("Falling back to local device storage for uploaded file:", file.name);
            const fallbackDoc = {
              id: `local-${Date.now()}`,
              conversationId: conversationId.toString(),
              filename: file.name,
              mimeType: file.type || "application/octet-stream",
              size: file.size || 0,
              content: "",
              text: "",
              format: "text/plain",
              storageUrl: fallbackKey,
              createdAt: new Date().toISOString(),
            };
            await setDoc(doc(firestore, pathStr, fallbackDoc.id), fallbackDoc);
          }
        } catch (fallbackErr) {
          console.error("Local upload fallback failed:", fallbackErr);
        }
        if (docId) {
          handleFirestoreError(err, OperationType.WRITE, `${pathStr}/${docId}`);
        } else {
          handleFirestoreError(err, OperationType.WRITE, pathStr);
        }
      }
      await get().fetchDocuments(conversationId);
      return {
        text: "",
        filename: file.name,
        format: file.type || "application/octet-stream",
        createdAt: new Date().toISOString(),
      };
    },

    importText: async (conversationId, filename, content) => {
      const pathStr = "documents";
      let docId: string | null = null;
      try {
        const response = await api.post(`/api/conversations/${conversationId}/import-text`, { filename, content });
        const docData = response.data;
        docId = docData.id ? String(docData.id) : doc(collection(firestore, pathStr)).id;
        const firestoreDoc = {
          id: docId,
          conversationId: conversationId.toString(),
          filename: docData.filename || filename,
          mimeType: "text/plain",
          size: new Blob([content]).size,
          content: content,
          text: content,
          createdAt: docData.createdAt || new Date().toISOString()
        };
        await setDoc(doc(firestore, pathStr, docId), firestoreDoc);
      } catch (err) {
        if (docId) {
          handleFirestoreError(err, OperationType.WRITE, `${pathStr}/${docId}`);
        } else {
          handleFirestoreError(err, OperationType.WRITE, pathStr);
        }
      }
      await get().fetchDocuments(conversationId);
    },

    submitFeedback: async (messageId, conversationId, rating, feedbackText, permissionGranted) => {
      await api.post(`/api/messages/${messageId}/feedback`, {
        rating,
        feedbackText,
        permissionGranted,
        conversationId,
      });
    },

    sendChatMessage: async (conversationId, content, onChunk) => {
      set({ isStreaming: true });
      let hasErrorOccurred = false;

      // 1. Instantly append user's typed message locally for buttery-smooth rendering
      const userDocId = doc(collection(firestore, "messages")).id;
      const localUserMsg: Message = {
        id: userDocId,
        conversationId,
        role: "user",
        content,
        createdAt: new Date().toISOString(),
      };

      // 2. Add temporary placeholder for AI response
      const assistantDocId = doc(collection(firestore, "messages")).id;
      const localAssistantMsg: Message = {
        id: assistantDocId,
        conversationId,
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
      };

      set((state) => ({
        messages: [...state.messages, localUserMsg, localAssistantMsg],
      }));

      // Write User message to Firestore (handles offline queue out-of-the-box!)
      try {
        await setDoc(doc(firestore, "messages", userDocId), localUserMsg);
      } catch (e) {
        console.warn("Queued user message in local offline Firestore cache", e);
      }

      // --- OFFLINE MODE (only when the user explicitly opts in) ---
      if (get().isOfflineMode) {
        try {
          const offlineResponse = getOfflineAIResponse(content);
          const textChunks = offlineResponse.match(/[\s\S]{1,6}/g) || [offlineResponse];
          let assistantText = "";

          for (const chunk of textChunks) {
            if (!get().isStreaming) break;
            assistantText += chunk;
            onChunk(chunk);
            set((state) => ({
              messages: state.messages.map((m) =>
                m.id === localAssistantMsg.id ? { ...m, content: assistantText } : m
              ),
            }));
            await new Promise((resolve) => setTimeout(resolve, 15));
          }

          const completedAssistantMsg: Message = {
            ...localAssistantMsg,
            content: assistantText,
            createdAt: new Date().toISOString()
          };
          try {
            await setDoc(doc(firestore, "messages", assistantDocId), completedAssistantMsg);
          } catch (e) {
            console.log("Queued assistant message in offline cache", e);
          }
          set({ isStreaming: false });
          get().fetchConversations();
          return;
        } catch (err) {
          console.warn("Offline mode failed, falling back to the online assistant.", err);
        }
      }

      // --- ONLINE MODE (WITH GEMINI REAL-TIME STREAMING) ---
      try {
        const token = localStorage.getItem("token") || "";

        // Load recent chat history from current state messages to feed into Gemini API statelessly
        const historyToSend = get().messages
          .filter((m) => m.id !== localAssistantMsg.id) // skip current placeholder
          .map((m) => ({
            role: m.role,
            content: m.content,
            createdAt: m.createdAt
          }));

        const apiBaseUrl = getApiBaseUrl();
        const response = await fetch(`${apiBaseUrl}/api/conversations/${conversationId}/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            content,
            thinkingEnabled: get().isThinkingEnabled,
            searchEnabled: get().isSearchEnabled,
            chatHistory: historyToSend
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || `Chat request failed with ${response.status}`);
        }

        if (!response.body) {
          throw new Error("Response stream body is empty");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let assistantText = "";
        let streamBuffer = "";

        while (true) {
          if (hasErrorOccurred) break;
          const { value, done } = await reader.read();
          if (done) {
            if (streamBuffer.trim()) {
              const lines = streamBuffer.split("\n");
              for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith("data: ")) {
                  const dataStr = trimmed.slice(6).trim();
                  if (dataStr === "[DONE]") continue;
                  try {
                    const parsedData = JSON.parse(dataStr);
                    if (parsedData && parsedData.text) {
                      assistantText += parsedData.text;
                      onChunk(parsedData.text);
                    }
                  } catch (e) { }
                }
              }
            }
            break;
          }

          streamBuffer += decoder.decode(value, { stream: true });
          const lines = streamBuffer.split("\n");
          streamBuffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            if (trimmed.startsWith("data: ")) {
              const dataStr = trimmed.slice(6).trim();
              if (dataStr === "[DONE]") continue;

              let parsedData: any = null;
              try {
                parsedData = JSON.parse(dataStr);
              } catch (err) {
                // Ignore incomplete lines
              }

              if (parsedData) {
                if (parsedData.text) {
                  assistantText += parsedData.text;
                  onChunk(parsedData.text);

                  // Update state UI instantly
                  set((state) => ({
                    messages: state.messages.map((m) =>
                      m.id === localAssistantMsg.id ? { ...m, content: assistantText } : m
                    ),
                  }));
                } else if (parsedData.error) {
                  const fallbackMessage = "The live assistant is currently unavailable. Please try again in a moment.";
                  assistantText = fallbackMessage;
                  onChunk(fallbackMessage);
                  set((state) => ({
                    messages: state.messages.map((m) =>
                      m.id === localAssistantMsg.id ? { ...m, content: assistantText } : m
                    ),
                  }));
                  hasErrorOccurred = true;
                  break;
                }
              }
            }
          }
        }

        if (!hasErrorOccurred) {
          const completedAssistantMsg: Message = {
            ...localAssistantMsg,
            content: assistantText,
            createdAt: new Date().toISOString()
          };
          await setDoc(doc(firestore, "messages", assistantDocId), completedAssistantMsg);

          const convRef = doc(firestore, "conversations", conversationId.toString());
          await updateDoc(convRef, { updatedAt: new Date().toISOString() }).catch(() => { });
        }
      } catch (error) {
        console.error("Chat Error:", error);
        const fallbackMessage = "The live assistant is currently unavailable. Please try again in a moment.";
        onChunk(fallbackMessage);
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === localAssistantMsg.id ? { ...m, content: fallbackMessage } : m
          ),
        }));
      } finally {
        set({ isStreaming: false });
        get().fetchConversations();
      }
    },
  };
});
