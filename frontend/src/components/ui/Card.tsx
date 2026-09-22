import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  tone?: "panel" | "surface";
}

export default function Card({ tone = "panel", className = "", children, ...props }: CardProps) {
  const background = tone === "surface" ? "bg-surface" : "bg-panel";

  return (
    <div {...props} className={`rounded-2xl border border-theme ${background} ${className}`}>
      {children}
    </div>
  );
}
