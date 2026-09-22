import React, { useState, useEffect } from "react";
import {
  MessageSquare, Plus, Search, Archive, Trash2, Edit2, Check, X, Settings, LogOut, FileText, ChevronRight, Square, CheckSquare2
} from "lucide-react";
import { useChatStore } from "../store.js";
import { containsProfanity } from "../lib/searchUtils.js";
import { logoUrl } from "../lib/logo.ts";

interface SidebarProps {
  onOpenConverter: () => void;
  onOpenChat: () => void;
  onOpenSettings: () => void;
}

export default function Sidebar({ onOpenConverter, onOpenChat, onOpenSettings }: SidebarProps) {
  const {
    user,
    conversations,
    activeConversationId,
    searchQuery,
    isSidebarOpen,
    setSidebarOpen,
    setActiveConversationId,
    createConversation,
    renameConversation,
    archiveConversation,
    deleteConversation,
    deleteConversations,
    setSearchQuery,
    setSettingsOpen,
    logout,
    fetchConversations
  } = useChatStore();

  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [deletingId, setDeletingId] = useState<string | number | null>(null);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedConversationIds, setSelectedConversationIds] = useState<Array<string | number>>([]);

  useEffect(() => {
    fetchConversations();
  }, []);

  const handleCreateChat = async () => {
    onOpenChat();
    const id = await createConversation("New Chat");
    setActiveConversationId(id);
  };

  const handleStartRename = (id: string | number, currentTitle: string) => {
    setEditingId(id);
    setEditingTitle(currentTitle);
  };

  const handleSaveRename = async (id: string | number) => {
    if (editingTitle.trim()) {
      await renameConversation(id, editingTitle.trim());
    }
    setEditingId(null);
  };

  const handleDelete = async (id: string | number) => {
    await deleteConversation(id);
    setDeletingId(null);
  };

  const toggleConversationSelection = (id: string | number) => {
    setSelectedConversationIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  const handleBulkDelete = async () => {
    if (!selectedConversationIds.length) return;
    await deleteConversations(selectedConversationIds);
    setSelectedConversationIds([]);
    setMultiSelectMode(false);
  };

  const resetSelection = () => {
    setSelectedConversationIds([]);
    setMultiSelectMode(false);
  };

  // Filter conversations by search query and active/archived state
  const filteredConversations = conversations.filter((c) => {
    const matchesSearch = c.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesArchiveState = showArchived ? c.isArchived : !c.isArchived;
    return matchesSearch && matchesArchiveState;
  });

  if (!isSidebarOpen) return null;

  return (
    <div className="fixed inset-y-0 left-0 z-40 w-80 h-full overflow-hidden bg-panel border-r border-theme flex flex-col text-theme shadow-2xl md:relative md:shadow-none md:w-80">
      {/* Desktop close button on mobile only */}
      <div className="flex items-center justify-end p-3 border-b border-theme md:hidden">
        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          className="rounded-lg border border-theme bg-surface p-2 text-secondary hover:text-theme transition"
          title="Close sidebar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {/* Header / New Chat */}
      <div className="p-4 flex flex-col gap-3 border-b border-theme">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logoUrl} alt="SucharAI" className="w-10 h-10 rounded-xl bg-input border border-theme object-contain" />
            <div>
              <span className="block font-display font-semibold text-theme text-base tracking-tight">SucharAI</span>
              <span className="text-[11px] text-secondary uppercase tracking-[0.15em]">AI Assistant</span>
            </div>
          </div>
          {/* <div className="flex items-center gap-2">
            <button
              onClick={onOpenConverter}
              className="rounded-lg border border-theme bg-surface px-2.5 py-2 text-[11px] font-semibold text-theme transition hover:bg-surface-soft"
              title="Open file converter"
            >
              Convert
            </button>
            <button
              onClick={handleCreateChat}
              className="p-2 bg-surface hover:bg-surface-soft text-theme border border-theme rounded-lg transition duration-200 shadow-sm flex items-center justify-center"
              title="New Conversation"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div> */}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => {
              const nextValue = e.target.value;
              if (containsProfanity(nextValue)) {
                return;
              }
              setSearchQuery(nextValue);
            }}
            className="w-full pl-9 pr-4 py-2 bg-input border border-theme rounded-lg text-xs text-theme placeholder-text-secondary focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/25 transition duration-150"
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              setMultiSelectMode((current) => !current);
              setSelectedConversationIds([]);
            }}
            className="text-[11px] font-semibold text-secondary hover:text-theme transition"
          >
            {multiSelectMode ? "Cancel" : "Select multiple"}
          </button>
          {multiSelectMode && (
            <div className="flex items-center gap-2 text-[11px]">
              <button
                type="button"
                onClick={resetSelection}
                className="text-secondary hover:text-theme transition"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={handleBulkDelete}
                disabled={!selectedConversationIds.length}
                className="rounded-md bg-red-600/90 px-2.5 py-1 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Delete selected
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 flex gap-2 border-b border-theme pb-2 text-xs font-semibold">
        <button
          onClick={() => setShowArchived(false)}
          className={`pb-1 px-1 border-b-2 transition duration-200 ${!showArchived
            ? "border-emerald-400 text-theme font-medium"
            : "border-transparent text-secondary hover:text-theme"
            }`}
        >
          Conversations
        </button>
        <button
          onClick={() => setShowArchived(true)}
          className={`pb-1 px-1 border-b-2 transition duration-200 ${showArchived
            ? "border-emerald-400 text-theme font-medium"
            : "border-transparent text-secondary hover:text-theme"
            }`}
        >
          Archived
        </button>
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filteredConversations.length === 0 ? (
          <div className="text-center py-8 text-xs text-secondary font-medium">
            No conversations found
          </div>
        ) : (
          filteredConversations.map((c) => {
            const isActive = c.id === activeConversationId;
            const isEditing = c.id === editingId;
            const isDeleting = c.id === deletingId;

            return (
              <div
                key={c.id}
                className={`group relative flex items-center justify-between rounded-lg p-2.5 transition duration-150 text-xs font-medium ${isActive
                  ? "bg-surface border border-theme text-theme shadow-sm"
                  : "hover:bg-surface-soft/40 text-secondary hover:text-theme border border-transparent"
                  }`}
              >
                {multiSelectMode && (
                  <button
                    type="button"
                    onClick={() => toggleConversationSelection(c.id)}
                    className="mr-2 shrink-0 rounded-md p-1 text-secondary hover:text-theme"
                    title="Select conversation"
                  >
                    {selectedConversationIds.includes(c.id) ? <CheckSquare2 className="w-4 h-4 text-emerald-400" /> : <Square className="w-4 h-4" />}
                  </button>
                )}

                {isEditing ? (
                  <div className="flex items-center gap-1.5 w-full pr-12">
                    <input
                      type="text"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSaveRename(c.id)}
                      className="w-full bg-input border border-theme rounded px-1.5 py-0.5 text-xs text-theme focus:outline-none focus:border-emerald-500"
                      autoFocus
                    />
                    <button
                      onClick={() => handleSaveRename(c.id)}
                      className="p-1 hover:bg-surface rounded text-secondary transition"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="p-1 hover:bg-surface rounded text-red-500 transition"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : isDeleting ? (
                  <div className="flex items-center justify-between w-full text-xs">
                    <span className="text-red-400 font-semibold">Delete chat?</span>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="px-2 py-0.5 bg-red-600 hover:bg-red-500 text-white rounded font-bold"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setDeletingId(null)}
                        className="px-2 py-0.5 bg-panel hover:bg-surface text-secondary rounded"
                      >
                        No
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        if (multiSelectMode) {
                          toggleConversationSelection(c.id);
                          return;
                        }
                        onOpenChat();
                        setActiveConversationId(c.id);
                      }}
                      className="flex items-center gap-2.5 flex-1 text-left min-w-0 pr-16"
                    >
                      <MessageSquare className={`w-4 h-4 shrink-0 ${isActive ? "text-theme" : "text-secondary"}`} />
                      <span className="truncate">{c.title}</span>
                    </button>

                    {/* Actions Menu */}
                    {!multiSelectMode && (
                      <div className="absolute right-2 opacity-0 group-hover:opacity-100 flex items-center gap-1 transition duration-150">
                        <button
                          onClick={() => handleStartRename(c.id, c.title)}
                          className="p-1 hover:bg-surface-soft rounded text-secondary hover:text-theme transition"
                          title="Rename"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => archiveConversation(c.id, !c.isArchived)}
                          className="p-1 hover:bg-surface-soft rounded text-secondary hover:text-theme transition"
                          title={c.isArchived ? "Unarchive" : "Archive"}
                        >
                          <Archive className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeletingId(c.id)}
                          className="p-1 hover:bg-surface-soft rounded text-secondary hover:text-theme transition"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* User profile & controls */}
      {user && (
        <div className="p-4 border-t border-theme bg-panel/60 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img
                src={user.avatarUrl || "https://api.dicebear.com/7.x/adventurer/svg?seed=fallback"}
                alt={user.fullName}
                className="w-9 h-9 rounded-full bg-input border border-theme object-cover"
              />
              <div className="flex flex-col min-w-0">
                <span className="font-medium text-theme text-xs truncate">{user.fullName}</span>
                <span className="text-secondary text-[10px] truncate">{user.email}</span>
                {user.bio && (
                  <span className="text-secondary text-[9px] truncate max-w-30 mt-0.5 leading-tight italic" title={user.bio}>
                    "{user.bio}"
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={onOpenSettings}
                className="p-1.5 hover:bg-surface rounded-lg text-secondary hover:text-theme transition"
                title="Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
              <button
                onClick={logout}
                className="p-1.5 hover:bg-surface rounded-lg text-secondary hover:text-red-400 transition"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
