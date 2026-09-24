package hikvision

import (
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"regexp"
	"strings"
	"testing"
	"time"
)

func TestISAPIGetDeviceInfo(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/ISAPI/System/deviceInfo" {
			w.Header().Set("Content-Type", "application/xml")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?>
<DeviceInfo version="1.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <deviceName>Front Porch</deviceName>
  <deviceID>88888888-8888-8888-8888-888888888888</deviceID>
  <model>DS-2CD2042WD-I</model>
  <serialNumber>DS-2CD2042WD-I20160101AAWR123456789</serialNumber>
  <macAddress>bc:54:51:11:22:33</macAddress>
  <firmwareVersion>V5.5.82</firmwareVersion>
  <firmwareReleasedDate>build 190909</firmwareReleasedDate>
  <deviceType>IPCamera</deviceType>
</DeviceInfo>`))
			return
		}
		http.NotFound(w, r)
	}))
	defer ts.Close()

	host := strings.TrimPrefix(ts.URL, "http://")
	client := NewCameraClient()

	info, err := client.GetDeviceInfo(host, "admin", "12345")
	if err != nil {
		t.Fatalf("GetDeviceInfo failed: %v", err)
	}

	if info.DeviceName != "Front Porch" {
		t.Errorf("expected DeviceName 'Front Porch', got '%s'", info.DeviceName)
	}
	if info.Model != "DS-2CD2042WD-I" {
		t.Errorf("expected Model 'DS-2CD2042WD-I', got '%s'", info.Model)
	}
	if info.FirmwareVersion != "V5.5.82" {
		t.Errorf("expected FirmwareVersion 'V5.5.82', got '%s'", info.FirmwareVersion)
	}
}

func TestISAPITimeAndSync(t *testing.T) {
	var receivedPUT string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/ISAPI/System/time" {
			if r.Method == "GET" {
				w.Header().Set("Content-Type", "application/xml")
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?>
<Time version="1.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <timeMode>manual</timeMode>
  <localTime>2026-09-19T16:00:00</localTime>
  <timeZone>CST-2:00:00</timeZone>
</Time>`))
				return
			}
			if r.Method == "PUT" {
				buf := make([]byte, 1024)
				n, _ := r.Body.Read(buf)
				receivedPUT = string(buf[:n])
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte(`<ResponseStatus><statusCode>1</statusCode><statusString>OK</statusString></ResponseStatus>`))
				return
			}
		}
		http.NotFound(w, r)
	}))
	defer ts.Close()

	host := strings.TrimPrefix(ts.URL, "http://")
	client := NewCameraClient()

	timeInfo, err := client.GetTime(host, "admin", "12345")
	if err != nil {
		t.Fatalf("GetTime failed: %v", err)
	}
	if timeInfo.LocalTime != "2026-09-19T16:00:00" {
		t.Errorf("expected localTime '2026-09-19T16:00:00', got '%s'", timeInfo.LocalTime)
	}

	targetTime, _ := time.Parse("2006-01-02 15:04:05", "2026-09-19 16:30:00")
	if err := client.SyncTimeToCurrent(host, "admin", "12345", targetTime, "CST-2:00:00"); err != nil {
		t.Fatalf("SyncTimeToCurrent failed: %v", err)
	}

	if !strings.Contains(receivedPUT, "2026-09-19T16:30:00") {
		t.Errorf("expected PUT payload to contain 2026-09-19T16:30:00, got: %s", receivedPUT)
	}
}

func TestISAPINTPGetAndSet(t *testing.T) {
	var receivedPUT string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/ISAPI/System/time/ntpServers/1" {
			if r.Method == "GET" {
				w.Header().Set("Content-Type", "application/xml")
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?>
<NTPServer version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
<id>1</id>
<addressingFormatType>ipaddress</addressingFormatType>
<ipAddress>192.0.2.150</ipAddress>
<portNo>123</portNo>
<synchronizeInterval>2</synchronizeInterval>
</NTPServer>`))
				return
			}
			if r.Method == "PUT" {
				buf := make([]byte, 1024)
				n, _ := r.Body.Read(buf)
				receivedPUT = string(buf[:n])
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte(`<ResponseStatus><statusCode>1</statusCode></ResponseStatus>`))
				return
			}
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer ts.Close()

	host := strings.TrimPrefix(ts.URL, "http://")
	client := NewCameraClient()

	ntp, err := client.GetNTP(host, "admin", "12345")
	if err != nil {
		t.Fatalf("GetNTP failed: %v", err)
	}

	if ntp.HostName != "192.0.2.150" {
		t.Errorf("expected HostName '192.0.2.150', got '%s'", ntp.HostName)
	}
	if ntp.IPAddress != "192.0.2.150" {
		t.Errorf("expected IPAddress '192.0.2.150', got '%s'", ntp.IPAddress)
	}
	if ntp.PortNo != 123 {
		t.Errorf("expected PortNo 123, got %d", ntp.PortNo)
	}
	if ntp.SynchronizeInterval != 2 {
		t.Errorf("expected SynchronizeInterval 2, got %d", ntp.SynchronizeInterval)
	}

	// Test SetNTP with an IP address
	err = client.SetNTP(host, "admin", "12345", NTPServer{
		HostName:            "192.0.2.150",
		PortNo:              123,
		SynchronizeInterval: 5,
	})
	if err != nil {
		t.Fatalf("SetNTP failed: %v", err)
	}

	if !strings.Contains(receivedPUT, "<ipAddress>192.0.2.150</ipAddress>") {
		t.Errorf("expected payload to contain <ipAddress>192.0.2.150</ipAddress>, got: %s", receivedPUT)
	}
	if !strings.Contains(receivedPUT, "<addressingFormatType>ipaddress</addressingFormatType>") {
		t.Errorf("expected payload to contain <addressingFormatType>ipaddress</addressingFormatType>, got: %s", receivedPUT)
	}
}

func TestISAPIImageSettings(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/ISAPI/Image/channels/1/display":
			w.Header().Set("Content-Type", "application/xml")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?>
<ImageChannel version="1.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <videoInputChannelID>1</videoInputChannelID>
  <brightnessLevel>70</brightnessLevel>
  <contrastLevel>60</contrastLevel>
  <saturationLevel>65</saturationLevel>
  <sharpnessLevel>50</sharpnessLevel>
</ImageChannel>`))
		case "/ISAPI/Image/channels/1/ircutFilter":
			w.Header().Set("Content-Type", "application/xml")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?>
<IrcutFilter version="1.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <ircutFilterType>auto</ircutFilterType>
</IrcutFilter>`))
		case "/ISAPI/Image/channels/1/backlight":
			w.Header().Set("Content-Type", "application/xml")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?>
<Backlight version="1.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <WDR><mode>open</mode><WDRLevel>45</WDRLevel></WDR>
</Backlight>`))
		default:
			w.WriteHeader(http.StatusOK)
		}
	}))
	defer ts.Close()

	host := strings.TrimPrefix(ts.URL, "http://")
	client := NewCameraClient()

	img, err := client.GetImageSettings(host, "admin", "12345", 1)
	if err != nil {
		t.Fatalf("GetImageSettings failed: %v", err)
	}

	if img.Brightness != 70 {
		t.Errorf("expected Brightness 70, got %d", img.Brightness)
	}
	if img.Contrast != 60 {
		t.Errorf("expected Contrast 60, got %d", img.Contrast)
	}
	if img.IRCutFilterType != "auto" {
		t.Errorf("expected IRCutFilterType 'auto', got '%s'", img.IRCutFilterType)
	}
	if img.WDRMode != "open" {
		t.Errorf("expected WDRMode 'open', got '%s'", img.WDRMode)
	}
	if img.WDRLevel != 45 {
		t.Errorf("expected WDRLevel 45, got %d", img.WDRLevel)
	}
}

