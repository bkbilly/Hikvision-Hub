package hikvision

import (
	"fmt"
	"net/http"
	"strings"
)

// GetLineDetection queries Line Crossing detection parameters and extracts normalized coordinates.
func (c *CameraClient) GetLineDetection(ip, username, password string, channelID int) (*LineDetection, error) {
	if channelID <= 0 {
		channelID = 1
	}

	path := fmt.Sprintf("/ISAPI/Smart/LineDetection/%d", channelID)
	data, code, _, err := c.DoRequest(ip, username, password, "GET", path, nil, "")
	if err != nil || code != http.StatusOK {
		return nil, fmt.Errorf("line detection query failed with status %d", code)
	}

	str := string(data)
	rawDir := extractXMLTag(str, "directionSensitivity")
	if rawDir == "" {
		rawDir = extractXMLTag(str, "direction")
	}
	normDir := normalizeDirection(rawDir)

	coords := extractCoordinates(str)
	if len(coords) >= 2 {
		coords = coords[:2]
		if coords[0].X == coords[1].X && coords[0].Y == coords[1].Y {
			coords = []Point{{X: 150, Y: 500}, {X: 850, Y: 500}}
		}
	} else {
		coords = []Point{{X: 150, Y: 500}, {X: 850, Y: 500}}
	}

	// Determine enabled state: check if top-level or item-level is enabled
	isEnabled := extractXMLTag(str, "enabled") == "true"

	ld := LineDetection{
		ID:              channelID,
		Enabled:         isEnabled,
		Sensitivity:     parseXMLIntAny(str, 50, "sensitivityLevel", "sensitivity"),
		Direction:       normDir,
		DetectionTarget: extractXMLTag(str, "detectionTarget"),
		Coordinates:     coords,
	}

	return &ld, nil
}

// SetLineDetection configures Line Crossing VCA detection with coordinates and direction.
func (c *CameraClient) SetLineDetection(ip, username, password string, channelID int, ld LineDetection) error {
	if channelID <= 0 {
		channelID = 1
	}
	normDir := normalizeDirection(ld.Direction)

	var coordsXML strings.Builder
	if len(ld.Coordinates) >= 2 {
		coordsXML.WriteString("<CoordinatesList>")
		for _, pt := range ld.Coordinates {
			posX := pt.X
			if posX < 0 {
				posX = 0
			} else if posX > 1000 {
				posX = 1000
			}
			posY := 1000 - pt.Y
			if posY < 0 {
				posY = 0
			} else if posY > 1000 {
				posY = 1000
			}
			coordsXML.WriteString(fmt.Sprintf("<Coordinates><positionX>%d</positionX><positionY>%d</positionY></Coordinates>", posX, posY))
		}
		coordsXML.WriteString("</CoordinatesList>")
	} else {
		coordsXML.WriteString("<CoordinatesList><Coordinates><positionX>150</positionX><positionY>500</positionY></Coordinates><Coordinates><positionX>850</positionX><positionY>500</positionY></Coordinates></CoordinatesList>")
	}

	// Map normalized direction to Hikvision camera directionSensitivity values
	var dirSensVals []string
	if normDir == "rightToLeft" {
		dirSensVals = []string{"right-left", "rightToLeft", "bToA"}
	} else if normDir == "leftToRight" {
		dirSensVals = []string{"left-right", "leftToRight", "aToB"}
	} else {
		dirSensVals = []string{"any", "both", "all", "bidirection"}
	}

	path := fmt.Sprintf("/ISAPI/Smart/LineDetection/%d", channelID)
	var lastErr error

	// Build optional detectionTarget XML
	var targetXML string
	if ld.DetectionTarget != "" {
		targetXML = fmt.Sprintf("\n      <detectionTarget>%s</detectionTarget>", escapeXML(ld.DetectionTarget))
	}

	for _, dirVal := range dirSensVals {
		// 1. Try modern schema with LineItemList
		payload1 := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<LineDetection version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <id>%d</id>
  <enabled>%t</enabled>
  <normalizedScreenSize>
    <normalizedScreenWidth>1000</normalizedScreenWidth>
    <normalizedScreenHeight>1000</normalizedScreenHeight>
  </normalizedScreenSize>
  <LineItemList size="1">
    <LineItem>
      <id>1</id>
      <enabled>%t</enabled>
      <sensitivityLevel>%d</sensitivityLevel>
      <directionSensitivity>%s</directionSensitivity>
      %s%s
    </LineItem>
  </LineItemList>
</LineDetection>`, channelID, ld.Enabled, ld.Enabled, ld.Sensitivity, escapeXML(dirVal), coordsXML.String(), targetXML)

		data, code, _, err := c.DoRequest(ip, username, password, "PUT", path, []byte(payload1), "application/xml")
		if err == nil && (code == http.StatusOK || code == http.StatusAccepted || code == http.StatusNoContent) {
			return nil
		}
		if err != nil {
			lastErr = err
		} else {
			lastErr = fmt.Errorf("status %d (resp: %s)", code, string(data))
		}

		// 2. Try legacy schema with LineDetectionRegionList
		payload2 := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<LineDetection version="1.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <id>%d</id>
  <enabled>%t</enabled>
  <LineDetectionRegionList>
    <LineDetectionRegion>
      <id>1</id>
      <enabled>%t</enabled>
      <sensitivityLevel>%d</sensitivityLevel>
      <direction>%s</direction>
      %s
    </LineDetectionRegion>
  </LineDetectionRegionList>
</LineDetection>`, channelID, ld.Enabled, ld.Enabled, ld.Sensitivity, escapeXML(dirVal), coordsXML.String())

		data2, code2, _, err2 := c.DoRequest(ip, username, password, "PUT", path, []byte(payload2), "application/xml")
		if err2 == nil && (code2 == http.StatusOK || code2 == http.StatusAccepted || code2 == http.StatusNoContent) {
			return nil
		}
		if err2 != nil {
			lastErr = err2
		} else {
			lastErr = fmt.Errorf("status %d (resp: %s)", code2, string(data2))
		}
	}

	return lastErr
}

