/**
 * TV Hooks Application Controller
 * Handles remote D-pad / Magic Remote navigation, UI rendering,
 * and REST communication with the backend daemon.
 */

// Determine API Base URL (works seamlessly both on TV localhost and PC browser)
const API_BASE = (window.location.protocol === 'file:' || !window.location.host)
  ? 'http://localhost:8989'
  : `${window.location.protocol}//${window.location.host}`;

let hooksData = [];
let activeFilter = 'all';
let currentLogHookId = null;
let logPollInterval = null;

// Template snippets for custom hooks
const TEMPLATES = {
  appListener: `// Listen to foreground app switch events
const { spawn } = require('child_process');
const readline = require('readline');

const sub = spawn('luna-send', ['-i', 'luna://com.webos.service.applicationmanager/getForegroundAppInfo', '{"subscribe":true}']);
const rl = readline.createInterface({ input: sub.stdout });

rl.on('line', (line) => {
  try {
    const data = JSON.parse(line.trim());
    if (data.appId) {
      console.log(\`App changed to: \${data.appId}\`);
      // Add your custom logic here:
      // if (data.appId === 'com.webos.app.hdmi1') { ... }
    }
  } catch (_) {}
});
`,
  timer: `// Periodic background timer (runs every 30 seconds)
setInterval(() => {
  console.log(\`[\${new Date().toLocaleTimeString()}] Periodic heartbeat check...\`);
  // Insert background tasks here
}, 30000);
`
};

// DOM Elements
const hooksContainer = document.getElementById('hooks-container');
const backendStatus = document.getElementById('backend-status');
const countAll = document.getElementById('count-all');
const countActive = document.getElementById('count-active');

const modalLogs = document.getElementById('modal-logs');
const terminalContent = document.getElementById('terminal-content');
const logModalTitle = document.getElementById('log-modal-title');

const modalCreate = document.getElementById('modal-create');
const hookIdInput = document.getElementById('hook-id');
const hookNameInput = document.getElementById('hook-name');
const hookDescInput = document.getElementById('hook-desc');
const hookTypeInput = document.getElementById('hook-type');
const hookCodeInput = document.getElementById('hook-code');

const appToast = document.getElementById('app-toast');

function showToast(message, duration = 3000) {
  appToast.textContent = message;
  appToast.classList.add('show');
  setTimeout(() => appToast.classList.remove('show'), duration);
}

