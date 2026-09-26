import React, { useState, useEffect, useRef, useCallback } from 'react';
import { HardDrive, AlertTriangle, AlertCircle, Clock, Copy, Check, Save, Loader2, Video, Camera, PieChart } from 'lucide-react';
import type { HddInfo, RecordSchedule, RecordScheduleDay, CameraCapabilities, StorageQuota } from '../../types';
import { api } from '../../api';
import { CaptureTab } from './CaptureTab';

interface StorageTabProps {
  cameraId?: number;
  storageList: HddInfo[];
  isRefreshingStorage?: boolean;
  onRefreshStorage: () => Promise<void> | void;
  formattingId: number | null;
  onFormatStorage: (id: number) => Promise<void>;
  capabilities?: CameraCapabilities | null;
  setSaveStatus?: React.Dispatch<React.SetStateAction<{ success: boolean; message: string } | null>>;
  refreshKey?: number;
  onRegisterStorageRefresh?: (fn: () => Promise<void>) => void;
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

const RECORD_MODE_LABELS: Record<string, string> = {
  CMR: 'Continuous',
  cmr: 'Continuous',
  MOTION: 'Motion',
  Motion: 'Motion',
  motion: 'Motion',
  ALARM: 'Alarm',
  Alarm: 'Alarm',
  alarm: 'Alarm',
  EDR: 'Motion | Alarm',
  edr: 'Motion | Alarm',
  'Motion | Alarm': 'Motion | Alarm',
  ALARMANDMOTION: 'Motion & Alarm',
  AlarmAndMotion: 'Motion & Alarm',
  'Motion & Alarm': 'Motion & Alarm',
  AllEvent: 'Event',
  allevent: 'Event',
  Event: 'Event',
  event: 'Event',
  pir: 'PIR Alarm',
  PIR: 'PIR Alarm',
  LineDetection: 'Line Crossing',
  linedetection: 'Line Crossing',
  FieldDetection: 'Intrusion',
  fielddetection: 'Intrusion',
  scenechangedetection: 'Scene Change',
  facedetection: 'Face Detection',
  unattendedBaggage: 'Unattended Baggage',
  attendedBaggage: 'Object Removal',
  regionEntrance: 'Region Entrance',
  regionExiting: 'Region Exiting',
};

const formatRecordMode = (mode: string): string => {
  if (RECORD_MODE_LABELS[mode]) return RECORD_MODE_LABELS[mode];
  const upper = mode.toUpperCase();
  if (RECORD_MODE_LABELS[upper]) return RECORD_MODE_LABELS[upper];
  return mode
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
};

export const StorageTab: React.FC<StorageTabProps> = ({
  cameraId,
  storageList,
  isRefreshingStorage: _isRefreshingStorage,
  onRefreshStorage,
  formattingId,
  onFormatStorage,
  capabilities,
  setSaveStatus,
  refreshKey,
  onRegisterStorageRefresh,
}) => {
  const [subTab, setSubTab] = useState<'drives' | 'recordings' | 'captures'>('drives');
  const [formatConfirmItem, setFormatConfirmItem] = useState<HddInfo | null>(null);

  // Track loaded sub-tabs so we only fetch data once when navigated to
  const loadedSubTabsRef = useRef<Set<string>>(new Set());
  const captureRefreshRef = useRef<(() => Promise<void>) | null>(null);
  const prevRefreshKeyRef = useRef<number | undefined>(refreshKey);

  // Record Schedule State
  const [recordSchedule, setRecordSchedule] = useState<RecordSchedule | null>(null);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleFeedback, setScheduleFeedback] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  // Storage Quota State (Video vs Picture Percentage Allocation)
  const [quota, setQuota] = useState<StorageQuota | null>(null);
  const [loadingQuota, setLoadingQuota] = useState(false);
  const [savingQuota, setSavingQuota] = useState(false);
  const [quotaFeedback, setQuotaFeedback] = useState<string | null>(null);
  const [quotaError, setQuotaError] = useState<string | null>(null);

  // Clear loaded tabs when camera changes
  useEffect(() => {
    loadedSubTabsRef.current.clear();
  }, [cameraId]);

  const fetchQuota = useCallback(async () => {
    if (!cameraId) return;
    setLoadingQuota(true);
    setQuotaError(null);
    try {
      const q = await api.getStorageQuota(cameraId);
      setQuota(q);
    } catch {
      setQuota(null);
    } finally {
      setLoadingQuota(false);
    }
  }, [cameraId]);

