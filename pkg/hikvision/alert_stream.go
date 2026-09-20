package hikvision

import (
	"context"
	"encoding/xml"
	"fmt"
	"io"
	"log"
	"math"
	"mime"
	"mime/multipart"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/bkbilly/hikvision-hub/pkg/models"
)

// EventNotificationAlert models the XML payload sent by Hikvision /ISAPI/Event/notification/alertStream.
type EventNotificationAlert struct {
	XMLName          xml.Name `xml:"EventNotificationAlert"`
	IPAddress        string   `xml:"ipAddress"`
	PortNo           int      `xml:"portNo"`
	Protocol         string   `xml:"protocol"`
	MacAddress       string   `xml:"macAddress"`
	ChannelID        int      `xml:"channelID"`
	DateTime         string   `xml:"dateTime"`
	ActivePostCount  int      `xml:"activePostCount"`
	EventType        string   `xml:"eventType"`
	EventState       string   `xml:"eventState"`
	EventDescription string   `xml:"eventDescription"`
	ChannelName      string   `xml:"channelName"`
}

// NormalizeEventType maps Hikvision raw event codes to user-friendly types and labels.
func NormalizeEventType(raw string) (normalized string, label string) {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "vmd", "motiondetection":
		return "motion", "Motion Detection"
	case "linedetection":
		return "line_crossing", "Line Crossing"
	case "fielddetection":
		return "intrusion", "Intrusion Detection"
	case "shelteralarm":
		return "tamper", "Tamper Alarm"
	case "videoloss":
		return "videoloss", "Video Loss"
	case "regionentrance":
		return "region_entrance", "Region Entrance"
	case "regionexiting":
		return "region_exiting", "Region Exiting"
	case "unattendedbaggage":
		return "unattended_baggage", "Unattended Baggage"
	case "attendedbaggage":
		return "object_removal", "Object Removal"
	case "facedetection":
		return "face_detection", "Face Detection"
	case "scenechangedetection":
		return "scene_change", "Scene Change"
	case "pir":
		return "pir", "PIR Alarm"
	case "wlsensor":
		return "wireless_sensor", "Wireless Sensor"
	case "callsignal":
		return "doorbell_call", "Doorbell Call"
	case "defocus":
		return "defocus", "Defocus Alarm"
	case "audioexception":
		return "audio_exception", "Audio Exception"
	default:
		clean := strings.ToLower(strings.TrimSpace(raw))
		return clean, raw
	}
}

type activeEventTracker struct {
	Event    *models.CameraEvent
	LastSeen time.Time
}

// AlertStreamManager manages background alertStream connections to Hikvision cameras,
// tracks active and recent events, and broadcasts alerts via channel subscribers.
type AlertStreamManager struct {
	mu           sync.RWMutex
	cameras      map[int64]models.Camera
	cancelFuncs  map[int64]context.CancelFunc
	activeEvents map[int64]map[string]*activeEventTracker // [camID][normType] -> tracker
	recentEvents []*models.CameraEvent                    // Ordered list of recent events (newest first)
	maxRecent    int

	subMu       sync.RWMutex
	subscribers map[chan *models.CameraEvent]struct{}
	idleTimer   *time.Timer

	httpClient *http.Client
	ctx        context.Context
	cancel     context.CancelFunc
}

// NewAlertStreamManager creates a new AlertStreamManager instance.
func NewAlertStreamManager(maxRecent int) *AlertStreamManager {
	if maxRecent <= 0 {
		maxRecent = 300
	}
	return &AlertStreamManager{
		cameras:      make(map[int64]models.Camera),
		cancelFuncs:  make(map[int64]context.CancelFunc),
		activeEvents: make(map[int64]map[string]*activeEventTracker),
		recentEvents: make([]*models.CameraEvent, 0, maxRecent),
		maxRecent:    maxRecent,
		subscribers:  make(map[chan *models.CameraEvent]struct{}),
		httpClient: &http.Client{
			Timeout: 0, // Indefinite stream
		},
	}
}