// GetIntrusionDetection queries Intrusion / Region Entrance detection parameters.
func (c *CameraClient) GetIntrusionDetection(ip, username, password string, channelID int) (*FieldDetection, error) {
	if channelID <= 0 {
		channelID = 1
	}

	path := fmt.Sprintf("/ISAPI/Smart/FieldDetection/%d", channelID)
	data, code, _, err := c.DoRequest(ip, username, password, "GET", path, nil, "")
	if err != nil || code != http.StatusOK {
		return nil, fmt.Errorf("intrusion detection query failed with status %d", code)
	}

	str := string(data)
	coords := extractCoordinates(str)
	if len(coords) < 4 {
		coords = []Point{{X: 200, Y: 200}, {X: 800, Y: 200}, {X: 800, Y: 800}, {X: 200, Y: 800}}
	}

	fd := FieldDetection{
		ID:              channelID,
		Enabled:         extractXMLTag(str, "enabled") == "true",
		Sensitivity:     parseXMLIntAny(str, 50, "sensitivityLevel", "sensitivity"),
		TimeThreshold:   parseXMLIntAny(str, 5, "timeThreshold", "threshold"),
		DetectionTarget: extractXMLTag(str, "detectionTarget"),
		Coordinates:     coords,
	}
	return &fd, nil
}

