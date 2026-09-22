import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/40",
  secondary: "border-theme bg-panel text-secondary hover:bg-surface hover:text-theme",
  ghost: "border-transparent bg-transparent text-secondary hover:bg-surface-soft hover:text-theme",
  danger: "border-red-500/25 bg-red-500/10 text-red-400 hover:bg-red-500/20",
};

export default function Button({ variant = "secondary", className = "", children, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${variantClasses[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