// Start initializes the manager lifecycle and auto-clear timer.
// Note: Camera stream workers are NOT started eagerly; they only start on-demand when clients connect.
func (m *AlertStreamManager) Start(ctx context.Context, initialCameras []models.Camera) {
	m.mu.Lock()
	m.ctx, m.cancel = context.WithCancel(ctx)
	for _, c := range initialCameras {
		m.cameras[c.ID] = c
	}
	m.mu.Unlock()

	go m.runAutoClearLoop(m.ctx)
}

// Stop gracefully cancels all active alert streams.
func (m *AlertStreamManager) Stop() {
	m.subMu.Lock()
	if m.idleTimer != nil {
		m.idleTimer.Stop()
		m.idleTimer = nil
	}
	m.subMu.Unlock()

	m.mu.Lock()
	defer m.mu.Unlock()

	if m.cancel != nil {
		m.cancel()
	}
	for _, cancel := range m.cancelFuncs {
		cancel()
	}
	m.cancelFuncs = make(map[int64]context.CancelFunc)
}

// startWorkersLocked starts camera stream workers if not already running. (Must be called with m.mu held)
func (m *AlertStreamManager) startWorkersLocked() {
	if m.ctx == nil {
		return
	}
	activeCount := 0
	for _, c := range m.cameras {
		if !c.Enabled || c.IP == "" {
			continue
		}
		if _, running := m.cancelFuncs[c.ID]; !running {
			workerCtx, workerCancel := context.WithCancel(m.ctx)
			m.cancelFuncs[c.ID] = workerCancel

			log.Printf("[AlertStream] Starting on-demand alert stream for %q (%s)", c.Name, c.IP)
			go m.runCameraStream(workerCtx, c)
			activeCount++
		}
	}
	if activeCount > 0 {
		log.Printf("[AlertStream] Activated alert streams for %d camera(s) due to active viewer", activeCount)
	}
}

// stopWorkersLocked stops all camera stream workers to conserve resources. (Must be called with m.mu held)
func (m *AlertStreamManager) stopWorkersLocked() {
	if len(m.cancelFuncs) == 0 {
		return
	}
	log.Printf("[AlertStream] Stopping all camera alert streams (%d active) to conserve resources (no viewers connected)", len(m.cancelFuncs))
	for id, cancel := range m.cancelFuncs {
		cancel()
		delete(m.cancelFuncs, id)
	}
	// Clear any active trigger states
	m.activeEvents = make(map[int64]map[string]*activeEventTracker)
}

// SyncCameras synchronizes active alert stream workers with the current list of cameras.
func (m *AlertStreamManager) SyncCameras(cameras []models.Camera) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.cameras = make(map[int64]models.Camera)
	for _, c := range cameras {
		m.cameras[c.ID] = c
	}

	// Only adjust running workers if there are active subscribers
	m.subMu.RLock()
	hasSubscribers := len(m.subscribers) > 0
	m.subMu.RUnlock()

	if !hasSubscribers {
		// Ensure no workers are running when there are no subscribers
		for id, cancel := range m.cancelFuncs {
			cancel()
			delete(m.cancelFuncs, id)
		}
		return
	}

	// Stop workers for removed/disabled cameras
	camMap := m.cameras
	for id, cancel := range m.cancelFuncs {
		c, exists := camMap[id]
		if !exists || !c.Enabled || c.IP == "" {
			log.Printf("[AlertStream] Stopping alert stream worker for camera %d", id)
			cancel()
			delete(m.cancelFuncs, id)
		}
	}

	m.startWorkersLocked()
}

// GetRecentEvents returns a copy of recently recorded events (newest first).
func (m *AlertStreamManager) GetRecentEvents() []*models.CameraEvent {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]*models.CameraEvent, len(m.recentEvents))
	for i, e := range m.recentEvents {
		copied := *e
		result[i] = &copied
	}
	return result
}

