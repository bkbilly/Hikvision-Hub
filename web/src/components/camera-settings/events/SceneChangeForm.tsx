import React from 'react';
import { Camera, Save, Info, Loader2 } from 'lucide-react';
import type { SceneChangeDetection } from '../../../types';
import { ArmingScheduleSection } from './ArmingScheduleSection';
import { LinkageMethodSection } from './LinkageMethodSection';

interface SceneChangeFormProps {
  scene: SceneChangeDetection;
  setScene: React.Dispatch<React.SetStateAction<SceneChangeDetection | null>>;
  onSave: (e: React.FormEvent) => void;
  saving?: boolean;
  cameraId: number;
  refreshKey?: number;
}

export const SceneChangeForm: React.FC<SceneChangeFormProps> = ({
  scene,
  setScene,
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
            <div className="p-2 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white">Scene Change Detection</h4>
              <p className="text-xs text-slate-400">
                Detects sudden changes in the video surveillance scene, such as camera rotation, deflection, or displacement.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={scene.enabled}
                onChange={(e) => setScene({ ...scene, enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-teal-600"></div>
            </label>
          </div>
        </div>

        <div className="space-y-1 pt-1">
          <div className="flex justify-between text-xs">
            <span className="text-slate-300 font-medium">Detection Sensitivity</span>
            <span className="text-teal-400 font-mono font-bold">{scene.sensitivity}</span>
          </div>
          <input
            type="range"
            min="1"
            max="100"
            value={scene.sensitivity}
            onChange={(e) =>
              setScene({ ...scene, sensitivity: parseInt(e.target.value) || 50 })
            }
            className="w-full accent-teal-500 bg-slate-800 rounded-lg h-2 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-500">
            <span>Low (Requires large field-of-view change)</span>
            <span>High (Triggers on minor camera shift)</span>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-400 flex items-start gap-2">
          <Info className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
          <p>
            Scene Change Detection works across the entire camera view. When the surveillance angle is altered by external forces or physical impact, an alarm will be generated according to the configured schedule and linkage methods below.
          </p>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            Save Scene Change Settings
          </button>
        </div>
      </form>

      {/* Arming Schedule & Linkage */}
      <ArmingScheduleSection cameraId={cameraId} eventType="scene" refreshKey={refreshKey} />
      <LinkageMethodSection cameraId={cameraId} eventType="scene" refreshKey={refreshKey} />
    </div>
  );
};
