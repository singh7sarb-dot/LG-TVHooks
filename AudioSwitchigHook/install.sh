#!/bin/sh
# Soundbar Auto Switcher Installer for LG webOS
# Deploys the switcher to /var/lib/webosbrew/ and registers it in init.d for boot autostart.

TARGET_DIR="/var/lib/webosbrew"
INIT_SCRIPT="/var/lib/webosbrew/init.d/60-soundbar-switcher"
SCRIPT_NAME="soundbar-switcher.js"

echo "=== Installing Soundbar Auto-Switcher ==="

# 1. Ensure target directories exist
mkdir -p "$TARGET_DIR"
mkdir -p "$TARGET_DIR/init.d"

# 2. Stop any existing running instance
pkill -f "$SCRIPT_NAME" 2>/dev/null

# 3. Create or update the switcher daemon script
cat << 'EOF' > "$TARGET_DIR/$SCRIPT_NAME"
const { spawn, exec } = require('child_process');
const readline = require('readline');

const SOUNDBAR_MAC = "4e:dc:c2:03:37:02";
const PC_APP_ID = "com.webos.app.hdmi1";

// Base64 LG AT GATT Commands
const PKT_HDMI = "QVQAAQED/A==";      // Mode 3: HDMI IN (PC)
const PKT_EARC = "QVQAAQEB/g==";      // Mode 1: OPTICAL_HDMI_ARC / eARC

let currentMode = null;
let reaffirmTimer = null;

function sendSoundbarCommand(packet, label) {
  const lunaCmd = `luna-send -n 1 -a com.webos.app.soundbar-setting luna://com.webos.service.blegattsoundbar/setCommand '{"address":"${SOUNDBAR_MAC}","packet":"${packet}"}'`;
  exec(lunaCmd, (err, stdout) => {
    if (err) {
      console.error(`[${new Date().toLocaleTimeString()}] Error switching to ${label}:`, err.message);
    } else {
      console.log(`[${new Date().toLocaleTimeString()}] Soundbar set to: ${label} -> ${stdout.trim()}`);
    }
  });
}

function handleForegroundApp(appId) {
  if (reaffirmTimer) {
    clearTimeout(reaffirmTimer);
    reaffirmTimer = null;
  }

  if (appId === PC_APP_ID) {
    currentMode = 'pc';
    // Delay 2.5s for TV HDMI handshake, then switch to HDMI & reaffirm at 5s
    reaffirmTimer = setTimeout(() => {
      sendSoundbarCommand(PKT_HDMI, 'HDMI IN (PC)');
      reaffirmTimer = setTimeout(() => {
        if (currentMode === 'pc') {
          sendSoundbarCommand(PKT_HDMI, 'HDMI IN (PC Reaffirm)');
        }
      }, 2500);
    }, 2500);
  } else {
    currentMode = 'earc';
    sendSoundbarCommand(PKT_EARC, 'HDMI eARC (TV/Apps)');
  }
}

function startListener() {
  console.log(`[${new Date().toLocaleTimeString()}] Soundbar Switcher started for ${SOUNDBAR_MAC}`);

  const sub = spawn('luna-send', [
    '-i',
    'luna://com.webos.service.applicationmanager/getForegroundAppInfo',
    '{"subscribe":true}'
  ]);

  const rl = readline.createInterface({ input: sub.stdout });

  rl.on('line', (line) => {
    try {
      const data = JSON.parse(line.trim());
      if (data && data.appId) {
        console.log(`[${new Date().toLocaleTimeString()}] App Changed -> ${data.appId}`);
        handleForegroundApp(data.appId);
      }
    } catch (_) {}
  });

  sub.on('exit', (code) => {
    console.warn(`[${new Date().toLocaleTimeString()}] Stream exited (${code}), restarting in 3s...`);
    setTimeout(startListener, 3000);
  });
}

startListener();
EOF

# 4. Create the init.d autostart service launcher
cat << 'EOF' > "$INIT_SCRIPT"
#!/bin/sh
# Start soundbar auto-switcher on boot
pkill -f soundbar-switcher.js 2>/dev/null
nohup node /var/lib/webosbrew/soundbar-switcher.js >/tmp/soundbar-switcher.log 2>&1 &
EOF

chmod +x "$INIT_SCRIPT"

# 5. Launch it now immediately
sh "$INIT_SCRIPT"

echo "=== Installation Complete! ==="
echo "Autostart registered at: $INIT_SCRIPT"
echo "Log file: /tmp/soundbar-switcher.log"
echo "Process status:"
ps | grep soundbar-switcher.js | grep -v grep
