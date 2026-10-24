#!/bin/sh
# TV Hooks All-in-One Deployment Script for LG webOS
# Installs both the Native TV Screen App and the Background Supervisor Service.

APP_ID="org.webosbrew.tvhooks"
APP_TARGET_DIR="/media/developer/apps/usr/palm/applications/$APP_ID"
DATA_DIR="/var/lib/tvhooks"
INIT_DIR="/var/lib/webosbrew/init.d"
SERVICE_RUNNER="$INIT_DIR/80-tvhooks"

echo "=========================================="
echo "      Installing TV Hooks for webOS       "
echo "=========================================="

# 1. Stop any currently running instances
pkill -f "tvhooks/server.js" 2>/dev/null
pkill -f "soundbar-switcher.js" 2>/dev/null

# 2. Prepare directories
mkdir -p "$DATA_DIR/hooks"
mkdir -p "$DATA_DIR/logs"
mkdir -p "$INIT_DIR"
mkdir -p "$APP_TARGET_DIR"

# 3. Deploy Web App to webOS Application Storage
echo "[1/4] Deploying on-screen TV App..."
# Copy all app assets (index.html, styles.css, app.js, appinfo.json, icons)
cp -r /tmp/tvhooks-bundle/app/* "$APP_TARGET_DIR/" 2>/dev/null || true

# 4. Deploy Backend Supervisor Service
echo "[2/4] Deploying Backend Supervisor Service..."
cp -r /tmp/tvhooks-bundle/service/* "$DATA_DIR/" 2>/dev/null || true
# Ensure soundbar hook is installed in hooks folder
cp /tmp/tvhooks-bundle/service/hooks/soundbar-switcher.js "$DATA_DIR/hooks/soundbar-switcher.js" 2>/dev/null || true

# 5. Create Autostart Boot Script
echo "[3/4] Configuring persistent autostart in init.d..."
cat << 'EOF' > "$SERVICE_RUNNER"
#!/bin/sh
# Start TV Hooks Supervisor on TV boot
pkill -f "tvhooks/server.js" 2>/dev/null
export NODE_PATH="/usr/palm/frameworks:/usr/lib/nodejs:/usr/lib/node_modules"
nohup node /var/lib/tvhooks/server.js >/var/lib/tvhooks/logs/supervisor.log 2>&1 &
EOF

chmod +x "$SERVICE_RUNNER"

# 6. Notify webOS App Manager to register the new TV launcher icon
echo "[4/4] Registering icon on TV Home Launcher..."
luna-send -n 1 luna://com.webos.service.applicationmanager/rescanApp '{"category":["apps"]}' >/dev/null 2>&1 || true

# 7. Start the service immediately
sh "$SERVICE_RUNNER"

echo "=========================================="
echo "    TV Hooks Successfully Installed!      "
echo "=========================================="
echo "• TV App: 'TV Hooks' icon added to your TV Launcher."
echo "• PC/Phone Dashboard: http://$(ip route get 1.1.1.1 2>/dev/null | awk '{print $7}'):8989"
echo "• Active Process:"
ps | grep "tvhooks/server.js" | grep -v grep
echo "=========================================="
