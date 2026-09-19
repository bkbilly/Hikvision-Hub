package hikvision

import "encoding/xml"

// ==========================================
// ISAPI XML Data Models
// ==========================================

// DeviceInfo represents camera hardware/firmware metadata.
type DeviceInfo struct {
	XMLName              xml.Name `xml:"DeviceInfo" json:"-"`
	DeviceName           string   `xml:"deviceName" json:"device_name"`
	DeviceID             string   `xml:"deviceID" json:"device_id"`
	Model                string   `xml:"model" json:"model"`
	SerialNumber         string   `xml:"serialNumber" json:"serial_number"`
	MacAddress           string   `xml:"macAddress" json:"mac_address"`
	FirmwareVersion      string   `xml:"firmwareVersion" json:"firmware_version"`
	FirmwareReleasedDate string   `xml:"firmwareReleasedDate" json:"firmware_released_date"`
	DeviceType           string   `xml:"deviceType" json:"device_type"`
	HardwareVersion      string   `xml:"hardwareVersion" json:"hardware_version,omitempty"`
	EncoderVersion       string   `xml:"encoderVersion" json:"encoder_version,omitempty"`
}

// DeviceTime represents camera clock & timezone.
type DeviceTime struct {
	XMLName   xml.Name `xml:"Time" json:"-"`
	TimeMode  string   `xml:"timeMode" json:"time_mode"`   // "manual" or "NTP"
	LocalTime string   `xml:"localTime" json:"local_time"` // "YYYY-MM-DDTHH:MM:SS"
	TimeZone  string   `xml:"timeZone" json:"time_zone"`   // e.g. "CST-2:00:00"
}

// NTPServer represents NTP time synchronization settings.
type NTPServer struct {
	XMLName             xml.Name `xml:"NTPServer" json:"-"`
	ID                  int      `xml:"id" json:"id"`
	AddressingFormat    string   `xml:"addressingFormatType" json:"addressing_format_type"` // "hostname" or "ipaddress"
	HostName            string   `xml:"hostName" json:"host_name"`
	PortNo              int      `xml:"portNo" json:"port_no"`
	SynchronizeInterval int      `xml:"synchronizeInterval" json:"synchronize_interval"` // minutes
}

// Point represents a normalized 2D coordinate (0..1000).
type Point struct {
	X int `json:"x"`
	Y int `json:"y"`
}

