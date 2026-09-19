import React from 'react';
import { LogIn, Edit3 } from 'lucide-react';
import type { RegionEntrance, Point } from '../../../types';

interface RegionEntranceFormProps {
  regionEntrance: RegionEntrance;
  setRegionEntrance: React.Dispatch<React.SetStateAction<RegionEntrance | null>>;
  supportsTargetDetection: boolean;
  onStartDrawing: () => void;
  onSave: (e: React.FormEvent) => void;
}

export const RegionEntranceForm: React.FC<RegionEntranceFormProps> = ({
  regionEntrance,
  setRegionEntrance,
  supportsTargetDetection,
  onStartDrawing,
  onSave,
}) => {
  const ePts: Point[] = regionEntrance.coordinates && regionEntrance.coordinates.length >= 4
    ? regionEntrance.coordinates
    : [
        { x: 180, y: 180 },
        { x: 820, y: 180 },
        { x: 820, y: 820 },
        { x: 180, y: 820 },
      ];

  return (
    <form onSubmit={onSave} className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <LogIn className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white">Region Entrance Detection</h4>
            <p className="text-xs text-slate-400">Triggers an alarm when a target enters the defined virtual region.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onStartDrawing}
            className="px-2.5 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Edit3 className="w-3 h-3" /> Draw Region
          </button>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={regionEntrance.enabled}
              onChange={(e) => setRegionEntrance({ ...regionEntrance, enabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
          </label>
        </div>
      </div>

      <div className={`grid gap-4 pt-1 ${supportsTargetDetection ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-slate-300 font-medium">Detection Sensitivity</span>
            <span className="text-indigo-400 font-mono font-bold">{regionEntrance.sensitivity}</span>
          </div>
          <input
            type="range"
            min="1"
            max="100"
            value={regionEntrance.sensitivity}
            onChange={(e) => setRegionEntrance({ ...regionEntrance, sensitivity: parseInt(e.target.value) || 50 })}
            className="w-full accent-indigo-500 bg-slate-800 rounded-lg h-2 cursor-pointer"
          />
        </div>

        {supportsTargetDetection && (
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Target Detection</label>
            <select
              value={regionEntrance.detection_target || 'all'}
              onChange={(e) => setRegionEntrance({ ...regionEntrance, detection_target: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-500"
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
          <span className="text-indigo-400 font-bold block">Corner 1</span>
          <span className="text-slate-400">X: {ePts[0].x}, Y: {ePts[0].y}</span>
        </div>
        <div>
          <span className="text-indigo-400 font-bold block">Corner 2</span>
          <span className="text-slate-400">X: {ePts[1].x}, Y: {ePts[1].y}</span>
        </div>
        <div>
          <span className="text-indigo-400 font-bold block">Corner 3</span>
          <span className="text-slate-400">X: {ePts[2].x}, Y: {ePts[2].y}</span>
        </div>
        <div>
          <span className="text-indigo-400 font-bold block">Corner 4</span>
          <span className="text-slate-400">X: {ePts[3].x}, Y: {ePts[3].y}</span>
        </div>
      </div>

      <div className="flex justify-end pt-1">
        <button
          type="submit"
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
        >
          Update Region Entrance
        </button>
      </div>
    </form>
  );
};
