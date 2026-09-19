package hikvision

import (
	"fmt"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// GetImageSettings queries brightness, contrast, saturation, sharpness, Day/Night IR mode, WDR, White Balance, BLC, HLC, DNR, Shutter, Gain, and Supplement Light.
func (c *CameraClient) GetImageSettings(ip, username, password string, channelID int) (*ImageSettings, error) {
	if channelID <= 0 {
		channelID = 1
	}

	img := ImageSettings{
		ChannelID:              channelID,
		Brightness:             50,
		Contrast:               50,
		Saturation:             50,
		Sharpness:              50,
		IRCutFilterType:        "auto",
		NightToDayFilterLevel:  4,
		NightToDayFilterTime:   5,
		WDRMode:                "close",
		WDRLevel:               50,
		ImageFlipStyle:         "OFF",
		WhiteBalance:           "auto1",
		WhiteBalanceRed:        50,
		WhiteBalanceBlue:       50,
		BLCEnabled:             false,
		BLCMode:                "CLOSE",
		HLCEnabled:             false,
		HLCLevel:               50,
		NoiseReduceMode:        "general",
		NoiseReduceLevel:       50,
		PowerLineFrequencyMode: "60hz",
		ShutterLevel:           "1/30",
		GainLevel:              50,
		SupplementLightMode:    "close",
		WhiteLightBrightness:   50,
		DehazeMode:             "close",
		ExposureMode:           "auto",
	}

	// 1. Query capabilities to discover supported options
	capPaths := []string{
		fmt.Sprintf("/ISAPI/Image/channels/%d/capabilities", channelID),
		fmt.Sprintf("/ISAPI/System/Video/inputs/channels/%d/capabilities", channelID),
	}
	for _, cp := range capPaths {
		data, code, _, _ := c.DoRequest(ip, username, password, "GET", cp, nil, "")
		if code == http.StatusOK && len(data) > 0 {
			capStr := string(data)

			// IRCutFilter
			if irBlock := extractXMLTag(capStr, "IrcutFilter"); irBlock != "" {
				img.SupportedIRCutFilterTypes = extractXMLOptList(irBlock, "IrcutFilterType", "ircutFilterType")
			}
			// WDR
			if wdrBlock := extractXMLTag(capStr, "WDR"); wdrBlock != "" {
				img.SupportedWDRModes = extractXMLOptList(wdrBlock, "mode")
			}
			// WhiteBalance
			if wbBlock := extractXMLTag(capStr, "WhiteBalance"); wbBlock != "" {
				img.SupportedWhiteBalanceStyles = extractXMLOptList(wbBlock, "WhiteBalanceStyle", "whiteBalanceStyle")
				// Check if manual Red/Blue adjustment is supported (max > 0)
				reMax := regexp.MustCompile(`(?is)<WhiteBalanceRed\b[^>]*\bmax=["']([1-9]\d*)["']`)
				if reMax.MatchString(wbBlock) {
					img.HasWhiteBalanceManual = true
				}
			}
			// ImageFlip
			if flipBlock := extractXMLTag(capStr, "ImageFlip"); flipBlock != "" {
				img.SupportedImageFlipStyles = extractXMLOptList(flipBlock, "ImageFlipStyle", "imageFlipStyle")
			}
			// PowerLineFrequency
			if plfBlock := extractXMLTag(capStr, "powerLineFrequency"); plfBlock != "" {
				img.SupportedPowerLineFrequencyModes = extractXMLOptList(plfBlock, "powerLineFrequencyMode", "powerLineFrequency")
			}
			// BLC
			if blcBlock := extractXMLTag(capStr, "BLC"); blcBlock != "" {
				img.HasBLC = true
				img.SupportedBLCModes = extractXMLOptList(blcBlock, "BLCMode", "blcMode")
			}
			// HLC
			if strings.Contains(capStr, "<HLC") {
				img.HasHLC = true
			}
			// NoiseReduce
			if nrBlock := extractXMLTag(capStr, "NoiseReduce"); nrBlock != "" {
				img.HasNoiseReduce = true
				img.SupportedNoiseReduceModes = extractXMLOptList(nrBlock, "mode")
			}
			// Shutter
			if shutterBlock := extractXMLTag(capStr, "Shutter"); shutterBlock != "" {
				img.SupportedShutterLevels = extractXMLOptList(shutterBlock, "ShutterLevel", "shutterLevel")
			}
			// Gain
			if strings.Contains(capStr, "<Gain") {
				img.HasGain = true
			}
			// SupplementLight (ColorVu white light)
			if slBlock := extractXMLTag(capStr, "SupplementLight"); slBlock != "" {
				img.HasSupplementLight = true
				img.SupportedSupplementLightModes = extractXMLOptList(slBlock, "supplementLightMode")
			}
			// Dehaze
			if dehazeBlock := extractXMLTag(capStr, "Dehaze"); dehazeBlock != "" {
				img.HasDehaze = true
				img.SupportedDehazeModes = extractXMLOptList(dehazeBlock, "DehazeMode", "dehazeMode")
			}
			break
		}
	}

	// Fallback capabilities if camera didn't return some or any
	if len(img.SupportedIRCutFilterTypes) == 0 {
		img.SupportedIRCutFilterTypes = []string{"day", "night", "auto", "schedule"}
	}
	if len(img.SupportedWDRModes) == 0 {
		img.SupportedWDRModes = []string{"close", "open"}
	}
	if len(img.SupportedPowerLineFrequencyModes) == 0 {
		img.SupportedPowerLineFrequencyModes = []string{"50hz", "60hz"}
	}
	if len(img.SupportedImageFlipStyles) == 0 {
		img.SupportedImageFlipStyles = []string{"LEFTRIGHT", "UPDOWN", "CENTER"}
	}

	// 2. Query full ImageChannel configuration across candidate endpoints
	channelPaths := []string{
		fmt.Sprintf("/ISAPI/Image/channels/%d", channelID),
		fmt.Sprintf("/ISAPI/Image/channels/%d/display", channelID),
		fmt.Sprintf("/ISAPI/System/Video/inputs/channels/%d", channelID),
	}
	for _, p := range channelPaths {
		data, code, _, _ := c.DoRequest(ip, username, password, "GET", p, nil, "")
		if code == http.StatusOK && len(data) > 0 {
			str := string(data)
			img.Brightness = parseXMLIntAny(str, img.Brightness, "brightnessLevel", "brightness", "BrightnessLevel")
			img.Contrast = parseXMLIntAny(str, img.Contrast, "contrastLevel", "contrast", "ContrastLevel")
			img.Saturation = parseXMLIntAny(str, img.Saturation, "saturationLevel", "saturation", "SaturationLevel")
			img.Sharpness = parseXMLIntAny(str, img.Sharpness, "SharpnessLevel", "sharpnessLevel", "sharpness")

			// IRCutFilter
			if irBlock := extractXMLTag(str, "IrcutFilter"); irBlock != "" {
				filter := extractXMLTagAny(irBlock, "IrcutFilterType", "ircutFilterType")
				if filter != "" {
					img.IRCutFilterType = normalizeIRCutFilter(filter)
				}
				img.NightToDayFilterLevel = parseXMLIntAny(irBlock, img.NightToDayFilterLevel, "nightToDayFilterLevel")
				img.NightToDayFilterTime = parseXMLIntAny(irBlock, img.NightToDayFilterTime, "nightToDayFilterTime")
			} else {
				filter := extractXMLTagAny(str, "IrcutFilterType", "ircutFilterType")
				if filter != "" {
					img.IRCutFilterType = normalizeIRCutFilter(filter)
				}
			}

			// WDR
			if wdrBlock := extractXMLTag(str, "WDR"); wdrBlock != "" {
				wdrMode := extractXMLTag(wdrBlock, "mode")
				if wdrMode != "" {
					img.WDRMode = wdrMode
				}
				img.WDRLevel = parseXMLIntAny(wdrBlock, img.WDRLevel, "WDRLevel", "wdrLevel", "level")
			}

			// ImageFlip
			if flipBlock := extractXMLTag(str, "ImageFlip"); flipBlock != "" {
				flipEnabled := extractXMLTag(flipBlock, "enabled") == "true"
				flipStyle := extractXMLTagAny(flipBlock, "ImageFlipStyle", "imageFlipStyle")
				if !flipEnabled || flipStyle == "" {
					img.ImageFlipStyle = "OFF"
				} else {
					img.ImageFlipStyle = flipStyle
				}
			}

			// WhiteBalance
			if wbBlock := extractXMLTag(str, "WhiteBalance"); wbBlock != "" {
				wb := extractXMLTagAny(wbBlock, "WhiteBalanceStyle", "whiteBalanceStyle")
				if wb != "" {
					img.WhiteBalance = wb
				}
				img.WhiteBalanceRed = parseXMLIntAny(wbBlock, img.WhiteBalanceRed, "WhiteBalanceRed", "whiteBalanceRed")
				img.WhiteBalanceBlue = parseXMLIntAny(wbBlock, img.WhiteBalanceBlue, "WhiteBalanceBlue", "whiteBalanceBlue")
			}

			// BLC
			if blcBlock := extractXMLTag(str, "BLC"); blcBlock != "" {
				img.BLCEnabled = extractXMLTag(blcBlock, "enabled") == "true"
				blcMode := extractXMLTagAny(blcBlock, "BLCMode", "blcMode")
				if blcMode != "" {
					img.BLCMode = blcMode
				} else if !img.BLCEnabled {
					img.BLCMode = "CLOSE"
				}
			}

			// HLC
			if hlcBlock := extractXMLTag(str, "HLC"); hlcBlock != "" {
				img.HLCEnabled = extractXMLTag(hlcBlock, "enabled") == "true"
				img.HLCLevel = parseXMLIntAny(hlcBlock, img.HLCLevel, "HLCLevel", "hlcLevel")
			}

			// NoiseReduce
			if nrBlock := extractXMLTag(str, "NoiseReduce"); nrBlock != "" {
				mode := extractXMLTag(nrBlock, "mode")
				if mode != "" {
					img.NoiseReduceMode = mode
				}
				img.NoiseReduceLevel = parseXMLIntAny(nrBlock, img.NoiseReduceLevel, "generalLevel", "GeneralLevel", "level")
			}

			// PowerLineFrequency
			if plfBlock := extractXMLTag(str, "powerLineFrequency"); plfBlock != "" {
				mode := extractXMLTagAny(plfBlock, "powerLineFrequencyMode", "powerLineFrequency")
				if mode != "" {
					img.PowerLineFrequencyMode = mode
				}
			}

			// Shutter
			if shutterBlock := extractXMLTag(str, "Shutter"); shutterBlock != "" {
				sh := extractXMLTagAny(shutterBlock, "ShutterLevel", "shutterLevel")
				if sh != "" {
					img.ShutterLevel = sh
				}
			}

			// Gain
			if gainBlock := extractXMLTag(str, "Gain"); gainBlock != "" {
				img.GainLevel = parseXMLIntAny(gainBlock, img.GainLevel, "GainLevel", "gainLevel")
			}

			// SupplementLight
			if slBlock := extractXMLTag(str, "SupplementLight"); slBlock != "" {
				mode := extractXMLTagAny(slBlock, "supplementLightMode", "SupplementLightMode")
				if mode != "" {
					img.SupplementLightMode = mode
				}
				img.WhiteLightBrightness = parseXMLIntAny(slBlock, img.WhiteLightBrightness, "whiteLightBrightness", "brightness")
			}

			// Dehaze
			if dehazeBlock := extractXMLTag(str, "Dehaze"); dehazeBlock != "" {
				mode := extractXMLTagAny(dehazeBlock, "DehazeMode", "dehazeMode")
				if mode != "" {
					img.DehazeMode = mode
				}
			}
			break
		}
	}

	// 3. Query individual sub-endpoints to ensure freshest values if needed
	// Color
	cData, cCode, _, _ := c.DoRequest(ip, username, password, "GET", fmt.Sprintf("/ISAPI/Image/channels/%d/color", channelID), nil, "")
	if cCode == http.StatusOK && len(cData) > 0 {
		cStr := string(cData)
		img.Brightness = parseXMLIntAny(cStr, img.Brightness, "brightnessLevel")
		img.Contrast = parseXMLIntAny(cStr, img.Contrast, "contrastLevel")
		img.Saturation = parseXMLIntAny(cStr, img.Saturation, "saturationLevel")
	}

	// Sharpness
	sData, sCode, _, _ := c.DoRequest(ip, username, password, "GET", fmt.Sprintf("/ISAPI/Image/channels/%d/sharpness", channelID), nil, "")
	if sCode == http.StatusOK && len(sData) > 0 {
		img.Sharpness = parseXMLIntAny(string(sData), img.Sharpness, "SharpnessLevel", "sharpnessLevel")
	}

	// IRCutFilter
	irPaths := []string{
		fmt.Sprintf("/ISAPI/Image/channels/%d/ircutFilter", channelID),
		fmt.Sprintf("/ISAPI/Image/channels/%d/irCutFilter", channelID),
	}
	for _, p := range irPaths {
		irData, irCode, _, _ := c.DoRequest(ip, username, password, "GET", p, nil, "")
		if irCode == http.StatusOK && len(irData) > 0 {
			filter := extractXMLTagAny(string(irData), "IrcutFilterType", "ircutFilterType")
			if filter != "" {
				img.IRCutFilterType = normalizeIRCutFilter(filter)
				img.NightToDayFilterLevel = parseXMLIntAny(string(irData), img.NightToDayFilterLevel, "nightToDayFilterLevel")
				img.NightToDayFilterTime = parseXMLIntAny(string(irData), img.NightToDayFilterTime, "nightToDayFilterTime")
				break
			}
		}
	}

	// WDR / Backlight
	wdrPaths := []string{
		fmt.Sprintf("/ISAPI/Image/channels/%d/WDR", channelID),
		fmt.Sprintf("/ISAPI/Image/channels/%d/backlight", channelID),
	}
	for _, p := range wdrPaths {
		wdrData, wdrCode, _, _ := c.DoRequest(ip, username, password, "GET", p, nil, "")
		if wdrCode == http.StatusOK && len(wdrData) > 0 {
			mode := extractXMLTag(string(wdrData), "mode")
			if mode != "" {
				img.WDRMode = mode
			}
			img.WDRLevel = parseXMLIntAny(string(wdrData), img.WDRLevel, "WDRLevel", "wdrLevel", "level")
			break
		}
	}

	// BLC sub-endpoint if needed
	if img.HasBLC && (img.BLCMode == "" || img.BLCMode == "CLOSE") {
		blcData, blcCode, _, _ := c.DoRequest(ip, username, password, "GET", fmt.Sprintf("/ISAPI/Image/channels/%d/BLC", channelID), nil, "")
		if blcCode == http.StatusOK && len(blcData) > 0 {
			bStr := string(blcData)
			img.BLCEnabled = extractXMLTag(bStr, "enabled") == "true"
			mode := extractXMLTagAny(bStr, "BLCMode", "blcMode")
			if mode != "" {
				img.BLCMode = mode
			}
		}
	}

	// HLC sub-endpoint if supported
	if img.HasHLC {
		hlcData, hlcCode, _, _ := c.DoRequest(ip, username, password, "GET", fmt.Sprintf("/ISAPI/Image/channels/%d/HLC", channelID), nil, "")
		if hlcCode == http.StatusOK && len(hlcData) > 0 {
			hStr := string(hlcData)
			img.HLCEnabled = extractXMLTag(hStr, "enabled") == "true"
			img.HLCLevel = parseXMLIntAny(hStr, img.HLCLevel, "HLCLevel", "hlcLevel")
		}
	}

	// SupplementLight sub-endpoint if supported
	if img.HasSupplementLight {
		slData, slCode, _, _ := c.DoRequest(ip, username, password, "GET", fmt.Sprintf("/ISAPI/Image/channels/%d/SupplementLight", channelID), nil, "")
		if slCode == http.StatusOK && len(slData) > 0 {
			slStr := string(slData)
			mode := extractXMLTagAny(slStr, "supplementLightMode", "SupplementLightMode")
			if mode != "" {
				img.SupplementLightMode = mode
			}
			img.WhiteLightBrightness = parseXMLIntAny(slStr, img.WhiteLightBrightness, "whiteLightBrightness", "brightness")
		}
	}

	return &img, nil
}

// SetImageSettings updates image display sliders, IR filter, WDR, BLC, HLC, DNR, White Balance, Supplement Light, Shutter, Gain, and flip.
func (c *CameraClient) SetImageSettings(ip, username, password string, channelID int, s ImageSettings) error {
	if channelID <= 0 {
		channelID = 1
	}

	// 1. Update Color (Brightness, Contrast, Saturation)
	colorPayload := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<Color version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <brightnessLevel>%d</brightnessLevel>
  <contrastLevel>%d</contrastLevel>
  <saturationLevel>%d</saturationLevel>
</Color>`, s.Brightness, s.Contrast, s.Saturation)

	_, code, _, err := c.DoRequest(ip, username, password, "PUT", fmt.Sprintf("/ISAPI/Image/channels/%d/color", channelID), []byte(colorPayload), "application/xml")
	if err != nil || (code != http.StatusOK && code != http.StatusAccepted && code != http.StatusNoContent) {
		// Fallback to /ISAPI/Image/channels/%d
		channelPayload := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<ImageChannel version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <videoInputChannelID>%d</videoInputChannelID>
  <brightnessLevel>%d</brightnessLevel>
  <contrastLevel>%d</contrastLevel>
  <saturationLevel>%d</saturationLevel>
  <sharpnessLevel>%d</sharpnessLevel>
</ImageChannel>`, channelID, s.Brightness, s.Contrast, s.Saturation, s.Sharpness)
		_, _, _, _ = c.DoRequest(ip, username, password, "PUT", fmt.Sprintf("/ISAPI/Image/channels/%d", channelID), []byte(channelPayload), "application/xml")
	}

	// 2. Update Sharpness
	sharpPayload := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<Sharpness version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <SharpnessLevel>%d</SharpnessLevel>
