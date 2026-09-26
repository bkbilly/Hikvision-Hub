import React, { useState, useEffect, useRef, useCallback } from 'react';
import type {
  Camera,
  CameraCapabilities,
  DeviceInfo,
  DeviceTime,
  HddInfo,
  ImageSettings,
  NTPServer,
  PTZPreset,
  StreamSettings,
} from '../types';
import { api } from '../api';
import {
  X,
  Camera as CameraIcon,
  Clock,
  Sun,
  Video,
  Shield,
  HardDrive,
  Terminal,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Navigation,
  Info,
} from 'lucide-react';

import { DeviceTab } from './camera-settings/DeviceTab';
import { TimeTab } from './camera-settings/TimeTab';
import { ImageTab } from './camera-settings/ImageTab';
import { VideoTab } from './camera-settings/VideoTab';
import { EventsTab } from './camera-settings/events/EventsTab';
import { StorageTab } from './camera-settings/StorageTab';
import { PtzTab } from './camera-settings/PtzTab';
import { RawIsapiTab } from './camera-settings/RawIsapiTab';

interface CameraSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  camera: Camera | null;
  onCameraUpdated?: () => void;
}

type TabType = 'device' | 'time' | 'image' | 'video' | 'events' | 'storage' | 'ptz' | 'raw';

