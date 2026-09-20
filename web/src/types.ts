export interface Camera {
  id: number;
  name: string;
  path: string;
  ip: string;
  username: string;
  has_password?: boolean;
  is_isapi: boolean;
  enabled: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DiscoveredDevice {
  ip: string;
  port: number;
  model: string;
  name: string;
  serial_number: string;
  mac: string;
  firmware_version: string;
  manufacturer: string;
  protocol: string;
  is_isapi: boolean;
  activated: boolean;
  already_added?: boolean;
  existing_camera_id?: number;
  existing_camera_name?: string;
}

export interface CameraDiscoveryResponse {
  cameras: DiscoveredDevice[];
  available_paths: string[];
}

export interface ProbeResponse {
  success: boolean;
  message?: string;
  device?: DiscoveredDevice;
  already_added?: boolean;
  existing_camera_id?: number;
  existing_camera_name?: string;
}

export interface RecordingSegment {
  id: number;
  camera_id: number;
  start: string; // "2026-09-15 12:00:00"
  end: string;
  group: number;
  datadir: number;
  file: number;
  videoStart: number;
  videoEnd: number;
  record_type: number;
  media_type?: 'video' | 'picture';
}

export interface SystemStatus {
  version: string;
  camera_count: number;
  event_count: number;
  cache_size_mb: number;
  ffmpeg_path: string;
  has_ffmpeg: boolean;
  uptime_sec: number;
}

export interface UserInfo {
  authenticated: boolean;
  username: string;
}

export interface Bookmark {
  id: number;
  camera_id: number;
  camera_name: string;
  title: string;
  notes: string;
  start_time: string;
  end_time: string;
  datadir: number;
  file: number;
  videoStart: number;
  videoEnd: number;
  record_type: number;
  created_at: string;
}

export interface RecordingDateInfo {
  date: string; // "YYYY-MM-DD"
  count: number;
}

// ==========================================
// ISAPI Camera Hardware & Settings Types
// ==========================================

export interface DeviceInfo {
  device_name: string;
  device_id: string;
  model: string;
  serial_number: string;
  mac_address: string;
  firmware_version: string;
  firmware_released_date: string;
  device_type: string;
  hardware_version?: string;
  uptime_sec?: number;
}

export interface DeviceTime {
  time_mode: string;
  local_time: string;
  time_zone: string;
}

export interface NTPServer {
  id: number;
  addressing_format_type: string;
  host_name: string;
  ip_address?: string;
  ipv6_address?: string;
  port_no: number;
  synchronize_interval: number;
}

export interface ImageSettings {
  channel_id: number;
  brightness: number;
  contrast: number;
  saturation: number;
  sharpness: number;
  ircut_filter_type: string;
  night_to_day_filter_level?: number;
  night_to_day_filter_time?: number;
  wdr_mode?: string;
  wdr_level?: number;
  image_flip_style?: string;
  white_balance?: string;
  white_balance_red?: number;
  white_balance_blue?: number;
  blc_enabled?: boolean;
  blc_mode?: string;
  hlc_enabled?: boolean;
  hlc_level?: number;
  noise_reduce_mode?: string;
  noise_reduce_level?: number;
  power_line_frequency_mode?: string;
  shutter_level?: string;
  gain_level?: number;
  supplement_light_mode?: string;
  white_light_brightness?: number;
  dehaze_mode?: string;
  exposure_mode?: string;

  // Supported capabilities detected dynamically from camera
  supported_ircut_filter_types?: string[];
  supported_wdr_modes?: string[];
  supported_white_balance_styles?: string[];
  supported_image_flip_styles?: string[];
  supported_power_line_frequency_modes?: string[];
  supported_blc_modes?: string[];
  supported_noise_reduce_modes?: string[];
  supported_shutter_levels?: string[];
  supported_supplement_light_modes?: string[];
  supported_dehaze_modes?: string[];
  has_blc?: boolean;
  has_hlc?: boolean;
  has_gain?: boolean;
  has_supplement_light?: boolean;
  has_noise_reduce?: boolean;
  has_dehaze?: boolean;
  has_white_balance_manual?: boolean;
}

export interface StreamSettings {
  id: number;
  channel_name: string;
  enabled: boolean;
  video_codec: string;
  resolution: string;
  width: number;
  height: number;
  bitrate_type: string;
  constant_bitrate: number;
  fixed_quality: number;
  fps: number;
  max_frame_rate: number;
  smoothing?: number;
  gov_length?: number;
  profile?: string;
  svc_enabled?: boolean;
  supported_resolutions?: string[];
  supported_fps?: number[];
  supported_codecs?: string[];
  supported_bitrate_types?: string[];
  supported_profiles?: string[];
}

export interface MotionRegion {
  id: number;
  enabled: boolean;
  sensitivity: number;
  day_sensitivity?: number;
  night_sensitivity?: number;
  percentage?: number; // object size / trigger threshold percentage (0-100)
  coordinates?: { x: number; y: number }[];
}

export interface MotionDetection {
  enabled: boolean;
  sensitivity: number;
  mode?: 'normal' | 'expert';
  grid_map?: string; // Hex string representing active grid blocks in normal mode
  row_granularity?: number;
  column_granularity?: number;
  day_sensitivity?: number;
  night_sensitivity?: number;
  day_night_switch_type?: string;
  enable_highlight?: boolean;
  target_type?: string; // Target detection: "human", "vehicle", "all"
  coordinates?: { x: number; y: number }[]; // Normal mode polygon box (3+ points)
  regions?: MotionRegion[];
}

export interface LineDetection {
  id: number;
  enabled: boolean;
  sensitivity: number;
  direction: string;
  detection_target?: string; // Target detection: "human", "vehicle", "all"
  coordinates?: { x: number; y: number }[];
}

export interface FieldDetection {
  id: number;
  enabled: boolean;
  sensitivity: number;
  time_threshold: number;
  detection_target?: string; // Target detection: "human", "vehicle", "all"
  coordinates?: { x: number; y: number }[];
}

export interface RegionEntrance {
  id: number;
  enabled: boolean;
  sensitivity: number;
  detection_target?: string; // Target detection: "human", "vehicle", "all"
  coordinates?: { x: number; y: number }[];
}

export interface RegionExiting {
  id: number;
  enabled: boolean;
  sensitivity: number;
  detection_target?: string; // Target detection: "human", "vehicle", "all"
  coordinates?: { x: number; y: number }[];
}

export interface UnattendedBaggage {
  id: number;
  enabled: boolean;
  sensitivity: number;
  time_threshold: number;
  coordinates?: { x: number; y: number }[];
}

export interface ObjectRemoval {
  id: number;
  enabled: boolean;
  sensitivity: number;
  time_threshold: number;
  coordinates?: { x: number; y: number }[];
}

export interface TamperDetection {
  enabled: boolean;
  sensitivity: number;
  coordinates?: { x: number; y: number }[];
}

export interface PrivacyMaskRegion {
  id: number;
  enabled: boolean;
  coordinates: Point[];
}

export interface PrivacyMask {
  enabled: boolean;
  normalized_screen_width?: number;
  normalized_screen_height?: number;
  regions: PrivacyMaskRegion[];
}

export interface HddInfo {
  id: number;
  name: string;
  type: string;
  status: string;
  capacity_mb: number;
  free_space_mb: number;
  property?: string;
  host_name?: string;
  path?: string;
}

export interface PTZPreset {
  id: number;
  name: string;
}

export interface CameraCapabilities {
  has_isapi: boolean;
  has_device_info: boolean;
  has_time: boolean;
  has_ntp: boolean;
  has_image_settings: boolean;
  has_wdr: boolean;
  has_image_flip: boolean;
  has_main_stream: boolean;
  has_sub_stream: boolean;
  has_motion_detection: boolean;
  has_line_detection: boolean;
  has_intrusion_detection: boolean;
  has_tamper_detection: boolean;
  has_privacy_mask?: boolean;
  has_unattended_baggage?: boolean;
  has_object_removal?: boolean;
  has_region_entrance?: boolean;
  has_region_exiting?: boolean;
  has_target_detection?: boolean;
  has_polygon_motion?: boolean;
  has_storage: boolean;
  has_ptz: boolean;
  supported_codecs: string[];
  supported_resolutions: string[];
}

export type Point = { x: number; y: number };
export type UnattendedBaggageDetection = UnattendedBaggage;
export type ObjectRemovalDetection = ObjectRemoval;
export type StorageDevice = HddInfo;
export type StreamChannel = StreamSettings;
