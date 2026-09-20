import React from 'react';
import { Package, Edit3 } from 'lucide-react';
import type { ObjectRemovalDetection, Point } from '../../../types';
import { TargetSizeFilterSection } from './TargetSizeFilterSection';

interface ObjectRemovalFormProps {
  objectRemoval: ObjectRemovalDetection;
  setObjectRemoval: React.Dispatch<React.SetStateAction<ObjectRemovalDetection | null>>;
  onStartDrawing: () => void;
  onSave: (e: React.FormEvent) => void;
  onStartDrawMinSize: () => void;
  onStartDrawMaxSize: () => void;
  onClearMinSize: () => void;
  onClearMaxSize: () => void;
  onClearAllSizes: () => void;
  drawingMode?: 'min' | 'max' | null;
}

export const ObjectRemovalForm: React.FC<ObjectRemovalFormProps> = ({
  objectRemoval,
  setObjectRemoval,
  onStartDrawing,
  onSave,
  onStartDrawMinSize,
  onStartDrawMaxSize,
  onClearMinSize,
  onClearMaxSize,
  onClearAllSizes,
  drawingMode,
}) => {
  const rPts: Point[] = objectRemoval.coordinates && objectRemoval.coordinates.length >= 4
    ? objectRemoval.coordinates
    : [
        { x: 300, y: 300 },
        { x: 700, y: 300 },
        { x: 700, y: 700 },
        { x: 300, y: 700 },
      ];

  return (
    <form onSubmit={onSave} className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20">
            <Package className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white">Object Removal</h4>
            <p className="text-xs text-slate-400">Triggers an alarm when a monitored object is removed or taken from the designated region.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onStartDrawing}
            className="px-2.5 py-1 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 text-orange-400 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Edit3 className="w-3 h-3" /> Draw Zone
          </button>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={objectRemoval.enabled}
              onChange={(e) => setObjectRemoval({ ...objectRemoval, enabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-600"></div>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-slate-300 font-medium">Time Threshold</span>
            <span className="text-orange-400 font-mono font-bold">{objectRemoval.time_threshold}s</span>
          </div>
          <input
            type="range"
            min="5"
            max="100"
            value={objectRemoval.time_threshold}
            onChange={(e) => setObjectRemoval({ ...objectRemoval, time_threshold: parseInt(e.target.value) || 10 })}
            className="w-full accent-orange-500 bg-slate-800 rounded-lg h-2 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-500">
            <span>5 seconds</span>
            <span>100 seconds</span>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-slate-300 font-medium">Detection Sensitivity</span>
            <span className="text-orange-400 font-mono font-bold">{objectRemoval.sensitivity}</span>
          </div>
          <input
            type="range"
            min="1"
            max="100"
            value={objectRemoval.sensitivity}
            onChange={(e) => setObjectRemoval({ ...objectRemoval, sensitivity: parseInt(e.target.value) || 50 })}
            className="w-full accent-orange-500 bg-slate-800 rounded-lg h-2 cursor-pointer"
          />
        </div>
      </div>

      {/* 4 Region Corner Coordinates Display */}
      <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
        <div>
          <span className="text-orange-400 font-bold block">Corner 1</span>
          <span className="text-slate-400">X: {rPts[0].x}, Y: {rPts[0].y}</span>
        </div>
        <div>
          <span className="text-orange-400 font-bold block">Corner 2</span>
          <span className="text-slate-400">X: {rPts[1].x}, Y: {rPts[1].y}</span>
        </div>
        <div>
          <span className="text-orange-400 font-bold block">Corner 3</span>
          <span className="text-slate-400">X: {rPts[2].x}, Y: {rPts[2].y}</span>
        </div>
        <div>
          <span className="text-orange-400 font-bold block">Corner 4</span>
          <span className="text-slate-400">X: {rPts[3].x}, Y: {rPts[3].y}</span>
        </div>
      </div>

      {/* Target Size Filter (Min / Max Size) */}
      <TargetSizeFilterSection
        minSize={objectRemoval.min_size}
        maxSize={objectRemoval.max_size}
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
          className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold rounded-lg shadow-md shadow-orange-600/20 transition-all cursor-pointer"
        >
          Update Object Removal
        </button>
      </div>
    </form>
  );
};