func TestISAPIExtendedImageSettings(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/ISAPI/Image/channels/1/capabilities":
			w.Header().Set("Content-Type", "application/xml")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?>
<ImageChannel version="2.0">
  <IrcutFilter><IrcutFilterType opt="day,night,auto,schedule">schedule</IrcutFilterType></IrcutFilter>
  <WDR><mode opt="close,open,auto">close</mode></WDR>
  <BLC><enabled opt="true,false">false</enabled><BLCMode opt="CLOSE,UP,DOWN,LEFT,RIGHT,CENTER,AUTO">CLOSE</BLCMode></BLC>
  <HLC><enabled opt="true,false">false</enabled></HLC>
  <SupplementLight><supplementLightMode opt="colorVuWhiteLight,close">close</supplementLightMode></SupplementLight>
  <WhiteBalance><WhiteBalanceStyle opt="manual,auto1,locked">auto1</WhiteBalanceStyle><WhiteBalanceRed min="0" max="100">0</WhiteBalanceRed></WhiteBalance>
  <Shutter><ShutterLevel opt="1/12,1/30,1/60,1/120">1/30</ShutterLevel></Shutter>
  <NoiseReduce><mode opt="close,general,advanced">general</mode></NoiseReduce>
  <powerLineFrequency><powerLineFrequencyMode opt="50hz,60hz">60hz</powerLineFrequencyMode></powerLineFrequency>
  <Gain><GainLevel min="0" max="100">50</GainLevel></Gain>
</ImageChannel>`))
		case "/ISAPI/Image/channels/1":
			w.Header().Set("Content-Type", "application/xml")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?>
<ImageChannel version="2.0">
  <brightnessLevel>55</brightnessLevel>
  <contrastLevel>52</contrastLevel>
  <saturationLevel>48</saturationLevel>
  <sharpnessLevel>65</sharpnessLevel>
  <IrcutFilter><IrcutFilterType>schedule</IrcutFilterType><nightToDayFilterLevel>4</nightToDayFilterLevel><nightToDayFilterTime>5</nightToDayFilterTime></IrcutFilter>
  <WDR><mode>close</mode><WDRLevel>50</WDRLevel></WDR>
  <BLC><enabled>true</enabled><BLCMode>CENTER</BLCMode></BLC>
  <HLC><enabled>true</enabled><HLCLevel>60</HLCLevel></HLC>
  <NoiseReduce><mode>general</mode><GeneralMode><generalLevel>70</generalLevel></GeneralMode></NoiseReduce>
  <Shutter><ShutterLevel>1/60</ShutterLevel></Shutter>
  <Gain><GainLevel>80</GainLevel></Gain>
  <SupplementLight><supplementLightMode>colorVuWhiteLight</supplementLightMode><whiteLightBrightness>40</whiteLightBrightness></SupplementLight>
  <powerLineFrequency><powerLineFrequencyMode>50hz</powerLineFrequencyMode></powerLineFrequency>
  <WhiteBalance><WhiteBalanceStyle>auto1</WhiteBalanceStyle></WhiteBalance>
</ImageChannel>`))
		default:
			w.WriteHeader(http.StatusOK)
		}
	}))
	defer ts.Close()

	host := strings.TrimPrefix(ts.URL, "http://")
	client := NewCameraClient()

	img, err := client.GetImageSettings(host, "admin", "12345", 1)
	if err != nil {
		t.Fatalf("GetImageSettings failed: %v", err)
	}

	if !img.HasBLC || img.BLCMode != "CENTER" || !img.BLCEnabled {
		t.Errorf("expected BLC enabled with CENTER, got HasBLC=%v, Mode=%s, Enabled=%v", img.HasBLC, img.BLCMode, img.BLCEnabled)
	}
	if !img.HasHLC || !img.HLCEnabled || img.HLCLevel != 60 {
		t.Errorf("expected HLC enabled with 60, got HasHLC=%v, Enabled=%v, Level=%d", img.HasHLC, img.HLCEnabled, img.HLCLevel)
	}
	if !img.HasSupplementLight || img.SupplementLightMode != "colorVuWhiteLight" || img.WhiteLightBrightness != 40 {
		t.Errorf("expected SupplementLight colorVuWhiteLight 40, got %s %d", img.SupplementLightMode, img.WhiteLightBrightness)
	}
	if img.ShutterLevel != "1/60" {
		t.Errorf("expected ShutterLevel 1/60, got %s", img.ShutterLevel)
	}
	if img.GainLevel != 80 {
		t.Errorf("expected GainLevel 80, got %d", img.GainLevel)
	}
	if img.NoiseReduceMode != "general" || img.NoiseReduceLevel != 70 {
		t.Errorf("expected NoiseReduce general 70, got %s %d", img.NoiseReduceMode, img.NoiseReduceLevel)
	}
	if len(img.SupportedShutterLevels) != 4 {
		t.Errorf("expected 4 shutter levels, got %d", len(img.SupportedShutterLevels))
	}
	if !img.HasWhiteBalanceManual {
		t.Errorf("expected HasWhiteBalanceManual to be true")
	}

	// Test saving settings
	err = client.SetImageSettings(host, "admin", "12345", 1, *img)
	if err != nil {
		t.Errorf("SetImageSettings failed: %v", err)
	}
}

func TestISAPILineAndIntrusionDetection(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/ISAPI/Smart/LineDetection/1":
			w.Header().Set("Content-Type", "application/xml")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?>
<LineDetection version="1.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <id>1</id>
  <enabled>true</enabled>
  <LineDetectionRegionList>
    <LineDetectionRegion>
      <id>1</id>
      <enabled>true</enabled>
      <sensitivityLevel>80</sensitivityLevel>
      <direction>both</direction>
    </LineDetectionRegion>
  </LineDetectionRegionList>
</LineDetection>`))
		case "/ISAPI/Smart/FieldDetection/1":
			w.Header().Set("Content-Type", "application/xml")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?>
<FieldDetection version="1.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <id>1</id>
  <enabled>true</enabled>
  <FieldDetectionRegionList>
    <FieldDetectionRegion>
      <id>1</id>
      <enabled>true</enabled>
      <sensitivityLevel>75</sensitivityLevel>
      <timeThreshold>3</timeThreshold>
    </FieldDetectionRegion>
  </FieldDetectionRegionList>
</FieldDetection>`))
		default:
			w.WriteHeader(http.StatusOK)
		}
	}))
	defer ts.Close()

	host := strings.TrimPrefix(ts.URL, "http://")
	client := NewCameraClient()

	line, err := client.GetLineDetection(host, "admin", "12345", 1)
	if err != nil {
		t.Fatalf("GetLineDetection failed: %v", err)
	}
	if !line.Enabled || line.Sensitivity != 80 || line.Direction != "both" {
		t.Errorf("unexpected LineDetection values: %+v", line)
	}

	field, err := client.GetIntrusionDetection(host, "admin", "12345", 1)
	if err != nil {
		t.Fatalf("GetIntrusionDetection failed: %v", err)
	}
	if !field.Enabled || field.Sensitivity != 75 || field.TimeThreshold != 3 {
		t.Errorf("unexpected FieldDetection values: %+v", field)
	}
}

func TestISAPICapabilitiesProbe(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/ISAPI/System/deviceInfo",
			"/ISAPI/System/time",
			"/ISAPI/Image/channels/1/display",
			"/ISAPI/Streaming/channels/101",
			"/ISAPI/Smart/LineDetection/1":
			w.WriteHeader(http.StatusOK)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer ts.Close()

	host := strings.TrimPrefix(ts.URL, "http://")
	client := NewCameraClient()

	caps, err := client.ProbeCapabilities(host, "admin", "12345")
	if err != nil {
		t.Fatalf("ProbeCapabilities failed: %v", err)
	}

	if !caps.HasISAPI || !caps.HasDeviceInfo || !caps.HasTime || !caps.HasImageSettings || !caps.HasMainStream || !caps.HasLineDetection {
		t.Errorf("expected detected capabilities, got: %+v", caps)
	}
	if caps.HasTamperDetection {
		t.Errorf("expected HasTamperDetection false, got true")
	}
}

