import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { CameraEvent } from '../types';
import { api } from '../api';

interface LiveEventsState {
  events: CameraEvent[];
  activeEvents: CameraEvent[];
  activeCameraIds: Set<number>;
  activeEventMap: Record<number, CameraEvent[]>; // [camId] -> active events
  isConnected: boolean;
  unreadCount: number;
  clearEvents: () => void;
  resetUnread: () => void;
}

export function useLiveEvents(enabled: boolean = true): LiveEventsState {
  const [events, setEvents] = useState<CameraEvent[]>([]);
  const [activeEvents, setActiveEvents] = useState<CameraEvent[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isTabVisible, setIsTabVisible] = useState<boolean>(() => !document.hidden);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);
  const retryAttemptsRef = useRef<number>(0);

  // Track tab visibility to auto-disconnect when browser tab is minimized or hidden
  useEffect(() => {
    const handleVisChange = () => {
      setIsTabVisible(!document.hidden);
    };
    document.addEventListener('visibilitychange', handleVisChange);
    return () => document.removeEventListener('visibilitychange', handleVisChange);
  }, []);

  const shouldConnect = enabled && isTabVisible;

  // Clear unread count (e.g. when opening drawer)
  const resetUnread = useCallback(() => {
    setUnreadCount(0);
  }, []);

  // Clear event history
  const clearEvents = useCallback(() => {
    setEvents([]);
    setUnreadCount(0);
  }, []);

  // Initial load via REST
  const fetchInitial = useCallback(async () => {
    try {
      const data = await api.getLiveEvents();
      if (data) {
        if (data.active) setActiveEvents(data.active);
        if (data.recent) setEvents(data.recent);
      }
    } catch {
      // Fallback silently if offline
    }
  }, []);

  useEffect(() => {
    if (!shouldConnect) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsConnected(false);
      return;
    }

    // Fetch initial state once
    fetchInitial();

    let isMounted = true;

    const connect = () => {
      if (!isMounted || !shouldConnect) return;

      try {
        const wsUrl = api.getEventsWsUrl();
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!isMounted) return;
          setIsConnected(true);
          retryAttemptsRef.current = 0;
        };

        ws.onmessage = (messageEvent) => {
          if (!isMounted) return;
          try {
            const data = JSON.parse(messageEvent.data);
            if (data.type === 'init') {
              if (Array.isArray(data.active)) setActiveEvents(data.active);
              if (Array.isArray(data.recent)) setEvents(data.recent);
            } else if (data.type === 'event' && data.event) {
              const evt: CameraEvent = data.event;

              if (evt.event_state === 'active') {
                // Update active events list
                setActiveEvents((prev) => {
                  const filtered = prev.filter(
                    (e) => !(e.camera_id === evt.camera_id && e.event_type === evt.event_type)
                  );
                  return [evt, ...filtered];
                });

                // Add to recent events if not already present
                setEvents((prev) => {
                  const existingIdx = prev.findIndex((e) => e.id === evt.id);
                  if (existingIdx >= 0) {
                    const updated = [...prev];
                    updated[existingIdx] = evt;
                    return updated;
                  }
                  return [evt, ...prev.slice(0, 299)];
                });

                setUnreadCount((c) => c + 1);
              } else {
                // Event cleared (inactive)
                setActiveEvents((prev) =>
                  prev.filter(
                    (e) => !(e.camera_id === evt.camera_id && e.event_type === evt.event_type)
                  )
                );

                // Update the matching event in history
                setEvents((prev) => {
                  const idx = prev.findIndex(
                    (e) =>
                      e.id === evt.id ||
                      (e.camera_id === evt.camera_id &&
                        e.event_type === evt.event_type &&
                        e.event_state === 'active')
                  );
                  if (idx >= 0) {
                    const updated = [...prev];
                    updated[idx] = {
                      ...updated[idx],
                      event_state: 'inactive',
                      end_time: evt.end_time || new Date().toISOString(),
                      duration_sec: evt.duration_sec ?? updated[idx].duration_sec,
                    };
                    return updated;
                  }
                  return prev;
                });
              }
            }
          } catch (err) {
            console.error('[LiveEvents] Parse message error:', err);
          }
        };

        ws.onerror = () => {
          // Handled in onclose
        };

        ws.onclose = () => {
          if (!isMounted || !enabled) return;
          setIsConnected(false);

          const delay = Math.min(1000 * Math.pow(1.5, retryAttemptsRef.current), 10000);
          retryAttemptsRef.current += 1;
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        };
      } catch {
        const delay = Math.min(1000 * Math.pow(1.5, retryAttemptsRef.current), 10000);
        retryAttemptsRef.current += 1;
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      }
    };

    connect();

    return () => {
      isMounted = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [shouldConnect, fetchInitial]);

  // Derived sets and maps for quick lookup in components
  const activeCameraIds = useMemo(() => {
    return new Set(activeEvents.map((e) => e.camera_id));
  }, [activeEvents]);

  const activeEventMap = useMemo(() => {
    const map: Record<number, CameraEvent[]> = {};
    for (const evt of activeEvents) {
      if (!map[evt.camera_id]) {
        map[evt.camera_id] = [];
      }
      map[evt.camera_id].push(evt);
    }
    return map;
  }, [activeEvents]);

  return {
    events,
    activeEvents,
    activeCameraIds,
    activeEventMap,
    isConnected,
    unreadCount,
    clearEvents,
    resetUnread,
  };
}