// GetActiveEvents returns all currently active events across all cameras.
func (m *AlertStreamManager) GetActiveEvents() []*models.CameraEvent {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var result []*models.CameraEvent
	for _, trackerMap := range m.activeEvents {
		for _, t := range trackerMap {
			copied := *t.Event
			result = append(result, &copied)
		}
	}
	return result
}

// Subscribe registers a new subscriber channel for live events.
// Automatically starts camera alert stream workers if this is the first subscriber.
func (m *AlertStreamManager) Subscribe() chan *models.CameraEvent {
	m.subMu.Lock()
	defer m.subMu.Unlock()

	if m.idleTimer != nil {
		m.idleTimer.Stop()
		m.idleTimer = nil
	}

	ch := make(chan *models.CameraEvent, 64)
	m.subscribers[ch] = struct{}{}

	// If this is the first active subscriber, start camera streams on-demand
	m.mu.Lock()
	if len(m.cancelFuncs) == 0 {
		m.startWorkersLocked()
	}
	m.mu.Unlock()

	return ch
}

// Unsubscribe removes a subscriber channel.
// When the last subscriber disconnects, schedules camera stream shutdown after a short grace period.
func (m *AlertStreamManager) Unsubscribe(ch chan *models.CameraEvent) {
	m.subMu.Lock()
	defer m.subMu.Unlock()

	delete(m.subscribers, ch)
	close(ch)

	// If no subscribers remain, shut down camera alert streams after 5s grace period
	if len(m.subscribers) == 0 {
		if m.idleTimer != nil {
			m.idleTimer.Stop()
		}
		m.idleTimer = time.AfterFunc(5*time.Second, func() {
			m.subMu.Lock()
			defer m.subMu.Unlock()

			if len(m.subscribers) == 0 {
				m.mu.Lock()
				m.stopWorkersLocked()
				m.mu.Unlock()
			}
		})
	}
}

func (m *AlertStreamManager) broadcast(event *models.CameraEvent) {
	m.subMu.RLock()
	defer m.subMu.RUnlock()

	for ch := range m.subscribers {
		select {
		case ch <- event:
		default:
			// Buffer full, drop for slow consumer to prevent blocking
		}
	}
}

// runCameraStream maintains a persistent alert stream connection with backoff.
func (m *AlertStreamManager) runCameraStream(ctx context.Context, cam models.Camera) {
	backoff := 2 * time.Second
	maxBackoff := 30 * time.Second

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		err := m.streamAlerts(ctx, cam)
		if ctx.Err() != nil {
			return
		}

		if err != nil {
			log.Printf("[AlertStream] Camera %s (%s) stream disconnected: %v. Retrying in %v...",
				cam.Name, cam.IP, err, backoff)
		}

		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff):
			backoff = time.Duration(math.Min(float64(backoff*2), float64(maxBackoff)))
		}
	}
}

