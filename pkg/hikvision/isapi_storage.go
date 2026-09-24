package hikvision

import (
	"fmt"
	"net/http"
	"regexp"
	"strings"
)

func isStorageNAS(item HddInfo) bool {
	t := strings.ToUpper(item.Type)
	return strings.Contains(t, "NAS") ||
		strings.Contains(t, "NFS") ||
		strings.Contains(t, "SMB") ||
		strings.Contains(t, "CIFS") ||
		item.HostName != "" ||
		item.Path != "" ||
		strings.HasPrefix(strings.ToLower(item.Name), "nas")
}

func matchStorageItems(a, b HddInfo) bool {
	nasA := isStorageNAS(a)
	nasB := isStorageNAS(b)

	// A local SD/HDD should never match a network NAS
	if nasA != nasB {
		return false
	}

	cleanA := strings.ToLower(strings.ReplaceAll(strings.ReplaceAll(strings.ReplaceAll(a.Name, " ", ""), "-", ""), "_", ""))
	cleanB := strings.ToLower(strings.ReplaceAll(strings.ReplaceAll(strings.ReplaceAll(b.Name, " ", ""), "-", ""), "_", ""))

	// If clean names match (e.g. "nas1" == "nas1" or "sd1" == "sd1")
	if cleanA != "" && cleanA == cleanB {
		return true
	}

	// For NAS items, check if one's ID matches the other's name (e.g. HDD "nas1" with NAS server ID 1)
	if nasA && nasB {
		if a.ID > 0 && cleanB == fmt.Sprintf("nas%d", a.ID) {
			return true
		}
		if b.ID > 0 && cleanA == fmt.Sprintf("nas%d", b.ID) {
			return true
		}
		if a.HostName != "" && b.HostName != "" && strings.EqualFold(a.HostName, b.HostName) &&
			a.Path != "" && b.Path != "" && strings.EqualFold(a.Path, b.Path) {
			return true
		}
	}

	// For non-NAS items with the same ID
	if !nasA && !nasB && a.ID == b.ID && a.ID > 0 {
		return true
	}

	return false
}

// GetStorageInfo queries SD card, HDD, and network NAS storage volumes.
func (c *CameraClient) GetStorageInfo(ip, username, password string) ([]HddInfo, error) {
	endpoints := []string{
		"/ISAPI/ContentMgmt/Storage",
		"/ISAPI/ContentMgmt/Storage/hdd",
		"/ISAPI/ContentMgmt/Storage/nas",
		"/ISAPI/ContentMgmt/nasServers",
		"/ISAPI/ContentMgmt/Storage/nasServers",
		"/ISAPI/System/Storage/nas",
		"/ISAPI/System/Network/nas",
		"/ISAPI/ContentMgmt/Storage/volumes",
		"/ISAPI/ContentMgmt/Storage/volumeList",
	}

	var allItems []HddInfo
	visited := make(map[string]bool)

	for _, ep := range endpoints {
		data, code, _, err := c.DoRequest(ip, username, password, "GET", ep, nil, "")
		if err != nil || (code != http.StatusOK && code != http.StatusAccepted) {
			continue
		}
		strData := string(data)
		if len(strData) < 10 {
			continue
		}

		parsed := parseStorageXML(strData)
		for _, item := range parsed {
			// Create a deduplication key based on ID, Name, HostName, and Path
			key := fmt.Sprintf("%d:%s:%s:%s", item.ID, strings.ToLower(item.Name), strings.ToLower(item.HostName), strings.ToLower(item.Path))
			if visited[key] {
				continue
			}

			// Check if we can merge into an existing item that lacks host/path
			merged := false
			for i := range allItems {
				if matchStorageItems(allItems[i], item) {
					if allItems[i].HostName == "" && item.HostName != "" {
						allItems[i].HostName = item.HostName
					}
					if allItems[i].Path == "" && item.Path != "" {
						allItems[i].Path = item.Path
					}
					if allItems[i].Property == "" && item.Property != "" {
						allItems[i].Property = item.Property
					}
					if allItems[i].CapacityMB == 0 && item.CapacityMB > 0 {
						allItems[i].CapacityMB = item.CapacityMB
						allItems[i].FreeSpaceMB = item.FreeSpaceMB
					}
					if item.Type != "" && item.Type != "SD/HDD" && item.Type != "Storage Drive" {
						if strings.Contains(strings.ToUpper(item.Type), "SMB") || strings.Contains(strings.ToUpper(item.Type), "CIFS") {
							allItems[i].Type = item.Type
						} else if allItems[i].Type == "" || allItems[i].Type == "HD" || allItems[i].Type == "SD/HDD" {
							allItems[i].Type = item.Type
						}
					}
					visited[key] = true
					merged = true
					break
				}
			}

			if !merged {
				visited[key] = true
				allItems = append(allItems, item)
			}
		}
	}

	// Check if any drive is currently in formatting state via formatStatus
	for i := range allItems {
		if strings.EqualFold(allItems[i].Status, "formating") {
			allItems[i].Status = "formatting"
		} else if !strings.EqualFold(allItems[i].Status, "formatting") {
			if c.IsStorageFormatting(ip, username, password, allItems[i].ID) {
				allItems[i].Status = "formatting"
			}
		}
	}

	return allItems, nil
}

