package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"github.com/bkbilly/hikvision-hub/pkg/db"
	"github.com/bkbilly/hikvision-hub/pkg/hikvision"
	"github.com/bkbilly/hikvision-hub/pkg/models"
	"github.com/go-chi/chi/v5"
)

type CameraHandler struct {
	db           *db.DB
	camClient    *hikvision.CameraClient
	crawler      *hikvision.Crawler
	alertManager *hikvision.AlertStreamManager
}

func NewCameraHandler(db *db.DB, camClient *hikvision.CameraClient, crawler *hikvision.Crawler, alertManager *hikvision.AlertStreamManager) *CameraHandler {
	return &CameraHandler{
		db:           db,
		camClient:    camClient,
		crawler:      crawler,
		alertManager: alertManager,
	}
}

func (h *CameraHandler) syncAlerts() {
	if h.alertManager == nil {
		return
	}
	cams, err := h.db.ListCameras()
	if err == nil {
		h.alertManager.SyncCameras(cams)
	}
}

func (h *CameraHandler) List(w http.ResponseWriter, r *http.Request) {
	cameras, err := h.db.ListCameras()
	if err != nil {
		writeJSONError(w, "Failed to list cameras: "+err.Error(), http.StatusInternalServerError)
		return
	}

	publicList := make([]models.CameraPublic, len(cameras))
	for i, c := range cameras {
		publicList[i] = c.ToPublic()
	}

	writeJSON(w, http.StatusOK, publicList)
}

func (h *CameraHandler) Get(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeJSONError(w, "Invalid camera ID", http.StatusBadRequest)
		return
	}

	cam, err := h.db.GetCamera(id)
	if err != nil {
		writeJSONError(w, "Camera not found", http.StatusNotFound)
		return
	}

	writeJSON(w, http.StatusOK, cam.ToPublic())
}

type CreateCameraRequest struct {
	Name      string `json:"name"`
	Path      string `json:"path"`
	IP        string `json:"ip"`
	Username  string `json:"username"`
	Password  string `json:"password"`
	IsISAPI   bool   `json:"is_isapi"`
	Enabled   bool   `json:"enabled"`
	SortOrder int    `json:"sort_order"`
}

func (h *CameraHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req CreateCameraRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		writeJSONError(w, "Camera name is required", http.StatusBadRequest)
		return
	}

	cam := &models.Camera{
		Name:      req.Name,
		Path:      strings.TrimSpace(req.Path),
		IP:        strings.TrimSpace(req.IP),
		Username:  strings.TrimSpace(req.Username),
		Password:  req.Password,
		IsISAPI:   req.IsISAPI,
		Enabled:   req.Enabled,
		SortOrder: req.SortOrder,
	}

	if cam.IP != "" && cam.Username != "" {
		hasIn, hasOut, _ := h.camClient.DetectAudioCapabilities(cam.IP, cam.Username, cam.Password, cam.IsISAPI)
		cam.HasAudioInput = hasIn
		cam.HasAudioOutput = hasOut
		hasSub, _ := h.camClient.DetectStreamCapabilities(cam.IP, cam.Username, cam.Password, cam.IsISAPI)
		cam.HasSubStream = hasSub
	}

	if err := h.db.CreateCamera(cam); err != nil {
		writeJSONError(w, "Failed to create camera: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Trigger background sync for this camera
	go func() {
		if cam.Enabled && cam.Path != "" {
			_, _ = h.crawler.SyncCamera(*cam)
		}
		h.syncAlerts()
	}()

	writeJSON(w, http.StatusCreated, cam.ToPublic())
}

func (h *CameraHandler) Update(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeJSONError(w, "Invalid camera ID", http.StatusBadRequest)
		return
	}

	var req CreateCameraRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	cam, err := h.db.GetCamera(id)
	if err != nil {
		writeJSONError(w, "Camera not found", http.StatusNotFound)
		return
	}

	cam.Name = strings.TrimSpace(req.Name)
	cam.Path = strings.TrimSpace(req.Path)
	cam.IP = strings.TrimSpace(req.IP)
	cam.Username = strings.TrimSpace(req.Username)
	if req.Password != "" {
		cam.Password = req.Password
	}
	cam.IsISAPI = req.IsISAPI
	cam.Enabled = req.Enabled
	cam.SortOrder = req.SortOrder

	if cam.IP != "" && cam.Username != "" {
		hasIn, hasOut, _ := h.camClient.DetectAudioCapabilities(cam.IP, cam.Username, cam.Password, cam.IsISAPI)
		cam.HasAudioInput = hasIn
		cam.HasAudioOutput = hasOut
		hasSub, _ := h.camClient.DetectStreamCapabilities(cam.IP, cam.Username, cam.Password, cam.IsISAPI)
		cam.HasSubStream = hasSub
	}

	if err := h.db.UpdateCamera(cam); err != nil {
		writeJSONError(w, "Failed to update camera: "+err.Error(), http.StatusInternalServerError)
		return
	}

	go func() {
		if cam.Enabled && cam.Path != "" {
			_, _ = h.crawler.SyncCamera(*cam)
		}
		h.syncAlerts()
	}()

	writeJSON(w, http.StatusOK, cam.ToPublic())
}

