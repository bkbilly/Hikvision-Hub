package hikvision

import (
	"fmt"
	"net/http"
	"regexp"
	"strings"
)

func isAllZeroPoints(pts []Point) bool {
	if len(pts) == 0 {
		return true
	}
	for _, p := range pts {
		if p.X != 0 || p.Y != 0 {
			return false
		}
	}
	return true
}

func normalizeRectCoordinates(pts []Point) []Point {
	if len(pts) < 4 {
		return pts
	}
	minX, maxX := pts[0].X, pts[0].X
	minY, maxY := pts[0].Y, pts[0].Y
	for _, p := range pts[:4] {
		if p.X < minX {
			minX = p.X
		}
		if p.X > maxX {
			maxX = p.X
		}
		if p.Y < minY {
			minY = p.Y
		}
		if p.Y > maxY {
			maxY = p.Y
		}
	}
	return []Point{
		{X: minX, Y: minY}, // 1: Top-Left
		{X: maxX, Y: minY}, // 2: Top-Right
		{X: maxX, Y: maxY}, // 3: Bottom-Right
		{X: minX, Y: maxY}, // 4: Bottom-Left
	}
}

func extractMotionCoordinates(xmlContent string) []Point {
	var points []Point
	screenWidth := parseXMLIntAny(xmlContent, 1000, "normalizedScreenWidth", "screenWidth", "minHorizontalResolution", "maxHorizontalResolution")
	screenHeight := parseXMLIntAny(xmlContent, 1000, "normalizedScreenHeight", "screenHeight", "minVerticalResolution", "maxVerticalResolution")
	if screenWidth <= 0 {
		screenWidth = 1000
	}
	if screenHeight <= 0 {
		screenHeight = 1000
	}

	re := regexp.MustCompile(`(?is)<(?:Coordinates|RegionCoordinates)\b[^>]*>(.*?)</(?:Coordinates|RegionCoordinates)>`)
	matches := re.FindAllStringSubmatch(xmlContent, -1)
	for _, m := range matches {
		block := m[1]
		x := parseXMLIntAny(block, -1, "positionX", "x", "X")
		y := parseXMLIntAny(block, -1, "positionY", "y", "Y")
		if x >= 0 && y >= 0 {
			normX := x
			normY := y
			if screenWidth != 1000 && screenWidth > 0 {
				normX = (x * 1000) / screenWidth
			}
			if screenHeight != 1000 && screenHeight > 0 {
				normY = (y * 1000) / screenHeight
			}
			if normX < 0 {
				normX = 0
			} else if normX > 1000 {
				normX = 1000
			}
			if normY < 0 {
				normY = 0
			} else if normY > 1000 {
				normY = 1000
			}
			points = append(points, Point{X: normX, Y: normY})
		}
	}
	if len(points) == 0 || isAllZeroPoints(points) {
		return points
	}
	// Hikvision ISAPI camera coordinates have (0,0) at Bottom-Left and (1000,1000) at Top-Right.
	// Invert Y for screen coordinates (0 at top, 1000 at bottom).
	for i := range points {
		points[i].Y = 1000 - points[i].Y
	}
	return points
}