// IsStorageFormatting queries whether a specific storage ID is currently formatting.
func (c *CameraClient) IsStorageFormatting(ip, username, password string, hddID int) bool {
	checkPaths := []string{
		fmt.Sprintf("/ISAPI/ContentMgmt/Storage/nas/%d/formatStatus", hddID),
		fmt.Sprintf("/ISAPI/ContentMgmt/Storage/hdd/%d/formatStatus", hddID),
	}
	for _, p := range checkPaths {
		data, code, _, err := c.DoRequest(ip, username, password, "GET", p, nil, "")
		if err == nil && code == http.StatusOK {
			str := strings.ToLower(string(data))
			if strings.Contains(str, "<formating>true</formating>") || strings.Contains(str, "<formatting>true</formatting>") {
				return true
			}
		}
	}
	return false
}

// FormatStorage triggers formatting on the specified SD card, HDD, or NAS ID.
func (c *CameraClient) FormatStorage(ip, username, password string, hddID int) error {
	// 1. If already formatting, consider it successfully initiated without throwing an error
	if c.IsStorageFormatting(ip, username, password, hddID) {
		return nil
	}

	// 2. Identify whether hddID is NAS or HDD to target the proper endpoint
	items, _ := c.GetStorageInfo(ip, username, password)
	isNAS := false
	for _, item := range items {
		if item.ID == hddID && isStorageNAS(item) {
			isNAS = true
			break
		}
	}

	var paths []string
	if isNAS {
		paths = []string{
			fmt.Sprintf("/ISAPI/ContentMgmt/Storage/nas/%d/format", hddID),
			fmt.Sprintf("/ISAPI/ContentMgmt/Storage/hdd/%d/format", hddID),
		}
	} else {
		paths = []string{
			fmt.Sprintf("/ISAPI/ContentMgmt/Storage/hdd/%d/format", hddID),
			fmt.Sprintf("/ISAPI/ContentMgmt/Storage/nas/%d/format", hddID),
		}
	}

	var lastErr error
	for _, path := range paths {
		data, code, _, err := c.DoRequest(ip, username, password, "PUT", path, nil, "")
		if err == nil && (code == http.StatusOK || code == http.StatusAccepted || code == http.StatusNoContent) {
			return nil
		}
		// If camera returns non-200 (like 403), check if format has actually started!
		if c.IsStorageFormatting(ip, username, password, hddID) {
			return nil
		}
		if err != nil {
			lastErr = err
		} else if code != http.StatusNotFound {
			lastErr = fmt.Errorf("format storage failed with status %d (resp: %s)", code, string(data))
		}
	}

	if lastErr == nil {
		lastErr = fmt.Errorf("format storage failed for volume %d", hddID)
	}
	return lastErr
}

var dayNames = []string{"Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"}

func dayNameToNumber(name string) int {
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "monday", "mon":
		return 1
	case "tuesday", "tue":
		return 2
	case "wednesday", "wed":
		return 3
	case "thursday", "thu":
		return 4
	case "friday", "fri":
		return 5
	case "saturday", "sat":
		return 6
	case "sunday", "sun":
		return 7
	}
	return 1
}

func dayNumberToName(d int) string {
	if d >= 1 && d <= 7 {
		return dayNames[d-1]
	}
	return "Monday"
}

