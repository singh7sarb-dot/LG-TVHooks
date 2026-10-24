#!/bin/sh
# Soundbar Auto Switcher Uninstaller
# Stops the background process and deletes the boot autostart hook.

echo "=== Uninstalling Soundbar Auto-Switcher ==="

# 1. Kill running process
pkill -f soundbar-switcher.js 2>/dev/null

# 2. Remove init.d boot script
rm -f /var/lib/webosbrew/init.d/60-soundbar-switcher

# 3. Remove switcher script and logs
rm -f /var/lib/webosbrew/soundbar-switcher.js
rm -f /tmp/soundbar-switcher.log

echo "=== Uninstallation Complete! ==="
echo "Autostart hook and daemon removed successfully."