// GetMotionDetection queries motion detection status, grid map, sensitivity, expert regions, and day/night scheduling.
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
		swType = "off"
	}

	// Parse fallback regions list if present in base /motionDetection
	reRegion := regexp.MustCompile(`(?is)<(?:MotionDetectionRegion|Region)\b[^>]*>(.*?)</(?:MotionDetectionRegion|Region)>`)
	matches := reRegion.FindAllStringSubmatch(str, -1)
	var regions []MotionRegion
	for idx, m := range matches {
		block := m[1]
		rID := parseXMLIntAny(block, idx+1, "id", "regionID")
		coords := extractMotionCoordinates(block)
		isZero := len(coords) < 4 || isAllZeroPoints(coords)
		rEnabled := (extractXMLTag(block, "enabled") == "true") && !isZero
		rSens := parseXMLIntAny(block, masterSens, "sensitivityLevel", "sensitivity")
		rDaySens := parseXMLIntAny(block, daySens, "daySensitivityLevel", "daySensitivity")
		rNightSens := parseXMLIntAny(block, nightSens, "nightSensitivityLevel", "nightSensitivity")
		rPct := parseXMLIntAny(block, 20, "percentage", "objectSizeRatio", "proportion", "threshold")
		if isZero {
			offset := ((idx % 4)) * 60
			coords = []Point{
				{X: 150 + offset, Y: 150 + offset},
				{X: 650 + offset, Y: 150 + offset},
				{X: 650 + offset, Y: 650 + offset},
				{X: 150 + offset, Y: 650 + offset},
			}
		} else {
			coords = normalizeRectCoordinates(coords)
		}
		regions = append(regions, MotionRegion{
			ID:               rID,
			Enabled:          rEnabled,
			Sensitivity:      rSens,
			DaySensitivity:   rDaySens,
			NightSensitivity: rNightSens,
			Percentage:       rPct,
			DayPercentage:    rPct,
			NightPercentage:  rPct,
			Coordinates:      coords,
		})
	}

	// Also extract normal mode polygon region coordinates if present (e.g. AcuSense cameras like 176)
	var normalCoords []Point
	reNormRegion := regexp.MustCompile(`(?is)<Region\b[^>]*>(.*?)</Region>`)
	normMatches := reNormRegion.FindAllStringSubmatch(str, -1)
	if len(normMatches) > 0 {
		normalCoords = extractCoordinates(normMatches[0][1])
		if isAllZeroPoints(normalCoords) {
			normalCoords = nil
		}
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

	m := &MotionDetection{
		Enabled:            extractXMLTag(str, "enabled") == "true",
		Sensitivity:        masterSens,
		Mode:               mode,
		GridMap:            gridMap,
		RowGranularity:     rowGran,
		ColumnGranularity:  colGran,
		DaySensitivity:     daySens,
		NightSensitivity:   nightSens,
		DayNightSwitchType: swType,
		ScheduleStartTime:  "06:00:00",
		ScheduleEndTime:    "18:00:00",
		EnableHighlight:    extractXMLTag(str, "enableHighlight") == "true",
		TargetType:         targetType,
		Coordinates:        normalCoords,
		Regions:            regions,
	}

	// Try querying /motionDetectionExt (Hikvision extension for expert mode, multi-areas, and day/night scheduling)
	pathExt := fmt.Sprintf("/ISAPI/System/Video/inputs/channels/%d/motionDetectionExt", channelID)
	dataExt, codeExt, _, errExt := c.DoRequest(ip, username, password, "GET", pathExt, nil, "")
	if errExt == nil && codeExt == http.StatusOK {
		extStr := string(dataExt)
		m.SupportsExpert = true

		activeMode := strings.ToLower(extractXMLTag(extStr, "activeMode"))
		if activeMode == "expert" {
			m.Mode = "expert"
		} else if activeMode == "normal" {
			m.Mode = "normal"
		}

		if strings.Contains(extStr, "<objectSize>") || strings.Contains(extStr, "<dayObjectSize>") {
			m.SupportsPercentage = true
		}

		swBlock := extractXMLTag(extStr, "MotionDetectionSwitch")
		if swBlock != "" {
			switchType := strings.ToLower(extractXMLTagAny(swBlock, "type", "dayNightSwitchType"))
			if switchType == "auto" || switchType == "schedule" || switchType == "off" {
				m.DayNightSwitchType = switchType
			} else {
				m.DayNightSwitchType = "off"
			}
			schedStart := extractXMLTag(swBlock, "beginTime")
			if schedStart != "" {
				m.ScheduleStartTime = schedStart
			}
			schedEnd := extractXMLTag(swBlock, "endTime")
			if schedEnd != "" {
				m.ScheduleEndTime = schedEnd
			}
		}

		reExtRegion := regexp.MustCompile(`(?is)<MotionDetectionRegion\b[^>]*>(.*?)</MotionDetectionRegion>`)
		extMatches := reExtRegion.FindAllStringSubmatch(extStr, -1)
		if len(extMatches) > 0 {
			var extRegions []MotionRegion
			for idx, match := range extMatches {
				block := match[1]
				rID := parseXMLIntAny(block, idx+1, "id", "regionID")
				coords := extractMotionCoordinates(block)
				isZero := len(coords) < 4 || isAllZeroPoints(coords)
				rEnabled := (extractXMLTag(block, "enabled") == "true") && !isZero
				rSens := parseXMLIntAny(block, masterSens, "sensitivityLevel", "sensitivity")
				rDaySens := parseXMLIntAny(block, daySens, "daySensitivityLevel", "daySensitivity")
				rNightSens := parseXMLIntAny(block, nightSens, "nightSensitivityLevel", "nightSensitivity")
				rPct := parseXMLIntAny(block, 20, "objectSize", "percentage", "proportion")
				rDayPct := parseXMLIntAny(block, rPct, "dayObjectSize", "dayPercentage")
				rNightPct := parseXMLIntAny(block, rPct, "nightObjectSize", "nightPercentage")

				if isZero {
					offset := ((idx % 4)) * 60
					coords = []Point{
						{X: 150 + offset, Y: 150 + offset},
						{X: 650 + offset, Y: 150 + offset},
						{X: 650 + offset, Y: 650 + offset},
						{X: 150 + offset, Y: 650 + offset},
					}
				} else {
					coords = normalizeRectCoordinates(coords)
				}

				extRegions = append(extRegions, MotionRegion{
					ID:               rID,
					Enabled:          rEnabled,
					Sensitivity:      rSens,
					DaySensitivity:   rDaySens,
					NightSensitivity: rNightSens,
					Percentage:       rPct,
					DayPercentage:    rDayPct,
					NightPercentage:  rNightPct,
					Coordinates:      coords,
				})
			}
			m.Regions = extRegions
		}

		if m.Mode == "expert" {
			if extractXMLTag(extStr, "enabled") != "" {
				m.Enabled = extractXMLTag(extStr, "enabled") == "true"
			}
		}
		if extractXMLTag(extStr, "enableHighlight") != "" {
			m.EnableHighlight = extractXMLTag(extStr, "enableHighlight") == "true"
		}
	} else if len(m.Regions) == 0 {
		// Fallback for legacy camera without motionDetectionExt
		for i := 1; i <= 8; i++ {
			offset := ((i - 1) % 4) * 60
			m.Regions = append(m.Regions, MotionRegion{
				ID:               i,
				Enabled:          false,
				Sensitivity:      masterSens,
				DaySensitivity:   daySens,
				NightSensitivity: nightSens,
				Percentage:       20,
				DayPercentage:    20,
				NightPercentage:  20,
				Coordinates: []Point{
					{X: 150 + offset, Y: 150 + offset},
					{X: 650 + offset, Y: 150 + offset},
					{X: 650 + offset, Y: 650 + offset},
					{X: 150 + offset, Y: 650 + offset},
				},
			})
		}
	}

	return m, nil
}

