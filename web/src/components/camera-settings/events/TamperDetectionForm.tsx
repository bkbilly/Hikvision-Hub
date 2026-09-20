import React from 'react';
import { Eye, Edit3, Info } from 'lucide-react';
import type { TamperDetection } from '../../../types';

interface TamperDetectionFormProps {
  tamper: TamperDetection;
  setTamper: React.Dispatch<React.SetStateAction<TamperDetection | null>>;
  onStartDrawing: () => void;
  onSave: (e: React.FormEvent) => void;
}

export const TamperDetectionForm: React.FC<TamperDetectionFormProps> = ({
  tamper,
  setTamper,
  onStartDrawing,
  onSave,
}) => {
  const tPts = tamper.coordinates && tamper.coordinates.length >= 4
    ? tamper.coordinates
    : [
        { x: 100, y: 100 },
        { x: 900, y: 100 },
        { x: 900, y: 900 },
        { x: 100, y: 900 },
      ];

  return (
    <form onSubmit={onSave} className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <Eye className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white">Tampering</h4>
            <p className="text-xs text-slate-400">Triggers an alarm when the camera lens is covered, spray-painted, blinded, or blocked.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onStartDrawing}
            className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Edit3 className="w-3 h-3" /> Draw Tamper Rectangle (90° Zone)
          </button>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={tamper.enabled}
              onChange={(e) => setTamper({ ...tamper, enabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-600"></div>
          </label>
        </div>
      </div>

      <div className="space-y-1 pt-1">
        <div className="flex justify-between text-xs">
          <span className="text-slate-300 font-medium">Tamper Sensitivity</span>
          <span className="text-rose-400 font-mono font-bold">{tamper.sensitivity}</span>
        </div>
        <input
          type="range"
          min="1"
          max="100"
          value={tamper.sensitivity}
          onChange={(e) => setTamper({ ...tamper, sensitivity: parseInt(e.target.value) || 50 })}
          className="w-full accent-rose-500 bg-slate-800 rounded-lg h-2 cursor-pointer"
        />
        <div className="flex justify-between text-[10px] text-slate-500">
          <span>Low (Requires heavy occlusion)</span>
          <span>High (Triggers on partial occlusion)</span>
        </div>
      </div>

      {/* 4 Region Corner Coordinates Display */}
      <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
        <div>
          <span className="text-rose-400 font-bold block">Corner 1 (TL)</span>
          <span className="text-slate-400">X: {tPts[0].x}, Y: {tPts[0].y}</span>
        </div>
        <div>
          <span className="text-rose-400 font-bold block">Corner 2 (TR)</span>
          <span className="text-slate-400">X: {tPts[1].x}, Y: {tPts[1].y}</span>
        </div>
        <div>
          <span className="text-rose-400 font-bold block">Corner 3 (BR)</span>
          <span className="text-slate-400">X: {tPts[2].x}, Y: {tPts[2].y}</span>
        </div>
        <div>
          <span className="text-rose-400 font-bold block">Corner 4 (BL)</span>
          <span className="text-slate-400">X: {tPts[3].x}, Y: {tPts[3].y}</span>
        </div>
      </div>

      <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-400 flex items-start gap-2">
        <Info className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-slate-300">90° Rectangle Requirement:</p>
          <p>
            Hikvision video tampering algorithms evaluate brightness contrast and blur within an axis-aligned 90° rectangular window. Freeform non-rectangular polygons are not supported by the camera firmware. Drag any of the 4 corners or use 2-click drawing to adjust the detection box.
          </p>
        </div>
      </div>

      <div className="flex justify-end pt-1">
        <button
          type="submit"
          className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg shadow-md shadow-rose-600/20 transition-all cursor-pointer"
        >
          Update Tamper Detection
        </button>
      </div>
    </form>
  );
};
