package hikvision

import (
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
)

type eventMeta struct {
	schedCategory string
	schedIDPrefix string
	triggerPrefix string
	eventXMLType  string
}

var eventMetaMap = map[string]eventMeta{
	"motion": {
		schedCategory: "motionDetections",
		schedIDPrefix: "VMD_video",
		triggerPrefix: "VMD-",
		eventXMLType:  "VMD",
	},
	"line": {
		schedCategory: "lineDetections",
		schedIDPrefix: "linedetection_video",
		triggerPrefix: "linedetection-",
		eventXMLType:  "linedetection",
	},
	"intrusion": {
		schedCategory: "fieldDetections",
		schedIDPrefix: "fielddetection_video",
		triggerPrefix: "fielddetection-",
		eventXMLType:  "fielddetection",
	},
	"tamper": {
		schedCategory: "tamperDetections",
		schedIDPrefix: "tamper_video",
		triggerPrefix: "tamper-",
		eventXMLType:  "tamper",
	},
	"face": {
		schedCategory: "faceDetections",
		schedIDPrefix: "facedetection_video",
		triggerPrefix: "facedetection-",
		eventXMLType:  "facedetection",
	},
	"scene": {
		schedCategory: "sceneChangeDetections",
		schedIDPrefix: "scenechangedetection_video",
		triggerPrefix: "scenechangedetection-",
		eventXMLType:  "scenechangedetection",
	},
	"unattended": {
		schedCategory: "unattendedBaggages",
		schedIDPrefix: "unattendedBaggage_video",
		triggerPrefix: "unattendedBaggage-",
		eventXMLType:  "unattendedBaggage",
	},
	"removal": {
		schedCategory: "attendedBaggages",
		schedIDPrefix: "attendedBaggage_video",
		triggerPrefix: "attendedBaggage-",
		eventXMLType:  "attendedBaggage",
	},
	"entrance": {
		schedCategory: "regionEntrances",
		schedIDPrefix: "regionEntrance_video",
		triggerPrefix: "regionEntrance-",
		eventXMLType:  "regionEntrance",
	},
	"exiting": {
		schedCategory: "regionExitings",
		schedIDPrefix: "regionExiting_video",
		triggerPrefix: "regionExiting-",
		eventXMLType:  "regionExiting",
	},
}

func getEventMeta(eventType string) (eventMeta, error) {
	norm := strings.ToLower(strings.TrimSpace(eventType))
	if meta, ok := eventMetaMap[norm]; ok {
		return meta, nil
	}
	return eventMeta{}, fmt.Errorf("unknown event type %q", eventType)
}

// GetEventSchedule queries the 7-day arming schedule for a given event type.
func (c *CameraClient) GetEventSchedule(ip, username, password, eventType string, channelID int) (*EventSchedule, error) {
	if channelID <= 0 {
		channelID = 1
	}
	meta, err := getEventMeta(eventType)
	if err != nil {
		return nil, err
	}

	path := fmt.Sprintf("/ISAPI/Event/schedules/%s/%s%d", meta.schedCategory, meta.schedIDPrefix, channelID)
	data, code, _, err := c.DoRequest(ip, username, password, "GET", path, nil, "")
	if err != nil || code != http.StatusOK {
		return nil, fmt.Errorf("get event schedule failed with status %d: %v", code, err)
	}

	xmlStr := string(data)
	// Parse <TimeBlock> entries
	dayMap := make(map[int][]ScheduleTimeRange)
	reBlock := regexp.MustCompile(`(?s)<TimeBlock>.*?</TimeBlock>`)
	reDay := regexp.MustCompile(`<dayOfWeek>(\d+)</dayOfWeek>`)
	reBegin := regexp.MustCompile(`<beginTime>([^<]+)</beginTime>`)
	reEnd := regexp.MustCompile(`<endTime>([^<]+)</endTime>`)

	blocks := reBlock.FindAllString(xmlStr, -1)
	for _, blk := range blocks {
		dayMatch := reDay.FindStringSubmatch(blk)
		beginMatch := reBegin.FindStringSubmatch(blk)
		endMatch := reEnd.FindStringSubmatch(blk)
		if len(dayMatch) >= 2 && len(beginMatch) >= 2 && len(endMatch) >= 2 {
			dayNum, err := strconv.Atoi(dayMatch[1])
			if err == nil && dayNum >= 1 && dayNum <= 7 {
				bTime := strings.TrimSpace(beginMatch[1])
				eTime := strings.TrimSpace(endMatch[1])
				dayMap[dayNum] = append(dayMap[dayNum], ScheduleTimeRange{
					BeginTime: bTime,
					EndTime:   eTime,
				})
			}
		}
	}

	// Always return all 7 days (1..7)
	days := make([]DailySchedule, 0, 7)
	for d := 1; d <= 7; d++ {
		ranges := dayMap[d]
		if ranges == nil {
			ranges = []ScheduleTimeRange{}
		}
		days = append(days, DailySchedule{
			DayOfWeek:  d,
			TimeRanges: ranges,
		})
	}

	return &EventSchedule{
		EventType: eventType,
		Days:      days,
	}, nil
}