// SetIntrusionDetection configures Intrusion detection with region coordinates.
func (c *CameraClient) SetIntrusionDetection(ip, username, password string, channelID int, fd FieldDetection) error {
	if channelID <= 0 {
		channelID = 1
	}
	if fd.TimeThreshold <= 0 {
		fd.TimeThreshold = 5
	}

	var coordsXML strings.Builder
	if len(fd.Coordinates) >= 4 {
		coordsXML.WriteString("<RegionCoordinatesList>")
		for _, pt := range fd.Coordinates {
			posX := pt.X
			if posX < 0 {
				posX = 0
			} else if posX > 1000 {
				posX = 1000
			}
			posY := 1000 - pt.Y
			if posY < 0 {
				posY = 0
			} else if posY > 1000 {
				posY = 1000
			}
			coordsXML.WriteString(fmt.Sprintf("<RegionCoordinates><positionX>%d</positionX><positionY>%d</positionY></RegionCoordinates>", posX, posY))
		}
		coordsXML.WriteString("</RegionCoordinatesList>")
	}

	path := fmt.Sprintf("/ISAPI/Smart/FieldDetection/%d", channelID)

	// Build optional detectionTarget XML
	var targetXML string
	if fd.DetectionTarget != "" {
		targetXML = fmt.Sprintf("\n      <detectionTarget>%s</detectionTarget>", escapeXML(fd.DetectionTarget))
	}

	// 1. Try modern schema with version 2.0
	payload1 := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<FieldDetection version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <id>%d</id>
  <enabled>%t</enabled>
  <normalizedScreenSize>
    <normalizedScreenWidth>1000</normalizedScreenWidth>
    <normalizedScreenHeight>1000</normalizedScreenHeight>
  </normalizedScreenSize>
  <FieldDetectionRegionList size="1">
    <FieldDetectionRegion version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
      <id>1</id>
      <enabled>%t</enabled>
      <sensitivityLevel>%d</sensitivityLevel>
      <timeThreshold>%d</timeThreshold>
      %s%s
    </FieldDetectionRegion>
  </FieldDetectionRegionList>
</FieldDetection>`, channelID, fd.Enabled, fd.Enabled, fd.Sensitivity, fd.TimeThreshold, coordsXML.String(), targetXML)

	_, code, _, err := c.DoRequest(ip, username, password, "PUT", path, []byte(payload1), "application/xml")
	if err == nil && (code == http.StatusOK || code == http.StatusAccepted || code == http.StatusNoContent) {
		return nil
	}

	// 2. Try legacy schema
	payload2 := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<FieldDetection version="1.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <id>%d</id>
  <enabled>%t</enabled>
  <FieldDetectionRegionList>
    <FieldDetectionRegion>
      <id>1</id>
      <enabled>%t</enabled>
      <sensitivityLevel>%d</sensitivityLevel>
      <timeThreshold>%d</timeThreshold>
      %s
    </FieldDetectionRegion>
  </FieldDetectionRegionList>
</FieldDetection>`, channelID, fd.Enabled, fd.Enabled, fd.Sensitivity, fd.TimeThreshold, coordsXML.String())

	data2, code2, _, err2 := c.DoRequest(ip, username, password, "PUT", path, []byte(payload2), "application/xml")
	if err2 != nil {
		return fmt.Errorf("failed to set intrusion detection: %w", err2)
	}
	if code2 != http.StatusOK && code2 != http.StatusAccepted && code2 != http.StatusNoContent {
		return fmt.Errorf("failed to set intrusion detection: status %d (resp: %s)", code2, string(data2))
	}
	return nil
}

// GetRegionEntrance queries Region Entrance smart detection.
func (c *CameraClient) GetRegionEntrance(ip, username, password string, channelID int) (*RegionEntrance, error) {
	if channelID <= 0 {
		channelID = 1
	}
	path := fmt.Sprintf("/ISAPI/Smart/RegionEntrance/%d", channelID)
	data, code, _, err := c.DoRequest(ip, username, password, "GET", path, nil, "")
	if err != nil || code != http.StatusOK {
		return nil, fmt.Errorf("region entrance query failed with status %d", code)
	}
	str := string(data)
	coords := extractCoordinates(str)
	if len(coords) < 4 {
		coords = []Point{{X: 200, Y: 200}, {X: 800, Y: 200}, {X: 800, Y: 800}, {X: 200, Y: 800}}
	}
	re := RegionEntrance{
		ID:              channelID,
		Enabled:         extractXMLTag(str, "enabled") == "true",
		Sensitivity:     parseXMLIntAny(str, 50, "sensitivityLevel", "sensitivity"),
		DetectionTarget: extractXMLTag(str, "detectionTarget"),
		Coordinates:     coords,
	}
	return &re, nil
}

