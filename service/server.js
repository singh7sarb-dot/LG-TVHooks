/**
 * TV Hooks Backend Supervisor & Web Server
 * Runs on LG webOS (Node.js v20+)
 * Port: 8989
 *
 * Features:
 * - Supervises, monitors, and restarts active background hooks
 * - Exposes REST API for TV on-screen app and PC browser dashboard
 * - Serves the web dashboard UI
 * - Persists hook configurations across TV reboots
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const PORT = 8989;
const DATA_DIR = process.env.TVHOOKS_DATA_DIR || '/var/lib/tvhooks';

// Helper to get TV LAN IP address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '192.168.1.72';
}
const HOOKS_DIR = path.join(DATA_DIR, 'hooks');
const LOGS_DIR = path.join(DATA_DIR, 'logs');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

// Auto-detect static directory (checks local app dir, then webOS app location)
const STATIC_DIR = fs.existsSync('/var/lib/tvhooks/app')
  ? '/var/lib/tvhooks/app'
  : fs.existsSync(path.join(__dirname, 'app'))
  ? path.join(__dirname, 'app')
  : '/media/developer/apps/usr/palm/applications/org.webosbrew.tvhooks';

// Ensure directories exist
for (const dir of [DATA_DIR, HOOKS_DIR, LOGS_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// In-memory process tracking & log buffers (last 200 lines each)
const runningHooks = new Map(); // id -> { process, restarts, logBuffer }
const MAX_LOG_LINES = 200;

// Default built-in hooks registry
const DEFAULT_CONFIG = [
  {
    id: "soundbar-s95tr-switcher",
    name: "LG S95TR Soundbar Auto-Switcher",
    description: "Switches soundbar to HDMI IN when PC (HDMI 1) is active; restores HDMI eARC on TV apps.",
    script: "soundbar-switcher.js",
    type: "node",
    enabled: true,
    author: "Built-in",
    createdAt: new Date().toISOString()
  }
];

// Load configuration
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('[Config] Error reading config file:', err);
  }
  saveConfig(DEFAULT_CONFIG);
  return DEFAULT_CONFIG;
}

function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  } catch (err) {
    console.error('[Config] Error writing config file:', err);
  }
}

let config = loadConfig();

// Copy built-in hook scripts if not present
const builtinSoundbarScript = path.join(__dirname, 'hooks', 'soundbar-switcher.js');
const targetSoundbarScript = path.join(HOOKS_DIR, 'soundbar-switcher.js');
if (fs.existsSync(builtinSoundbarScript) && !fs.existsSync(targetSoundbarScript)) {
  fs.copyFileSync(builtinSoundbarScript, targetSoundbarScript);
}

function appendLog(hookId, line) {
  const state = runningHooks.get(hookId);
  if (!state) return;

  const timestamp = new Date().toLocaleTimeString();
  const entry = `[${timestamp}] ${line}`;
  state.logBuffer.push(entry);
  if (state.logBuffer.length > MAX_LOG_LINES) {
    state.logBuffer.shift();
  }

  // Also append to log file asynchronously
  fs.appendFile(path.join(LOGS_DIR, `${hookId}.log`), entry + '\n', () => {});
}

function startHook(hook) {
  if (runningHooks.has(hook.id) && runningHooks.get(hook.id).process) {
    console.log(`[Supervisor] Hook '${hook.id}' is already running.`);
    return;
  }

  const scriptPath = path.isAbsolute(hook.script)
    ? hook.script
    : path.join(HOOKS_DIR, hook.script);

  if (!fs.existsSync(scriptPath)) {
    console.error(`[Supervisor] Script not found for hook ${hook.id}: ${scriptPath}`);
    return;
  }

  console.log(`[Supervisor] Launching hook: ${hook.name} (${scriptPath})`);

  let child;
  if (hook.type === 'node' || scriptPath.endsWith('.js')) {
    child = spawn('node', [scriptPath], {
      env: { ...process.env, NODE_PATH: "/usr/palm/frameworks:/usr/lib/nodejs:/usr/lib/node_modules" }
    });
  } else {
    child = spawn('sh', [scriptPath]);
  }

  const hookState = runningHooks.get(hook.id) || {
    restarts: 0,
    logBuffer: []
  };
  hookState.process = child;
  hookState.startedAt = new Date().toISOString();
  runningHooks.set(hook.id, hookState);

  appendLog(hook.id, `Process started (PID: ${child.pid})`);

  child.stdout.on('data', (chunk) => {
    chunk.toString().split('\n').filter(Boolean).forEach(line => appendLog(hook.id, line));
  });

  child.stderr.on('data', (chunk) => {
    chunk.toString().split('\n').filter(Boolean).forEach(line => appendLog(hook.id, `[ERR] ${line}`));
  });

  child.on('close', (code) => {
    appendLog(hook.id, `Process exited with code ${code}`);
    const currentState = runningHooks.get(hook.id);
    if (currentState) {
      currentState.process = null;
    }

    // Auto-restart if hook is still enabled
    const currentConf = config.find(h => h.id === hook.id);
    if (currentConf && currentConf.enabled) {
      console.warn(`[Supervisor] Hook '${hook.id}' exited unexpectedly. Restarting in 5s...`);
      setTimeout(() => {
        const stillEnabled = config.find(h => h.id === hook.id)?.enabled;
        if (stillEnabled) startHook(hook);
      }, 5000);
    }
  });
}

function stopHook(hookId) {
  const state = runningHooks.get(hookId);
  if (state && state.process) {
    appendLog(hookId, `Stopping process (PID: ${state.process.pid})...`);
    state.process.kill('SIGTERM');
    setTimeout(() => {
      if (state.process) state.process.kill('SIGKILL');
      state.process = null;
    }, 2000);
  }
}

// Start all enabled hooks on startup
config.forEach(hook => {
  if (hook.enabled) {
    startHook(hook);
  }
});

// HTTP Server & REST API
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  // API Endpoints
  if (url.pathname === '/api/hooks' && req.method === 'GET') {
    const localIp = getLocalIP();
    const list = config.map(hook => {
      const state = runningHooks.get(hook.id);
      return {
        ...hook,
        running: !!(state && state.process),
        pid: state?.process?.pid || null,
        startedAt: state?.startedAt || null
      };
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      hooks: list,
      systemInfo: {
        ip: localIp,
        port: PORT,
        url: `http://${localIp}:${PORT}`
      }
    }));
    return;
  }

  // Toggle Hook ON/OFF
  const toggleMatch = url.pathname.match(/^\/api\/hooks\/([^/]+)\/toggle$/);
  if (toggleMatch && req.method === 'POST') {
    const hookId = toggleMatch[1];
    const hook = config.find(h => h.id === hookId);
    if (!hook) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Hook not found' }));
      return;
    }

    hook.enabled = !hook.enabled;
    saveConfig(config);

    if (hook.enabled) {
      startHook(hook);
    } else {
      stopHook(hook.id);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, enabled: hook.enabled }));
    return;
  }

  // Get Hook Logs
  const logsMatch = url.pathname.match(/^\/api\/hooks\/([^/]+)\/logs$/);
  if (logsMatch && req.method === 'GET') {
    const hookId = logsMatch[1];
    const state = runningHooks.get(hookId);
    let logs = state ? state.logBuffer : [];

    // Fall back to reading from disk log file if buffer is empty
    if (logs.length === 0) {
      const diskLog = path.join(LOGS_DIR, `${hookId}.log`);
      if (fs.existsSync(diskLog)) {
        try {
          const lines = fs.readFileSync(diskLog, 'utf8').split('\n').filter(Boolean);
          logs = lines.slice(-MAX_LOG_LINES);
        } catch (_) {}
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, logs }));
    return;
  }

  // Create / Update Custom Hook
  if (url.pathname === '/api/hooks' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const { id, name, description, code, type } = payload;
        if (!id || !name || !code) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Missing required fields (id, name, code)' }));
          return;
        }

        const cleanId = id.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
        const fileName = `${cleanId}.${type === 'shell' ? 'sh' : 'js'}`;
        const filePath = path.join(HOOKS_DIR, fileName);

        // Save script code
        fs.writeFileSync(filePath, code, 'utf8');
        if (type === 'shell') fs.chmodSync(filePath, 0o755);

        // Update or add hook in config
        const existingIdx = config.findIndex(h => h.id === cleanId);
        const hookData = {
          id: cleanId,
          name,
          description: description || '',
          script: fileName,
          type: type || 'node',
          enabled: true,
          author: 'Custom',
          createdAt: new Date().toISOString()
        };

        if (existingIdx >= 0) {
          stopHook(cleanId);
          config[existingIdx] = hookData;
        } else {
          config.push(hookData);
        }

        saveConfig(config);
        startHook(hookData);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, hook: hookData }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Delete Custom Hook
  const deleteMatch = url.pathname.match(/^\/api\/hooks\/([^/]+)$/);
  if (deleteMatch && req.method === 'DELETE') {
    const hookId = deleteMatch[1];
    stopHook(hookId);
    config = config.filter(h => h.id !== hookId);
    saveConfig(config);
    runningHooks.delete(hookId);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // Static File Serving (TV UI & Web Dashboard)
  let reqPath = url.pathname === '/' ? '/index.html' : url.pathname;
  let filePath = path.join(STATIC_DIR, reqPath);
  
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(STATIC_DIR, 'index.html');
  }

  const ext = path.extname(filePath);
  const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    } else {
      res.writeHead(200, { 'Content-Type': mimeType });
      res.end(content);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[TV Hooks] Service running on http://0.0.0.0:${PORT}`);
});
