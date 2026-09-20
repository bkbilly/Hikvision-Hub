package hikvision

import (
	"crypto/rand"
	"encoding/xml"
	"fmt"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

// DiscoveredDevice represents an IP camera or NVR discovered via network protocols.
type DiscoveredDevice struct {
	IP              string `json:"ip"`
	Port            int    `json:"port"`
	Model           string `json:"model"`
	Name            string `json:"name"`
	SerialNumber    string `json:"serial_number"`
	MAC             string `json:"mac"`
	FirmwareVersion string `json:"firmware_version"`
	Manufacturer    string `json:"manufacturer"`
	Protocol        string `json:"protocol"` // "SADP" or "ONVIF"
	IsISAPI         bool   `json:"is_isapi"`
	Activated       bool   `json:"activated"`
}

// sadpProbeMatch represents the XML response from a Hikvision SADP probe.
type sadpProbeMatch struct {
	XMLName           xml.Name `xml:"ProbeMatch"`
	DeviceType        string   `xml:"DeviceType"`
	DeviceDescription string   `xml:"DeviceDescription"`
	DeviceSN          string   `xml:"DeviceSN"`
	CommandPort       int      `xml:"CommandPort"`
	HttpPort          int      `xml:"HttpPort"`
	MAC               string   `xml:"MAC"`
	IPv4Address       string   `xml:"IPv4Address"`
	IPv4SubnetMask    string   `xml:"IPv4SubnetMask"`
	IPv4Gateway       string   `xml:"IPv4Gateway"`
	SoftwareVersion   string   `xml:"SoftwareVersion"`
	Activated         string   `xml:"Activated"`
}

// generateUUID creates a standard random UUID string.
func generateUUID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

// getBroadcastAddresses returns broadcast addresses for all active IPv4 interfaces.
func getBroadcastAddresses() []net.IP {
	var broadcasts []net.IP
	ifaces, err := net.Interfaces()
	if err != nil {
		return broadcasts
	}

	for _, iface := range ifaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			ipNet, ok := addr.(*net.IPNet)
			if !ok || ipNet.IP.To4() == nil {
				continue
			}
			ip := ipNet.IP.To4()
			mask := ipNet.Mask
			if len(mask) == 4 {
				bcast := make(net.IP, 4)
				for i := 0; i < 4; i++ {
					bcast[i] = ip[i] | ^mask[i]
				}
				broadcasts = append(broadcasts, bcast)
			}
		}
	}
	return broadcasts
}

// DiscoverDevices runs network discovery using SADP and ONVIF WS-Discovery.
func DiscoverDevices(timeout time.Duration) ([]DiscoveredDevice, error) {
	if timeout <= 0 {
		timeout = 2 * time.Second
	}

	var (
		mu      sync.Mutex
		devices = make(map[string]*DiscoveredDevice)
		wg      sync.WaitGroup
	)

	// 1. Run Hikvision SADP discovery
	wg.Add(1)
	go func() {
		defer wg.Done()
		sadpList := discoverSADP(timeout)
		mu.Lock()
		for _, d := range sadpList {
			devices[d.IP] = d
		}
		mu.Unlock()
	}()

	// 2. Run ONVIF WS-Discovery
	wg.Add(1)
	go func() {
		defer wg.Done()
		onvifList := discoverONVIF(timeout)
		mu.Lock()
		for _, d := range onvifList {
			if existing, exists := devices[d.IP]; exists {
				// Augment existing device if ONVIF has friendly name
				if existing.Name == "" || existing.Name == existing.Model {
					if d.Name != "" && d.Name != d.Model {
						existing.Name = d.Name
					}
				}
			} else {
				devices[d.IP] = d
			}
		}
		mu.Unlock()
	}()

	wg.Wait()

	result := make([]DiscoveredDevice, 0, len(devices))
	for _, d := range devices {
		result = append(result, *d)
	}

	sort.Slice(result, func(i, j int) bool {
		return result[i].IP < result[j].IP
	})

	return result, nil
}

