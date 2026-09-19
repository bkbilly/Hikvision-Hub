import React, { useState } from 'react';
import { HardDrive, RefreshCw, AlertTriangle, AlertCircle } from 'lucide-react';
import type { HddInfo } from '../../types';

interface StorageTabProps {
  storageList: HddInfo[];
  isRefreshingStorage: boolean;
  onRefreshStorage: () => void;
  formattingId: number | null;
  onFormatStorage: (id: number) => Promise<void>;
}

export const StorageTab: React.FC<StorageTabProps> = ({
  storageList,
  isRefreshingStorage,
  onRefreshStorage,
  formattingId,
  onFormatStorage,
}) => {
  const [formatConfirmItem, setFormatConfirmItem] = useState<HddInfo | null>(null);

  const formatCapacity = (mb: number) => {
    if (mb >= 1024 * 1024) {
      return `${(mb / (1024 * 1024)).toFixed(2)} TB`;
    }
    return `${(mb / 1024).toFixed(1)} GB`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white mb-1">Storage</h3>
          <p className="text-xs text-slate-400">Monitor on-camera SD card memory and attached network NAS (NFS / SMB) storage volumes.</p>
        </div>
        <button
          type="button"
          onClick={onRefreshStorage}
          disabled={isRefreshingStorage}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingStorage ? 'animate-spin text-blue-400' : 'text-slate-400'}`} />
          <span>Refresh</span>
        </button>
      </div>

      {storageList.length === 0 ? (
        <div className="p-8 text-center bg-slate-900/40 rounded-xl border border-dashed border-slate-800">
          <HardDrive className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-sm text-slate-400">No on-camera SD card or network NAS volumes detected.</p>
          <p className="text-xs text-slate-500 mt-1">If using network storage (NAS / NFS / SMB), ensure the storage share is mounted and formatted in camera settings.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {storageList.map((hdd) => {
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
            const isNormal = statusLower === 'normal' || statusLower === 'active' || statusLower === 'ok';
            const isFormatting = statusLower === 'formatting' || formattingId === hdd.id;
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
                    disabled={formattingId === hdd.id}
                    className="px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800 text-rose-300 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                  >
                    {formattingId === hdd.id ? 'Formatting...' : 'Format Volume'}
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
