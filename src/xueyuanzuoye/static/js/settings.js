const API = {
    SETTINGS: '/api/settings',
    INSTRUCTOR_SETTINGS: '/api/instructor-settings'
};

const DEFAULT_SETTINGS = {
    client_refresh_seconds: 60,
    server_poll_interval_seconds: 300,
    instructor_name: '',
    instructor_email: '',
    notify_updates: true,
    sound_enabled: false,
    default_view: 'card',
    items_per_page: 20,
    show_viewed_students: true,
    github_token: ''
};

// Utility Functions
function showStatus(message, type = 'info', duration = 3000) {
    const el = document.getElementById('settingsStatus');
    if (!el) return;
    el.textContent = message;
    el.className = `status-msg show ${type}`;
    if (duration > 0) {
        setTimeout(() => {
            el.classList.remove('show');
        }, duration);
    }
}

// Theme Toggle
function initThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    if (!themeToggle) return;

    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeToggleButton(savedTheme);

    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeToggleButton(newTheme);
    });
}

function updateThemeToggleButton(theme) {
    const themeToggle = document.getElementById('themeToggle');
    if (!themeToggle) return;

    const icon = themeToggle.querySelector('.theme-icon');
    const text = themeToggle.querySelector('.theme-text');

    if (theme === 'dark') {
        if (icon) icon.textContent = '🌙';
        if (text) text.textContent = '暗黑模式';
    } else {
        if (icon) icon.textContent = '☀️';
        if (text) text.textContent = '明亮模式';
    }
}

// Toggle Switches
function initToggleSwitches() {
    const toggles = ['notifyUpdates', 'soundEnabled', 'showViewedStudents'];

    toggles.forEach(toggleId => {
        const toggle = document.getElementById(toggleId);
        if (!toggle) return;

        toggle.addEventListener('click', function() {
            this.classList.toggle('active');
        });
    });
}

// Load Settings
async function loadSettings() {
    try {
        // Load server settings
        const res = await fetch(API.SETTINGS);
        const serverSettings = await res.json();

        // Load local settings
        const localSettingsStr = localStorage.getItem('instructorSettings');
        const localSettings = localSettingsStr ? JSON.parse(localSettingsStr) : {};

        // Merge with defaults
        const settings = { ...DEFAULT_SETTINGS, ...serverSettings, ...localSettings };

        // Apply server settings
        document.getElementById('clientRefresh').value = settings.client_refresh_seconds;
        document.getElementById('serverPoll').value = settings.server_poll_interval_seconds;

        // Apply instructor settings
        document.getElementById('instructorName').value = settings.instructor_name || '';
        document.getElementById('instructorEmail').value = settings.instructor_email || '';

        // Apply notification settings
        const notifyToggle = document.getElementById('notifyUpdates');
        if (settings.notify_updates) {
            notifyToggle.classList.add('active');
        } else {
            notifyToggle.classList.remove('active');
        }

        const soundToggle = document.getElementById('soundEnabled');
        if (settings.sound_enabled) {
            soundToggle.classList.add('active');
        } else {
            soundToggle.classList.remove('active');
        }

        // Apply display settings
        document.getElementById('defaultView').value = settings.default_view || 'card';
        document.getElementById('itemsPerPage').value = settings.items_per_page || 20;

        const showViewedToggle = document.getElementById('showViewedStudents');
        if (settings.show_viewed_students) {
            showViewedToggle.classList.add('active');
        } else {
            showViewedToggle.classList.remove('active');
        }

        // Apply GitHub token (from local storage only)
        document.getElementById('githubToken').value = settings.github_token || '';

    } catch (e) {
        console.error('Failed to load settings:', e);
        showStatus('加载设置失败', 'error');
    }
}

// Save Settings
async function saveAllSettings() {
    try {
        // Gather server settings
        const serverSettings = {
            client_refresh_seconds: parseInt(document.getElementById('clientRefresh').value),
            server_poll_interval_seconds: parseInt(document.getElementById('serverPoll').value)
        };

        // Gather instructor and local settings
        const localSettings = {
            instructor_name: document.getElementById('instructorName').value.trim(),
            instructor_email: document.getElementById('instructorEmail').value.trim(),
            notify_updates: document.getElementById('notifyUpdates').classList.contains('active'),
            sound_enabled: document.getElementById('soundEnabled').classList.contains('active'),
            default_view: document.getElementById('defaultView').value,
            items_per_page: parseInt(document.getElementById('itemsPerPage').value),
            show_viewed_students: document.getElementById('showViewedStudents').classList.contains('active'),
            github_token: document.getElementById('githubToken').value.trim()
        };

        // Save server settings
        const res = await fetch(API.SETTINGS, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(serverSettings)
        });

        const data = await res.json();
        if (!res.ok || !data.ok) {
            throw new Error('Failed to save server settings');
        }

        // Save local settings to localStorage
        localStorage.setItem('instructorSettings', JSON.stringify(localSettings));

        showStatus('✓ 所有设置已保存', 'success');

        // Optional: redirect back to main page after a delay
        setTimeout(() => {
            // window.location.href = '/';
        }, 2000);

    } catch (e) {
        console.error('Failed to save settings:', e);
        showStatus('✗ 保存设置失败', 'error');
    }
}

// Reset Settings
function resetSettings() {
    if (!confirm('确定要恢复所有设置到默认值吗？此操作不可撤销。')) {
        return;
    }

    try {
        // Reset to default values
        document.getElementById('clientRefresh').value = DEFAULT_SETTINGS.client_refresh_seconds;
        document.getElementById('serverPoll').value = DEFAULT_SETTINGS.server_poll_interval_seconds;
        document.getElementById('instructorName').value = '';
        document.getElementById('instructorEmail').value = '';
        document.getElementById('githubToken').value = '';
        document.getElementById('defaultView').value = DEFAULT_SETTINGS.default_view;
        document.getElementById('itemsPerPage').value = DEFAULT_SETTINGS.items_per_page;

        // Reset toggles
        document.getElementById('notifyUpdates').classList.add('active');
        document.getElementById('soundEnabled').classList.remove('active');
        document.getElementById('showViewedStudents').classList.add('active');

        // Clear local storage
        localStorage.removeItem('instructorSettings');

        showStatus('✓ 已恢复默认设置', 'success');
    } catch (e) {
        console.error('Failed to reset settings:', e);
        showStatus('✗ 恢复默认设置失败', 'error');
    }
}

// Event Listeners
function initEventListeners() {
    const saveBtn = document.getElementById('saveAllSettings');
    const resetBtn = document.getElementById('resetSettings');

    if (saveBtn) saveBtn.addEventListener('click', saveAllSettings);
    if (resetBtn) resetBtn.addEventListener('click', resetSettings);
}

// Initialize
function init() {
    console.log('Initializing settings page...');
    initThemeToggle();
    initToggleSwitches();
    initEventListeners();
    loadSettings();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
