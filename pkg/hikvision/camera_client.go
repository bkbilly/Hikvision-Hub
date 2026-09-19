package hikvision

import (
	"bytes"
	"crypto/md5"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

type digestSession struct {
	realm     string
	nonce     string
	qop       string
	opaque    string
	algorithm string
	ncCount   int
}

type cachedSnapshot struct {
	data      []byte
	timestamp time.Time
}

type CameraClient struct {
	client        *http.Client
	mu            sync.Mutex
	digestCache   map[string]*digestSession
	snapshotCache map[string]*cachedSnapshot
}

func NewCameraClient() *CameraClient {
	return &CameraClient{
		client: &http.Client{
			Timeout: 8 * time.Second,
		},
		digestCache:   make(map[string]*digestSession),
		snapshotCache: make(map[string]*cachedSnapshot),
	}
}

// FetchSnapshot fetches a live JPEG snapshot from the camera with candidate path fallbacks.
func (c *CameraClient) FetchSnapshot(ip, username, password string, isISAPI bool) ([]byte, error) {
	var candidatePaths []string
	if isISAPI {
		candidatePaths = []string{
			"/ISAPI/Streaming/Channels/101/picture",
			"/ISAPI/Streaming/Channels/102/picture",
			"/Streaming/channels/102/picture",
			"/Streaming/channels/101/picture",
		}
	} else {
		candidatePaths = []string{
			"/Streaming/channels/102/picture",
			"/ISAPI/Streaming/Channels/101/picture",
			"/Streaming/channels/101/picture",
			"/ISAPI/Streaming/Channels/102/picture",
		}
	}

	var lastErr error
	for _, p := range candidatePaths {
		data, statusCode, _, err := c.DoRequest(ip, username, password, "GET", p, nil, "")
		if err == nil && statusCode == http.StatusOK && len(data) > 0 {
			// Save in cache
			c.mu.Lock()
			c.snapshotCache[ip] = &cachedSnapshot{
				data:      data,
				timestamp: time.Now(),
			}
			c.mu.Unlock()
			return data, nil
		}
		if err != nil {
			lastErr = err
		} else {
			lastErr = fmt.Errorf("status code %d", statusCode)
		}
	}

	// If live fetch failed, check if we have a recent cached frame (<30s old)
	c.mu.Lock()
	if cached, ok := c.snapshotCache[ip]; ok && time.Since(cached.timestamp) < 30*time.Second {
		c.mu.Unlock()
		return cached.data, nil
	}
	c.mu.Unlock()

	return nil, fmt.Errorf("snapshot fetch failed for %s: %w", ip, lastErr)
}

// AutoDetect probes the camera to automatically identify whether it uses ISAPI or Legacy endpoints.
func (c *CameraClient) AutoDetect(ip, username, password string) (bool, string, error) {
	// 1. Try ISAPI endpoints first (standard on Hikvision 5.5+ and HiLook)
	isapiPaths := []string{
		"/ISAPI/System/deviceInfo",
		"/ISAPI/Streaming/Channels/101/picture",
		"/ISAPI/Streaming/Channels/102/picture",
	}
	for _, p := range isapiPaths {
		data, statusCode, _, err := c.DoRequest(ip, username, password, "GET", p, nil, "")
		if err == nil && statusCode == http.StatusOK && len(data) > 0 {
			return true, fmt.Sprintf("Success! Connected via ISAPI protocol (%d bytes received)", len(data)), nil
		}
	}

	// 2. Try Legacy endpoints (Hikvision older firmware)
	legacyPaths := []string{
		"/Streaming/channels/102/picture",
		"/Streaming/channels/101/picture",
		"/System/deviceInfo",
	}
	for _, p := range legacyPaths {
		data, statusCode, _, err := c.DoRequest(ip, username, password, "GET", p, nil, "")
		if err == nil && statusCode == http.StatusOK && len(data) > 0 {
			return false, fmt.Sprintf("Success! Connected via Legacy protocol (%d bytes received)", len(data)), nil
		}
	}

	return false, "", fmt.Errorf("could not connect to camera at %s with provided credentials", ip)
}

// TestConnection tests whether the camera is reachable and auto-detects ISAPI vs Legacy protocol.
func (c *CameraClient) TestConnection(ip, username, password string) (bool, string, error) {
	return c.AutoDetect(ip, username, password)
}

// DoRequest sends an HTTP request to the camera with automatic Digest Authentication (and Basic fallback).
// Returns (responseBody, statusCode, contentType, error).
func (c *CameraClient) DoRequest(ip, username, password, method, path string, body []byte, contentType string) ([]byte, int, string, error) {
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}

	targetURL := fmt.Sprintf("http://%s%s", ip, path)
	hostKey := fmt.Sprintf("%s@%s", username, ip)

	c.mu.Lock()
	session := c.digestCache[hostKey]
	c.mu.Unlock()

	// 1. If we have a cached digest session, attempt authenticated request directly
	if session != nil {
		data, statusCode, respContentType, err := c.sendDigestRequest(method, targetURL, username, password, session, body, contentType)
		if err == nil && statusCode != http.StatusUnauthorized {
			return data, statusCode, respContentType, nil
		}
		// If nonce expired or invalidated, clear session and fall through to challenge
		if statusCode == http.StatusUnauthorized {
			c.mu.Lock()
			delete(c.digestCache, hostKey)
			c.mu.Unlock()
		}
	}

	// 2. Initial challenge request (send GET or actual method to get 401 challenge header)
	reqMethod := method
	var reqBody io.Reader
	if len(body) > 0 {
		reqBody = bytes.NewReader(body)
	}

	req, err := http.NewRequest(reqMethod, targetURL, reqBody)
	if err != nil {
		return nil, 0, "", err
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, 0, "", err
	}
	defer resp.Body.Close()

	respContentType := resp.Header.Get("Content-Type")

	// If request succeeded without auth (e.g. unauthenticated device or session cookie)
	if resp.StatusCode != http.StatusUnauthorized {
		respData, err := io.ReadAll(resp.Body)
		return respData, resp.StatusCode, respContentType, err
	}

	authHeader := resp.Header.Get("WWW-Authenticate")
	if authHeader == "" {
		// Try Basic auth fallback
		var basicBody io.Reader
		if len(body) > 0 {
			basicBody = bytes.NewReader(body)
		}
		reqBasic, err := http.NewRequest(method, targetURL, basicBody)
		if err != nil {
			return nil, 0, "", err
		}
		reqBasic.SetBasicAuth(username, password)
		if contentType != "" {
			reqBasic.Header.Set("Content-Type", contentType)
		}

		respBasic, err := c.client.Do(reqBasic)
		if err != nil {
			return nil, 0, "", err
		}
		defer respBasic.Body.Close()
		respBasicData, err := io.ReadAll(respBasic.Body)
		return respBasicData, respBasic.StatusCode, respBasic.Header.Get("Content-Type"), err
	}

	// 3. Parse Digest challenge and create new session
	digestParams := parseDigestHeader(authHeader)
	newSession := &digestSession{
		realm:     digestParams["realm"],
		nonce:     digestParams["nonce"],
		qop:       digestParams["qop"],
		opaque:    digestParams["opaque"],
		algorithm: digestParams["algorithm"],
		ncCount:   0,
	}
	if newSession.algorithm == "" {
		newSession.algorithm = "MD5"
	}

	c.mu.Lock()
	c.digestCache[hostKey] = newSession
	c.mu.Unlock()

	// 4. Send authenticated Digest request
	return c.sendDigestRequest(method, targetURL, username, password, newSession, body, contentType)
}