// SetRegionEntrance configures Region Entrance smart detection.
func (c *CameraClient) SetRegionEntrance(ip, username, password string, channelID int, re RegionEntrance) error {
	if channelID <= 0 {
		channelID = 1
	}
	var coordsXML strings.Builder
	if len(re.Coordinates) >= 4 {
		coordsXML.WriteString("<RegionCoordinatesList>")
		for _, pt := range re.Coordinates {
			posX := pt.X
			if posX < 0 { posX = 0 } else if posX > 1000 { posX = 1000 }
			posY := 1000 - pt.Y
			if posY < 0 { posY = 0 } else if posY > 1000 { posY = 1000 }
			coordsXML.WriteString(fmt.Sprintf("<RegionCoordinates><positionX>%d</positionX><positionY>%d</positionY></RegionCoordinates>", posX, posY))
		}
		coordsXML.WriteString("</RegionCoordinatesList>")
	}
	var targetXML string
	if re.DetectionTarget != "" {
		targetXML = fmt.Sprintf("\n      <detectionTarget>%s</detectionTarget>", escapeXML(re.DetectionTarget))
	}
	path := fmt.Sprintf("/ISAPI/Smart/RegionEntrance/%d", channelID)
	payload := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<RegionEntrance version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <id>%d</id>
  <enabled>%t</enabled>
  <normalizedScreenSize>
    <normalizedScreenWidth>1000</normalizedScreenWidth>
    <normalizedScreenHeight>1000</normalizedScreenHeight>
  </normalizedScreenSize>
  <RegionEntranceRegionList size="1">
    <RegionEntranceRegion>
      <id>1</id>
      <sensitivityLevel>%d</sensitivityLevel>
      %s%s
    </RegionEntranceRegion>
  </RegionEntranceRegionList>
</RegionEntrance>`, channelID, re.Enabled, re.Sensitivity, coordsXML.String(), targetXML)

	data, code, _, err := c.DoRequest(ip, username, password, "PUT", path, []byte(payload), "application/xml")
	if err != nil {
		return fmt.Errorf("failed to set region entrance: %w", err)
	}
	if code != http.StatusOK && code != http.StatusAccepted && code != http.StatusNoContent {
		return fmt.Errorf("failed to set region entrance: status %d (resp: %s)", code, string(data))
	}
	return nil
}

// GetRegionExiting queries Region Exiting smart detection.
func (c *CameraClient) GetRegionExiting(ip, username, password string, channelID int) (*RegionExiting, error) {
	if channelID <= 0 {
		channelID = 1
	}
	path := fmt.Sprintf("/ISAPI/Smart/RegionExiting/%d", channelID)
	data, code, _, err := c.DoRequest(ip, username, password, "GET", path, nil, "")
	if err != nil || code != http.StatusOK {
		return nil, fmt.Errorf("region exiting query failed with status %d", code)
	}
	str := string(data)
	coords := extractCoordinates(str)
	if len(coords) < 4 {
		coords = []Point{{X: 200, Y: 200}, {X: 800, Y: 200}, {X: 800, Y: 800}, {X: 200, Y: 800}}
	}
	re := RegionExiting{
		ID:              channelID,
		Enabled:         extractXMLTag(str, "enabled") == "true",
		Sensitivity:     parseXMLIntAny(str, 50, "sensitivityLevel", "sensitivity"),
		DetectionTarget: extractXMLTag(str, "detectionTarget"),
		Coordinates:     coords,
	}
	return &re, nil
}

// SetRegionExiting configures Region Exiting smart detection.
func (c *CameraClient) SetRegionExiting(ip, username, password string, channelID int, re RegionExiting) error {
	if channelID <= 0 {
		channelID = 1
	}
	var coordsXML strings.Builder
	if len(re.Coordinates) >= 4 {
		coordsXML.WriteString("<RegionCoordinatesList>")
		for _, pt := range re.Coordinates {
			posX := pt.X
			if posX < 0 { posX = 0 } else if posX > 1000 { posX = 1000 }
			posY := 1000 - pt.Y
			if posY < 0 { posY = 0 } else if posY > 1000 { posY = 1000 }
			coordsXML.WriteString(fmt.Sprintf("<RegionCoordinates><positionX>%d</positionX><positionY>%d</positionY></RegionCoordinates>", posX, posY))
		}
		coordsXML.WriteString("</RegionCoordinatesList>")
	}
	var targetXML string
	if re.DetectionTarget != "" {
		targetXML = fmt.Sprintf("\n      <detectionTarget>%s</detectionTarget>", escapeXML(re.DetectionTarget))
	}
	path := fmt.Sprintf("/ISAPI/Smart/RegionExiting/%d", channelID)
	payload := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<RegionExiting version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <id>%d</id>
  <enabled>%t</enabled>
  <normalizedScreenSize>
    <normalizedScreenWidth>1000</normalizedScreenWidth>
    <normalizedScreenHeight>1000</normalizedScreenHeight>
  </normalizedScreenSize>
  <RegionExitingRegionList size="1">
    <RegionExitingRegion>
      <id>1</id>
      <sensitivityLevel>%d</sensitivityLevel>
      %s%s
    </RegionExitingRegion>
  </RegionExitingRegionList>
</RegionExiting>`, channelID, re.Enabled, re.Sensitivity, coordsXML.String(), targetXML)

	data, code, _, err := c.DoRequest(ip, username, password, "PUT", path, []byte(payload), "application/xml")
	if err != nil {
		return fmt.Errorf("failed to set region exiting: %w", err)
	}
	if code != http.StatusOK && code != http.StatusAccepted && code != http.StatusNoContent {
		return fmt.Errorf("failed to set region exiting: status %d (resp: %s)", code, string(data))
	}
	return nil
}