// ImageSettings represents display, color, and exposure adjustments.
type ImageSettings struct {
	XMLName          xml.Name `xml:"ImageChannel" json:"-"`
	ChannelID        int      `xml:"videoInputChannelID" json:"channel_id"`
	Brightness              int      `xml:"brightnessLevel" json:"brightness"`
	Contrast                int      `xml:"contrastLevel" json:"contrast"`
	Saturation              int      `xml:"saturationLevel" json:"saturation"`
	Sharpness               int      `xml:"sharpnessLevel" json:"sharpness"`
	IRCutFilterType         string   `xml:"ircutFilterType" json:"ircut_filter_type"` // "auto", "day", "night", "schedule", "eventTrigger"
	NightToDayFilterLevel   int      `json:"night_to_day_filter_level,omitempty"`     // 0-7
	NightToDayFilterTime    int      `json:"night_to_day_filter_time,omitempty"`      // 5-120
	WDRMode                 string   `json:"wdr_mode,omitempty"`                      // "close", "open", "auto"
	WDRLevel                int      `json:"wdr_level,omitempty"`                     // 0-100
	ImageFlipStyle          string   `json:"image_flip_style,omitempty"`              // "OFF", "LEFTRIGHT", "UPDOWN", "CENTER"
	WhiteBalance            string   `json:"white_balance,omitempty"`                 // "auto1", "manual", etc.
	WhiteBalanceRed         int      `json:"white_balance_red,omitempty"`             // 0-100
	WhiteBalanceBlue        int      `json:"white_balance_blue,omitempty"`            // 0-100
	BLCEnabled              bool     `json:"blc_enabled"`
	BLCMode                 string   `json:"blc_mode,omitempty"`                      // "CLOSE", "UP", "DOWN", "LEFT", "RIGHT", "CENTER", "AUTO", "Region"
	HLCEnabled              bool     `json:"hlc_enabled"`
	HLCLevel                int      `json:"hlc_level,omitempty"`                     // 0-100
	NoiseReduceMode         string   `json:"noise_reduce_mode,omitempty"`             // "close", "general", "advanced"
	NoiseReduceLevel        int      `json:"noise_reduce_level,omitempty"`            // 0-100
	PowerLineFrequencyMode  string   `json:"power_line_frequency_mode,omitempty"`     // "50hz", "60hz"
	ShutterLevel            string   `json:"shutter_level,omitempty"`                 // "1/30", "1/12", etc.
	GainLevel               int      `json:"gain_level,omitempty"`                    // 0-100
	SupplementLightMode     string   `json:"supplement_light_mode,omitempty"`         // "close", "colorVuWhiteLight"
	WhiteLightBrightness    int      `json:"white_light_brightness,omitempty"`        // 0-100
	DehazeMode              string   `json:"dehaze_mode,omitempty"`                   // "close", "open", "auto"
	ExposureMode            string   `json:"exposure_mode,omitempty"`                 // "auto", "manual"

	// Supported capabilities detected dynamically from camera
	SupportedIRCutFilterTypes       []string `json:"supported_ircut_filter_types,omitempty"`
	SupportedWDRModes               []string `json:"supported_wdr_modes,omitempty"`
	SupportedWhiteBalanceStyles     []string `json:"supported_white_balance_styles,omitempty"`
	SupportedImageFlipStyles        []string `json:"supported_image_flip_styles,omitempty"`
	SupportedPowerLineFrequencyModes []string `json:"supported_power_line_frequency_modes,omitempty"`
	SupportedBLCModes               []string `json:"supported_blc_modes,omitempty"`
	SupportedNoiseReduceModes       []string `json:"supported_noise_reduce_modes,omitempty"`
	SupportedShutterLevels          []string `json:"supported_shutter_levels,omitempty"`
	SupportedSupplementLightModes   []string `json:"supported_supplement_light_modes,omitempty"`
	SupportedDehazeModes            []string `json:"supported_dehaze_modes,omitempty"`
	HasBLC                          bool     `json:"has_blc"`
	HasHLC                          bool     `json:"has_hlc"`
	HasGain                         bool     `json:"has_gain"`
	HasSupplementLight              bool     `json:"has_supplement_light"`
	HasNoiseReduce                  bool     `json:"has_noise_reduce"`
	HasDehaze                       bool     `json:"has_dehaze"`
	HasWhiteBalanceManual           bool     `json:"has_white_balance_manual"`
}

// StreamSettings represents video compression & resolution for channel 101/102.
type StreamSettings struct {
	XMLName               xml.Name `xml:"StreamingChannel" json:"-"`
	ID                    int      `xml:"id" json:"id"`
	ChannelName           string   `xml:"channelName" json:"channel_name"`
	Enabled               bool     `xml:"enabled" json:"enabled"`
	VideoCodec            string   `json:"video_codec"`       // "H.264", "H.265", "MJPEG"
	Resolution            string   `json:"resolution"`        // e.g. "1920x1080"
	Width                 int      `json:"width"`
	Height                int      `json:"height"`
	BitrateType           string   `json:"bitrate_type"`      // "VBR", "CBR"
	ConstantBitrate       int      `json:"constant_bitrate"`  // kbps (e.g. 4096)
	FixedQuality          int      `json:"fixed_quality"`     // 1-100 (VBR quality level)
	FPS                   int      `json:"fps"`               // standard FPS (e.g. 25, 30)
	MaxFrameRate          int      `json:"max_frame_rate"`    // centi-FPS (e.g. 2500)
	Smoothing             int      `json:"smoothing"`         // 1-100 (jitter/smoothness buffer, default 50)
	GovLength             int      `json:"gov_length"`        // I-Frame / keyframe interval (GOP length)
	Profile               string   `json:"profile"`           // "Main", "High", "Baseline"
	SVCEnabled            bool     `json:"svc_enabled"`       // Scalable Video Coding
	SupportedResolutions  []string `json:"supported_resolutions,omitempty"`
	SupportedFPS          []int    `json:"supported_fps,omitempty"`
	SupportedCodecs       []string `json:"supported_codecs,omitempty"`
	SupportedBitrateTypes []string `json:"supported_bitrate_types,omitempty"`
	SupportedProfiles     []string `json:"supported_profiles,omitempty"`
}

