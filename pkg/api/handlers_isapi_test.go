package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/bkbilly/hikvision-hub/pkg/auth"
	"github.com/bkbilly/hikvision-hub/pkg/db"
	"github.com/bkbilly/hikvision-hub/pkg/hikvision"
	"github.com/bkbilly/hikvision-hub/pkg/models"
)

func TestISAPIHandlersEndpoints(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "api_isapi_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	database, err := db.Open(filepath.Join(tempDir, "test.db"))
	if err != nil {
		t.Fatalf("Failed to open DB: %v", err)
	}
	defer database.Close()

	// Mock camera device server
	mockCamServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/ISAPI/System/deviceInfo":
			w.Header().Set("Content-Type", "application/xml")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?>
<DeviceInfo version="1.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <deviceName>Test Camera</deviceName>
  <model>DS-2CD2042WD-I</model>
  <serialNumber>DS-2CD2042WD-I123456</serialNumber>
  <firmwareVersion>V5.5.82</firmwareVersion>
  <macAddress>bc:54:51:aa:bb:cc</macAddress>
</DeviceInfo>`))
		case "/ISAPI/System/time":
			if r.Method == "GET" {
				w.Header().Set("Content-Type", "application/xml")
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?>
<Time version="1.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <timeMode>manual</timeMode>
  <localTime>2026-09-19T16:00:00</localTime>
  <timeZone>CST-2:00:00</timeZone>
</Time>`))
			} else {
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte(`<ResponseStatus><statusCode>1</statusCode></ResponseStatus>`))
			}
		case "/ISAPI/Image/channels/1/display":
			if r.Method == "GET" {
				w.Header().Set("Content-Type", "application/xml")
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?>
<ImageChannel version="1.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <videoInputChannelID>1</videoInputChannelID>
  <brightnessLevel>55</brightnessLevel>
  <contrastLevel>50</contrastLevel>
  <saturationLevel>60</saturationLevel>
  <sharpnessLevel>45</sharpnessLevel>
</ImageChannel>`))
			} else {
				w.WriteHeader(http.StatusOK)
			}
		case "/ISAPI/System/Video/inputs/channels/1/motionDetection":
			w.Header().Set("Content-Type", "application/xml")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?>
<MotionDetection version="1.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <enabled>true</enabled>
  <motionDetectionType>expert</motionDetectionType>
  <MotionDetectionRegionList>
    <MotionDetectionRegion>
      <id>1</id>
      <enabled>true</enabled>
      <sensitivityLevel>60</sensitivityLevel>
      <daySensitivityLevel>70</daySensitivityLevel>
      <nightSensitivityLevel>40</nightSensitivityLevel>
    </MotionDetectionRegion>
  </MotionDetectionRegionList>
</MotionDetection>`))
		case "/ISAPI/System/Video/inputs/channels/1/tamperDetection":
			w.Header().Set("Content-Type", "application/xml")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?>
<TamperDetection version="1.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <enabled>true</enabled>
  <TamperDetectionRegionList>
    <TamperDetectionRegion><id>1</id><enabled>true</enabled><sensitivityLevel>50</sensitivityLevel></TamperDetectionRegion>
  </TamperDetectionRegionList>
</TamperDetection>`))
		case "/ISAPI/System/Video/inputs/channels/1/privacyMask":
			if r.Method == "GET" {
				w.Header().Set("Content-Type", "application/xml")
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?>
<PrivacyMask version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <enabled>true</enabled>
  <normalizedScreenSize><normalizedScreenWidth>704</normalizedScreenWidth><normalizedScreenHeight>480</normalizedScreenHeight></normalizedScreenSize>
  <PrivacyMaskRegionList size="4">
    <PrivacyMaskRegion><id>1</id><enabled>true</enabled><RegionCoordinatesList>
      <RegionCoordinates><positionX>70</positionX><positionY>48</positionY></RegionCoordinates>
      <RegionCoordinates><positionX>352</positionX><positionY>48</positionY></RegionCoordinates>
      <RegionCoordinates><positionX>352</positionX><positionY>240</positionY></RegionCoordinates>
      <RegionCoordinates><positionX>70</positionX><positionY>240</positionY></RegionCoordinates>
    </RegionCoordinatesList></PrivacyMaskRegion>
  </PrivacyMaskRegionList>
</PrivacyMask>`))
			} else {
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte(`<ResponseStatus><statusCode>1</statusCode></ResponseStatus>`))
			}
		case "/ISAPI/Smart/UnattendedBaggage/1":
			w.Header().Set("Content-Type", "application/xml")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?>