func TestISAPIGetStorageInfo(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/ISAPI/ContentMgmt/Storage/hdd":
			w.Header().Set("Content-Type", "application/xml")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?>
<HddList version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <Hdd>
    <id>1</id>
    <hddName>sd1</hddName>
    <hddType>HD</hddType>
    <status>normal</status>
    <capacity>61050</capacity>
    <freeSpace>45000</freeSpace>
  </Hdd>
  <Hdd>
    <id>9</id>
    <hddName>nas1</hddName>
    <hddType>NAS</hddType>
    <status>normal</status>
    <capacity>1907726</capacity>
    <freeSpace>1200000</freeSpace>
    <property>RW</property>
  </Hdd>
</HddList>`))
		case "/ISAPI/ContentMgmt/nasServers":
			w.Header().Set("Content-Type", "application/xml")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?>
<nasServerList version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <nasServer>
    <id>1</id>
    <addressingFormatType>hostname</addressingFormatType>
    <hostName>192.168.1.100</hostName>
    <nasPath>/volume1/hikvision</nasPath>
    <nasType>NFS</nasType>
  </nasServer>
</nasServerList>`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer ts.Close()

	host := strings.TrimPrefix(ts.URL, "http://")
	client := NewCameraClient()

	storage, err := client.GetStorageInfo(host, "admin", "12345")
	if err != nil {
		t.Fatalf("GetStorageInfo failed: %v", err)
	}

	if len(storage) < 2 {
		t.Fatalf("expected at least 2 storage entries, got %d", len(storage))
	}

	// Verify SD card
	sd := storage[0]
	if sd.ID != 1 || sd.Name != "sd1" || sd.CapacityMB != 61050 {
		t.Errorf("unexpected SD card entry: %+v", sd)
	}

	// Verify NAS volume with merged network parameters
	nas := storage[1]
	if nas.ID != 9 || nas.CapacityMB != 1907726 || nas.HostName != "192.168.1.100" || nas.Path != "/volume1/hikvision" {
		t.Errorf("unexpected NAS entry: %+v", nas)
	}
}

func TestISAPINasOnlyStorage(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/ISAPI/ContentMgmt/Storage/nas":
			w.Header().Set("Content-Type", "application/xml")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?>
<nasServerList version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <nasServer>
    <id>1</id>
    <addressingFormatType>ipaddress</addressingFormatType>
    <ipAddress>192.168.1.50</ipAddress>
    <nasPath>/mnt/storage/cam1</nasPath>
    <nasType>SMB</nasType>
    <status>normal</status>
    <capacity>1048576</capacity>
    <freeSpace>524288</freeSpace>
  </nasServer>
  <nasServer>
    <id>2</id>
    <addressingFormatType>hostname</addressingFormatType>
    <hostName></hostName>
    <nasPath></nasPath>
    <status>offline</status>
    <capacity>0</capacity>
  </nasServer>
</nasServerList>`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer ts.Close()

	host := strings.TrimPrefix(ts.URL, "http://")
	client := NewCameraClient()

	storage, err := client.GetStorageInfo(host, "admin", "12345")
	if err != nil {
		t.Fatalf("GetStorageInfo failed: %v", err)
	}

	if len(storage) != 1 {
		t.Fatalf("expected exactly 1 configured NAS entry, got %d", len(storage))
	}

	nas := storage[0]
	if nas.ID != 1 || nas.HostName != "192.168.1.50" || nas.Path != "/mnt/storage/cam1" || nas.CapacityMB != 1048576 || nas.FreeSpaceMB != 524288 {
		t.Errorf("unexpected NAS entry: %+v", nas)
	}
}

func TestISAPINasMountTypeSMBCIFS(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/ISAPI/ContentMgmt/Storage" {
			w.Header().Set("Content-Type", "application/xml")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?>
<storage version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
<nasList version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
<nas version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
<id>9</id>
<ipAddress>192.168.1.150</ipAddress>
<nasType>NFS</nasType>
<path>/mnt/hikvision/spicam4</path>
<status>ok</status>
<capacity>146560</capacity>
<mountType>NFS</mountType>
</nas>
<nas version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
<id>10</id>
<ipAddress>192.168.1.222</ipAddress>
<nasType>NFS</nasType>
<path>/test1/iew</path>
<status>offline</status>
<capacity>0</capacity>
<mountType>SMB/CIFS</mountType>
</nas>
</nasList>
</storage>`))
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer ts.Close()

	host := strings.TrimPrefix(ts.URL, "http://")
	client := NewCameraClient()

	storage, err := client.GetStorageInfo(host, "admin", "12345")
	if err != nil {
		t.Fatalf("GetStorageInfo failed: %v", err)
	}

	if len(storage) != 2 {
		t.Fatalf("expected 2 storage entries, got %d", len(storage))
	}

	if storage[0].Type != "NFS" {
		t.Errorf("expected NAS 9 type to be NFS, got %s", storage[0].Type)
	}
	if storage[1].Type != "SMB/CIFS" {
		t.Errorf("expected NAS 10 type to be SMB/CIFS, got %s", storage[1].Type)
	}
}

