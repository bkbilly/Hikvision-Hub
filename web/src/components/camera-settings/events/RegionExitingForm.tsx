import React from 'react';
import { LogOut, Edit3 } from 'lucide-react';
import type { RegionExiting, Point } from '../../../types';
import { TargetSizeFilterSection } from './TargetSizeFilterSection';

interface RegionExitingFormProps {
  regionExiting: RegionExiting;
  setRegionExiting: React.Dispatch<React.SetStateAction<RegionExiting | null>>;
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

export const RegionExitingForm: React.FC<RegionExitingFormProps> = ({
  regionExiting,
  setRegionExiting,
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
  const xPts: Point[] = regionExiting.coordinates && regionExiting.coordinates.length >= 4
    ? regionExiting.coordinates
    : [
        { x: 220, y: 220 },
        { x: 780, y: 220 },
        { x: 780, y: 780 },
        { x: 220, y: 780 },
      ];

  return (
    <form onSubmit={onSave} className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-pink-500/10 text-pink-400 border border-pink-500/20">
            <LogOut className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white">Region Exiting Detection</h4>
            <p className="text-xs text-slate-400">Triggers an alarm when a target leaves or exits the defined virtual region.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onStartDrawing}
            className="px-2.5 py-1 bg-pink-500/10 hover:bg-pink-500/20 border border-pink-500/30 text-pink-400 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Edit3 className="w-3 h-3" /> Draw Region
          </button>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={regionExiting.enabled}
              onChange={(e) => setRegionExiting({ ...regionExiting, enabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-pink-600"></div>
          </label>
        </div>
      </div>

      <div className={`grid gap-4 pt-1 ${supportsTargetDetection ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-slate-300 font-medium">Detection Sensitivity</span>
            <span className="text-pink-400 font-mono font-bold">{regionExiting.sensitivity}</span>
          </div>
          <input
            type="range"
            min="1"
            max="100"
            value={regionExiting.sensitivity}
            onChange={(e) => setRegionExiting({ ...regionExiting, sensitivity: parseInt(e.target.value) || 50 })}
            className="w-full accent-pink-500 bg-slate-800 rounded-lg h-2 cursor-pointer"
          />
        </div>

        {supportsTargetDetection && (
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Target Detection</label>
            <select
              value={regionExiting.detection_target || 'all'}
              onChange={(e) => setRegionExiting({ ...regionExiting, detection_target: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-pink-500"
            >
              <option value="all">All Targets (Human & Vehicle)</option>
              <option value="human">Human Only</option>
              <option value="vehicle">Vehicle Only</option>
            </select>
          </div>
        )}
      </div>

      {/* 4 Region Corner Coordinates Display */}
      <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
        <div>
          <span className="text-pink-400 font-bold block">Corner 1</span>
          <span className="text-slate-400">X: {xPts[0].x}, Y: {xPts[0].y}</span>
        </div>
        <div>
          <span className="text-pink-400 font-bold block">Corner 2</span>
          <span className="text-slate-400">X: {xPts[1].x}, Y: {xPts[1].y}</span>
        </div>
        <div>
          <span className="text-pink-400 font-bold block">Corner 3</span>
          <span className="text-slate-400">X: {xPts[2].x}, Y: {xPts[2].y}</span>
        </div>
        <div>
          <span className="text-pink-400 font-bold block">Corner 4</span>
          <span className="text-slate-400">X: {xPts[3].x}, Y: {xPts[3].y}</span>
        </div>
      </div>

      {/* Target Size Filter (Min / Max Size) */}
      <TargetSizeFilterSection
        minSize={regionExiting.min_size}
        maxSize={regionExiting.max_size}
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
          className="px-4 py-2 bg-pink-600 hover:bg-pink-500 text-white text-xs font-semibold rounded-lg shadow-md shadow-pink-600/20 transition-all cursor-pointer"
        >
          Update Region Exiting
        </button>
      </div>
    </form>
  );
};
