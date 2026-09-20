package api

import (
	"encoding/json"
	"io/fs"
	"net/http"
	"strings"

	"github.com/bkbilly/hikvision-hub/pkg/auth"
	"github.com/bkbilly/hikvision-hub/pkg/db"
	"github.com/bkbilly/hikvision-hub/pkg/hikvision"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

type Config struct {
	DB           *db.DB
	Auth         *auth.AuthManager
	Streamer     *hikvision.Streamer
	CamClient    *hikvision.CameraClient
	Crawler      *hikvision.Crawler
	AlertManager *hikvision.AlertStreamManager
	StaticFS     fs.FS
	AppVersion   string
}

func SetupRouter(cfg Config) http.Handler {
	r := chi.NewRouter()

	// Global Middlewares
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	// CORS configuration for local development / mobile access
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link", "Content-Length", "Content-Range", "Accept-Ranges"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	authHandler := NewAuthHandler(cfg.DB, cfg.Auth)
	camHandler := NewCameraHandler(cfg.DB, cfg.CamClient, cfg.Crawler, cfg.AlertManager)
	eventHandler := NewEventHandler(cfg.DB, cfg.Crawler, cfg.AlertManager)
	videoHandler := NewVideoHandler(cfg.DB, cfg.Streamer)
	bookmarkHandler := NewBookmarkHandler(cfg.DB)
	wsHandler := NewWSHandler(cfg.DB, cfg.CamClient, cfg.AlertManager)
	sysHandler := NewSystemHandler(cfg.DB, cfg.Crawler, cfg.Streamer, cfg.AppVersion)
	isapiHandler := NewISAPIHandler(cfg.DB, cfg.CamClient)

	// API Subrouter
	r.Route("/api", func(r chi.Router) {
		r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
			writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "version": cfg.AppVersion})
		})

		// Public Auth
		r.Post("/auth/login", authHandler.Login)

		// Protected Routes
		r.Group(func(r chi.Router) {
			r.Use(cfg.Auth.Middleware)

			// Auth routes
			r.Post("/auth/logout", authHandler.Logout)
			r.Get("/auth/me", authHandler.Me)
			r.Post("/auth/change-password", authHandler.ChangePassword)

			// Camera routes
			r.Get("/cameras", camHandler.List)
			r.Post("/cameras", camHandler.Create)
			r.Put("/cameras/reorder", camHandler.Reorder)
			r.Get("/cameras/discover", camHandler.Discover)
			r.Post("/cameras/probe", camHandler.Probe)
			r.Get("/cameras/{id}", camHandler.Get)
			r.Put("/cameras/{id}", camHandler.Update)
			r.Delete("/cameras/{id}", camHandler.Delete)
			r.Post("/cameras/test-connection", camHandler.TestConnection)
			r.Post("/cameras/discover-path", camHandler.DiscoverPath)
			r.Get("/cameras/{id}/snapshot", camHandler.Snapshot)
			r.Get("/cameras/{id}/live", camHandler.StreamLive)
			r.Get("/ws/live", wsHandler.StreamLiveWS)
			r.Get("/ws/events", wsHandler.StreamEventsWS)
			r.Get("/cameras/{id}/video", videoHandler.StreamClip)
			r.Get("/cameras/{id}/thumbnail", videoHandler.StreamThumbnail)
			r.Get("/cameras/{id}/picture", videoHandler.StreamPicture)

			// Camera ISAPI Device Configuration routes
			r.Get("/cameras/{id}/isapi/capabilities", isapiHandler.GetCapabilities)
			r.Get("/cameras/{id}/isapi/device-info", isapiHandler.GetDeviceInfo)
			r.Get("/cameras/{id}/isapi/time", isapiHandler.GetTime)
			r.Put("/cameras/{id}/isapi/time", isapiHandler.SetTime)
			r.Post("/cameras/{id}/isapi/sync-time", isapiHandler.SyncTime)
			r.Get("/cameras/{id}/isapi/ntp", isapiHandler.GetNTP)
			r.Put("/cameras/{id}/isapi/ntp", isapiHandler.SetNTP)
			r.Get("/cameras/{id}/isapi/image", isapiHandler.GetImage)
			r.Put("/cameras/{id}/isapi/image", isapiHandler.SetImage)
			r.Get("/cameras/{id}/isapi/video/{channel}", isapiHandler.GetStream)
			r.Put("/cameras/{id}/isapi/video/{channel}", isapiHandler.SetStream)
			r.Get("/cameras/{id}/isapi/motion", isapiHandler.GetMotion)
			r.Put("/cameras/{id}/isapi/motion", isapiHandler.SetMotion)
			r.Get("/cameras/{id}/isapi/line-detection", isapiHandler.GetLineDetection)
			r.Put("/cameras/{id}/isapi/line-detection", isapiHandler.SetLineDetection)
			r.Get("/cameras/{id}/isapi/intrusion", isapiHandler.GetIntrusion)
			r.Put("/cameras/{id}/isapi/intrusion", isapiHandler.SetIntrusion)
			r.Get("/cameras/{id}/isapi/region-entrance", isapiHandler.GetRegionEntrance)
			r.Put("/cameras/{id}/isapi/region-entrance", isapiHandler.SetRegionEntrance)
			r.Get("/cameras/{id}/isapi/region-exiting", isapiHandler.GetRegionExiting)
			r.Put("/cameras/{id}/isapi/region-exiting", isapiHandler.SetRegionExiting)
			r.Get("/cameras/{id}/isapi/tamper", isapiHandler.GetTamper)
			r.Put("/cameras/{id}/isapi/tamper", isapiHandler.SetTamper)
			r.Get("/cameras/{id}/isapi/privacy-mask", isapiHandler.GetPrivacyMask)
			r.Put("/cameras/{id}/isapi/privacy-mask", isapiHandler.SetPrivacyMask)
			r.Get("/cameras/{id}/isapi/unattended-baggage", isapiHandler.GetUnattendedBaggage)
			r.Put("/cameras/{id}/isapi/unattended-baggage", isapiHandler.SetUnattendedBaggage)
			r.Get("/cameras/{id}/isapi/object-removal", isapiHandler.GetObjectRemoval)
			r.Put("/cameras/{id}/isapi/object-removal", isapiHandler.SetObjectRemoval)
			r.Get("/cameras/{id}/isapi/storage", isapiHandler.GetStorage)
			r.Post("/cameras/{id}/isapi/storage/{hddId}/format", isapiHandler.FormatStorage)
			r.Post("/cameras/{id}/isapi/reboot", isapiHandler.Reboot)
			r.Post("/cameras/{id}/isapi/ptz/control", isapiHandler.PTZControl)
			r.Get("/cameras/{id}/isapi/ptz/presets", isapiHandler.GetPTZPresets)
			r.Post("/cameras/{id}/isapi/ptz/goto", isapiHandler.PTZGoto)
			r.HandleFunc("/cameras/{id}/isapi/proxy", isapiHandler.Proxy)

			// Event routes
			r.Get("/events", eventHandler.GetEvents)
			r.Get("/events/live", eventHandler.GetLiveEvents)
			r.Get("/events/dates", eventHandler.GetRecordingDates)

			// Bookmark routes
			r.Get("/bookmarks", bookmarkHandler.List)
			r.Post("/bookmarks", bookmarkHandler.Create)
			r.Put("/bookmarks/{id}", bookmarkHandler.Update)
			r.Delete("/bookmarks/{id}", bookmarkHandler.Delete)

			// System routes
			r.Get("/system/status", sysHandler.Status)
			r.Post("/system/rescan", sysHandler.Rescan)
			r.Post("/system/clear-cache", sysHandler.ClearCache)
		})
	})

	// Static Web Assets / Single Page Application fallback
	if cfg.StaticFS != nil {
		fileServer := http.FileServer(http.FS(cfg.StaticFS))
		r.Get("/*", func(w http.ResponseWriter, r *http.Request) {
			path := strings.TrimPrefix(r.URL.Path, "/")
			if path == "" {
				path = "index.html"
			}
			if path == "favicon.ico" {
				if _, err := cfg.StaticFS.Open("favicon.ico"); err != nil {
					r.URL.Path = "/favicon.svg"
					fileServer.ServeHTTP(w, r)
					return
				}
			}

			// Check if file exists in static FS
			f, err := cfg.StaticFS.Open(path)
			if err == nil {
				f.Close()
				fileServer.ServeHTTP(w, r)
				return
			}

			// If route is not found and not an API call, serve index.html for SPA client-side routing
			if !strings.HasPrefix(r.URL.Path, "/api") {
				r.URL.Path = "/"
				fileServer.ServeHTTP(w, r)
				return
			}

			http.NotFound(w, r)
		})
	}

	return r
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func writeJSONError(w http.ResponseWriter, message string, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
}
