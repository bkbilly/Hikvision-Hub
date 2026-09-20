import React from 'react';
import { RotateCw, ExternalLink } from 'lucide-react';
import type { Camera, DeviceInfo } from '../../types';
import { getFirmwarePortalInfo } from '../../utils/firmwarePortal';

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
  const portalInfo = getFirmwarePortalInfo(deviceInfo?.model || camera.name);

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
        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-1">
              <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold block">Firmware Version</span>
              {portalInfo.platform && (
                <span
                  className="px-1.5 py-0.5 text-[9px] font-medium rounded bg-blue-500/10 text-blue-300 border border-blue-500/20 truncate max-w-[140px]"
                  title={portalInfo.platform}
                >
                  {portalInfo.platform}
                </span>
              )}
            </div>
            <span className="text-sm font-mono text-blue-400 mt-0.5 block font-bold">{deviceInfo?.firmware_version || 'V5.x'}</span>
          </div>
          <div className="mt-2.5 pt-2 border-t border-slate-800/80">
            <a
              href={portalInfo.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 hover:underline transition-colors font-medium group cursor-pointer"
              title={`Download firmware for ${deviceInfo?.model || 'camera'} on Hikvision Europe portal`}
            >
              <span>Hikvision Europe Portal</span>
              <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </a>
          </div>
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

      {/* Firmware Portal Link Section */}
      <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-semibold text-white uppercase tracking-wider">Device Firmware Downloads</h4>
            {portalInfo.platform && (
              <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                {portalInfo.platform}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400">
            {portalInfo.isDirectMatch
              ? `Navigate directly to supported firmware downloads for ${deviceInfo?.model || 'this device'} on the official Hikvision Europe portal.`
              : 'Browse official firmware downloads on the Hikvision Europe portal.'}
          </p>
        </div>
        <a
          href={portalInfo.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg shadow-sm transition-colors cursor-pointer shrink-0"
        >
          <span>Open Firmware Portal</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
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
