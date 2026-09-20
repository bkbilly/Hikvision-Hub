package hikvision

import (
	"fmt"
	"net/http"
	"regexp"
	"strings"
)

// GetPrivacyMask retrieves privacy masking configuration and regions from the camera.
func (c *CameraClient) GetPrivacyMask(ip, username, password string, channelID int) (*PrivacyMask, error) {
	if channelID <= 0 {
		channelID = 1
	}

	paths := []string{
		fmt.Sprintf("/ISAPI/System/Video/inputs/channels/%d/privacyMask", channelID),
		"/ISAPI/System/Video/inputs/channels/1/privacyMask",
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

	if err != nil || code != http.StatusOK {
		return nil, fmt.Errorf("privacy mask query failed with status %d", code)
	}

	str := string(data)

	// Screen dimensions for normalization
	sw := parseXMLIntAny(str, 704, "normalizedScreenWidth", "screenWidth")
	sh := parseXMLIntAny(str, 480, "normalizedScreenHeight", "screenHeight")
	if sw <= 0 {
		sw = 704
	}
	if sh <= 0 {
		sh = 480
	}

	// Global enabled flag
	isEnabled := false
	reGlobalEnabled := regexp.MustCompile(`(?is)<PrivacyMask\b[^>]*>.*?<enabled>\s*(true|false)\s*</enabled>`)
	if m := reGlobalEnabled.FindStringSubmatch(str); len(m) > 1 {
		isEnabled = strings.ToLower(strings.TrimSpace(m[1])) == "true"
	} else if strings.Contains(str, "<enabled>true</enabled>") {
		isEnabled = true
	}

	// Extract regions (supports up to 4 regions)
	var regions []PrivacyMaskRegion
	reRegion := regexp.MustCompile(`(?is)<PrivacyMaskRegion\b[^>]*>(.*?)</PrivacyMaskRegion>`)
	regionMatches := reRegion.FindAllStringSubmatch(str, -1)

	for _, rm := range regionMatches {
		rBlock := rm[1]
		id := parseXMLIntAny(rBlock, len(regions)+1, "id")
		rEnabled := extractXMLTag(rBlock, "enabled") == "true"

		// Extract coordinates
		reCoord := regexp.MustCompile(`(?is)<RegionCoordinates\b[^>]*>(.*?)</RegionCoordinates>`)
		coordMatches := reCoord.FindAllStringSubmatch(rBlock, -1)
		var coords []Point
		for _, cm := range coordMatches {
			cBlock := cm[1]
			x := parseXMLIntAny(cBlock, -1, "positionX", "x", "X")
			y := parseXMLIntAny(cBlock, -1, "positionY", "y", "Y")
			if x >= 0 && y >= 0 {
				normX := (x * 1000) / sw
				normY := 1000 - ((y * 1000) / sh)
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
				coords = append(coords, Point{X: normX, Y: normY})
			}
		}

		if len(coords) >= 4 {
			// Ensure it's ordered as top-left, top-right, bottom-right, bottom-left
			minX := 1000
			maxX := 0
			minY := 1000
			maxY := 0
			for _, pt := range coords[:4] {
				if pt.X < minX {
					minX = pt.X
				}
				if pt.X > maxX {
					maxX = pt.X
				}
				if pt.Y < minY {
					minY = pt.Y
				}
				if pt.Y > maxY {
					maxY = pt.Y
				}
			}
			coords = []Point{
				{X: minX, Y: minY},
				{X: maxX, Y: minY},
				{X: maxX, Y: maxY},
				{X: minX, Y: maxY},
			}
		}

		regions = append(regions, PrivacyMaskRegion{
			ID:          id,
			Enabled:     rEnabled,
			Coordinates: coords,
		})
	}

	if regions == nil {
		regions = []PrivacyMaskRegion{}
	}

	pm := &PrivacyMask{
		Enabled:                isEnabled,
		NormalizedScreenWidth:  sw,
		NormalizedScreenHeight: sh,
		Regions:                regions,
	}

	return pm, nil
}

// SetPrivacyMask updates privacy masking configuration on the camera.
func (c *CameraClient) SetPrivacyMask(ip, username, password string, channelID int, mask PrivacyMask) error {
	if channelID <= 0 {
		channelID = 1
	}

	paths := []string{
		fmt.Sprintf("/ISAPI/System/Video/inputs/channels/%d/privacyMask", channelID),
		"/ISAPI/System/Video/inputs/channels/1/privacyMask",
	}

	sw := 704
	sh := 480
	for _, p := range paths {
		if curData, curCode, _, curErr := c.DoRequest(ip, username, password, "GET", p, nil, ""); curErr == nil && curCode == http.StatusOK {
			curStr := string(curData)
			if parsedW := parseXMLIntAny(curStr, 0, "normalizedScreenWidth", "screenWidth"); parsedW > 0 {
				sw = parsedW
			}
			if parsedH := parseXMLIntAny(curStr, 0, "normalizedScreenHeight", "screenHeight"); parsedH > 0 {
				sh = parsedH
			}
			break
		}
	}

	var regionsXML strings.Builder
	for idx, r := range mask.Regions {
		if len(r.Coordinates) < 4 {
			continue
		}
		regID := r.ID
		if regID <= 0 {
			regID = idx + 1
		}
		if regID > 4 {
			continue // camera supports up to 4 regions
		}

		minX := 1000
		maxX := 0
		minY := 1000
		maxY := 0
		for _, pt := range r.Coordinates[:4] {
			if pt.X < minX {
				minX = pt.X
			}
			if pt.X > maxX {
				maxX = pt.X
			}
			if pt.Y < minY {
				minY = pt.Y
			}
			if pt.Y > maxY {
				maxY = pt.Y
			}
		}
		if minX < 0 {
			minX = 0
		}
		if maxX > 1000 {
			maxX = 1000
		}
		if minY < 0 {
			minY = 0
		}
		if maxY > 1000 {
			maxY = 1000
		}
		if minX >= maxX {
			maxX = minX + 50
			if maxX > 1000 {
				maxX = 1000
				minX = 950
			}
		}
		if minY >= maxY {
			maxY = minY + 50
			if maxY > 1000 {
				maxY = 1000
				minY = 950
			}
		}

		x1 := (minX * sw) / 1000
		x2 := (maxX * sw) / 1000
		// Invert Y for camera ISAPI coordinate system (0 is bottom, sh is top)
		camYBottom := ((1000 - maxY) * sh) / 1000
		camYTop := ((1000 - minY) * sh) / 1000
		if camYBottom < 0 {
			camYBottom = 0
		}
		if camYTop > sh {
			camYTop = sh
		}
		if camYBottom >= camYTop {
			camYBottom = camYTop - 1
			if camYBottom < 0 {
				camYBottom = 0
				camYTop = 1
			}
		}

		regionsXML.WriteString(fmt.Sprintf(`
<PrivacyMaskRegion version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
<id>%d</id>
<enabled>%t</enabled>
<RegionCoordinatesList>
<RegionCoordinates><positionX>%d</positionX><positionY>%d</positionY></RegionCoordinates>
<RegionCoordinates><positionX>%d</positionX><positionY>%d</positionY></RegionCoordinates>
<RegionCoordinates><positionX>%d</positionX><positionY>%d</positionY></RegionCoordinates>
<RegionCoordinates><positionX>%d</positionX><positionY>%d</positionY></RegionCoordinates>
</RegionCoordinatesList>
</PrivacyMaskRegion>`, regID, r.Enabled, x1, camYBottom, x2, camYBottom, x2, camYTop, x1, camYTop))
	}

	payload := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<PrivacyMask version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
<enabled>%t</enabled>
<normalizedScreenSize>
<normalizedScreenWidth>%d</normalizedScreenWidth>
<normalizedScreenHeight>%d</normalizedScreenHeight>
</normalizedScreenSize>
<PrivacyMaskRegionList size="4">%s
</PrivacyMaskRegionList>
</PrivacyMask>`, mask.Enabled, sw, sh, regionsXML.String())

	var lastErr error
	for _, path := range paths {
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
	return lastErr
}
