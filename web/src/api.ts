import type {
  Bookmark,
  Camera,
  CameraCapabilities,
  DeviceInfo,
  DeviceTime,
  FieldDetection,
  HddInfo,
  ImageSettings,
  LineDetection,
  MotionDetection,
  NTPServer,
  PTZPreset,
  RecordingDateInfo,
  RecordingSegment,
  StreamSettings,
  SystemStatus,
  TamperDetection,
  UnattendedBaggage,
  ObjectRemoval,
  RegionEntrance,
  RegionExiting,
  UserInfo,
} from './types';

const API_BASE = '/api';

export function getAuthToken(): string | null {
  return localStorage.getItem('token');
}

export function setAuthToken(token: string) {
  localStorage.setItem('token', token);
}

export function clearAuthToken() {
  localStorage.removeItem('token');
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});
  
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (res.status === 401) {
    clearAuthToken();
    window.dispatchEvent(new Event('auth:unauthorized'));
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errorData.error || `HTTP error ${res.status}`);
  }

  return res.json();
}

export const api = {
  // Auth
  login: (credentials: { username: string; password: string }) =>
    request<{ token: string; username: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    }),

  logout: () =>
    request<{ success: boolean }>('/auth/logout', { method: 'POST' }),

  getMe: () =>
    request<UserInfo>('/auth/me'),

  changePassword: (data: { current_password: string; new_password: string }) =>
    request<{ success: boolean }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Cameras
  getCameras: () =>
    request<Camera[]>('/cameras'),

  getCamera: (id: number) =>
    request<Camera>(`/cameras/${id}`),

  createCamera: (data: Partial<Camera> & { password?: string }) =>
    request<Camera>('/cameras', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateCamera: (id: number, data: Partial<Camera> & { password?: string }) =>
    request<Camera>(`/cameras/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteCamera: (id: number) =>
    request<{ success: boolean }>(`/cameras/${id}`, { method: 'DELETE' }),

  reorderCameras: (cameraIds: number[]) =>
    request<{ success: boolean }>('/cameras/reorder', {
      method: 'PUT',
      body: JSON.stringify({ camera_ids: cameraIds }),
    }),

  testConnection: (data: { ip: string; username: string; password?: string; is_isapi: boolean; camera_id?: number }) =>
    request<{ success: boolean; message: string }>('/cameras/test-connection', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  discoverPath: (path: string) =>
    request<{ valid: boolean; message: string; dirs: any[] }>('/cameras/discover-path', {
      method: 'POST',
      body: JSON.stringify({ path }),
    }),

  getSnapshotUrl: (cameraId: number, timestamp?: number) => {
    const token = getAuthToken();
    const t = timestamp || Date.now();
    return `${API_BASE}/cameras/${cameraId}/snapshot?t=${t}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
  },

  getLiveStreamUrl: (cameraId: number) => {
    const token = getAuthToken();
    return `${API_BASE}/cameras/${cameraId}/live?t=${Date.now()}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
  },

  getLiveWsUrl: (cameraId: number) => {
    const token = getAuthToken();
    const loc = window.location;
    const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = loc.host;
    return `${protocol}//${host}/api/ws/live?cameraId=${cameraId}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
  },

  getVideoUrl: (cameraId: number, datadir: number, file: number, start: number, end: number, resolution?: string) => {
    const token = getAuthToken();
    const res = resolution || 'original';
    return `${API_BASE}/cameras/${cameraId}/video?datadir=${datadir}&file=${file}&start=${start}&end=${end}&resolution=${res}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
  },

  getPictureUrl: (cameraId: number, datadir: number, file: number, start: number, end: number) => {
    const token = getAuthToken();
    return `${API_BASE}/cameras/${cameraId}/picture?datadir=${datadir}&file=${file}&start=${start}&end=${end}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
  },

  // Events
  getEvents: (params?: { cameras?: number[]; start?: number; end?: number; type?: 'video' | 'picture' }) => {
    const query = new URLSearchParams();
    if (params?.cameras && params.cameras.length > 0) {
      query.set('cameras', params.cameras.join(','));
    }
    if (params?.start) {
      query.set('start', params.start.toString());
    }
    if (params?.end) {
      query.set('end', params.end.toString());
    }
    if (params?.type) {
      query.set('type', params.type);
    }
    return request<RecordingSegment[]>(`/events?${query.toString()}`);
  },

  getRecordingDates: (cameras?: number[], type?: 'video' | 'picture') => {
    const query = new URLSearchParams();
    if (cameras && cameras.length > 0) {
      query.set('cameras', cameras.join(','));
    }
    if (type) {
      query.set('type', type);
    }
    return request<RecordingDateInfo[]>(`/events/dates?${query.toString()}`);
  },

  // Bookmarks
  getBookmarks: () =>
    request<Bookmark[]>('/bookmarks'),

  createBookmark: (data: Omit<Bookmark, 'id' | 'created_at'>) =>
    request<Bookmark>('/bookmarks', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateBookmark: (id: number, data: { title: string; notes: string }) =>
    request<{ success: boolean }>(`/bookmarks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteBookmark: (id: number) =>
    request<{ success: boolean }>(`/bookmarks/${id}`, {
      method: 'DELETE',
    }),

  // System
  getSystemStatus: () =>
    request<{ status: SystemStatus; is_scanning: boolean; last_scan: string }>('/system/status'),

  triggerRescan: () =>
    request<{ message: string; running: boolean }>('/system/rescan', { method: 'POST' }),

  clearCache: () =>
    request<{ message: string; success: boolean }>('/system/clear-cache', { method: 'POST' }),

  // ==========================================
  // Camera ISAPI Device Configuration & Control
  // ==========================================

  getCameraCapabilities: (id: number) =>
    request<CameraCapabilities>(`/cameras/${id}/isapi/capabilities`),

  getCameraDeviceInfo: (id: number) =>
    request<DeviceInfo>(`/cameras/${id}/isapi/device-info`),

  getCameraTime: (id: number) =>
    request<DeviceTime>(`/cameras/${id}/isapi/time`),

  setCameraTime: (id: number, data: DeviceTime) =>
    request<{ success: boolean; message: string }>(`/cameras/${id}/isapi/time`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  syncCameraTime: (id: number, data: { client_time: string; timezone?: string }) =>
    request<{ success: boolean; message: string; synced_time: string }>(`/cameras/${id}/isapi/sync-time`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getCameraNTP: (id: number) =>
    request<NTPServer>(`/cameras/${id}/isapi/ntp`),

  setCameraNTP: (id: number, data: NTPServer) =>
    request<{ success: boolean; message: string }>(`/cameras/${id}/isapi/ntp`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  getCameraImage: (id: number, channel?: number) =>
    request<ImageSettings>(`/cameras/${id}/isapi/image${channel ? `?channel=${channel}` : ''}`),

  setCameraImage: (id: number, data: ImageSettings) =>
    request<{ success: boolean; message: string }>(`/cameras/${id}/isapi/image`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  getCameraStream: (id: number, channel: number = 101) =>
    request<StreamSettings>(`/cameras/${id}/isapi/video/${channel}`),

  setCameraStream: (id: number, channel: number, data: StreamSettings) =>
    request<{ success: boolean; message: string }>(`/cameras/${id}/isapi/video/${channel}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  getCameraMotion: (id: number) =>
    request<MotionDetection>(`/cameras/${id}/isapi/motion`),

  setCameraMotion: (id: number, data: MotionDetection) =>
    request<{ success: boolean; message: string }>(`/cameras/${id}/isapi/motion`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  getCameraLineDetection: (id: number) =>
    request<LineDetection>(`/cameras/${id}/isapi/line-detection`),

  setCameraLineDetection: (id: number, data: LineDetection) =>
    request<{ success: boolean; message: string }>(`/cameras/${id}/isapi/line-detection`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  getCameraIntrusion: (id: number) =>
    request<FieldDetection>(`/cameras/${id}/isapi/intrusion`),

  setCameraIntrusion: (id: number, data: FieldDetection) =>
    request<{ success: boolean; message: string }>(`/cameras/${id}/isapi/intrusion`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  getCameraRegionEntrance: (id: number) =>
    request<RegionEntrance>(`/cameras/${id}/isapi/region-entrance`),

  setCameraRegionEntrance: (id: number, data: RegionEntrance) =>
    request<{ success: boolean; message: string }>(`/cameras/${id}/isapi/region-entrance`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  getCameraRegionExiting: (id: number) =>
    request<RegionExiting>(`/cameras/${id}/isapi/region-exiting`),

  setCameraRegionExiting: (id: number, data: RegionExiting) =>
    request<{ success: boolean; message: string }>(`/cameras/${id}/isapi/region-exiting`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  getCameraTamper: (id: number) =>
    request<TamperDetection>(`/cameras/${id}/isapi/tamper`),

  setCameraTamper: (id: number, data: TamperDetection) =>
    request<{ success: boolean; message: string }>(`/cameras/${id}/isapi/tamper`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  getCameraUnattendedBaggage: (id: number) =>
    request<UnattendedBaggage>(`/cameras/${id}/isapi/unattended-baggage`),

  setCameraUnattendedBaggage: (id: number, data: UnattendedBaggage) =>
    request<{ success: boolean; message: string }>(`/cameras/${id}/isapi/unattended-baggage`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  getCameraObjectRemoval: (id: number) =>
    request<ObjectRemoval>(`/cameras/${id}/isapi/object-removal`),

  setCameraObjectRemoval: (id: number, data: ObjectRemoval) =>
    request<{ success: boolean; message: string }>(`/cameras/${id}/isapi/object-removal`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  getCameraStorage: (id: number) =>
    request<HddInfo[]>(`/cameras/${id}/isapi/storage`),

  formatCameraStorage: (id: number, hddId: number) =>
    request<{ success: boolean; message: string }>(`/cameras/${id}/isapi/storage/${hddId}/format`, {
      method: 'POST',
    }),

  rebootCamera: (id: number) =>
    request<{ success: boolean; message: string }>(`/cameras/${id}/isapi/reboot`, {
      method: 'POST',
    }),

  ptzControl: (id: number, data: { pan: number; tilt: number; zoom: number }) =>
    request<{ success: boolean }>(`/cameras/${id}/isapi/ptz/control`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getPTZPresets: (id: number) =>
    request<PTZPreset[]>(`/cameras/${id}/isapi/ptz/presets`),

  ptzGoto: (id: number, presetId: number) =>
    request<{ success: boolean }>(`/cameras/${id}/isapi/ptz/goto`, {
      method: 'POST',
      body: JSON.stringify({ preset_id: presetId }),
    }),

  proxyISAPI: async (id: number, path: string, method = 'GET', body?: string, contentType = 'application/xml') => {
    const token = getAuthToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (contentType) headers['Content-Type'] = contentType;

    const res = await fetch(`${API_BASE}/cameras/${id}/isapi/proxy?path=${encodeURIComponent(path)}`, {
      method,
      headers,
      body: body || undefined,
    });
    const text = await res.text();
    return {
      status: res.status,
      contentType: res.headers.get('Content-Type') || 'text/plain',
      data: text,
    };
  },
};
