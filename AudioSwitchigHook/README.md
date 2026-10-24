# LG TV Soundbar Automatic Input Switcher (LG OLED G5 + S95TR)

An intelligent, lightweight background daemon for rooted LG webOS TVs that automatically switches your LG Soundbar's active input between **Direct HDMI IN** and **HDMI eARC** based on the active TV screen/app.

---

## The Problem Solved

- **Hardware Setup**: 
  - **PC (RTX 4090)** connected directly to **TV HDMI 1** (4K 165Hz G-Sync HDR).
  - Audio cable from PC connected directly into the **LG S95TR Soundbar's HDMI IN** port.
  - Soundbar connected via **HDMI 2 eARC** to the TV for native TV audio (YouTube, Netflix, Plex, etc.).
- **The Annoyance**:
  - Whenever you switch the TV to HDMI 1 (PC), the soundbar remains on `HDMI eARC`. You were forced to open the LG ThinQ mobile app every time to tap "HDMI".
  - Even worse: if switched immediately, the TV's HDMI handshake (2–3 seconds after input selection) sends an internal CEC/eARC command that reverts the soundbar back to `HDMI eARC`!
- **The Solution**:
  - This hook daemon runs silently in the background of webOS.
  - Subscribes to Luna appmanager foreground events.
  - When you switch to PC, it waits 2.5 seconds for the TV handshake to finish, switches the soundbar to `HDMI`, and reaffirms at 5 seconds.
  - When you switch back to any native TV app (YouTube, Netflix, Home, etc.), it switches the soundbar back to `HDMI eARC` instantly.

---

## Technical Architecture & Discovery

### 1. Luna GATT Service
LG webOS manages LG Soundbars via `luna://com.webos.service.blegattsoundbar/setCommand`.

- **Soundbar BLE MAC**: `4e:dc:c2:03:37:02`
- **Method**: `setCommand`
- **Caller Identity**: `-a com.webos.app.soundbar-setting`

### 2. LG "AT" Binary Packet Framing
All BLE commands sent to LG Soundbars follow LG's proprietary AT protocol:

```text
Byte 0:  0x41 ('A') - Sync Byte 1
Byte 1:  0x54 ('T') - Sync Byte 2
Byte 2:  Major Command (0x00 = GeneralControl)
Byte 3:  Minor Command (0x01 = SetMode)
Byte 4:  Data Length (N)
Byte 5..5+N-1: Data bytes [Mode ID]
Byte 5+N: Checksum: (1 + ~(Length + Sum(Data))) & 0xFF
```

### 3. Mode Encoding Reference

| Mode Name | ID | Raw Packet (Hex) | Base64 Payload |
| :--- | :---: | :--- | :--- |
| **HDMI IN** (PC direct) | `3` | `41 54 00 01 01 03 FC` | `QVQAAQED/A==` |
| **OPTICAL_HDMI_ARC / eARC** | `1` | `41 54 00 01 01 01 FE` | `QVQAAQEB/g==` |
| **HDMI_EARC** (Direct) | `6` | `41 54 00 01 01 06 F9` | `QVQAAQEG+Q==` |
| **WIFI** | `0` | `41 54 00 01 01 00 FF` | `QVQAAQEA/w==` |
| **BLUETOOTH** | `2` | `41 54 00 01 01 02 FD` | `QVQAAQEC/Q==` |

---

## One-Command Installation (Permanent Autostart)

Run this command directly in your TV SSH terminal (`root@LGwebOSTV`):

```sh
cat << 'EOF' > /var/lib/webosbrew/soundbar-switcher.js
const { spawn, exec } = require('child_process');
const readline = require('readline');

const SOUNDBAR_MAC = "4e:dc:c2:03:37:02";
const PC_APP_ID = "com.webos.app.hdmi1";
const PKT_HDMI = "QVQAAQED/A==";
const PKT_EARC = "QVQAAQEB/g==";

let currentMode = null;
let reaffirmTimer = null;

function sendSoundbarCommand(packet, label) {
  const lunaCmd = `luna-send -n 1 -a com.webos.app.soundbar-setting luna://com.webos.service.blegattsoundbar/setCommand '{"address":"${SOUNDBAR_MAC}","packet":"${packet}"}'`;
  exec(lunaCmd, (err, stdout) => {
    if (err) console.error(`[${new Date().toLocaleTimeString()}] Error:`, err.message);
    else console.log(`[${new Date().toLocaleTimeString()}] Soundbar set: ${label}`);
  });
}

function handleForegroundApp(appId) {
  if (reaffirmTimer) {
    clearTimeout(reaffirmTimer);
    reaffirmTimer = null;
  }

  if (appId === PC_APP_ID) {
    currentMode = 'pc';
    reaffirmTimer = setTimeout(() => {
      sendSoundbarCommand(PKT_HDMI, 'HDMI IN (PC)');
      reaffirmTimer = setTimeout(() => {
        if (currentMode === 'pc') sendSoundbarCommand(PKT_HDMI, 'HDMI IN (PC Reaffirm)');
      }, 2500);
    }, 2500);
  } else {
    currentMode = 'earc';
    sendSoundbarCommand(PKT_EARC, 'HDMI eARC (TV/Apps)');
  }
}

function startListener() {
  const sub = spawn('luna-send', ['-i', 'luna://com.webos.service.applicationmanager/getForegroundAppInfo', '{"subscribe":true}']);
  const rl = readline.createInterface({ input: sub.stdout });
  rl.on('line', (line) => {
    try {
      const data = JSON.parse(line.trim());
      if (data && data.appId) handleForegroundApp(data.appId);
    } catch (_) {}
  });
  sub.on('exit', () => setTimeout(startListener, 3000));
}

startListener();
EOF

cat << 'EOF' > /var/lib/webosbrew/init.d/60-soundbar-switcher
#!/bin/sh
pkill -f soundbar-switcher.js 2>/dev/null
nohup node /var/lib/webosbrew/soundbar-switcher.js >/tmp/soundbar-switcher.log 2>&1 &
EOF

chmod +x /var/lib/webosbrew/init.d/60-soundbar-switcher
sh /var/lib/webosbrew/init.d/60-soundbar-switcher
```

---

## Verifying That It Is Running

Check running processes:
```sh
ps | grep soundbar-switcher.js | grep -v grep
```

View live logs while switching inputs:
```sh
tail -f /tmp/soundbar-switcher.log
```

---

## How to Disable / Uninstall (Anytime)

If you ever want to remove or stop it completely, run this single command on the TV:

```sh
pkill -f soundbar-switcher.js 2>/dev/null
rm -f /var/lib/webosbrew/init.d/60-soundbar-switcher
rm -f /var/lib/webosbrew/soundbar-switcher.js
rm -f /tmp/soundbar-switcher.log
```

---

## Repository Files Reference

- [soundbar-switcher.js](file:///D:/Development/Projects/LG-TVHooks/AudioSwitchigHook/soundbar-switcher.js): The core Node.js daemon.
- [install.sh](file:///D:/Development/Projects/LG-TVHooks/AudioSwitchigHook/install.sh): Installer script for webOS.
- [uninstall.sh](file:///D:/Development/Projects/LG-TVHooks/AudioSwitchigHook/uninstall.sh): Cleanup and uninstall script.
