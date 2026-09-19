import React from 'react';
import { Zap } from 'lucide-react';
import type { DeviceTime, NTPServer } from '../../types';

interface TimeTabProps {
  deviceTime: DeviceTime | null;
  ntpServer: NTPServer | null;
  setNtpServer: React.Dispatch<React.SetStateAction<NTPServer | null>>;
  timeMode: 'manual' | 'NTP';
  onSwitchTimeMode: (mode: 'manual' | 'NTP') => void;
  isSyncingTime: boolean;
  onSyncTime: () => void;
  onSaveNTP: (e: React.FormEvent) => void;
}

export const TimeTab: React.FC<TimeTabProps> = ({
  deviceTime,
  ntpServer,
  setNtpServer,
  timeMode,
  onSwitchTimeMode,
  isSyncingTime,
  onSyncTime,
  onSaveNTP,
}) => {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-white mb-1">Time</h3>
        <p className="text-xs text-slate-400">Keep camera timestamp accurate for exact recording seeking and OSD watermark alignment.</p>
      </div>

      {/* Live Camera Clock */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-blue-950/40 to-slate-900/80 border border-blue-900/30">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <span className="text-xs text-blue-300 font-medium block">Current Camera Time</span>
            <span className="text-xl font-bold font-mono text-white mt-1 block">
              {deviceTime?.local_time ? deviceTime.local_time.replace('T', ' ') : 'Loading...'}
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-slate-400">Timezone: {deviceTime?.time_zone || '—'}</span>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                timeMode === 'NTP' ? 'bg-green-900/60 text-green-300 border border-green-700/50' : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}>
                {timeMode === 'NTP' ? '🌐 NTP' : '✋ Manual'}
              </span>
            </div>
          </div>
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
                  <label className="block text-xs text-slate-400 mb-1">NTP Server Host</label>
                  <input
                    type="text"
                    value={ntpServer.host_name || ''}
                    onChange={(e) => setNtpServer({ ...ntpServer, host_name: e.target.value })}
                    placeholder="pool.ntp.org"
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
