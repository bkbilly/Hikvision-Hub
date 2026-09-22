import React from 'react';
import {
  Activity,
  CheckSquare,
  Square,
  RefreshCw,
  Edit3,
  Trash2,
  Sun,
  Clock,
} from 'lucide-react';
import type { MotionDetection, MotionRegion } from '../../../types';

interface MotionDetectionFormProps {
  motion: MotionDetection;
  setMotion: React.Dispatch<React.SetStateAction<MotionDetection | null>>;
  isPolygonMotion: boolean;
  supportsTargetDetection: boolean;
  activeExpertAreaIndex: number;
  setActiveExpertAreaIndex: (idx: number) => void;
  getExpertRegions: () => MotionRegion[];
  updateActiveExpertRegion: (patch: Partial<MotionRegion>) => void;
  getGridDimensions: () => { cols: number; rows: number; total: number };
  countActiveGridCells: (gridMap?: string) => number;
  onSelectAllGrid: () => void;
  onClearAllGrid: () => void;
  onInvertGrid: () => void;
  onStartNormalMotionPolygon: () => void;
  onStartExpertRect: () => void;
  onSave: (e: React.FormEvent) => void;
}

export const MotionDetectionForm: React.FC<MotionDetectionFormProps> = ({
  motion,
  setMotion,
  isPolygonMotion,
  supportsTargetDetection,
  activeExpertAreaIndex,
  setActiveExpertAreaIndex,
  getExpertRegions,
  updateActiveExpertRegion,
  getGridDimensions,
  countActiveGridCells,
  onSelectAllGrid,
  onClearAllGrid,
  onInvertGrid,
  onStartNormalMotionPolygon,
  onStartExpertRect,
  onSave,
}) => {
  const expertRegions = getExpertRegions();
  const currentArea = expertRegions[activeExpertAreaIndex] || expertRegions[0];
  const { total: totalGridCells } = getGridDimensions();
  const activeGridCount = countActiveGridCells(motion.grid_map);
  const gridPercent = Math.round((activeGridCount / totalGridCells) * 100);

  return (
    <form onSubmit={onSave} className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white">Motion</h4>
            <p className="text-xs text-slate-400">Detects movement across the entire video field of view or designated zones.</p>
          </div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={motion.enabled}
            onChange={(e) => setMotion({ ...motion, enabled: e.target.checked })}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
        </label>
      </div>

      {/* Mode Selector: Normal vs Expert */}
      <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-300">Configuration Mode</span>
          <div className="flex rounded-lg bg-slate-900 p-0.5 border border-slate-700/80">
            <button
              type="button"
              onClick={() => setMotion({ ...motion, mode: 'normal' })}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all cursor-pointer ${
                (motion.mode || 'normal') === 'normal'
                  ? 'bg-emerald-600 text-white shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Normal Mode
            </button>
            <button
              type="button"
              onClick={() => setMotion({ ...motion, mode: 'expert' })}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all cursor-pointer ${
                motion.mode === 'expert'
                  ? 'bg-emerald-600 text-white shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Expert Mode
            </button>
          </div>
        </div>

        {(motion.mode || 'normal') === 'normal' ? (
          /* NORMAL MODE: Grid Map (standard cameras) or Polygon Area (polygon-capable cameras) */
          <div className="space-y-3 pt-1">
            {!isPolygonMotion ? (
              /* Grid Toolbar */
              <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={onSelectAllGrid}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Select All</span>
                  </button>
                  <button
                    type="button"
                    onClick={onClearAllGrid}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Square className="w-3.5 h-3.5 text-slate-400" />
                    <span>Clear All</span>
                  </button>
                  <button
                    type="button"
                    onClick={onInvertGrid}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Invert</span>
                  </button>
                </div>
                <span className="text-xs font-mono text-slate-400">
                  Active Grid: <span className="text-emerald-400 font-bold">{activeGridCount}</span> / {totalGridCells} ({gridPercent}%)
                </span>
              </div>
            ) : (
              /* Polygon Area Toolbar */
              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-300">
                    {motion.coordinates && motion.coordinates.length >= 3
                      ? `Polygon Defined (${motion.coordinates.length} vertices)`
                      : 'No Polygon Area Defined'}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onStartNormalMotionPolygon}
                      className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" /> Draw Polygon Area (4-10 Pts)
                    </button>
                    {motion.coordinates && motion.coordinates.length >= 3 && (
                      <button
                        type="button"
                        onClick={() => setMotion({ ...motion, coordinates: undefined })}
                        className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Clear Area
                      </button>
                    )}
                  </div>
                </div>
                {motion.coordinates && motion.coordinates.length >= 3 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {motion.coordinates.map((pt, idx) => (
                      <div key={idx} className="px-2 py-1 bg-slate-950/70 border border-slate-800 rounded text-xs font-mono text-slate-300">
                        <span className="text-emerald-400 font-bold mr-1.5">P{idx + 1}:</span>
                        <span>({pt.x}, {pt.y})</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className={`grid gap-4 pt-1 ${supportsTargetDetection ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300 font-medium">Motion Sensitivity</span>
                  <span className="text-emerald-400 font-mono font-bold">{motion.sensitivity}</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={motion.sensitivity}
                  onChange={(e) => setMotion({ ...motion, sensitivity: parseInt(e.target.value) || 50 })}
                  className="w-full accent-emerald-500 bg-slate-800 rounded-lg h-2 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>Low Sensitivity</span>
                  <span>High Sensitivity</span>
                </div>
              </div>

              {supportsTargetDetection && (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Target Detection</label>
                  <select
                    value={motion.target_type || 'all'}
                    onChange={(e) => setMotion({ ...motion, target_type: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="all">All Targets (Human & Vehicle)</option>
                    <option value="human">Human Only</option>
                    <option value="vehicle">Vehicle Only</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* EXPERT MODE: Multi-Area Selector & Per-Area Configuration */
          <div className="space-y-4 pt-1">
            {/* 1. Scheduled Image Settings / Day-Night Switch Mode (Above Options) */}
            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <label className="block text-xs font-semibold text-white">
                    Scheduled Image Settings (Day / Night Switch)
                  </label>
                  <p className="text-[11px] text-slate-400">
                    Control sensitivity and target size thresholds globally or based on day/night mode.
                  </p>
                </div>
                <div className="w-full sm:w-64 shrink-0">
                  <select
                    value={motion.day_night_switch_type || 'off'}
                    onChange={(e) => setMotion({ ...motion, day_night_switch_type: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="off">Off (Global Settings)</option>
                    <option value="auto">Auto Switch (Ambient Light Sensor)</option>
                    <option value="schedule">Scheduled</option>
                  </select>
                </div>
              </div>

              {/* Start and End Time: ONLY visible when 'schedule' is selected */}
              {motion.day_night_switch_type === 'schedule' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2.5 border-t border-slate-800">
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-300 flex items-center gap-1.5">
                      <Sun className="w-3.5 h-3.5 text-amber-400" /> Start Time (Day Mode)
                    </label>
                    <input
                      type="time"
                      step="1"
                      value={motion.schedule_start_time || '06:00:00'}
                      onChange={(e) => setMotion({ ...motion, schedule_start_time: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs sm:text-sm text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-300 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-blue-400" /> End Time (Night Mode)
                    </label>
                    <input
                      type="time"
                      step="1"
                      value={motion.schedule_end_time || '18:00:00'}
                      onChange={(e) => setMotion({ ...motion, schedule_end_time: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs sm:text-sm text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 2. Area 1..8 Tabs */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Select Detection Area</label>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                {expertRegions.map((reg, idx) => {
                  const isSelected = activeExpertAreaIndex === idx;
                  const isEnabled = Boolean(reg.enabled);
                  return (
                    <button
                      key={reg.id || idx + 1}
                      type="button"
                      onClick={() => setActiveExpertAreaIndex(idx)}
                      className={`py-1.5 px-2 rounded-lg text-xs font-medium border flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-600 text-white border-emerald-500 shadow-md font-bold'
                          : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          isEnabled ? (isSelected ? 'bg-white' : 'bg-emerald-400') : 'bg-slate-600'
                        }`}
                      />
                      <span>Area {idx + 1}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. Active Area Controls & Configuration Options */}
            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3.5">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white">Area {activeExpertAreaIndex + 1} Settings</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${
                    currentArea.enabled ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {currentArea.enabled ? 'Active' : 'Disabled'}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={onStartExpertRect}
                    className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Edit3 className="w-3 h-3" /> Draw 90° Rectangle
                  </button>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(currentArea.enabled)}
                      onChange={(e) => updateActiveExpertRegion({ enabled: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-8 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>
              </div>

              {/* Dynamic Sensitivity and Percentage Options based on Day/Night Switch Mode */}
              {(!motion.day_night_switch_type || motion.day_night_switch_type === 'off') ? (
                /* GLOBAL SETTING (When Scheduled Image Settings is OFF) */
                <div className={`grid gap-3 pt-1 ${motion.supports_percentage ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-300 font-medium">Area Sensitivity</span>
                      <span className="text-emerald-400 font-mono font-bold">{currentArea.sensitivity}</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="100"
                      value={currentArea.sensitivity}
                      onChange={(e) => updateActiveExpertRegion({ sensitivity: parseInt(e.target.value) || 50 })}
                      className="w-full accent-emerald-500 bg-slate-800 rounded-lg h-2 cursor-pointer"
                    />
                  </div>

                  {motion.supports_percentage && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-300 font-medium">Target Size (Percentage %)</span>
                        <span className="text-emerald-400 font-mono font-bold">{currentArea.percentage ?? 20}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={currentArea.percentage ?? 20}
                        onChange={(e) => updateActiveExpertRegion({ percentage: parseInt(e.target.value) || 0 })}
                        className="w-full accent-emerald-500 bg-slate-800 rounded-lg h-2 cursor-pointer"
                      />
                    </div>
                  )}
                </div>
              ) : (
                /* DAY & NIGHT SETTINGS (When Scheduled Image Settings is AUTO SWITCH or SCHEDULED) */
                <div className="space-y-3 pt-1">
                  {/* Day Settings Card */}
                  <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 space-y-2.5">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400">
                      <Sun className="w-3.5 h-3.5" /> Day Options
                    </div>
                    <div className={`grid gap-3 ${motion.supports_percentage ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-300 font-medium">Day Sensitivity</span>
                          <span className="text-amber-400 font-mono font-bold">
                            {currentArea.day_sensitivity ?? currentArea.sensitivity ?? 50}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="100"
                          value={currentArea.day_sensitivity ?? currentArea.sensitivity ?? 50}
                          onChange={(e) => updateActiveExpertRegion({ day_sensitivity: parseInt(e.target.value) || 50 })}
                          className="w-full accent-amber-500 bg-slate-800 rounded-lg h-2 cursor-pointer"
                        />
                      </div>

                      {motion.supports_percentage && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-300 font-medium">Day Target Size (%)</span>
                            <span className="text-amber-400 font-mono font-bold">
                              {currentArea.day_percentage ?? currentArea.percentage ?? 20}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={currentArea.day_percentage ?? currentArea.percentage ?? 20}
                            onChange={(e) => updateActiveExpertRegion({ day_percentage: parseInt(e.target.value) || 0 })}
                            className="w-full accent-amber-500 bg-slate-800 rounded-lg h-2 cursor-pointer"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Night Settings Card */}
                  <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 space-y-2.5">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-400">
                      <Clock className="w-3.5 h-3.5" /> Night Options
                    </div>
                    <div className={`grid gap-3 ${motion.supports_percentage ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-300 font-medium">Night Sensitivity</span>
                          <span className="text-blue-400 font-mono font-bold">
                            {currentArea.night_sensitivity ?? currentArea.sensitivity ?? 50}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="100"
                          value={currentArea.night_sensitivity ?? currentArea.sensitivity ?? 50}
                          onChange={(e) => updateActiveExpertRegion({ night_sensitivity: parseInt(e.target.value) || 50 })}
                          className="w-full accent-blue-500 bg-slate-800 rounded-lg h-2 cursor-pointer"
                        />
                      </div>

                      {motion.supports_percentage && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-300 font-medium">Night Target Size (%)</span>
                            <span className="text-blue-400 font-mono font-bold">
                              {currentArea.night_percentage ?? currentArea.percentage ?? 20}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={currentArea.night_percentage ?? currentArea.percentage ?? 20}
                            onChange={(e) => updateActiveExpertRegion({ night_percentage: parseInt(e.target.value) || 0 })}
                            className="w-full accent-blue-500 bg-slate-800 rounded-lg h-2 cursor-pointer"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Target Detection Dropdown (if supported) */}
              {supportsTargetDetection && (
                <div className="pt-1">
                  <label className="block text-xs font-medium text-slate-300 mb-1">Target Detection</label>
                  <select
                    value={motion.target_type || 'all'}
                    onChange={(e) => setMotion({ ...motion, target_type: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="all">All Targets (Human & Vehicle)</option>
                    <option value="human">Human Only</option>
                    <option value="vehicle">Vehicle Only</option>
                  </select>
                </div>
              )}

              {/* Active Area 4 Corner Coordinates Display */}
              {(() => {
                const activePts = currentArea.coordinates && currentArea.coordinates.length >= 4
                  ? currentArea.coordinates
                  : [
                      { x: 150 + (activeExpertAreaIndex % 4) * 60, y: 150 + (activeExpertAreaIndex % 4) * 60 },
                      { x: 650 + (activeExpertAreaIndex % 4) * 60, y: 150 + (activeExpertAreaIndex % 4) * 60 },
                      { x: 650 + (activeExpertAreaIndex % 4) * 60, y: 650 + (activeExpertAreaIndex % 4) * 60 },
                      { x: 150 + (activeExpertAreaIndex % 4) * 60, y: 650 + (activeExpertAreaIndex % 4) * 60 },
                    ];
                return (
                  <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                    <div>
                      <span className="text-emerald-400 font-bold block">Corner 1 (TL)</span>
                      <span className="text-slate-400">X: {activePts[0].x}, Y: {activePts[0].y}</span>
                    </div>
                    <div>
                      <span className="text-emerald-400 font-bold block">Corner 2 (TR)</span>
                      <span className="text-slate-400">X: {activePts[1].x}, Y: {activePts[1].y}</span>
                    </div>
                    <div>
                      <span className="text-emerald-400 font-bold block">Corner 3 (BR)</span>
                      <span className="text-slate-400">X: {activePts[2].x}, Y: {activePts[2].y}</span>
                    </div>
                    <div>
                      <span className="text-emerald-400 font-bold block">Corner 4 (BL)</span>
                      <span className="text-slate-400">X: {activePts[3].x}, Y: {activePts[3].y}</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* Dynamic Analysis / Highlight Toggle */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
          <div>
            <span className="text-xs font-medium text-slate-200 block">Dynamic Analysis for Motion (Highlight)</span>
            <span className="text-[11px] text-slate-400 block">Marks moving targets with green bounding boxes in video streams</span>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(motion.enable_highlight)}
              onChange={(e) => setMotion({ ...motion, enable_highlight: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-8 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-600"></div>
          </label>
        </div>
      </div>

      <div className="flex justify-end pt-1">
        <button
          type="submit"
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
        >
          Update Motion Detection
        </button>
      </div>
    </form>
  );
};
