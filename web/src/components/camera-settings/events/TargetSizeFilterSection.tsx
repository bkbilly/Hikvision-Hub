import React from 'react';
import { Maximize2, Minimize2, Trash2, Scan } from 'lucide-react';
import type { Point } from '../../../types';

interface TargetSizeFilterSectionProps {
  minSize?: Point[];
  maxSize?: Point[];
  onStartDrawMinSize: () => void;
  onStartDrawMaxSize: () => void;
  onClearMinSize: () => void;
  onClearMaxSize: () => void;
  onClearAllSizes?: () => void;
  drawingMode?: 'min' | 'max' | null;
}

export const TargetSizeFilterSection: React.FC<TargetSizeFilterSectionProps> = ({
  minSize,
  maxSize,
  onStartDrawMinSize,
  onStartDrawMaxSize,
  onClearMinSize,
  onClearMaxSize,
  onClearAllSizes,
  drawingMode = null,
}) => {
  const getBoxDimensions = (pts?: Point[]) => {
    if (!pts || pts.length < 4) return null;
    const minX = Math.min(...pts.map((p) => p.x));
    const maxX = Math.max(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    const maxY = Math.max(...pts.map((p) => p.y));
    const w = maxX - minX;
    const h = maxY - minY;
    if (w < 10 || h < 10) return null;
    return { w, h };
  };

  const minDim = getBoxDimensions(minSize);
  const maxDim = getBoxDimensions(maxSize);
  const hasAnyFilter = Boolean(minDim || maxDim);

  return (
    <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700/50">
            <Scan className="w-3.5 h-3.5" />
          </div>
          <div>
            <h5 className="text-xs font-semibold text-white">Target Size Filter</h5>
            <p className="text-[11px] text-slate-400">
              Set 90° bounding boxes for minimum and maximum object size to eliminate false alarms.
            </p>
          </div>
        </div>
        {hasAnyFilter && onClearAllSizes && (
          <button
            type="button"
            onClick={onClearAllSizes}
            className="px-2 py-1 bg-slate-800/80 hover:bg-slate-700/80 text-slate-400 hover:text-slate-200 text-[11px] rounded-lg border border-slate-700/50 flex items-center gap-1 transition-colors cursor-pointer"
            title="Reset both Min and Max target size filters"
          >
            <Trash2 className="w-3 h-3" />
            <span>Reset All</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {/* Min Size Card */}
        <div className={`p-2.5 rounded-lg border transition-all ${
          drawingMode === 'min'
            ? 'bg-emerald-950/30 border-emerald-500/60 ring-1 ring-emerald-500/40'
            : minDim
            ? 'bg-slate-900/90 border-emerald-500/30'
            : 'bg-slate-900/50 border-slate-800'
        }`}>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-xs font-medium text-emerald-400 flex items-center gap-1">
                <Minimize2 className="w-3 h-3" /> Min. Size
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onStartDrawMinSize}
                className={`px-2 py-0.5 rounded text-[11px] font-medium border flex items-center gap-1 transition-all cursor-pointer ${
                  drawingMode === 'min'
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-sm font-semibold'
                    : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                }`}
              >
                {drawingMode === 'min' ? 'Drawing...' : minDim ? 'Redraw' : 'Set Min'}
              </button>
              {minDim && (
                <button
                  type="button"
                  onClick={onClearMinSize}
                  className="p-1 hover:bg-slate-800 text-slate-400 hover:text-rose-400 rounded transition-colors cursor-pointer"
                  title="Clear Min Size"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
          <div className="text-[11px] font-mono text-slate-400">
            {minDim ? (
              <span className="text-emerald-300/90">
                Box: {minDim.w} &times; {minDim.h} px (norm)
              </span>
            ) : (
              <span className="text-slate-500 italic">No minimum limit (any small target)</span>
            )}
          </div>
        </div>

        {/* Max Size Card */}
        <div className={`p-2.5 rounded-lg border transition-all ${
          drawingMode === 'max'
            ? 'bg-sky-950/30 border-sky-500/60 ring-1 ring-sky-500/40'
            : maxDim
            ? 'bg-slate-900/90 border-sky-500/30'
            : 'bg-slate-900/50 border-slate-800'
        }`}>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-sky-500 shrink-0" />
              <span className="text-xs font-medium text-sky-400 flex items-center gap-1">
                <Maximize2 className="w-3 h-3" /> Max. Size
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onStartDrawMaxSize}
                className={`px-2 py-0.5 rounded text-[11px] font-medium border flex items-center gap-1 transition-all cursor-pointer ${
                  drawingMode === 'max'
                    ? 'bg-sky-500 text-slate-950 border-sky-400 shadow-sm font-semibold'
                    : 'bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border-sky-500/30'
                }`}
              >
                {drawingMode === 'max' ? 'Drawing...' : maxDim ? 'Redraw' : 'Set Max'}
              </button>
              {maxDim && (
                <button
                  type="button"
                  onClick={onClearMaxSize}
                  className="p-1 hover:bg-slate-800 text-slate-400 hover:text-rose-400 rounded transition-colors cursor-pointer"
                  title="Clear Max Size"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
          <div className="text-[11px] font-mono text-slate-400">
            {maxDim ? (
              <span className="text-sky-300/90">
                Box: {maxDim.w} &times; {maxDim.h} px (norm)
              </span>
            ) : (
              <span className="text-slate-500 italic">No maximum limit (full frame)</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