// GetTamperDetection queries Tamper detection parameters and regional boundary.
func (c *CameraClient) GetTamperDetection(ip, username, password string, channelID int) (*TamperDetection, error) {
	if channelID <= 0 {
		channelID = 1
	}

	paths := []string{
		fmt.Sprintf("/ISAPI/System/Video/inputs/channels/%d/tamperDetection", channelID),
		fmt.Sprintf("/ISAPI/Smart/TamperDetection/%d", channelID),
		fmt.Sprintf("/ISAPI/Smart/tamperDetection/%d", channelID),
		fmt.Sprintf("/ISAPI/System/Video/inputs/channels/%d/tamper", channelID),
	}

	var data []byte
	var code int
	var err error

	for _, p := range paths {
		data, code, _, err = c.DoRequest(ip, username, password, "GET", p, nil, "")
		if err == nil && code == http.StatusOK {
			break
		}
	}

	if code != http.StatusOK {
		return nil, fmt.Errorf("tamper detection query failed with status %d", code)
	}

	str := string(data)
	coords := extractCoordinates(str)
	if len(coords) < 4 {
		coords = []Point{
			{X: 100, Y: 100},
			{X: 900, Y: 100},
			{X: 900, Y: 900},
			{X: 100, Y: 900},
		}
	}

	td := TamperDetection{
		Enabled:     extractXMLTag(str, "enabled") == "true",
		Sensitivity: parseXMLIntAny(str, 50, "sensitivityLevel", "sensitivity"),
		Coordinates: coords,
	}
	return &td, nil
}

// SetTamperDetection configures Tamper detection with sensitivity and regional boundary.
func (c *CameraClient) SetTamperDetection(ip, username, password string, channelID int, td TamperDetection) error {
	if channelID <= 0 {
		channelID = 1
	}

	var coordsXML strings.Builder
	if len(td.Coordinates) >= 4 {
		coordsXML.WriteString("<RegionCoordinatesList>")
		for _, pt := range td.Coordinates[:4] {
			posX := pt.X
			if posX < 0 {
				posX = 0
			} else if posX > 1000 {
				posX = 1000
			}
			posY := 1000 - pt.Y
			if posY < 0 {
				posY = 0
			} else if posY > 1000 {
				posY = 1000
			}
			coordsXML.WriteString(fmt.Sprintf("<RegionCoordinates><positionX>%d</positionX><positionY>%d</positionY></RegionCoordinates>", posX, posY))
		}
		coordsXML.WriteString("</RegionCoordinatesList>")
	}

	paths := []string{
		fmt.Sprintf("/ISAPI/System/Video/inputs/channels/%d/tamperDetection", channelID),
		fmt.Sprintf("/ISAPI/Smart/TamperDetection/%d", channelID),
		fmt.Sprintf("/ISAPI/Smart/tamperDetection/%d", channelID),
		fmt.Sprintf("/ISAPI/System/Video/inputs/channels/%d/tamper", channelID),
	}

	// Payload 1: System Video Input with normalizedScreenSize
	payload1 := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<TamperDetection version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <enabled>%t</enabled>
  <normalizedScreenSize>
    <normalizedScreenWidth>1000</normalizedScreenWidth>
    <normalizedScreenHeight>1000</normalizedScreenHeight>
  </normalizedScreenSize>
  <TamperDetectionRegionList size="1">
    <TamperDetectionRegion>
      <id>1</id>
      <enabled>%t</enabled>
      <sensitivityLevel>%d</sensitivityLevel>
      %s
    </TamperDetectionRegion>
  </TamperDetectionRegionList>
</TamperDetection>`, td.Enabled, td.Enabled, td.Sensitivity, coordsXML.String())

	// Payload 2: Modern Smart schema with normalizedScreenSize and root id
	payload2 := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<TamperDetection version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <id>%d</id>
  <enabled>%t</enabled>
  <normalizedScreenSize>
    <normalizedScreenWidth>1000</normalizedScreenWidth>
    <normalizedScreenHeight>1000</normalizedScreenHeight>
  </normalizedScreenSize>
  <TamperDetectionRegionList size="1">
    <TamperDetectionRegion version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
      <id>1</id>
      <enabled>%t</enabled>
      <sensitivityLevel>%d</sensitivityLevel>
      %s
    </TamperDetectionRegion>
  </TamperDetectionRegionList>
</TamperDetection>`, channelID, td.Enabled, td.Enabled, td.Sensitivity, coordsXML.String())

	// Payload 3: Legacy schema with TamperDetectionRegionList
	payload3 := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<TamperDetection version="1.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <id>%d</id>
  <enabled>%t</enabled>
  <TamperDetectionRegionList>
    <TamperDetectionRegion>
      <id>1</id>
      <enabled>%t</enabled>
      <sensitivityLevel>%d</sensitivityLevel>
      %s
    </TamperDetectionRegion>
  </TamperDetectionRegionList>
