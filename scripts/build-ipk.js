const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.join(__dirname, '..');
const DIST_DIR = path.join(PROJECT_ROOT, 'dist');
const BUILD_DIR = path.join(PROJECT_ROOT, 'build_ipk');

if (fs.existsSync(BUILD_DIR)) fs.rmSync(BUILD_DIR, { recursive: true, force: true });
if (!fs.existsSync(DIST_DIR)) fs.mkdirSync(DIST_DIR, { recursive: true });

fs.mkdirSync(BUILD_DIR, { recursive: true });

// 1. Prepare data directory hierarchy
// In webOS, apps go to /media/developer/apps/usr/palm/applications/<appId>
// Services go to /var/lib/tvhooks and /var/lib/webosbrew/init.d/
const dataRoot = path.join(BUILD_DIR, 'data');
const appDest = path.join(dataRoot, 'media', 'developer', 'apps', 'usr', 'palm', 'applications', 'org.webosbrew.tvhooks');
const serviceDest = path.join(dataRoot, 'var', 'lib', 'tvhooks');
const initDest = path.join(dataRoot, 'var', 'lib', 'webosbrew', 'init.d');

fs.mkdirSync(appDest, { recursive: true });
fs.mkdirSync(path.join(serviceDest, 'hooks'), { recursive: true });
fs.mkdirSync(path.join(serviceDest, 'logs'), { recursive: true });
fs.mkdirSync(initDest, { recursive: true });

// Copy app files
const appSrc = path.join(PROJECT_ROOT, 'app');
for (const file of fs.readdirSync(appSrc)) {
  fs.copyFileSync(path.join(appSrc, file), path.join(appDest, file));
}
// Also copy app files directly inside service folder so server can always serve them locally
const serverAppDest = path.join(serviceDest, 'app');
fs.mkdirSync(serverAppDest, { recursive: true });
for (const file of fs.readdirSync(appSrc)) {
  fs.copyFileSync(path.join(appSrc, file), path.join(serverAppDest, file));
}

// Copy service files
fs.copyFileSync(path.join(PROJECT_ROOT, 'service', 'server.js'), path.join(serviceDest, 'server.js'));
fs.copyFileSync(
  path.join(PROJECT_ROOT, 'service', 'hooks', 'soundbar-switcher.js'),
  path.join(serviceDest, 'hooks', 'soundbar-switcher.js')
);

// Create autostart launcher script
const initScriptContent = `#!/bin/sh
# Start TV Hooks on TV boot
pkill -f "tvhooks/server.js" 2>/dev/null
export NODE_PATH="/usr/palm/frameworks:/usr/lib/nodejs:/usr/lib/node_modules"
nohup node /var/lib/tvhooks/server.js >/var/lib/tvhooks/logs/supervisor.log 2>&1 &
`;
fs.writeFileSync(path.join(initDest, '80-tvhooks'), initScriptContent, 'utf8');

// 2. Prepare control directory
const controlDir = path.join(BUILD_DIR, 'control');
fs.mkdirSync(controlDir, { recursive: true });

const controlContent = `Package: org.webosbrew.tvhooks
Version: 1.0.0
Section: misc
Priority: optional
Architecture: all
Maintainer: LG TV Hooks Community
Description: Signal routing, automations, and soundbar input switcher for LG webOS.
`;
fs.writeFileSync(path.join(controlDir, 'control'), controlContent, 'utf8');

const postinstContent = `#!/bin/sh
chmod +x /var/lib/webosbrew/init.d/80-tvhooks
sh /var/lib/webosbrew/init.d/80-tvhooks
luna-send -n 1 luna://com.webos.service.applicationmanager/rescanApp '{"category":["apps"]}' >/dev/null 2>&1 || true
exit 0
`;
fs.writeFileSync(path.join(controlDir, 'postinst'), postinstContent, 'utf8');

const prermContent = `#!/bin/sh
pkill -f "tvhooks/server.js" 2>/dev/null
pkill -f "soundbar-switcher.js" 2>/dev/null
rm -f /var/lib/webosbrew/init.d/80-tvhooks
exit 0
`;
fs.writeFileSync(path.join(controlDir, 'prerm'), prermContent, 'utf8');

// 3. Create debian-binary
fs.writeFileSync(path.join(BUILD_DIR, 'debian-binary'), '2.0\n', 'utf8');

// 4. Archive data.tar.gz and control.tar.gz using tar
execSync(`tar -czvf "${path.join(BUILD_DIR, 'data.tar.gz')}" -C "${dataRoot}" .`, { stdio: 'inherit' });
execSync(`tar -czvf "${path.join(BUILD_DIR, 'control.tar.gz')}" -C "${controlDir}" .`, { stdio: 'inherit' });

// 5. Pack into ar / ipk format
// Format of an ar archive member header:
// filename (16), timestamp (12), owner (6), group (6), mode (8), size (10), `\n (2)
function createArHeader(name, size) {
  const buf = Buffer.alloc(60, 32); // fill with space (ASCII 32)
  buf.write(name, 0);
  buf.write('0', 16);
  buf.write('0', 28);
  buf.write('0', 34);
  buf.write('100644', 40);
  buf.write(String(size), 48);
  buf[58] = 0x60; // '`'
  buf[59] = 0x0A; // '\n'
  return buf;
}

const debianBinaryData = Buffer.from('2.0\n');
const controlTarData = fs.readFileSync(path.join(BUILD_DIR, 'control.tar.gz'));
const dataTarData = fs.readFileSync(path.join(BUILD_DIR, 'data.tar.gz'));

const arSignature = Buffer.from('!<arch>\n');

function padEven(buf) {
  if (buf.length % 2 !== 0) {
    return Buffer.concat([buf, Buffer.from('\n')]);
  }
  return buf;
}

const ipkBuffer = Buffer.concat([
  arSignature,
  createArHeader('debian-binary', debianBinaryData.length),
  padEven(debianBinaryData),
  createArHeader('control.tar.gz', controlTarData.length),
  padEven(controlTarData),
  createArHeader('data.tar.gz', dataTarData.length),
  padEven(dataTarData)
]);

const IPK_OUTPUT = path.join(PROJECT_ROOT, 'org.webosbrew.tvhooks_1.0.0_all.ipk');
fs.writeFileSync(IPK_OUTPUT, ipkBuffer);
fs.copyFileSync(IPK_OUTPUT, path.join(DIST_DIR, 'org.webosbrew.tvhooks_1.0.0_all.ipk'));

// Cleanup build directory
fs.rmSync(BUILD_DIR, { recursive: true, force: true });

console.log(`\n=============================================`);
console.log(`Successfully built webOS IPK Package!`);
console.log(`Output: ${IPK_OUTPUT}`);
console.log(`=============================================\n`);