func TestISAPIMotionNormalAndExpert(t *testing.T) {
	var receivedPUT string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/ISAPI/System/Video/inputs/channels/1/motionDetection" {
			if r.Method == "GET" {
				w.Header().Set("Content-Type", "application/xml")
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?>
<MotionDetection version="1.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <enabled>true</enabled>
  <motionDetectionType>expert</motionDetectionType>
  <enableHighlight>true</enableHighlight>
  <dayNightSwitchType>auto</dayNightSwitchType>
  <MotionDetectionRegionList>
    <MotionDetectionRegion>
      <id>1</id>
      <enabled>true</enabled>
      <sensitivityLevel>65</sensitivityLevel>
      <daySensitivityLevel>75</daySensitivityLevel>
      <nightSensitivityLevel>45</nightSensitivityLevel>
    </MotionDetectionRegion>
  </MotionDetectionRegionList>
</MotionDetection>`))
				return
			}
			if r.Method == "PUT" {
				buf := make([]byte, 2048)
				n, _ := r.Body.Read(buf)
				receivedPUT = string(buf[:n])
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte(`<ResponseStatus><statusCode>1</statusCode><statusString>OK</statusString></ResponseStatus>`))
				return
			}
		}
		http.NotFound(w, r)
	}))
	defer ts.Close()

	host := strings.TrimPrefix(ts.URL, "http://")
	client := NewCameraClient()

	motion, err := client.GetMotionDetection(host, "admin", "12345", 1)
	if err != nil {
		t.Fatalf("GetMotionDetection failed: %v", err)
	}
	if !motion.Enabled || motion.Mode != "expert" || motion.DaySensitivity != 75 || motion.NightSensitivity != 45 || !motion.EnableHighlight {
		t.Errorf("unexpected MotionDetection parsed: %+v", motion)
	}

	motion.DaySensitivity = 85
	if len(motion.Regions) > 0 {
		motion.Regions[0].DaySensitivity = 85
	}
	if err := client.SetMotionDetection(host, "admin", "12345", 1, *motion); err != nil {
		t.Fatalf("SetMotionDetection failed: %v", err)
	}
	if !strings.Contains(receivedPUT, "<daySensitivityLevel>85</daySensitivityLevel>") || !strings.Contains(receivedPUT, "<motionDetectionType>expert</motionDetectionType>") {
		t.Errorf("unexpected PUT body for expert motion: %s", receivedPUT)
	}

	// Test polygon normal motion: must emit regionType=region without gridMap
	polyMotion := MotionDetection{
		Enabled:     true,
		Sensitivity: 60,
		Coordinates: []Point{
			{X: 183, Y: 200},
			{X: 750, Y: 150},
			{X: 880, Y: 600},
			{X: 500, Y: 850},
			{X: 220, Y: 650},
		},
		TargetType: "human",
	}
	if err := client.SetMotionDetection(host, "admin", "12345", 1, polyMotion); err != nil {
		t.Fatalf("SetMotionDetection for polygon failed: %v", err)
	}
	if !strings.Contains(receivedPUT, "<regionType>region</regionType>") {
		t.Errorf("expected <regionType>region</regionType> in PUT body, got: %s", receivedPUT)
	}
	if strings.Contains(receivedPUT, "<gridMap>") {
		t.Errorf("expected NO <gridMap> in polygon PUT body, got: %s", receivedPUT)
	}
	if !strings.Contains(receivedPUT, "<positionX>183</positionX>") || !strings.Contains(receivedPUT, "<positionY>800</positionY>") {
		t.Errorf("expected coordinates (183, 800) in PUT body, got: %s", receivedPUT)
	}
}

func TestISAPIMotionExtCoordinatesAndNormalization(t *testing.T) {
	var receivedPUT string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/ISAPI/System/Video/inputs/channels/1/motionDetection":
			w.Header().Set("Content-Type", "application/xml")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?>
<MotionDetection version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <enabled>true</enabled>
  <regionType>grid</regionType>
  <MotionDetectionLayout version="2.0">
    <sensitivityLevel>50</sensitivityLevel>
  </MotionDetectionLayout>
</MotionDetection>`))
		case "/ISAPI/System/Video/inputs/channels/1/motionDetectionExt":
			if r.Method == "GET" {
				w.Header().Set("Content-Type", "application/xml")
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?>
<MotionDetectionExt version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <enabled>true</enabled>
  <activeMode>expert</activeMode>
  <ROI>
    <minHorizontalResolution>1000</minHorizontalResolution>
    <maxHorizontalResolution>1000</maxHorizontalResolution>
  </ROI>
  <MotionDetectionRegionList size="2">
    <MotionDetectionRegion>
      <id>1</id>
      <enabled>true</enabled>
      <sensitivityLevel>50</sensitivityLevel>
      <RegionCoordinatesList>
        <RegionCoordinates><positionX>100</positionX><positionY>800</positionY></RegionCoordinates>
        <RegionCoordinates><positionX>400</positionX><positionY>800</positionY></RegionCoordinates>
        <RegionCoordinates><positionX>400</positionX><positionY>600</positionY></RegionCoordinates>
        <RegionCoordinates><positionX>100</positionX><positionY>600</positionY></RegionCoordinates>
      </RegionCoordinatesList>
    </MotionDetectionRegion>
    <MotionDetectionRegion>
      <id>2</id>
      <enabled>true</enabled>
      <sensitivityLevel>50</sensitivityLevel>
      <RegionCoordinatesList>
        <RegionCoordinates><positionX>0</positionX><positionY>0</positionY></RegionCoordinates>
        <RegionCoordinates><positionX>0</positionX><positionY>0</positionY></RegionCoordinates>
        <RegionCoordinates><positionX>0</positionX><positionY>0</positionY></RegionCoordinates>
        <RegionCoordinates><positionX>0</positionX><positionY>0</positionY></RegionCoordinates>
      </RegionCoordinatesList>
    </MotionDetectionRegion>
  </MotionDetectionRegionList>
</MotionDetectionExt>`))
				return
			}
			if r.Method == "PUT" {
				buf := make([]byte, 4096)
				n, _ := r.Body.Read(buf)
				receivedPUT = string(buf[:n])
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte(`<ResponseStatus><statusCode>1</statusCode><statusString>OK</statusString></ResponseStatus>`))
				return
			}
		default:
			http.NotFound(w, r)
		}
	}))
	defer ts.Close()

	host := strings.TrimPrefix(ts.URL, "http://")
	client := NewCameraClient()

	m, err := client.GetMotionDetection(host, "admin", "12345", 1)
	if err != nil {
		t.Fatalf("GetMotionDetection failed: %v", err)
	}
	if !m.SupportsExpert || m.Mode != "expert" {
		t.Fatalf("expected expert mode, got mode=%s supportsExpert=%v", m.Mode, m.SupportsExpert)
	}
	if len(m.Regions) != 2 {
		t.Fatalf("expected 2 regions, got %d", len(m.Regions))
	}

	// Region 1: Camera had positionY 800 (top) and 600 (bottom).
	// In screen space (1000 - Y): minY = 1000 - 800 = 200 (top), maxY = 1000 - 600 = 400 (bottom).
	// Points should be normalized clockwise starting from Top-Left:
	// P0: (100, 200), P1: (400, 200), P2: (400, 400), P3: (100, 400).
	r1 := m.Regions[0]
	if !r1.Enabled {
		t.Errorf("expected Region 1 to be enabled")
	}
	if len(r1.Coordinates) != 4 {
		t.Fatalf("expected 4 coordinates in Region 1, got %d", len(r1.Coordinates))
	}
	expectedCoords := []Point{
		{X: 100, Y: 200}, // Top-Left
		{X: 400, Y: 200}, // Top-Right
		{X: 400, Y: 400}, // Bottom-Right
		{X: 100, Y: 400}, // Bottom-Left
	}
	for i, exp := range expectedCoords {
		if r1.Coordinates[i].X != exp.X || r1.Coordinates[i].Y != exp.Y {
			t.Errorf("Region 1 point %d mismatch: got %+v, expected %+v", i, r1.Coordinates[i], exp)
		}
	}

	// Region 2: Had all zero coordinates. Must be marked disabled.
	r2 := m.Regions[1]
	if r2.Enabled {
		t.Errorf("expected Region 2 with all zeros to be marked disabled")
	}

	// Now test SetMotionDetection with expert regions:
	// Save Region 1 enabled with screen coords {100, 200}..{400, 400} -> camY must be {800, 600}
	// Save Region 2 disabled -> coordinates must be all zeros {0, 0}
	saveMotion := MotionDetection{
		Enabled: true,
		Mode:    "expert",
		Regions: []MotionRegion{
			{
				ID:          1,
				Enabled:     true,
				Coordinates: expectedCoords,
			},
			{
				ID:          2,
				Enabled:     false,
				Coordinates: []Point{{X: 100, Y: 100}, {X: 200, Y: 100}, {X: 200, Y: 200}, {X: 100, Y: 200}},
			},
		},
	}
	if err := client.SetMotionDetection(host, "admin", "12345", 1, saveMotion); err != nil {
		t.Fatalf("SetMotionDetection failed: %v", err)
	}

	// Verify PUT body for Region 1: positionY must be 800 and 600 (camY = 1000 - pt.Y)
	if !strings.Contains(receivedPUT, "<positionY>800</positionY>") || !strings.Contains(receivedPUT, "<positionY>600</positionY>") {
		t.Errorf("expected camY 800 and 600 in PUT body for Region 1: %s", receivedPUT)
	}

	// Verify PUT body for disabled Region 2: all coordinates must be 0
	if !strings.Contains(receivedPUT, "<id>2</id>\n  <enabled>false</enabled>") && !strings.Contains(receivedPUT, "<id>2</id>\r\n  <enabled>false</enabled>") {
		// Region 2 is disabled
	}
	// Verify that Region 2 writes 0,0 coordinates
	reReg2 := regexp.MustCompile(`(?is)<id>2</id>.*?<RegionCoordinatesList>(.*?)</RegionCoordinatesList>`)
	mReg2 := reReg2.FindStringSubmatch(receivedPUT)
	if len(mReg2) < 2 {
		t.Fatalf("could not find Region 2 coords in PUT: %s", receivedPUT)
	}
	if strings.Contains(mReg2[1], "100") || strings.Contains(mReg2[1], "200") {
		t.Errorf("expected Region 2 (disabled) to have only 0 coordinates in PUT, got: %s", mReg2[1])
	}
}

func TestISAPIUnattendedBaggageAndObjectRemoval(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/ISAPI/Smart/UnattendedBaggage/1":
			w.Header().Set("Content-Type", "application/xml")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?>
<UnattendedBaggage version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <id>1</id>
  <enabled>true</enabled>
  <UnattendedBaggageRegionList>
    <UnattendedBaggageRegion>
      <id>1</id>
      <enabled>true</enabled>
      <sensitivityLevel>60</sensitivityLevel>
      <timeThreshold>15</timeThreshold>
      <RegionCoordinatesList>
        <RegionCoordinates><positionX>200</positionX><positionY>800</positionY></RegionCoordinates>
        <RegionCoordinates><positionX>800</positionX><positionY>800</positionY></RegionCoordinates>
        <RegionCoordinates><positionX>800</positionX><positionY>200</positionY></RegionCoordinates>
        <RegionCoordinates><positionX>200</positionX><positionY>200</positionY></RegionCoordinates>
      </RegionCoordinatesList>
    </UnattendedBaggageRegion>
  </UnattendedBaggageRegionList>
</UnattendedBaggage>`))
		case "/ISAPI/Smart/ObjectRemoval/1":
			w.Header().Set("Content-Type", "application/xml")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?>