</TamperDetection>`, channelID, td.Enabled, td.Enabled, td.Sensitivity, coordsXML.String())

	// Payload 4: Basic full-screen fallback
	payload4 := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<TamperDetection version="1.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <enabled>%t</enabled>
  <sensitivityLevel>%d</sensitivityLevel>
</TamperDetection>`, td.Enabled, td.Sensitivity)

	var lastErr error
	for _, path := range paths {
		for _, payload := range []string{payload1, payload2, payload3, payload4} {
			data, code, _, err := c.DoRequest(ip, username, password, "PUT", path, []byte(payload), "application/xml")
			if err == nil && (code == http.StatusOK || code == http.StatusAccepted || code == http.StatusNoContent) {
				return nil
			}
			if err != nil {
				lastErr = err
			} else if code != http.StatusNotFound {
				lastErr = fmt.Errorf("status %d (resp: %s)", code, string(data))
			}
		}
	}

	return lastErr
}

// GetUnattendedBaggage queries Unattended Baggage / Left Luggage smart detection.
func (c *CameraClient) GetUnattendedBaggage(ip, username, password string, channelID int) (*UnattendedBaggage, error) {
	if channelID <= 0 {
		channelID = 1
	}

	paths := []string{
		fmt.Sprintf("/ISAPI/Smart/UnattendedBaggage/%d", channelID),
		fmt.Sprintf("/ISAPI/Smart/unattendedBaggage/%d", channelID),
		fmt.Sprintf("/ISAPI/Smart/LeftLuggage/%d", channelID),
	}

	var data []byte
	var code int
	var err error

	for _, p := range paths {
		data, code, _, err = c.DoRequest(ip, username, password, "GET", p, nil, "")
		if err == nil && code == http.StatusOK {
			break
		}
	}

	if code != http.StatusOK {
		return nil, fmt.Errorf("unattended baggage query failed with status %d", code)
	}

	str := string(data)
	coords := extractCoordinates(str)
	if len(coords) < 4 {
		coords = []Point{{X: 250, Y: 250}, {X: 750, Y: 250}, {X: 750, Y: 750}, {X: 250, Y: 750}}
	}

	ub := UnattendedBaggage{
		ID:            channelID,
		Enabled:       extractXMLTag(str, "enabled") == "true",
		Sensitivity:   parseXMLIntAny(str, 50, "sensitivityLevel", "sensitivity"),
		TimeThreshold: parseXMLIntAny(str, 10, "timeThreshold", "threshold"),
		Coordinates:   coords,
	}
	return &ub, nil
}

