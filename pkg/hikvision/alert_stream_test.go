package hikvision

import (
	"context"
	"net"
	"os"
	"testing"
	"time"

	"github.com/bkbilly/hikvision-hub/pkg/models"
)

func TestNormalizeEventType(t *testing.T) {
	tests := []struct {
		raw      string
		expected string
		label    string
	}{
		{"VMD", "motion", "Motion Detection"},
		{"motiondetection", "motion", "Motion Detection"},
		{"linedetection", "line_crossing", "Line Crossing"},
		{"fielddetection", "intrusion", "Intrusion Detection"},
		{"shelteralarm", "tamper", "Tamper Alarm"},
		{"videoloss", "videoloss", "Video Loss"},
		{"regionEntrance", "region_entrance", "Region Entrance"},
	}

	for _, tc := range tests {
		norm, lbl := NormalizeEventType(tc.raw)
		if norm != tc.expected {
			t.Errorf("For %q expected norm %q, got %q", tc.raw, tc.expected, norm)
		}
		if lbl != tc.label {
			t.Errorf("For %q expected label %q, got %q", tc.raw, tc.label, lbl)
		}
	}
}

func TestAlertStreamManagerMockLifecycle(t *testing.T) {
	mgr := NewAlertStreamManager(50)
	cam := models.Camera{
		ID:       10,
		Name:     "TestCam",
		IP:       "127.0.0.1",
		Username: "admin",
		Password: "password",
		Enabled:  true,
	}

	ch := mgr.Subscribe()
	defer mgr.Unsubscribe(ch)

	// 1. Send idle heartbeat (videoloss inactive) -> should be ignored
	heartbeatXML := []byte(`
<EventNotificationAlert version="2.0">
<channelID>1</channelID>
<eventType>videoloss</eventType>
<eventState>inactive</eventState>
<eventDescription>videoloss alarm</eventDescription>
</EventNotificationAlert>`)
	mgr.handleAlertXML(cam, heartbeatXML)

	if len(mgr.GetActiveEvents()) != 0 {
		t.Fatalf("Expected 0 active events after heartbeat, got %d", len(mgr.GetActiveEvents()))
	}
	if len(mgr.GetRecentEvents()) != 0 {
		t.Fatalf("Expected 0 recent events after heartbeat, got %d", len(mgr.GetRecentEvents()))
	}

	// 2. Trigger motion active
	motionXML := []byte(`
<EventNotificationAlert version="2.0">
<channelID>1</channelID>
<dateTime>2026-09-20T18:00:00+03:00</dateTime>
<eventType>VMD</eventType>
<eventState>active</eventState>
<eventDescription>Motion alarm</eventDescription>
</EventNotificationAlert>`)
	mgr.handleAlertXML(cam, motionXML)

	active := mgr.GetActiveEvents()
	if len(active) != 1 {
		t.Fatalf("Expected 1 active event, got %d", len(active))
	}
	if active[0].EventType != "motion" || active[0].EventState != "active" {
		t.Fatalf("Unexpected active event: %+v", active[0])
	}

	// Verify broadcast
	select {
	case evt := <-ch:
		if evt.EventType != "motion" || evt.EventState != "active" {
			t.Errorf("Unexpected broadcast event: %+v", evt)
		}
	case <-time.After(1 * time.Second):
		t.Fatalf("Timeout waiting for event broadcast")
	}

	// 3. Clear motion
	motionClearXML := []byte(`
<EventNotificationAlert version="2.0">
<channelID>1</channelID>
<dateTime>2026-09-20T18:00:05+03:00</dateTime>
<eventType>VMD</eventType>
<eventState>inactive</eventState>
<eventDescription>Motion alarm</eventDescription>
</EventNotificationAlert>`)
	mgr.handleAlertXML(cam, motionClearXML)

	if len(mgr.GetActiveEvents()) != 0 {
		t.Fatalf("Expected 0 active events after clear, got %d", len(mgr.GetActiveEvents()))
	}

	recent := mgr.GetRecentEvents()
	if len(recent) != 1 {
		t.Fatalf("Expected 1 recent event, got %d", len(recent))
	}
	if recent[0].EventState != "inactive" || recent[0].DurationSec <= 0 {
		t.Fatalf("Expected cleared event with duration, got %+v", recent[0])
	}

	// Verify clear broadcast
	select {
	case evt := <-ch:
		if evt.EventState != "inactive" {
			t.Errorf("Expected inactive broadcast, got %+v", evt)
		}
	case <-time.After(1 * time.Second):
		t.Fatalf("Timeout waiting for clear broadcast")
	}
}