</Sharpness>`, s.Sharpness)
	_, _, _, _ = c.DoRequest(ip, username, password, "PUT", fmt.Sprintf("/ISAPI/Image/channels/%d/sharpness", channelID), []byte(sharpPayload), "application/xml")

	// 3. Update IR Cut Filter
	if s.IRCutFilterType != "" {
		normIR := normalizeIRCutFilter(s.IRCutFilterType)
		var scheduleBlock string
		if normIR == "schedule" {
			scheduleBlock = "\n  <Schedule>\n    <scheduleType>day</scheduleType>\n    <TimeRange>\n      <beginTime>06:00:00</beginTime>\n      <endTime>18:00:00</endTime>\n    </TimeRange>\n  </Schedule>"
		}
		var filterLevelBlock string
		if s.NightToDayFilterLevel > 0 {
			filterLevelBlock += fmt.Sprintf("\n  <nightToDayFilterLevel>%d</nightToDayFilterLevel>", s.NightToDayFilterLevel)
		}
		if s.NightToDayFilterTime > 0 {
			filterLevelBlock += fmt.Sprintf("\n  <nightToDayFilterTime>%d</nightToDayFilterTime>", s.NightToDayFilterTime)
		}

		irPayload := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<IrcutFilter version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <IrcutFilterType>%s</IrcutFilterType>%s%s
</IrcutFilter>`, escapeXML(normIR), filterLevelBlock, scheduleBlock)

		irPaths := []string{
			fmt.Sprintf("/ISAPI/Image/channels/%d/ircutFilter", channelID),
			fmt.Sprintf("/ISAPI/Image/channels/%d/irCutFilter", channelID),
			fmt.Sprintf("/ISAPI/Image/channels/%d", channelID),
		}
		for _, p := range irPaths {
			_, cCode, _, cErr := c.DoRequest(ip, username, password, "PUT", p, []byte(irPayload), "application/xml")
			if cErr == nil && (cCode == http.StatusOK || cCode == http.StatusAccepted || cCode == http.StatusNoContent) {
				break
			}
		}
	}

	// 4. Update WDR
	if s.WDRMode != "" {
		wdrPayload := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<WDR version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <mode>%s</mode>
  <WDRLevel>%d</WDRLevel>
</WDR>`, escapeXML(s.WDRMode), s.WDRLevel)
		_, _, _, _ = c.DoRequest(ip, username, password, "PUT", fmt.Sprintf("/ISAPI/Image/channels/%d/WDR", channelID), []byte(wdrPayload), "application/xml")
	}

	// 5. Update Image Flip
	if s.ImageFlipStyle != "" {
		flipPayload := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<ImageFlip version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <enabled>%t</enabled>
  <ImageFlipStyle>%s</ImageFlipStyle>
</ImageFlip>`, s.ImageFlipStyle != "OFF", escapeXML(s.ImageFlipStyle))
		_, _, _, _ = c.DoRequest(ip, username, password, "PUT", fmt.Sprintf("/ISAPI/Image/channels/%d/imageFlip", channelID), []byte(flipPayload), "application/xml")
	}

	// 6. Update White Balance
	if s.WhiteBalance != "" {
		var wbPayload string
		if s.WhiteBalance == "manual" {
			wbPayload = fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<WhiteBalance version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <WhiteBalanceStyle>manual</WhiteBalanceStyle>
  <WhiteBalanceRed>%d</WhiteBalanceRed>
  <WhiteBalanceBlue>%d</WhiteBalanceBlue>
</WhiteBalance>`, s.WhiteBalanceRed, s.WhiteBalanceBlue)
		} else {
			wbPayload = fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<WhiteBalance version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <WhiteBalanceStyle>%s</WhiteBalanceStyle>
</WhiteBalance>`, escapeXML(s.WhiteBalance))
		}
		_, _, _, _ = c.DoRequest(ip, username, password, "PUT", fmt.Sprintf("/ISAPI/Image/channels/%d/whiteBalance", channelID), []byte(wbPayload), "application/xml")
	}

	// 7. Update BLC (Backlight Compensation)
	if s.BLCMode != "" {
		blcEnabled := s.BLCMode != "CLOSE" && s.BLCMode != "OFF"
		blcPayload := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<BLC version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <enabled>%t</enabled>
  <BLCMode>%s</BLCMode>
</BLC>`, blcEnabled, escapeXML(s.BLCMode))
		_, _, _, _ = c.DoRequest(ip, username, password, "PUT", fmt.Sprintf("/ISAPI/Image/channels/%d/BLC", channelID), []byte(blcPayload), "application/xml")
	}

	// 8. Update HLC (Highlight Compensation)
	if s.HasHLC || s.HLCEnabled || s.HLCLevel > 0 {
		hlcLevel := s.HLCLevel
		if hlcLevel <= 0 {
			hlcLevel = 50
		}
		hlcPayload := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<HLC version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <enabled>%t</enabled>
  <HLCLevel>%d</HLCLevel>
</HLC>`, s.HLCEnabled, hlcLevel)
		_, _, _, _ = c.DoRequest(ip, username, password, "PUT", fmt.Sprintf("/ISAPI/Image/channels/%d/HLC", channelID), []byte(hlcPayload), "application/xml")
	}

	// 9. Update Noise Reduction (DNR)
	if s.NoiseReduceMode != "" {
		var nrPayload string
		if s.NoiseReduceMode == "general" {
			nrLevel := s.NoiseReduceLevel
			if nrLevel <= 0 {
				nrLevel = 50
			}
			nrPayload = fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<NoiseReduce version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <mode>general</mode>
  <GeneralMode>
    <generalLevel>%d</generalLevel>
  </GeneralMode>
</NoiseReduce>`, nrLevel)
		} else {
			nrPayload = fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<NoiseReduce version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <mode>%s</mode>
</NoiseReduce>`, escapeXML(s.NoiseReduceMode))
		}
		_, _, _, _ = c.DoRequest(ip, username, password, "PUT", fmt.Sprintf("/ISAPI/Image/channels/%d/noiseReduce", channelID), []byte(nrPayload), "application/xml")
	}

	// 10. Update Power Line Frequency (Anti-Flicker)
	if s.PowerLineFrequencyMode != "" {
		plfPayload := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<powerLineFrequency version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <powerLineFrequencyMode>%s</powerLineFrequencyMode>
</powerLineFrequency>`, escapeXML(s.PowerLineFrequencyMode))
		_, _, _, _ = c.DoRequest(ip, username, password, "PUT", fmt.Sprintf("/ISAPI/Image/channels/%d/powerLineFrequency", channelID), []byte(plfPayload), "application/xml")
	}

	// 11. Update Shutter Speed
	if s.ShutterLevel != "" {
		shutterPayload := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<Shutter version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <ShutterLevel>%s</ShutterLevel>
</Shutter>`, escapeXML(s.ShutterLevel))
		_, _, _, _ = c.DoRequest(ip, username, password, "PUT", fmt.Sprintf("/ISAPI/Image/channels/%d/shutter", channelID), []byte(shutterPayload), "application/xml")
	}

	// 12. Update Gain
	if s.GainLevel > 0 {
		gainPayload := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<Gain version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <GainLevel>%d</GainLevel>
</Gain>`, s.GainLevel)
		_, _, _, _ = c.DoRequest(ip, username, password, "PUT", fmt.Sprintf("/ISAPI/Image/channels/%d/gain", channelID), []byte(gainPayload), "application/xml")
	}

	// 13. Update Supplement Light (ColorVu White Light)
	if s.SupplementLightMode != "" {
		slBrightness := s.WhiteLightBrightness
		if slBrightness <= 0 {
			slBrightness = 50
		}
		slPayload := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<SupplementLight version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <supplementLightMode>%s</supplementLightMode>
  <whiteLightBrightness>%d</whiteLightBrightness>
</SupplementLight>`, escapeXML(s.SupplementLightMode), slBrightness)
		_, _, _, _ = c.DoRequest(ip, username, password, "PUT", fmt.Sprintf("/ISAPI/Image/channels/%d/SupplementLight", channelID), []byte(slPayload), "application/xml")
	}

	// 14. Update Dehaze
	if s.DehazeMode != "" {
		dhPayload := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<Dehaze version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <DehazeMode>%s</DehazeMode>
</Dehaze>`, escapeXML(s.DehazeMode))
		_, _, _, _ = c.DoRequest(ip, username, password, "PUT", fmt.Sprintf("/ISAPI/Image/channels/%d/dehaze", channelID), []byte(dhPayload), "application/xml")
	}

	return nil
}

// GetStreamSettings queries streaming parameters for channel 101 (Main) or 102 (Sub).
func (c *CameraClient) GetStreamSettings(ip, username, password string, channelID int) (*StreamSettings, error) {
	if channelID <= 0 {
		channelID = 101
	}

	path := fmt.Sprintf("/ISAPI/Streaming/channels/%d", channelID)
	data, code, _, err := c.DoRequest(ip, username, password, "GET", path, nil, "")
	if err != nil || code != http.StatusOK {
		return nil, fmt.Errorf("stream query failed with status %d", code)
	}

	str := string(data)
	s := StreamSettings{
		ID:              channelID,
		ChannelName:     extractXMLTag(str, "channelName"),
		Enabled:         extractXMLTag(str, "enabled") == "true",
		VideoCodec:      extractXMLTag(str, "videoCodecType"),
		Width:           parseXMLIntAny(str, 1920, "videoResolutionWidth", "width"),
		Height:          parseXMLIntAny(str, 1080, "videoResolutionHeight", "height"),
		BitrateType:     extractXMLTag(str, "videoQualityControlType"),
		ConstantBitrate: parseXMLIntAny(str, 4096, "constantBitRate", "bitrate", "vbrUpperCap"),
		FixedQuality:    parseXMLIntAny(str, 60, "fixedQuality", "quality"),
		MaxFrameRate:    parseXMLIntAny(str, 2500, "maxFrameRate", "frameRate"),
		Smoothing:       parseXMLIntAny(str, 50, "smoothing"),
		GovLength:       parseXMLIntAny(str, 50, "GovLength", "govLength", "IFrameInterval", "keyFrameInterval"),
		Profile:         extractXMLTagAny(str, "H264Profile", "H265Profile", "profile", "Profile"),
	}
	if svcBlock := extractXMLTag(str, "SVC"); svcBlock != "" {
		s.SVCEnabled = extractXMLTag(svcBlock, "enabled") == "true"
	}
	if s.Profile == "" {
		s.Profile = "Main"
	}
	s.Resolution = fmt.Sprintf("%dx%d", s.Width, s.Height)
	s.FPS = s.MaxFrameRate / 100
	if s.FPS <= 0 {
		s.FPS = 25
	}
	if s.VideoCodec == "" {
		s.VideoCodec = "H.264"
	}
	if s.BitrateType == "" {
		s.BitrateType = "VBR"
	}

	// 1. Try to extract capabilities directly from the channel XML itself
	s.SupportedResolutions, s.SupportedFPS, s.SupportedCodecs, s.SupportedBitrateTypes, s.SupportedProfiles = parseStreamCapabilities(str)

	// 2. Query channel-specific and general capability endpoints
	var capPaths []string
	capPaths = append(capPaths, fmt.Sprintf("/ISAPI/Streaming/channels/%d/capabilities", channelID))
	if channelID >= 100 {
		capPaths = append(capPaths, fmt.Sprintf("/ISAPI/Streaming/channels/%d/capabilities", channelID-100))
	}
	capPaths = append(capPaths, fmt.Sprintf("/ISAPI/Streaming/channels/%d/dynamicCap", channelID))
	if channelID >= 100 {
		capPaths = append(capPaths, fmt.Sprintf("/ISAPI/Streaming/channels/%d/dynamicCap", channelID-100))
	}
	capPaths = append(capPaths, "/ISAPI/Streaming/channels/capabilities")
	capPaths = append(capPaths, "/ISAPI/Streaming/channels")
	// Only probe physical sensor input capabilities for Main Stream (101 or 1)
	if channelID == 101 || channelID == 1 {
		capPaths = append(capPaths, "/ISAPI/System/Video/inputs/channels/1/capabilities")
		capPaths = append(capPaths, "/ISAPI/System/Video/inputs/channels/1/videoResolution/capabilities")
		capPaths = append(capPaths, "/ISAPI/System/Video/inputs/channels/1")
	}

	for _, capPath := range capPaths {
		if len(s.SupportedResolutions) > 0 && len(s.SupportedFPS) > 0 {
			break
		}
		capData, capCode, _, _ := c.DoRequest(ip, username, password, "GET", capPath, nil, "")
		if capCode == http.StatusOK && len(capData) > 0 {
			capStr := string(capData)
			targetXML := capStr
			if strings.Contains(capStr, "<StreamingChannelList") || strings.Contains(capStr, "<StreamingChannel") {
				reBlock := regexp.MustCompile(`(?is)<StreamingChannel\b[^>]*>(.*?)</StreamingChannel>`)
				matches := reBlock.FindAllStringSubmatch(capStr, -1)
				found := false
				for _, m := range matches {
					block := m[1]
					bID := parseXMLIntAny(block, 0, "id", "channelID", "StreamingChannelID")
					if bID == channelID || (channelID >= 100 && bID == channelID-100) || (channelID < 100 && bID == channelID+100) {
						targetXML = block
						found = true
						break
					}
				}
				if !found && (strings.Contains(capStr, "<StreamingChannelList") || len(matches) > 1) {
					// Do not parse multi-channel XML if this specific channel block was not found
					continue
				}
			}
			r, f, cList, b, pList := parseStreamCapabilities(targetXML)
			if len(s.SupportedResolutions) == 0 && len(r) > 0 {
				s.SupportedResolutions = r
			}
			if len(s.SupportedFPS) == 0 && len(f) > 0 {
				s.SupportedFPS = f
			}
			if len(s.SupportedCodecs) == 0 && len(cList) > 0 {
				s.SupportedCodecs = cList
			}
			if len(s.SupportedBitrateTypes) == 0 && len(b) > 0 {
				s.SupportedBitrateTypes = b
			}
			if len(s.SupportedProfiles) == 0 && len(pList) > 0 {
				s.SupportedProfiles = pList
			}
		}
	}

	// If no capabilities were returned by any endpoint, only populate the active current resolution
	if len(s.SupportedResolutions) == 0 && s.Resolution != "" {
		s.SupportedResolutions = []string{s.Resolution}
	}

	// Ensure current resolution is in the supported list
	if s.Resolution != "" {
		hasCurrentRes := false
		for _, r := range s.SupportedResolutions {
			if strings.EqualFold(r, s.Resolution) {
				hasCurrentRes = true
				break
			}
		}
		if !hasCurrentRes {
			s.SupportedResolutions = append([]string{s.Resolution}, s.SupportedResolutions...)
		}
	}

	// Fallback frame rates if empty
	if len(s.SupportedFPS) == 0 && s.FPS > 0 {
		s.SupportedFPS = []int{s.FPS}
	}

	// Ensure current FPS is in supported list
	if s.FPS > 0 {
		hasCurrentFPS := false
		for _, f := range s.SupportedFPS {
			if f == s.FPS {
				hasCurrentFPS = true
				break
			}
		}
		if !hasCurrentFPS {
			s.SupportedFPS = append(s.SupportedFPS, s.FPS)
			sort.Ints(s.SupportedFPS)
		}
	}

	// Fallback codecs if empty
	if len(s.SupportedCodecs) == 0 {
		if s.VideoCodec != "" {
			s.SupportedCodecs = []string{s.VideoCodec}
		} else {
			s.SupportedCodecs = []string{"H.264", "H.265", "MJPEG"}
		}
	}
	// Fallback bitrate types if empty
	if len(s.SupportedBitrateTypes) == 0 {
		if s.BitrateType != "" {
			s.SupportedBitrateTypes = []string{s.BitrateType}
		} else {
			s.SupportedBitrateTypes = []string{"VBR", "CBR"}
		}
	}
	// Fallback profiles if empty
	if len(s.SupportedProfiles) == 0 {
		s.SupportedProfiles = []string{"Main", "High", "Baseline"}
	}

	return &s, nil
}

// SetStreamSettings updates resolution, FPS, bitrate, and codec for channel 101/102.
func (c *CameraClient) SetStreamSettings(ip, username, password string, channelID int, s StreamSettings) error {
	if channelID <= 0 {
		channelID = 101
	}

	if s.Resolution != "" && strings.Contains(s.Resolution, "x") {
		parts := strings.Split(s.Resolution, "x")
		if len(parts) == 2 {
			s.Width, _ = strconv.Atoi(parts[0])
			s.Height, _ = strconv.Atoi(parts[1])
		}
	}
	if s.Width == 0 || s.Height == 0 {
		s.Width = 1920
		s.Height = 1080
	}
	if s.FPS > 0 {
		s.MaxFrameRate = s.FPS * 100
	}
	if s.MaxFrameRate == 0 {
		s.MaxFrameRate = 2500
	}
	if s.ConstantBitrate == 0 {
		s.ConstantBitrate = 4096
	}
	if s.VideoCodec == "" {
		s.VideoCodec = "H.264"
	}
	if s.BitrateType == "" {
		s.BitrateType = "VBR"
	}
	if s.FixedQuality <= 0 {
		s.FixedQuality = 60
	}
	if s.Smoothing <= 0 {
		s.Smoothing = 50
	}
	if s.GovLength <= 0 {
		s.GovLength = s.FPS * 2
		if s.GovLength <= 0 {
			s.GovLength = 50
		}
	}
	if s.Profile == "" {
		s.Profile = "Main"
	}

	profileTag := ""
	if strings.Contains(strings.ToUpper(s.VideoCodec), "265") {
		profileTag = fmt.Sprintf("\n    <H265Profile>%s</H265Profile>", escapeXML(s.Profile))
	} else if strings.Contains(strings.ToUpper(s.VideoCodec), "264") {
		profileTag = fmt.Sprintf("\n    <H264Profile>%s</H264Profile>", escapeXML(s.Profile))
	}

	svcBlock := ""
	if s.SVCEnabled {
		svcBlock = "\n    <SVC>\n      <enabled>true</enabled>\n      <SVCMode>manual</SVCMode>\n    </SVC>"
	} else {
		svcBlock = "\n    <SVC>\n      <enabled>false</enabled>\n    </SVC>"
	}

	payload := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<StreamingChannel version="1.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <id>%d</id>
  <channelName>%s</channelName>
  <enabled>true</enabled>
  <Video>
    <videoInputChannelID>1</videoInputChannelID>
    <videoCodecType>%s</videoCodecType>
    <videoResolutionWidth>%d</videoResolutionWidth>
    <videoResolutionHeight>%d</videoResolutionHeight>
    <videoQualityControlType>%s</videoQualityControlType>
    <constantBitRate>%d</constantBitRate>
    <vbrUpperCap>%d</vbrUpperCap>
    <fixedQuality>%d</fixedQuality>
    <maxFrameRate>%d</maxFrameRate>
    <GovLength>%d</GovLength>
    <smoothing>%d</smoothing>%s%s
  </Video>
</StreamingChannel>`, channelID, escapeXML(s.ChannelName), escapeXML(s.VideoCodec), s.Width, s.Height, escapeXML(s.BitrateType), s.ConstantBitrate, s.ConstantBitrate, s.FixedQuality, s.MaxFrameRate, s.GovLength, s.Smoothing, profileTag, svcBlock)

	path := fmt.Sprintf("/ISAPI/Streaming/channels/%d", channelID)
	data, code, _, err := c.DoRequest(ip, username, password, "PUT", path, []byte(payload), "application/xml")
	if err != nil {
		return err
	}
	if code != http.StatusOK && code != http.StatusAccepted {
		// Fallback for older camera models that reject newer fields (badXmlContent)
		fallbackPayload := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<StreamingChannel version="1.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <id>%d</id>
  <channelName>%s</channelName>
  <enabled>true</enabled>
  <Video>
    <videoInputChannelID>1</videoInputChannelID>
    <videoCodecType>%s</videoCodecType>
    <videoResolutionWidth>%d</videoResolutionWidth>
    <videoResolutionHeight>%d</videoResolutionHeight>
    <videoQualityControlType>%s</videoQualityControlType>
    <constantBitRate>%d</constantBitRate>
    <maxFrameRate>%d</maxFrameRate>
  </Video>
</StreamingChannel>`, channelID, escapeXML(s.ChannelName), escapeXML(s.VideoCodec), s.Width, s.Height, escapeXML(s.BitrateType), s.ConstantBitrate, s.MaxFrameRate)
		_, fbCode, _, fbErr := c.DoRequest(ip, username, password, "PUT", path, []byte(fallbackPayload), "application/xml")
		if fbErr == nil && (fbCode == http.StatusOK || fbCode == http.StatusAccepted) {
			return nil
		}
		return fmt.Errorf("failed to update stream settings: status %d (resp: %s)", code, string(data))
	}
	return nil
}
