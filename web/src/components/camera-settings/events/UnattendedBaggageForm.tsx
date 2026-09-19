import React from 'react';
import { Briefcase, Edit3 } from 'lucide-react';
import type { UnattendedBaggageDetection, Point } from '../../../types';

interface UnattendedBaggageFormProps {
  unattended: UnattendedBaggageDetection;
  setUnattended: React.Dispatch<React.SetStateAction<UnattendedBaggageDetection | null>>;
  onStartDrawing: () => void;
  onSave: (e: React.FormEvent) => void;
}

export const UnattendedBaggageForm: React.FC<UnattendedBaggageFormProps> = ({
  unattended,
  setUnattended,
  onStartDrawing,
  onSave,
}) => {
  const uPts: Point[] = unattended.coordinates && unattended.coordinates.length >= 4
    ? unattended.coordinates
    : [
        { x: 250, y: 250 },
        { x: 750, y: 250 },
        { x: 750, y: 750 },
        { x: 250, y: 750 },
      ];

  return (
    <form onSubmit={onSave} className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20">
            <Briefcase className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white">Unattended Baggage Detection (Left Luggage)</h4>
            <p className="text-xs text-slate-400">Triggers an alarm when an object is left unattended in the zone for longer than the time threshold.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onStartDrawing}
            className="px-2.5 py-1 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 text-teal-400 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Edit3 className="w-3 h-3" /> Draw Zone
          </button>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={unattended.enabled}
              onChange={(e) => setUnattended({ ...unattended, enabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-teal-600"></div>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-slate-300 font-medium">Time Threshold</span>
            <span className="text-teal-400 font-mono font-bold">{unattended.time_threshold}s</span>
          </div>
          <input
            type="range"
            min="5"
            max="100"
            value={unattended.time_threshold}
            onChange={(e) => setUnattended({ ...unattended, time_threshold: parseInt(e.target.value) || 10 })}
            className="w-full accent-teal-500 bg-slate-800 rounded-lg h-2 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-500">
            <span>5 seconds</span>
            <span>100 seconds</span>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-slate-300 font-medium">Detection Sensitivity</span>
            <span className="text-teal-400 font-mono font-bold">{unattended.sensitivity}</span>
          </div>
          <input
            type="range"
            min="1"
            max="100"
            value={unattended.sensitivity}
            onChange={(e) => setUnattended({ ...unattended, sensitivity: parseInt(e.target.value) || 50 })}
            className="w-full accent-teal-500 bg-slate-800 rounded-lg h-2 cursor-pointer"
          />
        </div>
      </div>

      {/* 4 Region Corner Coordinates Display */}
      <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
        <div>
          <span className="text-teal-400 font-bold block">Corner 1</span>
          <span className="text-slate-400">X: {uPts[0].x}, Y: {uPts[0].y}</span>
        </div>
        <div>
          <span className="text-teal-400 font-bold block">Corner 2</span>
          <span className="text-slate-400">X: {uPts[1].x}, Y: {uPts[1].y}</span>
        </div>
        <div>
          <span className="text-teal-400 font-bold block">Corner 3</span>
          <span className="text-slate-400">X: {uPts[2].x}, Y: {uPts[2].y}</span>
        </div>
        <div>
          <span className="text-teal-400 font-bold block">Corner 4</span>
          <span className="text-slate-400">X: {uPts[3].x}, Y: {uPts[3].y}</span>
        </div>
      </div>

      <div className="flex justify-end pt-1">
        <button
          type="submit"
          className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold rounded-lg shadow-md shadow-teal-600/20 transition-all cursor-pointer"
        >
          Update Unattended Baggage
        </button>
      </div>
    </form>
  );
};
