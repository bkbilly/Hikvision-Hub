import React, { useState, useEffect, useRef } from 'react';
import type { Camera, CameraEvent } from '../types';
import { api } from '../api';
import { isDemoMode } from '../demo/demoMode';
import { 
  RefreshCw, 
  Maximize2, 
  Play, 
  Pause,
  WifiOff, 
  Settings2,
  Sliders,
  Footprints,
  Crosshair,
  ShieldAlert,
  EyeOff,
  Activity,
  Mic,
  Volume2,
  X
} from 'lucide-react';
import { TalkButton } from './TalkButton';
import { LiveAudioPlayer } from './LiveAudioPlayer';

interface LiveGridProps {
  cameras: Camera[];
  onSelectCameraForPlayback: (camera: Camera) => void;
  onOpenSettings: () => void;
  onOpenDeviceSettings?: (camera: Camera) => void;
  isPaused?: boolean;
  activeEventMap?: Record<number, CameraEvent[]>;
}

interface LiveStreamViewProps {
  cameraId: number;
  cameraName: string;
  isPaused: boolean;
  stream?: number;
  className?: string;
}

export const LiveStreamView: React.FC<LiveStreamViewProps> = ({
  cameraId,
  cameraName,
  isPaused,
  stream,
  className = "w-full h-full object-cover select-none",
}) => {
  const [frameSrc, setFrameSrc] = useState<string>(() => api.getSnapshotUrl(cameraId));
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [isReconnecting, setIsReconnecting] = useState<boolean>(false);
  const prevBlobUrlRef = useRef<string>('');
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (isPaused) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsReconnecting(false);
      return;
    }

    let isMounted = true;
    let reconnectTimeout: any = null;
    let retryAttempts = 0;

    if (isDemoMode()) {
      setIsOffline(false);
      setIsReconnecting(false);
      const interval = setInterval(() => {
        if (!isMounted || isPaused) return;
        setFrameSrc(api.getSnapshotUrl(cameraId));
      }, 1000);
      return () => {
        isMounted = false;
        clearInterval(interval);
      };
    }

    const connect = () => {
      if (!isMounted || isPaused) return;

      const wsUrl = api.getLiveWsUrl(cameraId, stream);
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isMounted) return;
        setIsOffline(false);
        setIsReconnecting(false);
        retryAttempts = 0;
      };

      ws.onmessage = (event) => {
        if (!isMounted) return;
        if (event.data instanceof ArrayBuffer) {
          const blob = new Blob([event.data], { type: 'image/jpeg' });
          const newUrl = URL.createObjectURL(blob);
          setFrameSrc(newUrl);
          if (prevBlobUrlRef.current && prevBlobUrlRef.current.startsWith('blob:')) {
            URL.revokeObjectURL(prevBlobUrlRef.current);
          }
          prevBlobUrlRef.current = newUrl;
          setIsOffline(false);
          setIsReconnecting(false);
        }
      };

      ws.onerror = () => {};

      ws.onclose = () => {
        if (!isMounted || isPaused) return;
        if (retryAttempts < 8) {
          setIsReconnecting(true);
          retryAttempts++;
          const delay = Math.min(retryAttempts * 1000, 3000);
          reconnectTimeout = setTimeout(connect, delay);
        } else {
          setIsOffline(true);
          setIsReconnecting(false);
        }
      };
    };

    connect();

    return () => {
      isMounted = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [cameraId, isPaused, stream]);

  // Revoke Blob URL on final unmount
  useEffect(() => {
    return () => {
      if (prevBlobUrlRef.current && prevBlobUrlRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(prevBlobUrlRef.current);
        prevBlobUrlRef.current = '';
      }
    };
  }, []);

  if (isOffline && !frameSrc) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 text-slate-500 p-4 text-center w-full h-full bg-slate-950">
        <WifiOff className="w-8 h-8 text-rose-500/80" />
        <span className="text-xs font-medium text-slate-400">Camera Feed Offline</span>
        <button
          onClick={() => {
            setIsOffline(false);
            setIsReconnecting(true);
          }}
          className="mt-1 px-3 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors cursor-pointer"
        >
          Retry Feed
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-slate-950 overflow-hidden">
      {frameSrc ? (
        <img
          src={frameSrc}
          alt={cameraName}
          className={`${className} ${isPaused ? 'brightness-90' : ''}`}
        />
      ) : (
        <div className="w-full h-full bg-slate-950 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin" />
        </div>
      )}
      {isPaused && (
        <div className="absolute inset-0 bg-slate-950/20 backdrop-blur-[0.5px] flex items-center justify-center pointer-events-none transition-all">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/85 border border-slate-700/80 text-slate-300 text-xs font-semibold shadow-xl">
            <Pause className="w-3.5 h-3.5 text-amber-400 fill-current" />
            <span>Paused</span>
          </div>
        </div>
      )}
      {!isPaused && isReconnecting && (
        <div className="absolute top-10 right-2.5 px-2 py-0.5 rounded-md bg-amber-950/90 border border-amber-600/80 text-[10px] font-semibold text-amber-300 shadow-lg animate-pulse z-20">
          Reconnecting...
        </div>
      )}
    </div>
  );
};

