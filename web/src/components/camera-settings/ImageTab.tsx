import React, { useState } from 'react';
import { RefreshCw, Sun, Moon, Sparkles, Sliders, Eye, EyeOff, Lightbulb, Loader2 } from 'lucide-react';
import type { Camera, ImageSettings, CameraCapabilities } from '../../types';
import { api } from '../../api';
import { PrivacyMaskTab } from './PrivacyMaskTab';

interface ImageTabProps {
  camera: Camera;
  snapshotKey: number;
  refreshKey?: number;
  imageSettings: ImageSettings | null;
  setImageSettings: React.Dispatch<React.SetStateAction<ImageSettings | null>>;
  onRefreshPreview: () => void;
  onSaveImage: (e: React.FormEvent) => void;
  isSaving?: boolean;
  capabilities?: CameraCapabilities | null;
  setSaveStatus: React.Dispatch<React.SetStateAction<{ success: boolean; message: string } | null>>;
  onRegisterPrivacyRefresh?: (refreshFn: () => Promise<void>) => void;
}

const IR_LABELS: Record<string, string> = {
  auto: 'Auto Switch',
  day: 'Color (Day)',
  night: 'Night (IR B&W)',
  schedule: 'Schedule',
  eventTrigger: 'Event Trigger',
};

const WB_LABELS: Record<string, string> = {
  auto: 'Auto (AWB)',
  auto1: 'Auto 1 (AWB)',
  auto2: 'Auto 2 (AWB2)',
  manual: 'Manual (MWB)',
  locked: 'Locked WB',
  daylightLamp: 'Daylight Lamp',
  daylight: 'Daylight',
  incandescentlight: 'Incandescent Lamp',
  incandescent: 'Incandescent',
  warmlight: 'Warm Light',
  naturallight: 'Natural Light',
};

const BLC_LABELS: Record<string, string> = {
  CLOSE: 'Disabled (Off)',
  UP: 'Up',
  DOWN: 'Down',
  LEFT: 'Left',
  RIGHT: 'Right',
  CENTER: 'Center',
  AUTO: 'Auto',
  Region: 'Custom Region',
};

const FLIP_LABELS: Record<string, string> = {
  OFF: 'Standard (Normal)',
  center: '180° Inverted (Ceiling Mount)',
  CENTER: '180° Inverted (Ceiling Mount)',
  leftRight: 'Mirror (Horizontal Flip)',
  LEFTRIGHT: 'Mirror (Horizontal Flip)',
  upDown: 'Vertical Flip',
  UPDOWN: 'Vertical Flip',
};