export const CameraSettingsModal: React.FC<CameraSettingsModalProps> = ({
  isOpen,
  onClose,
  camera,
  onCameraUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('device');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<{ success: boolean; message: string } | null>(null);

  // Snapshot preview trigger
  const [snapshotKey, setSnapshotKey] = useState<number>(Date.now());

  // Capabilities
  const [capabilities, setCapabilities] = useState<CameraCapabilities | null>(null);

  // Device Info
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [isRebooting, setIsRebooting] = useState<boolean>(false);

  // Time & NTP
  const [deviceTime, setDeviceTime] = useState<DeviceTime | null>(null);
  const [deviceTimeFetchedAt, setDeviceTimeFetchedAt] = useState<number>(() => Date.now());
  const [ntpServer, setNtpServer] = useState<NTPServer | null>(null);
  const [isSyncingTime, setIsSyncingTime] = useState<boolean>(false);
  const [timeMode, setTimeMode] = useState<'manual' | 'NTP'>('manual');

  const cameraRef = useRef(camera);
  cameraRef.current = camera;

  // Image Settings
  const [imageSettings, setImageSettings] = useState<ImageSettings | null>(null);
  const [isSavingImage, setIsSavingImage] = useState<boolean>(false);

  // Video Streams (101 Main, 102 Sub)
  const [streamChannel, setStreamChannel] = useState<101 | 102>(101);
  const [mainStream, setMainStream] = useState<StreamSettings | null>(null);
  const [subStream, setSubStream] = useState<StreamSettings | null>(null);

  // Storage
  const [storageList, setStorageList] = useState<HddInfo[]>([]);
  const [formattingId, setFormattingId] = useState<number | null>(null);
  const [isRefreshingStorage, setIsRefreshingStorage] = useState<boolean>(false);

  // PTZ
  const [ptzPresets, setPtzPresets] = useState<PTZPreset[]>([]);

  // Refresh Key for sub-components
  const [refreshKey, setRefreshKey] = useState<number>(Date.now());

  // Raw ISAPI Console
  const [rawPath, setRawPath] = useState<string>('/ISAPI/System/deviceInfo');
  const [rawMethod, setRawMethod] = useState<'GET' | 'PUT' | 'POST'>('GET');
  const [rawBody, setRawBody] = useState<string>('');
  const [rawResult, setRawResult] = useState<string>('');
  const [rawLoading, setRawLoading] = useState<boolean>(false);

  // Track visited tabs to keep them mounted with hidden/block
  const [visitedTabs, setVisitedTabs] = useState<Set<TabType>>(() => new Set(['device']));
  const loadedTabsRef = useRef<Set<TabType>>(new Set());
  const prevCameraIdRef = useRef<number | null>(null);
  const wasOpenRef = useRef<boolean>(false);

  // Child refresh refs
  const eventsRefreshRef = useRef<(() => Promise<void>) | null>(null);
  const privacyRefreshRef = useRef<(() => Promise<void>) | null>(null);
  const storageRefreshRef = useRef<(() => Promise<void>) | null>(null);

  const refreshPreview = useCallback(() => {
    setSnapshotKey(Date.now());
  }, []);

  const refreshCameraTime = useCallback(async () => {
    const cam = cameraRef.current;
    if (!cam) return;
    try {
      const res = await api.getCameraTime(cam.id);
      setDeviceTime(res);
      setDeviceTimeFetchedAt(Date.now());
      if (res.time_mode === 'NTP') setTimeMode('NTP');
      else setTimeMode('manual');
    } catch (err) {
      console.warn('time refresh error', err);
    }
  }, []);

  const handleRefreshStorage = useCallback(async () => {
    const cam = cameraRef.current;
    if (!cam) return;
    setIsRefreshingStorage(true);
    try {
      const list = await api.getCameraStorage(cam.id);
      setStorageList(list || []);
    } catch (err: any) {
      console.warn('Storage refresh error', err);
    } finally {
      setIsRefreshingStorage(false);
    }
  }, []);

  const loadCurrentTabData = useCallback(async (tab: TabType, isExplicitRefresh: boolean = false) => {
    const cam = cameraRef.current;
    if (!cam) return;
    setIsLoading(true);
    setSaveStatus(null);

    try {
      switch (tab) {
        case 'device':
          await api.getCameraDeviceInfo(cam.id)
            .then(setDeviceInfo)
            .catch((err) => console.warn('device info error', err));
          break;

        case 'time':
          await Promise.allSettled([
            api.getCameraTime(cam.id).then((res) => {
              setDeviceTime(res);
              setDeviceTimeFetchedAt(Date.now());
              if (res.time_mode === 'NTP') setTimeMode('NTP');
              else setTimeMode('manual');
            }).catch((err) => console.warn('time error', err)),
            api.getCameraNTP(cam.id).then(setNtpServer).catch((err) => console.warn('ntp error', err)),
          ]);
          break;

        case 'image':
          refreshPreview();
          await api.getCameraImage(cam.id)
            .then(setImageSettings)
            .catch((err) => {
              console.warn('image error', err);
              setImageSettings((prev) => prev || {
                channel_id: 1,
                brightness: 50,
                contrast: 50,
                saturation: 50,
                sharpness: 50,
                ircut_filter_type: 'auto',
                wdr_mode: 'close',
                wdr_level: 50,
                image_flip_style: 'OFF',
                white_balance: 'auto',
                noise_reduce_level: 50,
                exposure_mode: 'auto',
              });
            });
          if (privacyRefreshRef.current) {
            await privacyRefreshRef.current().catch((err) => console.warn('privacy refresh error', err));
          }
          break;

        case 'video':
          await Promise.allSettled([
            api.getCameraStream(cam.id, 101).then(setMainStream).catch((err) => console.warn('stream 101 error', err)),
            api.getCameraStream(cam.id, 102).then(setSubStream).catch((err) => console.warn('stream 102 error', err)),
          ]);
          break;

        case 'events':
          if (isExplicitRefresh) {
            refreshPreview();
            setRefreshKey(Date.now());
            if (eventsRefreshRef.current) {
              await eventsRefreshRef.current().catch((err) => console.warn('events refresh error', err));
            }
          }
          break;

        case 'storage':
          if (isExplicitRefresh) {
            setRefreshKey(Date.now());
            if (storageRefreshRef.current) {
              await storageRefreshRef.current().catch((err) => console.warn('storage refresh error', err));
            } else {
              await handleRefreshStorage();
            }
          } else {
            await api.getCameraStorage(cam.id)
              .then((res) => setStorageList(res || []))
              .catch(() => setStorageList([]));
          }
          break;

        case 'ptz':
          await api.getPTZPresets(cam.id)
            .then((res) => setPtzPresets(res || []))
            .catch(() => setPtzPresets([]));
          break;

        case 'raw':
          break;
      }
    } finally {
      setIsLoading(false);
    }
  }, [handleRefreshStorage, refreshPreview]);

  // When activeTab changes: record as visited
  useEffect(() => {
    setVisitedTabs((prev) => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  // When modal opens or camera changes: reset state if new camera, probe capabilities, and load tab once
  useEffect(() => {
    if (!isOpen || !camera) {
      wasOpenRef.current = false;
      return;
    }

    const isNewCamera = camera.id !== prevCameraIdRef.current;
    const isJustOpened = !wasOpenRef.current;
    wasOpenRef.current = true;
    prevCameraIdRef.current = camera.id;

    if (isNewCamera || isJustOpened) {
      loadedTabsRef.current.clear();
      setVisitedTabs(new Set([activeTab]));
      setSaveStatus(null);
      api.getCameraCapabilities(camera.id)
        .then((caps) => { if (caps) setCapabilities(caps); })
        .catch((err) => console.warn('capabilities error', err));
    }

    if (!loadedTabsRef.current.has(activeTab)) {
      loadedTabsRef.current.add(activeTab);
      loadCurrentTabData(activeTab, false);
    }
  }, [isOpen, camera?.id, activeTab, loadCurrentTabData]);

  // Handlers for Save Operations
  const handleSyncTime = async () => {
    if (!camera) return;
    setIsSyncingTime(true);
    setSaveStatus(null);
    try {
      const now = new Date();
      const localIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
      const res = await api.syncCameraTime(camera.id, {
        client_time: localIso,
        timezone: '', // Let backend preserve camera's native timezone format to prevent 400 rejection
      });
      setSaveStatus({ success: true, message: res.message });
      const updatedTime = await api.getCameraTime(camera.id);
      setDeviceTime(updatedTime);
      setDeviceTimeFetchedAt(Date.now());
    } catch (err: any) {
      setSaveStatus({ success: false, message: err.message || 'Time sync failed' });
    } finally {
      setIsSyncingTime(false);
    }
  };

  const handleSaveNTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!camera || !ntpServer) return;
    setSaveStatus(null);
    try {
      const res = await api.setCameraNTP(camera.id, ntpServer);
      // Only switch the camera's timeMode to NTP if not already NTP
      if (timeMode !== 'NTP') {
        await api.setCameraTime(camera.id, {
          time_mode: 'NTP',
          local_time: deviceTime?.local_time || '',
          time_zone: deviceTime?.time_zone || '',
        });
        setTimeMode('NTP');
      }
      const updatedNTP = await api.getCameraNTP(camera.id);
      setNtpServer(updatedNTP);
      const updatedTime = await api.getCameraTime(camera.id);
      setDeviceTime(updatedTime);
      setDeviceTimeFetchedAt(Date.now());
      setSaveStatus({ success: true, message: res.message || 'NTP configuration updated successfully' });
    } catch (err: any) {
      setSaveStatus({ success: false, message: err.message || 'NTP save failed' });
    }
  };

  const handleSwitchTimeMode = async (newMode: 'manual' | 'NTP') => {
    if (!camera || !deviceTime) return;
    setSaveStatus(null);
    try {
      if (newMode === 'NTP') {
        // Save NTP server config if we have one, then switch mode
        if (ntpServer) {
          await api.setCameraNTP(camera.id, ntpServer);
        }
        await api.setCameraTime(camera.id, {
          time_mode: 'NTP',
          local_time: deviceTime.local_time || '',
          time_zone: deviceTime.time_zone || '',
        });
      } else {
        // Switch to manual — sync current browser time
        const now = new Date();
        const localIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
        await api.setCameraTime(camera.id, {
          time_mode: 'manual',
          local_time: localIso,
          time_zone: deviceTime.time_zone || '',
        });
      }
      setTimeMode(newMode);
      const updatedTime = await api.getCameraTime(camera.id);
      setDeviceTime(updatedTime);
      setDeviceTimeFetchedAt(Date.now());
      setSaveStatus({ success: true, message: `Time mode switched to ${newMode === 'NTP' ? 'NTP' : 'Manual'} successfully` });
    } catch (err: any) {
      setSaveStatus({ success: false, message: err.message || 'Failed to switch time mode' });
    }
  };

  const handleSaveImage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!camera || !imageSettings) return;
    setIsSavingImage(true);
    setSaveStatus(null);
    try {
      const res = await api.setCameraImage(camera.id, imageSettings);
      setSaveStatus({ success: true, message: res.message });
      // Immediately refresh preview and again after delay for hardware exposure to settle
      refreshPreview();
      setTimeout(refreshPreview, 1000);
      setTimeout(refreshPreview, 2500);
      // Fetch latest values to keep in sync with camera adjustments
      api.getCameraImage(camera.id)
        .then((updated) => setImageSettings(updated))
        .catch(() => {});
    } catch (err: any) {
      setSaveStatus({ success: false, message: err.message || 'Failed to save image settings' });
    } finally {
      setIsSavingImage(false);
    }
  };

  const handleSaveStream = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!camera) return;
    const targetStream = streamChannel === 101 ? mainStream : subStream;
    if (!targetStream) return;
    try {
      const res = await api.setCameraStream(camera.id, streamChannel, targetStream);
      setSaveStatus({ success: true, message: res.message });
    } catch (err: any) {
      setSaveStatus({ success: false, message: err.message || 'Failed to save stream' });
    }
  };

  const handleReboot = async () => {
    if (!camera) return;
    if (!confirm(`Are you sure you want to reboot '${camera.name}'? The camera will be offline for about 60 seconds.`)) {
      return;
    }
    setIsRebooting(true);
    try {
      const res = await api.rebootCamera(camera.id);
      setSaveStatus({ success: true, message: res.message });
    } catch (err: any) {
      setSaveStatus({ success: false, message: err.message || 'Reboot failed' });
    } finally {
      setIsRebooting(false);
    }
  };

  const handleExecuteFormat = async (hddId: number) => {
    if (!camera) return;
    setFormattingId(hddId);
    setSaveStatus(null);
    try {
      const res = await api.formatCameraStorage(camera.id, hddId);
      setSaveStatus({ success: true, message: res.message || 'Format initiated successfully' });
      handleRefreshStorage();
      setTimeout(handleRefreshStorage, 2500);
      setTimeout(handleRefreshStorage, 6000);
    } catch (err: any) {
      setSaveStatus({ success: false, message: err.message || 'Format failed' });
    } finally {
      setFormattingId(null);
    }
  };

  const handleRegisterEventsRefresh = useCallback((fn: () => Promise<void>) => {
    eventsRefreshRef.current = fn;
  }, []);

  const handleRegisterPrivacyRefresh = useCallback((fn: () => Promise<void>) => {
    privacyRefreshRef.current = fn;
  }, []);

  const handleRegisterStorageRefresh = useCallback((fn: () => Promise<void>) => {
    storageRefreshRef.current = fn;
  }, []);

  const handlePTZMove = async (pan: number, tilt: number, zoom: number) => {
    if (!camera) return;
    try {
      await api.ptzControl(camera.id, { pan, tilt, zoom });
    } catch (err: any) {
      console.warn('PTZ error', err);
    }
  };

  const handlePTZGoto = async (presetId: number) => {
    if (!camera) return;
    try {
      await api.ptzGoto(camera.id, presetId);
      setSaveStatus({ success: true, message: `Moving to preset #${presetId}` });
    } catch (err: any) {
      setSaveStatus({ success: false, message: err.message || 'PTZ Goto failed' });
    }
  };

  const handleExecuteRaw = async () => {
    if (!camera || !rawPath) return;
    setRawLoading(true);
    setRawResult('');
    try {
      const res = await api.proxyISAPI(
        camera.id,
        rawPath,
        rawMethod,
        rawMethod !== 'GET' ? rawBody : undefined
      );
      setRawResult(res.data || 'Success (empty response)');
    } catch (err: any) {
      setRawResult(`Error: ${err.message || err}`);
    } finally {
      setRawLoading(false);
    }
  };

  if (!isOpen || !camera) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="flex min-h-full items-start justify-center p-2 sm:p-4">
        <div className="relative w-full max-w-5xl glass-panel bg-slate-950 rounded-2xl border border-slate-800 shadow-2xl flex flex-col my-auto max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-slate-800 bg-slate-900/80 rounded-t-2xl shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                <CameraIcon className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-base sm:text-lg text-white">{camera.name}</h2>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                    ISAPI Connected
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-mono">{camera.ip}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => loadCurrentTabData(activeTab, true)}
                disabled={isLoading}
                title="Refresh Current Section"
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-blue-400' : ''}`} />
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Global Save / Feedback Alert */}
          {saveStatus && (
            <div
              className={`px-4 sm:px-6 py-2.5 text-xs sm:text-sm font-medium flex items-center justify-between border-b shrink-0 ${
                saveStatus.success
                  ? 'bg-emerald-950/70 border-emerald-800 text-emerald-300'
                  : 'bg-rose-950/70 border-rose-800 text-rose-300'
              }`}
            >
              <div className="flex items-center gap-2">
                {saveStatus.success ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                <span>{saveStatus.message}</span>
              </div>
              <button onClick={() => setSaveStatus(null)} className="text-xs opacity-75 hover:opacity-100 cursor-pointer">
                Dismiss
              </button>
            </div>
          )}

          {/* Main Content Layout: Tabs + Body */}
          <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
            {/* Vertical / Horizontal Navigation */}
            <div className="w-full md:w-56 border-b md:border-b-0 md:border-r border-slate-800 bg-slate-900/40 p-2 md:p-3 flex md:flex-col gap-1 overflow-x-auto md:overflow-y-auto shrink-0">
              <button
                onClick={() => { setActiveTab('device'); setSaveStatus(null); }}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all whitespace-nowrap text-left cursor-pointer ${
                  activeTab === 'device'
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                <Info className="w-4 h-4 shrink-0" />
                <span>Device</span>
              </button>

              <button
                onClick={() => { setActiveTab('time'); setSaveStatus(null); refreshCameraTime(); }}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all whitespace-nowrap text-left cursor-pointer ${
                  activeTab === 'time'
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                <Clock className="w-4 h-4 shrink-0" />
                <span>Time</span>
              </button>

              <button
                onClick={() => { setActiveTab('image'); setSaveStatus(null); }}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all whitespace-nowrap text-left cursor-pointer ${
                  activeTab === 'image'
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                <Sun className="w-4 h-4 shrink-0" />
                <span>Image</span>
              </button>

              <button
                onClick={() => { setActiveTab('events'); setSaveStatus(null); }}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all whitespace-nowrap text-left cursor-pointer ${
                  activeTab === 'events'
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                <Shield className="w-4 h-4 shrink-0" />
                <span>Events</span>
              </button>

              <button
                onClick={() => { setActiveTab('video'); setSaveStatus(null); }}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all whitespace-nowrap text-left cursor-pointer ${
                  activeTab === 'video'
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                <Video className="w-4 h-4 shrink-0" />
                <span>Streams</span>
              </button>

              <button
                onClick={() => { setActiveTab('storage'); setSaveStatus(null); }}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all whitespace-nowrap text-left cursor-pointer ${
                  activeTab === 'storage'
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                <HardDrive className="w-4 h-4 shrink-0" />
                <span>Storage</span>
              </button>

              {capabilities?.has_ptz && (
                <button
                  onClick={() => { setActiveTab('ptz'); setSaveStatus(null); }}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all whitespace-nowrap text-left cursor-pointer ${
                    activeTab === 'ptz'
                      ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 font-semibold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                  }`}
                >
                  <Navigation className="w-4 h-4 shrink-0" />
                  <span>PTZ</span>
                </button>
              )}

              <button
                onClick={() => { setActiveTab('raw'); setSaveStatus(null); }}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all whitespace-nowrap text-left cursor-pointer ${
                  activeTab === 'raw'
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                <Terminal className="w-4 h-4 shrink-0" />
                <span>Console</span>
              </button>
            </div>

            {/* Active Tab Body */}
            <div className="flex-1 min-h-0 p-4 sm:p-6 overflow-y-auto">
              {visitedTabs.has('device') && (
                <div className={activeTab === 'device' ? 'block' : 'hidden'}>
                  <DeviceTab
                    camera={camera}
                    deviceInfo={deviceInfo}
                    isRebooting={isRebooting}
                    onReboot={handleReboot}
                    onCapabilitiesUpdated={onCameraUpdated}
                  />
                </div>
              )}

              {visitedTabs.has('time') && (
                <div className={activeTab === 'time' ? 'block' : 'hidden'}>
                  <TimeTab
                    deviceTime={deviceTime}
                    deviceTimeFetchedAt={deviceTimeFetchedAt}
                    ntpServer={ntpServer}
                    setNtpServer={setNtpServer}
                    timeMode={timeMode}
                    onSwitchTimeMode={handleSwitchTimeMode}
                    isSyncingTime={isSyncingTime}
                    onSyncTime={handleSyncTime}
                    onSaveNTP={handleSaveNTP}
                    onRefreshTime={refreshCameraTime}
                  />
                </div>
              )}

              {visitedTabs.has('image') && (
                <div className={activeTab === 'image' ? 'block' : 'hidden'}>
                  <ImageTab
                    camera={camera}
                    snapshotKey={snapshotKey}
                    refreshKey={refreshKey}
                    imageSettings={imageSettings}
                    setImageSettings={setImageSettings}
                    onRefreshPreview={refreshPreview}
                    onSaveImage={handleSaveImage}
                    isSaving={isSavingImage}
                    capabilities={capabilities}
                    setSaveStatus={setSaveStatus}
                    onRegisterPrivacyRefresh={handleRegisterPrivacyRefresh}
                  />
                </div>
              )}

              {visitedTabs.has('events') && (
                <div className={activeTab === 'events' ? 'block' : 'hidden'}>
                  <EventsTab
                    camera={camera}
                    capabilities={capabilities}
                    setSaveStatus={setSaveStatus}
                    refreshKey={refreshKey}
                    onRegisterRefresh={handleRegisterEventsRefresh}
                    snapshotKey={snapshotKey}
                    onRefreshPreview={refreshPreview}
                  />
                </div>
              )}

              {visitedTabs.has('video') && (
                <div className={activeTab === 'video' ? 'block' : 'hidden'}>
                  <VideoTab
                    streamChannel={streamChannel}
                    setStreamChannel={setStreamChannel}
                    mainStream={mainStream}
                    setMainStream={setMainStream}
                    subStream={subStream}
                    setSubStream={setSubStream}
                    onSaveStream={handleSaveStream}
                  />
                </div>
              )}

              {visitedTabs.has('storage') && (
                <div className={activeTab === 'storage' ? 'block' : 'hidden'}>
                  <StorageTab
                    cameraId={camera.id}
                    storageList={storageList}
                    isRefreshingStorage={isRefreshingStorage}
                    onRefreshStorage={handleRefreshStorage}
                    formattingId={formattingId}
                    onFormatStorage={handleExecuteFormat}
                    capabilities={capabilities}
                    setSaveStatus={setSaveStatus}
                    refreshKey={refreshKey}
                    onRegisterStorageRefresh={handleRegisterStorageRefresh}
                  />
                </div>
              )}

              {visitedTabs.has('ptz') && (
                <div className={activeTab === 'ptz' ? 'block' : 'hidden'}>
                  <PtzTab
                    ptzPresets={ptzPresets}
                    onPTZMove={handlePTZMove}
                    onPTZGoto={handlePTZGoto}
                  />
                </div>
              )}

              {visitedTabs.has('raw') && (
                <div className={activeTab === 'raw' ? 'block' : 'hidden'}>
                  <RawIsapiTab
                    rawMethod={rawMethod}
                    setRawMethod={setRawMethod}
                    rawPath={rawPath}
                    setRawPath={setRawPath}
                    rawBody={rawBody}
                    setRawBody={setRawBody}
                    rawResult={rawResult}
                    rawLoading={rawLoading}
                    onExecuteRaw={handleExecuteRaw}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