func (c *CameraClient) sendDigestRequest(method, targetURL, username, password string, session *digestSession, body []byte, contentType string) ([]byte, int, string, error) {
	var bodyReader io.Reader
	if len(body) > 0 {
		bodyReader = bytes.NewReader(body)
	}

	req, err := http.NewRequest(method, targetURL, bodyReader)
	if err != nil {
		return nil, 0, "", err
	}

	parsedURL, err := url.Parse(targetURL)
	if err != nil {
		return nil, 0, "", err
	}

	uri := parsedURL.RequestURI()
	if uri == "" {
		uri = "/"
	}

	session.ncCount++
	nc := fmt.Sprintf("%08x", session.ncCount)
	cnonce := randomHex(8)

	ha1 := md5Hex(fmt.Sprintf("%s:%s:%s", username, session.realm, password))
	ha2 := md5Hex(fmt.Sprintf("%s:%s", method, uri))

	var response string
	if strings.Contains(session.qop, "auth") {
		response = md5Hex(fmt.Sprintf("%s:%s:%s:%s:auth:%s", ha1, session.nonce, nc, cnonce, ha2))
	} else {
		response = md5Hex(fmt.Sprintf("%s:%s:%s", ha1, session.nonce, ha2))
	}

	authVal := fmt.Sprintf(`Digest username="%s", realm="%s", nonce="%s", uri="%s", response="%s"`,
		username, session.realm, session.nonce, uri, response)

	if strings.Contains(session.qop, "auth") {
		authVal += fmt.Sprintf(`, qop="auth", nc=%s, cnonce="%s"`, nc, cnonce)
	}
	if session.opaque != "" {
		authVal += fmt.Sprintf(`, opaque="%s"`, session.opaque)
	}

	req.Header.Set("Authorization", authVal)
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, 0, "", err
	}
	defer resp.Body.Close()

	respContentType := resp.Header.Get("Content-Type")
	respData, err := io.ReadAll(resp.Body)
	return respData, resp.StatusCode, respContentType, err
}

func parseDigestHeader(header string) map[string]string {
	result := make(map[string]string)
	if !strings.HasPrefix(header, "Digest ") {
		return result
	}
	header = strings.TrimPrefix(header, "Digest ")
	parts := strings.Split(header, ",")
	for _, part := range parts {
		part = strings.TrimSpace(part)
		kv := strings.SplitN(part, "=", 2)
		if len(kv) == 2 {
			k := strings.TrimSpace(kv[0])
			v := strings.Trim(strings.TrimSpace(kv[1]), `"`)
			result[k] = v
		}
	}
	return result
}

func md5Hex(data string) string {
	h := md5.Sum([]byte(data))
	return hex.EncodeToString(h[:])
}

func randomHex(n int) string {
	bytes := make([]byte, n)
	_, _ = rand.Read(bytes)
	return hex.EncodeToString(bytes)
}