// SetMotionDetection enables/disables motion detection and configures normal (grid/polygon) or expert (multi-area) mode.
func (c *CameraClient) SetMotionDetection(ip, username, password string, channelID int, m MotionDetection) error {
	if channelID <= 0 {
		channelID = 1
	}

	path := fmt.Sprintf("/ISAPI/System/Video/inputs/channels/%d/motionDetection", channelID)
	pathExt := fmt.Sprintf("/ISAPI/System/Video/inputs/channels/%d/motionDetectionExt", channelID)

	// In Normal mode, configure /motionDetection (grid map or polygon area).
	// This automatically sets activeMode to normal on the camera.
	if m.Mode != "expert" {
		return c.setNormalMotion(ip, username, password, channelID, m)
	}

	// Expert mode: check whether camera supports /motionDetectionExt
	dataExt, codeExt, _, errExt := c.DoRequest(ip, username, password, "GET", pathExt, nil, "")
	if errExt == nil && codeExt == http.StatusOK {
		extStr := string(dataExt)
		supportsPct := strings.Contains(extStr, "<objectSize>") || strings.Contains(extStr, "<dayObjectSize>")

		swType := m.DayNightSwitchType
		if swType != "auto" && swType != "schedule" && swType != "off" {
			swType = "off"
		}
		startTime := m.ScheduleStartTime
		if startTime == "" {
			startTime = "06:00:00"
		}
		endTime := m.ScheduleEndTime
		if endTime == "" {
			endTime = "18:00:00"
		}

		var regXML strings.Builder
		for i := 1; i <= 8; i++ {
			var reg *MotionRegion
			for _, r := range m.Regions {
				if r.ID == i {
					reg = &r
					break
				}
			}

			rEnabled := false
			rSens := m.Sensitivity
			if rSens <= 0 {
				rSens = 50
			}
			rDaySens := m.DaySensitivity
			if rDaySens <= 0 {
				rDaySens = rSens
			}
			rNightSens := m.NightSensitivity
			if rNightSens <= 0 {
				rNightSens = rSens
			}
			rPct := 20
			rDayPct := 20
			rNightPct := 20
			var coords []Point

			if reg != nil {
				rEnabled = reg.Enabled
				if reg.Sensitivity > 0 {
					rSens = reg.Sensitivity
				}
				if reg.DaySensitivity > 0 {
					rDaySens = reg.DaySensitivity
				}
				if reg.NightSensitivity > 0 {
					rNightSens = reg.NightSensitivity
				}
				if reg.Percentage >= 0 {
					rPct = reg.Percentage
				}
				if reg.DayPercentage >= 0 {
					rDayPct = reg.DayPercentage
				} else {
					rDayPct = rPct
				}
				if reg.NightPercentage >= 0 {
					rNightPct = reg.NightPercentage
				} else {
					rNightPct = rPct
				}
				coords = reg.Coordinates
			}

			if rEnabled && len(coords) >= 4 && !isAllZeroPoints(coords) {
				coords = normalizeRectCoordinates(coords)
			} else {
				rEnabled = false
				coords = []Point{{X: 0, Y: 0}, {X: 0, Y: 0}, {X: 0, Y: 0}, {X: 0, Y: 0}}
			}

			var coordsXML strings.Builder
			coordsXML.WriteString("<RegionCoordinatesList>")
			if rEnabled {
				for _, pt := range coords[:4] {
					x := pt.X
					if x < 0 {
						x = 0
					} else if x > 1000 {
						x = 1000
					}
					camY := 1000 - pt.Y
					if camY < 0 {
						camY = 0
					} else if camY > 1000 {
						camY = 1000
					}
					coordsXML.WriteString(fmt.Sprintf("<RegionCoordinates><positionX>%d</positionX><positionY>%d</positionY></RegionCoordinates>", x, camY))
				}
			} else {
				for k := 0; k < 4; k++ {
					coordsXML.WriteString("<RegionCoordinates><positionX>0</positionX><positionY>0</positionY></RegionCoordinates>")
				}
			}
			coordsXML.WriteString("</RegionCoordinatesList>")

			pctXML := ""
			if supportsPct {
				pctXML = fmt.Sprintf("<objectSize>%d</objectSize><dayObjectSize>%d</dayObjectSize><nightObjectSize>%d</nightObjectSize>", rPct, rDayPct, rNightPct)
			}

			regXML.WriteString(fmt.Sprintf(`
<MotionDetectionRegion version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <id>%d</id>
  <enabled>%t</enabled>
  <sensitivityLevel>%d</sensitivityLevel>
  <daySensitivityLevel>%d</daySensitivityLevel>
  <nightSensitivityLevel>%d</nightSensitivityLevel>
  %s
  %s
</MotionDetectionRegion>`, i, rEnabled, rSens, rDaySens, rNightSens, pctXML, coordsXML.String()))
		}

		payloadExt := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<MotionDetectionExt version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <enabled>%t</enabled>
  <samplingInterval>2</samplingInterval>
  <startTriggerTime>500</startTriggerTime>
  <endTriggerTime>500</endTriggerTime>
  <minObjectSize>0</minObjectSize>
  <maxObjectSize>100</maxObjectSize>
  <ROI>
    <minHorizontalResolution>1000</minHorizontalResolution>
    <maxHorizontalResolution>1000</maxHorizontalResolution>
  </ROI>
  <enableHighlight>%t</enableHighlight>
  <MotionDetectionSwitch version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
    <type>%s</type>
    <Schedule>
      <scheduleType>day</scheduleType>
      <TimeRange>
        <beginTime>%s</beginTime>
        <endTime>%s</endTime>
      </TimeRange>
    </Schedule>
  </MotionDetectionSwitch>
  <activeMode>expert</activeMode>
  <MotionDetectionRegionList size="8">
    %s
  </MotionDetectionRegionList>
</MotionDetectionExt>`, m.Enabled, m.EnableHighlight, escapeXML(swType), escapeXML(startTime), escapeXML(endTime), regXML.String())

		_, extCode, _, extErr := c.DoRequest(ip, username, password, "PUT", pathExt, []byte(payloadExt), "application/xml")
		if extErr != nil || (extCode != http.StatusOK && extCode != http.StatusAccepted && extCode != http.StatusNoContent) {
			return fmt.Errorf("failed to save motionDetectionExt (status %d): %v", extCode, extErr)
		}
		return nil
	}

	// Legacy camera fallback (where /motionDetectionExt is not supported)
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
			if reg.Enabled && len(reg.Coordinates) >= 4 && !isAllZeroPoints(reg.Coordinates) {
				c := normalizeRectCoordinates(reg.Coordinates)
				coordsXML.WriteString("<RegionCoordinatesList>")
				for _, pt := range c[:4] {
					x := pt.X
					if x < 0 {
						x = 0
					} else if x > 1000 {
						x = 1000
					}
					camY := 1000 - pt.Y
					if camY < 0 {
						camY = 0
					} else if camY > 1000 {
						camY = 1000
					}
					coordsXML.WriteString(fmt.Sprintf("<RegionCoordinates><positionX>%d</positionX><positionY>%d</positionY></RegionCoordinates>", x, camY))
				}
				coordsXML.WriteString("</RegionCoordinatesList>")
			} else {
				coordsXML.WriteString("<RegionCoordinatesList>")
				for k := 0; k < 4; k++ {
					coordsXML.WriteString("<RegionCoordinates><positionX>0</positionX><positionY>0</positionY></RegionCoordinates>")
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

		_, code, _, err := c.DoRequest(ip, username, password, "PUT", path, []byte(payloadExpert), "application/xml")
		if err == nil && (code == http.StatusOK || code == http.StatusAccepted || code == http.StatusNoContent) {
			return nil
		}

		// Try legacy expert mode schema (version 1.0)
		payloadExpertV1 := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<MotionDetection version="1.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <enabled>%t</enabled>
  <enableHighlight>%t</enableHighlight>
  <motionDetectionType>expert</motionDetectionType>
  <dayNightSwitchType>%s</dayNightSwitchType>
  <MotionDetectionRegionList>
    %s
  </MotionDetectionRegionList>
</MotionDetection>`, m.Enabled, m.EnableHighlight, escapeXML(m.DayNightSwitchType), regXML.String())

		_, codeV1, _, errV1 := c.DoRequest(ip, username, password, "PUT", path, []byte(payloadExpertV1), "application/xml")
		if errV1 == nil && (codeV1 == http.StatusOK || codeV1 == http.StatusAccepted || codeV1 == http.StatusNoContent) {
			return nil
		}
	}

	return c.setNormalMotion(ip, username, password, channelID, m)
}

