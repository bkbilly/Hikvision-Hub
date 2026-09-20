import React, { useState, useMemo } from 'react';
import type { Camera, CameraEvent } from '../types';
import { 
  X, 
  Activity, 
  Trash2, 
  Radio, 
  EyeOff, 
  WifiOff, 
  ShieldAlert, 
  Crosshair, 
  Footprints, 
  Clock, 
  Play, 
  Layers
} from 'lucide-react';

interface LiveEventsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  events: CameraEvent[];
  activeEvents: CameraEvent[];
  cameras: Camera[];
  isConnected: boolean;
  onClear: () => void;
  onSelectCameraPlayback?: (cam: Camera, timestamp?: string) => void;
  onSelectCameraLive?: (cam: Camera) => void;
}

export const LiveEventsDrawer: React.FC<LiveEventsDrawerProps> = ({
  isOpen,
  onClose,
  events,
  activeEvents,
  cameras,
  isConnected,
  onClear,
  onSelectCameraPlayback,
  onSelectCameraLive,
}) => {
  const [selectedCamFilter, setSelectedCamFilter] = useState<number | 'all'>('all');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');

  // Filter events
  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (selectedCamFilter !== 'all' && e.camera_id !== selectedCamFilter) {
        return false;
      }
      if (selectedTypeFilter !== 'all' && e.event_type !== selectedTypeFilter) {
        return false;
      }
      return true;
    });
  }, [events, selectedCamFilter, selectedTypeFilter]);

  const filteredActive = useMemo(() => {
    return activeEvents.filter((e) => {
      if (selectedCamFilter !== 'all' && e.camera_id !== selectedCamFilter) {
        return false;
      }
      if (selectedTypeFilter !== 'all' && e.event_type !== selectedTypeFilter) {
        return false;
      }
      return true;
    });
  }, [activeEvents, selectedCamFilter, selectedTypeFilter]);

  if (!isOpen) return null;

  // Format relative timestamp
  const formatTime = (timeStr: string) => {
    try {
      const d = new Date(timeStr);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return timeStr;
    }
  };

  const getEventBadge = (type: string) => {
    switch (type) {
      case 'motion':
        return {
          icon: <Footprints className="w-3.5 h-3.5" />,
          color: 'text-amber-400 bg-amber-500/15 border-amber-500/30',
          dotColor: 'bg-amber-400',
        };
      case 'line_crossing':
        return {
          icon: <Crosshair className="w-3.5 h-3.5" />,
          color: 'text-cyan-400 bg-cyan-500/15 border-cyan-500/30',
          dotColor: 'bg-cyan-400',
        };
      case 'intrusion':
        return {
          icon: <ShieldAlert className="w-3.5 h-3.5" />,
          color: 'text-rose-400 bg-rose-500/15 border-rose-500/30',
          dotColor: 'bg-rose-400',
        };
      case 'tamper':
        return {
          icon: <EyeOff className="w-3.5 h-3.5" />,
          color: 'text-purple-400 bg-purple-500/15 border-purple-500/30',
          dotColor: 'bg-purple-400',
        };
      case 'videoloss':
        return {
          icon: <WifiOff className="w-3.5 h-3.5" />,
          color: 'text-red-400 bg-red-500/15 border-red-500/30',
          dotColor: 'bg-red-400',
        };
      default:
        return {
          icon: <Activity className="w-3.5 h-3.5" />,
          color: 'text-blue-400 bg-blue-500/15 border-blue-500/30',
          dotColor: 'bg-blue-400',
        };
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end overflow-hidden">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Slide-over Drawer Panel */}
      <div className="relative w-full max-w-md bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col h-full z-10 animate-in slide-in-from-right duration-200">
        
        {/* Drawer Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-400">
              <Radio className={`w-4 h-4 ${isConnected ? 'animate-pulse text-emerald-400' : 'text-slate-500'}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-sm sm:text-base text-slate-100">Live Camera Events</h2>
                <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-slate-600'}`} title={isConnected ? 'On-Demand Stream Active' : 'Connecting on-demand...'} />
              </div>
              <p className="text-[11px] text-slate-400">{isConnected ? 'On-demand stream active' : 'Connecting on-demand...'}</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {events.length > 0 && (
              <button
                onClick={onClear}
                title="Clear local event history"
                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="p-3 bg-slate-950/40 border-b border-slate-800 flex flex-wrap items-center gap-2">
          {/* Camera Filter */}
          <div className="relative flex-1 min-w-[140px]">
            <select
              value={selectedCamFilter}
              onChange={(e) => setSelectedCamFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="all">All Cameras</option>
              {cameras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Type Filter */}
          <div className="relative min-w-[130px]">
            <select
              value={selectedTypeFilter}
              onChange={(e) => setSelectedTypeFilter(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="all">All Events</option>
              <option value="motion">Motion</option>
              <option value="line_crossing">Line Crossing</option>
              <option value="intrusion">Intrusion</option>
              <option value="tamper">Tamper</option>
              <option value="videoloss">Video Loss</option>
            </select>
          </div>
        </div>

        {/* Active Alarms Section (if any triggering right now) */}
        {filteredActive.length > 0 && (
          <div className="p-3 bg-amber-500/10 border-b border-amber-500/20 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-amber-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                Active Triggers ({filteredActive.length})
              </span>
              <span className="text-[10px] text-amber-500 uppercase tracking-wider font-mono">LIVE NOW</span>
            </div>

            <div className="space-y-1.5">
              {filteredActive.map((evt) => {
                const badge = getEventBadge(evt.event_type);
                const cam = cameras.find((c) => c.id === evt.camera_id);
                return (
                  <div
                    key={`active-${evt.id}`}
                    className="flex items-center justify-between p-2 rounded-lg bg-slate-900/90 border border-amber-500/30 shadow-md"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`p-1.5 rounded-md border ${badge.color}`}>
                        {badge.icon}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-white truncate">{evt.camera_name}</span>
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
                            ACTIVE
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-300 truncate">{evt.event_label}</p>
                      </div>
                    </div>

                    {cam && onSelectCameraLive && (
                      <button
                        onClick={() => {
                          onSelectCameraLive(cam);
                          onClose();
                        }}
                        className="px-2 py-1 text-[11px] bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded shadow transition-all cursor-pointer shrink-0 ml-2"
                      >
                        View Live
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Event List / Timeline */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filteredEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center text-slate-500 space-y-2">
              <Layers className="w-8 h-8 text-slate-600 stroke-[1.5]" />
              <p className="text-xs font-medium text-slate-400">No events recorded yet</p>
              <p className="text-[11px] text-slate-500 max-w-[200px]">
                Events detected by cameras (motion, line crossing, intrusion) will appear here in real-time.
              </p>
            </div>
          ) : (
            filteredEvents.map((evt) => {
              const badge = getEventBadge(evt.event_type);
              const cam = cameras.find((c) => c.id === evt.camera_id);
              const isOngoing = evt.event_state === 'active';

              return (
                <div
                  key={evt.id}
                  className={`p-2.5 rounded-xl border transition-all ${
                    isOngoing
                      ? 'bg-amber-950/20 border-amber-500/40 shadow-sm'
                      : 'bg-slate-950/60 hover:bg-slate-800/60 border-slate-800/80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className={`p-1.5 rounded-lg border shrink-0 mt-0.5 ${badge.color}`}>
                        {badge.icon}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-xs text-slate-200 truncate">
                            {evt.camera_name}
                          </span>
                          <span className={`px-1.5 py-0.2 rounded text-[10px] font-medium border ${badge.color}`}>
                            {evt.event_label}
                          </span>
                          {isOngoing && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500 text-slate-950 animate-pulse">
                              ACTIVE
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-500" />
                            {formatTime(evt.start_time)}
                          </span>

                          {evt.duration_sec !== undefined && evt.duration_sec > 0 && (
                            <span className="text-slate-500 font-mono text-[10px]">
                              ({evt.duration_sec}s)
                            </span>
                          )}

                          {evt.description && evt.description !== evt.event_label && (
                            <span className="text-slate-400 text-[10px] truncate max-w-[120px]">
                              • {evt.description}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1 shrink-0">
                      {cam && onSelectCameraPlayback && (
                        <button
                          onClick={() => {
                            onSelectCameraPlayback(cam, evt.start_time);
                            onClose();
                          }}
                          title="Open Recording Timeline at this event"
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-blue-600 text-slate-300 hover:text-white transition-colors cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs text-slate-400">
          <span>{filteredEvents.length} events logged</span>
          <span className="text-[11px] text-slate-500">Auto-buffered</span>
        </div>
      </div>
    </div>
  );
};
