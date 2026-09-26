import React, { useState, useEffect } from 'react';
import type { Camera, DiscoveredDevice, SystemStatus } from '../types';
import { api } from '../api';
import { 
  X, 
  Camera as CameraIcon, 
  Plus, 
  Trash2, 
  Edit2, 
  CheckCircle, 
  AlertCircle, 
  RefreshCw, 
  HardDrive, 
  Lock, 
  Activity, 
  Eye, 
  EyeOff,
  FolderSearch,
  Server,
  ChevronUp,
  ChevronDown,
  Sliders,
  Radio,
  Sparkles,
  Mic,
  Volume2,
  Layers,
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  cameras: Camera[];
  onCamerasUpdated: () => void;
  onOpenDeviceSettings?: (camera: Camera) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  cameras,
  onCamerasUpdated,
  onOpenDeviceSettings,
}) => {
  const [activeTab, setActiveTab] = useState<'cameras' | 'system' | 'security'>('cameras');
  const [editingCamera, setEditingCamera] = useState<Partial<Camera> | null>(null);
  const [cameraPassword, setCameraPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{
    success?: boolean;
    message?: string;
    has_audio_input?: boolean;
    has_audio_output?: boolean;
    has_sub_stream?: boolean;
  } | null>(null);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [pathDiscovery, setPathDiscovery] = useState<{ valid?: boolean; message?: string; dirs?: any[] } | null>(null);
  const [isDiscovering, setIsDiscovering] = useState<boolean>(false);

  // Auto-discovery state
  const [discoveredDevices, setDiscoveredDevices] = useState<DiscoveredDevice[]>([]);
  const [availablePaths, setAvailablePaths] = useState<string[]>([]);
  const [isScanningNetwork, setIsScanningNetwork] = useState<boolean>(false);
  const [isProbingIP, setIsProbingIP] = useState<boolean>(false);
  const [probeMessage, setProbeMessage] = useState<{ success?: boolean; text?: string } | null>(null);

  // System status state
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanMessage, setScanMessage] = useState<string>('');
  const [cacheMessage, setCacheMessage] = useState<string>('');

  // Password change state
  const [currentPass, setCurrentPass] = useState<string>('');
  const [newPass, setNewPass] = useState<string>('');
  const [confirmPass, setConfirmPass] = useState<string>('');
  const [passMessage, setPassMessage] = useState<{ success?: boolean; text?: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadSystemStatus();
      handleDiscoverNetwork();
    }
  }, [isOpen]);

  const loadSystemStatus = async () => {
    try {
      const res = await api.getSystemStatus();
      setSystemStatus(res.status);
      setIsScanning(res.is_scanning);
    } catch (err) {
      console.error('Failed to load system status', err);
    }
  };

  const handleDiscoverNetwork = async () => {
    setIsScanningNetwork(true);
    try {
      const res = await api.discoverCameras();
      setDiscoveredDevices(res.cameras || []);
      setAvailablePaths(res.available_paths || []);
    } catch (err) {
      console.error('Failed to discover cameras on network', err);
    } finally {
      setIsScanningNetwork(false);
    }
  };

  const handleSelectDiscoveredDevice = (dev: DiscoveredDevice) => {
    setEditingCamera((prev) => {
      const suggestedPath = prev?.path || (availablePaths.length === 1 ? availablePaths[0] : '');
      return {
        ...prev,
        name: dev.name || dev.model || prev?.name || '',
        ip: dev.ip,
        is_isapi: dev.is_isapi,
        path: suggestedPath,
      };
    });
    setTestResult(null);
    setPathDiscovery(null);
    setProbeMessage({
      success: true,
      text: `Auto-selected ${dev.model || dev.name} (${dev.ip}) • Protocol: ${dev.is_isapi ? 'Hikvision ISAPI' : dev.protocol}`,
    });
  };

  const handleProbeIP = async () => {
    if (!editingCamera?.ip) {
      alert('Please enter an IP address first');
      return;
    }
    setIsProbingIP(true);
    setProbeMessage(null);
    try {
      const res = await api.probeCamera({
        ip: editingCamera.ip,
        username: editingCamera.username || 'admin',
        password: cameraPassword || undefined,
      });
      if (res.success && res.device) {
        setEditingCamera((prev) => ({
          ...prev,
          name: prev?.name ? prev.name : (res.device?.name || res.device?.model || prev?.name),
          is_isapi: res.device?.is_isapi ?? prev?.is_isapi,
        }));
        setProbeMessage({
          success: true,
          text: `Identified: ${res.device.model || res.device.name} (${res.device.manufacturer}) ${res.already_added ? '• Already added' : '• Ready to add'}`,
        });
      } else {
        setProbeMessage({
          success: false,
          text: res.message || 'No camera responded on this IP',
        });
      }
    } catch (err: any) {
      setProbeMessage({
        success: false,
        text: err.message || 'Failed to detect camera at this IP',
      });
    } finally {
      setIsProbingIP(false);
    }
  };

  const handleSaveCamera = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCamera || !editingCamera.name) return;

    try {
      const payload = {
        ...editingCamera,
        password: cameraPassword || undefined,
      };

      if (editingCamera.id) {
        await api.updateCamera(editingCamera.id, payload);
      } else {
        await api.createCamera(payload);
      }

      setEditingCamera(null);
      setCameraPassword('');
      setTestResult(null);
      setPathDiscovery(null);
      setProbeMessage(null);
      handleDiscoverNetwork();
      onCamerasUpdated();
    } catch (err: any) {
      alert(err.message || 'Failed to save camera');
    }
  };

  const handleDeleteCamera = async (id: number) => {
    if (!confirm('Are you sure you want to delete this camera configuration?')) return;
    try {
      await api.deleteCamera(id);
      onCamerasUpdated();
    } catch (err: any) {
      alert(err.message || 'Failed to delete camera');
    }
  };

  const handleToggleEnabled = async (cam: Camera) => {
    try {
      await api.updateCamera(cam.id, {
        name: cam.name,
        ip: cam.ip,
        path: cam.path,
        username: cam.username,
        is_isapi: cam.is_isapi,
        sort_order: cam.sort_order,
        enabled: !cam.enabled,
      });
      onCamerasUpdated();
    } catch (err: any) {
      alert(err.message || 'Failed to update camera status');
    }
  };

  const handleMoveCamera = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= cameras.length) return;

    const newCameras = [...cameras];
    const [moved] = newCameras.splice(index, 1);
    newCameras.splice(targetIndex, 0, moved);

    const orderedIds = newCameras.map((c) => c.id);
    try {
      await api.reorderCameras(orderedIds);
      onCamerasUpdated();
    } catch (err: any) {
      alert(err.message || 'Failed to reorder cameras');
    }
  };

  const handleTestConnection = async () => {
    if (!editingCamera?.ip) {
      alert('Please enter a camera IP address first');
      return
    }
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await api.testConnection({
        ip: editingCamera.ip,
        username: editingCamera.username || 'admin',
        password: cameraPassword,
        is_isapi: !!editingCamera.is_isapi,
        camera_id: editingCamera.id,
      });
      setTestResult(res);
      if (res.success) {
        setEditingCamera((prev) => prev ? ({
          ...prev,
          is_isapi: res.is_isapi ?? prev.is_isapi,
          has_audio_input: res.has_audio_input ?? prev.has_audio_input,
          has_audio_output: res.has_audio_output ?? prev.has_audio_output,
          has_sub_stream: res.has_sub_stream ?? prev.has_sub_stream,
        }) : null);
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Test failed' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleDiscoverPath = async () => {
    if (!editingCamera?.path) {
      alert('Please enter a storage path first');
      return;
    }
    setIsDiscovering(true);
    setPathDiscovery(null);
    try {
      const res = await api.discoverPath(editingCamera.path);
      setPathDiscovery(res);
    } catch (err: any) {
      setPathDiscovery({ valid: false, message: err.message || 'Path error' });
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleTriggerRescan = async () => {
    try {
      const res = await api.triggerRescan();
      setScanMessage(res.message);
      setIsScanning(true);
      setTimeout(loadSystemStatus, 3000);
    } catch (err: any) {
      setScanMessage('Failed: ' + err.message);
    }
  };

  const handleClearCache = async () => {
    try {
      const res = await api.clearCache();
      setCacheMessage(res.message);
      loadSystemStatus();
    } catch (err: any) {
      setCacheMessage('Failed: ' + err.message);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPass !== confirmPass) {
      setPassMessage({ success: false, text: 'New passwords do not match' });
      return;
    }
    try {
      await api.changePassword({ current_password: currentPass, new_password: newPass });
      setPassMessage({ success: true, text: 'Password successfully changed' });
      setCurrentPass('');
      setNewPass('');
      setConfirmPass('');
    } catch (err: any) {
      setPassMessage({ success: false, text: err.message || 'Failed to update password' });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="relative w-full max-w-3xl glass-panel bg-slate-950 rounded-2xl border border-slate-800 shadow-2xl overflow-hidden my-auto max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-800 bg-slate-900/60 shrink-0">
          <div className="flex items-center gap-2">
            <CameraIcon className="w-5 h-5 text-blue-400" />
            <h2 className="font-bold text-base sm:text-lg text-white">Hub Configuration</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-900/40 px-4 sm:px-6 shrink-0 overflow-x-auto">
          <button
            onClick={() => { setActiveTab('cameras'); setEditingCamera(null); }}
            className={`flex items-center gap-2 py-3 px-3 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'cameras'
                ? 'border-blue-500 text-blue-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <CameraIcon className="w-4 h-4" />
            Cameras ({cameras.length})
          </button>
          <button
            onClick={() => setActiveTab('system')}
            className={`flex items-center gap-2 py-3 px-3 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'system'
                ? 'border-blue-500 text-blue-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Server className="w-4 h-4" />
            Storage & System
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`flex items-center gap-2 py-3 px-3 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'security'
                ? 'border-blue-500 text-blue-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Lock className="w-4 h-4" />
            Security & Auth
          </button>
        </div>

        {/* Modal Body Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 min-h-0 space-y-6">
          {/* TAB 1: CAMERAS */}
          {activeTab === 'cameras' && (
            <div>
              {editingCamera ? (
                /* Edit / Add Camera Form */
                <form onSubmit={handleSaveCamera} className="space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <h3 className="text-sm font-semibold text-white">
                      {editingCamera.id ? 'Edit Camera' : 'Add New Camera'}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setEditingCamera(null)}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      Back to list
                    </button>
                  </div>

                  {/* Auto-Discovery Network Panel (when adding new camera) */}
                  {!editingCamera.id && (
                    <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Radio className="w-4 h-4 text-blue-400 animate-pulse" />
                          <span className="text-xs font-semibold text-slate-200">
                            Auto-Discovered Cameras on Network
                          </span>
                          {discoveredDevices.length > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-900/60 text-blue-300 font-mono">
                              {discoveredDevices.length} found
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={handleDiscoverNetwork}
                          disabled={isScanningNetwork}
                          className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3 h-3 ${isScanningNetwork ? 'animate-spin text-blue-400' : ''}`} />
                          <span>{isScanningNetwork ? 'Scanning...' : 'Scan Again'}</span>
                        </button>
                      </div>

                      {isScanningNetwork && discoveredDevices.length === 0 && (
                        <div className="py-3 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                          <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
                          <span>Probing local network via SADP & ONVIF...</span>
                        </div>
                      )}

                      {discoveredDevices.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-0.5">
                          {discoveredDevices.map((dev) => {
                            const isSelected = editingCamera.ip === dev.ip;
                            return (
                              <button
                                key={dev.ip}
                                type="button"
                                onClick={() => handleSelectDiscoveredDevice(dev)}
                                className={`p-2.5 rounded-lg border text-left transition-all flex items-center justify-between gap-2 ${
                                  isSelected
                                    ? 'bg-blue-950/50 border-blue-500 ring-1 ring-blue-500/40'
                                    : dev.already_added
                                    ? 'bg-slate-900/40 border-slate-800/80 opacity-60 hover:opacity-100 hover:border-slate-700'
                                    : 'bg-slate-900/80 border-slate-700 hover:border-blue-500/60 hover:bg-slate-850'
                                }`}
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="font-semibold text-xs text-white truncate flex items-center gap-1.5">
                                    <span className="truncate">{dev.model || dev.name}</span>
                                    {dev.is_isapi && (
                                      <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-medium shrink-0">
                                        ISAPI
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-slate-400 font-mono mt-0.5 flex items-center gap-1.5 truncate">
                                    <span>{dev.ip}</span>
                                    {dev.mac && (
                                      <>
                                        <span>&bull;</span>
                                        <span className="text-[10px] text-slate-500 truncate">{dev.mac}</span>
                                      </>
                                    )}
                                  </div>
                                </div>

                                {dev.already_added ? (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 shrink-0 font-medium">
                                    {dev.existing_camera_name ? dev.existing_camera_name : 'Added'}
                                  </span>
                                ) : (
                                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-800 text-emerald-300 shrink-0 flex items-center gap-1 font-medium hover:bg-emerald-900">
                                    <Sparkles className="w-2.5 h-2.5" />
                                    Auto-fill
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {probeMessage && (
                        <div
                          className={`p-2 rounded-lg text-xs flex items-center gap-1.5 ${
                            probeMessage.success
                              ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800'
                              : 'bg-rose-950/60 text-rose-300 border border-rose-800'
                          }`}
                        >
                          {probeMessage.success ? (
                            <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                          ) : (
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          )}
                          <span>{probeMessage.text}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Camera Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={editingCamera.name || ''}
                        onChange={(e) => setEditingCamera({ ...editingCamera, name: e.target.value })}
                        placeholder="e.g. Front Entrance"
                        className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Camera IP Address *
                      </label>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          required
                          value={editingCamera.ip || ''}
                          onChange={(e) => setEditingCamera({ ...editingCamera, ip: e.target.value })}
                          placeholder="e.g. 192.168.1.160"
                          className="flex-1 bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
                        />
                        <button
                          type="button"
                          onClick={handleProbeIP}
                          disabled={isProbingIP || !editingCamera.ip}
                          title="Auto-detect model and ISAPI for this IP"
                          className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors disabled:opacity-40"
                        >
                          <Radio className={`w-3.5 h-3.5 ${isProbingIP ? 'animate-pulse text-blue-400' : ''}`} />
                          <span className="hidden sm:inline">{isProbingIP ? 'Detecting...' : 'Detect'}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Recording Storage Path (NFS/NAS/SD or info.bin) *
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        required
                        value={editingCamera.path || ''}
                        onChange={(e) => setEditingCamera({ ...editingCamera, path: e.target.value })}
                        placeholder="e.g. /mnt/hikvision/spicam1/info.bin"
                        className="flex-1 bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
                      />
                      <button
                        type="button"
                        onClick={handleDiscoverPath}
                        disabled={isDiscovering}
                        className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
                      >
                        <FolderSearch className="w-3.5 h-3.5" />
                        {isDiscovering ? 'Checking...' : 'Check Path'}
                      </button>
                    </div>
                    {availablePaths.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-slate-400">Available storage paths:</span>
                        {availablePaths.map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setEditingCamera({ ...editingCamera, path: p })}
                            title={p}
                            className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 hover:bg-blue-900/60 hover:text-blue-300 border border-slate-700 text-slate-300 transition-colors truncate max-w-[240px]"
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    )}
                    {pathDiscovery && (
                      <div className={`mt-2 p-2 rounded-lg text-xs flex items-center gap-1.5 ${
                        pathDiscovery.valid ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800' : 'bg-rose-950/60 text-rose-300 border border-rose-800'
                      }`}>
                        {pathDiscovery.valid ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                        <span>{pathDiscovery.message}</span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Camera Username
                      </label>
                      <input
                        type="text"
                        value={editingCamera.username || ''}
                        onChange={(e) => setEditingCamera({ ...editingCamera, username: e.target.value })}
                        placeholder="admin"
                        className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Camera Password {editingCamera.id ? '(Leave blank to keep unchanged)' : '*'}
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={cameraPassword}
                          onChange={(e) => setCameraPassword(e.target.value)}
                          placeholder={editingCamera.id ? '••••••••' : 'Enter camera password'}
                          className="w-full bg-slate-900 border border-slate-700/80 rounded-lg pl-3 pr-9 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-blue-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 pt-1">
                    <label className="flex items-center gap-2 cursor-pointer text-xs sm:text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={editingCamera.enabled !== false}
                        onChange={(e) => setEditingCamera({ ...editingCamera, enabled: e.target.checked })}
                        className="rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-0"
                      />
                      <span>Enabled</span>
                    </label>
                  </div>

                  {/* Test Connection Button & Result */}
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={isTesting}
                      className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors"
                    >
                      <Activity className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin text-blue-400' : ''}`} />
                      {isTesting ? 'Testing Camera...' : 'Test Live Connection'}
                    </button>

                    {testResult && (
                      <div className={`mt-2 p-2.5 rounded-lg text-xs space-y-1.5 ${
                        testResult.success ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800' : 'bg-rose-950/60 text-rose-300 border border-rose-800'
                      }`}>
                        <div className="flex items-center gap-1.5 font-medium">
                          {testResult.success ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                          <span>{testResult.message}</span>
                        </div>
                        {testResult.success && (
                          <div className="flex items-center gap-2 pt-1 border-t border-emerald-800/40 text-[11px] flex-wrap">
                            <span className={`px-2 py-0.5 rounded font-mono ${testResult.has_audio_input ? 'bg-emerald-900/80 text-emerald-200 border border-emerald-700/60' : 'bg-slate-800 text-slate-400'}`}>
                              Mic: {testResult.has_audio_input ? '✓ Yes' : '✗ None'}
                            </span>
                            <span className={`px-2 py-0.5 rounded font-mono ${testResult.has_audio_output ? 'bg-emerald-900/80 text-emerald-200 border border-emerald-700/60' : 'bg-slate-800 text-slate-400'}`}>
                              Speaker (Talkback): {testResult.has_audio_output ? '✓ Yes' : '✗ None'}
                            </span>
                            <span className={`px-2 py-0.5 rounded font-mono ${testResult.has_sub_stream ? 'bg-emerald-900/80 text-emerald-200 border border-emerald-700/60' : 'bg-slate-800 text-slate-400'}`}>
                              Sub-stream: {testResult.has_sub_stream ? '✓ Yes' : '✗ None'}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setEditingCamera(null)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs sm:text-sm font-medium transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs sm:text-sm font-medium shadow-md shadow-blue-600/20 transition-all"
                    >
                      Save Camera
                    </button>
                  </div>
                </form>
              ) : (
                /* Camera List */
                <div className="space-y-3">
                  {discoveredDevices.some((d) => !d.already_added) && (
                    <div className="p-3 bg-blue-950/40 border border-blue-800/80 rounded-xl flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-blue-900/60 flex items-center justify-center shrink-0 text-blue-400">
                          <Radio className="w-4 h-4 animate-pulse" />
                        </div>
                        <div className="text-xs min-w-0">
                          <span className="font-semibold text-blue-200 block">
                            {discoveredDevices.filter((d) => !d.already_added).length} unconfigured camera(s) detected on your network
                          </span>
                          <p className="text-[11px] text-slate-400 truncate">
                            {discoveredDevices
                              .filter((d) => !d.already_added)
                              .map((d) => `${d.model || d.name} (${d.ip})`)
                              .join(', ')}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const first = discoveredDevices.find((d) => !d.already_added);
                          if (first) {
                            setEditingCamera({
                              name: first.name || first.model,
                              ip: first.ip,
                              is_isapi: first.is_isapi,
                              path: availablePaths.length === 1 ? availablePaths[0] : '',
                              username: 'admin',
                              enabled: true,
                              sort_order: cameras.length,
                            });
                            setCameraPassword('');
                            setTestResult(null);
                            setPathDiscovery(null);
                            setProbeMessage({
                              success: true,
                              text: `Auto-selected ${first.model || first.name} (${first.ip}) • Protocol: ${first.is_isapi ? 'Hikvision ISAPI' : first.protocol}`,
                            });
                          }
                        }}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg shrink-0 transition-all shadow-md shadow-blue-600/20 flex items-center gap-1"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Quick Add
                      </button>
                    </div>
                  )}

                  <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                    <p className="text-xs text-slate-400">
                      Manage connected Hikvision/HiLook cameras and their local storage folders.
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleDiscoverNetwork}
                        disabled={isScanningNetwork}
                        title="Scan local network for cameras"
                        className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
                      >
                        <Radio className={`w-3.5 h-3.5 ${isScanningNetwork ? 'animate-pulse text-blue-400' : ''}`} />
                        <span>{isScanningNetwork ? 'Scanning...' : 'Scan Network'}</span>
                      </button>
                      <button
                        onClick={() => {
                          setEditingCamera({
                            name: '',
                            path: availablePaths.length === 1 ? availablePaths[0] : '',
                            ip: '',
                            username: 'admin',
                            enabled: true,
                            sort_order: cameras.length,
                          });
                          setCameraPassword('');
                          setTestResult(null);
                          setPathDiscovery(null);
                          setProbeMessage(null);
                          if (discoveredDevices.length === 0) {
                            handleDiscoverNetwork();
                          }
                        }}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg flex items-center gap-1.5 shadow-md transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Camera
                      </button>
                    </div>
                  </div>

                  {cameras.length === 0 ? (
                    <div className="p-8 text-center bg-slate-900/40 rounded-xl border border-dashed border-slate-800">
                      <CameraIcon className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                      <p className="text-sm text-slate-400">No cameras added yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {cameras.map((c, index) => (
                        <div
                          key={c.id}
                          className="flex items-center justify-between p-3 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {/* Reorder Arrows */}
                            <div className="flex flex-col gap-0.5 shrink-0">
                              <button
                                type="button"
                                disabled={index === 0}
                                onClick={() => handleMoveCamera(index, 'up')}
                                title="Move Up"
                                className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded disabled:opacity-20 disabled:hover:bg-transparent transition-colors"
                              >
                                <ChevronUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={index === cameras.length - 1}
                                onClick={() => handleMoveCamera(index, 'down')}
                                title="Move Down"
                                className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded disabled:opacity-20 disabled:hover:bg-transparent transition-colors"
                              >
                                <ChevronDown className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${c.enabled ? 'bg-emerald-500' : 'bg-slate-600'}`} />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-semibold text-sm text-white truncate">{c.name}</span>
                                {c.has_audio_input && (
                                  <span title="Camera has microphone (audio supported)" className="p-0.5 rounded bg-blue-950/80 border border-blue-800/60 text-blue-300">
                                    <Mic className="w-3 h-3" />
                                  </span>
                                )}
                                {c.has_audio_output && (
                                  <span title="Camera has speaker (two-way audio supported)" className="p-0.5 rounded bg-emerald-950/80 border border-emerald-800/60 text-emerald-300">
                                    <Volume2 className="w-3 h-3" />
                                  </span>
                                )}
                                {c.has_sub_stream && (
                                  <span title="Dual-stream supported (sub-stream channel 102)" className="p-0.5 rounded bg-indigo-950/80 border border-indigo-800/60 text-indigo-300">
                                    <Layers className="w-3 h-3" />
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2">
                                <span>{c.ip}</span>
                                <span>&bull;</span>
                                <span className="truncate max-w-[160px] sm:max-w-xs">{c.path}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {onOpenDeviceSettings && (
                              <button
                                type="button"
                                onClick={() => {
                                  onClose();
                                  onOpenDeviceSettings(c);
                                }}
                                title="On-Camera Hardware & Image Settings (ISAPI)"
                                className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1 text-xs"
                              >
                                <Sliders className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleToggleEnabled(c)}
                              title={c.enabled ? "Disable Camera" : "Enable Camera"}
                              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                c.enabled ? 'bg-emerald-600' : 'bg-slate-700'
                              }`}
                            >
                              <span
                                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                  c.enabled ? 'translate-x-4' : 'translate-x-0'
                                }`}
                              />
                            </button>
                            <button
                              onClick={() => {
                                setEditingCamera(c);
                                setCameraPassword('');
                                setTestResult(null);
                                setPathDiscovery(null);
                              }}
                              title="Edit Camera"
                              className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded-lg transition-colors"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteCamera(c.id)}
                              title="Delete Camera"
                              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: SYSTEM & STORAGE */}
          {activeTab === 'system' && (
            <div className="space-y-4">
              {systemStatus && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-xs text-slate-400 block">Version</span>
                    <span className="text-base font-bold text-white">v{systemStatus.version}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-xs text-slate-400 block">Indexed Events</span>
                    <span className="text-base font-bold text-blue-400">{systemStatus.event_count.toLocaleString()}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-xs text-slate-400 block">Video Cache</span>
                    <span className="text-base font-bold text-amber-400">{systemStatus.cache_size_mb} MB</span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="text-xs text-slate-400 block">FFmpeg Engine</span>
                    <span className="text-xs font-semibold text-emerald-400 truncate block">
                      {systemStatus.has_ffmpeg ? 'Ready' : 'Missing'}
                    </span>
                  </div>
                </div>
              )}

              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-blue-400" />
                  Storage Crawler & Indexing
                </h4>
                <p className="text-xs text-slate-400">
                  Crawl all configured camera storage directories to index new motion and recording events into the SQLite database.
                </p>
                <button
                  onClick={handleTriggerRescan}
                  disabled={isScanning}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 shadow-md transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                  {isScanning ? 'Scan in Progress...' : 'Rescan Storage Now'}
                </button>
                {scanMessage && (
                  <p className="text-xs text-blue-400 mt-1 font-mono">{scanMessage}</p>
                )}
              </div>

              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
                <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-amber-400" />
                  Transcoded Video Cache
                </h4>
                <p className="text-xs text-slate-400">
                  Temporary transcoded and remuxed MP4 clips generated during playback can be cleared to free up disk space.
                </p>
                <button
                  onClick={handleClearCache}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors"
                >
                  Clear Video Cache
                </button>
                {cacheMessage && (
                  <p className="text-xs text-emerald-400 mt-1 font-mono">{cacheMessage}</p>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: SECURITY & AUTH */}
          {activeTab === 'security' && (
            <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
              <h4 className="text-sm font-semibold text-white">Change Admin Password</h4>
              <p className="text-xs text-slate-400">
                Update your administrator credentials for logging into the web interface.
              </p>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Current Password
                </label>
                <input
                  type="password"
                  required
                  value={currentPass}
                  onChange={(e) => setCurrentPass(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  required
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  required
                  value={confirmPass}
                  onChange={(e) => setConfirmPass(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              {passMessage && (
                <div className={`p-2 rounded-lg text-xs flex items-center gap-1.5 ${
                  passMessage.success ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800' : 'bg-rose-950/60 text-rose-300 border border-rose-800'
                }`}>
                  {passMessage.success ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  <span>{passMessage.text}</span>
                </div>
              )}

              <button
                type="submit"
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs sm:text-sm font-medium shadow-md transition-all"
              >
                Update Password
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
