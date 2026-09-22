import React, { useState } from "react";
import {
  X,
  User,
  Lock,
  Settings,
  Loader2,
  Sparkles,
  Server,
  FileText,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
  Palette,
  ImageIcon
} from "lucide-react";
import { useChatStore } from "../store.js";
import { auth } from "../lib/firebase.js";

export default function SettingsModal() {
  const {
    user,
    isSettingsOpen,
    setSettingsOpen,
    updateUser,
    theme,
    setTheme,
    chatBackground,
    setChatBackground
  } = useChatStore();

  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [bio, setBio] = useState("");
  const [localTheme, setLocalTheme] = useState(theme);
  const [localChatBackground, setLocalChatBackground] = useState(chatBackground);

  // Password Update Fields
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Show/Hide Password states
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Status indicators
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Sync state ONLY when the modal is opened
  const defaultChatBackground = {
    type: "solid" as const,
    color: "#0f172a",
    gradient: "linear-gradient(135deg, #020617 0%, #2563eb 100%)",
    imageUrl: ""
  };

  React.useEffect(() => {
    if (isSettingsOpen && user) {
      setFullName(user.fullName || "");
      setAvatarUrl(user.avatarUrl || "");
      setBio(user.bio || "");
      setLocalTheme(theme);
      setLocalChatBackground(chatBackground);
      // Clear password fields
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setErrorMsg("");
      setSuccessMsg("");
    }
  }, [isSettingsOpen, user, theme, chatBackground]);

  if (!isSettingsOpen || !user) return null;

  // Determine if Google authenticated
  const isGoogleUser = auth.currentUser?.providerData.some(
    (p) => p.providerId === "google.com"
  ) || false;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg("");
    setSuccessMsg("");

    // Validate if user is trying to change password
    if (newPassword) {
      if (isGoogleUser) {
        setErrorMsg("Google accounts cannot change passwords here. Please update via Google Account settings.");
        setSaving(false);
        return;
      }
      if (!currentPassword) {
        setErrorMsg("Please enter your current password to verify your identity.");
        setSaving(false);
        return;
      }
      if (newPassword.length < 6) {
        setErrorMsg("New password must be at least 6 characters long.");
        setSaving(false);
        return;
      }
      if (newPassword !== confirmPassword) {
        setErrorMsg("Passwords do not match. Please verify your new password confirmation.");
        setSaving(false);
        return;
      }
    }

    try {
      await updateUser(
        fullName,
        newPassword || undefined,
        avatarUrl || undefined,
        bio,
        newPassword ? currentPassword : undefined
      );
      setTheme(localTheme);
      setChatBackground(localChatBackground);
      setSuccessMsg("Your profile and security credentials have been updated successfully!");
      // Close settings modal and return to active page
      setSettingsOpen(false);
      // Clear passwords on success
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Failed to update profile. Please verify your credentials.");
    } finally {
      setSaving(false);
    }
  };

  const handleRandomizeAvatar = () => {
    const seed = Math.random().toString(36).substring(7);
    const newAvatar = `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(seed)}`;
    setAvatarUrl(newAvatar);
  };

  const solidPresets = ["#0f172a", "#111827", "#1f2937", "#14532d", "#1d4ed8", "#7c3aed", "#be185d", "#0f766e"];
  const gradientPresets = [
    "linear-gradient(135deg, #020617 0%, #2563eb 100%)",
    "linear-gradient(135deg, #111827 0%, #14b8a6 100%)",
    "linear-gradient(135deg, #3b0764 0%, #ec4899 100%)",
    "linear-gradient(135deg, #1f2937 0%, #8b5cf6 100%)",
    "linear-gradient(135deg, #0f172a 0%, #f59e0b 100%)"
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-panel/70 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-panel border border-theme rounded-2xl shadow-xl overflow-hidden fade-in text-theme flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-theme shrink-0">
          <div className="flex items-center gap-2 text-theme">
            <Settings className="w-4 h-4 text-emerald-400" />
            <span className="font-semibold text-xs tracking-tight">Profile & Security Settings</span>
          </div>
          <button
            onClick={() => setSettingsOpen(false)}
            className="p-1 text-secondary hover:text-theme hover:bg-surface rounded-lg transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">

          {/* Success / Error Alerts */}
          {successMsg && (
            <div className="flex items-start gap-2.5 p-3.5 bg-emerald-950/20 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="flex items-start gap-2.5 p-3.5 bg-red-950/20 border border-red-500/30 rounded-xl text-red-400 text-xs animate-fadeIn">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Section: Profile Image */}
          <div className="space-y-3">
            <h3 className="text-[10px] font-bold text-secondary uppercase tracking-widest border-b border-theme pb-1">1. Avatar Presentation</h3>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="relative group shrink-0">
                <img
                  src={avatarUrl || "https://api.dicebear.com/7.x/adventurer/svg?seed=fallback"}
                  alt="Avatar Preview"
                  className="w-20 h-20 rounded-full bg-input border-2 border-theme object-cover shadow-md transition group-hover:border-emerald-500/50"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/adventurer/svg?seed=fallback`;
                  }}
                />
                <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition cursor-pointer"
                  onClick={() => {
                    const fileInput = document.getElementById("profile-image-upload") as HTMLInputElement;
                    if (fileInput) fileInput.click();
                  }}
                >
                  <span className="text-[9px] font-bold text-white uppercase tracking-wider">Change</span>
                </div>
              </div>

              <div className="flex-1 space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    placeholder="Paste direct image URL..."
                    className="flex-1 px-3 py-1.5 bg-input border border-theme rounded-lg text-xs text-theme focus:outline-none focus:border-emerald-500 placeholder-text-secondary"
                  />
                  <button
                    type="button"
                    onClick={handleRandomizeAvatar}
                    className="px-3 py-1.5 bg-surface border border-theme hover:bg-surface-soft rounded-lg text-xs text-emerald-400 font-medium whitespace-nowrap transition flex items-center gap-1"
                    title="Generate random seed avatar"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Random</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const fileInput = document.getElementById("profile-image-upload") as HTMLInputElement;
                      if (fileInput) fileInput.click();
                    }}
                    className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-lg text-xs font-semibold transition"
                  >
                    Upload Device Photo
                  </button>
                  <span className="text-[10px] text-secondary truncate max-w-45">
                    {avatarUrl.startsWith("data:image") ? "Base64 payload loaded" : "Or link an external URL"}
                  </span>
                  <input
                    id="profile-image-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          const img = new Image();
                          img.onload = () => {
                            const canvas = document.createElement("canvas");
                            const MAX_WIDTH = 256;
                            const MAX_HEIGHT = 256;
                            let width = img.width;
                            let height = img.height;

                            if (width > height) {
                              if (width > MAX_WIDTH) {
                                height *= MAX_WIDTH / width;
                                width = MAX_WIDTH;
                              }
                            } else {
                              if (height > MAX_HEIGHT) {
                                width *= MAX_HEIGHT / height;
                                height = MAX_HEIGHT;
                              }
                            }

                            canvas.width = width;
                            canvas.height = height;
                            const ctx = canvas.getContext("2d");
                            if (ctx) {
                              ctx.drawImage(img, 0, 0, width, height);
                              const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
                              setAvatarUrl(dataUrl);
                            } else {
                              setAvatarUrl(event.target?.result as string);
                            }
                          };
                          img.src = event.target?.result as string;
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section: Basic Details */}
          <div className="space-y-3.5">
            <h3 className="text-[10px] font-bold text-secondary uppercase tracking-widest border-b border-theme pb-1">2. Basic Profiles</h3>

            {/* Full Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-secondary flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-secondary" />
                <span>Full Name</span>
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-xs text-theme focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Bio / Profile Description */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-secondary flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-secondary" />
                <span>Bio / Profile Description</span>
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Share a short bio or customize your profile description..."
                rows={3}
                className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-xs text-theme focus:outline-none focus:border-emerald-500 resize-none placeholder-text-secondary"
              />
            </div>

            {/* Email (Read Only) */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-secondary">Email Address (Read Only)</label>
              <input
                type="email"
                value={user.email}
                disabled
                className="w-full px-3 py-2 bg-input/60 border border-theme/40 rounded-lg text-xs text-secondary cursor-not-allowed"
              />
            </div>
          </div>

          {/* Section: Theme Color */}
          <div className="space-y-3.5">
            <h3 className="text-[10px] font-bold text-secondary uppercase tracking-widest border-b border-theme pb-1">4. Theme Color</h3>
            <div className="grid grid-cols-3 gap-3">
              {(["white", "gray", "black"] as const).map((option) => {
                const selected = localTheme === option;
                const label = option === "white" ? "White" : option === "gray" ? "Gray" : "Black";
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setLocalTheme(option)}
                    className={`rounded-2xl border px-3 py-3 text-xs font-semibold transition ${selected ? "border-emerald-400 bg-emerald-500/10 text-emerald-300" : "border-theme bg-panel text-secondary hover:border-emerald-400 hover:bg-surface"}`}
                  >
                    <div className="uppercase tracking-[0.2em] mb-1 text-[10px]">{label}</div>
                    <div className="h-8 rounded-xl bg-linear-to-br from-surface to-surface-soft" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section: Chat Background */}
          <div className="space-y-3.5">
            <h3 className="text-[10px] font-bold text-secondary uppercase tracking-widest border-b border-theme pb-1">5. Chat Background</h3>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setLocalChatBackground(defaultChatBackground)}
                className="rounded-full border border-theme bg-panel px-3 py-2 text-[10px] font-semibold text-secondary hover:border-emerald-400 hover:bg-surface transition"
              >
                Default
              </button>
              <button
                type="button"
                onClick={() => setLocalChatBackground({ ...defaultChatBackground, color: "transparent" })}
                className="rounded-full border border-theme bg-panel px-3 py-2 text-[10px] font-semibold text-secondary hover:border-emerald-400 hover:bg-surface transition"
              >
                Clear
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {(["solid", "gradient", "image"] as const).map((option) => {
                const selected = localChatBackground.type === option;
                const label = option === "solid" ? "Color" : option === "gradient" ? "Gradient" : "Image";
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setLocalChatBackground({ ...localChatBackground, type: option })}
                    className={`rounded-xl border px-3 py-2 text-[10px] font-semibold transition ${selected ? "border-emerald-400 bg-emerald-500/10 text-emerald-300" : "border-theme bg-panel text-secondary hover:border-emerald-400 hover:bg-surface"}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {localChatBackground.type === "solid" && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {solidPresets.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setLocalChatBackground({ ...localChatBackground, type: "solid", color: preset })}
                      className={`h-8 w-8 rounded-full border-2 transition ${localChatBackground.color === preset ? "border-emerald-400" : "border-theme"}`}
                      style={{ backgroundColor: preset }}
                      title={preset}
                    />
                  ))}
                </div>
                <label className="flex items-center gap-2 text-[10px] text-secondary">
                  <Palette className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Custom color</span>
                  <input
                    type="color"
                    value={localChatBackground.color || "#0f172a"}
                    onChange={(event) => setLocalChatBackground({ ...localChatBackground, type: "solid", color: event.target.value })}
                    className="h-8 w-12 cursor-pointer rounded border border-theme bg-transparent p-0"
                  />
                </label>
              </div>
            )}

            {localChatBackground.type === "gradient" && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  {gradientPresets.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setLocalChatBackground({ ...localChatBackground, type: "gradient", gradient: preset })}
                      className={`h-12 rounded-xl border transition ${localChatBackground.gradient === preset ? "border-emerald-400" : "border-theme"}`}
                      style={{ backgroundImage: preset }}
                    />
                  ))}
                </div>
                <input
                  type="text"
                  value={localChatBackground.gradient}
                  onChange={(event) => setLocalChatBackground({ ...localChatBackground, type: "gradient", gradient: event.target.value })}
                  placeholder="linear-gradient(135deg, #111827 0%, #2563eb 100%)"
                  className="w-full px-3 py-2 bg-input border border-theme rounded-lg text-xs text-theme focus:outline-none focus:border-emerald-500 placeholder-text-secondary"
                />
              </div>
            )}

            {localChatBackground.type === "image" && (
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-[10px] text-secondary">
                  <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Upload background image</span>
                </label>

                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;

                    const reader = new FileReader();
                    reader.onload = () => {
                      const result = typeof reader.result === "string" ? reader.result : "";
                      setLocalChatBackground({ ...localChatBackground, type: "image", imageUrl: result });
                    };
                    reader.readAsDataURL(file);
                  }}
                  className="block w-full text-[10px] text-secondary file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-500/10 file:px-3 file:py-1.5 file:text-[10px] file:font-semibold file:text-emerald-400 file:cursor-pointer"
                />

                <div
                  className="h-20 rounded-xl border border-theme bg-surface-soft/40"
                  style={{
                    backgroundImage: localChatBackground.imageUrl
                      ? `linear-gradient(135deg, rgba(2, 6, 23, 0.7), rgba(2, 6, 23, 0.35)), url(${localChatBackground.imageUrl})`
                      : "linear-gradient(135deg, rgba(2, 6, 23, 0.75), rgba(15, 23, 42, 0.4))",
                    backgroundSize: "cover",
                    backgroundPosition: "center"
                  }}
                />
              </div>
            )}
          </div>

          {/* Section: Security / Password Change */}
          <div className="space-y-3.5">
            <h3 className="text-[10px] font-bold text-secondary uppercase tracking-widest border-b border-theme pb-1">3. Security Configuration</h3>

            {isGoogleUser ? (
              <div className="flex items-start gap-2.5 p-3.5 bg-surface-soft/40 border border-theme rounded-xl text-secondary text-[11px] leading-relaxed">
                <ShieldAlert className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-theme block mb-0.5">Google Authentication Active</span>
                  You signed in via Google. Your credentials, password resets, and account security parameters are securely managed directly by Google.
                </div>
              </div>
            ) : (
              <div className="space-y-3.5">
                <p className="text-[11px] text-secondary leading-normal">
                  To update your account password, specify your new credentials below along with your current password to confirm your identity.
                </p>

                {/* Current Password */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-secondary">Current Password</label>
                  <div className="relative">
                    <input
                      type={showCurrentPassword ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password..."
                      className="w-full pl-3 pr-10 py-2 bg-input border border-theme rounded-lg text-xs text-theme focus:outline-none focus:border-emerald-500 placeholder-text-secondary"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary hover:text-theme transition"
                    >
                      {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* New Password & Confirm Password side by side */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-secondary">New Password</label>
                    <div className="relative">
                      <input
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Min. 6 characters..."
                        className="w-full pl-3 pr-10 py-2 bg-input border border-theme rounded-lg text-xs text-theme focus:outline-none focus:border-emerald-500 placeholder-text-secondary"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary hover:text-theme transition"
                      >
                        {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-secondary">Confirm New Password</label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-type new password..."
                        className="w-full pl-3 pr-10 py-2 bg-input border border-theme rounded-lg text-xs text-theme focus:outline-none focus:border-emerald-500 placeholder-text-secondary"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary hover:text-theme transition"
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* System Branding / Copyright */}
          <div className="pt-4 border-t border-theme/40 flex items-center gap-2 text-[10px] text-secondary font-mono">
            <Server className="w-3.5 h-3.5 text-secondary" />
            <span>SucharAI System | Developed by Sujan Chandra Ray</span>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-theme/60 bg-surface shrink-0">
          <button
            type="button"
            onClick={() => setSettingsOpen(false)}
            className="px-4 py-2 text-xs font-semibold hover:bg-surface text-secondary hover:text-theme rounded-lg transition"
          >
            Close
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/40 disabled:bg-panel disabled:text-secondary disabled:border-transparent text-xs font-semibold rounded-lg transition flex items-center gap-1.5 shadow-sm"
          >
            {saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <span>Save Changes</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