// discoverSADP sends inquiry probes over UDP port 37020 and collects responses.
func discoverSADP(timeout time.Duration) []*DiscoveredDevice {
	conn, err := net.ListenUDP("udp4", &net.UDPAddr{IP: net.IPv4zero, Port: 0})
	if err != nil {
		return nil
	}
	defer conn.Close()

	probeMsg := fmt.Sprintf(`<?xml version="1.0" encoding="utf-8"?>
<Probe>
  <Uuid>%s</Uuid>
  <Types>inquiry</Types>
</Probe>`, generateUUID())

	targets := []*net.UDPAddr{
		{IP: net.ParseIP("239.255.255.250"), Port: 37020},
		{IP: net.ParseIP("239.255.255.230"), Port: 37020},
		{IP: net.ParseIP("255.255.255.255"), Port: 37020},
	}
	for _, bcast := range getBroadcastAddresses() {
		targets = append(targets, &net.UDPAddr{IP: bcast, Port: 37020})
	}

	for _, target := range targets {
		_, _ = conn.WriteToUDP([]byte(probeMsg), target)
	}

	_ = conn.SetReadDeadline(time.Now().Add(timeout))
	buf := make([]byte, 8192)
	seen := make(map[string]bool)
	var devices []*DiscoveredDevice

	for {
		n, _, err := conn.ReadFrom(buf)
		if err != nil {
			break
		}

		var match sadpProbeMatch
		if err := xml.Unmarshal(buf[:n], &match); err != nil {
			continue
		}

		if match.IPv4Address == "" || seen[match.IPv4Address] {
			continue
		}
		seen[match.IPv4Address] = true

		port := match.HttpPort
		if port == 0 {
			port = 80
		}

		manufacturer := "Hikvision"
		modelUpper := strings.ToUpper(match.DeviceDescription)
		if strings.HasPrefix(modelUpper, "THC") || strings.HasPrefix(modelUpper, "IPC-B") || strings.Contains(modelUpper, "HILOOK") {
			manufacturer = "HiLook"
		}

		devices = append(devices, &DiscoveredDevice{
			IP:              match.IPv4Address,
			Port:            port,
			Model:           match.DeviceDescription,
			Name:            match.DeviceDescription,
			SerialNumber:    match.DeviceSN,
			MAC:             match.MAC,
			FirmwareVersion: match.SoftwareVersion,
			Manufacturer:    manufacturer,
			Protocol:        "SADP",
			IsISAPI:         true,
			Activated:       strings.EqualFold(match.Activated, "true"),
		})
	}

	return devices
}

