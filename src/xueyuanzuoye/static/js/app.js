const API = {
    LIST: '/api/list',
    CHECK: '/api/check',
    MARK: '/api/mark_viewed',
    SETTINGS: '/api/settings',
    IMPORT: '/api/students/import',
    ADD: '/api/students/add',
    UPDATE: '/api/students/update',
    DELETE: '/api/students/delete',
    SCORE: '/api/students/score',
    EXPORT: '/api/export/csv'
};

const PHASE_LABELS = ['阶段1', '阶段2', '阶段3', '阶段4', '阶段5'];

let allRows = [];
let refreshTimer = null;
let editingStudent = null;
let currentView = 'card';

// Utility Functions
function showStatus(elementId, message, type = 'info', duration = 3000) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = message;
    el.className = `status-msg show ${type}`;
    if (duration > 0) {
        setTimeout(() => {
            el.classList.remove('show');
        }, duration);
    }
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    try {
        const date = new Date(dateStr);
        return date.toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return dateStr;
    }
}

function truncateUrl(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.pathname.slice(1);
    } catch {
        return url;
    }
}

// Data Loading
async function fetchList() {
    try {
        const res = await fetch(API.LIST);
        if (!res.ok) throw new Error('Failed to fetch');
        allRows = await res.json();
        renderView();
        updateStats();
    } catch (e) {
        console.error('Failed to load data:', e);
    }
}

function updateStats() {
    const total = allRows.length;
    const updated = allRows.filter(r => r.updated_since_view).length;
    const avgScore = total > 0 ? (allRows.reduce((sum, r) => sum + (r.avg_score || 0), 0) / total).toFixed(1) : '0';

    document.getElementById('totalCount').textContent = total;
    document.getElementById('updatedCount').textContent = updated;
    document.getElementById('avgScore').textContent = avgScore;
    document.getElementById('lastLoaded').textContent = new Date().toLocaleTimeString('zh-CN');
}

function renderView() {
    if (currentView === 'card') {
        renderCardView();
    } else {
        renderTableView();
    }
}