func (h *CameraHandler) Delete(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeJSONError(w, "Invalid camera ID", http.StatusBadRequest)
		return
	}

	if err := h.db.DeleteCamera(id); err != nil {
		writeJSONError(w, "Failed to delete camera: "+err.Error(), http.StatusInternalServerError)
		return
	}

	go h.syncAlerts()

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

type ReorderCamerasRequest struct {
	CameraIDs []int64 `json:"camera_ids"`
}

func (h *CameraHandler) Reorder(w http.ResponseWriter, r *http.Request) {
	var req ReorderCamerasRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if err := h.db.ReorderCameras(req.CameraIDs); err != nil {
		writeJSONError(w, "Failed to reorder cameras: "+err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

type TestConnectionRequest struct {
	IP       string `json:"ip"`
	Username string `json:"username"`
	Password string `json:"password"`
	IsISAPI  bool   `json:"is_isapi"`
	CameraID *int64 `json:"camera_id,omitempty"`
}

func (h *CameraHandler) TestConnection(w http.ResponseWriter, r *http.Request) {
	var req TestConnectionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// If camera_id is provided and password is empty, lookup existing password
	if req.CameraID != nil && *req.CameraID > 0 && req.Password == "" {
		existing, err := h.db.GetCamera(*req.CameraID)
		if err == nil {
			if req.IP == "" {
				req.IP = existing.IP
			}
			if req.Username == "" {
				req.Username = existing.Username
			}
			req.Password = existing.Password
			req.IsISAPI = existing.IsISAPI
		}
	}

	if req.IP == "" {
		writeJSONError(w, "Camera IP is required", http.StatusBadRequest)
		return
	}

	isISAPI, msg, err := h.camClient.TestConnection(req.IP, req.Username, req.Password)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	hasIn, hasOut, _ := h.camClient.DetectAudioCapabilities(req.IP, req.Username, req.Password, isISAPI)
	hasSub, _ := h.camClient.DetectStreamCapabilities(req.IP, req.Username, req.Password, isISAPI)
	if req.CameraID != nil && *req.CameraID > 0 {
		_ = h.db.UpdateCameraAudioCapabilities(*req.CameraID, hasIn, hasOut)
		_ = h.db.UpdateCameraStreamCapabilities(*req.CameraID, hasSub)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success":          true,
		"message":          msg,
		"is_isapi":         isISAPI,
		"has_audio_input":  hasIn,
		"has_audio_output": hasOut,
		"has_sub_stream":   hasSub,
	})
}

func (h *CameraHandler) Snapshot(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeJSONError(w, "Invalid camera ID", http.StatusBadRequest)
		return
	}

	cam, err := h.db.GetCamera(id)
	if err != nil {
		writeJSONError(w, "Camera not found", http.StatusNotFound)
		return
	}

	if cam.IP == "" {
		writeJSONError(w, "Camera has no IP configured", http.StatusBadRequest)
		return
	}

	data, err := h.camClient.FetchSnapshot(cam.IP, cam.Username, cam.Password, cam.IsISAPI)
	if err != nil {
		writeJSONError(w, fmt.Sprintf("Failed to fetch snapshot from %s: %v", cam.IP, err), http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

// GetLiveRTSPCandidates returns candidate RTSP URLs for a camera based on requested stream number and capability.
// requestedStream: 1 (main / quality) or 2 (sub / speed).
func GetLiveRTSPCandidates(cam *models.Camera, requestedStream int) (candidates []string, isHighQuality bool) {
	userEsc := url.QueryEscape(cam.Username)
	passEsc := url.QueryEscape(cam.Password)

	targetStream := requestedStream
	if targetStream == 2 && !cam.HasSubStream {
		targetStream = 1
	}
	if targetStream != 1 && targetStream != 2 {
		targetStream = 2
		if !cam.HasSubStream {
			targetStream = 1
		}
	}

	if targetStream == 1 {
		// Quality stream: Channel 101 / main stream first
		if cam.IsISAPI {
			candidates = []string{
				fmt.Sprintf("rtsp://%s:%s@%s:554/Streaming/Channels/101", userEsc, passEsc, cam.IP),
				fmt.Sprintf("rtsp://%s:%s@%s:554/h264/ch1/main/av_stream", userEsc, passEsc, cam.IP),
				fmt.Sprintf("rtsp://%s:%s@%s:554/Streaming/Channels/102", userEsc, passEsc, cam.IP),
			}
		} else {
			candidates = []string{
				fmt.Sprintf("rtsp://%s:%s@%s:554/Streaming/channels/101", userEsc, passEsc, cam.IP),
				fmt.Sprintf("rtsp://%s:%s@%s:554/h264/ch1/main/av_stream", userEsc, passEsc, cam.IP),
				fmt.Sprintf("rtsp://%s:%s@%s:554/Streaming/channels/102", userEsc, passEsc, cam.IP),
				fmt.Sprintf("rtsp://%s:%s@%s:554/Streaming/Channels/101", userEsc, passEsc, cam.IP),
			}
		}
		return candidates, true
	}

	// Speed stream: Channel 102 / sub stream first
	if cam.IsISAPI {
		candidates = []string{
			fmt.Sprintf("rtsp://%s:%s@%s:554/Streaming/Channels/102", userEsc, passEsc, cam.IP),
			fmt.Sprintf("rtsp://%s:%s@%s:554/h264/ch1/sub/av_stream", userEsc, passEsc, cam.IP),
			fmt.Sprintf("rtsp://%s:%s@%s:554/Streaming/Channels/101", userEsc, passEsc, cam.IP),
		}
	} else {
		candidates = []string{
			fmt.Sprintf("rtsp://%s:%s@%s:554/Streaming/channels/102", userEsc, passEsc, cam.IP),
			fmt.Sprintf("rtsp://%s:%s@%s:554/h264/ch1/sub/av_stream", userEsc, passEsc, cam.IP),
			fmt.Sprintf("rtsp://%s:%s@%s:554/Streaming/channels/101", userEsc, passEsc, cam.IP),
			fmt.Sprintf("rtsp://%s:%s@%s:554/Streaming/Channels/102", userEsc, passEsc, cam.IP),
		}
	}
	return candidates, false
}

func (h *CameraHandler) StreamLive(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeJSONError(w, "Invalid camera ID", http.StatusBadRequest)
		return
	}

	cam, err := h.db.GetCamera(id)
	if err != nil {
		writeJSONError(w, "Camera not found", http.StatusNotFound)
		return
	}

	if cam.IP == "" {
		writeJSONError(w, "Camera has no IP configured", http.StatusBadRequest)
		return
	}

	// Set headers for continuous multipart MJPEG stream
	w.Header().Set("Content-Type", "multipart/x-mixed-replace; boundary=ffserver")
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate, max-age=0")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")
	w.Header().Set("Connection", "close")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	flusher, isFlusher := w.(http.Flusher)
	if isFlusher {
		flusher.Flush()
	}

	ctx := r.Context()
	streamParam := r.URL.Query().Get("stream")
	requestedStream := 2
	if streamParam == "1" || streamParam == "main" || streamParam == "101" {
		requestedStream = 1
	} else if streamParam == "2" || streamParam == "sub" || streamParam == "102" {
		requestedStream = 2
	}

	rtspCandidates, isHQ := GetLiveRTSPCandidates(cam, requestedStream)
	qVal := "5"
	rVal := "10"
	if isHQ {
		qVal = "3"
		rVal = "15"
	}

	// Continuous persistent stream loop: keeps the HTTP stream alive even across camera re-negotiations
	for {
		if ctx.Err() != nil {
			return
		}

		streamedAny := false

		// 1. Try RTSP live streaming via FFmpeg with zero-latency bufferless flags
		for _, rtspURL := range rtspCandidates {
			if ctx.Err() != nil {
				return
			}

			cmdCtx, cancelCmd := context.WithCancel(ctx)
			cmd := exec.CommandContext(cmdCtx, "ffmpeg",
				"-hide_banner",
				"-loglevel", "error",
				"-rtsp_transport", "tcp",
				"-timeout", "5000000",
				"-fflags", "nobuffer",
				"-flags", "low_delay",
				"-probesize", "32768",
				"-analyzeduration", "0",
				"-i", rtspURL,
				"-an",
				"-c:v", "mjpeg",
				"-q:v", qVal,
				"-r", rVal,
				"-tune", "zerolatency",
				"-f", "mpjpeg",
				"-boundary_tag", "ffserver",
				"-",
			)

			stdout, err := cmd.StdoutPipe()
			if err != nil {
				cancelCmd()
				continue
			}

			if err := cmd.Start(); err != nil {
				cancelCmd()
				continue
			}

			n, _ := io.Copy(w, stdout)
			cancelCmd()
			if cmd.Process != nil {
				_ = cmd.Process.Kill()
			}
			_ = cmd.Wait()

			if ctx.Err() != nil {
				return
			}

			if n > 0 {
				streamedAny = true
				break
			}
		}

		// 2. Seamless fallback: stream snapshots if RTSP drops or fails, then retry RTSP
		if !streamedAny {
			ticker := time.NewTicker(250 * time.Millisecond)
			timeout := time.After(3 * time.Second)
			snapDone := false

			for !snapDone {
				select {
				case <-ctx.Done():
					ticker.Stop()
					return
				case <-timeout:
					ticker.Stop()
					snapDone = true
				case <-ticker.C:
					frame, err := h.camClient.FetchSnapshot(cam.IP, cam.Username, cam.Password, cam.IsISAPI)
					if err == nil && len(frame) > 0 {
						_, err := fmt.Fprintf(w, "--ffserver\r\nContent-Type: image/jpeg\r\nContent-Length: %d\r\n\r\n", len(frame))
						if err != nil {
							ticker.Stop()
							return
						}
						if _, err := w.Write(frame); err != nil {
							ticker.Stop()
							return
						}
						if _, err := w.Write([]byte("\r\n")); err != nil {
							ticker.Stop()
							return
						}
						if isFlusher {
							flusher.Flush()
						}
					}
				}
			}
		}
	}
}

type DiscoverPathRequest struct {
	Path string `json:"path"`
}

func (h *CameraHandler) DiscoverPath(w http.ResponseWriter, r *http.Request) {
	var req DiscoverPathRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	parser, err := hikvision.NewParser(0, req.Path)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"valid":   false,
			"message": err.Error(),
			"dirs":    []hikvision.DataDirInfo{},
		})
		return
	}

	dirs := parser.GetDataDirs()
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"valid":   len(dirs) > 0,
		"message": fmt.Sprintf("Found %d data directory/directories", len(dirs)),
		"dirs":    dirs,
	})
}

