import {
  MOCK_CAMERAS,
  MOCK_DEVICE_INFO,
  MOCK_SYSTEM_STATUS,
  MOCK_INITIAL_EVENTS,
  getMockRecordingDates,
  getMockRecordingSegments,
} from './mockData';
import type { Bookmark, RecordingSegment } from '../types';

// In-memory state for settings persistence during the demo session
let camerasState = [...MOCK_CAMERAS];
let bookmarksState: Bookmark[] = [];
let imageSettingsState: Record<number, any> = {};
let streamSettingsState: Record<number, any> = {};
let motionSettingsState: Record<number, any> = {};
let privacyMaskState: Record<number, any> = {};

/**
 * Intercepts requests in demo mode and returns realistic mock JSON data.
 */
export async function handleDemoRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();

  // Small synthetic delay for realism (60ms)
  await new Promise((resolve) => setTimeout(resolve, 60));

  // --- Auth ---
  if (endpoint === '/auth/login') {
    return { token: 'demo-session-token', username: 'demo-admin' } as T;
  }
  if (endpoint === '/auth/me') {
    return { id: 1, username: 'demo-admin', role: 'admin' } as T;
  }
  if (endpoint === '/auth/logout' || endpoint === '/auth/change-password') {
    return { success: true, message: 'Success' } as T;
  }

  // --- Bookmarks ---
  if (endpoint === '/bookmarks' || endpoint.startsWith('/bookmarks')) {
    if (method === 'POST') {
      const body = options.body ? JSON.parse(options.body as string) : {};
      const newBm: Bookmark = {
        id: Date.now(),
        camera_id: body.camera_id || 1,
        camera_name: 'Front Entrance',
        title: body.title || 'Demo Bookmark',
        notes: body.notes || '',
        start_time: body.start_time || new Date().toISOString(),
        end_time: body.end_time || new Date().toISOString(),
        datadir: body.datadir || 0,
        file: body.file || 1,
        videoStart: body.videoStart || 0,
        videoEnd: body.videoEnd || 60,
        record_type: 1,
        created_at: new Date().toISOString(),
      };
      bookmarksState.push(newBm);
      return newBm as T;
    }
    if (method === 'DELETE') {
      const parts = endpoint.split('/');
      const bmId = parseInt(parts[parts.length - 1] || '0', 10);
      bookmarksState = bookmarksState.filter((b) => b.id !== bmId);
      return { success: true } as T;
    }
    return bookmarksState as T;
  }

  // --- Cameras List & CRUD ---
  if (endpoint === '/cameras' && method === 'GET') {
    return camerasState as T;
  }
  if (endpoint === '/cameras/reorder') {
    return { success: true } as T;
  }
  if (endpoint === '/cameras/test-connection') {
    return {
      success: true,
      message: 'Connection successful (Hikvision ISAPI)',
      is_isapi: true,
      has_audio_input: true,
      has_audio_output: true,
      has_sub_stream: true,
    } as T;
  }
  if (endpoint === '/cameras/discover-path') {
    return { valid: true, message: 'Storage path accessible', dirs: ['datadir0', 'datadir1'] } as T;
  }
  if (endpoint === '/cameras/discover') {
    return {
      cameras: [
        {
          ip: '192.168.1.105',
          port: 80,
          mac: '4c:bd:8f:2a:11:05',
          name: 'Front Gate (Unadded)',
          model: 'DS-2CD2087G2-L',
          serial_number: 'DS-2CD2087G2-L20240401AAWRK',
          firmware_version: 'V5.7.14',
          manufacturer: 'Hikvision',
          protocol: 'ISAPI',
          is_isapi: true,
          activated: true,
          already_added: false,
        },
      ],
      available_paths: ['/mnt/cctv/gate'],
    } as T;
  }

  // Single Camera match: /cameras/:id/...
  const camMatch = endpoint.match(/^\/cameras\/(\d+)(.*)$/);
  if (camMatch) {
    const camId = parseInt(camMatch[1], 10);
    // Strip query string (e.g. ?channel=1)
    const rawSub = camMatch[2].split('?')[0];
    // Strip leading /isapi if present to normalize
    const subPath = rawSub.startsWith('/isapi') ? rawSub.substring(6) : rawSub;

    if (!subPath && method === 'GET') {
      const cam = camerasState.find((c) => c.id === camId) || camerasState[0];
      return cam as T;
    }
    if (!subPath && method === 'PUT') {
      return { success: true, message: 'Camera updated' } as T;
    }

    if (subPath === '/detect-audio') {
      return {
        success: true,
        has_audio_input: true,
        has_audio_output: true,
        has_sub_stream: true,
      } as T;
    }
    if (subPath === '/talk') {
      return { success: true, bytes: 8000, samples: 8000 } as T;
    }
    if (subPath === '/reboot') {
      return { success: true, message: 'Camera reboot command sent (simulated)' } as T;
    }

    // --- ISAPI Capabilities ---
    if (subPath === '/capabilities') {
      return {
        has_isapi: true,
        has_device_info: true,
        has_time: true,
        has_ntp: true,
        has_image_settings: true,
        has_wdr: true,
        has_image_flip: true,
        has_main_stream: true,
        has_sub_stream: true,
        has_motion_detection: true,
        has_line_detection: true,
        has_intrusion_detection: true,
        has_tamper_detection: true,
        has_privacy_mask: true,
        has_target_detection: true,
        has_polygon_motion: true,
        has_storage: true,
        has_record_schedule: true,
        has_capture: true,
        has_ptz: camId === 4,
      } as T;
    }

    // --- Device Info ---
    if (subPath === '/device-info') {
      return (MOCK_DEVICE_INFO[camId] || MOCK_DEVICE_INFO[1]) as T;
    }

    // --- Time & NTP ---
    if (subPath === '/time') {
      const now = new Date();
      return {
        time_mode: 'manual',
        local_time: now.toISOString().replace('T', ' ').substring(0, 19),
        time_zone: 'UTC',
      } as T;
    }
    if (subPath === '/sync-time') {
      const now = new Date();
      return {
        success: true,
        message: 'Camera time synchronized with browser',
        synced_time: now.toISOString().replace('T', ' ').substring(0, 19),
      } as T;
    }
    if (subPath === '/ntp') {
      if (method === 'PUT') {
        return { success: true, message: 'NTP settings saved' } as T;
      }
      return {
        id: 1,
        addressing_format_type: 'hostname',
        host_name: 'pool.ntp.org',
        port_no: 123,
        synchronize_interval: 60,
      } as T;
    }

    // --- Image Settings ---
    if (subPath === '/image') {
      if (method === 'PUT') {
        const body = options.body ? JSON.parse(options.body as string) : {};
        imageSettingsState[camId] = { ...(imageSettingsState[camId] || {}), ...body };
        return { success: true, message: 'Image settings saved' } as T;
      }
      return (imageSettingsState[camId] || {
        channel_id: 1,
        brightness: 52,
        contrast: 50,
        saturation: 55,
        sharpness: 60,
        ircut_filter_type: 'auto',
        night_to_day_filter_level: 4,
        night_to_day_filter_time: 5,
        wdr_mode: 'close',
        wdr_level: 50,
        image_flip_style: 'OFF',
        white_balance: 'auto',
        blc_enabled: false,
        noise_reduce_mode: 'normal',
        noise_reduce_level: 50,
        power_line_frequency_mode: '50hz',
        supported_ircut_filter_types: ['auto', 'day', 'night'],
        supported_wdr_modes: ['close', 'open'],
        supported_white_balance_styles: ['auto', 'manual'],
        supported_image_flip_styles: ['OFF', 'LEFTRIGHT', 'UPDOWN', 'CENTER'],
      }) as T;
    }

    // --- Video Stream Settings ---
    if (subPath.startsWith('/video')) {
      if (method === 'PUT') {
        const body = options.body ? JSON.parse(options.body as string) : {};
        streamSettingsState[camId] = { ...(streamSettingsState[camId] || {}), ...body };
        return { success: true, message: 'Stream settings applied' } as T;
      }
      const isSub = subPath.includes('102') || subPath.includes('2');
      return (streamSettingsState[camId] || (isSub
        ? {
            video_codec: 'H.265',
            resolution: '640x360',
            frame_rate: 25,
            bitrate_kbps: 512,
            bitrate_type: 'vbr',
            interval_i_frame: 50,
            audio_codec: 'G.711alaw',
            audio_enabled: true,
          }
        : {
            video_codec: 'H.265',
            resolution: '3840x2160',
            frame_rate: 25,
            bitrate_kbps: 6144,
            bitrate_type: 'vbr',
            interval_i_frame: 50,
            audio_codec: 'G.711alaw',
            audio_enabled: true,
          })) as T;
    }

    // --- Smart Events & Motion ---
    if (subPath === '/motion') {
      if (method === 'PUT') {
        const body = options.body ? JSON.parse(options.body as string) : {};
        motionSettingsState[camId] = { ...(motionSettingsState[camId] || {}), ...body };
        return { success: true, message: 'Motion detection updated' } as T;
      }
      return (motionSettingsState[camId] || {
        enabled: true,
        sampling_interval: 1,
        highlight_enabled: true,
        sensitivity: 65,
        target_types: ['human', 'vehicle'],
        region_type: 'polygon',
        coordinates: [
          { x: 120, y: 140 },
          { x: 520, y: 140 },
          { x: 560, y: 340 },
          { x: 80, y: 340 },
        ],
      }) as T;
    }
    if (subPath === '/line-detection') {
      if (method === 'PUT') return { success: true, message: 'Line detection updated' } as T;
      return {
        enabled: true,
        sensitivity: 70,
        direction: 'both',
        target_types: ['human', 'vehicle'],
        coordinates: [{ x: 100, y: 220 }, { x: 540, y: 220 }],
      } as T;
    }
    if (subPath === '/intrusion') {
      if (method === 'PUT') return { success: true, message: 'Intrusion detection updated' } as T;
      return {
        enabled: true,
        sensitivity: 60,
        time_threshold_seconds: 2,
        target_types: ['human'],
        coordinates: [
          { x: 180, y: 160 },
          { x: 460, y: 160 },
          { x: 460, y: 320 },
          { x: 180, y: 320 },
        ],
      } as T;
    }
    if (subPath === '/region-entrance' || subPath === '/region-exiting') {
      if (method === 'PUT') return { success: true, message: 'Region detection updated' } as T;
      return {
        enabled: false,
        sensitivity: 50,
        target_types: ['human'],
        coordinates: [
          { x: 200, y: 200 },
          { x: 440, y: 200 },
          { x: 440, y: 300 },
          { x: 200, y: 300 },
        ],
      } as T;
    }
    if (subPath === '/unattended-baggage' || subPath === '/object-removal') {
      if (method === 'PUT') return { success: true, message: 'Smart detection updated' } as T;
      return {
        enabled: false,
        sensitivity: 50,
        time_threshold_seconds: 5,
        coordinates: [
          { x: 150, y: 150 },
          { x: 350, y: 150 },
          { x: 350, y: 300 },
          { x: 150, y: 300 },
        ],
      } as T;
    }
    if (subPath === '/tamper' || subPath === '/scene-change' || subPath === '/face-detection') {
      if (method === 'PUT') return { success: true, message: 'Setting saved' } as T;
      return { enabled: false, sensitivity: 50 } as T;
    }
    if (subPath.startsWith('/events/') && subPath.includes('/schedule')) {
      return { enabled: true } as T;
    }
    if (subPath.startsWith('/events/') && subPath.includes('/linkage')) {
      return {
        notify_surveillance_center: true,
        send_email: false,
        upload_to_ftp: false,
        trigger_recording: true,
      } as T;
    }

    // --- Privacy Mask ---
    if (subPath === '/privacy-mask') {
      if (method === 'PUT') {
        const body = options.body ? JSON.parse(options.body as string) : {};
        privacyMaskState[camId] = { ...(privacyMaskState[camId] || {}), ...body };
        return { success: true, message: 'Privacy mask saved' } as T;
      }
      return (privacyMaskState[camId] || {
        enabled: true,
        normalized_screen_width: 704,
        normalized_screen_height: 480,
        regions: [
          {
            id: 1,
            enabled: true,
            coordinates: [
              { x: 100, y: 100 },
              { x: 400, y: 100 },
              { x: 400, y: 350 },
              { x: 100, y: 350 },
            ],
          },
        ],
      }) as T;
    }

    // --- Storage & Quota ---
    if (subPath === '/storage') {
      return [
        {
          id: 1,
          name: 'Surveillance HDD 1',
          type: 'SATA',
          status: 'ok',
          capacity_mb: 4000000,
          free_space_mb: 1120000,
          property: 'rw',
        },
        {
          id: 2,
          name: 'MicroSD Card',
          type: 'SD',
          status: 'ok',
          capacity_mb: 256000,
          free_space_mb: 84000,
          property: 'rw',
        },
      ] as T;
    }
    if (subPath.startsWith('/storage/') && subPath.includes('/format')) {
      return { success: true, message: 'Drive format simulated' } as T;
    }
    if (subPath === '/storage/quota') {
      if (method === 'PUT') return { success: true, message: 'Quota saved' } as T;
      return { video_percent: 85, picture_percent: 15 } as T;
    }
    if (subPath.startsWith('/storage/schedule')) {
      if (method === 'PUT') return { success: true, message: 'Record schedule saved' } as T;
      return {
        enabled: true,
        record_type: 'continuous',
      } as T;
    }
    if (subPath === '/capture') {
      if (method === 'PUT') return { success: true, message: 'Capture settings saved' } as T;
      return {
        channel_id: camId,
        timing_capture: {
          enabled: true,
          resolution: '1920*1080',
          quality: 80,
          interval_ms: 5000,
        },
        event_capture: {
          enabled: true,
          resolution: '1920*1080',
          quality: 80,
          interval_ms: 1000,
          capture_count: 3,
        },
        schedule: {
          track_id: 103,
          enabled: true,
          enable_schedule: true,
          pre_record_time_seconds: 5,
          post_record_time_seconds: 5,
          days: [1, 2, 3, 4, 5, 6, 7].map((d) => ({
            day_of_week: d,
            time_ranges: [{ begin_time: '00:00:00', end_time: '24:00:00', record_mode: 'CMR' }],
          })),
        },
      } as T;
    }

    // --- PTZ ---
    if (subPath.startsWith('/ptz')) {
      return { success: true, message: 'PTZ action executed' } as T;
    }
  }

  // --- Recordings & Playback ---
  if (endpoint === '/recordings/dates' || endpoint.startsWith('/events/dates')) {
    return getMockRecordingDates() as T;
  }
  if (endpoint === '/events/live') {
    return {
      active: [MOCK_INITIAL_EVENTS[0]],
      recent: MOCK_INITIAL_EVENTS,
    } as T;
  }
  if (endpoint.startsWith('/events') || endpoint.startsWith('/recordings')) {
    const query = endpoint.includes('?') ? endpoint.split('?')[1] : '';
    const params = new URLSearchParams(query);
    const camParam = params.get('cameras') || params.get('cameraId');
    const parsedCams = camParam
      ? camParam.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n) && n > 0)
      : [];
    const cameraIds = parsedCams.length > 0 ? parsedCams : [1, 2, 3, 4];

    const startSec = parseInt(params.get('start') || '0', 10);
    const endSec = parseInt(params.get('end') || '0', 10);
    const mediaType = (params.get('type') as 'video' | 'picture') || 'video';

    const pad = (n: number) => n.toString().padStart(2, '0');
    const datesToGenerate: string[] = [];

    const explicitDate = params.get('date');
    if (explicitDate) {
      datesToGenerate.push(explicitDate);
    } else if (startSec > 0 && endSec > 0) {
      const cur = new Date(startSec * 1000);
      cur.setHours(0, 0, 0, 0);
      const endLimit = new Date(endSec * 1000);
      endLimit.setHours(23, 59, 59, 999);

      while (cur <= endLimit) {
        const dStr = `${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}`;
        if (!datesToGenerate.includes(dStr)) {
          datesToGenerate.push(dStr);
        }
        cur.setDate(cur.getDate() + 1);
      }
    } else {
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yestStr = `${yesterday.getFullYear()}-${pad(yesterday.getMonth() + 1)}-${pad(yesterday.getDate())}`;
      datesToGenerate.push(yestStr, todayStr);
    }

    const allSegments: RecordingSegment[] = [];
    let segIdCounter = 1;

    for (const cId of cameraIds) {
      for (const dStr of datesToGenerate) {
        const { segments } = getMockRecordingSegments(cId, dStr, mediaType);
        for (const s of segments) {
          allSegments.push({
            ...s,
            id: segIdCounter++,
          });
        }
      }
    }

    return allSegments as T;
  }

  // --- System Status ---
  if (endpoint === '/system/status') {
    return MOCK_SYSTEM_STATUS as T;
  }
  if (endpoint === '/system/rescan' || endpoint === '/system/clear-cache') {
    return { success: true, message: 'Task completed successfully (demo)' } as T;
  }

  // Fallback for unhandled endpoints
  return { success: true } as T;
}
