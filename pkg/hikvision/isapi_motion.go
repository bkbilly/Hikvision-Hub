package hikvision

import (
	"fmt"
	"net/http"
	"regexp"
	"strings"
)

// GetMotionDetection queries motion detection status, grid map, sensitivity, and expert regions.
func (c *CameraClient) GetMotionDetection(ip, username, password string, channelID int) (*MotionDetection, error) {
	if channelID <= 0 {
		channelID = 1
	}

	path := fmt.Sprintf("/ISAPI/System/Video/inputs/channels/%d/motionDetection", channelID)
	data, code, _, err := c.DoRequest(ip, username, password, "GET", path, nil, "")
	if err != nil || code != http.StatusOK {
		return nil, fmt.Errorf("motion detection query failed with status %d", code)
	}

	str := string(data)
	mode := extractXMLTagAny(str, "motionDetectionType", "regionType")
	if mode == "" || strings.EqualFold(mode, "grid") {
		mode = "normal"
	} else if strings.Contains(strings.ToLower(mode), "expert") {
		mode = "expert"
	} else {
		mode = "normal"
	}

	gridMap := extractXMLTag(str, "gridMap")

	daySens := parseXMLIntAny(str, 0, "daySensitivityLevel", "daySensitivity")
	nightSens := parseXMLIntAny(str, 0, "nightSensitivityLevel", "nightSensitivity")
	masterSens := parseXMLIntAny(str, 50, "sensitivityLevel", "sensitivity")
	if daySens == 0 {
		daySens = masterSens
	}
	if nightSens == 0 {
		nightSens = masterSens
	}

	swType := extractXMLTagAny(str, "dayNightSwitchType", "dayNightSwitch")
	if swType == "" {
		swType = "auto"
	}

	// Parse expert regions list
	reRegion := regexp.MustCompile(`(?is)<(?:MotionDetectionRegion|Region)\b[^>]*>(.*?)</(?:MotionDetectionRegion|Region)>`)
	matches := reRegion.FindAllStringSubmatch(str, -1)
	var regions []MotionRegion
	for idx, m := range matches {
		block := m[1]
		rID := parseXMLIntAny(block, idx+1, "id", "regionID")
		// Area 1 in expert mode is always enabled
		rEnabled := (idx == 0) || (extractXMLTag(block, "enabled") == "true")
		rSens := parseXMLIntAny(block, masterSens, "sensitivityLevel", "sensitivity")
		rDaySens := parseXMLIntAny(block, daySens, "daySensitivityLevel", "daySensitivity")
		rNightSens := parseXMLIntAny(block, nightSens, "nightSensitivityLevel", "nightSensitivity")
		rPct := parseXMLIntAny(block, 20, "percentage", "objectSizeRatio", "proportion", "threshold")
		coords := extractCoordinates(block)
		if len(coords) < 4 {
			offset := ((idx % 4)) * 80
			coords = []Point{
				{X: 150 + offset, Y: 150 + offset},
				{X: 650 + offset, Y: 150 + offset},
				{X: 650 + offset, Y: 650 + offset},
				{X: 150 + offset, Y: 650 + offset},
			}
		}
		regions = append(regions, MotionRegion{
			ID:               rID,
			Enabled:          rEnabled,
			Sensitivity:      rSens,
			DaySensitivity:   rDaySens,
			NightSensitivity: rNightSens,
			Percentage:       rPct,
			Coordinates:      coords,
		})
	}

	// If no regions found, initialize 8 default regions for expert mode (Area 1 enabled with drawn rectangle)
	if len(regions) == 0 {
		for i := 1; i <= 8; i++ {
			offset := ((i - 1) % 4) * 80
			regions = append(regions, MotionRegion{
				ID:               i,
				Enabled:          i == 1, // Area 1 is always enabled
				Sensitivity:      masterSens,
				DaySensitivity:   daySens,
				NightSensitivity: nightSens,
				Percentage:       20,
				Coordinates: []Point{
					{X: 150 + offset, Y: 150 + offset},
					{X: 650 + offset, Y: 150 + offset},
					{X: 650 + offset, Y: 650 + offset},
					{X: 150 + offset, Y: 650 + offset},
				},
			})
		}
	} else {
		// Ensure Area 1 is always enabled
		regions[0].Enabled = true
	}

	// Also extract normal mode polygon region coordinates if present (e.g. AcuSense cameras like 176)
	var normalCoords []Point
	reNormRegion := regexp.MustCompile(`(?is)<Region\b[^>]*>(.*?)</Region>`)
	normMatches := reNormRegion.FindAllStringSubmatch(str, -1)
	if len(normMatches) > 0 {
		normalCoords = extractCoordinates(normMatches[0][1])
	}

	rowGran := parseXMLIntAny(str, 0, "rowGranularity", "rows", "row")
	colGran := parseXMLIntAny(str, 0, "columnGranularity", "columns", "column", "cols")
	if colGran <= 0 {
		colGran = 22
	}
	if rowGran <= 0 {
		cleanHex := regexp.MustCompile(`[^0-9a-fA-F]`).ReplaceAllString(gridMap, "")
		bytesPerRow := (colGran + 7) / 8
		if bytesPerRow > 0 && len(cleanHex) > 0 && len(cleanHex)%(bytesPerRow*2) == 0 {
			rowGran = len(cleanHex) / (bytesPerRow * 2)
		} else {
			rowGran = 15
		}
	}

	targetType := extractXMLTagAny(str, "targetType", "detectionTarget")

	m := MotionDetection{
		Enabled:            extractXMLTag(str, "enabled") == "true",
		Sensitivity:        masterSens,
		Mode:               mode,
		GridMap:            gridMap,
		RowGranularity:     rowGran,
		ColumnGranularity:  colGran,
		DaySensitivity:     daySens,
		NightSensitivity:   nightSens,
		DayNightSwitchType: swType,
		EnableHighlight:    extractXMLTag(str, "enableHighlight") == "true",
		TargetType:         targetType,
		Coordinates:        normalCoords,
		Regions:            regions,
	}
	return &m, nil
}

