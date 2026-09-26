# Hikvision Hub (v2)

A modern, fast web interface for **Hikvision** and **HiLook** IP cameras, NAS storage, and SD card recordings.

---

## ✨ Features

- 📺 **Live Multi-Camera View**: Watch all cameras simultaneously with fast, smooth streaming that automatically switches to high quality in fullscreen. Pause feeds individually or all at once.
- 🎙️ **Two-Way Audio & Sound Boost**: Listen to live audio, speak back through the camera's speaker with push-to-talk, and boost volume up to 200%.
- ⏱️ **Interactive Timeline**: Scroll and zoom through 24-hour recordings down to the exact second, with instant playback and synchronized audio.
- 🚨 **Live Alerts**: Real-time notifications for motion, line crossing, and intrusion events.
- ⚙️ **In-Browser Camera Settings**: Adjust brightness, night vision, detection zones, and camera clock directly from your browser, no plugins required.
- 📷 **Snapshots & Bookmarks**: Browse saved pictures and bookmark important moments in recordings.
- 💾 **NAS & SD Card Storage**: Plays recordings and snapshots directly from camera storage (`info.bin`, `datadir*`, `.mp4`, `.pic`).
- 📱 **Mobile & Desktop Friendly**: Clean, touch-responsive design that works on phones, tablets, and desktop browsers.

---

## 🚀 Quick Start

### Run with Docker Compose

```yaml
# docker-compose.yml
services:
  hikvision-hub:
    image: bkbillybk/hikvision-hub:latest
    container_name: hikvision-hub
    restart: unless-stopped
    ports:
      - "8080:8080"
    volumes:
      - ./data:/app/data
      - /mnt/hikvision:/mnt:ro
    environment:
      - PORT=8080
      - DATA_DIR=/app/data
      - INITIAL_USER=admin
      - INITIAL_PASS=admin
      - TZ=UTC
```

Start the container:
```bash
docker compose up -d
```

Open `http://localhost:8080` in your browser.  
Default login: **`admin`** / **`admin`** *(changeable in Settings)*.

---

### Run from Source

```bash
# Build & run
make build
./hikvision-hub -port 8080 -data-dir ./data
```

---

## 🛠️ Background & Origin

This project originally started as an open-source PHP application called [**Hikvision Site**](https://hub.docker.com/r/bkbillybk/hikvision_site) designed to browse Hikvision NAS and SD card recordings in the browser without proprietary plugins. 

It has since been completely redesigned and rewritten from the ground up as a fast, standalone Go backend with an interactive React & TypeScript interface.

---

## 📄 License & Credits

- Created and maintained by [Vasilis Koulis (bkbilly)](https://github.com/bkbilly).
- Developed in collaboration with LLMs.