interface CameraCardProps {
  cam: Camera;
  refreshKey: number;
  isPaused: boolean;
  onTogglePause?: (cameraId: number) => void;
  onSelectForPlayback: (cam: Camera) => void;
  onFullscreen: (cam: Camera) => void;
  onOpenDeviceSettings?: (cam: Camera) => void;
  activeEvents?: CameraEvent[];
}

const CameraCard: React.FC<CameraCardProps> = ({
  cam,
  refreshKey,
  isPaused,
  onTogglePause,
  onSelectForPlayback,
  onFullscreen,
  onOpenDeviceSettings,
  activeEvents = [],
}) => {
  const hasActiveEvent = activeEvents.length > 0;
  const primaryEvent = hasActiveEvent ? activeEvents[0] : null;

  let ringClass = '';

  if (primaryEvent) {
    if (primaryEvent.event_type === 'intrusion' || primaryEvent.event_type === 'tamper' || primaryEvent.event_type === 'videoloss') {
      ringClass = 'ring-2 ring-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.35)]';
    } else {
      ringClass = 'ring-2 ring-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.35)]';
    }
  }

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'motion': return <Footprints className="w-3 h-3" />;
      case 'line_crossing': return <Crosshair className="w-3 h-3" />;
      case 'intrusion': return <ShieldAlert className="w-3 h-3" />;
      case 'tamper': return <EyeOff className="w-3 h-3" />;
      case 'videoloss': return <WifiOff className="w-3 h-3" />;
      default: return <Activity className="w-3 h-3" />;
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case 'intrusion': return 'bg-rose-500/30 border-rose-500/80 text-rose-200';
      case 'line_crossing': return 'bg-cyan-500/30 border-cyan-500/80 text-cyan-200';
      case 'tamper': return 'bg-purple-500/30 border-purple-500/80 text-purple-200';
      case 'videoloss': return 'bg-red-500/30 border-red-500/80 text-red-200';
      default: return 'bg-amber-500/30 border-amber-500/80 text-amber-200';
    }
  };

  const getShortLabel = (type: string) => {
    switch (type) {
      case 'motion': return 'Motion';
      case 'line_crossing': return 'Line';
      case 'intrusion': return 'Intrusion';
      case 'tamper': return 'Tamper';
      case 'videoloss': return 'Loss';
      case 'region_entrance': return 'Entrance';
      case 'region_exiting': return 'Exiting';
      case 'unattended_baggage': return 'Baggage';
      case 'object_removal': return 'Removal';
      default: return 'Alarm';
    }
  };

  return (
    <div className={`group relative glass-panel rounded-xl overflow-hidden border border-slate-800 hover:border-blue-500/40 transition-all bg-slate-950 aspect-video flex flex-col justify-between shadow-lg ${ringClass}`}>
      {/* Live Video Stream Viewport */}
      <div className="absolute inset-0 bg-slate-950 flex items-center justify-center overflow-hidden">
        <LiveStreamView
          key={`${cam.id}-${refreshKey}`}
          cameraId={cam.id}
          cameraName={cam.name}
          isPaused={isPaused}
          stream={cam.has_sub_stream ? 2 : 1}
          className="w-full h-full object-cover select-none"
        />
      </div>

      {/* Top Overlay Badge */}
      <div className="relative z-10 p-2.5 flex items-start justify-between bg-gradient-to-b from-slate-950/85 via-slate-950/30 to-transparent pointer-events-none">
        <div className="flex flex-col gap-1 items-start min-w-0 max-w-[calc(100%-4.5rem)]">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTogglePause?.(cam.id);
              }}
              title={isPaused ? 'Click to resume this camera live feed' : 'Click to pause this camera live feed'}
              className={`pointer-events-auto flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-sm backdrop-blur-sm shrink-0 cursor-pointer transition-all active:scale-95 ${
                !isPaused
                  ? 'bg-rose-500/20 hover:bg-rose-500/35 border border-rose-500/40 hover:border-rose-500/60 text-rose-400 hover:text-rose-300'
                  : 'bg-slate-800/90 hover:bg-slate-700 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white'
              }`}
            >
              {!isPaused ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                  <span>LIVE</span>
                </>
              ) : (
                <>
                  <Play className="w-2.5 h-2.5 text-emerald-400 fill-current" />
                  <span>PAUSED</span>
                </>
              )}
            </button>
            <span className="font-semibold text-xs sm:text-sm text-white drop-shadow-md truncate">
              {cam.name}
            </span>
          </div>

          {/* Active Event Badges: positioned below the LIVE row with short description/icon */}
          {hasActiveEvent && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {activeEvents.map((evt) => (
                <div
                  key={evt.id || evt.event_type}
                  title={`${evt.event_label} (Active)`}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-bold tracking-wider shadow-md animate-pulse backdrop-blur-md ${getEventColor(evt.event_type)}`}
                >
                  {getEventIcon(evt.event_type)}
                  <span className="text-[10px] uppercase">{getShortLabel(evt.event_type)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 opacity-90 group-hover:opacity-100 transition-opacity pointer-events-auto shrink-0">
          {onOpenDeviceSettings && (
            <button
              onClick={() => onOpenDeviceSettings(cam)}
              title="Camera Hardware & Image Settings (ISAPI)"
              className="p-1.5 rounded-lg bg-slate-900/80 hover:bg-amber-600 text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => onFullscreen(cam)}
            title="Fullscreen Live View"
            className="p-1.5 rounded-lg bg-slate-900/80 hover:bg-blue-600 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Bottom Actions Overlay */}
      <div className="relative z-10 p-2.5 flex items-center justify-between bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-transparent pointer-events-none">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[11px] text-slate-300 font-mono drop-shadow truncate">
            {cam.ip}
          </span>
          {cam.has_audio_input && (
            <span title="Camera has microphone (audio supported)" className="p-0.5 rounded bg-blue-950/80 border border-blue-800/60 text-blue-300">
              <Mic className="w-3 h-3" />
            </span>
          )}
          {cam.has_audio_output && (
            <span title="Camera has speaker (two-way audio supported)" className="p-0.5 rounded bg-emerald-950/80 border border-emerald-800/60 text-emerald-300">
              <Volume2 className="w-3 h-3" />
            </span>
          )}
        </div>

        <button
          onClick={() => onSelectForPlayback(cam)}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-600/90 hover:bg-blue-500 text-white text-xs font-medium shadow-md transition-all pointer-events-auto cursor-pointer"
        >
          <Play className="w-3 h-3 fill-current" />
          <span>Playback</span>
        </button>
      </div>
    </div>
  );
};

export const LiveGrid: React.FC<LiveGridProps> = ({
  cameras,
  onSelectCameraForPlayback,
  onOpenSettings,
  onOpenDeviceSettings,
  isPaused = false,
  activeEventMap,
}) => {
  const [refreshKey, setRefreshKey] = useState<number>(Date.now());
  const [isTabVisible, setIsTabVisible] = useState<boolean>(() => !document.hidden);
  const [isUserPaused, setIsUserPaused] = useState<boolean>(false);
  const [pausedCameraIds, setPausedCameraIds] = useState<Set<number>>(new Set());
  const [fullscreenCam, setFullscreenCam] = useState<Camera | null>(null);

  const toggleCameraPause = (cameraId: number) => {
    setPausedCameraIds((prev) => {
      // If user had clicked global pause, unpause only this camera while keeping others paused
      if (isUserPaused) {
        setIsUserPaused(false);
        const next = new Set(cameras.map((c) => c.id).filter((id) => id !== cameraId));
        return next;
      }
      const next = new Set(prev);
      if (next.has(cameraId)) {
        next.delete(cameraId);
      } else {
        next.add(cameraId);
      }
      return next;
    });
  };

  const isCameraPaused = (cameraId: number) => {
    if (!isTabVisible || isPaused) return true;
    if (isUserPaused) return true;
    return pausedCameraIds.has(cameraId);
  };

  const isAnyPaused = isUserPaused || pausedCameraIds.size > 0;
  const pausedCount = isUserPaused ? cameras.length : pausedCameraIds.size;
  const isAllPaused = cameras.length > 0 && pausedCount === cameras.length;

  const handleToggleGlobalPause = () => {
    if (isAnyPaused) {
      setIsUserPaused(false);
      setPausedCameraIds(new Set());
    } else {
      setIsUserPaused(true);
      setPausedCameraIds(new Set(cameras.map((c) => c.id)));
    }
  };

  // Tab visibility detection to stop live streams in background tabs
  useEffect(() => {
    const handleVisChange = () => {
      setIsTabVisible(!document.hidden);
    };
    document.addEventListener('visibilitychange', handleVisChange);
    return () => document.removeEventListener('visibilitychange', handleVisChange);
  }, []);

  // Escape key listener to close fullscreen mode
  useEffect(() => {
    if (!fullscreenCam) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFullscreenCam(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fullscreenCam]);

  if (cameras.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center glass-panel rounded-2xl border border-slate-800 my-8">
        <div className="w-16 h-16 rounded-full bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-4">
          <Settings2 className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-semibold text-slate-200">No Cameras Configured</h2>
        <p className="text-sm text-slate-400 max-w-md mt-2 mb-6">
          Get started by adding your Hikvision or HiLook camera IPs, credentials, and recording paths in Settings.
        </p>
        <button
          onClick={onOpenSettings}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-xl shadow-lg shadow-blue-600/20 transition-all flex items-center gap-2 cursor-pointer"
        >
          <Settings2 className="w-4 h-4" />
          Configure Cameras
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top Bar Status & Actions */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-300 font-medium">
          {!isTabVisible || isPaused ? (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-bold">
              <span>PAUSED (SETTINGS OPEN)</span>
            </div>
          ) : isAllPaused ? (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-400 text-xs font-bold">
              <span>PAUSED</span>
            </div>
          ) : pausedCameraIds.size > 0 ? (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              <span>{cameras.length - pausedCameraIds.size} / {cameras.length} LIVE</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/30 text-rose-400 text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              <span>LIVE</span>
            </div>
          )}
          <span className="text-slate-400">
            {cameras.length} Active {cameras.length === 1 ? 'Camera Feed' : 'Camera Feeds'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleGlobalPause}
            title={isAnyPaused ? 'Resume all live camera feeds' : 'Pause all live feeds to save bandwidth'}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 rounded-lg text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            {isAnyPaused ? (
              <>
                <Play className="w-3.5 h-3.5 text-emerald-400 fill-current" />
                <span>Resume Feeds</span>
              </>
            ) : (
              <>
                <Pause className="w-3.5 h-3.5 text-amber-400" />
                <span>Pause Feeds</span>
              </>
            )}
          </button>

          <button
            onClick={() => setRefreshKey(Date.now())}
            title="Reconnect all live camera streams"
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 rounded-lg text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
            <span>Reconnect</span>
          </button>
        </div>
      </div>

      {/* Grid Layout */}
      <div
        className={`grid gap-3 sm:gap-4 ${
          cameras.length === 1
            ? 'grid-cols-1 max-w-4xl mx-auto'
            : cameras.length === 2
            ? 'grid-cols-1 md:grid-cols-2'
            : cameras.length <= 4
            ? 'grid-cols-1 sm:grid-cols-2'
            : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'
        }`}
      >
        {cameras.map((cam) => {
          // If fullscreen is open, pause all background cards to save bandwidth and camera resources
          const isBackgroundSuspended = fullscreenCam !== null;
          const isCardPaused = isCameraPaused(cam.id) || isBackgroundSuspended;
          return (
            <CameraCard
              key={cam.id}
              cam={cam}
              refreshKey={refreshKey}
              isPaused={isCardPaused}
              onTogglePause={toggleCameraPause}
              onSelectForPlayback={onSelectCameraForPlayback}
              onFullscreen={(c) => setFullscreenCam(c)}
              onOpenDeviceSettings={onOpenDeviceSettings}
              activeEvents={activeEventMap?.[cam.id] || []}
            />
          );
        })}
      </div>

      {/* Fullscreen Camera Modal */}
      {fullscreenCam && (() => {
        const isFsPaused = isCameraPaused(fullscreenCam.id);
        return (
          <div className="fixed inset-0 z-50 bg-black/95 flex flex-col p-2 sm:p-4 md:p-6">
            <div className="w-full flex flex-col md:flex-row md:items-center justify-between gap-2 sm:gap-2.5 mb-2 sm:mb-3 text-white shrink-0">
              <div className="flex items-center justify-between gap-2 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={() => toggleCameraPause(fullscreenCam.id)}
                    title={isFsPaused ? 'Click to resume live stream' : 'Click to pause live stream'}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 cursor-pointer transition-all active:scale-95 ${
                      !isFsPaused
                        ? 'bg-rose-500/20 hover:bg-rose-500/35 border border-rose-500/40 hover:border-rose-500/60 text-rose-400 hover:text-rose-300'
                        : 'bg-slate-800/90 hover:bg-slate-700 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white'
                    }`}
                  >
                    {!isFsPaused ? (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                        <span>LIVE</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-2.5 h-2.5 text-emerald-400 fill-current" />
                        <span>PAUSED</span>
                      </>
                    )}
                  </button>
                  <h3 className="font-bold text-sm sm:text-base md:text-lg truncate">{fullscreenCam.name}</h3>
                  <span className="text-xs text-slate-400 font-mono hidden sm:inline shrink-0">({fullscreenCam.ip})</span>
                  {fullscreenCam.has_sub_stream && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30 shrink-0" title="Main Stream 1 (High Quality)">
                      HQ • Stream 1
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setFullscreenCam(null)}
                  className="md:hidden h-8 px-2.5 bg-slate-900/90 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700/80 text-xs rounded-xl font-semibold cursor-pointer shadow-lg flex items-center gap-1 shrink-0"
                  title="Close Fullscreen"
                >
                  <X className="w-3.5 h-3.5 shrink-0" />
                  <span>Close</span>
                </button>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                {fullscreenCam.has_audio_input && (
                  <LiveAudioPlayer
                    cameraId={fullscreenCam.id}
                    cameraName={fullscreenCam.name}
                  />
                )}
                {fullscreenCam.has_audio_output && (
                  <TalkButton
                    cameraId={fullscreenCam.id}
                    cameraName={fullscreenCam.name}
                    size="sm"
                  />
                )}
                <button
                  onClick={() => {
                    onSelectCameraForPlayback(fullscreenCam);
                    setFullscreenCam(null);
                  }}
                  className="h-8 sm:h-9 px-2.5 sm:px-3 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-lg active:scale-95 transition-all shrink-0"
                >
                  <Play className="w-3.5 h-3.5 fill-current shrink-0" />
                  <span className="hidden sm:inline">Go to </span>
                  <span>Playback</span>
                </button>
                <button
                  onClick={() => setFullscreenCam(null)}
                  className="hidden md:flex h-8 sm:h-9 px-2.5 sm:px-3 bg-slate-900/90 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700/80 text-xs rounded-xl font-semibold cursor-pointer shadow-lg active:scale-95 transition-all items-center gap-1 shrink-0"
                  title="Close Fullscreen"
                >
                  <X className="w-3.5 h-3.5 shrink-0" />
                  <span>Close</span>
                </button>
              </div>
            </div>

            <div className="relative w-full flex-1 min-h-0 rounded-xl overflow-hidden bg-slate-900 border border-slate-800 shadow-2xl flex items-center justify-center">
              <LiveStreamView
                cameraId={fullscreenCam.id}
                cameraName={fullscreenCam.name}
                isPaused={isFsPaused}
                stream={1}
                className="w-full h-full object-contain select-none"
              />
            </div>
          </div>
        );
      })()}
    </div>
  );
};
