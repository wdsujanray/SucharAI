import React, { useState, useEffect } from "react";
import { Mail, Lock, User, ArrowRight, Loader2, Sparkles, LogIn, ChevronRight, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { useChatStore, checkApiReachable, getWebFallbackUrl, isNativeMobileWebView } from "./store.js";
import { logoUrl } from "./lib/logo.ts";
import Sidebar from "./components/Sidebar.js";
import ChatWindow from "./components/ChatWindow.js";
import SettingsModal from "./components/SettingsModal.js";
import FileConverter from "./components/FileConverter.js";
import AppHeader from "./components/layout/AppHeader.js";
import AppFooter from "./components/layout/AppFooter.js";
import Button from "./components/ui/Button.js";
import Card from "./components/ui/Card.js";
import AuthPage from "./pages/auth/AuthPage.js";
import ProfilePage from "./pages/profile/ProfilePage.js";

export default function App() {
  const {
    token,
    user,
    authChecked,
    login,
    register,
    loginWithGoogle,
    fetchUser,
    fetchConversations,
    isSidebarOpen,
    setSidebarOpen,
    setSettingsOpen,
    theme,
  } = useChatStore();

  const themeClass = theme === "white" ? "theme-white" : theme === "gray" ? "theme-gray" : "theme-black";

  const [isLoginView, setIsLoginView] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [authError, setAuthError] = useState("");
  const [loading, setLoading] = useState(false);
  const [regSuccess, setRegSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [serverReachable, setServerReachable] = useState<boolean | null>(null);
  const [showWebIframe, setShowWebIframe] = useState(false);
  const [webFallbackUrl, setWebFallbackUrl] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<"chat" | "converter">("chat");
  const nativeMobileWebView = isNativeMobileWebView();
  const showWebFallback = nativeMobileWebView && serverReachable === false && Boolean(webFallbackUrl);

  useEffect(() => {
    setWebFallbackUrl(getWebFallbackUrl());
  }, []);

  // Auto load profile on mount if token is set
  useEffect(() => {
    if (token) {
      setLoading(true);
      fetchUser()
        .then(() => fetchConversations())
        .catch(() => { })
        .finally(() => setLoading(false));

      if (window.innerWidth < 1024) {
        setSidebarOpen(false);
      }
    }
  }, [token]);

  // On initial app mount show a small splash and try to auto-connect to API when running on mobile
  useEffect(() => {
    let mounted = true;
    const checkConnection = async () => {
      if (!mounted) return;
      const reachable = await checkApiReachable(3000);
      if (!mounted) return;
      setServerReachable(reachable);

      if (reachable && token) {
        setLoading(true);
        try {
          await fetchUser();
          await fetchConversations();
        } catch (e) {
          // ignore
        } finally {
          setLoading(false);
        }
      }
    };

    checkConnection();

    const handleOnline = () => {
      checkConnection();
    };

    const handleOffline = () => {
      if (!mounted) return;
      setServerReachable(false);
    };

    if (typeof window !== "undefined") {
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
    }

    // Ensure splash is visible at least 700ms for a smooth experience
    const splashTimer = setTimeout(() => setShowSplash(false), 700);

    return () => {
      mounted = false;
      clearTimeout(splashTimer);
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      }
    };
  }, [token]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setAuthError("");
    try {
      await login(email, password);
    } catch (err: any) {
      setAuthError(err.response?.data?.detail || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setAuthError("");
    setRegSuccess(false);
    try {
      await register(email, password, fullName);
      setRegSuccess(true);
      setTimeout(() => {
        setIsLoginView(true);
        setRegSuccess(false);
      }, 2000);
    } catch (err: any) {
      setAuthError(err.response?.data?.detail || "Registration failed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setAuthError("");
    try {
      await loginWithGoogle();
    } catch (err: any) {
      console.error(err);
      setAuthError(err.message || "Google authentication failed");
    } finally {
      setLoading(false);
    }
  };

  if (showWebIframe && webFallbackUrl) {
    return (
      <div className={`w-screen h-screen ${themeClass} bg-app flex flex-col`}>
        <AppHeader
          title="Fallback Web View"
          subtitle="The native backend is unavailable. You can use the hosted web app instead."
          actions={<Button onClick={() => setShowWebIframe(false)}>Close</Button>}
        />
        <iframe src={webFallbackUrl} title="SucharAI Web Fallback" className="flex-1 w-full border-0" />
      </div>
    );
  }

  // Global loading state while loading profile — show animated splash on mobile
  if (!authChecked || (loading && token && !user) || showSplash) {
    return (
      <div className={`w-screen h-screen ${themeClass} bg-app flex flex-col items-center justify-center text-theme font-medium`}>
        <div className="flex flex-col items-center">
          <img src={logoUrl} alt="SucharAI" className="w-40 max-w-xs mb-4 splash-logo shadow-glow" />
          <span className="text-sm font-semibold text-theme">Loading...</span>
          {serverReachable === false && (
            <span className="text-xs text-muted mt-2">Cannot reach API — check `VITE_MOBILE_API_BASE_URL` or `VITE_APP_API_BASE_URL`</span>
          )}
          {showWebFallback && (
            <button
              type="button"
              onClick={() => setShowWebIframe(true)}
              className="mt-3 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100 hover:bg-amber-500/20 transition"
            >
              Use web fallback in frame
            </button>
          )}
        </div>
      </div>
    );
  }

  // If authenticated, render full desktop workspace
  if (token && user) {
    return (
      <div className={`w-screen h-screen ${themeClass} bg-app flex overflow-hidden`}>
        {showWebFallback && (
          <div className="absolute inset-x-0 top-0 z-40 mx-4 mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-100 shadow-lg backdrop-blur sm:mx-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold">Mobile backend unavailable</p>
                <p className="text-xxs text-amber-200">Open the hosted web app in a frame while the native backend is offline.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowWebIframe(true)}
                className="rounded-lg border border-amber-200/40 bg-amber-500/15 px-3 py-2 text-[11px] text-amber-100 hover:bg-amber-500/25 transition"
              >
                Open web fallback
              </button>
            </div>
          </div>
        )}
        <Sidebar
          onOpenConverter={() => {
            setActiveView("converter");
            if (window.innerWidth < 1024) setSidebarOpen(false);
          }}
          onOpenChat={() => {
            setActiveView("chat");
            if (window.innerWidth < 1024) setSidebarOpen(false);
          }}
          onOpenSettings={() => {
            setActiveView("chat");
            setSettingsOpen(true);
            if (window.innerWidth < 1024) setSidebarOpen(false);
          }}
        />
        {activeView === "converter" ? (
          <>
            <FileConverter onBackToChat={() => setActiveView("chat")} onOpenSettings={() => setSettingsOpen(true)} />
            <ProfilePage />
          </>
        ) : (
          <>
            <ChatWindow />
            <ProfilePage />
          </>
        )}
      </div>
    );
  }

  // Otherwise, render full Authentication screen
  if (!token || !user) {
    return (
      <div className={`w-screen h-screen ${themeClass} bg-app flex items-center justify-center p-4`}>
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1c1c20_1px,transparent_1px),linear-gradient(to_bottom,#1c1c20_1px,transparent_1px)] bg-size-[4rem_4rem] opacity-20 pointer-events-none" />
        <AuthPage />
      </div>
    );
  }

  return (
    <div className={`w-screen h-screen ${themeClass} bg-app flex items-center justify-center p-4`}>
      {/* Decorative Grid Overlays */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1c1c20_1px,transparent_1px),linear-gradient(to_bottom,#1c1c20_1px,transparent_1px)] bg-size-[4rem_4rem] mask-[radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-20 pointer-events-none" />

      <Card className="w-full max-w-sm overflow-hidden shadow-xl fade-in relative z-10 text-theme">
        <div className="px-6 pt-8 pb-4 text-center">
          <div className="w-10 h-10 rounded-xl bg-surface border border-theme flex items-center justify-center text-theme mx-auto mb-4">
            <Sparkles className="w-5 h-5" />
          </div>
          <h1 className="font-display font-bold text-theme text-xl tracking-tight">SucharAI</h1>
          <p className="text-secondary text-[10px] font-medium mt-1">Developed by Sujan Chandra Ray</p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex border-b border-theme mx-6 mb-4 text-xs font-semibold">
          <button
            onClick={() => { setIsLoginView(true); setAuthError(""); }}
            className={`flex-1 pb-2 border-b-2 transition duration-200 ${isLoginView
              ? "border-emerald-500 text-emerald-400 font-medium"
              : "border-transparent text-secondary hover:text-theme"
              }`}
          >
            Sign In
          </button>
          <button
            onClick={() => { setIsLoginView(false); setAuthError(""); }}
            className={`flex-1 pb-2 border-b-2 transition duration-200 ${!isLoginView
              ? "border-emerald-500 text-emerald-400 font-medium"
              : "border-transparent text-secondary hover:text-theme"
              }`}
          >
            Create Account
          </button>
        </div>

        {isLoginView ? (
          /* LOGIN FORM */
          <form onSubmit={handleLogin} className="px-6 pb-8 space-y-4">
            {authError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400 font-semibold text-center">
                ⚠️ {authError}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-secondary">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-secondary absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-input border border-theme rounded-lg text-xs text-theme placeholder-text-secondary focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-secondary">Account Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-secondary absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-10 py-2 bg-input border border-theme rounded-lg text-xs text-theme placeholder-text-secondary focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary hover:text-theme transition duration-150"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/40 disabled:bg-input disabled:text-secondary text-xs font-semibold rounded-lg transition duration-200 flex items-center justify-center gap-2 shadow-sm mt-2"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Sign In</span>
                </>
              )}
            </button>

            <div className="relative flex py-2 items-center">
              <div className="grow border-t border-theme"></div>
              <span className="shrink mx-4 text-secondary text-[10px] font-bold uppercase tracking-wider">or</span>
              <div className="grow border-t border-theme"></div>
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full py-2 bg-panel border border-theme hover:bg-surface text-secondary hover:text-theme text-xs font-semibold rounded-lg transition duration-200 flex items-center justify-center gap-2 shadow-sm"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#EA4335"
                  d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.6 4.418 1.582L19.3 3.61C17.34 1.841 14.8 1 12 1 7.427 1 3.514 3.636 1.636 7.436L5.266 9.765z"
                />
                <path
                  fill="#34A853"
                  d="M16.04 15.34C15.004 16.036 13.627 16.5 12 16.5c-2.736 0-5.064-1.855-5.89-4.355L2.436 14.364C4.314 18.164 8.227 21 12 21c2.89 0 5.564-.99 7.555-2.827l-3.514-2.833z"
                />
                <path
                  fill="#4285F4"
                  d="M23 12c0-.773-.082-1.5-.227-2.182H12v4.182h6.182A5.31 5.31 0 0 1 12 17.5v4.182h3.514C19.864 19.855 23 16.364 23 12z"
                />
                <path
                  fill="#FBBC05"
                  d="M6.11 12.145a6.973 6.973 0 0 1 0-2.29L2.436 7.436A11.036 11.036 0 0 0 1 12c0 1.64.364 3.2 1.018 4.609l3.673-2.72a6.974 6.974 0 0 1 1.418-1.745z"
                />
              </svg>
              <span>Continue with Google</span>
            </button>
          </form>
        ) : (
          /* REGISTRATION FORM */
          <form onSubmit={handleRegister} className="px-6 pb-8 space-y-4">
            {authError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400 font-semibold text-center">
                ⚠️ {authError}
              </div>
            )}
            {regSuccess && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-400 font-semibold text-center flex items-center justify-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Account created! Redirecting...</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-secondary">Full Name</label>
              <div className="relative">
                <User className="w-4 h-4 text-secondary absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  placeholder="Alice Smith"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-input border border-theme rounded-lg text-xs text-theme placeholder-text-secondary focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-secondary">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-secondary absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  placeholder="alice@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-input border border-theme rounded-lg text-xs text-theme placeholder-text-secondary focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-secondary">Account Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-secondary absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="Choose secure password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-10 py-2 bg-input border border-theme rounded-lg text-xs text-theme placeholder-text-secondary focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary hover:text-theme transition duration-150"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/40 disabled:bg-input disabled:text-secondary text-xs font-semibold rounded-lg transition duration-200 flex items-center justify-center gap-2 shadow-sm mt-2"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
              ) : (
                <>
                  <span>Create Account</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <div className="relative flex py-2 items-center">
              <div className="grow border-t border-theme"></div>
              <span className="shrink mx-4 text-secondary text-[10px] font-bold uppercase tracking-wider">or</span>
              <div className="grow border-t border-theme"></div>
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full py-2 bg-panel border border-theme hover:bg-surface text-secondary hover:text-theme text-xs font-semibold rounded-lg transition duration-200 flex items-center justify-center gap-2 shadow-sm"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#EA4335"
                  d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.6 4.418 1.582L19.3 3.61C17.34 1.841 14.8 1 12 1 7.427 1 3.514 3.636 1.636 7.436L5.266 9.765z"
                />
                <path
                  fill="#34A853"
                  d="M16.04 15.34C15.004 16.036 13.627 16.5 12 16.5c-2.736 0-5.064-1.855-5.89-4.355L2.436 14.364C4.314 18.164 8.227 21 12 21c2.89 0 5.564-.99 7.555-2.827l-3.514-2.833z"
                />
                <path
                  fill="#4285F4"
                  d="M23 12c0-.773-.082-1.5-.227-2.182H12v4.182h6.182A5.31 5.31 0 0 1 12 17.5v4.182h3.514C19.864 19.855 23 16.364 23 12z"
                />
                <path
                  fill="#FBBC05"
                  d="M6.11 12.145a6.973 6.973 0 0 1 0-2.29L2.436 7.436A11.036 11.036 0 0 0 1 12c0 1.64.364 3.2 1.018 4.609l3.673-2.72a6.974 6.974 0 0 1 1.418-1.745z"
                />
              </svg>
              <span>Continue with Google</span>
            </button>
          </form>
        )}
        <AppFooter />
      </Card>
    </div>
  );
}