// SetUnattendedBaggage configures Unattended Baggage smart detection.
func (c *CameraClient) SetUnattendedBaggage(ip, username, password string, channelID int, ub UnattendedBaggage) error {
	if channelID <= 0 {
		channelID = 1
	}
	if ub.TimeThreshold <= 0 {
		ub.TimeThreshold = 10
	}

	var coordsXML strings.Builder
	if len(ub.Coordinates) >= 4 {
		coordsXML.WriteString("<RegionCoordinatesList>")
		for _, pt := range ub.Coordinates {
			posX := pt.X
			if posX < 0 {
				posX = 0
			} else if posX > 1000 {
				posX = 1000
			}
			posY := 1000 - pt.Y
			if posY < 0 {
				posY = 0
			} else if posY > 1000 {
				posY = 1000
			}
			coordsXML.WriteString(fmt.Sprintf("<RegionCoordinates><positionX>%d</positionX><positionY>%d</positionY></RegionCoordinates>", posX, posY))
		}
		coordsXML.WriteString("</RegionCoordinatesList>")
	}

	paths := []string{
		fmt.Sprintf("/ISAPI/Smart/UnattendedBaggage/%d", channelID),
		fmt.Sprintf("/ISAPI/Smart/unattendedBaggage/%d", channelID),
		fmt.Sprintf("/ISAPI/Smart/LeftLuggage/%d", channelID),
	}

	payload1 := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<UnattendedBaggage version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <id>%d</id>
  <enabled>%t</enabled>
  <normalizedScreenSize>
    <normalizedScreenWidth>1000</normalizedScreenWidth>
    <normalizedScreenHeight>1000</normalizedScreenHeight>
  </normalizedScreenSize>
  <UnattendedBaggageRegionList size="1">
    <UnattendedBaggageRegion version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
      <id>1</id>
      <enabled>%t</enabled>
      <sensitivityLevel>%d</sensitivityLevel>
      <timeThreshold>%d</timeThreshold>
      %s
    </UnattendedBaggageRegion>
  </UnattendedBaggageRegionList>
</UnattendedBaggage>`, channelID, ub.Enabled, ub.Enabled, ub.Sensitivity, ub.TimeThreshold, coordsXML.String())

	payload2 := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<UnattendedBaggage version="1.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <id>%d</id>
  <enabled>%t</enabled>
  <UnattendedBaggageRegionList>
    <UnattendedBaggageRegion>
      <id>1</id>
      <enabled>%t</enabled>
      <sensitivityLevel>%d</sensitivityLevel>
      <timeThreshold>%d</timeThreshold>
      %s
    </UnattendedBaggageRegion>
  </UnattendedBaggageRegionList>
</UnattendedBaggage>`, channelID, ub.Enabled, ub.Enabled, ub.Sensitivity, ub.TimeThreshold, coordsXML.String())

	var lastErr error
	for _, path := range paths {
		_, code, _, err := c.DoRequest(ip, username, password, "PUT", path, []byte(payload1), "application/xml")
		if err == nil && (code == http.StatusOK || code == http.StatusAccepted || code == http.StatusNoContent) {
			return nil
		}
		data2, code2, _, err2 := c.DoRequest(ip, username, password, "PUT", path, []byte(payload2), "application/xml")
		if err2 == nil && (code2 == http.StatusOK || code2 == http.StatusAccepted || code2 == http.StatusNoContent) {
			return nil
		}
		if err2 != nil {
			lastErr = err2
		} else {
			lastErr = fmt.Errorf("status %d (resp: %s)", code2, string(data2))
		}
	}
	return lastErr
}

// GetObjectRemoval queries Object Removal / Taken Away smart detection.
func (c *CameraClient) GetObjectRemoval(ip, username, password string, channelID int) (*ObjectRemoval, error) {
	if channelID <= 0 {
		channelID = 1
	}

	paths := []string{
		fmt.Sprintf("/ISAPI/Smart/ObjectRemoval/%d", channelID),
		fmt.Sprintf("/ISAPI/Smart/objectRemoval/%d", channelID),
		fmt.Sprintf("/ISAPI/Smart/AttendedBaggage/%d", channelID),
		fmt.Sprintf("/ISAPI/Smart/attendedBaggage/%d", channelID),
		fmt.Sprintf("/ISAPI/Smart/ObjectTaken/%d", channelID),
	}

	var data []byte
	var code int
	var err error

	for _, p := range paths {
		data, code, _, err = c.DoRequest(ip, username, password, "GET", p, nil, "")
		if err == nil && code == http.StatusOK {
			break
		}
	}

	if code != http.StatusOK {
		return nil, fmt.Errorf("object removal query failed with status %d", code)
	}

	str := string(data)
	coords := extractCoordinates(str)
	if len(coords) < 4 {
		coords = []Point{{X: 300, Y: 300}, {X: 700, Y: 300}, {X: 700, Y: 700}, {X: 300, Y: 700}}
	}

	or := ObjectRemoval{
		ID:            channelID,
		Enabled:       extractXMLTag(str, "enabled") == "true",
		Sensitivity:   parseXMLIntAny(str, 50, "sensitivityLevel", "sensitivity"),
		TimeThreshold: parseXMLIntAny(str, 10, "timeThreshold", "threshold"),
		Coordinates:   coords,
	}
	return &or, nil
}