<ObjectRemoval version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <id>1</id>
  <enabled>true</enabled>
  <ObjectRemovalRegionList>
    <ObjectRemovalRegion>
      <id>1</id>
      <enabled>true</enabled>
      <sensitivityLevel>70</sensitivityLevel>
      <timeThreshold>20</timeThreshold>
      <RegionCoordinatesList>
        <RegionCoordinates><positionX>300</positionX><positionY>700</positionY></RegionCoordinates>
        <RegionCoordinates><positionX>700</positionX><positionY>700</positionY></RegionCoordinates>
        <RegionCoordinates><positionX>700</positionX><positionY>300</positionY></RegionCoordinates>
        <RegionCoordinates><positionX>300</positionX><positionY>300</positionY></RegionCoordinates>
      </RegionCoordinatesList>
    </ObjectRemovalRegion>
  </ObjectRemovalRegionList>
</ObjectRemoval>`))
		case "/ISAPI/System/Video/inputs/channels/1/tamperDetection":
			w.Header().Set("Content-Type", "application/xml")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?>
<TamperDetection version="1.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <enabled>true</enabled>
  <TamperDetectionRegionList>
    <TamperDetectionRegion>
      <id>1</id>
      <enabled>true</enabled>
      <sensitivityLevel>55</sensitivityLevel>
    </TamperDetectionRegion>
  </TamperDetectionRegionList>
</TamperDetection>`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer ts.Close()

	host := strings.TrimPrefix(ts.URL, "http://")
	client := NewCameraClient()

	unattended, err := client.GetUnattendedBaggage(host, "admin", "12345", 1)
	if err != nil {
		t.Fatalf("GetUnattendedBaggage failed: %v", err)
	}
	if !unattended.Enabled || unattended.Sensitivity != 60 || unattended.TimeThreshold != 15 || len(unattended.Coordinates) != 4 {
		t.Errorf("unexpected UnattendedBaggage parsed: %+v", unattended)
	}
	// Verify screen normalized coordinates (1000 - Y)
	if unattended.Coordinates[0].Y != 200 || unattended.Coordinates[2].Y != 800 {
		t.Errorf("unexpected coordinates for unattended baggage: %+v", unattended.Coordinates)
	}

	removal, err := client.GetObjectRemoval(host, "admin", "12345", 1)
	if err != nil {
		t.Fatalf("GetObjectRemoval failed: %v", err)
	}
	if !removal.Enabled || removal.Sensitivity != 70 || removal.TimeThreshold != 20 || len(removal.Coordinates) != 4 {
		t.Errorf("unexpected ObjectRemoval parsed: %+v", removal)
	}
	if removal.Coordinates[0].Y != 300 || removal.Coordinates[2].Y != 700 {
		t.Errorf("unexpected coordinates for object removal: %+v", removal.Coordinates)
	}

	tamper, err := client.GetTamperDetection(host, "admin", "12345", 1)
	if err != nil {
		t.Fatalf("GetTamperDetection failed: %v", err)
	}
	if !tamper.Enabled || tamper.Sensitivity != 55 {
		t.Errorf("unexpected TamperDetection parsed: %+v", tamper)
	}
}

func TestISAPIStreamSettingsAndCapabilities(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/ISAPI/Streaming/channels/102":
			w.Header().Set("Content-Type", "application/xml")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?>
<StreamingChannel version="1.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <id>102</id>
  <channelName>SubStream</channelName>
  <enabled>true</enabled>
  <Video>
    <videoInputChannelID>1</videoInputChannelID>
    <videoCodecType>H.264</videoCodecType>
    <videoResolutionWidth>640</videoResolutionWidth>
    <videoResolutionHeight>360</videoResolutionHeight>
    <videoQualityControlType>VBR</videoQualityControlType>
    <constantBitRate>1024</constantBitRate>
    <maxFrameRate>2500</maxFrameRate>
  </Video>
</StreamingChannel>`))
		case "/ISAPI/Streaming/channels/102/capabilities":
			w.Header().Set("Content-Type", "application/xml")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?>
<StreamingChannel version="1.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <id>102</id>
  <Video>
    <videoCodecType opt="H.264,H.265,MJPEG">H.264</videoCodecType>
    <videoResolution opt="1280*720,704*576,640*480,640*360,352*288">640*360</videoResolution>
    <videoQualityControlType opt="VBR,CBR">VBR</videoQualityControlType>
    <maxFrameRate opt="100,200,400,600,800,1000,1200,1500,1600,1800,2000,2200,2500,3000">2500</maxFrameRate>
  </Video>
</StreamingChannel>`))
		default:
			w.WriteHeader(http.StatusOK)
		}
	}))
	defer ts.Close()

	host := strings.TrimPrefix(ts.URL, "http://")
	client := NewCameraClient()

	stream, err := client.GetStreamSettings(host, "admin", "12345", 102)
	if err != nil {
		t.Fatalf("GetStreamSettings failed: %v", err)
	}

	if stream.Resolution != "640x360" {
		t.Errorf("expected resolution '640x360', got '%s'", stream.Resolution)
	}
	if stream.FPS != 25 {
		t.Errorf("expected FPS 25, got %d", stream.FPS)
	}

	// Verify supported resolutions includes 640x360
	has640x360 := false
	for _, res := range stream.SupportedResolutions {
		if res == "640x360" {
			has640x360 = true
			break
		}
	}
	if !has640x360 {
		t.Errorf("expected supported resolutions to include '640x360', got: %v", stream.SupportedResolutions)
	}

	// Verify supported FPS includes 1, 2, 4, 6, 8, 10, 12, 15, 16, 18, 20, 22, 25, 30
	if len(stream.SupportedFPS) < 10 {
		t.Errorf("expected full list of supported FPS from capabilities, got: %v", stream.SupportedFPS)
	}
}

