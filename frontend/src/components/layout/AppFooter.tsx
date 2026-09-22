interface AppFooterProps {
  className?: string;
}

export default function AppFooter({ className = "" }: AppFooterProps) {
  return (
    <footer className={`border-t border-theme px-6 py-3 text-center text-[10px] text-secondary ${className}`}>
      SucharAI · Developed by Sujan Chandra Ray
    </footer>
  );
}