// discoverONVIF sends WS-Discovery probes on UDP port 3702 and parses device services.
func discoverONVIF(timeout time.Duration) []*DiscoveredDevice {
	conn, err := net.ListenUDP("udp4", &net.UDPAddr{IP: net.IPv4zero, Port: 0})
	if err != nil {
		return nil
	}
	defer conn.Close()

	probeMsg := fmt.Sprintf(`<?xml version="1.0" encoding="utf-8"?>
<Envelope xmlns="http://www.w3.org/2003/05/soap-envelope" xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
  <Header>
    <wsa:MessageID xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing">uuid:%s</wsa:MessageID>
    <wsa:To xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing">urn:schemas-xmlsoap-org:ws:2005:04:discovery</wsa:To>
    <wsa:Action xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</wsa:Action>
  </Header>
  <Body>
    <Probe xmlns="http://schemas.xmlsoap.org/ws/2005/04/discovery">
      <Types>dn:NetworkVideoTransmitter</Types>
    </Probe>
  </Body>
</Envelope>`, generateUUID())

	targets := []*net.UDPAddr{
		{IP: net.ParseIP("239.255.255.250"), Port: 3702},
		{IP: net.ParseIP("255.255.255.255"), Port: 3702},
	}
	for _, bcast := range getBroadcastAddresses() {
		targets = append(targets, &net.UDPAddr{IP: bcast, Port: 3702})
	}

	for _, target := range targets {
		_, _ = conn.WriteToUDP([]byte(probeMsg), target)
	}

	_ = conn.SetReadDeadline(time.Now().Add(timeout))
	buf := make([]byte, 8192)
	seen := make(map[string]bool)
	var devices []*DiscoveredDevice

	xaddrRe := regexp.MustCompile(`(?i)<[^:]*:?XAddrs[^>]*>([^<]+)</[^:]*:?XAddrs>`)
	scopesRe := regexp.MustCompile(`(?i)<[^:]*:?Scopes[^>]*>([^<]+)</[^:]*:?Scopes>`)

	for {
		n, remoteAddr, err := conn.ReadFrom(buf)
		if err != nil {
			break
		}

		raw := string(buf[:n])
		var ip string
		port := 80

		if udpAddr, ok := remoteAddr.(*net.UDPAddr); ok && udpAddr.IP != nil {
			ip = udpAddr.IP.String()
		}

		// Try parsing XAddrs for IP and Port
		xaddrMatches := xaddrRe.FindStringSubmatch(raw)
		if len(xaddrMatches) > 1 {
			fields := strings.Fields(xaddrMatches[1])
			for _, f := range fields {
				if parsedURL, err := url.Parse(f); err == nil && parsedURL.Hostname() != "" {
					parsedIP := net.ParseIP(parsedURL.Hostname())
					if parsedIP != nil && parsedIP.To4() != nil {
						ip = parsedIP.String()
						if parsedURL.Port() != "" {
							if p, err := net.LookupPort("tcp", parsedURL.Port()); err == nil {
								port = p
							}
						}
						break
					}
				}
			}
		}

		if ip == "" || seen[ip] {
			continue
		}
		seen[ip] = true

		var (
			model        string
			name         string
			mac          string
			manufacturer = "ONVIF"
			isISAPI      = false
		)

		scopeMatches := scopesRe.FindStringSubmatch(raw)
		if len(scopeMatches) > 1 {
			scopes := strings.Fields(scopeMatches[1])
			for _, s := range scopes {
				sUnescaped, _ := url.PathUnescape(s)
				lower := strings.ToLower(sUnescaped)
				if strings.Contains(lower, "onvif://www.onvif.org/hardware/") {
					model = strings.TrimPrefix(sUnescaped, "onvif://www.onvif.org/hardware/")
				} else if strings.Contains(lower, "onvif://www.onvif.org/name/") {
					name = strings.TrimPrefix(sUnescaped, "onvif://www.onvif.org/name/")
				} else if strings.Contains(lower, "onvif://www.onvif.org/mac/") {
					mac = strings.TrimPrefix(sUnescaped, "onvif://www.onvif.org/MAC/")
					mac = strings.TrimPrefix(mac, "onvif://www.onvif.org/mac/")
				}
			}
		}

		combined := strings.ToUpper(name + " " + model)
		if strings.Contains(combined, "HIKVISION") {
			manufacturer = "Hikvision"
			isISAPI = true
		} else if strings.Contains(combined, "HILOOK") {
			manufacturer = "HiLook"
			isISAPI = true
		} else if strings.Contains(combined, "TAPO") || strings.Contains(combined, "TP-LINK") {
			manufacturer = "TP-Link"
		} else if strings.Contains(combined, "DAHUA") {
			manufacturer = "Dahua"
		} else if strings.Contains(combined, "AMCREST") {
			manufacturer = "Amcrest"
		} else if strings.Contains(combined, "REOLINK") {
			manufacturer = "Reolink"
		}

		if name == "" {
			name = model
		}
		if name == "" {
			name = fmt.Sprintf("%s Camera (%s)", manufacturer, ip)
		}

		devices = append(devices, &DiscoveredDevice{
			IP:           ip,
			Port:         port,
			Model:        model,
			Name:         name,
			MAC:          mac,
			Manufacturer: manufacturer,
			Protocol:     "ONVIF",
			IsISAPI:      isISAPI,
			Activated:    true,
		})
	}

	return devices
}

