import React, { useEffect, useState } from 'react';
import { Calendar, Clock, Copy, Check, Save, Loader2, AlertCircle } from 'lucide-react';
import { api } from '../../../api';
import type { EventSchedule, DailySchedule } from '../../../types';

interface ArmingScheduleSectionProps {
  cameraId: number;
  eventType: string;
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

const DEFAULT_DAYS: DailySchedule[] = [1, 2, 3, 4, 5, 6, 7].map((d) => ({
  day_of_week: d,
  time_ranges: [{ begin_time: '00:00', end_time: '24:00' }],
}));

export const ArmingScheduleSection: React.FC<ArmingScheduleSectionProps> = ({
  cameraId,
  eventType,
  refreshKey,
  onRegisterRefresh,
}) => {
  const [schedule, setSchedule] = useState<EventSchedule | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const schedulesCacheRef = React.useRef<Record<string, EventSchedule>>({});
  const prevRefreshKeyRef = React.useRef<number | undefined>(refreshKey);
  const prevCameraIdRef = React.useRef<number>(cameraId);

  // Clear cache if camera changes
  if (prevCameraIdRef.current !== cameraId) {
    prevCameraIdRef.current = cameraId;
    schedulesCacheRef.current = {};
  }

  const fetchSchedule = React.useCallback(async (evType: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getEventSchedule(cameraId, evType);
      const daysMap = new Map<number, DailySchedule>();
      (res.days || []).forEach((d) => daysMap.set(d.day_of_week, d));
      const fullDays: DailySchedule[] = [1, 2, 3, 4, 5, 6, 7].map((dayNum) => {
        return (
          daysMap.get(dayNum) || {
            day_of_week: dayNum,
            time_ranges: [],
          }
        );
      });
      const fullSchedule = { event_type: evType, days: fullDays };
      schedulesCacheRef.current[evType] = fullSchedule;
      setSchedule(fullSchedule);
    } catch (err: any) {
      setError('Failed to load schedule: ' + (err.message || 'unknown error'));
      const fallback = { event_type: evType, days: DEFAULT_DAYS };
      schedulesCacheRef.current[evType] = fallback;
      setSchedule(fallback);
    } finally {
      setLoading(false);
    }
  }, [cameraId]);

  // Load schedule when eventType changes: use cache if already loaded, else fetch
  useEffect(() => {
    if (schedulesCacheRef.current[eventType]) {
      setSchedule(schedulesCacheRef.current[eventType]);
    } else {
      fetchSchedule(eventType);
    }
  }, [eventType, fetchSchedule]);

  // Reload when explicit refreshKey is triggered
  useEffect(() => {
    if (!refreshKey || refreshKey === prevRefreshKeyRef.current) return;
    prevRefreshKeyRef.current = refreshKey;
    delete schedulesCacheRef.current[eventType];
    fetchSchedule(eventType);
  }, [refreshKey, eventType, fetchSchedule]);

  // Register refresh callback for parent to await
  useEffect(() => {
    onRegisterRefresh?.(async () => {
      delete schedulesCacheRef.current[eventType];
      await fetchSchedule(eventType);
    });
  }, [onRegisterRefresh, eventType, fetchSchedule]);

  const handleSave = async () => {
    if (!schedule) return;
    setSaving(true);
    setFeedback(null);
    setError(null);
    try {
      await api.setEventSchedule(cameraId, eventType, schedule);
      schedulesCacheRef.current[eventType] = schedule;
      setFeedback('Arming schedule saved successfully');
      setTimeout(() => setFeedback(null), 3000);
    } catch (err: any) {
      setError('Failed to save schedule: ' + (err.message || 'unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const handleSet24x7 = () => {
    if (!schedule) return;
    const newDays: DailySchedule[] = [1, 2, 3, 4, 5, 6, 7].map((d) => ({
      day_of_week: d,
      time_ranges: [{ begin_time: '00:00', end_time: '24:00' }],
    }));
    setSchedule({ ...schedule, days: newDays });
  };

  const handleClearAll = () => {
    if (!schedule) return;
    const newDays: DailySchedule[] = [1, 2, 3, 4, 5, 6, 7].map((d) => ({
      day_of_week: d,
      time_ranges: [],
    }));
    setSchedule({ ...schedule, days: newDays });
  };

  const toggleDay = (dayIndex: number) => {
    if (!schedule) return;
    const newDays = [...schedule.days];
    const cur = newDays[dayIndex];
    if (cur.time_ranges && cur.time_ranges.length > 0) {
      newDays[dayIndex] = { ...cur, time_ranges: [] };
    } else {
      newDays[dayIndex] = {
        ...cur,
        time_ranges: [{ begin_time: '00:00', end_time: '24:00' }],
      };
    }
    setSchedule({ ...schedule, days: newDays });
  };

  const updateDayTime = (
    dayIndex: number,
    field: 'begin_time' | 'end_time',
    value: string
  ) => {
    if (!schedule) return;
    const newDays = [...schedule.days];
    const cur = newDays[dayIndex];
    const ranges = cur.time_ranges.length > 0
      ? [...cur.time_ranges]
      : [{ begin_time: '00:00', end_time: '24:00' }];
    ranges[0] = { ...ranges[0], [field]: value };
    newDays[dayIndex] = { ...cur, time_ranges: ranges };
    setSchedule({ ...schedule, days: newDays });
  };

  const copyToAll = (dayIndex: number) => {
    if (!schedule) return;
    const sourceRanges = schedule.days[dayIndex].time_ranges;
    const newDays = schedule.days.map((d) => ({
      ...d,
      time_ranges: sourceRanges.map((r) => ({ ...r })),
    }));
    setSchedule({ ...schedule, days: newDays });
  };

  if (loading) {
    return (
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-center gap-2 text-slate-400 text-xs">
        <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
        <span>Loading arming schedule...</span>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Calendar className="w-4 h-4" />
          </div>
          <div>
            <h5 className="text-xs font-semibold text-white">Arming Schedule</h5>
            <p className="text-[11px] text-slate-400">
              Configure active days and hours when detection triggers alarms
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSet24x7}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] font-medium transition-colors"
          >
            24/7 All Days
          </button>
          <button
            type="button"
            onClick={handleClearAll}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded text-[11px] font-medium transition-colors"
          >
            Clear All
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            Save Schedule
          </button>
        </div>
      </div>

      {feedback && (
        <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
          <Check className="w-3.5 h-3.5 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {error && (
        <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {schedule && (
        <div className="space-y-2">
          {schedule.days.map((day, idx) => {
            const hasRanges = day.time_ranges && day.time_ranges.length > 0;
            const range = hasRanges
              ? day.time_ranges[0]
              : { begin_time: '00:00', end_time: '24:00' };

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
                    <div className="w-7 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                  <span
                    className={`font-medium ${
                      hasRanges ? 'text-slate-200' : 'text-slate-500 line-through'
                    }`}
                  >
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
                      onChange={(e) => updateDayTime(idx, 'begin_time', e.target.value)}
                      placeholder="00:00"
                      className="w-14 bg-transparent text-center font-mono text-xs text-white focus:outline-none disabled:text-slate-600"
                    />
                    <span className="text-slate-600 font-bold">-</span>
                    <input
                      type="text"
                      disabled={!hasRanges}
                      value={range.end_time}
                      onChange={(e) => updateDayTime(idx, 'end_time', e.target.value)}
                      placeholder="24:00"
                      className="w-14 bg-transparent text-center font-mono text-xs text-white focus:outline-none disabled:text-slate-600"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => copyToAll(idx)}
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
      )}
    </div>
  );
};
