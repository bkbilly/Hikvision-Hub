package hikvision

import (
	"net/http"
	"net/http/httptest"
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
	client := NewCameraClient()
	// Test Sub Stream (102)
	streamSub, err := client.GetStreamSettings("192.168.2.172", "admin", "loco8Way", 102)
	if err != nil {
		t.Skipf("Live camera not reachable: %v", err)
		return
	}
	t.Logf("Live camera 2 SubStream (102): resolution=%s, fps=%d, supported_resolutions=%v, supported_fps=%v",
		streamSub.Resolution, streamSub.FPS, streamSub.SupportedResolutions, streamSub.SupportedFPS)
	if len(streamSub.SupportedResolutions) != 3 {
		t.Errorf("expected exactly 3 resolutions on sub-stream, got %d: %v", len(streamSub.SupportedResolutions), streamSub.SupportedResolutions)
	}

	// Test Main Stream (101)
	streamMain, err := client.GetStreamSettings("192.168.2.172", "admin", "loco8Way", 101)
	if err != nil {
		t.Fatalf("failed getting main stream 101: %v", err)
	}
	t.Logf("Live camera 2 MainStream (101): resolution=%s, fps=%d, supported_resolutions=%v, supported_fps=%v",
		streamMain.Resolution, streamMain.FPS, streamMain.SupportedResolutions, streamMain.SupportedFPS)
	if len(streamMain.SupportedResolutions) != 5 {
		t.Errorf("expected exactly 5 resolutions on main-stream, got %d: %v", len(streamMain.SupportedResolutions), streamMain.SupportedResolutions)
	}
}
