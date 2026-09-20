import React from 'react';
import { Layers, Edit3 } from 'lucide-react';
import type { LineDetection } from '../../../types';
import { TargetSizeFilterSection } from './TargetSizeFilterSection';

interface LineCrossingFormProps {
  lineDetection: LineDetection;
  setLineDetection: React.Dispatch<React.SetStateAction<LineDetection | null>>;
  supportsTargetDetection: boolean;
  onStartDrawing: () => void;
  onSave: (e: React.FormEvent) => void;
  onStartDrawMinSize: () => void;
  onStartDrawMaxSize: () => void;
  onClearMinSize: () => void;
  onClearMaxSize: () => void;
  onClearAllSizes: () => void;
  drawingMode?: 'min' | 'max' | null;
}

export const LineCrossingForm: React.FC<LineCrossingFormProps> = ({
  lineDetection,
  setLineDetection,
  supportsTargetDetection,
  onStartDrawing,
  onSave,
  onStartDrawMinSize,
  onStartDrawMaxSize,
  onClearMinSize,
  onClearMaxSize,
  onClearAllSizes,
  drawingMode,
}) => {
  const pt1 = lineDetection.coordinates?.[0] || { x: 150, y: 500 };
  const pt2 = lineDetection.coordinates?.[1] || { x: 850, y: 500 };

  return (
    <form onSubmit={onSave} className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white">Line Crossing</h4>
            <p className="text-xs text-slate-400">Triggers an event when an object crosses the defined threshold line.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onStartDrawing}
            className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Edit3 className="w-3 h-3" /> Draw Line
          </button>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={lineDetection.enabled}
              onChange={(e) => setLineDetection({ ...lineDetection, enabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-600"></div>
          </label>
        </div>
      </div>

      <div className={`grid gap-4 pt-1 ${supportsTargetDetection ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">Crossing Direction</label>
          <select
            value={lineDetection.direction || 'both'}
            onChange={(e) => setLineDetection({ ...lineDetection, direction: e.target.value })}
            className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-amber-500"
          >
            <option value="both">Both Directions (Bidirectional)</option>
            <option value="leftToRight">Left to Right (1 -&gt; 2)</option>
            <option value="rightToLeft">Right to Left (2 -&gt; 1)</option>
          </select>
        </div>

        {supportsTargetDetection && (
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Target Detection</label>
            <select
              value={lineDetection.detection_target || 'all'}
              onChange={(e) => setLineDetection({ ...lineDetection, detection_target: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-amber-500"
            >
              <option value="all">All Targets (Human & Vehicle)</option>
              <option value="human">Human Only</option>
              <option value="vehicle">Vehicle Only</option>
            </select>
          </div>
        )}

        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-slate-300 font-medium">Detection Sensitivity</span>
            <span className="text-amber-400 font-mono font-bold">{lineDetection.sensitivity}</span>
          </div>
          <input
            type="range"
            min="1"
            max="100"
            value={lineDetection.sensitivity}
            onChange={(e) => setLineDetection({ ...lineDetection, sensitivity: parseInt(e.target.value) || 50 })}
            className="w-full accent-amber-500 bg-slate-800 rounded-lg h-2 cursor-pointer"
          />
        </div>
      </div>

      {/* Numerical Coordinates Display */}
      <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 grid grid-cols-2 gap-4 text-xs font-mono">
        <div>
          <span className="text-amber-400 font-bold block">Endpoint 1 (Start)</span>
          <span className="text-slate-400">X: {pt1.x}, Y: {pt1.y}</span>
        </div>
        <div>
          <span className="text-cyan-400 font-bold block">Endpoint 2 (End)</span>
          <span className="text-slate-400">X: {pt2.x}, Y: {pt2.y}</span>
        </div>
      </div>

      {/* Target Size Filter (Min / Max Size) */}
      <TargetSizeFilterSection
        minSize={lineDetection.min_size}
        maxSize={lineDetection.max_size}
        onStartDrawMinSize={onStartDrawMinSize}
        onStartDrawMaxSize={onStartDrawMaxSize}
        onClearMinSize={onClearMinSize}
        onClearMaxSize={onClearMaxSize}
        onClearAllSizes={onClearAllSizes}
        drawingMode={drawingMode}
      />

      <div className="flex justify-end pt-1">
        <button
          type="submit"
          className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold rounded-lg shadow-md shadow-amber-600/20 transition-all cursor-pointer"
        >
          Update Line Crossing
        </button>
      </div>
    </form>
  );
};
