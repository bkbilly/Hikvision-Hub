package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/bkbilly/hikvision-hub/pkg/db"
	"github.com/bkbilly/hikvision-hub/pkg/hikvision"
	"github.com/bkbilly/hikvision-hub/pkg/models"
)

func TestCameraDiscoverAndProbeEndpoints(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "api_cam_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	database, err := db.Open(filepath.Join(tempDir, "test.db"))
	if err != nil {
		t.Fatalf("Failed to open DB: %v", err)
	}
	defer database.Close()

	// Seed existing camera
	cam := &models.Camera{
		Name:     "Existing Cam",
		IP:       "192.168.2.170",
		Path:     filepath.Join(tempDir, "cam1", "info.bin"),
		Username: "admin",
		Enabled:  true,
	}
	if err := database.CreateCamera(cam); err != nil {
		t.Fatalf("Failed to create camera: %v", err)
	}

	camClient := hikvision.NewCameraClient()
	handler := NewCameraHandler(database, camClient, nil, nil)

	// Test Discover endpoint
	req := httptest.NewRequest("GET", "/api/cameras/discover", nil)
	rec := httptest.NewRecorder()
	handler.Discover(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK from discover, got %d: %s", rec.Code, rec.Body.String())
	}

	var discResp CameraDiscoveryResponse
	if err := json.NewDecoder(rec.Body).Decode(&discResp); err != nil {
		t.Fatalf("failed to decode discover response: %v", err)
	}

	// Test Probe with an invalid or unreachable IP (should return success: false or not found gracefully)
	probeReq := ProbeCameraRequest{
		IP:       "127.0.0.99",
		Username: "admin",
		Password: "password",
	}
	body, _ := json.Marshal(probeReq)
	req2 := httptest.NewRequest("POST", "/api/cameras/probe", bytes.NewReader(body))
	req2.Header.Set("Content-Type", "application/json")
	rec2 := httptest.NewRecorder()
	handler.Probe(rec2, req2)

	if rec2.Code != http.StatusOK {
		t.Fatalf("expected 200 status from probe, got %d", rec2.Code)
	}

	var probeResp map[string]interface{}
	if err := json.NewDecoder(rec2.Body).Decode(&probeResp); err != nil {
		t.Fatalf("failed to decode probe response: %v", err)
	}
	if probeResp["success"] != false {
		t.Fatalf("expected success: false for unreachable IP, got %v", probeResp["success"])
	}
}
