import React from 'react';
import { Shield, Edit3 } from 'lucide-react';
import type { FieldDetection } from '../../../types';
import { TargetSizeFilterSection } from './TargetSizeFilterSection';

interface IntrusionDetectionFormProps {
  intrusion: FieldDetection;
  setIntrusion: React.Dispatch<React.SetStateAction<FieldDetection | null>>;
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

export const IntrusionDetectionForm: React.FC<IntrusionDetectionFormProps> = ({
  intrusion,
  setIntrusion,
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
  const iPts = intrusion.coordinates && intrusion.coordinates.length >= 4
    ? intrusion.coordinates
    : [
        { x: 200, y: 200 },
        { x: 800, y: 200 },
        { x: 800, y: 800 },
        { x: 200, y: 800 },
      ];

  return (
    <form onSubmit={onSave} className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white">Intrusion</h4>
            <p className="text-xs text-slate-400">Triggers an event when an object enters and remains inside the 4-point zone.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onStartDrawing}
            className="px-2.5 py-1 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-400 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Edit3 className="w-3 h-3" /> Draw Region
          </button>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={intrusion.enabled}
              onChange={(e) => setIntrusion({ ...intrusion, enabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
          </label>
        </div>
      </div>

      <div className={`grid gap-4 pt-1 ${supportsTargetDetection ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-slate-300 font-medium">Duration Threshold</span>
            <span className="text-purple-400 font-mono font-bold">{intrusion.time_threshold}s</span>
          </div>
          <input
            type="range"
            min="1"
            max="10"
            value={intrusion.time_threshold}
            onChange={(e) => setIntrusion({ ...intrusion, time_threshold: parseInt(e.target.value) || 5 })}
            className="w-full accent-purple-500 bg-slate-800 rounded-lg h-2 cursor-pointer"
          />
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-slate-300 font-medium">Detection Sensitivity</span>
            <span className="text-purple-400 font-mono font-bold">{intrusion.sensitivity}</span>
          </div>
          <input
            type="range"
            min="1"
            max="100"
            value={intrusion.sensitivity}
            onChange={(e) => setIntrusion({ ...intrusion, sensitivity: parseInt(e.target.value) || 50 })}
            className="w-full accent-purple-500 bg-slate-800 rounded-lg h-2 cursor-pointer"
          />
        </div>

        {supportsTargetDetection && (
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Target Detection</label>
            <select
              value={intrusion.detection_target || 'all'}
              onChange={(e) => setIntrusion({ ...intrusion, detection_target: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-purple-500"
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
          <span className="text-purple-400 font-bold block">Corner 1</span>
          <span className="text-slate-400">X: {iPts[0].x}, Y: {iPts[0].y}</span>
        </div>
        <div>
          <span className="text-purple-400 font-bold block">Corner 2</span>
          <span className="text-slate-400">X: {iPts[1].x}, Y: {iPts[1].y}</span>
        </div>
        <div>
          <span className="text-purple-400 font-bold block">Corner 3</span>
          <span className="text-slate-400">X: {iPts[2].x}, Y: {iPts[2].y}</span>
        </div>
        <div>
          <span className="text-purple-400 font-bold block">Corner 4</span>
          <span className="text-slate-400">X: {iPts[3].x}, Y: {iPts[3].y}</span>
        </div>
      </div>

      {/* Target Size Filter (Min / Max Size) */}
      <TargetSizeFilterSection
        minSize={intrusion.min_size}
        maxSize={intrusion.max_size}
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
          className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-lg shadow-md shadow-purple-600/20 transition-all cursor-pointer"
        >
          Update Intrusion Detection
        </button>
      </div>
    </form>
  );
};
