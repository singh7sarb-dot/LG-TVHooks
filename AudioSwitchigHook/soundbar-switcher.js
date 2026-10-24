/**
 * LG TV Soundbar Automatic Input Switcher
 * Target Soundbar: LG S95TR (BLE GATT & eARC)
 *
 * Automatically switches soundbar to HDMI IN when PC (HDMI 1) is active,
 * and restores HDMI eARC when TV native apps (YouTube, Netflix, Home, etc.) are active.
 *
 * Includes handshake compensation to defeat TV HDMI-CEC / eARC override.
 */

const { spawn, exec } = require('child_process');
const readline = require('readline');

// Soundbar Configuration
const SOUNDBAR_MAC = "4e:dc:c2:03:37:02";
const PC_APP_ID = "com.webos.app.hdmi1";

// Base64 encoded LG "AT" BLE GATT payloads:
// Format: [0x41, 0x54, Major, Minor, Length, Data..., Checksum]
// Major 0 (GeneralControl), Minor 1 (SetMode)
// Mode 3 = HDMI IN, Mode 1 = OPTICAL_HDMI_ARC / eARC
const PKT_HDMI = "QVQAAQED/A==";      // Direct Soundbar HDMI IN (PC)
const PKT_EARC = "QVQAAQEB/g==";      // TV eARC / ARC

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
    // When switching to PC, the TV initiates an HDMI signal lock and eARC handshake
    // that takes ~2-3 seconds and reverts the soundbar to eARC.
    // We send our switch right after the TV handshake finishes (2.5s)
    // and reaffirm at 5s to guarantee the input stays on HDMI.
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
    // Native TV apps / Home switch immediately back to eARC
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
    } catch (_) {
      // Ignore non-json debug lines
    }
  });

  sub.on('exit', (code) => {
    console.warn(`[${new Date().toLocaleTimeString()}] Luna subscription stream exited (${code}), restarting in 3s...`);
    setTimeout(startListener, 3000);
  });
}

startListener();