function renderCardView() {
    const container = document.getElementById('cardView');
    container.innerHTML = '';

    const showUpdatedOnly = document.getElementById('updatedOnlyToggle').classList.contains('active');
    const filteredRows = showUpdatedOnly ? allRows.filter(r => r.updated_since_view) : allRows;

    if (filteredRows.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📭</div>
                <div class="empty-state-text">暂无学员数据</div>
            </div>
        `;
        return;
    }

    filteredRows.forEach(row => {
        const scores = row.scores || [0, 0, 0, 0, 0];
        const avgScore = row.avg_score || 0;

        const card = document.createElement('div');
        card.className = `student-card ${row.updated_since_view ? 'updated' : ''}`;

        const statusBadge = row.updated_since_view
            ? '<span class="badge badge-warning">📌 已更新</span>'
            : '<span class="badge badge-success">✓ 无更新</span>';

        const scoreInputsHtml = scores.map((score, index) => `
            <div class="score-item">
                <div class="score-item-label">${PHASE_LABELS[index]}</div>
                <input type="number" class="score-item-input"
                    data-name="${row.name}"
                    data-phase="${index}"
                    value="${score}"
                    min="0" max="100"
                    onchange="handleScoreChange(this)">
            </div>
        `).join('');

        card.innerHTML = `
            <div class="student-card-header">
                <div>
                    <div class="student-name">${row.name || '-'}</div>
                    <a href="${row.repo}" target="_blank" class="student-repo-link">
                        🔗 ${truncateUrl(row.repo)}
                    </a>
                </div>
                ${statusBadge}
            </div>

            <div class="student-meta">
                <div class="meta-item">
                    <div class="meta-label">最后更新</div>
                    <div class="meta-value">${formatDate(row.last_known_pushed_at)}</div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">最后查看</div>
                    <div class="meta-value">${formatDate(row.last_viewed_at)}</div>
                </div>
            </div>

            <div class="student-scores">
                <div class="scores-header">
                    五阶段评分
                    <span class="avg-score">${avgScore.toFixed(1)}</span>
                </div>
                <div class="score-items">
                    ${scoreInputsHtml}
                </div>
            </div>

            <div class="student-actions">
                <button class="btn btn-sm btn-primary" onclick="markViewed('${row.name}', '${row.repo}')">
                    👁️ 查看
                </button>
                <button class="btn btn-sm btn-ghost" onclick="editStudent('${row.name}')">
                    ✏️ 编辑
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteStudent('${row.name}')">
                    🗑️ 删除
                </button>
            </div>
        `;

        container.appendChild(card);
    });
}

function renderTableView() {
    const tbody = document.querySelector('#tableView tbody');
    tbody.innerHTML = '';

    const showUpdatedOnly = document.getElementById('updatedOnlyToggle').classList.contains('active');
    const filteredRows = showUpdatedOnly ? allRows.filter(r => r.updated_since_view) : allRows;

    if (filteredRows.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="11" style="text-align: center; padding: 40px; color: var(--text-light);">
                    暂无学员数据
                </td>
            </tr>
        `;
        return;
    }

    filteredRows.forEach(row => {
        const tr = document.createElement('tr');
        if (row.updated_since_view) tr.classList.add('updated');

        const scores = row.scores || [0, 0, 0, 0, 0];
        const statusBadge = row.updated_since_view
            ? '<span class="badge badge-warning">📌 已更新</span>'
            : '<span class="badge badge-success">✓ 无更新</span>';

        const scoreInputsHtml = scores.map((score, index) => `
            <input type="number" class="table-score-input"
                data-name="${row.name}"
                data-phase="${index}"
                value="${score}"
                min="0" max="100"
                onchange="handleScoreChange(this)">
        `).join('');

        tr.innerHTML = `
            <td><strong>${row.name || '-'}</strong></td>
            <td>${statusBadge}</td>
            <td>${formatDate(row.last_known_pushed_at)}</td>
            <td>${formatDate(row.last_viewed_at)}</td>
            ${scores.map((score, index) => `
                <td>
                    <input type="number" class="table-score-input"
                        data-name="${row.name}"
                        data-phase="${index}"
                        value="${score}"
                        min="0" max="100"
                        onchange="handleScoreChange(this)">
                </td>
            `).join('')}
            <td><strong>${(row.avg_score || 0).toFixed(1)}</strong></td>
            <td>
                <div class="action-btns">
                    <button class="btn btn-sm btn-primary" onclick="markViewed('${row.name}', '${row.repo}')">👁️</button>
                    <button class="btn btn-sm btn-ghost" onclick="editStudent('${row.name}')">✏️</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteStudent('${row.name}')">🗑️</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Score Management
async function handleScoreChange(input) {
    const name = input.dataset.name;
    const phase = parseInt(input.dataset.phase);
    const score = Math.max(0, Math.min(100, parseInt(input.value) || 0));
    input.value = score;
    input.classList.add('changed');

    try {
        const res = await fetch(API.SCORE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, phase, score })
        });

        const data = await res.json();
        if (res.ok && data.ok) {
            input.classList.remove('changed');
            const row = allRows.find(r => r.name === name);
            if (row) {
                row.scores[phase] = score;
                row.avg_score = row.scores.reduce((a, b) => a + b, 0) / 5;
                updateStats();
            }
            showStatus('settingsStatus', `✓ ${name} 的${PHASE_LABELS[phase]}评分已保存`, 'success', 2000);
        } else {
            throw new Error('Save failed');
        }
    } catch (e) {
        input.classList.add('changed');
        showStatus('settingsStatus', `✗ 评分保存失败`, 'error', 3000);
    }
}

// Student Management
function editStudent(name) {
    const student = allRows.find(r => r.name === name);
    if (!student) return;

    editingStudent = name;
    document.getElementById('studentName').value = student.name;
    document.getElementById('studentRepo').value = student.repo;
    document.getElementById('saveStudentBtn').textContent = '更新学员';
    document.getElementById('cancelEditBtn').style.display = 'block';

    // Scroll to form
    document.querySelector('.main-content > div:last-child').scrollIntoView({ behavior: 'smooth' });
}

function cancelEdit() {
    editingStudent = null;
    document.getElementById('studentName').value = '';
    document.getElementById('studentRepo').value = '';
    document.getElementById('saveStudentBtn').textContent = '新增学员';
    document.getElementById('cancelEditBtn').style.display = 'none';
    showStatus('studentStatus', '已取消编辑', 'info', 2000);
}

async function saveStudent() {
    const name = document.getElementById('studentName').value.trim();
    const repo = document.getElementById('studentRepo').value.trim();

    if (!name || !repo) {
        showStatus('studentStatus', '请填写姓名和仓库链接', 'error');
        return;
    }

    const endpoint = editingStudent ? API.UPDATE : API.ADD;
    const payload = editingStudent
        ? { name, repo, old_name: editingStudent }
        : { name, repo };

    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (res.ok && data.ok) {
            showStatus('studentStatus', editingStudent ? '✓ 学员信息已更新' : '✓ 学员已添加', 'success');
            cancelEdit();
            await fetchList();
        } else {
            const errorMsg = data.error === 'name exists' ? '姓名已存在' :
                           data.error === 'repo exists' ? '仓库已存在' :
                           data.error === 'not found' ? '学员不存在' : '操作失败';
            showStatus('studentStatus', errorMsg, 'error');
        }
    } catch (e) {
        showStatus('studentStatus', '网络错误', 'error');
    }
}

async function deleteStudent(name) {
    if (!confirm(`确定要删除学员 ${name} 吗？此操作不可恢复。`)) return;

    try {
        const res = await fetch(API.DELETE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });

        const data = await res.json();
        if (res.ok && data.ok) {
            showStatus('studentStatus', '✓ 学员已删除', 'success');
            if (editingStudent === name) cancelEdit();
            await fetchList();
        } else {
            showStatus('studentStatus', '删除失败', 'error');
        }
    } catch (e) {
        showStatus('studentStatus', '网络错误', 'error');
    }
}

// Actions
async function markViewed(name, repo) {
    window.open(repo, '_blank');
    try {
        await fetch(API.MARK, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        await fetchList();
    } catch (e) {
        console.error('Failed to mark as viewed:', e);
    }
}

async function checkNow() {
    const btn = document.getElementById('checkBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> 检查中...';

    try {
        await fetch(API.CHECK, { method: 'POST' });
        await fetchList();
    } catch (e) {
        console.error('Check failed:', e);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>🔄</span> 立即检查更新';
    }
}

async function exportCsv() {
    try {
        const res = await fetch(API.EXPORT);
        if (!res.ok) throw new Error('Export failed');

        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `students_scores_${new Date().toISOString().slice(0,10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);

        showStatus('settingsStatus', '✓ CSV已导出', 'success', 2000);
    } catch (e) {
        showStatus('settingsStatus', '✗ 导出失败', 'error');
    }
}

async function importStudents() {
    const text = document.getElementById('importText').value.trim();
    if (!text) {
        showStatus('importStatus', '请输入要导入的内容', 'error');
        return;
    }

    try {
        const res = await fetch(API.IMPORT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });

        const data = await res.json();
        if (res.ok && data.ok) {
            showStatus('importStatus',
                `✓ 导入完成：新增 ${data.added} 个，更新 ${data.updated} 个，跳过 ${data.skipped} 个`,
                'success');
            document.getElementById('importText').value = '';
            await fetchList();
        } else {
            showStatus('importStatus', '导入失败，请检查格式', 'error');
        }
    } catch (e) {
        showStatus('importStatus', '网络错误', 'error');
    }
}

async function saveSettings() {
    const clientRefresh = parseInt(document.getElementById('clientRefresh').value);
    const serverPoll = parseInt(document.getElementById('serverPoll').value);

    try {
        const res = await fetch(API.SETTINGS, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_refresh_seconds: clientRefresh,
                server_poll_interval_seconds: serverPoll
            })
        });

        const data = await res.json();
        if (res.ok && data.ok) {
            showStatus('settingsStatus', '✓ 设置已保存', 'success');
            setRefreshInterval(data.settings.client_refresh_seconds);
        } else {
            showStatus('settingsStatus', '保存失败', 'error');
        }
    } catch (e) {
        showStatus('settingsStatus', '网络错误', 'error');
    }
}

