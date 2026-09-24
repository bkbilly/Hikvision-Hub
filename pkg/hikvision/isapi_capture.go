package hikvision

import (
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"
)

func parseRes(res string) (int, int) {
	parts := strings.Split(strings.ToLower(strings.TrimSpace(res)), "x")
	if len(parts) == 2 {
		w, _ := strconv.Atoi(parts[0])
		h, _ := strconv.Atoi(parts[1])
		return w, h
	}
	return 0, 0
}

// GetCaptureSettings queries snapshot timing, event capture, and capture schedule.
func (c *CameraClient) GetCaptureSettings(ip, username, password string, channelID int) (*CaptureSettings, error) {
	if channelID <= 0 {
		channelID = 1
	}
	path := fmt.Sprintf("/ISAPI/Snapshot/channels/%d", channelID)
	data, code, _, err := c.DoRequest(ip, username, password, "GET", path, nil, "")
	if err != nil || code != http.StatusOK {
		return nil, fmt.Errorf("get capture settings failed with status %d: %v", code, err)
	}

	xmlStr := string(data)

	// Extract timingCapture block
	timingBlock := ""
	reTiming := regexp.MustCompile(`(?s)<timingCapture>.*?</timingCapture>`)
	if m := reTiming.FindString(xmlStr); m != "" {
		timingBlock = m
	}

	// Extract eventCapture block
	eventBlock := ""
	reEvent := regexp.MustCompile(`(?s)<eventCapture>.*?</eventCapture>`)
	if m := reEvent.FindString(xmlStr); m != "" {
		eventBlock = m
	}

	timingEnabled := extractXMLTag(timingBlock, "enabled") == "true"
	timingW := parseXMLIntAny(timingBlock, 0, "pictureWidth")
	timingH := parseXMLIntAny(timingBlock, 0, "pictureHeight")
	timingRes := ""
	if timingW > 0 && timingH > 0 {
		timingRes = fmt.Sprintf("%dx%d", timingW, timingH)
	}
	timingQual := parseXMLIntAny(timingBlock, 80, "quality")
	timingInterval := parseXMLIntAny(timingBlock, 5000, "captureInterval")

	eventEnabled := extractXMLTag(eventBlock, "enabled") == "true"
	eventW := parseXMLIntAny(eventBlock, 0, "pictureWidth")
	eventH := parseXMLIntAny(eventBlock, 0, "pictureHeight")
	eventRes := ""
	if eventW > 0 && eventH > 0 {
		eventRes = fmt.Sprintf("%dx%d", eventW, eventH)
	}
	eventQual := parseXMLIntAny(eventBlock, 80, "quality")
	eventInterval := parseXMLIntAny(eventBlock, 1000, "captureInterval")
	eventCount := parseXMLIntAny(eventBlock, 4, "captureNumber")

	settings := &CaptureSettings{
		ChannelID: channelID,
		TimingCapture: TimingCaptureConfig{
			Enabled:    timingEnabled,
			Resolution: timingRes,
			Quality:    timingQual,
			IntervalMs: timingInterval,
		},
		EventCapture: EventCaptureConfig{
			Enabled:      eventEnabled,
			Resolution:   eventRes,
			Quality:      eventQual,
			IntervalMs:   eventInterval,
			CaptureCount: eventCount,
		},
	}

	// Try querying track 103 for capture schedule
	if sched, err := c.GetRecordSchedule(ip, username, password, 103); err == nil && sched != nil {
		settings.Schedule = sched
	}

	return settings, nil
}

// SetCaptureSettings updates snapshot timing and event capture settings and capture schedule.
func (c *CameraClient) SetCaptureSettings(ip, username, password string, channelID int, cs CaptureSettings) error {
	if channelID <= 0 {
		channelID = 1
	}

	// Update schedule if provided (Track 103 for snapshot schedule)
	if cs.Schedule != nil {
		sched := *cs.Schedule
		sched.Enabled = true
		sched.EnableSchedule = true
		if err := c.SetRecordSchedule(ip, username, password, 103, sched); err != nil {
			log.Printf("[WARN] Failed to set track 103 capture schedule on %s: %v", ip, err)
		}
	}

	// Fetch existing snapshot configuration to preserve resolution if not explicitly set
	path := fmt.Sprintf("/ISAPI/Snapshot/channels/%d", channelID)
	data, code, _, err := c.DoRequest(ip, username, password, "GET", path, nil, "")
	origXML := ""
	if err == nil && code == http.StatusOK {
		origXML = string(data)
	}

	tW, tH := parseRes(cs.TimingCapture.Resolution)
	if tW == 0 || tH == 0 {
		tW = parseXMLIntAny(origXML, 1920, "pictureWidth")
		tH = parseXMLIntAny(origXML, 1080, "pictureHeight")
	}

	eW, eH := parseRes(cs.EventCapture.Resolution)
	if eW == 0 || eH == 0 {
		eW = tW
		eH = tH
	}

	tQual := cs.TimingCapture.Quality
	if tQual <= 0 {
		tQual = 80
	}
	tInt := cs.TimingCapture.IntervalMs
	if tInt <= 0 {
		tInt = 5000
	}

	eQual := cs.EventCapture.Quality
	if eQual <= 0 {
		eQual = 80
	}
	eInt := cs.EventCapture.IntervalMs
	if eInt <= 0 {
		eInt = 1000
	}
	eCount := cs.EventCapture.CaptureCount
	if eCount <= 0 {
		eCount = 4
	}

	payload := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<SnapshotChannel version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <id>%d</id>
  <videoInputChannelID>%d</videoInputChannelID>
  <timingCapture>
    <enabled>%t</enabled>
    <supportSchedule>true</supportSchedule>
    <compress>
      <pictureCodecType>JPEG</pictureCodecType>
      <pictureWidth>%d</pictureWidth>
      <pictureHeight>%d</pictureHeight>
      <quality>%d</quality>
      <captureInterval>%d</captureInterval>
      <captureNumber>0</captureNumber>
    </compress>
  </timingCapture>
  <eventCapture>
    <enabled>%t</enabled>
    <supportSchedule>false</supportSchedule>
    <compress>
      <pictureCodecType>JPEG</pictureCodecType>
      <pictureWidth>%d</pictureWidth>
      <pictureHeight>%d</pictureHeight>
      <quality>%d</quality>
      <captureInterval>%d</captureInterval>
      <captureNumber>%d</captureNumber>
    </compress>
  </eventCapture>
</SnapshotChannel>`, channelID, channelID, cs.TimingCapture.Enabled, tW, tH, tQual, tInt, cs.EventCapture.Enabled, eW, eH, eQual, eInt, eCount)

	dataPut, codePut, _, errPut := c.DoRequest(ip, username, password, "PUT", path, []byte(payload), "application/xml")
	if errPut != nil {
		return errPut
	}
	if codePut != http.StatusOK && codePut != http.StatusAccepted && codePut != http.StatusNoContent {
		return fmt.Errorf("failed to set capture settings: status %d (resp: %s)", codePut, string(dataPut))
	}

	return nil
}
