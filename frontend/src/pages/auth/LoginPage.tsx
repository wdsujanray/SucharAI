import { Eye, EyeOff, Loader2, Lock, LogIn, Mail } from "lucide-react";
import type { FormEvent } from "react";
import Button from "../../components/ui/Button.js";

interface LoginPageProps {
  email: string;
  password: string;
  loading: boolean;
  showPassword: boolean;
  error: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onTogglePassword: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onGoogleSignIn: () => void;
}

export default function LoginPage({ email, password, loading, showPassword, error, onEmailChange, onPasswordChange, onTogglePassword, onSubmit, onGoogleSignIn }: LoginPageProps) {
  return (
    <form onSubmit={onSubmit} className="px-6 pb-8 space-y-4">
      {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400 font-semibold text-center">{error}</div>}
      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-secondary">Email Address</span>
        <div className="relative">
          <Mail className="w-4 h-4 text-secondary absolute left-3 top-1/2 -translate-y-1/2" />
          <input type="email" required placeholder="name@company.com" value={email} onChange={(event) => onEmailChange(event.target.value)} className="w-full pl-9 pr-4 py-2 bg-input border border-theme rounded-lg text-xs text-theme" />
        </div>
      </label>
      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-secondary">Account Password</span>
        <div className="relative">
          <Lock className="w-4 h-4 text-secondary absolute left-3 top-1/2 -translate-y-1/2" />
          <input type={showPassword ? "text" : "password"} required placeholder="Enter your password" value={password} onChange={(event) => onPasswordChange(event.target.value)} className="w-full pl-9 pr-10 py-2 bg-input border border-theme rounded-lg text-xs text-theme" />
          <button type="button" onClick={onTogglePassword} className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary hover:text-theme" aria-label={showPassword ? "Hide password" : "Show password"}>
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </label>
      <Button type="submit" variant="primary" disabled={loading} className="w-full mt-2">
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
        <span>Sign In</span>
      </Button>
      <div className="relative flex py-2 items-center"><div className="grow border-t border-theme" /><span className="shrink mx-4 text-secondary text-[10px] font-bold uppercase">or</span><div className="grow border-t border-theme" /></div>
      <Button type="button" variant="secondary" onClick={onGoogleSignIn} disabled={loading} className="w-full">Continue with Google</Button>
    </form>
  );
}