<UnattendedBaggage version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <id>1</id><enabled>true</enabled>
  <UnattendedBaggageRegionList>
    <UnattendedBaggageRegion>
      <id>1</id><enabled>true</enabled><sensitivityLevel>65</sensitivityLevel><timeThreshold>12</timeThreshold>
    </UnattendedBaggageRegion>
  </UnattendedBaggageRegionList>
</UnattendedBaggage>`))
		case "/ISAPI/Smart/ObjectRemoval/1":
			w.Header().Set("Content-Type", "application/xml")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`<?xml version="1.0" encoding="UTF-8"?>
<ObjectRemoval version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <id>1</id><enabled>true</enabled>
  <ObjectRemovalRegionList>
    <ObjectRemovalRegion>
      <id>1</id><enabled>true</enabled><sensitivityLevel>75</sensitivityLevel><timeThreshold>18</timeThreshold>
    </ObjectRemovalRegion>
  </ObjectRemovalRegionList>
</ObjectRemoval>`))
		default:
			w.WriteHeader(http.StatusOK)
		}
	}))
	defer mockCamServer.Close()

	camHost := strings.TrimPrefix(mockCamServer.URL, "http://")

	// Create camera in DB
	cam := &models.Camera{
		Name:     "Test Cam",
		IP:       camHost,
		Username: "admin",
		Password: "password",
		IsISAPI:  true,
		Enabled:  true,
	}
	if err := database.CreateCamera(cam); err != nil {
		t.Fatalf("Failed to create camera: %v", err)
	}

	camClient := hikvision.NewCameraClient()
	authMgr := auth.NewAuthManager("test-secret-key-123456789012345678")

	router := SetupRouter(Config{
		DB:         database,
		Auth:       authMgr,
		CamClient:  camClient,
		AppVersion: "2.0.0-test",
	})

	token, err := authMgr.GenerateToken("admin", 24*time.Hour)
	if err != nil {
		t.Fatalf("Failed to generate token: %v", err)
	}

	// Helper to send authenticated GET
	sendReq := func(method, path string, body []byte) *httptest.ResponseRecorder {
		var reqBody *bytes.Reader
		if body != nil {
			reqBody = bytes.NewReader(body)
		} else {
			reqBody = bytes.NewReader([]byte{})
		}
		req := httptest.NewRequest(method, path, reqBody)
		req.Header.Set("Authorization", "Bearer "+token)
		if body != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		w := httptest.NewRecorder()
		router.ServeHTTP(w, req)
		return w
	}

	// 1. Test Capabilities endpoint
	w := sendReq("GET", "/api/cameras/1/isapi/capabilities", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("Capabilities endpoint failed with code %d: %s", w.Code, w.Body.String())
	}
	var caps hikvision.CameraCapabilities
	if err := json.NewDecoder(w.Body).Decode(&caps); err != nil {
		t.Fatalf("Failed to decode capabilities: %v", err)
	}
	if !caps.HasISAPI || !caps.HasDeviceInfo || !caps.HasTime || !caps.HasImageSettings {
		t.Errorf("Unexpected capabilities: %+v", caps)
	}

	// 2. Test Device Info endpoint
	w = sendReq("GET", "/api/cameras/1/isapi/device-info", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("Device info endpoint failed with code %d: %s", w.Code, w.Body.String())
	}
	var devInfo hikvision.DeviceInfo
	if err := json.NewDecoder(w.Body).Decode(&devInfo); err != nil {
		t.Fatalf("Failed to decode device info: %v", err)
	}
	if devInfo.Model != "DS-2CD2042WD-I" {
		t.Errorf("Expected model 'DS-2CD2042WD-I', got '%s'", devInfo.Model)
	}

	// 3. Test Time Sync endpoint
	syncPayload, _ := json.Marshal(map[string]string{
		"client_time": "2026-09-19T16:30:00",
		"timezone":    "CST-2:00:00",
	})
	w = sendReq("POST", "/api/cameras/1/isapi/sync-time", syncPayload)
	if w.Code != http.StatusOK {
		t.Fatalf("Sync time endpoint failed with code %d: %s", w.Code, w.Body.String())
	}

	// 4. Test Image Settings endpoint
	w = sendReq("GET", "/api/cameras/1/isapi/image", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("Image endpoint failed with code %d: %s", w.Code, w.Body.String())
	}
	var imgSettings hikvision.ImageSettings
	if err := json.NewDecoder(w.Body).Decode(&imgSettings); err != nil {
		t.Fatalf("Failed to decode image settings: %v", err)
	}
	if imgSettings.Brightness != 55 {
		t.Errorf("Expected brightness 55, got %d", imgSettings.Brightness)
	}

	// 5. Test Motion Detection endpoint (Expert mode)
	w = sendReq("GET", "/api/cameras/1/isapi/motion", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("Motion endpoint failed with code %d: %s", w.Code, w.Body.String())
	}
	var motion hikvision.MotionDetection
	if err := json.NewDecoder(w.Body).Decode(&motion); err != nil {
		t.Fatalf("Failed to decode motion: %v", err)
	}
	if motion.Mode != "expert" || motion.DaySensitivity != 70 || motion.NightSensitivity != 40 {
		t.Errorf("Unexpected motion settings: %+v", motion)
	}

	// 6. Test Tamper Detection endpoint
	w = sendReq("GET", "/api/cameras/1/isapi/tamper", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("Tamper endpoint failed with code %d: %s", w.Code, w.Body.String())
	}
	var tamper hikvision.TamperDetection
	if err := json.NewDecoder(w.Body).Decode(&tamper); err != nil {
		t.Fatalf("Failed to decode tamper: %v", err)
	}
	if !tamper.Enabled || tamper.Sensitivity != 50 {
		t.Errorf("Unexpected tamper settings: %+v", tamper)
	}

	// 7. Test Unattended Baggage endpoint
	w = sendReq("GET", "/api/cameras/1/isapi/unattended-baggage", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("Unattended baggage endpoint failed with code %d: %s", w.Code, w.Body.String())
	}
	var unattended hikvision.UnattendedBaggage
	if err := json.NewDecoder(w.Body).Decode(&unattended); err != nil {
		t.Fatalf("Failed to decode unattended baggage: %v", err)
	}
	if !unattended.Enabled || unattended.Sensitivity != 65 || unattended.TimeThreshold != 12 {
		t.Errorf("Unexpected unattended baggage settings: %+v", unattended)
	}

	// 8. Test Object Removal endpoint
	w = sendReq("GET", "/api/cameras/1/isapi/object-removal", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("Object removal endpoint failed with code %d: %s", w.Code, w.Body.String())
	}
	var removal hikvision.ObjectRemoval
	if err := json.NewDecoder(w.Body).Decode(&removal); err != nil {
		t.Fatalf("Failed to decode object removal: %v", err)
	}
	if !removal.Enabled || removal.Sensitivity != 75 || removal.TimeThreshold != 18 {
		t.Errorf("Unexpected object removal settings: %+v", removal)
	}

	// 9. Test Privacy Mask endpoint
	w = sendReq("GET", "/api/cameras/1/isapi/privacy-mask", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("Privacy mask endpoint failed with code %d: %s", w.Code, w.Body.String())
	}
	var mask hikvision.PrivacyMask
	if err := json.NewDecoder(w.Body).Decode(&mask); err != nil {
		t.Fatalf("Failed to decode privacy mask: %v", err)
	}
	if !mask.Enabled || len(mask.Regions) != 1 {
		t.Errorf("Unexpected privacy mask: %+v", mask)
	}

	// Test PUT Privacy Mask
	putBody, _ := json.Marshal(mask)
	w = sendReq("PUT", "/api/cameras/1/isapi/privacy-mask", putBody)
	if w.Code != http.StatusOK {
		t.Fatalf("PUT privacy mask failed with code %d: %s", w.Code, w.Body.String())
	}
}
