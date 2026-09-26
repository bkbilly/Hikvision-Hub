import type {
  Camera,
  DeviceInfo,
  SystemStatus,
  RecordingDateInfo,
  RecordingSegment,
  CameraEvent,
} from '../types';

export const MOCK_CAMERAS: Camera[] = [
  {
    id: 1,
    name: 'Front Entrance',
    ip: '192.168.1.101',
    path: '/mnt/cctv/front_entrance',
    username: 'admin',
    is_isapi: true,
    enabled: true,
    sort_order: 1,
    has_sub_stream: true,
    has_audio_input: true,
    has_audio_output: true,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-26T00:00:00Z',
  },
  {
    id: 2,
    name: 'Driveway & Street',
    ip: '192.168.1.102',
    path: '/mnt/cctv/driveway',
    username: 'admin',
    is_isapi: true,
    enabled: true,
    sort_order: 2,
    has_sub_stream: true,
    has_audio_input: true,
    has_audio_output: false,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-26T00:00:00Z',
  },
  {
    id: 3,
    name: 'Backyard Garden',
    ip: '192.168.1.103',
    path: '/mnt/cctv/backyard',
    username: 'admin',
    is_isapi: true,
    enabled: true,
    sort_order: 3,
    has_sub_stream: true,
    has_audio_input: false,
    has_audio_output: false,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-26T00:00:00Z',
  },
  {
    id: 4,
    name: 'Living Room',
    ip: '192.168.1.104',
    path: '/mnt/cctv/livingroom',
    username: 'admin',
    is_isapi: true,
    enabled: true,
    sort_order: 4,
    has_sub_stream: true,
    has_audio_input: true,
    has_audio_output: true,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-26T00:00:00Z',
  },
];

export const MOCK_DEVICE_INFO: Record<number, DeviceInfo> = {
  1: {
    device_name: 'Front Entrance IPC',
    device_id: '1',
    device_type: 'IPCamera',
    model: 'DS-2CD2386G2-ISU/SL',
    serial_number: 'DS-2CD2386G2-ISU/SL20240315AAWRK12345678',
    mac_address: '4c:bd:8f:2a:11:01',
    firmware_version: 'V5.7.12 build 240218',
    firmware_released_date: '2024-02-18',
  },
  2: {
    device_name: 'Driveway ColorVu',
    device_id: '2',
    device_type: 'IPCamera',
    model: 'DS-2CD2047G2-LU',
    serial_number: 'DS-2CD2047G2-LU20231102AAWRK87654321',
    mac_address: '4c:bd:8f:2a:11:02',
    firmware_version: 'V5.7.11 build 230915',
    firmware_released_date: '2023-09-15',
  },
  3: {
    device_name: 'Backyard AcuSense',
    device_id: '3',
    device_type: 'IPCamera',
    model: 'DS-2CD2T87G2-LSU',
    serial_number: 'DS-2CD2T87G2-LSU20240110AAWRK99887766',
    mac_address: '4c:bd:8f:2a:11:03',
    firmware_version: 'V5.7.14 build 240506',
    firmware_released_date: '2024-05-06',
  },
  4: {
    device_name: 'Living Room PTZ',
    device_id: '4',
    device_type: 'IPCamera',
    model: 'DS-2DE2A404IW-DE3',
    serial_number: 'DS-2DE2A404IW-DE320230820AAWRK44332211',
    mac_address: '4c:bd:8f:2a:11:04',
    firmware_version: 'V5.6.800 build 230712',
    firmware_released_date: '2023-07-12',
  },
};

export const MOCK_SYSTEM_STATUS: SystemStatus = {
  version: '2.2.0 (Demo)',
  camera_count: 4,
  event_count: 1420,
  cache_size_mb: 420,
  ffmpeg_path: '/usr/bin/ffmpeg',
  has_ffmpeg: true,
  uptime_sec: 1234567,
};