  const handleSaveQuota = async () => {
    if (!cameraId || !quota) return;
    setSavingQuota(true);
    setQuotaFeedback(null);
    setQuotaError(null);
    try {
      await api.setStorageQuota(cameraId, quota.video_quota_ratio, quota.picture_quota_ratio);
      setQuotaFeedback('Storage quota allocation saved successfully');
      setTimeout(() => setQuotaFeedback(null), 3000);
      fetchQuota();
    } catch (err: any) {
      setQuotaError('Failed to save storage quota: ' + (err.message || 'unknown error'));
    } finally {
      setSavingQuota(false);
    }
  };

  const handleSetVideoRatio = (videoRatio: number) => {
    if (!quota) return;
    const v = Math.max(0, Math.min(100, Math.round(videoRatio)));
    setQuota({
      ...quota,
      video_quota_ratio: v,
      picture_quota_ratio: 100 - v,
    });
  };

  const fetchSchedule = useCallback(async () => {
    if (!cameraId) return;
    setLoadingSchedule(true);
    setScheduleError(null);
    try {
      const res = await api.getRecordSchedule(cameraId, 1);
      const daysMap = new Map<number, RecordScheduleDay>();
      (res.days || []).forEach((d) => daysMap.set(d.day_of_week, d));
      const fullDays: RecordScheduleDay[] = [1, 2, 3, 4, 5, 6, 7].map((dayNum) => {
        return (
          daysMap.get(dayNum) || {
            day_of_week: dayNum,
            time_ranges: [],
          }
        );
      });
      setRecordSchedule({ ...res, days: fullDays });
    } catch (err: any) {
      setScheduleError('Failed to load record schedule: ' + (err.message || 'unknown error'));
    } finally {
      setLoadingSchedule(false);
    }
  }, [cameraId]);

  const handleRefreshActiveSubTab = useCallback(async () => {
    if (subTab === 'drives') {
      await Promise.allSettled([onRefreshStorage(), fetchQuota()]);
    } else if (subTab === 'recordings') {
      await fetchSchedule();
    } else if (subTab === 'captures') {
      if (captureRefreshRef.current) {
        await captureRefreshRef.current();
      }
    }
  }, [subTab, onRefreshStorage, fetchQuota, fetchSchedule]);

  useEffect(() => {
    onRegisterStorageRefresh?.(handleRefreshActiveSubTab);
  }, [onRegisterStorageRefresh, handleRefreshActiveSubTab]);

  // Load active subTab only once when switched to
  useEffect(() => {
    if (subTab === 'drives') {
      if (!loadedSubTabsRef.current.has('drives')) {
        loadedSubTabsRef.current.add('drives');
        onRefreshStorage();
        fetchQuota();
      }
    } else if (subTab === 'recordings') {
      if (!loadedSubTabsRef.current.has('recordings')) {
        loadedSubTabsRef.current.add('recordings');
        fetchSchedule();
      }
    } else if (subTab === 'captures') {
      loadedSubTabsRef.current.add('captures');
    }
  }, [subTab, onRefreshStorage, fetchQuota, fetchSchedule]);

  // Reload current subTab when refreshKey changes (top refresh button pressed)
  useEffect(() => {
    if (!refreshKey || refreshKey === prevRefreshKeyRef.current) return;
    prevRefreshKeyRef.current = refreshKey;
    handleRefreshActiveSubTab();
  }, [refreshKey, handleRefreshActiveSubTab]);

