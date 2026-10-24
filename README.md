# 🪝 TV Hooks Manager for LG webOS (OLED G5 / webOS 24/25)

An all-in-one automation platform and hook manager for rooted LG webOS Smart TVs. 

Features a **native on-screen TV app** (controlled with your Magic Remote) and a **web dashboard** accessible from any PC or phone browser on your local network.

---

## 🌟 Features

- **🎮 Dual-Interface Management**:
  - **On-Screen TV App**: Appears directly in your webOS Home bar. Full Magic Remote & D-Pad navigation.
  - **PC / Mobile Web Dashboard**: Open `http://<tv-ip>:8989` from your computer or phone to manage hooks with full mouse and keyboard.
- **🔊 Built-In LG S95TR Soundbar Auto-Switcher**:
  - Seamlessly switches to **Direct HDMI IN** on the soundbar when PC (HDMI 1) is active.
  - Automatically restores **HDMI eARC** when opening TV apps (YouTube, Netflix, Home, etc.).
  - Includes TV HDMI handshake race-condition compensation (defeats CEC overrides).
- **⚡ Background Supervisor Daemon**:
  - Automatically launches enabled hooks on TV boot (`/var/lib/webosbrew/init.d/80-tvhooks`).
  - Monitors processes, captures real-time logs, and auto-restarts hooks if they terminate.
- **✨ Custom Hook Creator**:
  - Add your own hooks directly from the UI with built-in templates (Foreground App Listeners, Timers, Custom Luna calls).
- **📜 Live Log Streaming**:
  - View real-time output from any running hook with the click of a button.

---

## 📁 Repository Structure

```text
LG-TVHooks/
├── app/                          # Native webOS TV App & Web Dashboard
│   ├── appinfo.json              # webOS app registration manifest
│   ├── index.html                # OLED Pitch-Black UI
│   ├── styles.css                # Glassmorphism styling & Remote D-Pad focus
│   ├── app.js                    # Remote navigation & REST controller
│   ├── icon.png                  # TV Launcher icon (80x80)
│   └── largeIcon.png             # Store banner icon (130x130)
├── service/                      # Background Supervisor Service
│   ├── server.js                 # HTTP REST API & process supervisor (Node.js)
│   └── hooks/                    # Hook scripts registry
│       └── soundbar-switcher.js  # S95TR Soundbar auto-switcher
├── scripts/                      # Deployment & Utility Scripts
│   ├── install.sh                # Target TV install script
│   ├── uninstall.sh              # Cleanup / uninstall script
│   └── generate-icons.js         # Lossless PNG icon generator
├── tvhooks-bundle.tar.gz         # Packaged deployment bundle
└── AudioSwitchigHook/            # Standalone reference files
```

---

## 🚀 One-Command Deployment to Your TV

To copy and install **TV Hooks** to your TV, run this from your PC PowerShell (or copy the bundle via SCP):

```powershell
# 1. Copy the bundle to your TV
scp D:\Development\Projects\LG-TVHooks\tvhooks-bundle.tar.gz root@192.168.1.72:/tmp/

# 2. Extract and run the installer on the TV
ssh root@192.168.1.72 "mkdir -p /tmp/tvhooks-bundle && tar -xzf /tmp/tvhooks-bundle.tar.gz -C /tmp/tvhooks-bundle && sh /tmp/tvhooks-bundle/scripts/install.sh && rm -rf /tmp/tvhooks-bundle*"
```

---

## 🖥️ How to Use

1. **On your PC Browser**:
   - Go to `http://192.168.1.72:8989`
   - You will see the **TV Hooks** dashboard with your S95TR soundbar hook listed and toggleable!
2. **On your TV**:
   - Press the **Home** button on your Magic Remote.
   - Look for the new **TV Hooks** app icon on your home bar.
   - Click it with your remote to open the full on-screen dashboard.

---

## 🛠️ How to Uninstall (If Ever Needed)

Run this command in your TV SSH terminal to completely remove the TV app, background service, and boot autostart hooks:

```sh
pkill -f "tvhooks/server.js" 2>/dev/null
pkill -f "soundbar-switcher.js" 2>/dev/null
rm -f /var/lib/webosbrew/init.d/80-tvhooks
rm -rf /media/developer/apps/usr/palm/applications/org.webosbrew.tvhooks
rm -rf /var/lib/tvhooks
luna-send -n 1 luna://com.webos.service.applicationmanager/rescanApp '{"category":["apps"]}'
```