export const ImageTab: React.FC<ImageTabProps> = ({
  camera,
  snapshotKey,
  refreshKey,
  imageSettings,
  setImageSettings,
  onRefreshPreview,
  onSaveImage,
  isSaving = false,
  capabilities,
  setSaveStatus,
  onRegisterPrivacyRefresh,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'display' | 'privacy'>('display');
  const hasPrivacyMask = capabilities === null || capabilities?.has_privacy_mask !== false;

  const renderSubTabs = () => {
    if (!hasPrivacyMask) return null;
    return (
      <div className="flex items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-xl">
        <button
          type="button"
          onClick={() => setActiveSubTab('display')}
          className={`py-1.5 px-3.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'display'
              ? 'bg-blue-600 text-white shadow-sm font-semibold'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Sun className="w-3.5 h-3.5" />
          <span>Display Settings</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('privacy')}
          className={`py-1.5 px-3.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'privacy'
              ? 'bg-blue-600 text-white shadow-sm font-semibold'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <EyeOff className="w-3.5 h-3.5" />
          <span>Privacy Mask</span>
        </button>
      </div>
    );
  };

  if (activeSubTab === 'privacy') {
    return (
      <div className="space-y-6">
        {renderSubTabs()}
        <PrivacyMaskTab
          camera={camera}
          snapshotKey={snapshotKey}
          refreshKey={refreshKey}
          onRefreshPreview={onRefreshPreview}
          setSaveStatus={setSaveStatus}
          onRegisterRefresh={onRegisterPrivacyRefresh}
        />
      </div>
    );
  }

  if (!imageSettings) {
    return (
      <div className="space-y-6">
        {renderSubTabs()}
        <div className="text-center py-12 text-slate-500 text-sm">Loading image settings...</div>
      </div>
    );
  }

  // IR Cut Filter options
  const irModes = (imageSettings.supported_ircut_filter_types && imageSettings.supported_ircut_filter_types.length > 0
    ? imageSettings.supported_ircut_filter_types
    : ['auto', 'day', 'night', 'schedule']
  ).map((mode) => ({
    id: mode,
    label: IR_LABELS[mode] || mode.toUpperCase(),
  }));

  // WDR options
  const wdrModes = imageSettings.supported_wdr_modes && imageSettings.supported_wdr_modes.length > 0
    ? imageSettings.supported_wdr_modes
    : ['close', 'open'];

  // White Balance options
  const wbModes = imageSettings.supported_white_balance_styles && imageSettings.supported_white_balance_styles.length > 0
    ? imageSettings.supported_white_balance_styles
    : ['auto1', 'manual', 'daylightLamp', 'incandescentlight', 'locked'];

  // BLC options
  const blcModes = imageSettings.supported_blc_modes && imageSettings.supported_blc_modes.length > 0
    ? imageSettings.supported_blc_modes
    : ['CLOSE', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'CENTER', 'AUTO'];

  // Noise Reduction options
  const nrModes = imageSettings.supported_noise_reduce_modes && imageSettings.supported_noise_reduce_modes.length > 0
    ? imageSettings.supported_noise_reduce_modes
    : ['close', 'general', 'advanced'];

  // Supplement Light options
  const slModes = imageSettings.supported_supplement_light_modes && imageSettings.supported_supplement_light_modes.length > 0
    ? imageSettings.supported_supplement_light_modes
    : ['close', 'colorVuWhiteLight'];

  // Flip options
  const flipModes = imageSettings.supported_image_flip_styles && imageSettings.supported_image_flip_styles.length > 0
    ? ['OFF', ...imageSettings.supported_image_flip_styles.filter((f) => f.toUpperCase() !== 'OFF')]
    : ['OFF', 'LEFTRIGHT', 'UPDOWN', 'CENTER'];

  return (
    <div className="space-y-6">
      {renderSubTabs()}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-white mb-0.5">Image & Display Settings</h3>
          <p className="text-xs text-slate-400">
            Hardware optics, sensor tuning, exposure controls, and Day/Night switching.
          </p>
        </div>
      </div>

      {/* Live Preview Container */}
      <div className="flex justify-center w-full">
        <div className="relative w-full max-w-2xl aspect-video rounded-xl overflow-hidden border border-slate-800 bg-black select-none shadow-lg group">
          <img
            src={api.getSnapshotUrl(camera.id, snapshotKey)}
            alt="Camera Snapshot"
            className="w-full h-full object-cover block"
          />

          {isSaving && (
            <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2.5 py-1 bg-blue-950/80 text-blue-300 text-xs rounded-lg border border-blue-500/30 backdrop-blur-md animate-pulse shadow-md">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Applying & adjusting exposure...</span>
            </div>
          )}

          <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={onRefreshPreview}
              title="Refresh Snapshot"
              disabled={isSaving}
              className="p-1.5 bg-black/70 hover:bg-black/90 text-slate-300 hover:text-white backdrop-blur-md rounded-lg border border-white/10 shadow-md transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSaving ? 'animate-spin text-blue-400' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      <form onSubmit={onSaveImage} className="space-y-6">
        {/* Day / Night IR Cut Filter Section */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Moon className="w-4 h-4 text-amber-400" />
              <label className="text-xs font-semibold text-slate-200">Day / Night IR Cut Filter</label>
            </div>
            <span className="text-[11px] font-mono text-amber-400 uppercase font-semibold">
              {imageSettings.ircut_filter_type}
            </span>
          </div>

          <div className={`grid grid-cols-2 sm:grid-cols-${Math.min(irModes.length, 5)} gap-2`}>
            {irModes.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setImageSettings({ ...imageSettings, ircut_filter_type: mode.id })}
                className={`py-2 px-2.5 text-xs font-medium rounded-lg border transition-all cursor-pointer ${
                  imageSettings.ircut_filter_type.toLowerCase() === mode.id.toLowerCase()
                    ? 'bg-amber-600 text-white border-amber-500 shadow-md shadow-amber-600/20 font-bold'
                    : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          {/* Filter Sensitivity & Delay (if supported by camera) */}
          {(imageSettings.night_to_day_filter_level !== undefined || imageSettings.night_to_day_filter_time !== undefined) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-800/80">
              {imageSettings.night_to_day_filter_level !== undefined && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">IR Switch Sensitivity</span>
                    <span className="text-amber-400 font-mono">{imageSettings.night_to_day_filter_level} (0-7)</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="7"
                    value={imageSettings.night_to_day_filter_level}
                    onChange={(e) =>
                      setImageSettings({ ...imageSettings, night_to_day_filter_level: parseInt(e.target.value) })
                    }
                    className="w-full accent-amber-500 bg-slate-800 rounded-lg h-2 cursor-pointer"
                  />
                </div>
              )}
              {imageSettings.night_to_day_filter_time !== undefined && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">IR Switch Delay Time</span>
                    <span className="text-amber-400 font-mono">{imageSettings.night_to_day_filter_time}s</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="120"
                    value={imageSettings.night_to_day_filter_time}
                    onChange={(e) =>
                      setImageSettings({ ...imageSettings, night_to_day_filter_time: parseInt(e.target.value) })
                    }
                    className="w-full accent-amber-500 bg-slate-800 rounded-lg h-2 cursor-pointer"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Primary Color & Clarity Sliders Grid */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
          <div className="flex items-center gap-2">
            <Sun className="w-4 h-4 text-blue-400" />
            <h4 className="text-xs font-semibold text-slate-200">Color & Clarity Adjustments</h4>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Brightness */}
            <div className="space-y-1.5 p-3 rounded-lg bg-slate-950/40 border border-slate-800/80">
              <div className="flex justify-between text-xs font-medium">
                <span className="text-slate-300">Brightness</span>
                <span className="text-blue-400 font-mono">{imageSettings.brightness}</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={imageSettings.brightness}
                onChange={(e) => setImageSettings({ ...imageSettings, brightness: parseInt(e.target.value) })}
                className="w-full accent-blue-500 bg-slate-800 rounded-lg h-2 cursor-pointer"
              />
            </div>

            {/* Contrast */}
            <div className="space-y-1.5 p-3 rounded-lg bg-slate-950/40 border border-slate-800/80">
              <div className="flex justify-between text-xs font-medium">
                <span className="text-slate-300">Contrast</span>
                <span className="text-blue-400 font-mono">{imageSettings.contrast}</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={imageSettings.contrast}
                onChange={(e) => setImageSettings({ ...imageSettings, contrast: parseInt(e.target.value) })}
                className="w-full accent-blue-500 bg-slate-800 rounded-lg h-2 cursor-pointer"
              />
            </div>

            {/* Saturation */}
            <div className="space-y-1.5 p-3 rounded-lg bg-slate-950/40 border border-slate-800/80">
              <div className="flex justify-between text-xs font-medium">
                <span className="text-slate-300">Saturation</span>
                <span className="text-blue-400 font-mono">{imageSettings.saturation}</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={imageSettings.saturation}
                onChange={(e) => setImageSettings({ ...imageSettings, saturation: parseInt(e.target.value) })}
                className="w-full accent-blue-500 bg-slate-800 rounded-lg h-2 cursor-pointer"
              />
            </div>

            {/* Sharpness */}
            <div className="space-y-1.5 p-3 rounded-lg bg-slate-950/40 border border-slate-800/80">
              <div className="flex justify-between text-xs font-medium">
                <span className="text-slate-300">Sharpness</span>
                <span className="text-blue-400 font-mono">{imageSettings.sharpness}</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={imageSettings.sharpness}
                onChange={(e) => setImageSettings({ ...imageSettings, sharpness: parseInt(e.target.value) })}
                className="w-full accent-blue-500 bg-slate-800 rounded-lg h-2 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Backlight & Contrast Enhancement (WDR, BLC, HLC) */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-indigo-400" />
            <h4 className="text-xs font-semibold text-slate-200">Backlight & Exposure Enhancements</h4>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* WDR */}
            <div className="space-y-2 p-3 rounded-lg bg-slate-950/40 border border-slate-800/80">
              <label className="block text-xs font-medium text-slate-300">Wide Dynamic Range (WDR)</label>
              <select
                value={imageSettings.wdr_mode || 'close'}
                onChange={(e) => setImageSettings({ ...imageSettings, wdr_mode: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                {wdrModes.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode === 'close' ? 'Disabled (Close)' : mode === 'open' ? 'Enabled (Open)' : mode.toUpperCase()}
                  </option>
                ))}
              </select>

              {imageSettings.wdr_mode && imageSettings.wdr_mode !== 'close' && (
                <div className="pt-2 border-t border-slate-800/80 space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">WDR Level</span>
                    <span className="text-indigo-400 font-mono">{imageSettings.wdr_level ?? 50}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={imageSettings.wdr_level ?? 50}
                    onChange={(e) => setImageSettings({ ...imageSettings, wdr_level: parseInt(e.target.value) })}
                    className="w-full accent-indigo-500 bg-slate-800 rounded-lg h-1.5 cursor-pointer"
                  />
                </div>
              )}
            </div>

            {/* BLC (Backlight Compensation) */}
            {imageSettings.has_blc && (
              <div className="space-y-2 p-3 rounded-lg bg-slate-950/40 border border-slate-800/80">
                <label className="block text-xs font-medium text-slate-300">Backlight Compensation (BLC)</label>
                <select
                  value={imageSettings.blc_mode || 'CLOSE'}
                  onChange={(e) =>
                    setImageSettings({
                      ...imageSettings,
                      blc_mode: e.target.value,
                      blc_enabled: e.target.value !== 'CLOSE',
                    })
                  }
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  {blcModes.map((mode) => (
                    <option key={mode} value={mode}>
                      {BLC_LABELS[mode] || mode}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500">
                  {imageSettings.blc_mode && imageSettings.blc_mode !== 'CLOSE' ? 'BLC is Active' : 'Off'}
                </p>
              </div>
            )}

            {/* HLC (Highlight Compensation) */}
            {imageSettings.has_hlc && (
              <div className="space-y-2 p-3 rounded-lg bg-slate-950/40 border border-slate-800/80">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-300">Highlight Compensation (HLC)</label>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={imageSettings.hlc_enabled || false}
                      onChange={(e) => setImageSettings({ ...imageSettings, hlc_enabled: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-8 h-4 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>

                {imageSettings.hlc_enabled && (
                  <div className="pt-2 border-t border-slate-800/80 space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-400">HLC Suppression Level</span>
                      <span className="text-indigo-400 font-mono">{imageSettings.hlc_level ?? 50}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={imageSettings.hlc_level ?? 50}
                      onChange={(e) => setImageSettings({ ...imageSettings, hlc_level: parseInt(e.target.value) })}
                      className="w-full accent-indigo-500 bg-slate-800 rounded-lg h-1.5 cursor-pointer"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* White Balance Section */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <h4 className="text-xs font-semibold text-slate-200">White Balance & Color Temperature</h4>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">White Balance Style</label>
              <select
                value={imageSettings.white_balance || 'auto1'}
                onChange={(e) => setImageSettings({ ...imageSettings, white_balance: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                {wbModes.map((mode) => (
                  <option key={mode} value={mode}>
                    {WB_LABELS[mode] || mode}
                  </option>
                ))}
              </select>
            </div>

            {/* Manual Red / Blue Gain (if manual WB selected and supported) */}
            {imageSettings.white_balance === 'manual' && imageSettings.has_white_balance_manual && (
              <>
                <div className="space-y-1 p-2.5 rounded-lg bg-slate-950/40 border border-slate-800/80">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-300">Red Gain (R)</span>
                    <span className="text-red-400 font-mono">{imageSettings.white_balance_red ?? 50}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={imageSettings.white_balance_red ?? 50}
                    onChange={(e) =>
                      setImageSettings({ ...imageSettings, white_balance_red: parseInt(e.target.value) })
                    }
                    className="w-full accent-red-500 bg-slate-800 rounded-lg h-1.5 cursor-pointer"
                  />
                </div>

                <div className="space-y-1 p-2.5 rounded-lg bg-slate-950/40 border border-slate-800/80">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-300">Blue Gain (B)</span>
                    <span className="text-sky-400 font-mono">{imageSettings.white_balance_blue ?? 50}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={imageSettings.white_balance_blue ?? 50}
                    onChange={(e) =>
                      setImageSettings({ ...imageSettings, white_balance_blue: parseInt(e.target.value) })
                    }
                    className="w-full accent-sky-500 bg-slate-800 rounded-lg h-1.5 cursor-pointer"
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Sensor, Optics & Image Quality (DNR, Shutter, Gain, Anti-Flicker, Orientation, Light) */}
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-purple-400" />
            <h4 className="text-xs font-semibold text-slate-200">Optics, Sensor & Quality Tuning</h4>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Digital Noise Reduction (DNR) */}
            {imageSettings.has_noise_reduce && (
              <div className="space-y-2 p-3 rounded-lg bg-slate-950/40 border border-slate-800/80">
                <label className="block text-xs font-medium text-slate-300">Noise Reduction (DNR)</label>
                <select
                  value={imageSettings.noise_reduce_mode || 'general'}
                  onChange={(e) => setImageSettings({ ...imageSettings, noise_reduce_mode: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                >
                  {nrModes.map((mode) => (
                    <option key={mode} value={mode}>
                      {mode === 'close'
                        ? 'Disabled (Off)'
                        : mode === 'general'
                        ? 'General (Normal DNR)'
                        : 'Advanced DNR'}
                    </option>
                  ))}
                </select>

                {imageSettings.noise_reduce_mode === 'general' && (
                  <div className="pt-2 border-t border-slate-800/80 space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-400">DNR Level</span>
                      <span className="text-purple-400 font-mono">{imageSettings.noise_reduce_level ?? 50}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={imageSettings.noise_reduce_level ?? 50}
                      onChange={(e) =>
                        setImageSettings({ ...imageSettings, noise_reduce_level: parseInt(e.target.value) })
                      }
                      className="w-full accent-purple-500 bg-slate-800 rounded-lg h-1.5 cursor-pointer"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Shutter Speed */}
            {imageSettings.supported_shutter_levels && imageSettings.supported_shutter_levels.length > 0 && (
              <div className="space-y-2 p-3 rounded-lg bg-slate-950/40 border border-slate-800/80">
                <label className="block text-xs font-medium text-slate-300">Shutter Speed</label>
                <select
                  value={imageSettings.shutter_level || imageSettings.supported_shutter_levels[0]}
                  onChange={(e) => setImageSettings({ ...imageSettings, shutter_level: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                >
                  {imageSettings.supported_shutter_levels.map((speed) => (
                    <option key={speed} value={speed}>
                      {speed} s
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500">Fixed exposure interval</p>
              </div>
            )}

            {/* Sensor Gain */}
            {imageSettings.has_gain && (
              <div className="space-y-2 p-3 rounded-lg bg-slate-950/40 border border-slate-800/80">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-slate-300">Sensor Gain Limit</span>
                  <span className="text-purple-400 font-mono">{imageSettings.gain_level ?? 50}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={imageSettings.gain_level ?? 50}
                  onChange={(e) => setImageSettings({ ...imageSettings, gain_level: parseInt(e.target.value) })}
                  className="w-full accent-purple-500 bg-slate-800 rounded-lg h-2 cursor-pointer mt-2"
                />
                <p className="text-[11px] text-slate-500">Maximum amplification in low light</p>
              </div>
            )}

            {/* Power Line Frequency / Anti-Flicker */}
            {imageSettings.supported_power_line_frequency_modes &&
              imageSettings.supported_power_line_frequency_modes.length > 0 && (
                <div className="space-y-2 p-3 rounded-lg bg-slate-950/40 border border-slate-800/80">
                  <label className="block text-xs font-medium text-slate-300">Anti-Flicker (Frequency)</label>
                  <select
                    value={imageSettings.power_line_frequency_mode || '60hz'}
                    onChange={(e) =>
                      setImageSettings({ ...imageSettings, power_line_frequency_mode: e.target.value })
                    }
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  >
                    {imageSettings.supported_power_line_frequency_modes.map((freq) => (
                      <option key={freq} value={freq}>
                        {freq.toUpperCase()} {freq.toLowerCase().includes('50') ? '(Europe / PAL)' : '(US / NTSC)'}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-500">Eliminates lighting flicker</p>
                </div>
              )}

            {/* Image Flip / Orientation */}
            <div className="space-y-2 p-3 rounded-lg bg-slate-950/40 border border-slate-800/80">
              <label className="block text-xs font-medium text-slate-300">Image Flip / Orientation</label>
              <select
                value={imageSettings.image_flip_style || 'OFF'}
                onChange={(e) => setImageSettings({ ...imageSettings, image_flip_style: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
              >
                {flipModes.map((style) => (
                  <option key={style} value={style}>
                    {FLIP_LABELS[style] || style}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500">Mount orientation adjustments</p>
            </div>

            {/* Supplement Light (ColorVu White Light) */}
            {imageSettings.has_supplement_light && (
              <div className="space-y-2 p-3 rounded-lg bg-slate-950/40 border border-slate-800/80">
                <div className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
                  <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                  <span>ColorVu Supplement Light</span>
                </div>
                <select
                  value={imageSettings.supplement_light_mode || 'close'}
                  onChange={(e) => setImageSettings({ ...imageSettings, supplement_light_mode: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  {slModes.map((mode) => (
                    <option key={mode} value={mode}>
                      {mode === 'close' ? 'Disabled (Off)' : 'ColorVu White Light'}
                    </option>
                  ))}
                </select>

                {imageSettings.supplement_light_mode === 'colorVuWhiteLight' && (
                  <div className="pt-2 border-t border-slate-800/80 space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-400">White Light Brightness</span>
                      <span className="text-amber-400 font-mono">{imageSettings.white_light_brightness ?? 50}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={imageSettings.white_light_brightness ?? 50}
                      onChange={(e) =>
                        setImageSettings({ ...imageSettings, white_light_brightness: parseInt(e.target.value) })
                      }
                      className="w-full accent-amber-500 bg-slate-800 rounded-lg h-1.5 cursor-pointer"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Dehaze */}
            {imageSettings.has_dehaze && (
              <div className="space-y-2 p-3 rounded-lg bg-slate-950/40 border border-slate-800/80">
                <label className="block text-xs font-medium text-slate-300">Dehaze Mode</label>
                <select
                  value={imageSettings.dehaze_mode || 'close'}
                  onChange={(e) => setImageSettings({ ...imageSettings, dehaze_mode: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="close">Disabled (Off)</option>
                  <option value="open">Enabled (On)</option>
                  <option value="auto">Automatic (Auto)</option>
                </select>
                <p className="text-[11px] text-slate-500">Clears fog and environmental haze</p>
              </div>
            )}
          </div>
        </div>

        {/* Action Controls & Info */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <p className="text-xs text-slate-400">
            Saving sends instructions directly to the camera hardware and automatically refreshes the image preview.
          </p>
          <button
            type="submit"
            disabled={isSaving}
            className="flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs sm:text-sm font-medium shadow-md shadow-blue-600/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Applying Settings...</span>
              </>
            ) : (
              <span>Apply Image Settings</span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
