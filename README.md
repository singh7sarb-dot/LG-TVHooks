# 🪝 TV Hooks Manager for LG webOS (OLED G5 / webOS 24/25)

An open-source automation platform, signal router, and hook supervisor for rooted LG webOS Smart TVs. 

Features a **native on-screen TV app** (controlled with your Magic Remote) and a **web dashboard** accessible from any PC or phone browser on your local network.

[![webOS](https://img.shields.io/badge/webOS-11%20(24%2F25)-red.svg)](https://rootmy.tv)
[![Root Required](https://img.shields.io/badge/Root-Required-brightgreen.svg)](#-root-prerequisites--why-root-is-required)
[![Platform](https://img.shields.io/badge/Platform-Node.js%20v20-blue.svg)](https://nodejs.org)
[![License](https://img.shields.io/badge/License-MIT-purple.svg)](LICENSE)

---

## 🌟 Key Features

- **🎮 Dual-Interface Management**:
  - **On-Screen TV App**: Appears directly in your webOS Home launcher bar. Full Magic Remote & D-Pad navigation. Shows live local web URL on the header.
  - **PC & Mobile Web Dashboard**: Open `http://<tv-ip>:8989` from any computer or phone on your home network to manage hooks with full mouse, keyboard, and code editor.
- **🔊 Built-In S95TR Soundbar Auto-Switcher**:
  - Automatically switches soundbar to **Direct HDMI IN** when PC (HDMI 1) is active.
  - Seamlessly restores **HDMI eARC** when opening TV apps (YouTube, Netflix, Home, Plex, etc.).
  - Defeats the TV's internal HDMI-CEC eARC handshake race condition via handshake delay and state reaffirmation.
- **⚡ Background Supervisor Daemon**:
  - Automatically launches enabled hooks on TV boot via `/var/lib/webosbrew/init.d/80-tvhooks`.
  - Monitors background processes, captures real-time logs, and auto-restarts hooks if they terminate.
- **✨ Custom Hook Creator**:
  - Add your own hooks directly from the UI with built-in templates (Foreground App Listeners, Periodic Timers, Custom Luna calls).
- **📜 Live Log Streaming**:
  - View real-time output from any running hook with the click of a button.

---

## ⚠️ Root Prerequisites & Why Root is Required

> [!IMPORTANT]
> **This project requires a rooted LG webOS TV.** 
> Unrooted consumer webOS firmware restricts third-party apps to a strict security sandbox that prevents background services, hardware bus access, and autostart capabilities.

### Why Root is Mandatory:
1. **Low-Level Bluetooth / GATT Access (`blegattsoundbar`)**:
   Standard webOS apps cannot send raw Luna calls to `com.webos.service.blegattsoundbar` or spoof the caller ID `-a com.webos.app.soundbar-setting`. Root elevation allows our background daemon to send raw "AT" packets directly to your LG Soundbar over BLE GATT.
2. **Foreground App Surveillance (`com.webos.service.applicationmanager`)**:
   Subscribing to real-time foreground app changes (`getForegroundAppInfo {"subscribe":true}`) requires elevated system permissions to monitor active HDMI inputs and native apps.
3. **Persistent Boot Autostart (`/var/lib/webosbrew/init.d/`)**:
   Without root, webOS terminates all third-party processes when the TV enters standby or screen off. Root access via [webosbrew](https://github.com/webosbrew/webos-homebrew-channel) provides the `/var/lib/webosbrew/init.d/` daemon runner, ensuring your hooks start automatically on every boot.

### Root Requirements Checklist:
- ✅ LG Smart TV rooted via [Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel) or [RootMyTV](https://rootmy.tv/).
- ✅ SSH or Telnet server enabled in Homebrew Channel settings.
- ✅ Node.js runtime installed on the TV (built-in on webOS 24/25, or available via opkg).

---

## 📦 Installation Guide

### Option 1: Via webOS Dev Manager (Recommended / GUI)

1. Download the latest IPK package:
   👉 **[`org.webosbrew.tvhooks_1.0.0_all.ipk`](./org.webosbrew.tvhooks_1.0.0_all.ipk)**
2. Open **[webOS Dev Manager](https://github.com/webosbrew/dev-manager-desktop)** on your PC.
3. Ensure your TV is connected.
4. Click **Install** (or drag & drop the `.ipk` file into the window).
5. Open your browser on PC:
   👉 `http://<your-tv-ip>:8989`
6. Look at your TV's Home bar — launch **TV Hooks** directly with your remote!

---

### Option 2: Via Command Line / SSH Terminal

If you have an active SSH terminal into your TV (`root@LGwebOSTV`):

```sh
# 1. Download the IPK package to /tmp
curl -L -o /tmp/tvhooks.ipk "https://github.com/singh7sarb-dot/LG-TVHooks/raw/main/org.webosbrew.tvhooks_1.0.0_all.ipk"

# 2. Install using opkg
opkg install --force-reinstall /tmp/tvhooks.ipk
rm -f /tmp/tvhooks.ipk

# 3. Refresh TV Home Launcher
luna-send -n 1 luna://com.webos.service.applicationmanager/rescanApp '{"category":["apps"]}'
```

---

## 🔬 Technical Deep-Dive: S95TR Soundbar Control

### 1. Luna GATT Service
LG webOS communicates with WOW Orchestra / LG Soundbars via `luna://com.webos.service.blegattsoundbar/setCommand`.

- **Target Service**: `com.webos.service.blegattsoundbar`
- **Method**: `setCommand`
- **Caller Identity**: `-a com.webos.app.soundbar-setting`
- **Payload Schema**: `{"address": "<SOUNDBAR_MAC>", "packet": "<BASE64_AT_PACKET>"}`

### 2. LG "AT" Packet Framing Protocol
LG Soundbars use a proprietary serial frame wrapped inside Bluetooth LE GATT characteristics:

```text
[0x41] [0x54] [Major] [Minor] [Length] [Data 0..N] [Checksum]
  ▲      ▲       ▲       ▲       ▲         ▲           ▲
  |      |       |       |       |         |           |
  +-- "AT" Sync  |       |       |         |           +-- 2's Complement Checksum
                 |       |       |         +-- Mode Value (e.g. 0x03 for HDMI IN)
                 |       |       +-- Payload Data Length
                 |       +-- Minor Command (0x01 = SetMode)
                 +-- Major Command (0x00 = GeneralControl)
```

**Checksum Calculation**:
$$\text{Checksum} = (1 + \sim(\text{Length} + \sum \text{Data})) \ \& \ \text{0xFF}$$

### 3. Mode Encoding Reference

| Input Mode | ID | Binary Bytes (Hex) | Base64 Encoded Packet |
| :--- | :---: | :--- | :--- |
| **HDMI IN** (PC Direct) | `3` | `41 54 00 01 01 03 FC` | `QVQAAQED/A==` |
| **OPTICAL_HDMI_ARC / eARC** | `1` | `41 54 00 01 01 01 FE` | `QVQAAQEB/g==` |
| **HDMI_EARC** (Direct) | `6` | `41 54 00 01 01 06 F9` | `QVQAAQEG+Q==` |
| **WIFI** | `0` | `41 54 00 01 01 00 FF` | `QVQAAQEA/w==` |
| **BLUETOOTH** | `2` | `41 54 00 01 01 02 FD` | `QVQAAQEC/Q==` |

### 4. Defeating the HDMI-CEC Handshake Race Condition
When switching the TV to HDMI 1 (PC), webOS performs an HDMI signal sync and CEC audio handshake that takes **~2.5 seconds**. During this sync, webOS sends an internal command that reverts the soundbar to `HDMI eARC`.

**The Solution implemented in TV Hooks**:
1. When `com.webos.app.hdmi1` is detected, wait **2.5 seconds** for the TV's internal handshake to complete.
2. Send `QVQAAQED/A==` to switch to **HDMI IN**.
3. Send a **reaffirmation pulse** at 5.0 seconds to ensure the soundbar permanently holds HDMI IN.
4. When leaving PC mode, switch immediately back to `HDMI eARC` (`QVQAAQEB/g==`).

---

## 📁 Repository Structure

```text
LG-TVHooks/
├── app/                          # Native on-screen TV App & Web Dashboard
│   ├── appinfo.json              # webOS app registration manifest
│   ├── index.html                # OLED Pitch-Black UI
│   ├── styles.css                # Glassmorphism styling & Remote D-Pad focus
│   ├── app.js                    # Remote navigation & REST controller
│   ├── icon.png                  # TV Launcher icon (80x80)
│   └── largeIcon.png             # Store banner icon (130x130)
├── service/                      # Background Supervisor Service
│   ├── server.js                 # HTTP REST API & process supervisor (Node.js)
│   ├── services.json             # webOS service descriptor
│   ├── package.json              # Service metadata
│   └── hooks/                    # Hook scripts registry
│       └── soundbar-switcher.js  # S95TR Soundbar auto-switcher
├── scripts/                      # Deployment & Utility Scripts
│   ├── build-ipk.js              # IPK packager
│   ├── install.sh                # Target TV install script
│   └── uninstall.sh              # Cleanup / uninstall script
└── org.webosbrew.tvhooks_1.0.0_all.ipk  # Ready-to-install webOS package
```

---

## 🗑️ How to Uninstall

### Via webOS Dev Manager:
1. Locate **TV Hooks** in your installed apps list.
2. Click the dropdown arrow next to **Launch** → **Uninstall**.

### Via SSH Terminal:
```sh
luna-send-pub -n 1 'luna://com.webos.appInstallService/dev/remove' '{"id":"org.webosbrew.tvhooks"}'
pkill -f "tvhooks" 2>/dev/null
pkill -f "soundbar-switcher" 2>/dev/null
rm -f /var/lib/webosbrew/init.d/80-tvhooks
rm -rf /var/lib/tvhooks
```

---

## 🤝 Contributing

Contributions, bug reports, and new custom hooks (e.g. ambient lighting sync, auto picture mode for consoles, game bar triggers) are welcome! Feel free to open an Issue or Pull Request.

## 📄 License

MIT License. Copyright (c) 2026 Sarbjeet Singh.