func TestAlertStreamLiveCamera(t *testing.T) {
	ip := os.Getenv("HIKVISION_TEST_IP")
	pwd := os.Getenv("HIKVISION_TEST_PASSWORD")
	if ip == "" || pwd == "" {
		t.Skip("Skipping live camera test: HIKVISION_TEST_IP or HIKVISION_TEST_PASSWORD not set")
		return
	}
	conn, err := net.DialTimeout("tcp", ip+":80", 1*time.Second)
	if err != nil {
		t.Skipf("Live camera %s not reachable: %v", ip, err)
		return
	}
	conn.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	cam := models.Camera{
		ID:       1,
		Name:     "TestCam",
		IP:       ip,
		Username: "admin",
		Password: pwd,
		Enabled:  true,
	}

	mgr := NewAlertStreamManager(20)
	mgr.ctx = ctx
	mgr.cancel = cancel

	errChan := make(chan error, 1)
	go func() {
		errChan <- mgr.streamAlerts(ctx, cam)
	}()

	select {
	case err := <-errChan:
		if err != nil && err != context.Canceled && err != context.DeadlineExceeded {
			t.Fatalf("Stream error: %v", err)
		}
	case <-time.After(2 * time.Second):
		cancel()
	}
}

func TestAlertStreamOnDemandSubscription(t *testing.T) {
	mgr := NewAlertStreamManager(10)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	cams := []models.Camera{
		{ID: 1, Name: "Cam1", IP: "127.0.0.1", Username: "admin", Password: "pwd", Enabled: true},
		{ID: 2, Name: "Cam2", IP: "127.0.0.2", Username: "admin", Password: "pwd", Enabled: false},
	}

	mgr.Start(ctx, cams)

	// Verify no workers are running initially when there are 0 subscribers
	mgr.mu.RLock()
	activeCount := len(mgr.cancelFuncs)
	mgr.mu.RUnlock()
	if activeCount != 0 {
		t.Fatalf("Expected 0 active workers on startup without subscribers, got %d", activeCount)
	}

	// First subscriber connects: workers should be started for enabled camera
	ch1 := mgr.Subscribe()
	mgr.mu.RLock()
	activeCount = len(mgr.cancelFuncs)
	mgr.mu.RUnlock()
	if activeCount != 1 {
		t.Fatalf("Expected 1 active worker after Subscribe, got %d", activeCount)
	}

	// Second subscriber connects: workers should remain running (no duplicate)
	ch2 := mgr.Subscribe()
	mgr.mu.RLock()
	activeCount = len(mgr.cancelFuncs)
	mgr.mu.RUnlock()
	if activeCount != 1 {
		t.Fatalf("Expected 1 active worker after second Subscribe, got %d", activeCount)
	}

	// First subscriber disconnects: ch2 is still active, workers stay running
	mgr.Unsubscribe(ch1)
	mgr.mu.RLock()
	activeCount = len(mgr.cancelFuncs)
	mgr.mu.RUnlock()
	if activeCount != 1 {
		t.Fatalf("Expected 1 active worker while ch2 is active, got %d", activeCount)
	}

	// Second subscriber disconnects: all subscribers gone
	mgr.Unsubscribe(ch2)

	// Fast-forward or trigger stop directly to verify cleanup
	mgr.mu.Lock()
	mgr.stopWorkersLocked()
	activeCount = len(mgr.cancelFuncs)
	mgr.mu.Unlock()

	if activeCount != 0 {
		t.Fatalf("Expected 0 active workers after stopping, got %d", activeCount)
	}
}

