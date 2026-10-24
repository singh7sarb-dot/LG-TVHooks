#!/bin/sh
# TV Hooks Uninstaller for LG webOS
# Completely cleans up the TV app, background service, and boot autostart hooks.

APP_ID="org.webosbrew.tvhooks"
APP_TARGET_DIR="/media/developer/apps/usr/palm/applications/$APP_ID"
DATA_DIR="/var/lib/tvhooks"
SERVICE_RUNNER="/var/lib/webosbrew/init.d/80-tvhooks"

echo "=========================================="
echo "     Uninstalling TV Hooks from webOS     "
echo "=========================================="

# 1. Stop all TV Hooks processes
echo "[1/4] Stopping active processes..."
pkill -f "tvhooks/server.js" 2>/dev/null
pkill -f "soundbar-switcher.js" 2>/dev/null

# 2. Remove boot autostart script
echo "[2/4] Removing autostart hook from init.d..."
rm -f "$SERVICE_RUNNER"

# 3. Remove application from webOS launcher
echo "[3/4] Removing TV app and unregistering launcher icon..."
rm -rf "$APP_TARGET_DIR"
luna-send -n 1 luna://com.webos.service.applicationmanager/rescanApp '{"category":["apps"]}' >/dev/null 2>&1 || true

# 4. Clean up data directory
echo "[4/4] Removing data and logs..."
rm -rf "$DATA_DIR"
rm -f /tmp/soundbar-switcher.log

echo "=========================================="
echo "    TV Hooks Successfully Uninstalled!   "
echo "=========================================="