func (c *CameraClient) setNormalMotion(ip, username, password string, channelID int, m MotionDetection) error {
	path := fmt.Sprintf("/ISAPI/System/Video/inputs/channels/%d/motionDetection", channelID)

	// If polygon coordinates are provided (3+ points), prioritize regionType="region" without gridMap
	if len(m.Coordinates) >= 3 {
		pts := make([]Point, len(m.Coordinates))
		copy(pts, m.Coordinates)

		if len(pts) == 3 {
			p1 := pts[0]
			p3 := pts[2]
			midX := (p3.X + p1.X) / 2
			midY := (p3.Y + p1.Y) / 2
			dx := p1.X - p3.X
			dy := p1.Y - p3.Y
			offX := -dy / 50
			if offX == 0 {
				offX = 2
			}
			offY := dx / 50
			if offY == 0 {
				offY = 2
			}
			nx := midX + offX
			ny := midY + offY
			if nx < 0 {
				nx = 0
			} else if nx > 1000 {
				nx = 1000
			}
			if ny < 0 {
				ny = 0
			} else if ny > 1000 {
				ny = 1000
			}
			pts = append(pts, Point{X: nx, Y: ny})
		} else if len(pts) > 10 {
			pts = pts[:10]
		}

		var coordsXML strings.Builder
		for _, pt := range pts {
			x := pt.X
			if x < 0 {
				x = 0
			} else if x > 1000 {
				x = 1000
			}
			camY := 1000 - pt.Y
			if camY < 0 {
				camY = 0
			} else if camY > 1000 {
				camY = 1000
			}
			coordsXML.WriteString(fmt.Sprintf(`
            <RegionCoordinates>
              <positionX>%d</positionX>
              <positionY>%d</positionY>
            </RegionCoordinates>`, x, camY))
		}

		targetTypeXML := ""
		if m.TargetType != "" {
			targetTypeXML = fmt.Sprintf("\n    <targetType>%s</targetType>", escapeXML(m.TargetType))
		}

		payloadRegion := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<MotionDetection version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <enabled>%t</enabled>
  <enableHighlight>%t</enableHighlight>
  <regionType>region</regionType>
  <MotionDetectionLayout version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
    <sensitivityLevel>%d</sensitivityLevel>
    <layout>
      <RegionList size="1">
        <Region>
          <id>1</id>
          <RegionCoordinatesList>%s
          </RegionCoordinatesList>
        </Region>
      </RegionList>
    </layout>%s
  </MotionDetectionLayout>
</MotionDetection>`, m.Enabled, m.EnableHighlight, m.Sensitivity, coordsXML.String(), targetTypeXML)

		data, code, _, err := c.DoRequest(ip, username, password, "PUT", path, []byte(payloadRegion), "application/xml")
		if err == nil && (code == http.StatusOK || code == http.StatusAccepted || code == http.StatusNoContent) {
			return nil
		}
		_ = data
	}

	// Normal / Standard Grid schema
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

	targetTypeXML := ""
	if m.TargetType != "" {
		targetTypeXML = fmt.Sprintf("\n    <targetType>%s</targetType>", escapeXML(m.TargetType))
	}

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
      <gridMap>%s</gridMap>
    </layout>%s
  </MotionDetectionLayout>
</MotionDetection>`, m.Enabled, m.EnableHighlight, rowGran, colGran, m.Sensitivity, escapeXML(gridMapVal), targetTypeXML)

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