// GetRecordSchedule queries recording track schedule (Track 1 for video, Track 103 for capture).
func (c *CameraClient) GetRecordSchedule(ip, username, password string, trackID int) (*RecordSchedule, error) {
	if trackID <= 0 {
		trackID = 1
	}
	path := fmt.Sprintf("/ISAPI/ContentMgmt/record/tracks/%d", trackID)
	data, code, _, err := c.DoRequest(ip, username, password, "GET", path, nil, "")
	if err != nil || code != http.StatusOK {
		return nil, fmt.Errorf("get record schedule failed with status %d: %v", code, err)
	}

	xmlStr := string(data)
	enabled := extractXMLTag(xmlStr, "Enable") == "true"
	enableSched := extractXMLTag(xmlStr, "enableSchedule") == "true"
	preRec := parseXMLIntAny(xmlStr, 5, "PreRecordTimeSeconds")
	postRec := parseXMLIntAny(xmlStr, 5, "PostRecordTimeSeconds")

	dayMap := make(map[int][]RecordTimeRange)
	reAction := regexp.MustCompile(`(?s)<ScheduleAction>.*?</ScheduleAction>`)
	reStartDay := regexp.MustCompile(`(?s)<ScheduleActionStartTime>.*?<DayOfWeek>([^<]+)</DayOfWeek>.*?<TimeOfDay>([^<]+)</TimeOfDay>`)
	reEndTime := regexp.MustCompile(`(?s)<ScheduleActionEndTime>.*?<TimeOfDay>([^<]+)</TimeOfDay>`)
	reMode := regexp.MustCompile(`<ActionRecordingMode>([^<]+)</ActionRecordingMode>`)

	actions := reAction.FindAllString(xmlStr, -1)
	for _, act := range actions {
		startMatch := reStartDay.FindStringSubmatch(act)
		endMatch := reEndTime.FindStringSubmatch(act)
		modeMatch := reMode.FindStringSubmatch(act)

		if len(startMatch) >= 3 && len(endMatch) >= 2 {
			dNum := dayNameToNumber(startMatch[1])
			sTime := strings.TrimSpace(startMatch[2])
			eTime := strings.TrimSpace(endMatch[1])
			mode := "CMR"
			if len(modeMatch) >= 2 {
				mode = strings.TrimSpace(modeMatch[1])
			}
			dayMap[dNum] = append(dayMap[dNum], RecordTimeRange{
				BeginTime:  sTime,
				EndTime:    eTime,
				RecordMode: mode,
			})
		}
	}

	days := make([]RecordScheduleDay, 0, 7)
	for d := 1; d <= 7; d++ {
		ranges := dayMap[d]
		if ranges == nil {
			ranges = []RecordTimeRange{}
		}
		days = append(days, RecordScheduleDay{
			DayOfWeek:  d,
			TimeRanges: ranges,
		})
	}

	return &RecordSchedule{
		TrackID:               trackID,
		Enabled:               enabled,
		EnableSchedule:        enableSched,
		PreRecordTimeSeconds:  preRec,
		PostRecordTimeSeconds: postRec,
		Days:                  days,
		SupportedRecordModes:  c.getRecordModes(ip, username, password, trackID),
	}, nil
}

// getRecordModes queries the track capabilities endpoint for supported ActionRecordingMode values.
// Falls back to ["CMR", "AllEvent"] if the capabilities endpoint is unavailable.
func (c *CameraClient) getRecordModes(ip, username, password string, trackID int) []string {
	path := fmt.Sprintf("/ISAPI/ContentMgmt/record/tracks/%d/capabilities", trackID)
	data, code, _, err := c.DoRequest(ip, username, password, "GET", path, nil, "")
	if err != nil || code != http.StatusOK {
		return []string{"CMR", "AllEvent"}
	}

	xmlStr := string(data)
	// Extract all options from opt="..." on any tag containing RecordingMode (e.g., DefaultRecordingMode, ActionRecordingMode)
	reOpt := regexp.MustCompile(`[a-zA-Z0-9:]*RecordingMode[^>]*\bopt="([^"]+)"`)
	optMatches := reOpt.FindAllStringSubmatch(xmlStr, -1)
	seen := make(map[string]bool)
	var modes []string
	for _, m := range optMatches {
		if len(m) >= 2 {
			parts := strings.Split(m[1], ",")
			for _, p := range parts {
				p = strings.TrimSpace(p)
				if p != "" && !seen[p] {
					seen[p] = true
					modes = append(modes, p)
				}
			}
		}
	}
	if len(modes) > 0 {
		return modes
	}

	// Fallback: look for individual <ActionRecordingMode> or <DefaultRecordingMode> values already listed
	reModes := regexp.MustCompile(`<[a-zA-Z0-9:]*RecordingMode>([^<]+)</[a-zA-Z0-9:]*RecordingMode>`)
	matches := reModes.FindAllStringSubmatch(xmlStr, -1)
	for _, m := range matches {
		mode := strings.TrimSpace(m[1])
		if mode != "" && !seen[mode] {
			seen[mode] = true
			modes = append(modes, mode)
		}
	}
	if len(modes) > 0 {
		return modes
	}

	return []string{"CMR", "AllEvent"}
}

