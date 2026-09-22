import { Sparkles } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import Card from "../../components/ui/Card.js";
import AppFooter from "../../components/layout/AppFooter.js";
import LoginPage from "./LoginPage.js";
import RegisterPage from "./RegisterPage.js";
import { useChatStore } from "../../store.js";

export default function AuthPage() {
  const { login, register, loginWithGoogle } = useChatStore();
  const [isLoginView, setIsLoginView] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);
    try {
      await register(email, password, fullName);
      setSuccess(true);
      window.setTimeout(() => {
        setIsLoginView(true);
        setSuccess(false);
      }, 2000);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Registration failed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError("");
    try {
      await loginWithGoogle();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Google authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm bg-panel border border-theme rounded-2xl shadow-xl overflow-hidden fade-in relative z-10 text-theme">
      <Card className="border-0 rounded-none">
        <div className="px-6 pt-8 pb-4 text-center"><div className="w-10 h-10 rounded-xl bg-surface border border-theme flex items-center justify-center text-theme mx-auto mb-4"><Sparkles className="w-5 h-5" /></div><h1 className="font-display font-bold text-theme text-xl tracking-tight">SucharAI</h1><p className="text-secondary text-[10px] font-medium mt-1">Developed by Sujan Chandra Ray</p></div>
        <div className="flex border-b border-theme mx-6 mb-4 text-xs font-semibold">
          <button type="button" onClick={() => { setIsLoginView(true); setError(""); }} className={`flex-1 pb-2 border-b-2 transition ${isLoginView ? "border-emerald-500 text-emerald-400" : "border-transparent text-secondary hover:text-theme"}`}>Sign In</button>
          <button type="button" onClick={() => { setIsLoginView(false); setError(""); }} className={`flex-1 pb-2 border-b-2 transition ${!isLoginView ? "border-emerald-500 text-emerald-400" : "border-transparent text-secondary hover:text-theme"}`}>Create Account</button>
        </div>
        {isLoginView ? (
          <LoginPage email={email} password={password} loading={loading} showPassword={showPassword} error={error} onEmailChange={setEmail} onPasswordChange={setPassword} onTogglePassword={() => setShowPassword((current) => !current)} onSubmit={handleLogin} onGoogleSignIn={handleGoogleSignIn} />
        ) : (
          <RegisterPage fullName={fullName} email={email} password={password} loading={loading} showPassword={showPassword} error={error} success={success} onFullNameChange={setFullName} onEmailChange={setEmail} onPasswordChange={setPassword} onTogglePassword={() => setShowPassword((current) => !current)} onSubmit={handleRegister} onGoogleSignIn={handleGoogleSignIn} />
        )}
        <AppFooter />
      </Card>
    </div>
  );
}
