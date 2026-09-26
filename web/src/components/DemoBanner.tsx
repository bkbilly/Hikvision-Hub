import React, { useState } from 'react';
import { Sparkles, X, ExternalLink } from 'lucide-react';

export const DemoBanner: React.FC = () => {
  const [isDismissed, setIsDismissed] = useState<boolean>(false);

  if (isDismissed) return null;

  return (
    <aside
      aria-label="Demo mode notice"
      className="bg-gradient-to-r from-blue-900/90 via-indigo-900/90 to-purple-900/90 border-b border-blue-700/50 text-white text-xs px-3 sm:px-4 py-2 flex items-center justify-between shadow-md relative z-40"
    >
      <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
        <span className="flex items-center gap-1 font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/30 border border-blue-400/40 text-[10px] text-blue-200 shrink-0">
          <Sparkles className="w-3 h-3 text-amber-300 animate-pulse" />
          Interactive Demo
        </span>
        <p className="text-slate-200">
          You are exploring a simulated browser preview on GitHub Pages. Feeds, settings, and timeline events are interactive.
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0 ml-2">
        <a
          href="https://github.com/bkbilly/Hikvision-Hub"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-white font-medium transition-colors cursor-pointer text-xs"
          title="Open repository on GitHub"
        >
          <span>GitHub</span>
          <ExternalLink className="w-3 h-3" />
        </a>
        <button
          onClick={() => setIsDismissed(true)}
          className="p-1 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
          title="Dismiss demo banner"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
};
