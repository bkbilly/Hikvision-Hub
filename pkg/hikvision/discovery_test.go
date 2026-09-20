package hikvision

import (
	"encoding/xml"
	"os"
	"path/filepath"
	"testing"
)

func TestGenerateUUID(t *testing.T) {
	u1 := generateUUID()
	u2 := generateUUID()
	if u1 == "" || u2 == "" {
		t.Fatalf("expected non-empty UUIDs")
	}
	if u1 == u2 {
		t.Fatalf("expected unique UUIDs, got %s and %s", u1, u2)
	}
}

func TestSADPProbeMatchXML(t *testing.T) {
	sample := `<?xml version="1.0" encoding="UTF-8"?>
<ProbeMatch><Uuid>d311b3b5-a4c1-47c0-bf4b-c0a26de18451</Uuid>
<Types>inquiry</Types>
<DeviceType>155650</DeviceType>
<DeviceDescription>DS-2CD2T47G1-L</DeviceDescription>
<DeviceSN>DS-2CD2T47G1-L20190522AAWRD22374804</DeviceSN>
<CommandPort>8000</CommandPort>
<HttpPort>80</HttpPort>
<MAC>68-6d-bc-3b-52-dd</MAC>
<IPv4Address>192.168.2.173</IPv4Address>
<IPv4SubnetMask>255.255.255.0</IPv4SubnetMask>
<IPv4Gateway>192.168.2.1</IPv4Gateway>
<SoftwareVersion>V5.6.5build 200316</SoftwareVersion>
<Activated>true</Activated>
</ProbeMatch>`

	var match sadpProbeMatch
	if err := xml.Unmarshal([]byte(sample), &match); err != nil {
		t.Fatalf("failed to unmarshal SADP XML: %v", err)
	}

	if match.IPv4Address != "192.168.2.173" {
		t.Errorf("expected IP 192.168.2.173, got %s", match.IPv4Address)
	}
	if match.DeviceDescription != "DS-2CD2T47G1-L" {
		t.Errorf("expected DeviceDescription DS-2CD2T47G1-L, got %s", match.DeviceDescription)
	}
	if match.HttpPort != 80 {
		t.Errorf("expected HttpPort 80, got %d", match.HttpPort)
	}
	if match.MAC != "68-6d-bc-3b-52-dd" {
		t.Errorf("expected MAC 68-6d-bc-3b-52-dd, got %s", match.MAC)
	}
}

func TestFindAvailableStoragePaths(t *testing.T) {
	tmpDir := t.TempDir()

	cam1Dir := filepath.Join(tmpDir, "cam1")
	cam2Dir := filepath.Join(tmpDir, "cam2")
	_ = os.MkdirAll(cam1Dir, 0755)
	_ = os.MkdirAll(cam2Dir, 0755)

	p1 := filepath.Join(cam1Dir, "info.bin")
	p2 := filepath.Join(cam2Dir, "info.bin")
	_ = os.WriteFile(p1, []byte("test"), 0644)
	_ = os.WriteFile(p2, []byte("test"), 0644)

	// Existing paths only includes cam1
	existing := []string{p1}
	available := FindAvailableStoragePaths(existing)

	foundCam2 := false
	for _, a := range available {
		if a == p2 {
			foundCam2 = true
		}
		if a == p1 {
			t.Errorf("expected existing path %s to be excluded, but it was found", p1)
		}
	}

	if !foundCam2 {
		t.Errorf("expected %s to be discovered, but available was: %v", p2, available)
	}
}