// Fetch hooks from backend
async function fetchHooks() {
  try {
    const res = await fetch(`${API_BASE}/api/hooks`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    hooksData = data.hooks || [];
    
    // Update TV Web URL Pill dynamically
    if (data.systemInfo && data.systemInfo.url) {
      const urlElement = document.getElementById('header-web-url');
      if (urlElement) urlElement.textContent = data.systemInfo.url;
    }

    backendStatus.textContent = 'Daemon Online';
    backendStatus.parentElement.querySelector('.chip-dot').style.backgroundColor = 'var(--accent-success)';
    renderHooks();
  } catch (err) {
    console.error('Error fetching hooks:', err);
    backendStatus.textContent = 'Daemon Offline (Retrying...)';
    backendStatus.parentElement.querySelector('.chip-dot').style.backgroundColor = 'var(--accent-danger)';
    hooksContainer.innerHTML = `
      <div class="skeleton-card" style="color: #f87171; border-color: rgba(239, 68, 68, 0.3);">
        Unable to connect to TV Hooks backend daemon at ${API_BASE}.<br>
        Ensure the background service is running on the TV.
      </div>
    `;
  }
}

// Render Hook Cards
function renderHooks() {
  const filtered = hooksData.filter(hook => {
    if (activeFilter === 'active') return hook.enabled;
    return true;
  });

  countAll.textContent = hooksData.length;
  countActive.textContent = hooksData.filter(h => h.enabled).length;

  if (filtered.length === 0) {
    hooksContainer.innerHTML = `<div class="skeleton-card">No hooks match the active filter.</div>`;
    return;
  }

  hooksContainer.innerHTML = filtered.map((hook, index) => {
    const isRunning = hook.running;
    const tabIndex = 20 + index * 4;

    return `
      <div class="hook-card" id="card-${hook.id}">
        <div class="card-top">
          <div class="card-title-group">
            <h3 class="card-title">${escapeHtml(hook.name)}</h3>
            <div class="card-tags">
              <span class="badge-tag">${escapeHtml(hook.type || 'node')}</span>
              <span class="badge-status ${isRunning ? 'running' : 'stopped'}">
                <span class="chip-dot" style="width: 6px; height: 6px; background-color: ${isRunning ? '#34d399' : '#94a3b8'}"></span>
                ${isRunning ? `RUNNING (PID ${hook.pid || 'Active'})` : 'STOPPED'}
              </span>
            </div>
          </div>

          <label class="switch focusable" tabindex="${tabIndex}">
            <input type="checkbox" ${hook.enabled ? 'checked' : ''} onchange="toggleHook('${hook.id}')">
            <span class="slider"></span>
          </label>
        </div>

        <p class="card-desc">${escapeHtml(hook.description || 'No description provided.')}</p>

        <div class="card-bottom">
          <div class="card-meta">
            ${hook.script}
          </div>
          <div class="card-actions">
            <button class="btn btn-secondary btn-sm focusable" tabindex="${tabIndex + 1}" onclick="openLogs('${hook.id}', '${escapeHtml(hook.name)}')">
              View Logs
            </button>
            ${hook.author === 'Custom' ? `
              <button class="btn btn-danger btn-sm focusable" tabindex="${tabIndex + 2}" onclick="deleteHook('${hook.id}')">
                Delete
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

// Toggle Hook
window.toggleHook = async function(hookId) {
  try {
    const res = await fetch(`${API_BASE}/api/hooks/${hookId}/toggle`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(`Hook ${data.enabled ? 'Activated' : 'Deactivated'} successfully`);
      fetchHooks();
    }
  } catch (err) {
    showToast(`Error toggling hook: ${err.message}`);
  }
};

// Open Logs Modal
window.openLogs = function(hookId, hookName) {
  currentLogHookId = hookId;
  logModalTitle.textContent = `${hookName} — Live Logs`;
  terminalContent.textContent = 'Loading logs...';
  modalLogs.style.display = 'flex';

  fetchHookLogs(hookId);
  if (logPollInterval) clearInterval(logPollInterval);
  logPollInterval = setInterval(() => fetchHookLogs(hookId), 2000);

  document.getElementById('btn-close-logs').focus();
};

async function fetchHookLogs(hookId) {
  try {
    const res = await fetch(`${API_BASE}/api/hooks/${hookId}/logs`);
    const data = await res.json();
    if (data.success) {
      terminalContent.textContent = (data.logs && data.logs.length > 0)
        ? data.logs.join('\n')
        : '[No log entries recorded yet]';
      const terminalBody = terminalContent.parentElement;
      terminalBody.scrollTop = terminalBody.scrollHeight;
    }
  } catch (err) {
    terminalContent.textContent = `Error fetching logs: ${err.message}`;
  }
}

function closeLogs() {
  modalLogs.style.display = 'none';
  if (logPollInterval) clearInterval(logPollInterval);
  currentLogHookId = null;
}

// Delete Hook
window.deleteHook = async function(hookId) {
  if (!confirm(`Are you sure you want to delete this custom hook?`)) return;
  try {
    const res = await fetch(`${API_BASE}/api/hooks/${hookId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Custom hook deleted');
      fetchHooks();
    }
  } catch (err) {
    showToast(`Error deleting hook: ${err.message}`);
  }
};

// Event Listeners & Modals
document.getElementById('btn-add-hook').onclick = () => {
  hookIdInput.value = '';
  hookNameInput.value = '';
  hookDescInput.value = '';
  hookCodeInput.value = TEMPLATES.appListener;
  modalCreate.style.display = 'flex';
  hookNameInput.focus();
};

document.getElementById('btn-close-create').onclick = () => modalCreate.style.display = 'none';
document.getElementById('btn-cancel-create').onclick = () => modalCreate.style.display = 'none';

document.getElementById('btn-close-logs').onclick = closeLogs;
document.getElementById('btn-done-logs').onclick = closeLogs;
document.getElementById('btn-refresh-logs').onclick = () => currentLogHookId && fetchHookLogs(currentLogHookId);

document.getElementById('btn-refresh').onclick = fetchHooks;

document.getElementById('filter-all').onclick = (e) => {
  document.querySelectorAll('.filter-pills .pill').forEach(p => p.classList.remove('active'));
  e.target.classList.add('active');
  activeFilter = 'all';
  renderHooks();
};

document.getElementById('filter-active').onclick = (e) => {
  document.querySelectorAll('.filter-pills .pill').forEach(p => p.classList.remove('active'));
  e.target.classList.add('active');
  activeFilter = 'active';
  renderHooks();
};

document.getElementById('tpl-app-listener').onclick = () => hookCodeInput.value = TEMPLATES.appListener;
document.getElementById('tpl-timer').onclick = () => hookCodeInput.value = TEMPLATES.timer;

// Save Custom Hook
document.getElementById('btn-save-hook').onclick = async () => {
  const name = hookNameInput.value.trim();
  const id = hookIdInput.value.trim() || name.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const description = hookDescInput.value.trim();
  const type = hookTypeInput.value;
  const code = hookCodeInput.value.trim();

  if (!id || !name || !code) {
    alert('Please fill in Hook Slug, Display Name, and Code.');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/hooks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name, description, type, code })
    });
    const data = await res.json();
    if (data.success) {
      modalCreate.style.display = 'none';
      showToast('Hook created and activated!');
      fetchHooks();
    } else {
      alert(`Error saving hook: ${data.error}`);
    }
  } catch (err) {
    alert(`Request failed: ${err.message}`);
  }
};

// WebOS Remote Control Keyboard & Back Key Handler
window.addEventListener('keydown', (e) => {
  // WebOS Back button (key code 461) or PC Escape key (27)
  if (e.keyCode === 461 || e.keyCode === 27) {
    if (modalLogs.style.display === 'flex') {
      closeLogs();
      e.preventDefault();
    } else if (modalCreate.style.display === 'flex') {
      modalCreate.style.display = 'none';
      e.preventDefault();
    }
  }
});

// Initial Load & Polling
fetchHooks();
setInterval(fetchHooks, 10000);
