package hikvision

import (
	"encoding/xml"
	"fmt"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// GetDeviceInfo queries device identity, model, serial, and firmware.
func (c *CameraClient) GetDeviceInfo(ip, username, password string) (*DeviceInfo, error) {
	data, code, _, err := c.DoRequest(ip, username, password, "GET", "/ISAPI/System/deviceInfo", nil, "")
	if err != nil {
		return nil, err
	}
	if code != http.StatusOK {
		return nil, fmt.Errorf("deviceInfo failed with HTTP status %d", code)
	}

	var info DeviceInfo
	if err := xml.Unmarshal(data, &info); err != nil {
		str := string(data)
		info.DeviceName = extractXMLTag(str, "deviceName")
		info.Model = extractXMLTag(str, "model")
		info.SerialNumber = extractXMLTag(str, "serialNumber")
		info.MacAddress = extractXMLTag(str, "macAddress")
		info.FirmwareVersion = extractXMLTag(str, "firmwareVersion")
		info.FirmwareReleasedDate = extractXMLTag(str, "firmwareReleasedDate")
		info.DeviceType = extractXMLTag(str, "deviceType")
	}

	return &info, nil
}

// GetTime queries the camera's current time, time mode, and timezone.
func (c *CameraClient) GetTime(ip, username, password string) (*DeviceTime, error) {
	data, code, _, err := c.DoRequest(ip, username, password, "GET", "/ISAPI/System/time", nil, "")
	if err != nil {
		return nil, err
	}
	if code != http.StatusOK {
		return nil, fmt.Errorf("system time query failed with status %d", code)
	}

	var dt DeviceTime
	if err := xml.Unmarshal(data, &dt); err != nil {
		str := string(data)
		dt.TimeMode = extractXMLTag(str, "timeMode")
		dt.LocalTime = extractXMLTag(str, "localTime")
		dt.TimeZone = extractXMLTag(str, "timeZone")
	}

	return &dt, nil
}

// SetTime updates the camera time and timezone.
func (c *CameraClient) SetTime(ip, username, password string, t DeviceTime) error {
	tz := t.TimeZone
	if tz == "" {
		if existing, err := c.GetTime(ip, username, password); err == nil && existing != nil && existing.TimeZone != "" {
			tz = existing.TimeZone
		}
	}
	localTime := t.LocalTime
	if localTime == "" && t.TimeMode == "NTP" {
		if existing, err := c.GetTime(ip, username, password); err == nil && existing != nil && existing.LocalTime != "" {
			localTime = existing.LocalTime
		}
	}

	var payload string
	if tz != "" {
		payload = fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<Time version="1.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <timeMode>%s</timeMode>
  <localTime>%s</localTime>
  <timeZone>%s</timeZone>
</Time>`, escapeXML(t.TimeMode), escapeXML(localTime), escapeXML(tz))
	} else {
		payload = fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<Time version="1.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <timeMode>%s</timeMode>
  <localTime>%s</localTime>
</Time>`, escapeXML(t.TimeMode), escapeXML(localTime))
	}

	data, code, _, err := c.DoRequest(ip, username, password, "PUT", "/ISAPI/System/time", []byte(payload), "application/xml")
	if err != nil {
		return err
	}
	if code != http.StatusOK && code != http.StatusAccepted {
		return fmt.Errorf("failed to set time: status %d (resp: %s)", code, string(data))
	}
	return nil
}