type DiscoveredCameraPublic struct {
	hikvision.DiscoveredDevice
	AlreadyAdded       bool   `json:"already_added"`
	ExistingCameraID   *int64 `json:"existing_camera_id,omitempty"`
	ExistingCameraName string `json:"existing_camera_name,omitempty"`
}

type CameraDiscoveryResponse struct {
	Cameras        []DiscoveredCameraPublic `json:"cameras"`
	AvailablePaths []string                 `json:"available_paths"`
}

func (h *CameraHandler) Discover(w http.ResponseWriter, r *http.Request) {
	devices, _ := hikvision.DiscoverDevices(2 * time.Second)

	cameras, _ := h.db.ListCameras()
	existingByIP := make(map[string]models.Camera)
	existingPaths := make([]string, 0, len(cameras))
	for _, c := range cameras {
		existingByIP[c.IP] = c
		if c.Path != "" {
			existingPaths = append(existingPaths, c.Path)
		}
	}

	publicList := make([]DiscoveredCameraPublic, 0, len(devices))
	for _, dev := range devices {
		item := DiscoveredCameraPublic{
			DiscoveredDevice: dev,
		}
		if existing, ok := existingByIP[dev.IP]; ok {
			item.AlreadyAdded = true
			camID := existing.ID
			item.ExistingCameraID = &camID
			item.ExistingCameraName = existing.Name
		}
		publicList = append(publicList, item)
	}

	availablePaths := hikvision.FindAvailableStoragePaths(existingPaths)
	if availablePaths == nil {
		availablePaths = []string{}
	}

	writeJSON(w, http.StatusOK, CameraDiscoveryResponse{
		Cameras:        publicList,
		AvailablePaths: availablePaths,
	})
}