// MotionRegion represents an individual detection area in Expert mode.
type MotionRegion struct {
	ID               int     `json:"id"`
	Enabled          bool    `json:"enabled"`
	Sensitivity      int     `json:"sensitivity"`
	DaySensitivity   int     `json:"day_sensitivity,omitempty"`
	NightSensitivity int     `json:"night_sensitivity,omitempty"`
	Percentage       int     `json:"percentage,omitempty"` // Object size threshold percentage (0-100)
	Coordinates      []Point `json:"coordinates,omitempty"`
}

// MotionDetection represents motion detection settings supporting normal and expert modes.
type MotionDetection struct {
	XMLName            xml.Name       `xml:"MotionDetection" json:"-"`
	Enabled            bool           `xml:"enabled" json:"enabled"`
	Sensitivity        int            `json:"sensitivity"` // 1-100 (master/normal sensitivity)
	Mode               string         `json:"mode,omitempty"` // "normal" or "expert"
	GridMap            string         `json:"grid_map,omitempty"` // Hex string representing active grid blocks in normal mode
	RowGranularity     int            `json:"row_granularity,omitempty"`
	ColumnGranularity  int            `json:"column_granularity,omitempty"`
	DaySensitivity     int            `json:"day_sensitivity,omitempty"` // 1-100 (expert mode default)
	NightSensitivity   int            `json:"night_sensitivity,omitempty"` // 1-100 (expert mode default)
	DayNightSwitchType string         `json:"day_night_switch_type,omitempty"` // "auto", "schedule", "close"
	EnableHighlight    bool           `json:"enable_highlight,omitempty"` // Dynamic motion highlight
	TargetType         string         `json:"target_type,omitempty"` // Target detection: "human", "vehicle"
	Coordinates        []Point        `json:"coordinates,omitempty"` // Normal mode polygon coordinates (3+ points)
	Regions            []MotionRegion `json:"regions,omitempty"` // Expert mode multi-areas (up to 8)
}

// LineDetection represents Line Crossing VCA detection.
type LineDetection struct {
	XMLName         xml.Name `xml:"LineDetection" json:"-"`
	ID              int      `xml:"id" json:"id"`
	Enabled         bool     `xml:"enabled" json:"enabled"`
	Sensitivity     int      `json:"sensitivity"`  // 1-100
	Direction       string   `json:"direction"`    // "both", "leftToRight" (A->B), "rightToLeft" (B->A)
	DetectionTarget string   `json:"detection_target,omitempty"` // "human", "vehicle", or empty
	Coordinates     []Point  `json:"coordinates,omitempty"`
}

// FieldDetection represents Intrusion / Region Entrance detection.
type FieldDetection struct {
	XMLName         xml.Name `xml:"FieldDetection" json:"-"`
	ID              int      `xml:"id" json:"id"`
	Enabled         bool     `xml:"enabled" json:"enabled"`
	Sensitivity     int      `json:"sensitivity"`    // 1-100
	TimeThreshold   int      `json:"time_threshold"` // 1-10 seconds
	DetectionTarget string   `json:"detection_target,omitempty"` // "human", "vehicle", or empty
	Coordinates     []Point  `json:"coordinates,omitempty"`
}

// RegionEntrance represents Region Entrance smart detection.
type RegionEntrance struct {
	XMLName         xml.Name `xml:"RegionEntrance" json:"-"`
	ID              int      `xml:"id" json:"id"`
	Enabled         bool     `xml:"enabled" json:"enabled"`
	Sensitivity     int      `json:"sensitivity"`
	DetectionTarget string   `json:"detection_target,omitempty"`
	Coordinates     []Point  `json:"coordinates,omitempty"`
}