func TestISAPICapabilityParsingVariants(t *testing.T) {
	// 1. Single quotes in opt
	xmlSingleQuotes := `<StreamingChannel><Video><videoResolution opt='1920*1080,1280*720,640*360'>1920*1080</videoResolution><maxFrameRate opt='100,200,400,2500'>2500</maxFrameRate></Video></StreamingChannel>`
	res, fps, codecs, _, _ := parseStreamCapabilities(xmlSingleQuotes)
	if len(res) != 3 || res[0] != "1920x1080" || res[2] != "640x360" {
		t.Errorf("failed parsing single quote opt resolutions: %v", res)
	}
	if len(fps) != 4 || fps[3] != 25 {
		t.Errorf("failed parsing single quote opt fps: %v", fps)
	}

	// 2. Comma-separated inner text
	xmlInnerText := `<Video><videoResolution>3840*2160,2560*1440,1920*1080,1280*720</videoResolution><maxFrameRate>100,200,500,1000,1500,2000,2500,3000</maxFrameRate><videoCodecType>H.264,H.265,MJPEG</videoCodecType></Video>`
	res2, fps2, codecs2, _, _ := parseStreamCapabilities(xmlInnerText)
	if len(res2) != 4 || res2[0] != "3840x2160" {
		t.Errorf("failed parsing inner text comma-separated resolutions: %v", res2)
	}
	if len(fps2) != 8 || fps2[6] != 25 || fps2[7] != 30 {
		t.Errorf("failed parsing inner text comma-separated fps: %v", fps2)
	}
	if len(codecs2) != 3 || codecs2[1] != "H.265" {
		t.Errorf("failed parsing inner text codecs: %v", codecs2)
	}

	// 3. Hikvision paired width/height opt lists with duplicate widths (e.g. 320,640,640 and 240,360,480)
	xmlPairedWidthHeight := `<StreamingChannel version="2.0"><id>102</id><Video><videoResolutionWidth opt="320,640,640">640</videoResolutionWidth><videoResolutionHeight opt="240,360,480">360</videoResolutionHeight><maxFrameRate opt="1500,2000,2500">1500</maxFrameRate><H264Profile opt="Main,High,Baseline">Main</H264Profile></Video></StreamingChannel>`
	res3, fps3, _, _, profiles3 := parseStreamCapabilities(xmlPairedWidthHeight)
	if len(res3) != 3 {
		t.Fatalf("expected exactly 3 resolutions for paired sub-stream, got %d: %v", len(res3), res3)
	}
	expected3 := []string{"320x240", "640x360", "640x480"}
	for i, exp := range expected3 {
		if res3[i] != exp {
			t.Errorf("index %d: expected %s, got %s", i, exp, res3[i])
		}
	}
	if len(fps3) != 3 || fps3[0] != 15 || fps3[2] != 25 {
		t.Errorf("unexpected fps3: %v", fps3)
	}
	if len(profiles3) != 3 || profiles3[0] != "Main" || profiles3[1] != "High" || profiles3[2] != "Baseline" {
		t.Errorf("unexpected profiles3: %v", profiles3)
	}

	// 4. DynamicCap with ResolutionAvailableDscriptorList
	xmlDynamicCap := `<DynamicCap version="2.0">
<ResolutionAvailableDscriptorList>
<ResolutionAvailableDscriptor><videoResolutionWidth>320</videoResolutionWidth><videoResolutionHeight>240</videoResolutionHeight><supportedFrameRate>1500,2500</supportedFrameRate></ResolutionAvailableDscriptor>
<ResolutionAvailableDscriptor><videoResolutionWidth>640</videoResolutionWidth><videoResolutionHeight>360</videoResolutionHeight><supportedFrameRate>1500,2500</supportedFrameRate></ResolutionAvailableDscriptor>
<ResolutionAvailableDscriptor><videoResolutionWidth>640</videoResolutionWidth><videoResolutionHeight>480</videoResolutionHeight><supportedFrameRate>1500,2500</supportedFrameRate></ResolutionAvailableDscriptor>
</ResolutionAvailableDscriptorList>
</DynamicCap>`
	res4, fps4, _, _, _ := parseStreamCapabilities(xmlDynamicCap)
	if len(res4) != 3 || res4[1] != "640x360" {
		t.Errorf("failed dynamicCap parsing: %v", res4)
	}
	if len(fps4) != 2 || fps4[0] != 15 || fps4[1] != 25 {
		t.Errorf("failed dynamicCap fps parsing: %v", fps4)
	}

	_ = codecs
}

func TestLiveCamera2StreamSettings(t *testing.T) {
	testIP := os.Getenv("HIKVISION_TEST_IP")
	testPass := os.Getenv("HIKVISION_TEST_PASSWORD")
	if testIP == "" || testPass == "" {
		t.Skip("Skipping live camera test: HIKVISION_TEST_IP or HIKVISION_TEST_PASSWORD not set")
		return
	}
	client := NewCameraClient()
	// Test Sub Stream (102)
	streamSub, err := client.GetStreamSettings(testIP, "admin", testPass, 102)
	if err != nil {
		t.Skipf("Live camera not reachable: %v", err)
		return
	}
	t.Logf("Live camera SubStream (102): resolution=%s, fps=%d, supported_resolutions=%v, supported_fps=%v",
		streamSub.Resolution, streamSub.FPS, streamSub.SupportedResolutions, streamSub.SupportedFPS)

	// Test Main Stream (101)
	streamMain, err := client.GetStreamSettings(testIP, "admin", testPass, 101)
	if err != nil {
		t.Fatalf("failed getting main stream 101: %v", err)
	}
	t.Logf("Live camera MainStream (101): resolution=%s, fps=%d, supported_resolutions=%v, supported_fps=%v",
		streamMain.Resolution, streamMain.FPS, streamMain.SupportedResolutions, streamMain.SupportedFPS)
}

func TestISAPIPrivacyMask(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/ISAPI/System/Video/inputs/channels/1/privacyMask" {
			http.NotFound(w, r)
			return
		}

		if r.Method == "GET" {
			w.Header().Set("Content-Type", "application/xml")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?>
<PrivacyMask version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
<enabled>true</enabled>
<normalizedScreenSize>
<normalizedScreenWidth>704</normalizedScreenWidth>
<normalizedScreenHeight>480</normalizedScreenHeight>
</normalizedScreenSize>
<PrivacyMaskRegionList size="4">
<PrivacyMaskRegion version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
<id>1</id>
<enabled>true</enabled>
<RegionCoordinatesList>
<RegionCoordinates><positionX>70</positionX><positionY>48</positionY></RegionCoordinates>
<RegionCoordinates><positionX>352</positionX><positionY>48</positionY></RegionCoordinates>
<RegionCoordinates><positionX>352</positionX><positionY>240</positionY></RegionCoordinates>
<RegionCoordinates><positionX>70</positionX><positionY>240</positionY></RegionCoordinates>
</RegionCoordinatesList>
</PrivacyMaskRegion>
</PrivacyMaskRegionList>
</PrivacyMask>`))
			return
		}

		if r.Method == "PUT" {
			w.Header().Set("Content-Type", "application/xml")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?><ResponseStatus version="2.0"><statusCode>1</statusCode><statusString>OK</statusString></ResponseStatus>`))
			return
		}
	}))
	defer ts.Close()

	host := strings.TrimPrefix(ts.URL, "http://")
	client := NewCameraClient()

	mask, err := client.GetPrivacyMask(host, "admin", "12345", 1)
	if err != nil {
		t.Fatalf("failed GetPrivacyMask: %v", err)
	}
	if !mask.Enabled {
		t.Errorf("expected mask to be enabled")
	}
	if len(mask.Regions) != 1 {
		t.Fatalf("expected 1 region, got %d", len(mask.Regions))
	}
	reg := mask.Regions[0]
	if reg.ID != 1 || !reg.Enabled || len(reg.Coordinates) != 4 {
		t.Errorf("unexpected region: %+v", reg)
	}
	// 70 / 704 * 1000 = ~99
	// 240 / 480 * 1000 = 500 -> 1000 - 500 = 500 (minY)
	// 48 / 480 * 1000 = 100 -> 1000 - 100 = 900 (maxY)
	if reg.Coordinates[0].X < 90 || reg.Coordinates[0].X > 110 {
		t.Errorf("unexpected X coord: %d", reg.Coordinates[0].X)
	}
	if reg.Coordinates[0].Y < 490 || reg.Coordinates[0].Y > 510 {
		t.Errorf("unexpected Y coord: %d", reg.Coordinates[0].Y)
	}
	if reg.Coordinates[2].Y < 890 || reg.Coordinates[2].Y > 910 {
		t.Errorf("unexpected maxY coord: %d", reg.Coordinates[2].Y)
	}

	// Test SetPrivacyMask
	setErr := client.SetPrivacyMask(host, "admin", "12345", 1, *mask)
	if setErr != nil {
		t.Fatalf("failed SetPrivacyMask: %v", setErr)
	}
}

