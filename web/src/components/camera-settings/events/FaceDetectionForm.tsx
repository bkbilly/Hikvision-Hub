import React from 'react';
import { UserCheck, Save, Info, Loader2, Sparkles } from 'lucide-react';
import type { FaceDetection } from '../../../types';
import { ArmingScheduleSection } from './ArmingScheduleSection';
import { LinkageMethodSection } from './LinkageMethodSection';

interface FaceDetectionFormProps {
  face: FaceDetection;
  setFace: React.Dispatch<React.SetStateAction<FaceDetection | null>>;
  onSave: (e: React.FormEvent) => void;
  saving?: boolean;
  cameraId: number;
  refreshKey?: number;
}

export const FaceDetectionForm: React.FC<FaceDetectionFormProps> = ({
  face,
  setFace,
  onSave,
  saving = false,
  cameraId,
  refreshKey,
}) => {
  return (
    <div className="space-y-4">
      <form
        onSubmit={onSave}
        className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-pink-500/10 text-pink-400 border border-pink-500/20">
              <UserCheck className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white">Face Detection</h4>
              <p className="text-xs text-slate-400">
                Detects human faces in the camera surveillance scene and triggers alarms or captures.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={face.enabled}
                onChange={(e) => setFace({ ...face, enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-pink-600"></div>
            </label>
          </div>
        </div>

        <div className="space-y-1 pt-1">
          <div className="flex justify-between text-xs">
            <span className="text-slate-300 font-medium">Face Detection Sensitivity</span>
            <span className="text-pink-400 font-mono font-bold">{face.sensitivity} / 5</span>
          </div>
          <input
            type="range"
            min="1"
            max="5"
            value={face.sensitivity}
            onChange={(e) =>
              setFace({ ...face, sensitivity: parseInt(e.target.value) || 4 })
            }
            className="w-full accent-pink-500 bg-slate-800 rounded-lg h-2 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-500">
            <span>Level 1 (Strictest, direct full face required)</span>
            <span>Level 5 (Most sensitive, partial angles detected)</span>
          </div>
        </div>

        {/* Dynamic Face Highlight Toggle */}
        <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-pink-400" />
            <div>
              <span className="text-xs font-medium text-slate-200">Dynamic Face Highlight</span>
              <p className="text-[11px] text-slate-400">
                Draw green/red tracking boxes around detected faces on the live stream
              </p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={face.enable_highlight}
              onChange={(e) => setFace({ ...face, enable_highlight: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-8 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-pink-600"></div>
          </label>
        </div>

        <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-400 flex items-start gap-2">
          <Info className="w-4 h-4 text-pink-400 shrink-0 mt-0.5" />
          <p>
            For best recognition accuracy, ensure proper illumination and camera height. Faces smaller than 32x32 pixels or excessively blurred by motion may not trigger detection.
          </p>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-1.5 bg-pink-600 hover:bg-pink-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            Save Face Detection Settings
          </button>
        </div>
      </form>

      {/* Arming Schedule & Linkage */}
      <ArmingScheduleSection cameraId={cameraId} eventType="face" refreshKey={refreshKey} />
      <LinkageMethodSection cameraId={cameraId} eventType="face" refreshKey={refreshKey} />
    </div>
  );
};
