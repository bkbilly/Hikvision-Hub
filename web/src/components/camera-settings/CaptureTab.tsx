import React, { useEffect, useState } from 'react';
import { Camera, Calendar, Clock, Copy, Check, Save, Loader2, AlertCircle, Zap, Timer } from 'lucide-react';
import { api } from '../../api';
import type { CameraCapabilities, CaptureSettings, RecordScheduleDay } from '../../types';

interface CaptureTabProps {
  cameraId: number;
  capabilities: CameraCapabilities | null;
  setSaveStatus: React.Dispatch<React.SetStateAction<{ success: boolean; message: string } | null>>;
  refreshKey?: number;
  onRegisterRefresh?: (fn: () => Promise<void>) => void;
}

const DAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

export const CaptureTab: React.FC<CaptureTabProps> = ({
  cameraId,
  capabilities,
  setSaveStatus,
  refreshKey,
  onRegisterRefresh,
}) => {
  const [settings, setSettings] = useState<CaptureSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const prevRefreshKeyRef = React.useRef<number | undefined>(refreshKey);
  const prevCameraIdRef = React.useRef<number>(cameraId);
  const isLoadedRef = React.useRef<boolean>(false);

  const fetchCapture = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getCaptureSettings(cameraId);
      if (res.schedule) {
        const daysMap = new Map<number, RecordScheduleDay>();
        (res.schedule.days || []).forEach((d) => daysMap.set(d.day_of_week, d));
        const fullDays: RecordScheduleDay[] = [1, 2, 3, 4, 5, 6, 7].map((dayNum) => {
          return (
            daysMap.get(dayNum) || {
              day_of_week: dayNum,
              time_ranges: [],
            }
          );
        });
        res.schedule.days = fullDays;
      }
      setSettings(res);
      isLoadedRef.current = true;
    } catch (err: any) {
      setError('Failed to load capture settings: ' + (err.message || 'unknown error'));
    } finally {
      setLoading(false);
    }
  }, [cameraId]);

  // Initial load
  useEffect(() => {
    if (prevCameraIdRef.current !== cameraId) {
      prevCameraIdRef.current = cameraId;
      isLoadedRef.current = false;
    }
    if (!isLoadedRef.current) {
      fetchCapture();
    }
  }, [cameraId, fetchCapture]);

  // Explicit refresh key change
  useEffect(() => {
    if (!refreshKey || refreshKey === prevRefreshKeyRef.current) return;
    prevRefreshKeyRef.current = refreshKey;
    fetchCapture();
  }, [refreshKey, fetchCapture]);

  // Register refresh callback for parent
  useEffect(() => {
    onRegisterRefresh?.(fetchCapture);
  }, [onRegisterRefresh, fetchCapture]);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setFeedback(null);
    setError(null);
    try {
      await api.setCaptureSettings(cameraId, settings);
      setFeedback('Capture settings and schedule saved successfully');
      setSaveStatus({ success: true, message: 'Snapshot capture settings saved' });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err: any) {
      setError('Failed to save capture settings: ' + (err.message || 'unknown error'));
      setSaveStatus({ success: false, message: err.message || 'Failed to save capture settings' });
    } finally {
      setSaving(false);
    }
  };

  const handleSet24x7Schedule = () => {
    if (!settings || !settings.schedule) return;
    const newDays: RecordScheduleDay[] = [1, 2, 3, 4, 5, 6, 7].map((d) => ({
      day_of_week: d,
      time_ranges: [
        {
          begin_time: '00:00:00',
          end_time: '24:00:00',
          record_mode: 'CMR',
        },
      ],
    }));
    setSettings({
      ...settings,
      schedule: {
        ...settings.schedule,
        days: newDays,
      },
    });
  };

  const handleClearSchedule = () => {
    if (!settings || !settings.schedule) return;
    const newDays: RecordScheduleDay[] = [1, 2, 3, 4, 5, 6, 7].map((d) => ({
      day_of_week: d,
      time_ranges: [],
    }));
    setSettings({
      ...settings,
      schedule: {
        ...settings.schedule,
        days: newDays,
      },
    });
  };

  const toggleScheduleDay = (dayIndex: number) => {
    if (!settings || !settings.schedule) return;
    const newDays = [...settings.schedule.days];
    const cur = newDays[dayIndex];
    if (cur.time_ranges && cur.time_ranges.length > 0) {
      newDays[dayIndex] = { ...cur, time_ranges: [] };
    } else {
      newDays[dayIndex] = {
        ...cur,
        time_ranges: [
          {
            begin_time: '00:00:00',
            end_time: '24:00:00',
            record_mode: 'CMR',
          },
        ],
      };
    }
    setSettings({
      ...settings,
      schedule: { ...settings.schedule, days: newDays },
    });
  };

  const updateScheduleDayTime = (
    dayIndex: number,
    field: 'begin_time' | 'end_time',
    value: string
  ) => {
    if (!settings || !settings.schedule) return;
    const newDays = [...settings.schedule.days];
    const cur = newDays[dayIndex];
    const ranges = cur.time_ranges.length > 0
      ? [...cur.time_ranges]
      : [
          {
            begin_time: '00:00:00',
            end_time: '24:00:00',
            record_mode: 'CMR',
          },
        ];
    ranges[0] = { ...ranges[0], [field]: value };
    newDays[dayIndex] = { ...cur, time_ranges: ranges };
    setSettings({
      ...settings,
      schedule: { ...settings.schedule, days: newDays },
    });
  };

  const copyScheduleDayToAll = (dayIndex: number) => {
    if (!settings || !settings.schedule) return;
    const sourceRanges = settings.schedule.days[dayIndex].time_ranges;
    const newDays = settings.schedule.days.map((d) => ({
      ...d,
      time_ranges: sourceRanges.map((r) => ({ ...r })),
    }));
    setSettings({
      ...settings,
      schedule: { ...settings.schedule, days: newDays },
    });
  };

  const availableResolutions = capabilities?.supported_resolutions?.length
    ? capabilities.supported_resolutions
    : ['2560x1440', '2304x1296', '1920x1080', '1280x720'];

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center gap-2 text-slate-400 text-sm">
        <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
        <span>Loading snapshot capture configuration...</span>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="p-8 text-center bg-slate-900/40 rounded-xl border border-dashed border-slate-800">
        <Camera className="w-8 h-8 text-slate-600 mx-auto mb-2" />
        <p className="text-sm text-slate-400">Snapshot capture configuration not available for this camera.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {/* Top Header & Save Button */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white mb-0.5">Snapshot Capture</h3>
          <p className="text-xs text-slate-400">
            Configure periodic timing snapshots and event-triggered picture capture with weekly schedule.
          </p>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors disabled:opacity-50 cursor-pointer shadow-md"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Capture Settings
        </button>
      </div>

      {feedback && (
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 1. Timing Capture Card */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Timer className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white">Periodic Timing Capture</h4>
              <p className="text-xs text-slate-400">Takes snapshots automatically at a specified continuous interval</p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={settings.timing_capture.enabled}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  timing_capture: {
                    ...settings.timing_capture,
                    enabled: e.target.checked,
                  },
                })
              }
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-600"></div>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-300">Picture Resolution</label>
            <select
              value={settings.timing_capture.resolution || availableResolutions[0]}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  timing_capture: {
                    ...settings.timing_capture,
                    resolution: e.target.value,
                  },
                })
              }
              className="w-full bg-slate-950 text-white text-xs rounded-lg border border-slate-700 p-2 focus:outline-none focus:border-cyan-500"
            >
              {availableResolutions.map((res) => (
                <option key={res} value={res}>
                  {res}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-300">Picture Quality</label>
            <select
              value={settings.timing_capture.quality || 80}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  timing_capture: {
                    ...settings.timing_capture,
                    quality: parseInt(e.target.value) || 80,
                  },
                })
              }
              className="w-full bg-slate-950 text-white text-xs rounded-lg border border-slate-700 p-2 focus:outline-none focus:border-cyan-500"
            >
              <option value={40}>Low (40%)</option>
              <option value={60}>Medium (60%)</option>
              <option value={80}>High (80%)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-300">Capture Interval</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max="86400"
                value={Math.round((settings.timing_capture.interval_ms || 5000) / 1000)}
                onChange={(e) => {
                  const sec = parseInt(e.target.value) || 5;
                  setSettings({
                    ...settings,
                    timing_capture: {
                      ...settings.timing_capture,
                      interval_ms: sec * 1000,
                    },
                  });
                }}
                className="w-full bg-slate-950 text-white text-xs rounded-lg border border-slate-700 p-2 font-mono focus:outline-none focus:border-cyan-500"
              />
              <span className="text-xs text-slate-400 shrink-0">seconds</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Event Capture Card */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white">Event-Triggered Capture</h4>
              <p className="text-xs text-slate-400">Captures snapshots automatically when motion or smart alarms trigger</p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={settings.event_capture.enabled}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  event_capture: {
                    ...settings.event_capture,
                    enabled: e.target.checked,
                  },
                })
              }
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-600"></div>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-300">Picture Resolution</label>
            <select
              value={settings.event_capture.resolution || availableResolutions[0]}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  event_capture: {
                    ...settings.event_capture,
                    resolution: e.target.value,
                  },
                })
              }
              className="w-full bg-slate-950 text-white text-xs rounded-lg border border-slate-700 p-2 focus:outline-none focus:border-amber-500"
            >
              {availableResolutions.map((res) => (
                <option key={res} value={res}>
                  {res}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-300">Picture Quality</label>
            <select
              value={settings.event_capture.quality || 80}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  event_capture: {
                    ...settings.event_capture,
                    quality: parseInt(e.target.value) || 80,
                  },
                })
              }
              className="w-full bg-slate-950 text-white text-xs rounded-lg border border-slate-700 p-2 focus:outline-none focus:border-amber-500"
            >
              <option value={40}>Low (40%)</option>
              <option value={60}>Medium (60%)</option>
              <option value={80}>High (80%)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-300">Burst Interval</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="500"
                max="65535"
                step="500"
                value={settings.event_capture.interval_ms || 1000}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    event_capture: {
                      ...settings.event_capture,
                      interval_ms: parseInt(e.target.value) || 1000,
                    },
                  })
                }
                className="w-full bg-slate-950 text-white text-xs rounded-lg border border-slate-700 p-2 font-mono focus:outline-none focus:border-amber-500"
              />
              <span className="text-xs text-slate-400 shrink-0">ms</span>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-300">Picture Count</label>
            <select
              value={settings.event_capture.capture_count || 4}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  event_capture: {
                    ...settings.event_capture,
                    capture_count: parseInt(e.target.value) || 4,
                  },
                })
              }
              className="w-full bg-slate-950 text-white text-xs rounded-lg border border-slate-700 p-2 focus:outline-none focus:border-amber-500"
            >
              <option value={1}>1 snapshot</option>
              <option value={2}>2 snapshots</option>
              <option value={3}>3 snapshots</option>
              <option value={4}>4 snapshots</option>
              <option value={5}>5 snapshots</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. Capture Schedule Card (Track 103) */}
      {settings.schedule && (
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-white">Capture Schedule (Track 103)</h4>
                <p className="text-xs text-slate-400">Weekly schedule defining when picture snapshot capture is active</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSet24x7Schedule}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-medium transition-colors cursor-pointer"
              >
                24/7 All Days
              </button>
              <button
                type="button"
                onClick={handleClearSchedule}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded text-xs font-medium transition-colors cursor-pointer"
              >
                Clear All
              </button>
            </div>
          </div>

          {/* 7 Days Schedule Table */}
          <div className="space-y-2">
            {settings.schedule.days.map((day, idx) => {
              const hasRanges = day.time_ranges && day.time_ranges.length > 0;
              const range = hasRanges
                ? day.time_ranges[0]
                : { begin_time: '00:00:00', end_time: '24:00:00' };

              return (
                <div
                  key={day.day_of_week}
                  className={`p-2.5 rounded-lg border transition-colors flex flex-wrap items-center justify-between gap-3 text-xs ${
                    hasRanges
                      ? 'bg-slate-950/60 border-slate-800/90'
                      : 'bg-slate-950/20 border-slate-900/60 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-[110px]">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={hasRanges}
                        onChange={() => toggleScheduleDay(idx)}
                        className="sr-only peer"
                      />
                      <div className="w-7 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                    <span className={`font-medium ${hasRanges ? 'text-slate-200' : 'text-slate-500 line-through'}`}>
                      {DAY_NAMES[idx] || `Day ${day.day_of_week}`}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 bg-slate-900 px-2 py-1 rounded border border-slate-800">
                      <Clock className="w-3 h-3 text-slate-500" />
                      <input
                        type="text"
                        disabled={!hasRanges}
                        value={range.begin_time}
                        onChange={(e) => updateScheduleDayTime(idx, 'begin_time', e.target.value)}
                        placeholder="00:00:00"
                        className="w-16 bg-transparent text-center font-mono text-xs text-white focus:outline-none disabled:text-slate-600"
                      />
                      <span className="text-slate-600 font-bold">-</span>
                      <input
                        type="text"
                        disabled={!hasRanges}
                        value={range.end_time}
                        onChange={(e) => updateScheduleDayTime(idx, 'end_time', e.target.value)}
                        placeholder="24:00:00"
                        className="w-16 bg-transparent text-center font-mono text-xs text-white focus:outline-none disabled:text-slate-600"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => copyScheduleDayToAll(idx)}
                      title="Copy this day's schedule to all other days"
                      className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </form>
  );
};
