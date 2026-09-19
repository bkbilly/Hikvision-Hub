package hikvision

import (
	"fmt"
	"net/http"
	"strings"
)

func isStorageNAS(item HddInfo) bool {
	t := strings.ToUpper(item.Type)
	return strings.Contains(t, "NAS") ||
		strings.Contains(t, "NFS") ||
		strings.Contains(t, "SMB") ||
		strings.Contains(t, "CIFS") ||
		item.HostName != "" ||
		item.Path != "" ||
		strings.HasPrefix(strings.ToLower(item.Name), "nas")
}

func matchStorageItems(a, b HddInfo) bool {
	nasA := isStorageNAS(a)
	nasB := isStorageNAS(b)

	// A local SD/HDD should never match a network NAS
	if nasA != nasB {
		return false
	}

	cleanA := strings.ToLower(strings.ReplaceAll(strings.ReplaceAll(strings.ReplaceAll(a.Name, " ", ""), "-", ""), "_", ""))
	cleanB := strings.ToLower(strings.ReplaceAll(strings.ReplaceAll(strings.ReplaceAll(b.Name, " ", ""), "-", ""), "_", ""))

	// If clean names match (e.g. "nas1" == "nas1" or "sd1" == "sd1")
	if cleanA != "" && cleanA == cleanB {
		return true
	}

	// For NAS items, check if one's ID matches the other's name (e.g. HDD "nas1" with NAS server ID 1)
	if nasA && nasB {
		if a.ID > 0 && cleanB == fmt.Sprintf("nas%d", a.ID) {
			return true
		}
		if b.ID > 0 && cleanA == fmt.Sprintf("nas%d", b.ID) {
			return true
		}
		if a.HostName != "" && b.HostName != "" && strings.EqualFold(a.HostName, b.HostName) &&
			a.Path != "" && b.Path != "" && strings.EqualFold(a.Path, b.Path) {
			return true
		}
	}

	// For non-NAS items with the same ID
	if !nasA && !nasB && a.ID == b.ID && a.ID > 0 {
		return true
	}

	return false
}

// GetStorageInfo queries SD card, HDD, and network NAS storage volumes.
func (c *CameraClient) GetStorageInfo(ip, username, password string) ([]HddInfo, error) {
	endpoints := []string{
		"/ISAPI/ContentMgmt/Storage/hdd",
		"/ISAPI/ContentMgmt/Storage/nas",
		"/ISAPI/ContentMgmt/nasServers",
		"/ISAPI/ContentMgmt/Storage/nasServers",
		"/ISAPI/System/Storage/nas",
		"/ISAPI/System/Network/nas",
		"/ISAPI/ContentMgmt/Storage/volumes",
		"/ISAPI/ContentMgmt/Storage/volumeList",
	}

	var allItems []HddInfo
	visited := make(map[string]bool)

	for _, ep := range endpoints {
		data, code, _, err := c.DoRequest(ip, username, password, "GET", ep, nil, "")
		if err != nil || (code != http.StatusOK && code != http.StatusAccepted) {
			continue
		}
		strData := string(data)
		if len(strData) < 10 {
			continue
		}

		parsed := parseStorageXML(strData)
		for _, item := range parsed {
			// Create a deduplication key based on ID, Name, HostName, and Path
			key := fmt.Sprintf("%d:%s:%s:%s", item.ID, strings.ToLower(item.Name), strings.ToLower(item.HostName), strings.ToLower(item.Path))
			if visited[key] {
				continue
			}

			// Check if we can merge into an existing item that lacks host/path
			merged := false
			for i := range allItems {
				if matchStorageItems(allItems[i], item) {
					if allItems[i].HostName == "" && item.HostName != "" {
						allItems[i].HostName = item.HostName
					}
					if allItems[i].Path == "" && item.Path != "" {
						allItems[i].Path = item.Path
					}
					if allItems[i].Property == "" && item.Property != "" {
						allItems[i].Property = item.Property
					}
					if allItems[i].CapacityMB == 0 && item.CapacityMB > 0 {
						allItems[i].CapacityMB = item.CapacityMB
						allItems[i].FreeSpaceMB = item.FreeSpaceMB
					}
					if item.Type != "" && item.Type != "SD/HDD" && item.Type != "Storage Drive" {
						if strings.Contains(strings.ToUpper(item.Type), "NFS") || strings.Contains(strings.ToUpper(item.Type), "SMB") || strings.Contains(strings.ToUpper(item.Type), "CIFS") {
							allItems[i].Type = fmt.Sprintf("NAS (%s)", item.Type)
						} else if allItems[i].Type == "" || allItems[i].Type == "HD" {
							allItems[i].Type = item.Type
						}
					}
					visited[key] = true
					merged = true
					break
				}
			}

			if !merged {
				visited[key] = true
				allItems = append(allItems, item)
			}
		}
	}

	return allItems, nil
}

// FormatStorage triggers formatting on the specified SD card, HDD, or NAS ID.
func (c *CameraClient) FormatStorage(ip, username, password string, hddID int) error {
	paths := []string{
		fmt.Sprintf("/ISAPI/ContentMgmt/Storage/hdd/%d/format", hddID),
		fmt.Sprintf("/ISAPI/ContentMgmt/Storage/nas/%d/format", hddID),
		fmt.Sprintf("/ISAPI/ContentMgmt/Storage/volumes/%d/format", hddID),
		fmt.Sprintf("/ISAPI/ContentMgmt/nasServers/%d/format", hddID),
	}

	var lastErr error
	for _, path := range paths {
		data, code, _, err := c.DoRequest(ip, username, password, "PUT", path, nil, "")
		if err == nil && (code == http.StatusOK || code == http.StatusAccepted || code == http.StatusNoContent) {
			return nil
		}
		if err != nil {
			lastErr = err
		} else if code != http.StatusNotFound {
			lastErr = fmt.Errorf("format storage failed with status %d (resp: %s)", code, string(data))
		}
	}

	if lastErr == nil {
		lastErr = fmt.Errorf("format storage failed for volume %d", hddID)
	}
	return lastErr
}
