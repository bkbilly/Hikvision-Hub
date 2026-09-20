package api

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/bkbilly/hikvision-hub/pkg/db"
	"github.com/bkbilly/hikvision-hub/pkg/hikvision"
	"github.com/bkbilly/hikvision-hub/pkg/models"
	"github.com/go-chi/chi/v5"
)

type ISAPIHandler struct {
	db        *db.DB
	camClient *hikvision.CameraClient
}

func NewISAPIHandler(db *db.DB, camClient *hikvision.CameraClient) *ISAPIHandler {
	return &ISAPIHandler{
		db:        db,
		camClient: camClient,
	}
}

func (h *ISAPIHandler) getCamera(r *http.Request) (*models.Camera, error) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		return nil, fmt.Errorf("invalid camera ID")
	}

	cam, err := h.db.GetCamera(id)
	if err != nil {
		return nil, fmt.Errorf("camera not found")
	}

	if cam.IP == "" {
		return nil, fmt.Errorf("camera has no IP configured")
	}

	return cam, nil
}

// GetCapabilities returns the full feature support matrix and current status of the camera.
func (h *ISAPIHandler) GetCapabilities(w http.ResponseWriter, r *http.Request) {
	cam, err := h.getCamera(r)
	if err != nil {
		writeJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	caps, err := h.camClient.ProbeCapabilities(cam.IP, cam.Username, cam.Password)
	if err != nil {
		writeJSONError(w, "Failed to probe camera capabilities: "+err.Error(), http.StatusBadGateway)
		return
	}

	writeJSON(w, http.StatusOK, caps)
}

// GetDeviceInfo returns hardware and firmware details.
func (h *ISAPIHandler) GetDeviceInfo(w http.ResponseWriter, r *http.Request) {
	cam, err := h.getCamera(r)
	if err != nil {
		writeJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	info, err := h.camClient.GetDeviceInfo(cam.IP, cam.Username, cam.Password)
	if err != nil {
		writeJSONError(w, "Failed to get device info: "+err.Error(), http.StatusBadGateway)
		return
	}

	writeJSON(w, http.StatusOK, info)
}

// GetTime returns camera clock and timezone.
func (h *ISAPIHandler) GetTime(w http.ResponseWriter, r *http.Request) {
	cam, err := h.getCamera(r)
	if err != nil {
		writeJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	t, err := h.camClient.GetTime(cam.IP, cam.Username, cam.Password)
	if err != nil {
		writeJSONError(w, "Failed to get camera time: "+err.Error(), http.StatusBadGateway)
		return
	}

	writeJSON(w, http.StatusOK, t)
}

// SetTime updates camera clock and timezone.
func (h *ISAPIHandler) SetTime(w http.ResponseWriter, r *http.Request) {
	cam, err := h.getCamera(r)
	if err != nil {
		writeJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	var req hikvision.DeviceTime
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if err := h.camClient.SetTime(cam.IP, cam.Username, cam.Password, req); err != nil {
		writeJSONError(w, "Failed to set time: "+err.Error(), http.StatusBadGateway)
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "message": "Time updated successfully"})
}

type SyncTimeRequest struct {
	ClientTime string `json:"client_time"` // e.g. "2026-09-19T16:00:00"
	Timezone   string `json:"timezone"`    // e.g. "CST-2:00:00"
}

// SyncTime synchronizes camera clock to client / browser time.
func (h *ISAPIHandler) SyncTime(w http.ResponseWriter, r *http.Request) {
	cam, err := h.getCamera(r)
	if err != nil {
		writeJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	var req SyncTimeRequest
	_ = json.NewDecoder(r.Body).Decode(&req)

	targetTime := time.Now()
	if req.ClientTime != "" {
		if parsed, err := time.Parse("2006-01-02T15:04:05", req.ClientTime); err == nil {
			targetTime = parsed
		}
	}

	if err := h.camClient.SyncTimeToCurrent(cam.IP, cam.Username, cam.Password, targetTime, req.Timezone); err != nil {
		writeJSONError(w, "Failed to sync camera time: "+err.Error(), http.StatusBadGateway)
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success":     true,
		"message":     "Camera time synchronized successfully",
		"synced_time": targetTime.Format("2006-01-02T15:04:05"),
	})
}

// GetNTP returns NTP server settings.
func (h *ISAPIHandler) GetNTP(w http.ResponseWriter, r *http.Request) {
	cam, err := h.getCamera(r)
	if err != nil {
		writeJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	ntp, err := h.camClient.GetNTP(cam.IP, cam.Username, cam.Password)
	if err != nil {
		writeJSONError(w, "Failed to get NTP settings: "+err.Error(), http.StatusBadGateway)
		return
	}

	writeJSON(w, http.StatusOK, ntp)
}

// SetNTP updates NTP server settings.
func (h *ISAPIHandler) SetNTP(w http.ResponseWriter, r *http.Request) {
	cam, err := h.getCamera(r)
	if err != nil {
		writeJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	var req hikvision.NTPServer
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if err := h.camClient.SetNTP(cam.IP, cam.Username, cam.Password, req); err != nil {
		writeJSONError(w, "Failed to set NTP settings: "+err.Error(), http.StatusBadGateway)
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "message": "NTP configuration updated"})
}

// GetImage returns image brightness, contrast, saturation, sharpness, IR filter, WDR, flip.
func (h *ISAPIHandler) GetImage(w http.ResponseWriter, r *http.Request) {
	cam, err := h.getCamera(r)
	if err != nil {
		writeJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	channelID := 1
	if chStr := r.URL.Query().Get("channel"); chStr != "" {
		if ch, err := strconv.Atoi(chStr); err == nil && ch > 0 {
			channelID = ch
		}
	}

	img, err := h.camClient.GetImageSettings(cam.IP, cam.Username, cam.Password, channelID)
	if err != nil {
		writeJSONError(w, "Failed to get image settings: "+err.Error(), http.StatusBadGateway)
		return
	}

	writeJSON(w, http.StatusOK, img)
}

// SetImage updates image display and exposure adjustments.
func (h *ISAPIHandler) SetImage(w http.ResponseWriter, r *http.Request) {
	cam, err := h.getCamera(r)
	if err != nil {
		writeJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	var req hikvision.ImageSettings
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	channelID := req.ChannelID
	if channelID <= 0 {
		channelID = 1
	}

	if err := h.camClient.SetImageSettings(cam.IP, cam.Username, cam.Password, channelID, req); err != nil {
		writeJSONError(w, "Failed to update image settings: "+err.Error(), http.StatusBadGateway)
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "message": "Image settings updated"})
}

// GetStream returns stream settings for channel 101 (Main) or 102 (Sub).
func (h *ISAPIHandler) GetStream(w http.ResponseWriter, r *http.Request) {
	cam, err := h.getCamera(r)
	if err != nil {
		writeJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	chStr := chi.URLParam(r, "channel")
	channelID, _ := strconv.Atoi(chStr)
	if channelID <= 0 {
		channelID = 101
	}

	stream, err := h.camClient.GetStreamSettings(cam.IP, cam.Username, cam.Password, channelID)
	if err != nil {
		writeJSONError(w, fmt.Sprintf("Failed to get stream %d settings: %v", channelID, err), http.StatusBadGateway)
		return
	}

	writeJSON(w, http.StatusOK, stream)
}

// SetStream updates stream settings for channel 101/102.
func (h *ISAPIHandler) SetStream(w http.ResponseWriter, r *http.Request) {
	cam, err := h.getCamera(r)
	if err != nil {
		writeJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	chStr := chi.URLParam(r, "channel")
	channelID, _ := strconv.Atoi(chStr)
	if channelID <= 0 {
		channelID = 101
	}

	var req hikvision.StreamSettings
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if err := h.camClient.SetStreamSettings(cam.IP, cam.Username, cam.Password, channelID, req); err != nil {
		writeJSONError(w, fmt.Sprintf("Failed to update stream %d settings: %v", channelID, err), http.StatusBadGateway)
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "message": fmt.Sprintf("Stream %d settings updated", channelID)})
}

// GetMotion returns motion detection configuration.
func (h *ISAPIHandler) GetMotion(w http.ResponseWriter, r *http.Request) {
	cam, err := h.getCamera(r)
	if err != nil {
		writeJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	motion, err := h.camClient.GetMotionDetection(cam.IP, cam.Username, cam.Password, 1)
	if err != nil {
		writeJSONError(w, "Failed to get motion detection: "+err.Error(), http.StatusBadGateway)
		return
	}

	writeJSON(w, http.StatusOK, motion)
}

// SetMotion updates motion detection configuration.
func (h *ISAPIHandler) SetMotion(w http.ResponseWriter, r *http.Request) {
	cam, err := h.getCamera(r)
	if err != nil {
		writeJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	var req hikvision.MotionDetection
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if err := h.camClient.SetMotionDetection(cam.IP, cam.Username, cam.Password, 1, req); err != nil {
		writeJSONError(w, "Failed to set motion detection: "+err.Error(), http.StatusBadGateway)
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "message": "Motion detection settings updated"})
}

// GetLineDetection returns Line Crossing VCA detection configuration.
func (h *ISAPIHandler) GetLineDetection(w http.ResponseWriter, r *http.Request) {
	cam, err := h.getCamera(r)
	if err != nil {
		writeJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	line, err := h.camClient.GetLineDetection(cam.IP, cam.Username, cam.Password, 1)
	if err != nil {
		writeJSONError(w, "Failed to get line detection: "+err.Error(), http.StatusBadGateway)
		return
	}

	writeJSON(w, http.StatusOK, line)
}

// SetLineDetection updates Line Crossing VCA detection configuration.
func (h *ISAPIHandler) SetLineDetection(w http.ResponseWriter, r *http.Request) {
	cam, err := h.getCamera(r)
	if err != nil {
		writeJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	var req hikvision.LineDetection
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if err := h.camClient.SetLineDetection(cam.IP, cam.Username, cam.Password, 1, req); err != nil {
		writeJSONError(w, "Failed to set line detection: "+err.Error(), http.StatusBadGateway)
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "message": "Line detection settings updated"})
}

// GetIntrusion returns Intrusion / Region Entrance detection configuration.
func (h *ISAPIHandler) GetIntrusion(w http.ResponseWriter, r *http.Request) {
	cam, err := h.getCamera(r)
	if err != nil {
		writeJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	intrusion, err := h.camClient.GetIntrusionDetection(cam.IP, cam.Username, cam.Password, 1)
	if err != nil {
		writeJSONError(w, "Failed to get intrusion detection: "+err.Error(), http.StatusBadGateway)
		return
	}

	writeJSON(w, http.StatusOK, intrusion)
}

// SetIntrusion updates Intrusion detection configuration.
func (h *ISAPIHandler) SetIntrusion(w http.ResponseWriter, r *http.Request) {
	cam, err := h.getCamera(r)
	if err != nil {
		writeJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	var req hikvision.FieldDetection
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if err := h.camClient.SetIntrusionDetection(cam.IP, cam.Username, cam.Password, 1, req); err != nil {
		writeJSONError(w, "Failed to set intrusion detection: "+err.Error(), http.StatusBadGateway)
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "message": "Intrusion detection settings updated"})
}

// GetRegionEntrance returns Region Entrance detection configuration.
func (h *ISAPIHandler) GetRegionEntrance(w http.ResponseWriter, r *http.Request) {
	cam, err := h.getCamera(r)
	if err != nil {
		writeJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	entrance, err := h.camClient.GetRegionEntrance(cam.IP, cam.Username, cam.Password, 1)
	if err != nil {
		writeJSONError(w, "Failed to get region entrance: "+err.Error(), http.StatusBadGateway)
		return
	}

	writeJSON(w, http.StatusOK, entrance)
}

// SetRegionEntrance updates Region Entrance detection configuration.
func (h *ISAPIHandler) SetRegionEntrance(w http.ResponseWriter, r *http.Request) {
	cam, err := h.getCamera(r)
	if err != nil {
		writeJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	var req hikvision.RegionEntrance
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if err := h.camClient.SetRegionEntrance(cam.IP, cam.Username, cam.Password, 1, req); err != nil {
		writeJSONError(w, "Failed to set region entrance: "+err.Error(), http.StatusBadGateway)
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "message": "Region entrance settings updated"})
}

// GetRegionExiting returns Region Exiting detection configuration.
func (h *ISAPIHandler) GetRegionExiting(w http.ResponseWriter, r *http.Request) {
	cam, err := h.getCamera(r)
	if err != nil {
		writeJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	exiting, err := h.camClient.GetRegionExiting(cam.IP, cam.Username, cam.Password, 1)
	if err != nil {
		writeJSONError(w, "Failed to get region exiting: "+err.Error(), http.StatusBadGateway)
		return
	}

	writeJSON(w, http.StatusOK, exiting)
}

// SetRegionExiting updates Region Exiting detection configuration.
func (h *ISAPIHandler) SetRegionExiting(w http.ResponseWriter, r *http.Request) {
	cam, err := h.getCamera(r)
	if err != nil {
		writeJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	var req hikvision.RegionExiting
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if err := h.camClient.SetRegionExiting(cam.IP, cam.Username, cam.Password, 1, req); err != nil {
		writeJSONError(w, "Failed to set region exiting: "+err.Error(), http.StatusBadGateway)
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "message": "Region exiting settings updated"})
}

// GetTamper returns Tamper detection configuration.
func (h *ISAPIHandler) GetTamper(w http.ResponseWriter, r *http.Request) {
	cam, err := h.getCamera(r)
	if err != nil {
		writeJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	tamper, err := h.camClient.GetTamperDetection(cam.IP, cam.Username, cam.Password, 1)
	if err != nil {
		writeJSONError(w, "Failed to get tamper detection: "+err.Error(), http.StatusBadGateway)
		return
	}

	writeJSON(w, http.StatusOK, tamper)
}

// SetTamper updates Tamper detection configuration.
func (h *ISAPIHandler) SetTamper(w http.ResponseWriter, r *http.Request) {
	cam, err := h.getCamera(r)
	if err != nil {
		writeJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	var req hikvision.TamperDetection
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if err := h.camClient.SetTamperDetection(cam.IP, cam.Username, cam.Password, 1, req); err != nil {
		writeJSONError(w, "Failed to set tamper detection: "+err.Error(), http.StatusBadGateway)
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "message": "Tamper detection settings updated"})
}

// GetPrivacyMask returns Privacy Mask configuration.
func (h *ISAPIHandler) GetPrivacyMask(w http.ResponseWriter, r *http.Request) {
	cam, err := h.getCamera(r)
	if err != nil {
		writeJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	mask, err := h.camClient.GetPrivacyMask(cam.IP, cam.Username, cam.Password, 1)
	if err != nil {
		writeJSONError(w, "Failed to get privacy mask: "+err.Error(), http.StatusBadGateway)
		return
	}

	writeJSON(w, http.StatusOK, mask)
}

// SetPrivacyMask updates Privacy Mask configuration.
func (h *ISAPIHandler) SetPrivacyMask(w http.ResponseWriter, r *http.Request) {
	cam, err := h.getCamera(r)
	if err != nil {
		writeJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	var req hikvision.PrivacyMask
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if err := h.camClient.SetPrivacyMask(cam.IP, cam.Username, cam.Password, 1, req); err != nil {
		writeJSONError(w, "Failed to set privacy mask: "+err.Error(), http.StatusBadGateway)
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "message": "Privacy mask settings updated"})
}

// GetUnattendedBaggage returns Unattended Baggage smart detection configuration.
func (h *ISAPIHandler) GetUnattendedBaggage(w http.ResponseWriter, r *http.Request) {
	cam, err := h.getCamera(r)
	if err != nil {
		writeJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	ub, err := h.camClient.GetUnattendedBaggage(cam.IP, cam.Username, cam.Password, 1)
	if err != nil {
		writeJSONError(w, "Failed to get unattended baggage: "+err.Error(), http.StatusBadGateway)
		return
	}

	writeJSON(w, http.StatusOK, ub)
}

// SetUnattendedBaggage updates Unattended Baggage smart detection configuration.
func (h *ISAPIHandler) SetUnattendedBaggage(w http.ResponseWriter, r *http.Request) {
	cam, err := h.getCamera(r)
	if err != nil {
		writeJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	var req hikvision.UnattendedBaggage
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if err := h.camClient.SetUnattendedBaggage(cam.IP, cam.Username, cam.Password, 1, req); err != nil {
		writeJSONError(w, "Failed to set unattended baggage: "+err.Error(), http.StatusBadGateway)
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "message": "Unattended baggage settings updated"})
}

// GetObjectRemoval returns Object Removal smart detection configuration.
func (h *ISAPIHandler) GetObjectRemoval(w http.ResponseWriter, r *http.Request) {
	cam, err := h.getCamera(r)
	if err != nil {
		writeJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	or, err := h.camClient.GetObjectRemoval(cam.IP, cam.Username, cam.Password, 1)
	if err != nil {
		writeJSONError(w, "Failed to get object removal: "+err.Error(), http.StatusBadGateway)
		return
	}

	writeJSON(w, http.StatusOK, or)
}

// SetObjectRemoval updates Object Removal smart detection configuration.
func (h *ISAPIHandler) SetObjectRemoval(w http.ResponseWriter, r *http.Request) {
	cam, err := h.getCamera(r)
	if err != nil {
		writeJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	var req hikvision.ObjectRemoval
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if err := h.camClient.SetObjectRemoval(cam.IP, cam.Username, cam.Password, 1, req); err != nil {
		writeJSONError(w, "Failed to set object removal: "+err.Error(), http.StatusBadGateway)
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "message": "Object removal settings updated"})
}

// GetStorage returns SD card / HDD storage volumes on the camera.
func (h *ISAPIHandler) GetStorage(w http.ResponseWriter, r *http.Request) {
	cam, err := h.getCamera(r)
	if err != nil {
		writeJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	storage, err := h.camClient.GetStorageInfo(cam.IP, cam.Username, cam.Password)
	if err != nil || storage == nil {
		// If camera has no SD card/HDD or endpoint not supported, return empty list gracefully
		writeJSON(w, http.StatusOK, []hikvision.HddInfo{})
		return
	}

	writeJSON(w, http.StatusOK, storage)
}

// FormatStorage formats an SD card or HDD on the camera.
func (h *ISAPIHandler) FormatStorage(w http.ResponseWriter, r *http.Request) {
	cam, err := h.getCamera(r)
	if err != nil {
		writeJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	hddStr := chi.URLParam(r, "hddId")
	hddID, _ := strconv.Atoi(hddStr)
	if hddID <= 0 {
		hddID = 1
	}

	if err := h.camClient.FormatStorage(cam.IP, cam.Username, cam.Password, hddID); err != nil {
		writeJSONError(w, fmt.Sprintf("Failed to format storage %d: %v", hddID, err), http.StatusBadGateway)
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "message": fmt.Sprintf("Storage volume %d format command initiated", hddID)})
}

// Reboot sends a reboot signal to the camera hardware.
func (h *ISAPIHandler) Reboot(w http.ResponseWriter, r *http.Request) {
	cam, err := h.getCamera(r)
	if err != nil {
		writeJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := h.camClient.RebootDevice(cam.IP, cam.Username, cam.Password); err != nil {
		writeJSONError(w, "Failed to reboot camera: "+err.Error(), http.StatusBadGateway)
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "message": "Camera reboot command issued successfully. Device is restarting."})
}

type PTZControlRequest struct {
	Pan  int `json:"pan"`
	Tilt int `json:"tilt"`
	Zoom int `json:"zoom"`
}

// PTZControl controls PTZ pan/tilt/zoom movement.
func (h *ISAPIHandler) PTZControl(w http.ResponseWriter, r *http.Request) {
	cam, err := h.getCamera(r)
	if err != nil {
		writeJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	var req PTZControlRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if err := h.camClient.PTZContinuous(cam.IP, cam.Username, cam.Password, 1, req.Pan, req.Tilt, req.Zoom); err != nil {
		writeJSONError(w, "PTZ command failed: "+err.Error(), http.StatusBadGateway)
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

// GetPTZPresets returns list of saved PTZ presets.
func (h *ISAPIHandler) GetPTZPresets(w http.ResponseWriter, r *http.Request) {
	cam, err := h.getCamera(r)
	if err != nil {
		writeJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	presets, err := h.camClient.GetPTZPresets(cam.IP, cam.Username, cam.Password, 1)
	if err != nil || presets == nil {
		writeJSON(w, http.StatusOK, []hikvision.PTZPreset{})
		return
	}

	writeJSON(w, http.StatusOK, presets)
}

type PTZGotoRequest struct {
	PresetID int `json:"preset_id"`
}

// PTZGoto navigates camera to a preset.
func (h *ISAPIHandler) PTZGoto(w http.ResponseWriter, r *http.Request) {
	cam, err := h.getCamera(r)
	if err != nil {
		writeJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	var req PTZGotoRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if err := h.camClient.PTZPresetGoto(cam.IP, cam.Username, cam.Password, 1, req.PresetID); err != nil {
		writeJSONError(w, "PTZ goto failed: "+err.Error(), http.StatusBadGateway)
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

// Proxy allows arbitrary raw ISAPI requests to the camera.
func (h *ISAPIHandler) Proxy(w http.ResponseWriter, r *http.Request) {
	cam, err := h.getCamera(r)
	if err != nil {
		writeJSONError(w, err.Error(), http.StatusBadRequest)
		return
	}

	path := r.URL.Query().Get("path")
	if path == "" {
		writeJSONError(w, "Path query parameter is required (e.g. ?path=/ISAPI/System/deviceInfo)", http.StatusBadRequest)
		return
	}

	body, _ := io.ReadAll(r.Body)
	contentType := r.Header.Get("Content-Type")

	data, respContentType, statusCode, err := h.camClient.ProxyISAPI(cam.IP, cam.Username, cam.Password, r.Method, path, body, contentType)
	if err != nil && len(data) == 0 {
		writeJSONError(w, "Proxy error: "+err.Error(), http.StatusBadGateway)
		return
	}

	if respContentType == "" {
		respContentType = "application/xml"
	}

	w.Header().Set("Content-Type", respContentType)
	w.WriteHeader(statusCode)
	_, _ = w.Write(data)
}
