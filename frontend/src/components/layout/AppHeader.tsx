import type { ReactNode } from "react";
import { logoUrl } from "../../lib/logo.ts";

interface AppHeaderProps {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
}

export default function AppHeader({ title = "SucharAI", subtitle = "AI Assistant", actions }: AppHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-theme bg-panel/90 px-4 py-3 shadow-sm">
      <div className="flex min-w-0 items-center gap-3">
        <img src={logoUrl} alt="SucharAI" className="h-9 w-9 shrink-0 rounded-xl border border-theme bg-input object-contain" />
        <div className="min-w-0">
          <h1 className="truncate font-display text-sm font-semibold tracking-tight text-theme">{title}</h1>
          <p className="truncate text-[11px] text-secondary">{subtitle}</p>
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