// SyncTimeToCurrent synchronizes camera time to the specified timestamp and timezone with automatic camera timezone preservation and fallback.
func (c *CameraClient) SyncTimeToCurrent(ip, username, password string, targetTime time.Time, clientTZ string) error {
	timeStr := targetTime.Format("2006-01-02T15:04:05")

	// 1. First fetch existing camera time to get its current timezone string
	var camTZ string
	existingTime, err := c.GetTime(ip, username, password)
	if err == nil && existingTime != nil && existingTime.TimeZone != "" {
		camTZ = existingTime.TimeZone
	}
	if camTZ == "" && clientTZ != "" && (strings.HasPrefix(clientTZ, "CST") || strings.HasPrefix(clientTZ, "GMT")) {
		camTZ = clientTZ
	}

	// 2. Try setting time with camera's native timezone
	if camTZ != "" {
		err = c.SetTime(ip, username, password, DeviceTime{
			TimeMode:  "manual",
			LocalTime: timeStr,
			TimeZone:  camTZ,
		})
		if err == nil {
			return nil
		}
	}

	// 3. Fallback: try setting without timeZone tag (accepted by all firmware models)
	payloadWithoutTZ := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<Time version="1.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <timeMode>manual</timeMode>
  <localTime>%s</localTime>
</Time>`, escapeXML(timeStr))

	data, code, _, err2 := c.DoRequest(ip, username, password, "PUT", "/ISAPI/System/time", []byte(payloadWithoutTZ), "application/xml")
	if err2 == nil && (code == http.StatusOK || code == http.StatusAccepted) {
		return nil
	}

	return fmt.Errorf("failed to sync time: %v (resp: %s)", err, string(data))
}

// GetNTP queries NTP server settings.
func (c *CameraClient) GetNTP(ip, username, password string) (*NTPServer, error) {
	data, code, _, err := c.DoRequest(ip, username, password, "GET", "/ISAPI/System/time/ntpServers/1", nil, "")
	if err != nil || code != http.StatusOK {
		data, code, _, err = c.DoRequest(ip, username, password, "GET", "/ISAPI/System/time/ntpServers", nil, "")
		if err != nil || code != http.StatusOK {
			return nil, fmt.Errorf("ntp query failed with status %d", code)
		}
	}

	var ntp NTPServer
	if err := xml.Unmarshal(data, &ntp); err != nil {
		var list NTPServerList
		if errList := xml.Unmarshal(data, &list); errList == nil && len(list.Servers) > 0 {
			ntp = list.Servers[0]
		} else {
			str := string(data)
			ntp.HostName = extractXMLTag(str, "hostName")
			ntp.IPAddress = extractXMLTag(str, "ipAddress")
			ntp.IPv6Address = extractXMLTag(str, "ipv6Address")
			ntp.AddressingFormat = extractXMLTag(str, "addressingFormatType")
			port, _ := strconv.Atoi(extractXMLTag(str, "portNo"))
			ntp.PortNo = port
			interval, _ := strconv.Atoi(extractXMLTag(str, "synchronizeInterval"))
			ntp.SynchronizeInterval = interval
		}
	}

	// Normalize host_name and ip_address so client always receives the configured server address
	if ntp.HostName == "" && ntp.IPAddress != "" {
		ntp.HostName = ntp.IPAddress
	} else if ntp.HostName == "" && ntp.IPv6Address != "" {
		ntp.HostName = ntp.IPv6Address
	}
	if ntp.IPAddress == "" && ntp.HostName != "" {
		ntp.IPAddress = ntp.HostName
	}
	if ntp.PortNo == 0 {
		ntp.PortNo = 123
	}
	return &ntp, nil
}

// SetNTP updates NTP server configuration.
func (c *CameraClient) SetNTP(ip, username, password string, ntp NTPServer) error {
	target := strings.TrimSpace(ntp.HostName)
	if target == "" {
		target = strings.TrimSpace(ntp.IPAddress)
	}
	if target == "" {
		target = strings.TrimSpace(ntp.IPv6Address)
	}
	if target == "" {
		return fmt.Errorf("ntp server host or IP address is required")
	}

	if ntp.PortNo <= 0 {
		ntp.PortNo = 123
	}
	if ntp.SynchronizeInterval <= 0 {
		ntp.SynchronizeInterval = 60
	}

	isIP := net.ParseIP(target) != nil

	var payload string
	if isIP {
		payload = fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<NTPServer version="1.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <id>1</id>
  <addressingFormatType>ipaddress</addressingFormatType>
  <ipAddress>%s</ipAddress>
  <portNo>%d</portNo>
  <synchronizeInterval>%d</synchronizeInterval>
</NTPServer>`, escapeXML(target), ntp.PortNo, ntp.SynchronizeInterval)
	} else {
		payload = fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<NTPServer version="1.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <id>1</id>
  <addressingFormatType>hostname</addressingFormatType>
  <hostName>%s</hostName>
  <portNo>%d</portNo>
  <synchronizeInterval>%d</synchronizeInterval>
</NTPServer>`, escapeXML(target), ntp.PortNo, ntp.SynchronizeInterval)
	}

	data, code, _, err := c.DoRequest(ip, username, password, "PUT", "/ISAPI/System/time/ntpServers/1", []byte(payload), "application/xml")
	if err != nil || (code != http.StatusOK && code != http.StatusAccepted) {
		data2, code2, _, err2 := c.DoRequest(ip, username, password, "PUT", "/ISAPI/System/time/ntpServers", []byte(payload), "application/xml")
		if err2 != nil || (code2 != http.StatusOK && code2 != http.StatusAccepted) {
			if err != nil {
				return err
			}
			return fmt.Errorf("failed to set NTP: status %d (resp: %s / %s)", code, string(data), string(data2))
		}
	}
	return nil
}

// RebootDevice sends a reboot command to the camera.
func (c *CameraClient) RebootDevice(ip, username, password string) error {
	data, code, _, err := c.DoRequest(ip, username, password, "PUT", "/ISAPI/System/reboot", nil, "")
	if err != nil {
		return err
	}
	if code != http.StatusOK && code != http.StatusAccepted {
		return fmt.Errorf("reboot command failed with status %d (resp: %s)", code, string(data))
	}
	return nil
}

// ProbeCapabilities scans camera endpoints to discover exactly what features the camera supports.
func (c *CameraClient) ProbeCapabilities(ip, username, password string) (*CameraCapabilities, error) {
	caps := &CameraCapabilities{
		SupportedCodecs:      []string{"H.264", "H.265"},
		SupportedResolutions: []string{"2560x1440", "1920x1080", "1280x720", "704x576", "640x480"},
	}

	// 1. Device Info & ISAPI Base
	_, code, _, _ := c.DoRequest(ip, username, password, "GET", "/ISAPI/System/deviceInfo", nil, "")
	if code == http.StatusOK {
		caps.HasISAPI = true
		caps.HasDeviceInfo = true
	}

	// 2. Time
	_, code, _, _ = c.DoRequest(ip, username, password, "GET", "/ISAPI/System/time", nil, "")
	if code == http.StatusOK {
		caps.HasTime = true
	}

	// 3. NTP
	_, code, _, _ = c.DoRequest(ip, username, password, "GET", "/ISAPI/System/time/ntpServers/1", nil, "")
	if code == http.StatusOK {
		caps.HasNTP = true
	}

	// 4. Image Display
	img, err := c.GetImageSettings(ip, username, password, 1)
	if err == nil && img != nil {
		caps.HasImageSettings = true
	}

	// 5. WDR / Backlight
	_, code, _, _ = c.DoRequest(ip, username, password, "GET", "/ISAPI/Image/channels/1/backlight", nil, "")
	if code == http.StatusOK {
		caps.HasWDR = true
	}

	// 6. Image Flip
	_, code, _, _ = c.DoRequest(ip, username, password, "GET", "/ISAPI/Image/channels/1/imageFlip", nil, "")
	if code == http.StatusOK {
		caps.HasImageFlip = true
	}

	// 7. Video Streams
	_, code, _, _ = c.DoRequest(ip, username, password, "GET", "/ISAPI/Streaming/channels/101", nil, "")
	if code == http.StatusOK {
		caps.HasMainStream = true
	}
	_, code, _, _ = c.DoRequest(ip, username, password, "GET", "/ISAPI/Streaming/channels/102", nil, "")
	if code == http.StatusOK {
		caps.HasSubStream = true
	}

	// 8. Motion Detection
	_, code, _, _ = c.DoRequest(ip, username, password, "GET", "/ISAPI/System/Video/inputs/channels/1/motionDetection", nil, "")
	if code == http.StatusOK {
		caps.HasMotionDetection = true
	}

	// 9. Line Detection
	_, code, _, _ = c.DoRequest(ip, username, password, "GET", "/ISAPI/Smart/LineDetection/1", nil, "")
	if code == http.StatusOK {
		caps.HasLineDetection = true
	}

	// 10. Intrusion Detection
	_, code, _, _ = c.DoRequest(ip, username, password, "GET", "/ISAPI/Smart/FieldDetection/1", nil, "")
	if code == http.StatusOK {
		caps.HasIntrusionDetection = true
	}

	// 11. Tamper Detection
	_, code, _, _ = c.DoRequest(ip, username, password, "GET", "/ISAPI/System/Video/inputs/channels/1/tamperDetection", nil, "")
	if code == http.StatusOK {
		caps.HasTamperDetection = true
	}

	// 12-16. Smart Events: Use /ISAPI/Smart/capabilities (SmartCap) for accurate detection
	smartCapData, scCode, _, _ := c.DoRequest(ip, username, password, "GET", "/ISAPI/Smart/capabilities", nil, "")
	if scCode == http.StatusOK {
		sc := string(smartCapData)
		if strings.Contains(sc, "<isSupportUnattendedBaggage>true</isSupportUnattendedBaggage>") {
			caps.HasUnattendedBaggage = true
		}
		if strings.Contains(sc, "<isSupportObjectRemoval>true</isSupportObjectRemoval>") ||
			strings.Contains(sc, "<isSupportAttendedBaggage>true</isSupportAttendedBaggage>") {
			caps.HasObjectRemoval = true
		}
		if strings.Contains(sc, "<isSupportRegionEntrance>true</isSupportRegionEntrance>") {
			caps.HasRegionEntrance = true
		}
		if strings.Contains(sc, "<isSupportRegionExiting>true</isSupportRegionExiting>") {
			caps.HasRegionExiting = true
		}
		// SmartCap may also confirm line/field detection
		if strings.Contains(sc, "<isSupportLineDetection>true</isSupportLineDetection>") && !caps.HasLineDetection {
			caps.HasLineDetection = true
		}
		if strings.Contains(sc, "<isSupportFieldDetection>true</isSupportFieldDetection>") && !caps.HasIntrusionDetection {
			caps.HasIntrusionDetection = true
		}
		if strings.Contains(sc, "<isSupportSceneChangeDetection>true</isSupportSceneChangeDetection>") {
			caps.HasSceneChangeDetection = true
		}
		if strings.Contains(sc, "<isSupportFaceDetection>true</isSupportFaceDetection>") || strings.Contains(sc, "<isSupportFaceDetect>true</isSupportFaceDetect>") {
			caps.HasFaceDetection = true
		}
	} else {
		// Fallback: probe individual endpoints if SmartCap not available
		_, code, _, _ = c.DoRequest(ip, username, password, "GET", "/ISAPI/Smart/UnattendedBaggage/1", nil, "")
		if code == http.StatusOK {
			caps.HasUnattendedBaggage = true
		} else {
			_, code, _, _ = c.DoRequest(ip, username, password, "GET", "/ISAPI/Smart/unattendedBaggage/1", nil, "")
			if code == http.StatusOK {
				caps.HasUnattendedBaggage = true
			}
		}
		_, code, _, _ = c.DoRequest(ip, username, password, "GET", "/ISAPI/Smart/ObjectRemoval/1", nil, "")
		if code == http.StatusOK {
			caps.HasObjectRemoval = true
		} else {
			_, code, _, _ = c.DoRequest(ip, username, password, "GET", "/ISAPI/Smart/AttendedBaggage/1", nil, "")
			if code == http.StatusOK {
				caps.HasObjectRemoval = true
			}
		}
		_, code, _, _ = c.DoRequest(ip, username, password, "GET", "/ISAPI/Smart/RegionEntrance/1", nil, "")
		if code == http.StatusOK {
			caps.HasRegionEntrance = true
		}
		_, code, _, _ = c.DoRequest(ip, username, password, "GET", "/ISAPI/Smart/RegionExiting/1", nil, "")
		if code == http.StatusOK {
			caps.HasRegionExiting = true
		}

		// Fallback probe for Scene Change Detection if SmartCap not available
		_, code, _, _ = c.DoRequest(ip, username, password, "GET", "/ISAPI/Smart/SceneChangeDetection/1", nil, "")
		if code == http.StatusOK {
			caps.HasSceneChangeDetection = true
		}

		// Fallback probe for Face Detection if SmartCap not available
		_, code, _, _ = c.DoRequest(ip, username, password, "GET", "/ISAPI/Smart/FaceDetect/1", nil, "")
		if code == http.StatusOK {
			caps.HasFaceDetection = true
		}
	}

	// 19. Target Detection & Motion Polygon support (e.g. AcuSense cameras)
	motCap, motCode, _, _ := c.DoRequest(ip, username, password, "GET", "/ISAPI/System/Video/inputs/channels/1/motionDetection/capabilities", nil, "")
	if motCode == http.StatusOK {
		motCapStr := string(motCap)
		if strings.Contains(motCapStr, "regionEdgesNum") || strings.Contains(motCapStr, `opt="grid,region"`) || strings.Contains(motCapStr, `opt="region"`) {
			caps.HasPolygonMotion = true
		}
		if strings.Contains(motCapStr, "targetType") {
			caps.HasTargetDetection = true
		}
	}

	if scCode == http.StatusOK && (strings.Contains(string(smartCapData), "<isSupportPeopleDetection>true") ||
		strings.Contains(string(smartCapData), "<isSupportHumanMisinfoFilter>true") ||
		strings.Contains(string(smartCapData), "<isSupportVehicleMisinfoFilter>true")) {
		caps.HasTargetDetection = true
	} else if !caps.HasTargetDetection {
		ldCap, ldCode, _, _ := c.DoRequest(ip, username, password, "GET", "/ISAPI/Smart/LineDetection/1/capabilities", nil, "")
		if ldCode == http.StatusOK && (strings.Contains(string(ldCap), "detectionTarget") || strings.Contains(string(ldCap), "isSupportHumanMisinfoFilter>true")) {
			caps.HasTargetDetection = true
		}
	}

	// 20. Storage
	stg, _ := c.GetStorageInfo(ip, username, password)
	if len(stg) > 0 {
		caps.HasStorage = true
	}

	// 21. Record Schedule
	_, code, _, _ = c.DoRequest(ip, username, password, "GET", "/ISAPI/ContentMgmt/record/tracks/1", nil, "")
	if code == http.StatusOK {
		caps.HasRecordSchedule = true
	}

	// 22. Capture (Snapshot)
	_, code, _, _ = c.DoRequest(ip, username, password, "GET", "/ISAPI/Snapshot/channels/1", nil, "")
	if code == http.StatusOK {
		caps.HasCapture = true
	}

	// 23. PTZ
	_, code, _, _ = c.DoRequest(ip, username, password, "GET", "/ISAPI/PTZCtrl/channels/1/capabilities", nil, "")
	if code == http.StatusOK {
		caps.HasPTZ = true
	}

	// 24. Privacy Mask
	_, code, _, _ = c.DoRequest(ip, username, password, "GET", "/ISAPI/System/Video/inputs/channels/1/privacyMask", nil, "")
	if code == http.StatusOK {
		caps.HasPrivacyMask = true
	}

	return caps, nil
}
