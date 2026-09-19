package hikvision

import (
	"fmt"
	"net/http"
	"regexp"
	"strconv"
)

// PTZContinuous sends a PTZ movement command (pan/tilt/zoom).
func (c *CameraClient) PTZContinuous(ip, username, password string, channelID int, pan, tilt, zoom int) error {
	if channelID <= 0 {
		channelID = 1
	}
	payload := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<PTZData version="1.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <pan>%d</pan>
  <tilt>%d</tilt>
  <zoom>%d</zoom>
</PTZData>`, pan, tilt, zoom)

	path := fmt.Sprintf("/ISAPI/PTZCtrl/channels/%d/continuous", channelID)
	_, code, _, err := c.DoRequest(ip, username, password, "PUT", path, []byte(payload), "application/xml")
	if err != nil {
		return err
	}
	if code != http.StatusOK && code != http.StatusAccepted {
		return fmt.Errorf("ptz command returned status %d", code)
	}
	return nil
}

// GetPTZPresets returns list of configured PTZ preset positions.
func (c *CameraClient) GetPTZPresets(ip, username, password string, channelID int) ([]PTZPreset, error) {
	if channelID <= 0 {
		channelID = 1
	}
	path := fmt.Sprintf("/ISAPI/PTZCtrl/channels/%d/presets", channelID)
	data, code, _, err := c.DoRequest(ip, username, password, "GET", path, nil, "")
	if err != nil || code != http.StatusOK {
		return nil, fmt.Errorf("ptz presets query failed: status %d", code)
	}

	var presets []PTZPreset
	re := regexp.MustCompile(`(?is)<PTZPreset\b[^>]*>(.*?)</PTZPreset>`)
	matches := re.FindAllStringSubmatch(string(data), -1)
	for _, m := range matches {
		id, _ := strconv.Atoi(extractXMLTag(m[1], "id"))
		name := extractXMLTag(m[1], "presetName")
		if id > 0 {
			presets = append(presets, PTZPreset{ID: id, Name: name})
		}
	}
	return presets, nil
}

// PTZPresetGoto navigates camera PTZ to a specific preset position.
func (c *CameraClient) PTZPresetGoto(ip, username, password string, channelID, presetID int) error {
	if channelID <= 0 {
		channelID = 1
	}
	path := fmt.Sprintf("/ISAPI/PTZCtrl/channels/%d/presets/%d/goto", channelID, presetID)
	_, code, _, err := c.DoRequest(ip, username, password, "PUT", path, nil, "")
	if err != nil {
		return err
	}
	if code != http.StatusOK && code != http.StatusAccepted {
		return fmt.Errorf("ptz goto returned status %d", code)
	}
	return nil
}