// streamAlerts establishes the HTTP digest streaming connection and reads multipart XML events.
func (m *AlertStreamManager) streamAlerts(ctx context.Context, cam models.Camera) error {
	targetURL := fmt.Sprintf("http://%s/ISAPI/Event/notification/alertStream", cam.IP)

	// 1. Send initial probe request to receive 401 challenge
	probeReq, err := http.NewRequestWithContext(ctx, "GET", targetURL, nil)
	if err != nil {
		return err
	}

	probeResp, err := m.httpClient.Do(probeReq)
	if err != nil {
		return err
	}
	defer probeResp.Body.Close()

	var streamResp *http.Response

	if probeResp.StatusCode == http.StatusOK {
		// Open without auth (rare)
		streamResp = probeResp
	} else if probeResp.StatusCode == http.StatusUnauthorized {
		authHeader := probeResp.Header.Get("WWW-Authenticate")
		if strings.HasPrefix(authHeader, "Digest ") {
			params := parseDigestHeader(authHeader)
			realm := params["realm"]
			nonce := params["nonce"]
			qop := params["qop"]
			opaque := params["opaque"]

			uri := "/ISAPI/Event/notification/alertStream"
			ha1 := md5Hex(fmt.Sprintf("%s:%s:%s", cam.Username, realm, cam.Password))
			ha2 := md5Hex(fmt.Sprintf("GET:%s", uri))
			nc := "00000001"
			cnonce := randomHex(8)

			var response string
			if strings.Contains(qop, "auth") {
				response = md5Hex(fmt.Sprintf("%s:%s:%s:%s:auth:%s", ha1, nonce, nc, cnonce, ha2))
			} else {
				response = md5Hex(fmt.Sprintf("%s:%s:%s", ha1, nonce, ha2))
			}

			authVal := fmt.Sprintf(`Digest username="%s", realm="%s", nonce="%s", uri="%s", response="%s"`,
				cam.Username, realm, nonce, uri, response)
			if strings.Contains(qop, "auth") {
				authVal += fmt.Sprintf(`, qop="auth", nc=%s, cnonce="%s"`, nc, cnonce)
			}
			if opaque != "" {
				authVal += fmt.Sprintf(`, opaque="%s"`, opaque)
			}

			req2, err := http.NewRequestWithContext(ctx, "GET", targetURL, nil)
			if err != nil {
				return err
			}
			req2.Header.Set("Authorization", authVal)

			resp2, err := m.httpClient.Do(req2)
			if err != nil {
				return err
			}
			if resp2.StatusCode != http.StatusOK {
				resp2.Body.Close()
				return fmt.Errorf("authenticated request failed with status %d", resp2.StatusCode)
			}
			streamResp = resp2
		} else {
			// Basic auth fallback
			reqBasic, err := http.NewRequestWithContext(ctx, "GET", targetURL, nil)
			if err != nil {
				return err
			}
			reqBasic.SetBasicAuth(cam.Username, cam.Password)

			respBasic, err := m.httpClient.Do(reqBasic)
			if err != nil {
				return err
			}
			if respBasic.StatusCode != http.StatusOK {
				respBasic.Body.Close()
				return fmt.Errorf("basic auth request failed with status %d", respBasic.StatusCode)
			}
			streamResp = respBasic
		}
	} else {
		return fmt.Errorf("unexpected status %d from alertStream probe", probeResp.StatusCode)
	}

	defer streamResp.Body.Close()

	// Parse boundary from Content-Type
	_, params, err := mime.ParseMediaType(streamResp.Header.Get("Content-Type"))
	boundary := "boundary"
	if err == nil && params["boundary"] != "" {
		boundary = params["boundary"]
	}

	log.Printf("[AlertStream] Successfully connected to %q (%s) alert stream", cam.Name, cam.IP)

	// Read multipart boundaries
	mr := multipart.NewReader(streamResp.Body, boundary)
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		part, err := mr.NextPart()
		if err != nil {
			return err
		}

		partData, err := io.ReadAll(part)
		if err != nil {
			continue
		}

		if len(partData) == 0 {
			continue
		}

		m.handleAlertXML(cam, partData)
	}
}