async function loadSettings() {
    try {
        const res = await fetch(API.SETTINGS);
        const settings = await res.json();
        document.getElementById('clientRefresh').value = settings.client_refresh_seconds;
        document.getElementById('serverPoll').value = settings.server_poll_interval_seconds;
        setRefreshInterval(settings.client_refresh_seconds);
    } catch (e) {
        console.error('Failed to load settings:', e);
    }
}

function setRefreshInterval(seconds) {
    document.getElementById('refreshLabel').textContent = seconds;
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(fetchList, seconds * 1000);
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

// View Switching
function initViewSwitcher() {
    const viewWrapper = document.querySelector('.view-wrapper');
    const viewSwitcher = document.querySelector('.view-switcher');

    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const view = this.dataset.view;
            if (currentView === view) return; // 如果已经是当前视图，不做任何操作

            currentView = view;

            // 更新按钮激活状态
            document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');

            if (view === 'card') {
                // 切换到卡片视图
                if (viewWrapper) {
                    viewWrapper.classList.remove('flipping');
                }
                if (viewSwitcher) {
                    viewSwitcher.classList.remove('table-active'); // 移除表格激活状态，滑块移回左侧
                }
                const cardView = document.getElementById('cardView');
                const tableView = document.getElementById('tableView');
                if (cardView) cardView.style.display = 'grid';
                if (tableView) tableView.classList.remove('active');
            } else {
                // 切换到表格视图
                if (viewWrapper) {
                    viewWrapper.classList.add('flipping');
                }
                if (viewSwitcher) {
                    viewSwitcher.classList.add('table-active'); // 添加表格激活状态，滑块移到右侧
                }
                const cardView = document.getElementById('cardView');
                const tableView = document.getElementById('tableView');
                if (cardView) cardView.style.display = 'grid'; // 保持显示以支持动画
                if (tableView) tableView.classList.add('active');
            }

            renderView();
        });
    });
}

// Event Listeners
function initEventListeners() {
    const checkBtn = document.getElementById('checkBtn');
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    const saveStudentBtn = document.getElementById('saveStudentBtn');
    const cancelEditBtn = document.getElementById('cancelEditBtn');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const importBtn = document.getElementById('importBtn');
    const updatedOnlyToggle = document.getElementById('updatedOnlyToggle');

    if (checkBtn) checkBtn.addEventListener('click', checkNow);
    if (exportCsvBtn) exportCsvBtn.addEventListener('click', exportCsv);
    if (saveStudentBtn) saveStudentBtn.addEventListener('click', saveStudent);
    if (cancelEditBtn) cancelEditBtn.addEventListener('click', cancelEdit);
    if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', saveSettings);
    if (importBtn) importBtn.addEventListener('click', importStudents);

    if (updatedOnlyToggle) {
        updatedOnlyToggle.addEventListener('click', function() {
            this.classList.toggle('active');
            renderView();
        });
    }
}

// Initialize
function init() {
    console.log('Initializing app...');
    initThemeToggle();
    initViewSwitcher();
    initEventListeners();
    loadSettings();
    fetchList();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
