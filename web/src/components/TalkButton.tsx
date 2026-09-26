import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '../api';

interface TalkButtonProps {
  cameraId: number;
  cameraName?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const TalkButton: React.FC<TalkButtonProps> = ({
  cameraId,
  cameraName,
  className = '',
  size = 'md',
}) => {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isTransmitting, setIsTransmitting] = useState<boolean>(false);
  const [transmittedSuccess, setTransmittedSuccess] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [durationSec, setDurationSec] = useState<number>(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<any>(null);
  const isHoldingRef = useRef<boolean>(false);

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    } else {
      setIsRecording(false);
    }
  }, []);

  const startRecording = useCallback(async () => {
    setErrorMessage('');
    setTransmittedSuccess(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      audioChunksRef.current = [];
      setDurationSec(0);

      // Pick supported mime type
      let mimeType = '';
      if (typeof MediaRecorder !== 'undefined') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
          mimeType = 'audio/ogg;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        }
      }

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        setIsRecording(false);
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }

        const blobType = recorder.mimeType || 'audio/webm';
        const fullBlob = new Blob(audioChunksRef.current, { type: blobType });

        if (fullBlob.size < 500) {
          // Audio clip too short (e.g. quick accidental tap under 100ms)
          return;
        }

        setIsTransmitting(true);
        try {
          await api.sendAudioToCamera(cameraId, fullBlob);
          setTransmittedSuccess(true);
          setTimeout(() => setTransmittedSuccess(false), 2500);
        } catch (err: any) {
          setErrorMessage(err.message || 'Failed to speak to camera');
          setTimeout(() => setErrorMessage(''), 4000);
        } finally {
          setIsTransmitting(false);
        }
      };

      recorder.start(250); // Slice in 250ms chunks
      setIsRecording(true);

      timerRef.current = setInterval(() => {
        setDurationSec((prev) => {
          if (prev >= 25) {
            // Safety cap at 25 seconds
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err: any) {
      setIsRecording(false);
      setErrorMessage(
        err.name === 'NotAllowedError'
          ? 'Microphone permission denied in browser'
          : err.message || 'Microphone unavailable'
      );
      setTimeout(() => setErrorMessage(''), 4000);
    }
  }, [cameraId, stopRecording]);

  // Handle pointer down (mouse/touch press to hold)
  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    if (isTransmitting) return;
    isHoldingRef.current = true;
    startRecording();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  // Handle pointer up (release hold to transmit)
  const handlePointerUp = (e: React.PointerEvent) => {
    e.preventDefault();
    if (isHoldingRef.current) {
      isHoldingRef.current = false;
      stopRecording();
    }
  };

  // Handle click toggle fallback (for keyboard / assistive navigation)
  const handleClickToggle = () => {
    if (isTransmitting) return;
    if (isRecording) {
      isHoldingRef.current = false;
      stopRecording();
    } else {
      isHoldingRef.current = false;
      startRecording();
    }
  };

  const sizeClasses = {
    sm: 'h-8 sm:h-9 px-2.5 sm:px-3 text-xs gap-1.5 rounded-xl',
    md: 'h-10 px-4 text-xs sm:text-sm gap-2 rounded-xl',
    lg: 'h-12 px-5 text-sm sm:text-base gap-2.5 rounded-2xl',
  }[size];

  const iconSizes = {
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  }[size];

  return (
    <div className={`relative inline-flex items-center select-none shrink-0 ${className}`}>
      <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            handleClickToggle();
          }
        }}
        disabled={isTransmitting}
        title={
          isRecording
            ? 'Release to speak to camera'
            : isTransmitting
            ? 'Sending voice to camera...'
            : `Hold to speak to ${cameraName || 'camera'} speaker`
        }
        className={`flex items-center justify-center font-semibold transition-all duration-200 cursor-pointer shadow-lg active:scale-95 ${sizeClasses} ${
          isRecording
            ? 'bg-rose-600 text-white ring-4 ring-rose-500/40 animate-pulse shadow-rose-600/50'
            : isTransmitting
            ? 'bg-amber-600 text-white cursor-wait opacity-90'
            : transmittedSuccess
            ? 'bg-emerald-600 text-white shadow-emerald-600/30'
            : 'bg-slate-900/90 hover:bg-slate-800 text-slate-100 border border-slate-700/80 hover:border-blue-500/50 shadow-slate-950/50'
        }`}
      >
        {isTransmitting ? (
          <>
            <Loader2 className={`${iconSizes} animate-spin shrink-0`} />
            <span className="hidden sm:inline">Sending...</span>
            <span className="sm:hidden">...</span>
          </>
        ) : isRecording ? (
          <>
            <Mic className={`${iconSizes} animate-bounce shrink-0`} />
            <span className="hidden sm:inline">Speaking... ({durationSec}s)</span>
            <span className="sm:hidden">({durationSec}s)</span>
            <div className="flex items-center gap-0.5 ml-1">
              <span className="w-1 h-3 bg-white rounded-full animate-pulse" />
              <span className="w-1 h-4 bg-white rounded-full animate-pulse delay-75" />
              <span className="w-1 h-2 bg-white rounded-full animate-pulse delay-150" />
            </div>
          </>
        ) : transmittedSuccess ? (
          <>
            <CheckCircle2 className={`${iconSizes} text-white shrink-0`} />
            <span className="hidden sm:inline">Spoken to Camera</span>
            <span className="sm:hidden">Sent</span>
          </>
        ) : (
          <>
            <Mic className={`${iconSizes} text-rose-400 group-hover:text-rose-300 shrink-0`} />
            <span className="hidden sm:inline">Hold to Speak</span>
            <span className="sm:hidden">Speak</span>
          </>
        )}
      </button>

      {/* Floating Error Tooltip */}
      {errorMessage && (
        <div className="absolute -top-9 left-1/2 -translate-x-1/2 z-50 whitespace-nowrap px-2.5 py-1 bg-rose-950 border border-rose-700 text-rose-200 text-[11px] rounded-lg shadow-xl flex items-center gap-1.5 animate-in fade-in">
          <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
};

export default TalkButton;