// handleAlertXML parses the raw XML alert and routes it into active/recent state and broadcasting.
func (m *AlertStreamManager) handleAlertXML(cam models.Camera, data []byte) {
	var alert EventNotificationAlert
	if err := xml.Unmarshal(data, &alert); err != nil {
		// Not an XML alert part (e.g. boundary padding or binary picture part)
		return
	}

	if alert.EventType == "" {
		return
	}

	normType, label := NormalizeEventType(alert.EventType)
	state := strings.ToLower(strings.TrimSpace(alert.EventState))
	if state == "" {
		state = "active"
	}

	// Filter out idle connection / heartbeat noise:
	// Hikvision sends "videoloss inactive" when connecting and periodically as a keepalive.
	if normType == "videoloss" && state == "inactive" {
		m.mu.RLock()
		activeMap := m.activeEvents[cam.ID]
		hasActiveVideoLoss := activeMap != nil && activeMap["videoloss"] != nil
		m.mu.RUnlock()

		if !hasActiveVideoLoss {
			// Pure keepalive, ignore
			return
		}
	}

	// Parse event timestamp
	eventTime := time.Now()
	if alert.DateTime != "" {
		if parsed, err := time.Parse(time.RFC3339, alert.DateTime); err == nil {
			eventTime = parsed
		} else if parsed, err := time.Parse("2006-01-02T15:04:05-07:00", alert.DateTime); err == nil {
			eventTime = parsed
		} else if parsed, err := time.Parse("2006-01-02T15:04:05", alert.DateTime); err == nil {
			eventTime = parsed
		}
	}

	channelID := alert.ChannelID
	if channelID <= 0 {
		channelID = 1
	}

	desc := alert.EventDescription
	if desc == "" {
		desc = label
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	if m.activeEvents[cam.ID] == nil {
		m.activeEvents[cam.ID] = make(map[string]*activeEventTracker)
	}

	activeMap := m.activeEvents[cam.ID]
	existingTracker, isCurrentlyActive := activeMap[normType]

	if state == "active" {
		if isCurrentlyActive {
			// Update last seen to keep active state alive
			existingTracker.LastSeen = time.Now()
			return
		}

		// Transition: inactive -> active
		evt := &models.CameraEvent{
			ID:          fmt.Sprintf("evt_%d_%s_%d", cam.ID, normType, time.Now().UnixNano()),
			CameraID:    cam.ID,
			CameraName:  cam.Name,
			ChannelID:   channelID,
			EventType:   normType,
			RawType:     alert.EventType,
			EventLabel:  label,
			EventState:  "active",
			Description: desc,
			StartTime:   eventTime,
		}

		activeMap[normType] = &activeEventTracker{
			Event:    evt,
			LastSeen: time.Now(),
		}

		// Prepend to recent events (keep capped at maxRecent)
		m.recentEvents = append([]*models.CameraEvent{evt}, m.recentEvents...)
		if len(m.recentEvents) > m.maxRecent {
			m.recentEvents = m.recentEvents[:m.maxRecent]
		}

		log.Printf("[AlertStream] [%s] %s triggered on %s (ch %d)",
			cam.Name, label, eventTime.Format("15:04:05"), channelID)

		m.broadcast(evt)
	} else {
		// Transition: active -> inactive (cleared)
		if isCurrentlyActive {
			now := time.Now()
			evt := existingTracker.Event
			evt.EventState = "inactive"
			evt.EndTime = &now
			dur := math.Round(now.Sub(evt.StartTime).Seconds()*10) / 10
			if dur < 0.1 {
				dur = 0.5
			}
			evt.DurationSec = dur

			delete(activeMap, normType)

			log.Printf("[AlertStream] [%s] %s cleared after %.1fs", cam.Name, label, dur)
			m.broadcast(evt)
		}
	}
}

// runAutoClearLoop checks periodically for active events that stopped pulsing without explicit 'inactive' signals.
func (m *AlertStreamManager) runAutoClearLoop(ctx context.Context) {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			m.checkStaleActiveEvents()
		}
	}
}

func (m *AlertStreamManager) checkStaleActiveEvents() {
	m.mu.Lock()
	defer m.mu.Unlock()

	now := time.Now()
	// Stale timeout: if camera hasn't refreshed an active event in 12 seconds, clear it.
	staleThreshold := 12 * time.Second

	for _, activeMap := range m.activeEvents {
		for normType, tracker := range activeMap {
			if now.Sub(tracker.LastSeen) > staleThreshold {
				evt := tracker.Event
				evt.EventState = "inactive"
				endTime := tracker.LastSeen
				evt.EndTime = &endTime
				dur := math.Round(endTime.Sub(evt.StartTime).Seconds()*10) / 10
				if dur < 0.1 {
					dur = 1.0
				}
				evt.DurationSec = dur

				delete(activeMap, normType)
				m.broadcast(evt)
			}
		}
	}
}