// SetObjectRemoval configures Object Removal smart detection.
func (c *CameraClient) SetObjectRemoval(ip, username, password string, channelID int, or ObjectRemoval) error {
	if channelID <= 0 {
		channelID = 1
	}
	if or.TimeThreshold <= 0 {
		or.TimeThreshold = 10
	}

	var coordsXML strings.Builder
	if len(or.Coordinates) >= 4 {
		coordsXML.WriteString("<RegionCoordinatesList>")
		for _, pt := range or.Coordinates {
			posX := pt.X
			if posX < 0 {
				posX = 0
			} else if posX > 1000 {
				posX = 1000
			}
			posY := 1000 - pt.Y
			if posY < 0 {
				posY = 0
			} else if posY > 1000 {
				posY = 1000
			}
			coordsXML.WriteString(fmt.Sprintf("<RegionCoordinates><positionX>%d</positionX><positionY>%d</positionY></RegionCoordinates>", posX, posY))
		}
		coordsXML.WriteString("</RegionCoordinatesList>")
	}

	paths := []string{
		fmt.Sprintf("/ISAPI/Smart/ObjectRemoval/%d", channelID),
		fmt.Sprintf("/ISAPI/Smart/objectRemoval/%d", channelID),
		fmt.Sprintf("/ISAPI/Smart/AttendedBaggage/%d", channelID),
		fmt.Sprintf("/ISAPI/Smart/attendedBaggage/%d", channelID),
		fmt.Sprintf("/ISAPI/Smart/ObjectTaken/%d", channelID),
	}

	payload1 := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<ObjectRemoval version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <id>%d</id>
  <enabled>%t</enabled>
  <normalizedScreenSize>
    <normalizedScreenWidth>1000</normalizedScreenWidth>
    <normalizedScreenHeight>1000</normalizedScreenHeight>
  </normalizedScreenSize>
  <ObjectRemovalRegionList size="1">
    <ObjectRemovalRegion version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
      <id>1</id>
      <enabled>%t</enabled>
      <sensitivityLevel>%d</sensitivityLevel>
      <timeThreshold>%d</timeThreshold>
      %s
    </ObjectRemovalRegion>
  </ObjectRemovalRegionList>
</ObjectRemoval>`, channelID, or.Enabled, or.Enabled, or.Sensitivity, or.TimeThreshold, coordsXML.String())

	payload2 := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<ObjectRemoval version="1.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <id>%d</id>
  <enabled>%t</enabled>
  <ObjectRemovalRegionList>
    <ObjectRemovalRegion>
      <id>1</id>
      <enabled>%t</enabled>
      <sensitivityLevel>%d</sensitivityLevel>
      <timeThreshold>%d</timeThreshold>
      %s
    </ObjectRemovalRegion>
  </ObjectRemovalRegionList>
</ObjectRemoval>`, channelID, or.Enabled, or.Enabled, or.Sensitivity, or.TimeThreshold, coordsXML.String())

	payloadAttended := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<AttendedBaggage version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <id>%d</id>
  <enabled>%t</enabled>
  <normalizedScreenSize>
    <normalizedScreenWidth>1000</normalizedScreenWidth>
    <normalizedScreenHeight>1000</normalizedScreenHeight>
  </normalizedScreenSize>
  <AttendedBaggageRegionList size="1">
    <AttendedBaggageRegion>
      <id>1</id>
      <sensitivityLevel>%d</sensitivityLevel>
      <timeThreshold>%d</timeThreshold>
      %s
    </AttendedBaggageRegion>
  </AttendedBaggageRegionList>
  <isSupportMultiScene>false</isSupportMultiScene>
</AttendedBaggage>`, channelID, or.Enabled, or.Sensitivity, or.TimeThreshold, coordsXML.String())

	var lastErr error
	for _, path := range paths {
		targetPayload := payload1
		if strings.Contains(strings.ToLower(path), "attendedbaggage") {
			targetPayload = payloadAttended
		}
		_, code, _, err := c.DoRequest(ip, username, password, "PUT", path, []byte(targetPayload), "application/xml")
		if err == nil && (code == http.StatusOK || code == http.StatusAccepted || code == http.StatusNoContent) {
			return nil
		}
		if !strings.Contains(strings.ToLower(path), "attendedbaggage") {
			data2, code2, _, err2 := c.DoRequest(ip, username, password, "PUT", path, []byte(payload2), "application/xml")
			if err2 == nil && (code2 == http.StatusOK || code2 == http.StatusAccepted || code2 == http.StatusNoContent) {
				return nil
			}
			if err2 != nil {
				lastErr = err2
			} else {
				lastErr = fmt.Errorf("status %d (resp: %s)", code2, string(data2))
			}
		} else {
			if err != nil {
				lastErr = err
			} else {
				lastErr = fmt.Errorf("status %d", code)
			}
		}
	}
	return lastErr
}
