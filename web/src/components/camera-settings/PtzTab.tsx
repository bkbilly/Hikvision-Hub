import React from 'react';
import type { PTZPreset } from '../../types';

interface PtzTabProps {
  ptzPresets: PTZPreset[];
  onPTZMove: (pan: number, tilt: number, zoom: number) => void;
  onPTZGoto: (presetId: number) => void;
}

export const PtzTab: React.FC<PtzTabProps> = ({
  ptzPresets,
  onPTZMove,
  onPTZGoto,
}) => {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-white mb-1">PTZ</h3>
        <p className="text-xs text-slate-400">Control camera positioning and recall stored presets in real-time.</p>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-8 py-4">
        {/* Directional Pad */}
        <div className="relative w-40 h-40 bg-slate-900 rounded-full border border-slate-800 flex items-center justify-center shadow-inner">
          {/* Up */}
          <button
            type="button"
            onClick={() => onPTZMove(0, 30, 0)}
            className="absolute top-2 left-1/2 -translate-x-1/2 p-2.5 rounded-full bg-slate-800 hover:bg-blue-600 text-white transition-colors cursor-pointer"
          >
            ▲
          </button>
          {/* Down */}
          <button
            type="button"
            onClick={() => onPTZMove(0, -30, 0)}
            className="absolute bottom-2 left-1/2 -translate-x-1/2 p-2.5 rounded-full bg-slate-800 hover:bg-blue-600 text-white transition-colors cursor-pointer"
          >
            ▼
          </button>
          {/* Left */}
          <button
            type="button"
            onClick={() => onPTZMove(-30, 0, 0)}
            className="absolute left-2 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-slate-800 hover:bg-blue-600 text-white transition-colors cursor-pointer"
          >
            ◀
          </button>
          {/* Right */}
          <button
            type="button"
            onClick={() => onPTZMove(30, 0, 0)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-slate-800 hover:bg-blue-600 text-white transition-colors cursor-pointer"
          >
            ▶
          </button>
          {/* Center Stop */}
          <button
            type="button"
            onClick={() => onPTZMove(0, 0, 0)}
            className="w-10 h-10 rounded-full bg-slate-800/80 hover:bg-rose-600 text-white text-xs font-bold transition-colors cursor-pointer"
          >
            ■
          </button>
        </div>

        {/* Zoom Controls & Presets */}
        <div className="space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onPTZMove(0, 0, 30)}
              className="px-4 py-2 bg-slate-800 hover:bg-blue-600 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
            >
              🔍 Zoom In (+)
            </button>
            <button
              type="button"
              onClick={() => onPTZMove(0, 0, -30)}
              className="px-4 py-2 bg-slate-800 hover:bg-blue-600 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
            >
              🔍 Zoom Out (-)
            </button>
          </div>

          {ptzPresets.length > 0 && (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-400">Preset Positions</label>
              <div className="flex flex-wrap gap-1.5">
                {ptzPresets.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onPTZGoto(p.id)}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg transition-colors cursor-pointer"
                  >
                    {p.name || `Preset ${p.id}`}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