type ProbeCameraRequest struct {
	IP       string `json:"ip"`
	Username string `json:"username"`
	Password string `json:"password"`
}

func (h *CameraHandler) Probe(w http.ResponseWriter, r *http.Request) {
	var req ProbeCameraRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	dev, err := hikvision.ProbeDeviceIP(req.IP, h.camClient, req.Username, req.Password)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	var (
		alreadyAdded       bool
		existingCameraID   *int64
		existingCameraName string
	)

	cameras, _ := h.db.ListCameras()
	for _, c := range cameras {
		if c.IP == dev.IP {
			alreadyAdded = true
			camID := c.ID
			existingCameraID = &camID
			existingCameraName = c.Name
			break
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success":              true,
		"device":               dev,
		"already_added":        alreadyAdded,
		"existing_camera_id":   existingCameraID,
		"existing_camera_name": existingCameraName,
	})
}

func (h *CameraHandler) DetectAudio(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeJSONError(w, "Invalid camera ID", http.StatusBadRequest)
		return
	}

	cam, err := h.db.GetCamera(id)
	if err != nil || cam == nil {
		writeJSONError(w, "Camera not found", http.StatusNotFound)
		return
	}

	hasIn, hasOut, err := h.camClient.DetectAudioCapabilities(cam.IP, cam.Username, cam.Password, cam.IsISAPI)
	if err != nil {
		writeJSONError(w, "Failed to detect audio capabilities: "+err.Error(), http.StatusInternalServerError)
		return
	}

	_ = h.db.UpdateCameraAudioCapabilities(cam.ID, hasIn, hasOut)
	hasSub, _ := h.camClient.DetectStreamCapabilities(cam.IP, cam.Username, cam.Password, cam.IsISAPI)
	_ = h.db.UpdateCameraStreamCapabilities(cam.ID, hasSub)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success":          true,
		"has_audio_input":  hasIn,
		"has_audio_output": hasOut,
		"has_sub_stream":   hasSub,
	})
}