// SetEventSchedule updates the 7-day arming schedule for a given event type.
func (c *CameraClient) SetEventSchedule(ip, username, password, eventType string, channelID int, sched EventSchedule) error {
	if channelID <= 0 {
		channelID = 1
	}
	meta, err := getEventMeta(eventType)
	if err != nil {
		return err
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<Schedule version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <id>%s%d</id>
  <eventType>%s</eventType>
  <videoInputChannelID>%d</videoInputChannelID>
  <TimeBlockList>
`, meta.schedIDPrefix, channelID, meta.eventXMLType, channelID))

	for _, d := range sched.Days {
		if d.DayOfWeek < 1 || d.DayOfWeek > 7 {
			continue
		}
		for _, tr := range d.TimeRanges {
			bTime := strings.TrimSpace(tr.BeginTime)
			eTime := strings.TrimSpace(tr.EndTime)
			if bTime == "" {
				bTime = "00:00"
			}
			if eTime == "" {
				eTime = "24:00"
			}
			sb.WriteString(fmt.Sprintf(`    <TimeBlock>
      <dayOfWeek>%d</dayOfWeek>
      <TimeRange>
        <beginTime>%s</beginTime>
        <endTime>%s</endTime>
      </TimeRange>
    </TimeBlock>
`, d.DayOfWeek, bTime, eTime))
		}
	}

	sb.WriteString(`  </TimeBlockList>
</Schedule>`)

	path := fmt.Sprintf("/ISAPI/Event/schedules/%s/%s%d", meta.schedCategory, meta.schedIDPrefix, channelID)
	data, code, _, err := c.DoRequest(ip, username, password, "PUT", path, []byte(sb.String()), "application/xml")
	if err != nil {
		return err
	}
	if code != http.StatusOK && code != http.StatusAccepted && code != http.StatusNoContent {
		return fmt.Errorf("failed to set event schedule: status %d (resp: %s)", code, string(data))
	}
	return nil
}

// GetEventLinkage queries notification actions and triggers for an event type.
func (c *CameraClient) GetEventLinkage(ip, username, password, eventType string, channelID int) (*EventLinkage, error) {
	if channelID <= 0 {
		channelID = 1
	}
	meta, err := getEventMeta(eventType)
	if err != nil {
		return nil, err
	}

	path := fmt.Sprintf("/ISAPI/Event/triggers/%s%d", meta.triggerPrefix, channelID)
	data, code, _, err := c.DoRequest(ip, username, password, "GET", path, nil, "")
	if err != nil || code != http.StatusOK {
		return nil, fmt.Errorf("get event linkage failed with status %d: %v", code, err)
	}

	xmlStr := string(data)
	linkage := &EventLinkage{
		EventType: eventType,
	}

	reMethod := regexp.MustCompile(`<notificationMethod>([^<]+)</notificationMethod>`)
	matches := reMethod.FindAllStringSubmatch(xmlStr, -1)
	for _, m := range matches {
		if len(m) >= 2 {
			method := strings.TrimSpace(m[1])
			switch method {
			case "center":
				linkage.NotifySurveillanceCenter = true
			case "email":
				linkage.SendEmail = true
			case "FTP":
				linkage.UploadFTP = true
			case "beep":
				linkage.AudibleWarning = true
			case "record":
				linkage.TriggerChannelRecord = true
			case "triggerAlarmOutput":
				linkage.TriggerAlarmOutput = true
			}
		}
	}

	// Also check by ID if notificationMethod didn't catch specific format
	reID := regexp.MustCompile(`<EventTriggerNotification>.*?<id>([^<]+)</id>.*?</EventTriggerNotification>`)
	idMatches := reID.FindAllStringSubmatch(xmlStr, -1)
	for _, m := range idMatches {
		if len(m) >= 2 {
			idVal := strings.ToLower(strings.TrimSpace(m[1]))
			if strings.HasPrefix(idVal, "record") {
				linkage.TriggerChannelRecord = true
			} else if strings.HasPrefix(idVal, "triggeralarmoutput") {
				linkage.TriggerAlarmOutput = true
			}
		}
	}

	return linkage, nil
}

// SetEventLinkage updates notification actions and triggers for an event type.
func (c *CameraClient) SetEventLinkage(ip, username, password, eventType string, channelID int, linkage EventLinkage) error {
	if channelID <= 0 {
		channelID = 1
	}
	meta, err := getEventMeta(eventType)
	if err != nil {
		return err
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<EventTrigger version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <id>%s%d</id>
  <eventType>%s</eventType>
  <videoInputChannelID>%d</videoInputChannelID>
  <EventTriggerNotificationList>
`, meta.triggerPrefix, channelID, meta.eventXMLType, channelID))

	if linkage.NotifySurveillanceCenter {
		sb.WriteString(`    <EventTriggerNotification>
      <id>center</id>
      <notificationMethod>center</notificationMethod>
      <notificationRecurrence>beginning</notificationRecurrence>
    </EventTriggerNotification>
`)
	}
	if linkage.TriggerChannelRecord {
		sb.WriteString(fmt.Sprintf(`    <EventTriggerNotification>
      <id>record-%d</id>
      <notificationMethod>record</notificationMethod>
      <videoInputID>%d</videoInputID>
      <notificationRecurrence>beginning</notificationRecurrence>
    </EventTriggerNotification>
`, channelID, channelID))
	}
	if linkage.SendEmail {
		sb.WriteString(`    <EventTriggerNotification>
      <id>email</id>
      <notificationMethod>email</notificationMethod>
      <notificationRecurrence>beginning</notificationRecurrence>
    </EventTriggerNotification>
`)
	}
	if linkage.UploadFTP {
		sb.WriteString(`    <EventTriggerNotification>
      <id>FTP</id>
      <notificationMethod>FTP</notificationMethod>
      <notificationRecurrence>beginning</notificationRecurrence>
    </EventTriggerNotification>
`)
	}
	if linkage.AudibleWarning {
		sb.WriteString(`    <EventTriggerNotification>
      <id>beep</id>
      <notificationMethod>beep</notificationMethod>
      <notificationRecurrence>beginning</notificationRecurrence>
    </EventTriggerNotification>
`)
	}
	if linkage.TriggerAlarmOutput {
		sb.WriteString(fmt.Sprintf(`    <EventTriggerNotification>
      <id>triggerAlarmOutput-%d</id>
      <notificationMethod>triggerAlarmOutput</notificationMethod>
      <notificationRecurrence>beginning</notificationRecurrence>
    </EventTriggerNotification>
`, channelID))
	}

	sb.WriteString(`  </EventTriggerNotificationList>
</EventTrigger>`)

	path := fmt.Sprintf("/ISAPI/Event/triggers/%s%d", meta.triggerPrefix, channelID)
	data, code, _, err := c.DoRequest(ip, username, password, "PUT", path, []byte(sb.String()), "application/xml")
	if err != nil {
		return err
	}
	if code != http.StatusOK && code != http.StatusAccepted && code != http.StatusNoContent {
		return fmt.Errorf("failed to set event linkage: status %d (resp: %s)", code, string(data))
	}
	return nil
}
