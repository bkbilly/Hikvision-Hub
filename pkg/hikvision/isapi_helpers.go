package hikvision

import (
	"encoding/xml"
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// ProxyISAPI allows raw pass-through ISAPI requests to the camera.
func (c *CameraClient) ProxyISAPI(ip, username, password, method, path string, body []byte, contentType string) ([]byte, string, int, error) {
	if !strings.HasPrefix(path, "/ISAPI") && !strings.HasPrefix(path, "ISAPI") && !strings.HasPrefix(path, "/Streaming") {
		if !strings.HasPrefix(path, "/") {
			path = "/ISAPI/" + path
		} else {
			path = "/ISAPI" + path
		}
	}
	data, statusCode, respContentType, err := c.DoRequest(ip, username, password, method, path, body, contentType)
	return data, respContentType, statusCode, err
}

// ==========================================
// Helper functions
// ==========================================

func extractXMLTag(xmlContent, tag string) string {
	re := regexp.MustCompile(fmt.Sprintf(`(?is)<%s\b[^>]*>(.*?)</%s>`, tag, tag))
	match := re.FindStringSubmatch(xmlContent)
	if len(match) > 1 {
		return strings.TrimSpace(match[1])
	}
	return ""
}

func extractXMLTagAny(xmlContent string, tags ...string) string {
	for _, tag := range tags {
		val := extractXMLTag(xmlContent, tag)
		if val != "" {
			return val
		}
	}
	return ""
}

func parseXMLIntAny(xmlContent string, fallback int, tags ...string) int {
	for _, tag := range tags {
		valStr := extractXMLTag(xmlContent, tag)
		if valStr != "" {
			if val, err := strconv.Atoi(valStr); err == nil {
				return val
			}
		}
	}
	return fallback
}

func parseXMLInt64Any(xmlContent string, fallback int64, tags ...string) int64 {
	for _, tag := range tags {
		valStr := extractXMLTag(xmlContent, tag)
		if valStr != "" {
			if val, err := strconv.ParseInt(valStr, 10, 64); err == nil {
				return val
			}
		}
	}
	return fallback
}

func normalizeStorageMB(raw int64) int64 {
	if raw <= 0 {
		return 0
	}
	// If > 100 Billion, likely in Bytes (e.g. 2 TB = 2*10^12 bytes)
	if raw > 100_000_000_000 {
		return raw / (1024 * 1024)
	}
	// If > 100 Million, likely in KB (e.g. 2 TB = 2*10^9 KB)
	if raw > 100_000_000 {
		return raw / 1024
	}
	return raw
}

func parseStorageXML(xmlContent string) []HddInfo {
	var items []HddInfo
	// Match Hdd, nasServer, nas, storageVolume, volume
	re := regexp.MustCompile(`(?is)<(Hdd|hdd|nasServer|NasServer|nas|Nas|storageVolume|StorageVolume|volume|Volume)\b[^>]*>(.*?)</(?:Hdd|hdd|nasServer|NasServer|nas|Nas|storageVolume|StorageVolume|volume|Volume)>`)
	matches := re.FindAllStringSubmatch(xmlContent, -1)

	for _, m := range matches {
		tagName := strings.ToLower(m[1])
		block := m[2]
		id := parseXMLIntAny(block, 0, "id", "hddId", "volumeId", "nasId", "serverID")
		name := extractXMLTagAny(block, "hddName", "name", "volumeName", "nasName", "serverName")

		// In Hikvision XML, <mountType> (e.g. "SMB/CIFS", "NFS") defines the active network protocol.
		// A legacy <nasType>NFS</nasType> is often present even when configured as SMB/CIFS,
		// so mountType must take precedence.
		mountType := extractXMLTagAny(block, "mountType", "MountType")
		var typ string
		if mountType != "" {
			typ = mountType
		} else {
			typ = extractXMLTagAny(block, "hddType", "nasType", "type", "volumeType", "protocol")
		}
		if strings.Contains(strings.ToUpper(typ), "SMB") || strings.Contains(strings.ToUpper(typ), "CIFS") {
			typ = "SMB/CIFS"
		} else if strings.EqualFold(typ, "NFS") {
			typ = "NFS"
		}
		status := extractXMLTagAny(block, "status", "hddStatus", "nasStatus", "volumeStatus", "state")
		prop := extractXMLTagAny(block, "property", "hddProperty")
		host := extractXMLTagAny(block, "hostName", "ipAddress", "ipv6Address", "serverAddress", "address")
		path := extractXMLTagAny(block, "nasPath", "path", "dirPath", "directory")
		rawCap := parseXMLInt64Any(block, 0, "capacity", "capacityMB", "totalCapacity", "size", "capacityByte")
		rawFree := parseXMLInt64Any(block, 0, "freeSpace", "freeSpaceMB", "availableSpace", "freeCapacity", "freeSpaceByte")

		capMB := normalizeStorageMB(rawCap)
		freeMB := normalizeStorageMB(rawFree)

		// Determine if this is a NAS volume
		isNAS := strings.Contains(tagName, "nas") ||
			strings.Contains(strings.ToUpper(typ), "NAS") ||
			strings.Contains(strings.ToUpper(typ), "NFS") ||
			strings.Contains(strings.ToUpper(typ), "SMB") ||
			strings.Contains(strings.ToUpper(typ), "CIFS") ||
			host != "" || path != ""

		if typ == "" {
			if isNAS {
				typ = "NAS"
			} else {
				typ = "SD/HDD"
			}
		}

		if name == "" {
			if isNAS {
				if id > 0 {
					name = fmt.Sprintf("NAS %d", id)
				} else {
					name = "NAS Volume"
				}
			} else {
				if id > 0 {
					name = fmt.Sprintf("Drive %d", id)
				} else {
					name = "Storage Drive"
				}
			}
		}

		// Filter out unconfigured empty NAS placeholder slots
		if isNAS && host == "" && path == "" && capMB == 0 && (status == "" || strings.EqualFold(status, "offline") || strings.EqualFold(status, "no disk")) {
			continue
		}

		// Normalize status
		if strings.EqualFold(status, "formating") {
			status = "formatting"
		}
		if status == "" {
			if capMB > 0 {
				status = "normal"
			} else {
				status = "active"
			}
		}

		items = append(items, HddInfo{
			ID:          id,
			Name:        name,
			Type:        typ,
			Status:      status,
			CapacityMB:  capMB,
			FreeSpaceMB: freeMB,
			Property:    prop,
			HostName:    host,
			Path:        path,
		})
	}
	return items
}

func normalizeIRCutFilter(filter string) string {
	f := strings.ToLower(strings.TrimSpace(filter))
	if strings.Contains(f, "auto") {
		return "auto"
	}
	if strings.Contains(f, "day") {
		return "day"
	}
	if strings.Contains(f, "night") {
		return "night"
	}
	if strings.Contains(f, "schedule") {
		return "schedule"
	}
	return f
}

func normalizeDirection(dir string) string {
	d := strings.ToLower(strings.TrimSpace(dir))
	if strings.Contains(d, "right-left") || strings.Contains(d, "righttoleft") || strings.Contains(d, "right_to_left") || strings.Contains(d, "btoa") || strings.Contains(d, "b_to_a") || strings.Contains(d, "b->a") || strings.Contains(d, "b2a") || strings.HasPrefix(d, "right") {
		return "rightToLeft" // B -> A
	}
	if strings.Contains(d, "left-right") || strings.Contains(d, "lefttoright") || strings.Contains(d, "left_to_right") || strings.Contains(d, "atob") || strings.Contains(d, "a_to_b") || strings.Contains(d, "a->b") || strings.Contains(d, "a2b") || strings.HasPrefix(d, "left") {
		return "leftToRight" // A -> B
	}
	return "both" // A <-> B (any / both / all)
}

func extractCoordinates(xmlContent string) []Point {
	var points []Point

	screenWidth := parseXMLIntAny(xmlContent, 1000, "normalizedScreenWidth", "screenWidth")
	screenHeight := parseXMLIntAny(xmlContent, 1000, "normalizedScreenHeight", "screenHeight")
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
	for i := range points {
		points[i].Y = 1000 - points[i].Y
	}
	return points
}

func escapeXML(s string) string {
	var buf strings.Builder
	_ = xml.EscapeText(&buf, []byte(s))
	return buf.String()
}

func extractXMLOptRawList(xmlContent string, tagNames ...string) []string {
	for _, tag := range tagNames {
		re := regexp.MustCompile(fmt.Sprintf(`(?is)<%s\b[^>]*\bopt=["']([^"']+)["']`, regexp.QuoteMeta(tag)))
		if m := re.FindStringSubmatch(xmlContent); len(m) > 1 {
			raw := strings.TrimSpace(m[1])
			if raw == "" {
				continue
			}
			parts := strings.Split(raw, ",")
			var result []string
			for _, p := range parts {
				cleaned := strings.TrimSpace(p)
				cleaned = strings.ReplaceAll(cleaned, "*", "x")
				if cleaned != "" {
					result = append(result, cleaned)
				}
			}
			if len(result) > 0 {
				return result
			}
		}
	}
	return nil
}

func extractXMLOptList(xmlContent string, tagNames ...string) []string {
	for _, tag := range tagNames {
		re := regexp.MustCompile(fmt.Sprintf(`(?is)<%s\b[^>]*\bopt=["']([^"']+)["']`, regexp.QuoteMeta(tag)))
		if m := re.FindStringSubmatch(xmlContent); len(m) > 1 {
			raw := strings.TrimSpace(m[1])
			if raw == "" {
				continue
			}
			parts := strings.Split(raw, ",")
			var result []string
			seen := make(map[string]bool)
			for _, p := range parts {
				cleaned := strings.TrimSpace(p)
				cleaned = strings.ReplaceAll(cleaned, "*", "x")
				if cleaned != "" && !seen[cleaned] {
					seen[cleaned] = true
					result = append(result, cleaned)
				}
			}
			if len(result) > 0 {
				return result
			}
		}
	}
	return nil
}

func extractXMLOptIntList(xmlContent string, tagNames ...string) []int {
	rawList := extractXMLOptList(xmlContent, tagNames...)
	if len(rawList) == 0 {
		return nil
	}
	var result []int
	seen := make(map[int]bool)
	for _, item := range rawList {
		if strings.Contains(item, "/") {
			continue
		}
		val, err := strconv.Atoi(item)
		if err != nil || val <= 0 {
			continue
		}
		fps := val
		if fps >= 100 && fps%100 == 0 {
			fps = fps / 100
		} else if fps > 60 {
			fps = (fps + 50) / 100
		}
		if fps > 0 && !seen[fps] {
			seen[fps] = true
			result = append(result, fps)
		}
	}
	sort.Ints(result)
	return result
}

func parseStreamCapabilities(capXML string) (resolutions []string, fpsList []int, codecs []string, bitrateTypes []string, profiles []string) {
	if capXML == "" {
		return
	}

	resSeen := make(map[string]bool)
	addRes := func(r string) {
		r = strings.TrimSpace(strings.ReplaceAll(r, "*", "x"))
		r = strings.ToLower(r)
		if r == "" {
			return
		}
		re := regexp.MustCompile(`^(\d+)[xX](\d+)$`)
		m := re.FindStringSubmatch(r)
		if len(m) == 3 {
			w, _ := strconv.Atoi(m[1])
			h, _ := strconv.Atoi(m[2])
			if w > 0 && h > 0 {
				formatted := fmt.Sprintf("%dx%d", w, h)
				if !resSeen[formatted] {
					resSeen[formatted] = true
					resolutions = append(resolutions, formatted)
				}
			}
		}
	}

	// 1. Resolutions: check opt="..." or opt='...' attributes
	for _, optVal := range extractXMLOptList(capXML, "videoResolution", "SnapShotResolution", "resolution", "VideoResolution") {
		addRes(optVal)
	}

	// 2. Resolutions: check comma-separated inner text inside tags
	reCommaTags := regexp.MustCompile(`(?is)<(?:videoResolution|SnapShotResolution|resolution)\b[^>]*>([^<,]+(?:,[^<,]+)+)</(?:videoResolution|SnapShotResolution|resolution)>`)
	for _, m := range reCommaTags.FindAllStringSubmatch(capXML, -1) {
		for _, part := range strings.Split(m[1], ",") {
			addRes(part)
		}
	}

	// 3. Resolutions: check paired width/height opt attributes (preserving positional index)
	widths := extractXMLOptRawList(capXML, "videoResolutionWidth", "width")
	heights := extractXMLOptRawList(capXML, "videoResolutionHeight", "height")
	if len(widths) > 0 && len(widths) == len(heights) {
		for i := range widths {
			addRes(fmt.Sprintf("%sx%s", widths[i], heights[i]))
		}
	}

	// 4. Resolutions: check nested blocks (like <ResolutionAvailableDscriptor>, <ResolutionAvailableDescriptor>, <ResolutionDescriptor>, <videoResolution>, <Resolution>)
	reBlocks := regexp.MustCompile(`(?is)<(?:videoResolution|Resolution|VideoResolution|ResolutionAvailableDscriptor|ResolutionAvailableDescriptor|ResolutionDescriptor)\b[^>]*>(.*?)</(?:videoResolution|Resolution|VideoResolution|ResolutionAvailableDscriptor|ResolutionAvailableDescriptor|ResolutionDescriptor)>`)
	for _, m := range reBlocks.FindAllStringSubmatch(capXML, -1) {
		block := m[1]
		w := parseXMLIntAny(block, 0, "videoResolutionWidth", "width")
		h := parseXMLIntAny(block, 0, "videoResolutionHeight", "height")
		if w > 0 && h > 0 {
			addRes(fmt.Sprintf("%dx%d", w, h))
		} else if (strings.Contains(block, "x") || strings.Contains(block, "*")) && !strings.Contains(block, "<") {
			addRes(block)
		}
	}

	// 5. FPS: from opt attributes or comma-separated lists
	fpsList = extractXMLOptIntList(capXML, "maxFrameRate", "frameRate", "maxFPS", "FPS")
	if len(fpsList) == 0 {
		reFPSComma := regexp.MustCompile(`(?is)<(?:maxFrameRate|frameRate|maxFPS|FPS|supportedFrameRate)\b[^>]*>([^<,]+(?:,[^<,]+)+)</(?:maxFrameRate|frameRate|maxFPS|FPS|supportedFrameRate)>`)
		if m := reFPSComma.FindStringSubmatch(capXML); len(m) > 1 {
			rawParts := strings.Split(m[1], ",")
			fpsSeen := make(map[int]bool)
			for _, item := range rawParts {
				val, err := strconv.Atoi(strings.TrimSpace(item))
				if err == nil && val > 0 {
					fps := val
					if fps >= 100 && fps%100 == 0 {
						fps = fps / 100
					} else if fps > 60 {
						fps = (fps + 50) / 100
					}
					if fps > 0 && !fpsSeen[fps] {
						fpsSeen[fps] = true
						fpsList = append(fpsList, fps)
					}
				}
			}
			sort.Ints(fpsList)
		}
	}

	// 6. Codecs: from opt attributes or comma-separated lists
	codecs = extractXMLOptList(capXML, "videoCodecType", "videoCodec", "codec", "VideoCodecType")
	if len(codecs) == 0 {
		reCodecComma := regexp.MustCompile(`(?is)<(?:videoCodecType|videoCodec|codec|VideoCodecType)\b[^>]*>([^<,]+(?:,[^<,]+)+)</(?:videoCodecType|videoCodec|codec|VideoCodecType)>`)
		if m := reCodecComma.FindStringSubmatch(capXML); len(m) > 1 {
			for _, item := range strings.Split(m[1], ",") {
				c := strings.TrimSpace(item)
				if c != "" {
					codecs = append(codecs, c)
				}
			}
		}
	}

	// 7. Bitrate Types: from opt attributes or comma-separated lists
	bitrateTypes = extractXMLOptList(capXML, "videoQualityControlType", "bitrateType", "qualityControlType")
	if len(bitrateTypes) == 0 {
		reBitrateComma := regexp.MustCompile(`(?is)<(?:videoQualityControlType|bitrateType|qualityControlType)\b[^>]*>([^<,]+(?:,[^<,]+)+)</(?:videoQualityControlType|bitrateType|qualityControlType)>`)
		if m := reBitrateComma.FindStringSubmatch(capXML); len(m) > 1 {
			for _, item := range strings.Split(m[1], ",") {
				b := strings.TrimSpace(item)
				if b != "" {
					bitrateTypes = append(bitrateTypes, b)
				}
			}
		}
	}

	// 8. Profiles: from opt attributes or comma-separated lists
	profiles = extractXMLOptList(capXML, "H264Profile", "H265Profile", "profile", "Profile")
	if len(profiles) == 0 {
		reProfileComma := regexp.MustCompile(`(?is)<(?:H264Profile|H265Profile|profile|Profile)\b[^>]*>([^<,]+(?:,[^<,]+)+)</(?:H264Profile|H265Profile|profile|Profile)>`)
		if m := reProfileComma.FindStringSubmatch(capXML); len(m) > 1 {
			for _, item := range strings.Split(m[1], ",") {
				p := strings.TrimSpace(item)
				if p != "" {
					profiles = append(profiles, p)
				}
			}
		}
	}

	return resolutions, fpsList, codecs, bitrateTypes, profiles
}