// RegionExiting represents Region Exiting smart detection.
type RegionExiting struct {
	XMLName         xml.Name `xml:"RegionExiting" json:"-"`
	ID              int      `xml:"id" json:"id"`
	Enabled         bool     `xml:"enabled" json:"enabled"`
	Sensitivity     int      `json:"sensitivity"`
	DetectionTarget string   `json:"detection_target,omitempty"`
	Coordinates     []Point  `json:"coordinates,omitempty"`
}

// UnattendedBaggage represents Unattended Baggage / Left Luggage smart detection.
type UnattendedBaggage struct {
	XMLName       xml.Name `xml:"UnattendedBaggage" json:"-"`
	ID            int      `xml:"id" json:"id"`
	Enabled       bool     `xml:"enabled" json:"enabled"`
	Sensitivity   int      `json:"sensitivity"`    // 1-100
	TimeThreshold int      `json:"time_threshold"` // 5-100 seconds
	Coordinates   []Point  `json:"coordinates,omitempty"`
}

// ObjectRemoval represents Object Removal / Taken Away smart detection.
type ObjectRemoval struct {
	XMLName       xml.Name `xml:"ObjectRemoval" json:"-"`
	ID            int      `xml:"id" json:"id"`
	Enabled       bool     `xml:"enabled" json:"enabled"`
	Sensitivity   int      `json:"sensitivity"`    // 1-100
	TimeThreshold int      `json:"time_threshold"` // 5-100 seconds
	Coordinates   []Point  `json:"coordinates,omitempty"`
}

// TamperDetection represents camera sabotage / video blinding detection with regional area.
type TamperDetection struct {
	XMLName     xml.Name `xml:"TamperDetection" json:"-"`
	Enabled     bool     `xml:"enabled" json:"enabled"`
	Sensitivity int      `json:"sensitivity"`
	Coordinates []Point  `json:"coordinates,omitempty"`
}

// HddInfo represents an SD card, HDD, or NAS volume on the camera.
type HddInfo struct {
	ID          int    `json:"id"`
	Name        string `json:"name"`
	Type        string `json:"type"`                // "SD", "NAS", "HD", "NFS", "SMB/CIFS"
	Status      string `json:"status"`              // "normal", "formatting", "error", "unformatted", "offline"
	CapacityMB  int64  `json:"capacity_mb"`
	FreeSpaceMB int64  `json:"free_space_mb"`
	Property    string `json:"property,omitempty"`  // "RW", "RO"
	HostName    string `json:"host_name,omitempty"` // NAS Host / IP
	Path        string `json:"path,omitempty"`      // NAS Mount Path
}

// PTZPreset represents a PTZ preset target.
type PTZPreset struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

// CameraCapabilities summarizes supported features for dynamic UI rendering.
type CameraCapabilities struct {
	HasISAPI               bool     `json:"has_isapi"`
	HasDeviceInfo          bool     `json:"has_device_info"`
	HasTime                bool     `json:"has_time"`
	HasNTP                 bool     `json:"has_ntp"`
	HasImageSettings       bool     `json:"has_image_settings"`
	HasWDR                 bool     `json:"has_wdr"`
	HasImageFlip           bool     `json:"has_image_flip"`
	HasMainStream          bool     `json:"has_main_stream"`
	HasSubStream           bool     `json:"has_sub_stream"`
	HasMotionDetection     bool     `json:"has_motion_detection"`
	HasLineDetection       bool     `json:"has_line_detection"`
	HasIntrusionDetection  bool     `json:"has_intrusion_detection"`
	HasTamperDetection     bool     `json:"has_tamper_detection"`
	HasUnattendedBaggage   bool     `json:"has_unattended_baggage"`
	HasObjectRemoval       bool     `json:"has_object_removal"`
	HasRegionEntrance      bool     `json:"has_region_entrance"`
	HasRegionExiting       bool     `json:"has_region_exiting"`
	HasTargetDetection     bool     `json:"has_target_detection"`
	HasPolygonMotion       bool     `json:"has_polygon_motion"`
	HasStorage             bool     `json:"has_storage"`
	HasPTZ                 bool     `json:"has_ptz"`
	SupportedCodecs        []string `json:"supported_codecs"`
	SupportedResolutions   []string `json:"supported_resolutions"`
}
