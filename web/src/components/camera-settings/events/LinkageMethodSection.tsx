import React, { useEffect, useState } from 'react';
import { Bell, Check, Save, Loader2, AlertCircle, ShieldAlert, Video, Mail, UploadCloud, Volume2, Zap } from 'lucide-react';
import { api } from '../../../api';
import type { EventLinkage } from '../../../types';

interface LinkageMethodSectionProps {
  cameraId: number;
  eventType: string;
  refreshKey?: number;
  onRegisterRefresh?: (fn: () => Promise<void>) => void;
}

export const LinkageMethodSection: React.FC<LinkageMethodSectionProps> = ({
  cameraId,
  eventType,
  refreshKey,
  onRegisterRefresh,
}) => {
  const [linkage, setLinkage] = useState<EventLinkage | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const linkagesCacheRef = React.useRef<Record<string, EventLinkage>>({});
  const prevRefreshKeyRef = React.useRef<number | undefined>(refreshKey);
  const prevCameraIdRef = React.useRef<number>(cameraId);

  // Clear cache if camera changes
  if (prevCameraIdRef.current !== cameraId) {
    prevCameraIdRef.current = cameraId;
    linkagesCacheRef.current = {};
  }

  const fetchLinkage = React.useCallback(async (evType: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getEventLinkage(cameraId, evType);
      linkagesCacheRef.current[evType] = res;
      setLinkage(res);
    } catch (err: any) {
      setError('Failed to load linkage methods: ' + (err.message || 'unknown error'));
      const fallback: EventLinkage = {
        event_type: evType,
        notify_surveillance_center: true,
        trigger_channel_record: true,
        send_email: false,
        upload_ftp: false,
        audible_warning: false,
        trigger_alarm_output: false,
      };
      linkagesCacheRef.current[evType] = fallback;
      setLinkage(fallback);
    } finally {
      setLoading(false);
    }
  }, [cameraId]);

  // Load when eventType changes: use cache if already loaded, else fetch
  useEffect(() => {
    if (linkagesCacheRef.current[eventType]) {
      setLinkage(linkagesCacheRef.current[eventType]);
    } else {
      fetchLinkage(eventType);
    }
  }, [eventType, fetchLinkage]);

  // Reload when explicit refreshKey is triggered
  useEffect(() => {
    if (!refreshKey || refreshKey === prevRefreshKeyRef.current) return;
    prevRefreshKeyRef.current = refreshKey;
    delete linkagesCacheRef.current[eventType];
    fetchLinkage(eventType);
  }, [refreshKey, eventType, fetchLinkage]);

  // Register refresh callback for parent to await
  useEffect(() => {
    onRegisterRefresh?.(async () => {
      delete linkagesCacheRef.current[eventType];
      await fetchLinkage(eventType);
    });
  }, [onRegisterRefresh, eventType, fetchLinkage]);

  const handleSave = async () => {
    if (!linkage) return;
    setSaving(true);
    setFeedback(null);
    setError(null);
    try {
      await api.setEventLinkage(cameraId, eventType, linkage);
      setFeedback('Linkage method saved successfully');
      setTimeout(() => setFeedback(null), 3000);
    } catch (err: any) {
      setError('Failed to save linkage method: ' + (err.message || 'unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const toggleOption = (key: keyof EventLinkage) => {
    if (!linkage) return;
    setLinkage({
      ...linkage,
      [key]: !linkage[key],
    });
  };

  if (loading) {
    return (
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-center gap-2 text-slate-400 text-xs">
        <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
        <span>Loading linkage methods...</span>
      </div>
    );
  }

  const items = [
    {
      key: 'notify_surveillance_center' as const,
      label: 'Notify Surveillance Center',
      description: 'Send event alarms to central management software or cloud',
      icon: ShieldAlert,
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
    },
    {
      key: 'trigger_channel_record' as const,
      label: 'Trigger Channel Recording',
      description: 'Record an event-triggered video clip to local SD card / NAS storage',
      icon: Video,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/20',
    },
    {
      key: 'send_email' as const,
      label: 'Send Email',
      description: 'Send email notification with snapshot attachments when triggered',
      icon: Mail,
      color: 'text-purple-400',
      bg: 'bg-purple-500/10',
      border: 'border-purple-500/20',
    },
    {
      key: 'upload_ftp' as const,
      label: 'Upload to FTP / Cloud',
      description: 'Upload snapshot images and clips to configured FTP server',
      icon: UploadCloud,
      color: 'text-cyan-400',
      bg: 'bg-cyan-500/10',
      border: 'border-cyan-500/20',
    },
    {
      key: 'audible_warning' as const,
      label: 'Audible Warning (Buzzer / Beep)',
      description: 'Trigger the camera internal buzzer or audio speaker',
      icon: Volume2,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
    },
    {
      key: 'trigger_alarm_output' as const,
      label: 'Trigger Alarm Output',
      description: 'Activate external hardware relay output or siren trigger',
      icon: Zap,
      color: 'text-rose-400',
      bg: 'bg-rose-500/10',
      border: 'border-rose-500/20',
    },
  ];

  return (
    <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Bell className="w-4 h-4" />
          </div>
          <div>
            <h5 className="text-xs font-semibold text-white">Linkage Method</h5>
            <p className="text-[11px] text-slate-400">
              Select notification actions and responses when this event occurs
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
        >
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          Save Linkage
        </button>
      </div>

      {feedback && (
        <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
          <Check className="w-3.5 h-3.5 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {error && (
        <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {linkage && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {items.map((item) => {
            const Icon = item.icon;
            const checked = Boolean(linkage[item.key]);

            return (
              <div
                key={item.key}
                onClick={() => toggleOption(item.key)}
                className={`p-3 rounded-lg border cursor-pointer transition-all flex items-start gap-3 select-none ${
                  checked
                    ? 'bg-slate-950/80 border-slate-700/80 ring-1 ring-amber-500/30'
                    : 'bg-slate-950/40 border-slate-800/60 opacity-60 hover:opacity-100 hover:border-slate-700'
                }`}
              >
                <div className={`p-2 rounded-lg ${item.bg} ${item.color} border ${item.border} shrink-0 mt-0.5`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-200">
                      {item.label}
                    </span>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {}}
                      className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 bg-slate-900 border-slate-700 pointer-events-none"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                    {item.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