func (h *CameraHandler) LiveAudio(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid camera ID", http.StatusBadRequest)
		return
	}

	cam, err := h.db.GetCamera(id)
	if err != nil || cam == nil {
		http.Error(w, "Camera not found", http.StatusNotFound)
		return
	}

	if cam.IP == "" {
		http.Error(w, "Camera IP not configured", http.StatusBadRequest)
		return
	}

	userEsc := url.QueryEscape(cam.Username)
	passEsc := url.QueryEscape(cam.Password)

	// Stream from mainstream first as channel 101 usually includes audio
	rtspCandidates := []string{
		fmt.Sprintf("rtsp://%s:%s@%s:554/Streaming/Channels/101", userEsc, passEsc, cam.IP),
		fmt.Sprintf("rtsp://%s:%s@%s:554/Streaming/channels/101", userEsc, passEsc, cam.IP),
		fmt.Sprintf("rtsp://%s:%s@%s:554/Streaming/Channels/102", userEsc, passEsc, cam.IP),
	}

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	w.Header().Set("Content-Type", "audio/mpeg")
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Connection", "keep-alive")

	flusher, canFlush := w.(http.Flusher)

	for _, rtspURL := range rtspCandidates {
		if ctx.Err() != nil {
			return
		}

		cmdCtx, cancelCmd := context.WithCancel(ctx)
		cmd := exec.CommandContext(cmdCtx, "ffmpeg",
			"-hide_banner",
			"-loglevel", "error",
			"-rtsp_transport", "tcp",
			"-timeout", "5000000",
			"-fflags", "nobuffer",
			"-flags", "low_delay",
			"-probesize", "32768",
			"-analyzeduration", "0",
			"-i", rtspURL,
			"-vn",
			"-c:a", "libmp3lame",
			"-b:a", "64k",
			"-f", "mp3",
			"-",
		)

		stdout, err := cmd.StdoutPipe()
		if err != nil {
			cancelCmd()
			continue
		}

		if err := cmd.Start(); err != nil {
			cancelCmd()
			continue
		}

		buf := make([]byte, 4096)
		streamedAny := false
		for {
			n, err := stdout.Read(buf)
			if n > 0 {
				streamedAny = true
				if _, writeErr := w.Write(buf[:n]); writeErr != nil {
					cancelCmd()
					_ = cmd.Wait()
					return
				}
				if canFlush {
					flusher.Flush()
				}
			}
			if err != nil {
				break
			}
		}

		cancelCmd()
		_ = cmd.Wait()

		if streamedAny {
			return
		}
	}
}