func TestISAPISmartCalibration(t *testing.T) {
	calXML := `<?xml version="1.0" encoding="UTF-8"?>
<SmartCalibrationList version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
<SmartCalibration version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
<ID>1</ID>
<FilterSize>
<MaxTargetSize>
<RegionCoordinatesList>
<RegionCoordinates><positionX>100</positionX><positionY>900</positionY></RegionCoordinates>
<RegionCoordinates><positionX>900</positionX><positionY>900</positionY></RegionCoordinates>
<RegionCoordinates><positionX>900</positionX><positionY>100</positionY></RegionCoordinates>
<RegionCoordinates><positionX>100</positionX><positionY>100</positionY></RegionCoordinates>
</RegionCoordinatesList>
</MaxTargetSize>
<MinTargetSize>
<RegionCoordinatesList>
<RegionCoordinates><positionX>200</positionX><positionY>400</positionY></RegionCoordinates>
<RegionCoordinates><positionX>400</positionX><positionY>400</positionY></RegionCoordinates>
<RegionCoordinates><positionX>400</positionX><positionY>200</positionY></RegionCoordinates>
<RegionCoordinates><positionX>200</positionX><positionY>200</positionY></RegionCoordinates>
</RegionCoordinatesList>
</MinTargetSize>
<mode>pixels</mode>
</FilterSize>
</SmartCalibration>
</SmartCalibrationList>`

	lineXML := `<?xml version="1.0" encoding="UTF-8"?>
<LineDetection version="2.0">
<id>1</id>
<enabled>true</enabled>
<LineItemList size="1">
<LineItem>
<id>1</id>
<enabled>true</enabled>
<sensitivityLevel>50</sensitivityLevel>
<directionSensitivity>any</directionSensitivity>
<CoordinatesList>
<Coordinates><positionX>200</positionX><positionY>500</positionY></Coordinates>
<Coordinates><positionX>800</positionX><positionY>500</positionY></Coordinates>
</CoordinatesList>
</LineItem>
</LineItemList>
</LineDetection>`

	var lastCalibrationPutBody string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/ISAPI/Smart/LineDetection/1":
			if r.Method == "GET" {
				w.Header().Set("Content-Type", "application/xml")
				_, _ = w.Write([]byte(lineXML))
			} else if r.Method == "PUT" {
				w.WriteHeader(http.StatusOK)
			}
		case "/ISAPI/Smart/channels/1/calibrations/linedetection":
			if r.Method == "GET" {
				w.Header().Set("Content-Type", "application/xml")
				_, _ = w.Write([]byte(calXML))
			} else if r.Method == "PUT" {
				b, _ := io.ReadAll(r.Body)
				lastCalibrationPutBody = string(b)
				w.WriteHeader(http.StatusOK)
			}
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer ts.Close()

	host := strings.TrimPrefix(ts.URL, "http://")
	client := NewCameraClient()

	ld, err := client.GetLineDetection(host, "admin", "12345", 1)
	if err != nil {
		t.Fatalf("GetLineDetection failed: %v", err)
	}

	if len(ld.MinSize) != 4 {
		t.Fatalf("expected 4 MinSize points, got %d", len(ld.MinSize))
	}
	if ld.MinSize[0].X != 200 || ld.MinSize[1].X != 400 {
		t.Errorf("unexpected MinSize X coords: %+v", ld.MinSize)
	}

	if len(ld.MaxSize) != 4 {
		t.Fatalf("expected 4 MaxSize points, got %d", len(ld.MaxSize))
	}
	if ld.MaxSize[0].X != 100 || ld.MaxSize[1].X != 900 {
		t.Errorf("unexpected MaxSize X coords: %+v", ld.MaxSize)
	}

	// Test SetLineDetection preserving/updating calibration
	ld.MinSize = []Point{
		{X: 150, Y: 150},
		{X: 350, Y: 150},
		{X: 350, Y: 350},
		{X: 150, Y: 350},
	}
	if err := client.SetLineDetection(host, "admin", "12345", 1, *ld); err != nil {
		t.Fatalf("SetLineDetection failed: %v", err)
	}

	if !strings.Contains(lastCalibrationPutBody, "<positionX>150</positionX>") ||
		!strings.Contains(lastCalibrationPutBody, "<positionX>350</positionX>") {
		t.Errorf("expected calibration PUT to contain updated coordinates, got: %s", lastCalibrationPutBody)
	}
}

func TestISAPISmartCalibrationLive(t *testing.T) {
	testIP := os.Getenv("HIKVISION_TEST_IP")
	testPass := os.Getenv("HIKVISION_TEST_PASSWORD")
	if testIP == "" || testPass == "" {
		t.Skip("Skipping live camera test: HIKVISION_TEST_IP or HIKVISION_TEST_PASSWORD not set")
		return
	}
	client := NewCameraClient()
	ld, err := client.GetLineDetection(testIP, "admin", testPass, 1)
	if err != nil {
		t.Skipf("Live camera not reachable: %v", err)
		return
	}
	t.Logf("Live camera line crossing before: enabled=%t, minSize=%+v, maxSize=%+v", ld.Enabled, ld.MinSize, ld.MaxSize)

	origMin := ld.MinSize
	origMax := ld.MaxSize

	// Set test min size and max size
	testMin := []Point{{X: 100, Y: 100}, {X: 250, Y: 100}, {X: 250, Y: 250}, {X: 100, Y: 250}}
	testMax := []Point{{X: 50, Y: 50}, {X: 800, Y: 50}, {X: 800, Y: 800}, {X: 50, Y: 800}}
	ld.MinSize = testMin
	ld.MaxSize = testMax

	if err := client.SetLineDetection(testIP, "admin", testPass, 1, *ld); err != nil {
		t.Fatalf("SetLineDetection with calibration failed: %v", err)
	}

	// Verify read-back
	updated, err := client.GetLineDetection(testIP, "admin", testPass, 1)
	if err != nil {
		t.Fatalf("GetLineDetection readback failed: %v", err)
	}
	t.Logf("Live camera after setting calibration: minSize=%+v, maxSize=%+v", updated.MinSize, updated.MaxSize)

	if len(updated.MinSize) != 4 || len(updated.MaxSize) != 4 {
		t.Errorf("expected 4 points each, got min=%v, max=%v", updated.MinSize, updated.MaxSize)
	}

	// Restore original state
	ld.MinSize = origMin
	ld.MaxSize = origMax
	_ = client.SetLineDetection(testIP, "admin", testPass, 1, *ld)
}

