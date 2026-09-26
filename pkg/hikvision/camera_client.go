package hikvision

import (
	"bytes"
	"context"
	"crypto/md5"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os/exec"
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

// DetectAudioCapabilities checks whether the camera supports audio input (microphone/recording audio)
// and audio output (speaker/two-way audio talkback).
func (c *CameraClient) DetectAudioCapabilities(ip, username, password string, isISAPI bool) (bool, bool, error) {
	if ip == "" {
		return false, false, fmt.Errorf("camera IP is empty")
	}

	hasInput := false
	hasOutput := false

	if username != "" {
		// 1. Check TwoWayAudio channels (speaker / output)
		twoWayData, code, _, err := c.DoRequest(ip, username, password, "GET", "/ISAPI/System/TwoWayAudio/channels", nil, "")
		if err == nil && code == http.StatusOK && strings.Contains(string(twoWayData), "<TwoWayAudioChannel") {
			hasOutput = true
			hasInput = true // Cameras with speaker also support audio input
		}

		// 2. Check Audio channels (microphone / input)
		if !hasInput {
			audioData, code, _, err := c.DoRequest(ip, username, password, "GET", "/ISAPI/System/Audio/channels", nil, "")
			if err == nil && code == http.StatusOK && strings.Contains(string(audioData), "<AudioChannel") {
				hasInput = true
			}
		}
	}

	// 3. Fallback or non-ISAPI check: probe RTSP mainstream audio track with ffprobe
	if !hasInput && username != "" {
		rtspURL := fmt.Sprintf("rtsp://%s:%s@%s:554/Streaming/Channels/101", url.QueryEscape(username), url.QueryEscape(password), ip)
		ctx, cancel := context.WithTimeout(context.Background(), 2500*time.Millisecond)
		defer cancel()
		cmd := exec.CommandContext(ctx, "ffprobe", "-rtsp_transport", "tcp", "-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "csv=p=0", rtspURL)
		out, probeErr := cmd.Output()
		if probeErr == nil && strings.Contains(string(out), "audio") {
			hasInput = true
		}
	}

	return hasInput, hasOutput, nil
}

// DetectStreamCapabilities checks whether the camera supports a 2nd stream (sub-stream / channel 102).
func (c *CameraClient) DetectStreamCapabilities(ip, username, password string, isISAPI bool) (bool, error) {
	if ip == "" {
		return false, fmt.Errorf("camera IP is empty")
	}

	// 1. Try fast HTTP stream query endpoints (ISAPI and legacy)
	httpPaths := []string{
		"/ISAPI/Streaming/channels/102",
		"/ISAPI/Streaming/Channels/102",
		"/Streaming/channels/102",
		"/Streaming/Channels/102",
	}
	for _, p := range httpPaths {
		data, code, _, err := c.DoRequest(ip, username, password, "GET", p, nil, "")
		if err == nil && code == http.StatusOK && len(data) > 0 {
			return true, nil
		}
	}

	// Also check /ISAPI/Streaming/channels list
	data, code, _, err := c.DoRequest(ip, username, password, "GET", "/ISAPI/Streaming/channels", nil, "")
	if err == nil && code == http.StatusOK {
		body := string(data)
		if strings.Contains(body, "<StreamingChannel") && (strings.Contains(body, "102") || strings.Contains(body, "sub")) {
			return true, nil
		}
	}

	// 2. RTSP probe with ffprobe on channel 102 / sub stream (fallback)
	if username != "" {
		userEsc := url.QueryEscape(username)
		passEsc := url.QueryEscape(password)
		candidates := []string{
			fmt.Sprintf("rtsp://%s:%s@%s:554/Streaming/channels/102", userEsc, passEsc, ip),
			fmt.Sprintf("rtsp://%s:%s@%s:554/Streaming/Channels/102", userEsc, passEsc, ip),
			fmt.Sprintf("rtsp://%s:%s@%s:554/h264/ch1/sub/av_stream", userEsc, passEsc, ip),
		}
		for _, rtspURL := range candidates {
			ctx, cancel := context.WithTimeout(context.Background(), 3500*time.Millisecond)
			cmd := exec.CommandContext(ctx, "ffprobe", "-rtsp_transport", "tcp", "-select_streams", "v:0", "-show_entries", "stream=codec_type", "-of", "csv=p=0", rtspURL)
			out, err := cmd.Output()
			cancel()
			if err == nil && strings.Contains(string(out), "video") {
				return true, nil
			}
		}
	}

	return false, nil
}

// SendTwoWayAudio streams an audio snippet (encoded as G.711 A-law 8000Hz mono) to the camera speaker.
func (c *CameraClient) SendTwoWayAudio(ip, username, password string, alawData []byte) error {
	if len(alawData) == 0 {
		return fmt.Errorf("empty audio data")
	}

	client := &http.Client{Timeout: 10 * time.Second}

	// 1. Ensure any previous session on channel 1 is closed
	_, _, _ = c.sendRequestWithFreshDigest(client, "PUT", "/ISAPI/System/TwoWayAudio/channels/1/close", ip, username, password, nil, "")

	// 2. Open channel 1
	openBody, openCode, err := c.sendRequestWithFreshDigest(client, "PUT", "/ISAPI/System/TwoWayAudio/channels/1/open", ip, username, password, nil, "")
	if err != nil {
		return fmt.Errorf("failed to open two-way audio channel: %w", err)
	}
	if openCode != http.StatusOK {
		return fmt.Errorf("camera rejected two-way audio open (status %d): %s", openCode, string(openBody))
	}

	// 3. Stream audio data with Content-Type: application/octet-stream
	dataBody, dataCode, err := c.sendRequestWithFreshDigest(client, "PUT", "/ISAPI/System/TwoWayAudio/channels/1/audioData", ip, username, password, alawData, "application/octet-stream")
	if err != nil {
		_, _, _ = c.sendRequestWithFreshDigest(client, "PUT", "/ISAPI/System/TwoWayAudio/channels/1/close", ip, username, password, nil, "")
		return fmt.Errorf("failed to transmit audio data: %w", err)
	}
	if dataCode != http.StatusOK && dataCode != http.StatusNoContent {
		_, _, _ = c.sendRequestWithFreshDigest(client, "PUT", "/ISAPI/System/TwoWayAudio/channels/1/close", ip, username, password, nil, "")
		return fmt.Errorf("camera returned error on audioData (status %d): %s", dataCode, string(dataBody))
	}

	// 4. Close channel 1
	_, _, _ = c.sendRequestWithFreshDigest(client, "PUT", "/ISAPI/System/TwoWayAudio/channels/1/close", ip, username, password, nil, "")

	return nil
}

func (c *CameraClient) sendRequestWithFreshDigest(client *http.Client, method, urlPath, ip, user, pass string, data []byte, contentType string) ([]byte, int, error) {
	if client == nil {
		client = c.client
	}
	fullURL := fmt.Sprintf("http://%s%s", ip, urlPath)

	// Probe for 401 challenge without sending payload body
	probeReq, err := http.NewRequest(method, fullURL, nil)
	if err != nil {
		return nil, 0, err
	}
	probeResp, err := client.Do(probeReq)
	if err != nil {
		return nil, 0, err
	}
	defer probeResp.Body.Close()

	if probeResp.StatusCode != http.StatusUnauthorized {
		b, err := io.ReadAll(probeResp.Body)
		return b, probeResp.StatusCode, err
	}

	authHeader := probeResp.Header.Get("WWW-Authenticate")
	params := parseDigestHeader(authHeader)

	realm := params["realm"]
	nonce := params["nonce"]
	qop := params["qop"]
	opaque := params["opaque"]
	nc := "00000001"
	cnonce := randomHex(8)

	ha1 := md5Hex(fmt.Sprintf("%s:%s:%s", user, realm, pass))
	ha2 := md5Hex(fmt.Sprintf("%s:%s", method, urlPath))
	var response string
	if strings.Contains(qop, "auth") {
		response = md5Hex(fmt.Sprintf("%s:%s:%s:%s:auth:%s", ha1, nonce, nc, cnonce, ha2))
	} else {
		response = md5Hex(fmt.Sprintf("%s:%s:%s", ha1, nonce, ha2))
	}

	authVal := fmt.Sprintf(`Digest username="%s", realm="%s", nonce="%s", uri="%s", response="%s"`,
		user, realm, nonce, urlPath, response)
	if strings.Contains(qop, "auth") {
		authVal += fmt.Sprintf(`, qop="auth", nc=%s, cnonce="%s"`, nc, cnonce)
	}
	if opaque != "" {
		authVal += fmt.Sprintf(`, opaque="%s"`, opaque)
	}

	var bodyReader io.Reader
	if len(data) > 0 {
		bodyReader = bytes.NewReader(data)
	}
	req, err := http.NewRequest(method, fullURL, bodyReader)
	if err != nil {
		return nil, 0, err
	}
	req.Close = true
	req.Header.Set("Authorization", authVal)
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	if len(data) > 0 {
		req.ContentLength = int64(len(data))
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		return []byte("<ok/>"), resp.StatusCode, nil
	}

	respBody, err := io.ReadAll(resp.Body)
	return respBody, resp.StatusCode, err
}