// ProbeDeviceIP directly investigates a specific IP address using unicast SADP and optional ISAPI.
func ProbeDeviceIP(ip string, client *CameraClient, username, password string) (*DiscoveredDevice, error) {
	ip = strings.TrimSpace(ip)
	if ip == "" {
		return nil, fmt.Errorf("ip address cannot be empty")
	}

	// 1. Try unicast SADP probe to ip:37020 (works without credentials for Hikvision/HiLook)
	sadpConn, err := net.ListenUDP("udp4", &net.UDPAddr{IP: net.IPv4zero, Port: 0})
	if err == nil {
		defer sadpConn.Close()
		probeMsg := fmt.Sprintf(`<?xml version="1.0" encoding="utf-8"?>
<Probe>
  <Uuid>%s</Uuid>
  <Types>inquiry</Types>
</Probe>`, generateUUID())

		target := &net.UDPAddr{IP: net.ParseIP(ip), Port: 37020}
		if target.IP != nil {
			_, _ = sadpConn.WriteToUDP([]byte(probeMsg), target)
			_ = sadpConn.SetReadDeadline(time.Now().Add(1200 * time.Millisecond))
			buf := make([]byte, 8192)
			n, _, readErr := sadpConn.ReadFrom(buf)
			if readErr == nil && n > 0 {
				var match sadpProbeMatch
				if xml.Unmarshal(buf[:n], &match) == nil && match.IPv4Address != "" {
					port := match.HttpPort
					if port == 0 {
						port = 80
					}
					manufacturer := "Hikvision"
					modelUpper := strings.ToUpper(match.DeviceDescription)
					if strings.HasPrefix(modelUpper, "THC") || strings.HasPrefix(modelUpper, "IPC-B") || strings.Contains(modelUpper, "HILOOK") {
						manufacturer = "HiLook"
					}

					dev := &DiscoveredDevice{
						IP:              match.IPv4Address,
						Port:            port,
						Model:           match.DeviceDescription,
						Name:            match.DeviceDescription,
						SerialNumber:    match.DeviceSN,
						MAC:             match.MAC,
						FirmwareVersion: match.SoftwareVersion,
						Manufacturer:    manufacturer,
						Protocol:        "SADP",
						IsISAPI:         true,
						Activated:       strings.EqualFold(match.Activated, "true"),
					}

					// If credentials provided, try fetching custom configured DeviceName via ISAPI
					if client != nil && username != "" {
						if info, err := client.GetDeviceInfo(ip, username, password); err == nil && info != nil {
							if info.DeviceName != "" {
								dev.Name = info.DeviceName
							}
							if info.FirmwareVersion != "" {
								dev.FirmwareVersion = info.FirmwareVersion
							}
						}
					}
					return dev, nil
				}
			}
		}
	}

	// 2. If SADP didn't respond and credentials are available, try HTTP ISAPI / deviceInfo
	if client != nil && username != "" {
		if info, err := client.GetDeviceInfo(ip, username, password); err == nil && info != nil {
			name := info.DeviceName
			if name == "" {
				name = info.Model
			}
			return &DiscoveredDevice{
				IP:              ip,
				Port:            80,
				Model:           info.Model,
				Name:            name,
				SerialNumber:    info.SerialNumber,
				MAC:             info.MacAddress,
				FirmwareVersion: info.FirmwareVersion,
				Manufacturer:    "Hikvision",
				Protocol:        "ISAPI",
				IsISAPI:         true,
				Activated:       true,
			}, nil
		}
	}

	return nil, fmt.Errorf("no camera found at %s", ip)
}

// FindAvailableStoragePaths looks for unassigned info.bin files or camera data dirs.
func FindAvailableStoragePaths(existingPaths []string) []string {
	used := make(map[string]bool)
	for _, p := range existingPaths {
		clean := filepath.Clean(strings.TrimSpace(p))
		if clean != "" {
			used[clean] = true
		}
	}

	found := []string{}
	foundMap := make(map[string]bool)

	addPath := func(path string) {
		clean := filepath.Clean(path)
		if clean == "" || used[clean] || foundMap[clean] {
			return
		}
		// Verify info.bin exists or datadir exists
		fi, err := os.Stat(clean)
		if err == nil && !fi.IsDir() && filepath.Base(clean) == "info.bin" {
			foundMap[clean] = true
			found = append(found, clean)
		}
	}

	// 1. Check parent directories of existing configured paths
	for _, ep := range existingPaths {
		clean := filepath.Clean(strings.TrimSpace(ep))
		if clean == "" {
			continue
		}
		// If clean is /dir/cam1/info.bin, parent is /dir/cam1, grandParent is /dir
		parent := filepath.Dir(clean)
		grandParent := filepath.Dir(parent)

		// Scan sibling subdirectories in grandParent (e.g. /dir/cam2/info.bin)
		if entries, err := os.ReadDir(grandParent); err == nil {
			for _, e := range entries {
				if e.IsDir() {
					candidate := filepath.Join(grandParent, e.Name(), "info.bin")
					addPath(candidate)
				}
			}
		}

		// Also check parent itself
		candidate := filepath.Join(parent, "info.bin")
		addPath(candidate)
	}

	// 2. Scan common mount points like /mnt, /media, /data
	commonRoots := []string{"/mnt", "/media", "/data", "/storage"}
	for _, root := range commonRoots {
		if entries, err := os.ReadDir(root); err == nil {
			for _, e := range entries {
				if e.IsDir() {
					sub := filepath.Join(root, e.Name())
					addPath(filepath.Join(sub, "info.bin"))

					// One level deeper (e.g. /mnt/recordings/cam1/info.bin)
					if subEntries, err := os.ReadDir(sub); err == nil {
						for _, se := range subEntries {
							if se.IsDir() {
								addPath(filepath.Join(sub, se.Name(), "info.bin"))
							}
						}
					}
				}
			}
		}
	}

	sort.Strings(found)
	return found
}