func TestISAPINewFeatures(t *testing.T) {
	sceneXML := `<?xml version="1.0" encoding="UTF-8"?>
<SceneChangeDetection version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <enabled>true</enabled>
  <id>1</id>
  <SceneChangeDetectionAreaList>
    <SceneChangeDetectionArea>
      <id>1</id>
      <sensitivityLevel>65</sensitivityLevel>
    </SceneChangeDetectionArea>
  </SceneChangeDetectionAreaList>
</SceneChangeDetection>`

	faceXML := `<?xml version="1.0" encoding="UTF-8"?>
<FaceDetect version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <enabled>true</enabled>
  <FaceDetectAreaList>
    <FaceDetectArea>
      <id>1</id>
      <sensitivityLevel>4</sensitivityLevel>
    </FaceDetectArea>
  </FaceDetectAreaList>
  <highlightsenabled>true</highlightsenabled>
</FaceDetect>`

	schedXML := `<?xml version="1.0" encoding="UTF-8"?>
<Schedule version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <id>VMD_video1</id>
  <eventType>VMD</eventType>
  <videoInputChannelID>1</videoInputChannelID>
  <TimeBlockList>
    <TimeBlock>
      <dayOfWeek>1</dayOfWeek>
      <TimeRange>
        <beginTime>08:00</beginTime>
        <endTime>18:00</endTime>
      </TimeRange>
    </TimeBlock>
  </TimeBlockList>
</Schedule>`

	triggerXML := `<?xml version="1.0" encoding="UTF-8"?>
<EventTrigger version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <id>VMD-1</id>
  <eventType>VMD</eventType>
  <videoInputChannelID>1</videoInputChannelID>
  <EventTriggerNotificationList>
    <EventTriggerNotification>
      <id>center</id>
      <notificationMethod>center</notificationMethod>
    </EventTriggerNotification>
    <EventTriggerNotification>
      <id>record-1</id>
      <notificationMethod>record</notificationMethod>
    </EventTriggerNotification>
    <EventTriggerNotification>
      <id>beep</id>
      <notificationMethod>beep</notificationMethod>
    </EventTriggerNotification>
  </EventTriggerNotificationList>
</EventTrigger>`

	trackXML := `<?xml version="1.0" encoding="UTF-8"?>
<Track version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <id>1</id>
  <Enable>true</Enable>
  <TrackSchedule>
    <ScheduleBlockList>
      <ScheduleBlock>
        <ScheduleAction>
          <id>1</id>
          <ScheduleActionStartTime>
            <DayOfWeek>Monday</DayOfWeek>
            <TimeOfDay>00:00:00</TimeOfDay>
          </ScheduleActionStartTime>
          <ScheduleActionEndTime>
            <DayOfWeek>Monday</DayOfWeek>
            <TimeOfDay>24:00:00</TimeOfDay>
          </ScheduleActionEndTime>
          <Actions>
            <ActionRecordingMode>AllEvent</ActionRecordingMode>
          </Actions>
        </ScheduleAction>
      </ScheduleBlock>
    </ScheduleBlockList>
  </TrackSchedule>
  <CustomExtensionList>
    <CustomExtension>
      <enableSchedule>true</enableSchedule>
      <PreRecordTimeSeconds>5</PreRecordTimeSeconds>
      <PostRecordTimeSeconds>10</PostRecordTimeSeconds>
    </CustomExtension>
  </CustomExtensionList>
</Track>`

	snapshotXML := `<?xml version="1.0" encoding="UTF-8"?>
<SnapshotChannel version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <id>1</id>
  <videoInputChannelID>1</videoInputChannelID>
  <timingCapture>
    <enabled>true</enabled>
    <compress>
      <pictureWidth>1920</pictureWidth>
      <pictureHeight>1080</pictureHeight>
      <quality>80</quality>
      <captureInterval>5000</captureInterval>
    </compress>
  </timingCapture>
  <eventCapture>
    <enabled>true</enabled>
    <compress>
      <pictureWidth>1920</pictureWidth>
      <pictureHeight>1080</pictureHeight>
      <quality>80</quality>
      <captureInterval>1000</captureInterval>
      <captureNumber>4</captureNumber>
    </compress>
  </eventCapture>
</SnapshotChannel>`

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/xml")
		switch {
		case strings.Contains(r.URL.Path, "/SceneChangeDetection"):
			if r.Method == "GET" {
				w.Write([]byte(sceneXML))
			} else {
				w.Write([]byte(`<ResponseStatus version="2.0"><statusCode>1</statusCode></ResponseStatus>`))
			}
		case strings.Contains(r.URL.Path, "/FaceDetect"):
			if r.Method == "GET" {
				w.Write([]byte(faceXML))
			} else {
				w.Write([]byte(`<ResponseStatus version="2.0"><statusCode>1</statusCode></ResponseStatus>`))
			}
		case strings.Contains(r.URL.Path, "/schedules/motionDetections/"):
			if r.Method == "GET" {
				w.Write([]byte(schedXML))
			} else {
				w.Write([]byte(`<ResponseStatus version="2.0"><statusCode>1</statusCode></ResponseStatus>`))
			}
		case strings.Contains(r.URL.Path, "/triggers/VMD-"):
			if r.Method == "GET" {
				w.Write([]byte(triggerXML))
			} else {
				w.Write([]byte(`<ResponseStatus version="2.0"><statusCode>1</statusCode></ResponseStatus>`))
			}
		case strings.Contains(r.URL.Path, "/record/tracks/"):
			if r.Method == "GET" {
				if strings.HasSuffix(r.URL.Path, "/capabilities") {
					w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?>
<Track version="2.0">
  <DefaultRecordingMode opt="CMR,MOTION,ALARM,EDR,ALARMANDMOTION,AllEvent">CMR</DefaultRecordingMode>
</Track>`))
				} else {
					w.Write([]byte(trackXML))
				}
			} else {
				w.Write([]byte(`<ResponseStatus version="2.0"><statusCode>1</statusCode></ResponseStatus>`))
			}
		case strings.Contains(r.URL.Path, "/Snapshot/channels/"):
			if r.Method == "GET" {
				w.Write([]byte(snapshotXML))
			} else {
				w.Write([]byte(`<ResponseStatus version="2.0"><statusCode>1</statusCode></ResponseStatus>`))
			}
		default:
			w.WriteHeader(http.StatusOK)
		}
	}))
	defer ts.Close()

	host := strings.TrimPrefix(ts.URL, "http://")
	client := NewCameraClient()

	// 1. Scene Change
	sc, err := client.GetSceneChangeDetection(host, "admin", "12345", 1)
	if err != nil || !sc.Enabled || sc.Sensitivity != 65 {
		t.Fatalf("unexpected SceneChangeDetection: %+v, err: %v", sc, err)
	}
	if err := client.SetSceneChangeDetection(host, "admin", "12345", 1, *sc); err != nil {
		t.Fatalf("failed SetSceneChangeDetection: %v", err)
	}

	// 2. Face Detection
	fd, err := client.GetFaceDetection(host, "admin", "12345", 1)
	if err != nil || !fd.Enabled || fd.Sensitivity != 4 || !fd.EnableHighlight {
		t.Fatalf("unexpected FaceDetection: %+v, err: %v", fd, err)
	}
	if err := client.SetFaceDetection(host, "admin", "12345", 1, *fd); err != nil {
		t.Fatalf("failed SetFaceDetection: %v", err)
	}

	// 3. Event Schedule
	sched, err := client.GetEventSchedule(host, "admin", "12345", "motion", 1)
	if err != nil || len(sched.Days) != 7 {
		t.Fatalf("unexpected EventSchedule: %+v, err: %v", sched, err)
	}
	if len(sched.Days[0].TimeRanges) != 1 || sched.Days[0].TimeRanges[0].BeginTime != "08:00" {
		t.Fatalf("unexpected schedule day 1: %+v", sched.Days[0])
	}
	if err := client.SetEventSchedule(host, "admin", "12345", "motion", 1, *sched); err != nil {
		t.Fatalf("failed SetEventSchedule: %v", err)
	}

	// 4. Event Linkage
	linkage, err := client.GetEventLinkage(host, "admin", "12345", "motion", 1)
	if err != nil || !linkage.NotifySurveillanceCenter || !linkage.TriggerChannelRecord || !linkage.AudibleWarning || linkage.SendEmail {
		t.Fatalf("unexpected EventLinkage: %+v, err: %v", linkage, err)
	}
	if err := client.SetEventLinkage(host, "admin", "12345", "motion", 1, *linkage); err != nil {
		t.Fatalf("failed SetEventLinkage: %v", err)
	}

	// 5. Storage Record Schedule
	rs, err := client.GetRecordSchedule(host, "admin", "12345", 1)
	if err != nil || !rs.Enabled || !rs.EnableSchedule || rs.PreRecordTimeSeconds != 5 || rs.PostRecordTimeSeconds != 10 {
		t.Fatalf("unexpected RecordSchedule: %+v, err: %v", rs, err)
	}
	if len(rs.SupportedRecordModes) != 6 || rs.SupportedRecordModes[0] != "CMR" || rs.SupportedRecordModes[3] != "EDR" {
		t.Fatalf("unexpected SupportedRecordModes: %v", rs.SupportedRecordModes)
	}
	if len(rs.Days[0].TimeRanges) != 1 || rs.Days[0].TimeRanges[0].RecordMode != "AllEvent" {
		t.Fatalf("unexpected record schedule day 1: %+v", rs.Days[0])
	}
	if err := client.SetRecordSchedule(host, "admin", "12345", 1, *rs); err != nil {
		t.Fatalf("failed SetRecordSchedule: %v", err)
	}

	// 6. Capture Settings
	cs, err := client.GetCaptureSettings(host, "admin", "12345", 1)
	if err != nil || !cs.TimingCapture.Enabled || cs.TimingCapture.Resolution != "1920x1080" || cs.EventCapture.CaptureCount != 4 {
		t.Fatalf("unexpected CaptureSettings: %+v, err: %v", cs, err)
	}
	if err := client.SetCaptureSettings(host, "admin", "12345", 1, *cs); err != nil {
		t.Fatalf("failed SetCaptureSettings: %v", err)
	}
}


