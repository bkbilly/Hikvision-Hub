import React, { useState, useEffect, useMemo } from 'react';
import { Zap, Clock, AlertTriangle, AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import type { DeviceTime, NTPServer } from '../../types';
import { parseCameraTime, formatClockTime, formatTimeDifference } from '../../utils/date';

interface TimeTabProps {
  deviceTime: DeviceTime | null;
  deviceTimeFetchedAt: number;
  ntpServer: NTPServer | null;
  setNtpServer: React.Dispatch<React.SetStateAction<NTPServer | null>>;
  timeMode: 'manual' | 'NTP';
  onSwitchTimeMode: (mode: 'manual' | 'NTP') => void;
  isSyncingTime: boolean;
  onSyncTime: () => void;
  onSaveNTP: (e: React.FormEvent) => void;
  onRefreshTime?: () => void;
}

export const TimeTab: React.FC<TimeTabProps> = ({
  deviceTime,
  deviceTimeFetchedAt,
  ntpServer,
  setNtpServer,
  timeMode,
  onSwitchTimeMode,
  isSyncingTime,
  onSyncTime,
  onSaveNTP,
  onRefreshTime,
}) => {
  const [now, setNow] = useState<Date>(() => new Date());
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Refresh camera time when TimeTab mounts
  useEffect(() => {
    onRefreshTime?.();
  }, [onRefreshTime]);

  // Tick clock smoothly every second
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const baseCameraDate = useMemo(() => parseCameraTime(deviceTime?.local_time), [deviceTime?.local_time]);

  const currentCameraDate = useMemo(() => {
    if (!baseCameraDate) return null;
    const fetchTime = deviceTimeFetchedAt || now.getTime();
    const elapsedMs = Math.max(0, now.getTime() - fetchTime);
    return new Date(baseCameraDate.getTime() + elapsedMs);
  }, [baseCameraDate, now, deviceTimeFetchedAt]);

  const timeDiff = useMemo(() => {
    if (!currentCameraDate) {
      return { text: 'Loading...', isDifferent: false, diffSeconds: 0 };
    }
    return formatTimeDifference(currentCameraDate, now);
  }, [currentCameraDate, now]);

  const handleManualRefresh = async () => {
    if (!onRefreshTime || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await onRefreshTime();
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-white mb-1">Time</h3>
        <p className="text-xs text-slate-400">Keep camera timestamp accurate for exact recording seeking and OSD watermark alignment.</p>
      </div>

      {/* Live Camera Clock Box */}
      <div
        className={`p-4 rounded-xl transition-all ${
          timeDiff.isDifferent
            ? 'bg-gradient-to-r from-amber-950/40 via-slate-900/90 to-slate-900/80 border border-amber-500/50 shadow-md shadow-amber-950/20'
            : 'bg-gradient-to-r from-blue-950/40 to-slate-900/80 border border-blue-900/30'
        }`}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              {timeDiff.isDifferent ? (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="text-xs font-semibold text-amber-300">Current Camera Time (Time Desynchronized)</span>
                </>
              ) : (
                <>
                  <Clock className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span className="text-xs font-medium text-blue-300">Current Camera Time</span>
                </>
              )}
              {onRefreshTime && (
                <button
                  type="button"
                  onClick={handleManualRefresh}
                  disabled={isRefreshing}
                  title="Refresh time directly from camera"
                  className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-400' : ''}`} />
                </button>
              )}
            </div>

            <span className="text-xl font-bold font-mono text-white mt-1 block">
              {currentCameraDate
                ? formatClockTime(currentCameraDate)
                : deviceTime?.local_time
                ? deviceTime.local_time.replace('T', ' ')
                : 'Loading...'}
            </span>

            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {/* Difference in place of timezone */}
              <span
                className={`text-xs flex items-center gap-1.5 font-medium ${
                  timeDiff.isDifferent ? 'text-amber-300' : 'text-slate-300'
                }`}
                title={deviceTime?.time_zone ? `Camera Timezone: ${deviceTime.time_zone}` : undefined}
              >
                {timeDiff.isDifferent ? (
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                )}
                <span>Difference: {timeDiff.text}</span>
              </span>

              {timeDiff.isDifferent ? (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-900/60 text-amber-200 border border-amber-600/50 flex items-center gap-1">
                  ⚠️ Out of Sync
                </span>
              ) : (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-950/60 text-emerald-300 border border-emerald-700/50 flex items-center gap-1">
                  ✓ In Sync
                </span>
              )}

              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                  timeMode === 'NTP'
                    ? 'bg-green-900/60 text-green-300 border border-green-700/50'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}
              >
                {timeMode === 'NTP' ? '🌐 NTP' : '✋ Manual'}
              </span>
            </div>
          </div>

          {timeDiff.isDifferent && (
            <button
              type="button"
              onClick={onSyncTime}
              disabled={isSyncingTime}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 shadow-md shadow-amber-900/30 transition-all cursor-pointer disabled:opacity-50 shrink-0 self-start sm:self-center"
              title="Synchronize camera clock with browser time now"
            >
              <Zap className={`w-3.5 h-3.5 ${isSyncingTime ? 'animate-spin' : ''}`} />
              <span>{isSyncingTime ? 'Syncing...' : 'Sync to Browser Time'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Mode Switcher */}
      <div className="flex rounded-xl bg-slate-900 p-1 border border-slate-800 max-w-xs">
        <button
          type="button"
          onClick={() => timeMode !== 'manual' && onSwitchTimeMode('manual')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer ${
            timeMode === 'manual' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          ✋ Manual Time
        </button>
        <button
          type="button"
          onClick={() => timeMode !== 'NTP' && onSwitchTimeMode('NTP')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer ${
            timeMode === 'NTP' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          🌐 NTP Sync
        </button>
      </div>

      {/* Manual Mode: Sync from Browser */}
      {timeMode === 'manual' && (
        <div className="space-y-3 p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <div>
            <h4 className="text-xs font-semibold text-slate-200">Manual Time Sync</h4>
            <p className="text-xs text-slate-500 mt-0.5">
              The camera uses its internal clock. Click below to sync it with your browser's current time.
            </p>
          </div>
          <button
            type="button"
            onClick={onSyncTime}
            disabled={isSyncingTime}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white rounded-xl text-xs sm:text-sm font-medium flex items-center gap-2 shadow-lg shadow-blue-600/20 transition-all cursor-pointer"
          >
            <Zap className={`w-4 h-4 ${isSyncingTime ? 'animate-spin text-amber-300' : ''}`} />
            {isSyncingTime ? 'Synchronizing...' : '⚡ Sync with Browser Time'}
          </button>
        </div>
      )}

      {/* NTP Mode: Server Configuration */}
      {timeMode === 'NTP' && (
        <form onSubmit={onSaveNTP} className="space-y-4 p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <div>
            <h4 className="text-xs font-semibold text-slate-200">NTP Server Configuration</h4>
            <p className="text-xs text-slate-500 mt-0.5">
              The camera automatically synchronizes its clock with the configured NTP server on a regular interval.
            </p>
          </div>
          {ntpServer ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">NTP Server Host / IP</label>
                  <input
                    type="text"
                    value={ntpServer.host_name || ntpServer.ip_address || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNtpServer({
                        ...ntpServer,
                        host_name: val,
                        ip_address: val,
                      });
                    }}
                    placeholder="pool.ntp.org or 192.168.1.1"
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Port</label>
                  <input
                    type="number"
                    value={ntpServer.port_no || 123}
                    onChange={(e) => setNtpServer({ ...ntpServer, port_no: parseInt(e.target.value) || 123 })}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Sync Interval (minutes)</label>
                  <input
                    type="number"
                    value={ntpServer.synchronize_interval || 60}
                    onChange={(e) => setNtpServer({ ...ntpServer, synchronize_interval: parseInt(e.target.value) || 60 })}
                    className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              </div>
              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition-colors shadow-md shadow-blue-600/20 cursor-pointer"
                >
                  Save NTP Configuration
                </button>
              </div>
            </>
          ) : (
            <p className="text-xs text-slate-500">NTP not supported by this camera.</p>
          )}
        </form>
      )}
    </div>
  );
};