// SetRecordSchedule updates recording track schedule while preserving camera metadata.
func (c *CameraClient) SetRecordSchedule(ip, username, password string, trackID int, rs RecordSchedule) error {
	if trackID <= 0 {
		trackID = 1
	}
	path := fmt.Sprintf("/ISAPI/ContentMgmt/record/tracks/%d", trackID)
	data, code, _, err := c.DoRequest(ip, username, password, "GET", path, nil, "")
	if err != nil || code != http.StatusOK {
		return fmt.Errorf("failed to fetch existing track config before updating: status %d (%v)", code, err)
	}

	xmlStr := string(data)

	// Replace <Enable>
	reEnable := regexp.MustCompile(`<Enable>[^<]+</Enable>`)
	xmlStr = reEnable.ReplaceAllString(xmlStr, fmt.Sprintf("<Enable>%t</Enable>", rs.Enabled))

	// Replace or inject <enableSchedule>
	if strings.Contains(xmlStr, "<enableSchedule>") {
		reSched := regexp.MustCompile(`<enableSchedule>[^<]+</enableSchedule>`)
		xmlStr = reSched.ReplaceAllString(xmlStr, fmt.Sprintf("<enableSchedule>%t</enableSchedule>", rs.EnableSchedule))
	} else if strings.Contains(xmlStr, "<CustomExtension>") {
		xmlStr = strings.Replace(xmlStr, "<CustomExtension>", fmt.Sprintf("<CustomExtension>\n<enableSchedule>%t</enableSchedule>", rs.EnableSchedule), 1)
	}

	// Replace PreRecordTimeSeconds
	if strings.Contains(xmlStr, "<PreRecordTimeSeconds>") {
		rePre := regexp.MustCompile(`<PreRecordTimeSeconds>[^<]+</PreRecordTimeSeconds>`)
		xmlStr = rePre.ReplaceAllString(xmlStr, fmt.Sprintf("<PreRecordTimeSeconds>%d</PreRecordTimeSeconds>", rs.PreRecordTimeSeconds))
	}

	// Replace PostRecordTimeSeconds
	if strings.Contains(xmlStr, "<PostRecordTimeSeconds>") {
		rePost := regexp.MustCompile(`<PostRecordTimeSeconds>[^<]+</PostRecordTimeSeconds>`)
		xmlStr = rePost.ReplaceAllString(xmlStr, fmt.Sprintf("<PostRecordTimeSeconds>%d</PostRecordTimeSeconds>", rs.PostRecordTimeSeconds))
	}

	// If Days provided, rebuild <TrackSchedule>
	if len(rs.Days) > 0 {
		var actionBuilder strings.Builder
		actionBuilder.WriteString(`<TrackSchedule>
<ScheduleBlockList>
<ScheduleBlock ScheduleActionSize="8">
<ScheduleBlockGUID>{00000000-0000-0000-0000-000000000000}</ScheduleBlockGUID>
<ScheduleBlockType>www.hikvision.com/racm/schedule/ver10</ScheduleBlockType>
`)
		actID := 1
		for _, d := range rs.Days {
			if d.DayOfWeek < 1 || d.DayOfWeek > 7 {
				continue
			}
			dayName := dayNumberToName(d.DayOfWeek)
			for _, tr := range d.TimeRanges {
				bTime := strings.TrimSpace(tr.BeginTime)
				if bTime == "" {
					bTime = "00:00:00"
				} else if len(bTime) == 5 {
					bTime = bTime + ":00"
				}
				eTime := strings.TrimSpace(tr.EndTime)
				if eTime == "" {
					eTime = "24:00:00"
				} else if len(eTime) == 5 {
					eTime = eTime + ":00"
				}
				mode := tr.RecordMode
				if mode == "" {
					if trackID == 103 {
						mode = "CMR"
					} else {
						mode = "AllEvent"
					}
				}
				actionBuilder.WriteString(fmt.Sprintf(`<ScheduleAction>
<id>%d</id>
<ScheduleActionStartTime>
<DayOfWeek>%s</DayOfWeek>
<TimeOfDay>%s</TimeOfDay>
</ScheduleActionStartTime>
<ScheduleActionEndTime>
<DayOfWeek>%s</DayOfWeek>
<TimeOfDay>%s</TimeOfDay>
</ScheduleActionEndTime>
<ScheduleDSTEnable>false</ScheduleDSTEnable>
<Description>nothing</Description>
<Actions>
<Record>true</Record>
<ActionRecordingMode>%s</ActionRecordingMode>
</Actions>
</ScheduleAction>
`, actID, dayName, bTime, dayName, eTime, mode))
				actID++
			}
		}
		actionBuilder.WriteString(`</ScheduleBlock>
</ScheduleBlockList>
</TrackSchedule>`)

		reTrackSchedule := regexp.MustCompile(`(?s)<TrackSchedule>.*?</TrackSchedule>`)
		if reTrackSchedule.MatchString(xmlStr) {
			xmlStr = reTrackSchedule.ReplaceAllString(xmlStr, actionBuilder.String())
		}
	}

	dataPut, codePut, _, errPut := c.DoRequest(ip, username, password, "PUT", path, []byte(xmlStr), "application/xml")
	if errPut != nil {
		return errPut
	}
	if codePut != http.StatusOK && codePut != http.StatusAccepted && codePut != http.StatusNoContent {
		return fmt.Errorf("failed to set record schedule: status %d (resp: %s)", codePut, string(dataPut))
	}
	return nil
}

