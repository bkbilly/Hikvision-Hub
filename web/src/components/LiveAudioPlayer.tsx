import React, { useState, useRef, useEffect } from 'react';
import { Volume2, VolumeX, Volume1, Loader2 } from 'lucide-react';
import { api } from '../api';

interface LiveAudioPlayerProps {
  cameraId: number;
  cameraName?: string;
  className?: string;
}

export const LiveAudioPlayer: React.FC<LiveAudioPlayerProps> = ({
  cameraId,
  cameraName,
  className = '',
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const isStoppingRef = useRef<boolean>(false);

  // Initialize Web Audio GainNode on first user interaction for volume boost > 100%
  const initWebAudio = () => {
    if (!audioRef.current || gainNodeRef.current) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const source = ctx.createMediaElementSource(audioRef.current);
      const gain = ctx.createGain();
      source.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.value = isMuted ? 0 : volume;
      audioCtxRef.current = ctx;
      gainNodeRef.current = gain;
    } catch (e) {
      console.warn('Web Audio gain initialization failed, falling back to standard volume', e);
    }
  };

  // Stop audio on unmount or cameraId change
  useEffect(() => {
    return () => {
      isStoppingRef.current = true;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute('src');
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, [cameraId]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    setError('');

    if (isPlaying) {
      isStoppingRef.current = true;
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
      setIsPlaying(false);
      setIsLoading(false);
      setTimeout(() => {
        isStoppingRef.current = false;
      }, 150);
    } else {
      setIsLoading(true);
      isStoppingRef.current = false;
      const url = api.getLiveAudioUrl(cameraId);
      audioRef.current.src = url;

      initWebAudio();
      if (audioCtxRef.current?.state === 'suspended') {
        audioCtxRef.current.resume();
      }

      if (gainNodeRef.current) {
        gainNodeRef.current.gain.value = isMuted ? 0 : volume;
      } else {
        audioRef.current.volume = Math.min(1, isMuted ? 0 : volume);
      }

      audioRef.current
        .play()
        .then(() => {
          setIsPlaying(true);
          setIsLoading(false);
        })
        .catch((err) => {
          if (isStoppingRef.current) return;
          setIsLoading(false);
          setIsPlaying(false);
          setError(err.message || 'Failed to start live audio');
          setTimeout(() => setError(''), 4000);
        });
    }
  };

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    initWebAudio();
    if (audioCtxRef.current?.state === 'suspended') {
      audioCtxRef.current.resume();
    }

    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = isMuted ? 0 : newVol;
    } else if (audioRef.current) {
      audioRef.current.volume = Math.min(1, Math.max(0, newVol));
    }

    if (newVol > 0 && isMuted) {
      setIsMuted(false);
      if (gainNodeRef.current) {
        gainNodeRef.current.gain.value = newVol;
      }
    }
  };

  const toggleMute = () => {
    initWebAudio();
    if (audioCtxRef.current?.state === 'suspended') {
      audioCtxRef.current.resume();
    }

    const nextMuted = !isMuted;
    setIsMuted(nextMuted);

    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = nextMuted ? 0 : volume;
    } else if (audioRef.current) {
      audioRef.current.muted = nextMuted;
    }
  };

  return (
    <div className={`inline-flex items-center gap-1.5 sm:gap-2 bg-slate-900/90 border border-slate-700/80 rounded-xl px-2 sm:px-2.5 h-8 sm:h-9 backdrop-blur-md shadow-lg shrink-0 ${className}`}>
      {/* Hidden HTML5 Audio Element */}
      <audio
        ref={audioRef}
        playsInline
        onWaiting={() => {
          if (!isStoppingRef.current) setIsLoading(true);
        }}
        onPlaying={() => {
          setIsLoading(false);
          setIsPlaying(true);
        }}
        onError={() => {
          if (isStoppingRef.current || !audioRef.current?.src || audioRef.current.src === '' || audioRef.current.src === window.location.href) {
            return;
          }
          setIsLoading(false);
          setIsPlaying(false);
          setError('Live audio feed error');
          setTimeout(() => setError(''), 4000);
        }}
      />

      {/* Play / Stop Live Audio button */}
      <button
        type="button"
        onClick={togglePlay}
        title={isPlaying ? `Stop listening to ${cameraName || 'camera'} audio` : `Listen to ${cameraName || 'camera'} live audio`}
        className={`h-6 sm:h-7 flex items-center gap-1 sm:gap-1.5 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
          isPlaying
            ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/30'
            : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white'
        }`}
      >
        {isLoading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400 shrink-0" />
        ) : isPlaying ? (
          <Volume2 className="w-3.5 h-3.5 text-white animate-pulse shrink-0" />
        ) : (
          <VolumeX className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        )}
        <span className="hidden sm:inline">{isPlaying ? 'Audio ON' : 'Listen Live'}</span>
        <span className="sm:hidden">{isPlaying ? 'ON' : 'Listen'}</span>
      </button>

      {/* Volume Slider when active (Supports beyond 100% up to 200%) */}
      {isPlaying && (
        <div className="flex items-center gap-1 sm:gap-1.5 pl-1 border-l border-slate-700/80">
          <button
            type="button"
            onClick={toggleMute}
            title={isMuted ? 'Unmute' : 'Mute'}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-3.5 h-3.5 text-rose-400" />
            ) : volume < 0.5 ? (
              <Volume1 className="w-3.5 h-3.5 text-slate-300" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-slate-300" />
            )}
          </button>
          <input
            type="range"
            min="0"
            max="2"
            step="0.05"
            value={isMuted ? 0 : volume}
            onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
            className="w-12 sm:w-16 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
            title={`Volume: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
          />
          <span
            className={`text-[10px] font-mono w-7 sm:w-8 text-right select-none ${
              volume > 1 ? 'text-amber-400 font-bold' : 'text-slate-400'
            }`}
            title={volume > 1 ? 'Audio Boosted Beyond 100%' : 'Volume Level'}
          >
            {Math.round((isMuted ? 0 : volume) * 100)}%
          </span>
        </div>
      )}

      {error && (
        <span className="text-[11px] text-rose-400 font-medium px-1 animate-pulse">
          {error}
        </span>
      )}
    </div>
  );
};

export default LiveAudioPlayer;