function escapeXml(unsafe: string): string {
  return (unsafe || '').replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

/**
 * Generates an SVG Data URI that looks like a high-tech surveillance camera frame
 * with live timestamp, OSD text, and realistic camera scene details.
 */
export function generateMockSnapshotSvg(cameraId: number, cameraName?: string): string {
  const cam = MOCK_CAMERAS.find((c) => c.id === cameraId) || MOCK_CAMERAS[0];
  const name = cameraName || cam.name;
  const safeName = escapeXml(name.toUpperCase());
  const now = new Date();
  const dateStr = now.toISOString().replace('T', ' ').substring(0, 19);

  // Varied scene themes per camera
  const themes: Record<number, { bgTop: string; bgBottom: string; decor: string; label: string }> = {
    1: {
      bgTop: '#0f172a',
      bgBottom: '#1e293b',
      decor: `
        <rect x="0" y="240" width="640" height="120" fill="#090d16" />
        <polygon points="120,240 280,100 360,100 520,240" fill="#141d2e" stroke="#253550" stroke-width="2" />
        <rect x="270" y="160" width="100" height="120" fill="#1b283d" stroke="#38bdf8" stroke-width="1.5" />
        <rect x="350" y="215" width="8" height="8" rx="4" fill="#fbbf24" />
        <path d="M 0 320 Q 320 280 640 320" stroke="#334155" stroke-width="2" fill="none" />
      `,
      label: 'CH 01 • FRONT PORCH',
    },
    2: {
      bgTop: '#0d131f',
      bgBottom: '#111827',
      decor: `
        <polygon points="0,360 220,180 420,180 640,360" fill="#0b0f19" stroke="#1f293d" />
        <line x1="320" y1="180" x2="320" y2="360" stroke="#f59e0b" stroke-dasharray="16,12" stroke-width="2" />
        <rect x="420" y="220" width="160" height="70" rx="8" fill="#1e293b" stroke="#475569" stroke-width="2" />
        <circle cx="450" cy="290" r="16" fill="#0f172a" stroke="#64748b" stroke-width="3" />
        <circle cx="550" cy="290" r="16" fill="#0f172a" stroke="#64748b" stroke-width="3" />
      `,
      label: 'CH 02 • DRIVEWAY 4K',
    },
    3: {
      bgTop: '#061715',
      bgBottom: '#0d2822',
      decor: `
        <rect x="0" y="220" width="640" height="140" fill="#04120f" />
        <circle cx="150" cy="180" r="60" fill="#062e24" opacity="0.6" />
        <circle cx="480" cy="160" r="80" fill="#062e24" opacity="0.6" />
        <rect x="220" y="260" width="200" height="40" rx="4" fill="#0a3a2d" stroke="#10b981" stroke-width="1.5" />
      `,
      label: 'CH 03 • BACKYARD',
    },
    4: {
      bgTop: '#18181b',
      bgBottom: '#27272a',
      decor: `
        <rect x="80" y="200" width="480" height="160" rx="12" fill="#141416" stroke="#3f3f46" stroke-width="2" />
        <rect x="140" y="120" width="180" height="100" rx="4" fill="#09090b" stroke="#71717a" stroke-width="2" />
        <circle cx="520" cy="120" r="28" fill="#f59e0b" opacity="0.2" />
        <circle cx="520" cy="120" r="14" fill="#fbbf24" opacity="0.7" />
      `,
      label: 'CH 04 • LIVING ROOM PTZ',
    },
  };

  const theme = themes[cameraId] || themes[1];
  const safeLabel = escapeXml(theme.label || '');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="100%" height="100%">
    <defs>
      <linearGradient id="bgGrad_${cameraId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${theme.bgTop}" />
        <stop offset="100%" stop-color="${theme.bgBottom}" />
      </linearGradient>
      <pattern id="grid_${cameraId}" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.02)" stroke-width="1"/>
      </pattern>
    </defs>

    <!-- Background -->
    <rect width="640" height="360" fill="url(#bgGrad_${cameraId})" />
    <rect width="640" height="360" fill="url(#grid_${cameraId})" />

    <!-- Scene Decor -->
    ${theme.decor}

    <!-- CCTV Crosshairs in Center -->
    <g stroke="rgba(255,255,255,0.15)" stroke-width="1">
      <line x1="300" y1="180" x2="315" y2="180" />
      <line x1="325" y1="180" x2="340" y2="180" />
      <line x1="320" y1="160" x2="320" y2="175" />
      <line x1="320" y1="185" x2="320" y2="200" />
    </g>

    <!-- Top OSD: Camera Name & Time -->
    <rect x="0" y="0" width="640" height="36" fill="rgba(0,0,0,0.55)" />
    <circle cx="20" cy="18" r="4" fill="#ef4444">
      <animate attributeName="opacity" values="1;0.2;1" dur="2s" repeatCount="indefinite" />
    </circle>
    <text x="32" y="22" font-family="monospace, monospace" font-size="12" font-weight="bold" fill="#f8fafc">${safeName}</text>
    <text x="620" y="22" text-anchor="end" font-family="monospace, monospace" font-size="12" fill="#38bdf8">${dateStr}</text>

    <!-- Bottom OSD: Channel, FPS, Resolution, Bitrate -->
    <rect x="0" y="332" width="640" height="28" fill="rgba(0,0,0,0.6)" />
    <text x="14" y="350" font-family="monospace, monospace" font-size="10" fill="#94a3b8">${safeLabel}</text>
    <text x="626" y="350" text-anchor="end" font-family="monospace, monospace" font-size="10" fill="#34d399">25.0 FPS • 4096 Kbps • H.265+</text>
  </svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * External MP4 sample video URL for demo playback (no local video binary in repository).
 */
export const MOCK_VIDEO_SAMPLE_URL = 'https://www.w3schools.com/html/mov_bbb.mp4';

/**
 * Generates mock recording dates for the last 14 days using local date formatting.
 */
interface MockScheduleSlot {
  start: string;
  end: string;
  type: number; // 0: continuous, 1: motion, 2: alarm
  eventType: string;
  eventLabel: string;
  eventDesc: string;
}

const CAMERA_SCHEDULES: Record<number, MockScheduleSlot[]> = {
  // Camera 1: Front Entrance
  1: [
    { start: '08:14:00', end: '08:35:00', type: 1, eventType: 'motion', eventLabel: 'Motion', eventDesc: 'Morning departure' },
    { start: '10:25:00', end: '10:52:00', type: 1, eventType: 'line_crossing', eventLabel: 'Line Crossing', eventDesc: 'Courier delivery' },
    { start: '12:35:00', end: '13:05:00', type: 1, eventType: 'motion', eventLabel: 'Motion', eventDesc: 'Mail delivery' },
    { start: '17:40:00', end: '18:15:00', type: 1, eventType: 'motion', eventLabel: 'Motion', eventDesc: 'Evening arrival' },
  ],
  // Camera 2: Driveway & Street
  2: [
    { start: '07:50:00', end: '08:40:00', type: 0, eventType: 'motion', eventLabel: 'Motion', eventDesc: 'Morning traffic' },
    { start: '11:15:00', end: '11:45:00', type: 1, eventType: 'field_detection', eventLabel: 'Intrusion', eventDesc: 'Driveway vehicle activity' },
    { start: '16:10:00', end: '16:50:00', type: 1, eventType: 'line_crossing', eventLabel: 'Line Crossing', eventDesc: 'Car entered premises' },
    { start: '19:00:00', end: '19:45:00', type: 0, eventType: 'motion', eventLabel: 'Motion', eventDesc: 'Evening traffic' },
  ],
  // Camera 3: Backyard Garden
  3: [
    { start: '09:15:00', end: '09:55:00', type: 0, eventType: 'motion', eventLabel: 'Motion', eventDesc: 'Morning garden check' },
    { start: '14:20:00', end: '14:50:00', type: 1, eventType: 'motion', eventLabel: 'Motion', eventDesc: 'Patio movement detected' },
    { start: '18:10:00', end: '19:00:00', type: 0, eventType: 'motion', eventLabel: 'Motion', eventDesc: 'Sunset in garden' },
    { start: '22:30:00', end: '22:50:00', type: 2, eventType: 'field_detection', eventLabel: 'Intrusion', eventDesc: 'Perimeter night alert' },
  ],
  // Camera 4: Living Room
  4: [
    { start: '07:15:00', end: '08:00:00', type: 0, eventType: 'motion', eventLabel: 'Motion', eventDesc: 'Morning routine' },
    { start: '12:20:00', end: '13:00:00', type: 1, eventType: 'motion', eventLabel: 'Motion', eventDesc: 'Lunchtime activity' },
    { start: '18:45:00', end: '20:15:00', type: 0, eventType: 'motion', eventLabel: 'Motion', eventDesc: 'Evening family gathering' },
  ],
};

function parseClockSec(timeStr: string): number {
  const [h, m, s] = timeStr.split(':').map(Number);
  return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
}

/**
 * Generates mock recording dates for the last 14 days using local date formatting.
 */
export function getMockRecordingDates(): RecordingDateInfo[] {
  const dates: RecordingDateInfo[] = [];
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');

  for (let i = 0; i < 14; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    dates.push({
      date: dateStr,
      count: i === 0 ? 15 : Math.floor(12 + (i % 3) * 2),
    });
  }

  return dates;
}

/**
 * Generates clean, realistic mock recording segments and events for a given camera and date.
 */
export function getMockRecordingSegments(
  cameraId: number,
  dateStr: string,
  mediaType: 'video' | 'picture' = 'video'
): {
  segments: RecordingSegment[];
  events: CameraEvent[];
} {
  const segments: RecordingSegment[] = [];
  const events: CameraEvent[] = [];

  const cam = MOCK_CAMERAS.find((c) => c.id === cameraId) || MOCK_CAMERAS[0];
  const slots = CAMERA_SCHEDULES[cameraId] || CAMERA_SCHEDULES[1];

  slots.forEach((slot, idx) => {
    const videoStart = parseClockSec(slot.start);
    const videoEnd = parseClockSec(slot.end);

    if (mediaType === 'picture') {
      // 1 distinct photo snapshot per event slot
      segments.push({
        id: cameraId * 10000 + idx + 1,
        camera_id: cameraId,
        start: `${dateStr} ${slot.start}`,
        end: `${dateStr} ${slot.start}`,
        group: cameraId,
        datadir: 0,
        file: idx + 1,
        videoStart,
        videoEnd: videoStart,
        record_type: slot.type,
        media_type: 'picture',
      });
    } else {
      // Distinct video recording clip with visible gaps between events
      segments.push({
        id: cameraId * 10000 + idx + 1,
        camera_id: cameraId,
        start: `${dateStr} ${slot.start}`,
        end: `${dateStr} ${slot.end}`,
        group: cameraId,
        datadir: 0,
        file: idx + 1,
        videoStart,
        videoEnd,
        record_type: slot.type,
        media_type: 'video',
      });
    }

    events.push({
      id: `${cameraId}-${idx + 1}`,
      camera_id: cameraId,
      camera_name: cam.name,
      channel_id: 1,
      event_type: slot.eventType,
      raw_type: slot.eventType,
      event_label: slot.eventLabel,
      event_state: 'active',
      description: slot.eventDesc,
      start_time: `${dateStr} ${slot.start}`,
      end_time: `${dateStr} ${slot.end}`,
      duration_sec: Math.max(30, videoEnd - videoStart),
    });
  });

  return { segments, events };
}

/**
 * Initial list of simulated live events for the alert drawer.
 */
export const MOCK_INITIAL_EVENTS: CameraEvent[] = [
  {
    id: '101',
    camera_id: 1,
    camera_name: 'Front Entrance',
    channel_id: 1,
    event_type: 'motion',
    raw_type: 'motion',
    event_label: 'Motion',
    event_state: 'active',
    start_time: new Date(Date.now() - 45 * 1000).toISOString(),
    description: 'Human motion detected near entrance',
    duration_sec: 45,
  },
  {
    id: '102',
    camera_id: 2,
    camera_name: 'Driveway & Street',
    channel_id: 1,
    event_type: 'line_crossing',
    raw_type: 'linedetection',
    event_label: 'Line Crossing',
    event_state: 'active',
    start_time: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
    description: 'Vehicle crossed driveway boundary line',
    duration_sec: 180,
  },
  {
    id: '103',
    camera_id: 4,
    camera_name: 'Living Room',
    channel_id: 1,
    event_type: 'field_detection',
    raw_type: 'fielddetection',
    event_label: 'Intrusion',
    event_state: 'active',
    start_time: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
    description: 'Intrusion detected in living room zone',
    duration_sec: 480,
  },
];