  const handleSaveSchedule = async () => {
    if (!cameraId || !recordSchedule) return;
    setSavingSchedule(true);
    setScheduleFeedback(null);
    setScheduleError(null);
    try {
      await api.setRecordSchedule(cameraId, recordSchedule, 1);
      setScheduleFeedback('Record schedule saved successfully');
      setTimeout(() => setScheduleFeedback(null), 3000);
    } catch (err: any) {
      setScheduleError('Failed to save record schedule: ' + (err.message || 'unknown error'));
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleSetPresetMode = (mode: 'CMR' | 'AllEvent') => {
    if (!recordSchedule) return;
    const newDays: RecordScheduleDay[] = [1, 2, 3, 4, 5, 6, 7].map((d) => ({
      day_of_week: d,
      time_ranges: [
        {
          begin_time: '00:00:00',
          end_time: '24:00:00',
          record_mode: mode,
        },
      ],
    }));
    setRecordSchedule({
      ...recordSchedule,
      enabled: true,
      enable_schedule: true,
      days: newDays,
    });
  };

  const handleClearSchedule = () => {
    if (!recordSchedule) return;
    const newDays: RecordScheduleDay[] = [1, 2, 3, 4, 5, 6, 7].map((d) => ({
      day_of_week: d,
      time_ranges: [],
    }));
    setRecordSchedule({
      ...recordSchedule,
      enable_schedule: false,
      days: newDays,
    });
  };

  const toggleDay = (dayIndex: number) => {
    if (!recordSchedule) return;
    const newDays = [...recordSchedule.days];
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
            record_mode: 'AllEvent',
          },
        ],
      };
    }
    setRecordSchedule({ ...recordSchedule, days: newDays });
  };

  const updateDayRange = (
    dayIndex: number,
    field: 'begin_time' | 'end_time' | 'record_mode',
    value: string
  ) => {
    if (!recordSchedule) return;
    const newDays = [...recordSchedule.days];
    const cur = newDays[dayIndex];
    const ranges = cur.time_ranges.length > 0
      ? [...cur.time_ranges]
      : [
          {
            begin_time: '00:00:00',
            end_time: '24:00:00',
            record_mode: 'AllEvent',
          },
        ];
    ranges[0] = { ...ranges[0], [field]: value };
    newDays[dayIndex] = { ...cur, time_ranges: ranges };
    setRecordSchedule({ ...recordSchedule, days: newDays });
  };

  const copyDayToAll = (dayIndex: number) => {
    if (!recordSchedule) return;
    const sourceRanges = recordSchedule.days[dayIndex].time_ranges;
    const newDays = recordSchedule.days.map((d) => ({
      ...d,
      time_ranges: sourceRanges.map((r) => ({ ...r })),
    }));
    setRecordSchedule({ ...recordSchedule, days: newDays });
  };

  const formatCapacity = (mb: number) => {
    if (mb >= 1024 * 1024) {
      return `${(mb / (1024 * 1024)).toFixed(2)} TB`;
    }
    return `${(mb / 1024).toFixed(1)} GB`;
  };

  return (
    <div className="space-y-6">
      {/* 3 Storage Sub-Tabs */}
      <div className="flex flex-wrap items-center gap-2 p-1.5 bg-slate-900/90 border border-slate-800 rounded-xl overflow-x-auto shadow-sm">
        <button
          type="button"
          onClick={() => setSubTab('drives')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
            subTab === 'drives'
              ? 'bg-blue-600 text-white shadow-md font-bold scale-[1.02]'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <HardDrive className={`w-3.5 h-3.5 ${subTab === 'drives' ? 'text-white' : 'text-blue-400'}`} />
          <span>Storage Drives &amp; Volumes</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('recordings')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
            subTab === 'recordings'
              ? 'bg-blue-600 text-white shadow-md font-bold scale-[1.02]'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Video className={`w-3.5 h-3.5 ${subTab === 'recordings' ? 'text-white' : 'text-blue-400'}`} />
          <span>Recordings</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('captures')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
            subTab === 'captures'
              ? 'bg-blue-600 text-white shadow-md font-bold scale-[1.02]'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Camera className={`w-3.5 h-3.5 ${subTab === 'captures' ? 'text-white' : 'text-blue-400'}`} />
          <span>Captures</span>
        </button>
      </div>

      {/* Recordings Sub-Tab */}
      <div className={subTab === 'recordings' ? 'block' : 'hidden'}>
        {cameraId ? (
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
          <div className="space-y-3 border-b border-slate-800/80 pb-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <Video className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">Record Schedule &amp; Parameters</h4>
                  <p className="text-xs text-slate-400">
                    Configure recording triggers, pre/post record buffers, and 7-day schedule.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-300">Record Schedule</span>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={Boolean(recordSchedule?.enabled && recordSchedule?.enable_schedule)}
                    onChange={(e) => {
                      if (recordSchedule) {
                        setRecordSchedule({
                          ...recordSchedule,
                          enabled: e.target.checked,
                          enable_schedule: e.target.checked,
                        });
                      }
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
                </label>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleSetPresetMode('CMR')}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-medium transition-colors cursor-pointer"
              >
                24/7 Continuous (CMR)
              </button>
              <button
                type="button"
                onClick={() => handleSetPresetMode('AllEvent')}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-medium transition-colors cursor-pointer"
              >
                24/7 Event/Motion
              </button>
              <button
                type="button"
                onClick={handleClearSchedule}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded text-xs font-medium transition-colors cursor-pointer"
              >
                Clear All
              </button>
              <button
                type="button"
                onClick={handleSaveSchedule}
                disabled={savingSchedule}
                className="px-3.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
              >
                {savingSchedule ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save Schedule
              </button>
            </div>
          </div>

          {scheduleFeedback && (
            <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
              <Check className="w-3.5 h-3.5 shrink-0" />
              <span>{scheduleFeedback}</span>
            </div>
          )}

          {scheduleError && (
            <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{scheduleError}</span>
            </div>
          )}

          {loadingSchedule ? (
            <div className="py-6 flex items-center justify-center gap-2 text-slate-400 text-xs">
              <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
              <span>Loading record schedule...</span>
            </div>
          ) : recordSchedule && (
            <div className="space-y-4">
              {/* Pre/Post Buffers */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-xs font-medium text-slate-300">Pre-Record</span>
                  <select
                    value={recordSchedule.pre_record_time_seconds}
                    onChange={(e) => setRecordSchedule({ ...recordSchedule, pre_record_time_seconds: parseInt(e.target.value) || 0 })}
                    className="bg-slate-950 text-white text-xs rounded border border-slate-700 px-2 py-1 focus:outline-none"
                  >
                    <option value={0}>No Pre-record</option>
                    <option value={5}>5 seconds</option>
                    <option value={10}>10 seconds</option>
                    <option value={15}>15 seconds</option>
                  </select>
                </div>

                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800">
                  <span className="text-xs font-medium text-slate-300">Post-Record</span>
                  <select
                    value={recordSchedule.post_record_time_seconds}
                    onChange={(e) => setRecordSchedule({ ...recordSchedule, post_record_time_seconds: parseInt(e.target.value) || 5 })}
                    className="bg-slate-950 text-white text-xs rounded border border-slate-700 px-2 py-1 focus:outline-none"
                  >
                    <option value={5}>5 seconds</option>
                    <option value={10}>10 seconds</option>
                    <option value={30}>30 seconds</option>
                    <option value={60}>1 minute</option>
                    <option value={120}>2 minutes</option>
                    <option value={300}>5 minutes</option>
                    <option value={600}>10 minutes</option>
                  </select>
                </div>
              </div>

              {/* 7 Days Schedule */}
              <div className="space-y-2">
                {recordSchedule.days.map((day, idx) => {
                  const hasRanges = day.time_ranges && day.time_ranges.length > 0;
                  const range = hasRanges
                    ? day.time_ranges[0]
                    : { begin_time: '00:00:00', end_time: '24:00:00', record_mode: 'AllEvent' };

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
                            onChange={() => toggleDay(idx)}
                            className="sr-only peer"
                          />
                          <div className="w-7 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                        <span className={`font-medium ${hasRanges ? 'text-slate-200' : 'text-slate-500 line-through'}`}>
                          {DAY_NAMES[idx] || `Day ${day.day_of_week}`}
                        </span>
                      </div>

                      <div className="flex items-center gap-2.5 flex-wrap">
                        <div className="flex items-center gap-1.5 bg-slate-900 px-2 py-1 rounded border border-slate-800">
                          <Clock className="w-3 h-3 text-slate-500" />
                          <input
                            type="text"
                            disabled={!hasRanges}
                            value={range.begin_time}
                            onChange={(e) => updateDayRange(idx, 'begin_time', e.target.value)}
                            placeholder="00:00:00"
                            className="w-16 bg-transparent text-center font-mono text-xs text-white focus:outline-none disabled:text-slate-600"
                          />
                          <span className="text-slate-600 font-bold">-</span>
                          <input
                            type="text"
                            disabled={!hasRanges}
                            value={range.end_time}
                            onChange={(e) => updateDayRange(idx, 'end_time', e.target.value)}
                            placeholder="24:00:00"
                            className="w-16 bg-transparent text-center font-mono text-xs text-white focus:outline-none disabled:text-slate-600"
                          />
                        </div>

                        {(() => {
                          const supported = recordSchedule.supported_record_modes && recordSchedule.supported_record_modes.length > 0
                            ? recordSchedule.supported_record_modes
                            : ['CMR', 'AllEvent'];
                          const modes = range.record_mode && !supported.includes(range.record_mode)
                            ? [range.record_mode, ...supported]
                            : supported;
                          return (
                            <select
                              disabled={!hasRanges}
                              value={range.record_mode || 'CMR'}
                              onChange={(e) => updateDayRange(idx, 'record_mode', e.target.value)}
                              className="bg-slate-900 text-xs text-slate-200 border border-slate-800 rounded px-2 py-1 focus:outline-none disabled:opacity-50"
                            >
                              {modes.map((mode) => (
                                <option key={mode} value={mode}>
                                  {formatRecordMode(mode)}
                                </option>
                              ))}
                            </select>
                          );
                        })()}

                        <button
                          type="button"
                          onClick={() => copyDayToAll(idx)}
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
        </div>
        ) : (
          <div className="p-8 text-center bg-slate-900/40 rounded-xl border border-dashed border-slate-800 text-slate-400 text-sm">
            Select a camera to configure record schedules.
          </div>
        )}
      </div>

      {/* Storage Drives & Volumes Sub-Tab */}
      <div className={subTab === 'drives' ? 'block space-y-4' : 'hidden'}>
        <div>
          <h3 className="text-sm font-semibold text-white mb-1">Storage Drives &amp; Volumes</h3>
          <p className="text-xs text-slate-400">Monitor on-camera SD card memory and attached network NAS (NFS / SMB) storage volumes.</p>
        </div>

        {/* Storage Quota Allocation (Video vs Picture Percentage) */}
        {loadingQuota ? (
          <div className="py-4 flex items-center justify-center gap-2 text-slate-400 text-xs bg-slate-900/40 rounded-xl border border-slate-800">
            <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
            <span>Loading storage quota allocation...</span>
          </div>
        ) : quota ? (
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <PieChart className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">Storage Quota Allocation</h4>
                  <p className="text-xs text-slate-400">
                    Set the percentage ratio between video recordings and picture captures.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSetVideoRatio(95)}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-medium transition-colors cursor-pointer"
                >
                  95% / 5%
                </button>
                <button
                  type="button"
                  onClick={() => handleSetVideoRatio(90)}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-medium transition-colors cursor-pointer"
                >
                  90% / 10%
                </button>
                <button
                  type="button"
                  onClick={() => handleSetVideoRatio(80)}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-medium transition-colors cursor-pointer"
                >
                  80% / 20%
                </button>
                <button
                  type="button"
                  onClick={() => handleSetVideoRatio(70)}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-medium transition-colors cursor-pointer"
                >
                  70% / 30%
                </button>
                <button
                  type="button"
                  onClick={handleSaveQuota}
                  disabled={savingQuota}
                  className="px-3.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
                >
                  {savingQuota ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save Quota
                </button>
              </div>
            </div>

            {quotaFeedback && (
              <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
                <Check className="w-3.5 h-3.5 shrink-0" />
                <span>{quotaFeedback}</span>
              </div>
            )}

            {quotaError && (
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{quotaError}</span>
              </div>
            )}

            {/* Visual Dual-Colored Percentage Split Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-medium">
                <span className="text-blue-400 flex items-center gap-1.5">
                  <Video className="w-3.5 h-3.5" />
                  Recordings: {quota.video_quota_ratio}%
                </span>
                <span className="text-indigo-400 flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5" />
                  Pictures: {quota.picture_quota_ratio}%
                </span>
              </div>

              <div className="w-full h-3.5 bg-slate-800 rounded-full overflow-hidden flex shadow-inner">
                <div
                  className="bg-blue-600 h-full transition-all duration-150"
                  style={{ width: `${quota.video_quota_ratio}%` }}
                  title={`Recordings: ${quota.video_quota_ratio}%`}
                />
                <div
                  className="bg-indigo-500 h-full transition-all duration-150"
                  style={{ width: `${quota.picture_quota_ratio}%` }}
                  title={`Pictures: ${quota.picture_quota_ratio}%`}
                />
              </div>

              {/* Slider for setting percentage */}
              <div className="pt-2">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 shrink-0 font-medium">Adjust Split:</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={quota.video_quota_ratio}
                    onChange={(e) => handleSetVideoRatio(Number(e.target.value))}
                    className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500 focus:outline-none"
                  />
                  <div className="flex items-center gap-1 shrink-0">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={quota.video_quota_ratio}
                      onChange={(e) => handleSetVideoRatio(Number(e.target.value))}
                      className="w-14 px-2 py-0.5 bg-slate-950 border border-slate-700 rounded text-center text-xs text-white font-mono focus:border-blue-500 focus:outline-none"
                    />
                    <span className="text-xs text-slate-400">% Video</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quota Volume Breakdown Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="p-3 rounded-lg bg-slate-950/60 border border-blue-500/20 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 font-medium flex items-center gap-1.5">
                    <Video className="w-3.5 h-3.5 text-blue-400" />
                    Record Quota Volume
                  </span>
                  <span className="font-bold text-blue-400 font-mono">{quota.video_quota_ratio}%</span>
                </div>
                {quota.total_video_volume_mb > 0 ? (
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span>Allocated: <span className="text-slate-200 font-mono">{formatCapacity(quota.total_video_volume_mb)}</span></span>
                    <span>Free: <span className="text-emerald-400 font-mono">{formatCapacity(quota.free_video_quota_mb)}</span></span>
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-500 italic">Volume calculated upon active recording</div>
                )}
              </div>

              <div className="p-3 rounded-lg bg-slate-950/60 border border-indigo-500/20 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 font-medium flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5 text-indigo-400" />
                    Picture Quota Volume
                  </span>
                  <span className="font-bold text-indigo-400 font-mono">{quota.picture_quota_ratio}%</span>
                </div>
                {quota.total_pic_volume_mb > 0 ? (
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span>Allocated: <span className="text-slate-200 font-mono">{formatCapacity(quota.total_pic_volume_mb)}</span></span>
                    <span>Free: <span className="text-emerald-400 font-mono">{formatCapacity(quota.free_pic_quota_mb)}</span></span>
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-500 italic">Volume calculated upon active capture</div>
                )}
              </div>
            </div>
          </div>
        ) : null}

      {(!Array.isArray(storageList) || storageList.length === 0) ? (
        <div className="p-8 text-center bg-slate-900/40 rounded-xl border border-dashed border-slate-800">
          <HardDrive className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-sm text-slate-400">No on-camera SD card or network NAS volumes detected.</p>
          <p className="text-xs text-slate-500 mt-1">If using network storage (NAS / NFS / SMB), ensure the storage share is mounted and formatted in camera settings.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {(Array.isArray(storageList) ? storageList : []).map((hdd) => {
            const isNAS = hdd.type?.toLowerCase().includes('nas') ||
              hdd.type?.toLowerCase().includes('nfs') ||
              hdd.type?.toLowerCase().includes('smb') ||
              hdd.type?.toLowerCase().includes('cifs') ||
              Boolean(hdd.host_name || hdd.path);

            const totalStr = formatCapacity(hdd.capacity_mb);
            const freeStr = formatCapacity(hdd.free_space_mb);
            const usedPercent = hdd.capacity_mb > 0
              ? Math.round(((hdd.capacity_mb - hdd.free_space_mb) / hdd.capacity_mb) * 100)
              : 0;

            const statusLower = (hdd.status || '').toLowerCase();
            const isFormatting = statusLower === 'formatting' || statusLower === 'formating' || formattingId === hdd.id;
            const isNormal = statusLower === 'normal' || statusLower === 'active' || statusLower === 'ok';
            const isUnformatted = statusLower === 'unformatted' || statusLower === 'not formatted';
            const isOffline = statusLower === 'offline' || statusLower === 'disconnected';

            return (
              <div key={hdd.id} className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl border ${
                      isNAS
                        ? 'bg-purple-500/10 border-purple-500/30 text-purple-400'
                        : 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                    }`}>
                      <HardDrive className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-white">
                          {hdd.name || (isNAS ? `NAS Drive ${hdd.id}` : `Storage Drive ${hdd.id}`)}
                        </h4>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${
                          isNAS
                            ? 'bg-purple-950/60 text-purple-300 border-purple-800/60'
                            : 'bg-blue-950/60 text-blue-300 border-blue-800/60'
                        }`}>
                          {hdd.type || (isNAS ? 'NAS' : 'SD Card')}
                        </span>
                        {hdd.property && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400 border border-slate-700">
                            {hdd.property}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                          isFormatting
                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/30 animate-pulse'
                            : isNormal
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : isUnformatted
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            : isOffline
                            ? 'bg-slate-800 text-slate-400 border-slate-700'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            isFormatting
                              ? 'bg-blue-400'
                              : isNormal
                              ? 'bg-emerald-400'
                              : isUnformatted
                              ? 'bg-amber-400'
                              : isOffline
                              ? 'bg-slate-400'
                              : 'bg-rose-400'
                          }`} />
                          {isFormatting ? 'Formatting...' : (hdd.status || 'Active')}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setFormatConfirmItem(hdd)}
                    disabled={isFormatting}
                    className="px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800 text-rose-300 text-xs font-medium rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isFormatting ? (
                      <span className="flex items-center gap-1.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
                        <span>Formatting...</span>
                      </span>
                    ) : (
                      'Format Volume'
                    )}
                  </button>
                </div>

                {(hdd.host_name || hdd.path) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 text-xs">
                    {hdd.host_name && (
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="text-slate-400 shrink-0">Server/Host:</span>
                        <span className="font-mono text-slate-200 truncate">{hdd.host_name}</span>
                      </div>
                    )}
                    {hdd.path && (
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="text-slate-400 shrink-0">Mount Path:</span>
                        <span className="font-mono text-slate-200 truncate">{hdd.path}</span>
                      </div>
                    )}
                  </div>
                )}

                {hdd.capacity_mb > 0 ? (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>Used: {usedPercent}%</span>
                      <span className="font-mono text-slate-300">{freeStr} free of {totalStr}</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                      <div
                        className={`h-full transition-all rounded-full ${
                          usedPercent > 90
                            ? 'bg-rose-500'
                            : usedPercent > 75
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(100, usedPercent)}%` }}
                      ></div>
                    </div>
                  </div>
                ) : (
                  <div className="pt-1 text-xs text-slate-400 italic">
                    Network storage attached. (Capacity info managed by remote share)
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      </div>

      {/* Captures Sub-Tab */}
      <div className={subTab === 'captures' ? 'block' : 'hidden'}>
        {cameraId ? (
          <CaptureTab
            cameraId={cameraId}
            capabilities={capabilities ?? null}
            setSaveStatus={setSaveStatus ?? (() => {})}
            refreshKey={refreshKey}
            onRegisterRefresh={(fn) => { captureRefreshRef.current = fn; }}
          />
        ) : (
          <div className="p-8 text-center bg-slate-900/40 rounded-xl border border-dashed border-slate-800 text-slate-400 text-sm">
            Select a camera to configure snapshot captures.
          </div>
        )}
      </div>

      {/* FORMAT STORAGE CONFIRMATION ALERT MODAL */}
      {formatConfirmItem && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-rose-800/80 rounded-2xl max-w-md w-full p-6 shadow-2xl shadow-rose-950/50 space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-xl shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-white">Confirm Volume Format</h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Are you sure you want to format <span className="font-semibold text-white">{formatConfirmItem.name || `Volume #${formatConfirmItem.id}`}</span>?
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-900/40 text-xs text-rose-200/90 space-y-1.5">
              <div className="font-semibold flex items-center gap-1.5 text-rose-300">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>Permanent Data Loss Warning</span>
              </div>
              <p className="text-[11px] leading-relaxed text-rose-200/80">
                This operation will permanently erase all video recordings, schedules, and snapshot images stored on this drive. This action cannot be reversed.
              </p>
              {(formatConfirmItem.host_name || formatConfirmItem.path) && (
                <div className="pt-1.5 mt-1.5 border-t border-rose-900/30 font-mono text-[11px] text-slate-300 space-y-0.5">
                  {formatConfirmItem.host_name && <div>Server: {formatConfirmItem.host_name}</div>}
                  {formatConfirmItem.path && <div>Mount: {formatConfirmItem.path}</div>}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setFormatConfirmItem(null)}
                disabled={formattingId !== null}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const item = formatConfirmItem;
                  setFormatConfirmItem(null);
                  await onFormatStorage(item.id);
                }}
                disabled={formattingId !== null}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-rose-600/30 transition-colors cursor-pointer"
              >
                Yes, Format Volume
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