// SetMotionDetection enables/disables motion detection and sets normal/expert sensitivity, gridMap, or multi-areas.
func (c *CameraClient) SetMotionDetection(ip, username, password string, channelID int, m MotionDetection) error {
	if channelID <= 0 {
		channelID = 1
	}

	path := fmt.Sprintf("/ISAPI/System/Video/inputs/channels/%d/motionDetection", channelID)

	if m.Mode == "expert" {
		if m.DaySensitivity <= 0 {
			m.DaySensitivity = m.Sensitivity
		}
		if m.NightSensitivity <= 0 {
			m.NightSensitivity = m.Sensitivity
		}
		if m.DayNightSwitchType == "" {
			m.DayNightSwitchType = "auto"
		}

		var regXML strings.Builder
		for idx, reg := range m.Regions {
			regID := reg.ID
			if regID <= 0 {
				regID = idx + 1
			}
			regSens := reg.Sensitivity
			if regSens <= 0 {
				regSens = m.Sensitivity
			}
			regDaySens := reg.DaySensitivity
			if regDaySens <= 0 {
				regDaySens = m.DaySensitivity
			}
			regNightSens := reg.NightSensitivity
			if regNightSens <= 0 {
				regNightSens = m.NightSensitivity
			}
			regPct := reg.Percentage
			if regPct < 0 {
				regPct = 0
			} else if regPct > 100 {
				regPct = 100
			}

			var coordsXML strings.Builder
			if len(reg.Coordinates) >= 4 {
				coordsXML.WriteString("<RegionCoordinatesList>")
				for _, pt := range reg.Coordinates[:4] {
					camY := 1000 - pt.Y
					if camY < 0 {
						camY = 0
					} else if camY > 1000 {
						camY = 1000
					}
					coordsXML.WriteString(fmt.Sprintf("<RegionCoordinates><positionX>%d</positionX><positionY>%d</positionY></RegionCoordinates>", pt.X, camY))
				}
				coordsXML.WriteString("</RegionCoordinatesList>")
			}

			regXML.WriteString(fmt.Sprintf(`
    <MotionDetectionRegion>
      <id>%d</id>
      <enabled>%t</enabled>
      <sensitivityLevel>%d</sensitivityLevel>
      <percentage>%d</percentage>
      <dayNightSwitch>
        <dayNightSwitchType>%s</dayNightSwitchType>
        <daySensitivityLevel>%d</daySensitivityLevel>
        <nightSensitivityLevel>%d</nightSensitivityLevel>
      </dayNightSwitch>
      %s
    </MotionDetectionRegion>`, regID, reg.Enabled, regSens, regPct, escapeXML(m.DayNightSwitchType), regDaySens, regNightSens, coordsXML.String()))
		}

		// Try expert mode schema (version 2.0 with normalizedScreenSize)
		payloadExpert := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<MotionDetection version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <enabled>%t</enabled>
  <enableHighlight>%t</enableHighlight>
  <motionDetectionType>expert</motionDetectionType>
  <normalizedScreenSize>
    <normalizedScreenWidth>1000</normalizedScreenWidth>
    <normalizedScreenHeight>1000</normalizedScreenHeight>
  </normalizedScreenSize>
  <MotionDetectionRegionList size="%d">
    %s
  </MotionDetectionRegionList>
</MotionDetection>`, m.Enabled, m.EnableHighlight, len(m.Regions), regXML.String())

		data, code, _, err := c.DoRequest(ip, username, password, "PUT", path, []byte(payloadExpert), "application/xml")
		if err == nil && (code == http.StatusOK || code == http.StatusAccepted || code == http.StatusNoContent) {
			return nil
		}

		// Try legacy expert mode schema (version 1.0)
		payloadExpertV1 := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<MotionDetection version="1.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <enabled>%t</enabled>
  <enableHighlight>%t</enableHighlight>
  <motionDetectionType>expert</motionDetectionType>
  <MotionDetectionRegionList>
    %s
  </MotionDetectionRegionList>
</MotionDetection>`, m.Enabled, m.EnableHighlight, regXML.String())

		dataV1, codeV1, _, errV1 := c.DoRequest(ip, username, password, "PUT", path, []byte(payloadExpertV1), "application/xml")
		if errV1 == nil && (codeV1 == http.StatusOK || codeV1 == http.StatusAccepted || codeV1 == http.StatusNoContent) {
			return nil
		}
		_ = data
		_ = dataV1
	}

	// Normal / Standard schema
	gridMapVal := m.GridMap
	if gridMapVal == "" {
		gridMapVal = strings.Repeat("fffffc", 15)
	}

	rowGran := m.RowGranularity
	if rowGran <= 0 {
		rowGran = 15
	}
	colGran := m.ColumnGranularity
	if colGran <= 0 {
		colGran = 22
	}

	var regionListXML string
	if len(m.Coordinates) >= 3 {
		var b strings.Builder
		b.WriteString("\n      <RegionList size=\"1\">\n        <Region>\n          <id>1</id>\n          <RegionCoordinatesList>")
		for _, pt := range m.Coordinates {
			camY := 1000 - pt.Y
			if camY < 0 {
				camY = 0
			} else if camY > 1000 {
				camY = 1000
			}
			b.WriteString(fmt.Sprintf("\n            <RegionCoordinates><positionX>%d</positionX><positionY>%d</positionY></RegionCoordinates>", pt.X, camY))
		}
		b.WriteString("\n          </RegionCoordinatesList>\n        </Region>\n      </RegionList>")
		regionListXML = b.String()
	}

	targetTypeXML := ""
	if m.TargetType != "" {
		targetTypeXML = fmt.Sprintf("\n    <targetType>%s</targetType>", escapeXML(m.TargetType))
	}

	// Payload 1: Modern ISAPI 2.0 MotionDetection with MotionDetectionLayout
	payload1 := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<MotionDetection version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <enabled>%t</enabled>
  <enableHighlight>%t</enableHighlight>
  <regionType>grid</regionType>
  <Grid>
    <rowGranularity>%d</rowGranularity>
    <columnGranularity>%d</columnGranularity>
  </Grid>
  <MotionDetectionLayout version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
    <sensitivityLevel>%d</sensitivityLevel>
    <layout>
      <gridMap>%s</gridMap>%s
    </layout>%s
  </MotionDetectionLayout>
