import React from 'react';
import type { StreamSettings } from '../../types';

interface VideoTabProps {
  streamChannel: 101 | 102;
  setStreamChannel: (ch: 101 | 102) => void;
  mainStream: StreamSettings | null;
  setMainStream: React.Dispatch<React.SetStateAction<StreamSettings | null>>;
  subStream: StreamSettings | null;
  setSubStream: React.Dispatch<React.SetStateAction<StreamSettings | null>>;
  onSaveStream: (e: React.FormEvent) => void;
}

export const VideoTab: React.FC<VideoTabProps> = ({
  streamChannel,
  setStreamChannel,
  mainStream,
  setMainStream,
  subStream,
  setSubStream,
  onSaveStream,
}) => {
  const currentStream = streamChannel === 101 ? mainStream : subStream;
  const setTargetStream = streamChannel === 101 ? setMainStream : setSubStream;

  if (!currentStream) {
    return <div className="text-center py-8 text-slate-500 text-sm">Loading stream {streamChannel} configuration...</div>;
  }

  const getResolutionLabel = (res: string): string => {
    switch (res.toLowerCase()) {
      case '3840x2160': return '3840x2160 (4K UHD / 8MP - 16:9)';
      case '3200x1800': return '3200x1800 (6MP - 16:9)';
      case '3072x2048': return '3072x2048 (6MP - 3:2)';
      case '3072x1728': return '3072x1728 (5MP - 16:9)';
      case '2944x1656': return '2944x1656 (5MP - 16:9)';
      case '2592x1944': return '2592x1944 (5MP - 4:3)';
      case '2560x1920': return '2560x1920 (5MP - 4:3)';
      case '2688x1520': return '2688x1520 (4MP - 16:9)';
      case '2560x1440': return '2560x1440 (2K QHD / 4MP - 16:9)';
      case '2304x1296': return '2304x1296 (3MP - 16:9)';
      case '2048x1536': return '2048x1536 (3MP - 4:3)';
      case '1920x1080': return '1920x1080 (Full HD 1080p - 16:9)';
      case '1600x1200': return '1600x1200 (UXGA / 2MP - 4:3)';
      case '1280x960':  return '1280x960 (960p / 1.3MP - 4:3)';
      case '1280x720':  return '1280x720 (HD 720p - 16:9)';
      case '1024x768':  return '1024x768 (XGA - 4:3)';
      case '960x576':   return '960x576 (960H PAL)';
      case '960x540':   return '960x540 (qHD - 16:9)';
      case '960x480':   return '960x480 (960H NTSC)';
      case '800x600':   return '800x600 (SVGA - 4:3)';
      case '704x576':   return '704x576 (D1 / 4CIF PAL)';
      case '704x480':   return '704x480 (D1 / 4CIF NTSC)';
      case '704x288':   return '704x288 (2CIF PAL)';
      case '704x240':   return '704x240 (2CIF NTSC)';
      case '640x512':   return '640x512 (Thermal / Custom)';
      case '640x480':   return '640x480 (VGA - 4:3)';
      case '640x360':   return '640x360 (nHD - 16:9)';
      case '480x360':   return '480x360 (4:3)';
      case '384x288':   return '384x288 (Thermal / Custom)';
      case '352x288':   return '352x288 (CIF PAL)';
      case '352x240':   return '352x240 (CIF NTSC)';
      case '320x240':   return '320x240 (QVGA - 4:3)';
      case '320x192':   return '320x192 (16:9)';
      case '320x180':   return '320x180 (16:9)';
      case '320x176':   return '320x176';
      case '176x144':   return '176x144 (QCIF PAL)';
      case '176x120':   return '176x120 (QCIF NTSC)';
      default: return res;
    }
  };

  const getStreamResolutions = (): string[] => {
    if (currentStream.supported_resolutions && currentStream.supported_resolutions.length > 0) {
      const list = [...currentStream.supported_resolutions];
      const currentRes = currentStream.resolution || (currentStream.width && currentStream.height ? `${currentStream.width}x${currentStream.height}` : '');
      if (currentRes && !list.some(r => r.toLowerCase() === currentRes.toLowerCase())) {
        list.unshift(currentRes);
      }
      return list;
    }
    const fallbackRes = currentStream.resolution || (currentStream.width && currentStream.height ? `${currentStream.width}x${currentStream.height}` : (streamChannel === 101 ? '1920x1080' : '640x360'));
    return [fallbackRes];
  };

  const getStreamFPSList = (): number[] => {
    if (currentStream.supported_fps && currentStream.supported_fps.length > 0) {
      const list = [...currentStream.supported_fps];
      if (currentStream.fps && !list.includes(currentStream.fps)) {
        list.push(currentStream.fps);
        list.sort((a, b) => a - b);
      }
      return list;
    }
    return currentStream.fps ? [currentStream.fps] : [25];
  };

  const getStreamCodecs = (): string[] => {
    const list = currentStream.supported_codecs && currentStream.supported_codecs.length > 0
      ? [...currentStream.supported_codecs]
      : ['H.264', 'H.265', 'MJPEG'];

    if (currentStream.video_codec && !list.includes(currentStream.video_codec)) {
      list.unshift(currentStream.video_codec);
    }
    return list;
  };

  const getStreamBitrateTypes = (): string[] => {
    const list = currentStream.supported_bitrate_types && currentStream.supported_bitrate_types.length > 0
      ? [...currentStream.supported_bitrate_types]
      : ['VBR', 'CBR'];

    if (currentStream.bitrate_type && !list.includes(currentStream.bitrate_type)) {
      list.unshift(currentStream.bitrate_type);
    }
    return list;
  };

  const currentResValue = currentStream.resolution || `${currentStream.width || (streamChannel === 101 ? 1920 : 640)}x${currentStream.height || (streamChannel === 101 ? 1080 : 360)}`;

  const getStreamProfiles = (): string[] => {
    const list = currentStream.supported_profiles && currentStream.supported_profiles.length > 0
      ? [...currentStream.supported_profiles]
      : ['Main', 'High', 'Baseline'];
    const cur = currentStream.profile;
    if (cur && !list.includes(cur)) list.unshift(cur);
    return list;
  };

  const bitratePresets = [512, 1024, 2048, 4096, 6144, 8192, 12288, 16384];
  const qualityLevels = [
    { value: 100, label: '100 — Highest' },
    { value: 80,  label: '80 — Higher' },
    { value: 60,  label: '60 — Medium' },
    { value: 40,  label: '40 — Low' },
    { value: 20,  label: '20 — Lower' },
    { value: 1,   label: '1 — Lowest' },
  ];

  const showProfile = (currentStream.video_codec || '').toUpperCase().includes('264') ||
                      (currentStream.video_codec || '').toUpperCase().includes('265');
  const isVBR = (currentStream.bitrate_type || 'VBR') === 'VBR';

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-white mb-1">Streams</h3>
        <p className="text-xs text-slate-400">Configure resolution, framerate, and compression codec for primary and secondary streams.</p>
      </div>

      {/* Sub-channel switcher */}
      <div className="flex rounded-xl bg-slate-900 p-1 border border-slate-800 max-w-sm">
        <button
          type="button"
          onClick={() => setStreamChannel(101)}
          className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
            streamChannel === 101 ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          Main Stream (101 - HD)
        </button>
        <button
          type="button"
          onClick={() => setStreamChannel(102)}
          className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
            streamChannel === 102 ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          Sub Stream (102 - Live/Mobile)
        </button>
      </div>

      <form onSubmit={onSaveStream} className="space-y-5">
        {/* Row 1: Codec + Profile */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Video Codec</label>
            <select
              value={currentStream.video_codec || 'H.264'}
              onChange={(e) => setTargetStream({ ...currentStream, video_codec: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-blue-500"
            >
              {getStreamCodecs().map((codec) => (
                <option key={codec} value={codec}>
                  {codec === 'H.264' ? 'H.264 (AVC)' : codec === 'H.265' ? 'H.265 (HEVC)' : codec}
                </option>
              ))}
            </select>
          </div>

          {showProfile && (
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Codec Profile</label>
              <select
                value={currentStream.profile || 'Main'}
                onChange={(e) => setTargetStream({ ...currentStream, profile: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-blue-500"
              >
                {getStreamProfiles().map((p) => (
                  <option key={p} value={p}>
                    {p === 'Main' ? 'Main (Recommended)' : p === 'High' ? 'High (Better Quality)' : p === 'Baseline' ? 'Baseline (Max Compat.)' : p}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Row 2: Resolution + FPS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Resolution</label>
            <select
              value={currentResValue}
              onChange={(e) => setTargetStream({ ...currentStream, resolution: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
            >
              {getStreamResolutions().map((res) => (
                <option key={res} value={res}>
                  {getResolutionLabel(res)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Frame Rate (FPS)</label>
            <select
              value={currentStream.fps || 25}
              onChange={(e) => setTargetStream({ ...currentStream, fps: parseInt(e.target.value) || 25 })}
              className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-blue-500"
            >
              {getStreamFPSList().map((fps) => (
                <option key={fps} value={fps}>
                  {fps} FPS {fps === 25 ? '(PAL Standard)' : fps === 30 ? '(NTSC Standard)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 3: Bitrate Type + Bitrate / Quality */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Bitrate Type</label>
            <select
              value={currentStream.bitrate_type || 'VBR'}
              onChange={(e) => setTargetStream({ ...currentStream, bitrate_type: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-blue-500"
            >
              {getStreamBitrateTypes().map((bt) => (
                <option key={bt} value={bt}>
                  {bt === 'VBR' ? 'VBR (Variable Bitrate)' : 'CBR (Constant Bitrate)'}
                </option>
              ))}
            </select>
          </div>

          {isVBR ? (
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Video Quality (VBR)</label>
              <select
                value={currentStream.fixed_quality ?? 60}
                onChange={(e) => setTargetStream({ ...currentStream, fixed_quality: parseInt(e.target.value) })}
                className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-blue-500"
              >
                {qualityLevels.map((q) => (
                  <option key={q.value} value={q.value}>{q.label}</option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        {/* Max Bitrate */}
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1">
            {isVBR ? 'Max Bitrate Cap (Kbps)' : 'Target Bitrate (Kbps)'}
          </label>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="number"
              value={currentStream.constant_bitrate || 4096}
              onChange={(e) => setTargetStream({ ...currentStream, constant_bitrate: parseInt(e.target.value) || 4096 })}
              className="w-28 bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
            />
            <div className="flex flex-wrap gap-1">
              {bitratePresets.map((bp) => (
                <button
                  key={bp}
                  type="button"
                  onClick={() => setTargetStream({ ...currentStream, constant_bitrate: bp })}
                  className={`px-2 py-1 rounded text-[10px] font-mono transition-all cursor-pointer ${
                    (currentStream.constant_bitrate || 4096) === bp
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  {bp >= 1024 ? `${bp / 1024}M` : `${bp}K`}
                </button>
              ))}
            </div>
          </div>
          <span className="text-[10px] text-slate-500 mt-1 block">
            Recommended: {streamChannel === 101 ? '4096–8192 Kbps (Main)' : '512–1024 Kbps (Sub)'}
          </span>
        </div>

        {/* Row 4: I-Frame Interval + Smoothing */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              I-Frame Interval / GOP
              <span className="ml-1 text-slate-500 font-normal">(1–250 frames)</span>
            </label>
            <input
              type="number"
              min={1}
              max={250}
              value={currentStream.gov_length ?? 50}
              onChange={(e) => setTargetStream({ ...currentStream, gov_length: Math.max(1, Math.min(250, parseInt(e.target.value) || 50)) })}
              className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
            />
            <span className="text-[10px] text-slate-500 mt-1 block">
              Recommended: 1×–2× FPS (e.g. {currentStream.fps || 25}–{(currentStream.fps || 25) * 2})
            </span>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Smoothing
              <span className="ml-1 text-slate-500 font-normal">({currentStream.smoothing ?? 50})</span>
            </label>
            <input
              type="range"
              min={1}
              max={100}
              value={currentStream.smoothing ?? 50}
              onChange={(e) => setTargetStream({ ...currentStream, smoothing: parseInt(e.target.value) })}
              className="w-full accent-blue-500 mt-1 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-500 mt-0.5">
              <span>Low Latency (1)</span>
              <span>Max Smoothness (100)</span>
            </div>
          </div>
        </div>

        {/* SVC Toggle */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-900/60 border border-slate-700/60">
          <button
            type="button"
            onClick={() => setTargetStream({ ...currentStream, svc_enabled: !currentStream.svc_enabled })}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
              currentStream.svc_enabled ? 'bg-blue-600' : 'bg-slate-700'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${
                currentStream.svc_enabled ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
          <div>
            <span className="text-xs font-medium text-slate-200">SVC (Scalable Video Coding)</span>
            <span className="text-[10px] text-slate-500 block">Enables adaptive quality layers for bandwidth-constrained viewers</span>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs sm:text-sm font-medium shadow-md shadow-blue-600/20 transition-all cursor-pointer"
          >
            Save Stream {streamChannel}
          </button>
        </div>
      </form>
    </div>
  );
};
