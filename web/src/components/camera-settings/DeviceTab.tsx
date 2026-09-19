import React from 'react';
import { RotateCw } from 'lucide-react';
import type { Camera, DeviceInfo } from '../../types';

interface DeviceTabProps {
  camera: Camera;
  deviceInfo: DeviceInfo | null;
  isRebooting: boolean;
  onReboot: () => void;
}

export const DeviceTab: React.FC<DeviceTabProps> = ({
  camera,
  deviceInfo,
  isRebooting,
  onReboot,
}) => {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-white mb-1">Device</h3>
        <p className="text-xs text-slate-400">View camera model, firmware versions, and system maintenance.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
          <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold block">Model</span>
          <span className="text-sm font-semibold text-white mt-0.5 block">{deviceInfo?.model || 'Hikvision Camera'}</span>
        </div>
        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
          <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold block">Device Name</span>
          <span className="text-sm font-semibold text-white mt-0.5 block">{deviceInfo?.device_name || camera.name}</span>
        </div>
        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
          <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold block">Firmware Version</span>
          <span className="text-sm font-mono text-blue-400 mt-0.5 block">{deviceInfo?.firmware_version || 'V5.x'}</span>
        </div>
        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
          <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold block">Serial Number</span>
          <span className="text-xs font-mono text-slate-300 mt-0.5 block truncate">{deviceInfo?.serial_number || 'N/A'}</span>
        </div>
        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
          <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold block">MAC Address</span>
          <span className="text-xs font-mono text-slate-300 mt-0.5 block">{deviceInfo?.mac_address || 'N/A'}</span>
        </div>
        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
          <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold block">Firmware Release Date</span>
          <span className="text-xs font-mono text-slate-300 mt-0.5 block">{deviceInfo?.firmware_released_date || 'N/A'}</span>
        </div>
      </div>

      {/* Maintenance Actions */}
      <div className="pt-4 border-t border-slate-800">
        <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">System Maintenance</h4>
        <div className="flex items-center justify-between p-4 rounded-xl bg-rose-950/20 border border-rose-900/40">
          <div>
            <h5 className="text-sm font-medium text-white">Restart Camera</h5>
            <p className="text-xs text-slate-400">Remotely reboots the camera hardware via ISAPI signal.</p>
          </div>
          <button
            type="button"
            onClick={onReboot}
            disabled={isRebooting}
            className="px-4 py-2 bg-rose-600/80 hover:bg-rose-600 text-white text-xs font-medium rounded-lg flex items-center gap-1.5 shadow-md transition-colors cursor-pointer"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isRebooting ? 'animate-spin' : ''}`} />
            {isRebooting ? 'Rebooting...' : 'Reboot Camera'}
          </button>
        </div>
      </div>
    </div>
  );
};