func (h *CameraHandler) Talk(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeJSONError(w, "Invalid camera ID", http.StatusBadRequest)
		return
	}

	cam, err := h.db.GetCamera(id)
	if err != nil || cam == nil {
		writeJSONError(w, "Camera not found", http.StatusNotFound)
		return
	}

	if cam.IP == "" {
		writeJSONError(w, "Camera IP not configured", http.StatusBadRequest)
		return
	}

	// Limit to max 5MB audio data
	r.Body = http.MaxBytesReader(w, r.Body, 5*1024*1024)
	inputAudio, err := io.ReadAll(r.Body)
	if err != nil {
		writeJSONError(w, "Failed to read audio data: "+err.Error(), http.StatusBadRequest)
		return
	}
	if len(inputAudio) == 0 {
		writeJSONError(w, "Audio data is empty", http.StatusBadRequest)
		return
	}

	// Transcode browser audio (WebM, WAV, OGG, PCM, etc.) to 8000Hz mono G.711 A-law using FFmpeg
	cmdCtx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	cmd := exec.CommandContext(cmdCtx, "ffmpeg",
		"-hide_banner",
		"-loglevel", "error",
		"-i", "pipe:0",
		"-ar", "8000",
		"-ac", "1",
		"-f", "alaw",
		"pipe:1",
	)
	cmd.Stdin = bytes.NewReader(inputAudio)
	var outBuf bytes.Buffer
	var errBuf bytes.Buffer
	cmd.Stdout = &outBuf
	cmd.Stderr = &errBuf

	if err := cmd.Run(); err != nil {
		writeJSONError(w, fmt.Sprintf("Failed to encode audio for camera: %v (%s)", err, errBuf.String()), http.StatusInternalServerError)
		return
	}

	alawBytes := outBuf.Bytes()
	if len(alawBytes) == 0 {
		writeJSONError(w, "Transcoded audio is empty", http.StatusInternalServerError)
		return
	}

	if err := h.camClient.SendTwoWayAudio(cam.IP, cam.Username, cam.Password, alawBytes); err != nil {
		writeJSONError(w, fmt.Sprintf("Failed to transmit voice to camera speaker: %v", err), http.StatusBadGateway)
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"bytes":   len(alawBytes),
		"samples": len(alawBytes),
	})
}