</MotionDetection>`, m.Enabled, m.EnableHighlight, rowGran, colGran, m.Sensitivity, escapeXML(gridMapVal), regionListXML, targetTypeXML)

	// Payload 2: Classic ISAPI 1.0 MotionDetection with direct gridMap and MotionDetectionRegionList
	payload2 := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<MotionDetection version="1.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <enabled>%t</enabled>
  <enableHighlight>%t</enableHighlight>
  <motionDetectionType>normal</motionDetectionType>
  <gridMap>%s</gridMap>
  <MotionDetectionRegionList>
    <MotionDetectionRegion>
      <id>1</id>
      <enabled>%t</enabled>
      <sensitivityLevel>%d</sensitivityLevel>
    </MotionDetectionRegion>
  </MotionDetectionRegionList>
</MotionDetection>`, m.Enabled, m.EnableHighlight, escapeXML(gridMapVal), m.Enabled, m.Sensitivity)

	// Payload 3: Legacy root-level gridMap
	payload3 := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<MotionDetection version="1.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <enabled>%t</enabled>
  <gridMap>%s</gridMap>
  <MotionDetectionRegionList>
    <MotionDetectionRegion>
      <id>1</id>
      <enabled>%t</enabled>
      <sensitivityLevel>%d</sensitivityLevel>
    </MotionDetectionRegion>
  </MotionDetectionRegionList>
</MotionDetection>`, m.Enabled, escapeXML(gridMapVal), m.Enabled, m.Sensitivity)

	var lastErr error
	for _, payload := range []string{payload1, payload2, payload3} {
		data, code, _, err := c.DoRequest(ip, username, password, "PUT", path, []byte(payload), "application/xml")
		if err == nil && (code == http.StatusOK || code == http.StatusAccepted || code == http.StatusNoContent) {
			return nil
		}
		if err != nil {
			lastErr = err
		} else {
			lastErr = fmt.Errorf("status %d (resp: %s)", code, string(data))
		}
	}
	return fmt.Errorf("failed to set motion detection: %w", lastErr)
}