// GetStorageQuota queries storage disk quota ratio and volume distribution between video and picture.
func (c *CameraClient) GetStorageQuota(ip, username, password string) (*StorageQuota, error) {
	endpoints := []string{
		"/ISAPI/ContentMgmt/Storage/quota/1",
		"/ISAPI/ContentMgmt/Storage/quota",
	}

	var data []byte
	var code int
	var err error
	for _, ep := range endpoints {
		data, code, _, err = c.DoRequest(ip, username, password, "GET", ep, nil, "")
		if err == nil && (code == http.StatusOK || code == http.StatusAccepted) {
			break
		}
	}

	if code != http.StatusOK && code != http.StatusAccepted {
		return nil, fmt.Errorf("failed to get storage quota: status %d (err: %v)", code, err)
	}

	xmlStr := string(data)
	quota := &StorageQuota{
		ID:                 parseXMLIntAny(xmlStr, 1, "id"),
		Type:               extractXMLTagAny(xmlStr, "type"),
		VideoQuotaRatio:    parseXMLIntAny(xmlStr, 80, "videoQuotaRatio"),
		PictureQuotaRatio:  parseXMLIntAny(xmlStr, 20, "pictureQuotaRatio"),
		TotalVideoVolumeMB: parseXMLInt64Any(xmlStr, 0, "totalVideoVolume"),
		TotalPicVolumeMB:   parseXMLInt64Any(xmlStr, 0, "totalPictureVolume"),
		FreeVideoQuotaMB:   parseXMLInt64Any(xmlStr, 0, "freeVideoQuota"),
		FreePicQuotaMB:     parseXMLInt64Any(xmlStr, 0, "freePictureQuota"),
	}

	if quota.Type == "" {
		quota.Type = "ratio"
	}
	if quota.VideoQuotaRatio+quota.PictureQuotaRatio != 100 {
		if quota.VideoQuotaRatio > 0 && quota.VideoQuotaRatio <= 100 {
			quota.PictureQuotaRatio = 100 - quota.VideoQuotaRatio
		} else if quota.PictureQuotaRatio > 0 && quota.PictureQuotaRatio <= 100 {
			quota.VideoQuotaRatio = 100 - quota.PictureQuotaRatio
		} else {
			quota.VideoQuotaRatio = 80
			quota.PictureQuotaRatio = 20
		}
	}

	return quota, nil
}

// SetStorageQuota sets the percentage split between video recordings and picture snapshots.
func (c *CameraClient) SetStorageQuota(ip, username, password string, videoRatio, pictureRatio int) error {
	if videoRatio < 0 {
		videoRatio = 0
	} else if videoRatio > 100 {
		videoRatio = 100
	}
	pictureRatio = 100 - videoRatio

	payload := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<diskQuota version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
<id>1</id>
<type>ratio</type>
<videoQuotaRatio>%d</videoQuotaRatio>
<pictureQuotaRatio>%d</pictureQuotaRatio>
</diskQuota>`, videoRatio, pictureRatio)

	endpoints := []string{
		"/ISAPI/ContentMgmt/Storage/quota/1",
		"/ISAPI/ContentMgmt/Storage/quota",
	}

	var lastErr error
	for _, ep := range endpoints {
		data, code, _, err := c.DoRequest(ip, username, password, "PUT", ep, []byte(payload), "application/xml")
		if err == nil && (code == http.StatusOK || code == http.StatusAccepted || code == http.StatusNoContent) {
			return nil
		}
		if err != nil {
			lastErr = err
		} else if code != http.StatusNotFound {
			lastErr = fmt.Errorf("failed to set storage quota: status %d (resp: %s)", code, string(data))
		}
	}

	if lastErr != nil {
		return lastErr
	}
	return fmt.Errorf("failed to set storage quota")
}

