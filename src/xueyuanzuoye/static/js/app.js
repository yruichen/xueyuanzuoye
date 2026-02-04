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
    EXPORT: '/api/export/csv',
    STUDENT_DETAILS: (name) => `/api/students/${encodeURIComponent(name)}/details`,
    STUDENT_REMARKS: (name) => `/api/students/${encodeURIComponent(name)}/remarks`
};

const PHASE_LABELS = ['阶段1', '阶段2', '阶段3', '阶段4', '阶段5'];

let allRows = [];
let filteredRows = []; // 用于搜索过滤
let refreshTimer = null;
let editingStudent = null;
let currentView = 'card';
let searchQuery = ''; // 搜索关键词

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

function getCommitsDisplay(commitsCount) {
    if (commitsCount === undefined || commitsCount === null) {
        return '<span class="commits-loading"><span class="spinner-mini"></span> 抓取中...</span>';
    }
    if (commitsCount === -1) {
        return '<span class="commits-loading" style="color: #f59e0b;"><span class="spinner-mini"></span> 重试中...</span>';
    }
    if (commitsCount === 0) {
        return '<span style="color: var(--text-light); font-size: 12px;">📭 无提交</span>';
    }
    return `<span style="color: var(--qg-cyan); font-weight: 600;">🔥 ${commitsCount}</span>`;
}

function renderAvatar(avatarUrl, name) {
    if (avatarUrl) {
        return `<img src="${avatarUrl}" alt="${name}" class="student-avatar" 
                     onerror="this.style.display='none'; this.parentElement.querySelector('.student-avatar-fallback').style.display='flex';">
                <div class="student-avatar-fallback" style="display:none;">👤</div>`;
    }
    return '<div class="student-avatar-fallback">👤</div>';
}

function renderBadges(badges) {
    if (!badges || badges.length === 0) {
        return '<div class="badge-container"><span class="no-badges">暂无成就</span></div>';
    }

    // 限制显示数量，避免过于拥挤
    const displayBadges = badges.slice(0, 6);
    const moreBadges = badges.length > 6 ? badges.length - 6 : 0;

    return `<div class="badge-container">
        ${displayBadges.map(b => {
            const levelClass = b.level ? `badge-${b.level}` : '';
            const levelText = getLevelText(b.level);
            return `<span class="achievement-badge ${levelClass}" 
                         data-tooltip="${b.desc} [${levelText}]">
                ${b.icon} ${b.name}
            </span>`;
        }).join('')}
        ${moreBadges > 0 ? `<span class="achievement-badge badge-more" data-tooltip="点击查看所有${badges.length}个成就" onclick="showAllBadges(event, ${JSON.stringify(badges).replace(/"/g, '&quot;')})">+${moreBadges}</span>` : ''}
    </div>`;
}

function getLevelText(level) {
    const levelMap = {
        'legendary': '传奇',
        'epic': '史诗',
        'rare': '稀有',
        'common': '普通',
        'special': '特殊'
    };
    return levelMap[level] || '普通';
}

// Search & Filter Functions
function applyFilters() {
    const showUpdatedOnly = document.getElementById('updatedOnlyToggle').classList.contains('active');

    // 首先根据"仅显示已更新"过滤
    let rows = showUpdatedOnly ? allRows.filter(r => r.updated_since_view) : [...allRows];

    // 然后应用搜索过滤
    if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        rows = rows.filter(r => {
            const name = (r.name || '').toLowerCase();
            const repo = (r.repo || '').toLowerCase();
            // 支持拼音首字母搜索（简单实现）
            return name.includes(query) || repo.includes(query) ||
                   matchPinyin(r.name, query);
        });
    }

    filteredRows = rows;
    renderView();
}

// 简单的拼音首字母匹配（仅支持常见汉字）
function matchPinyin(name, query) {
    if (!name) return false;
    // 这里可以接入完整的拼音库，暂时用简化版
    const pinyinMap = {
        '陈': 'c', '李': 'l', '张': 'z', '王': 'w', '刘': 'l', '黄': 'h',
        '周': 'z', '吴': 'w', '郑': 'z', '徐': 'x', '孙': 's', '马': 'm',
        '朱': 'z', '胡': 'h', '郭': 'g', '何': 'h', '高': 'g', '林': 'l',
        '罗': 'l', '郑': 'z', '梁': 'l', '谢': 'x', '宋': 's', '唐': 't',
        '许': 'x', '韩': 'h', '冯': 'f', '邓': 'd', '曹': 'c', '彭': 'p',
        '曾': 'z', '萧': 'x', '田': 't', '董': 'd', '袁': 'y', '潘': 'p',
        '于': 'y', '蒋': 'j', '蔡': 'c', '余': 'y', '杜': 'd', '叶': 'y',
        '程': 'c', '苏': 's', '魏': 'w', '吕': 'l', '丁': 'd', '任': 'r',
        '沈': 's', '姚': 'y', '卢': 'l', '姜': 'j', '崔': 'c', '钟': 'z',
        '谭': 't', '陆': 'l', '汪': 'w', '范': 'f', '金': 'j', '石': 's',
        '廖': 'l', '贾': 'j', '夏': 'x', '韦': 'w', '付': 'f', '方': 'f',
        '白': 'b', '邹': 'z', '孟': 'm', '熊': 'x', '秦': 'q', '邱': 'q',
        '江': 'j', '尹': 'y', '薛': 'x', '闫': 'y', '段': 'd', '雷': 'l',
        '侯': 'h', '龙': 'l', '史': 's', '陶': 't', '黎': 'l', '贺': 'h',
        '顾': 'g', '毛': 'm', '郝': 'h', '龚': 'g', '邵': 's', '万': 'w',
        '钱': 'q', '严': 'y', '覃': 'q', '武': 'w', '戴': 'd', '莫': 'm',
        '孔': 'k', '向': 'x'
    };

    const initials = name.split('').map(char => pinyinMap[char] || '').join('');
    return initials.includes(query);
}

function handleSearch(event) {
    searchQuery = event.target.value;
    applyFilters();

    // 显示/隐藏清除按钮
    const clearBtn = document.getElementById('searchClearBtn');
    if (clearBtn) {
        clearBtn.style.display = searchQuery.trim() ? 'flex' : 'none';
    }

    // 显示搜索结果统计
    const resultCount = filteredRows.length;
    const searchResult = document.getElementById('searchResult');
    if (searchQuery.trim() && searchResult) {
        searchResult.textContent = `找到 ${resultCount} 条结果`;
        searchResult.style.display = 'block';
    } else if (searchResult) {
        searchResult.style.display = 'none';
    }
}

function clearSearch() {
    searchQuery = '';
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';

    const clearBtn = document.getElementById('searchClearBtn');
    if (clearBtn) clearBtn.style.display = 'none';

    applyFilters();
    const searchResult = document.getElementById('searchResult');
    if (searchResult) searchResult.style.display = 'none';
}

// Data Loading
async function fetchList() {
    try {
        const res = await fetch(API.LIST);
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();

        allRows = data;
        applyFilters();
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

    if (filteredRows.length === 0) {
        const emptyMsg = searchQuery.trim() ? '未找到匹配的学员' : '暂无学员数据';
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">${searchQuery.trim() ? '🔍' : '📭'}</div>
                <div class="empty-state-text">${emptyMsg}</div>
                ${searchQuery.trim() ? '<button class="btn btn-ghost" onclick="clearSearch()">清除搜索</button>' : ''}
            </div>
        `;
        return;
    }

    filteredRows.forEach(row => {
        const scores = row.scores || [0, 0, 0, 0, 0];
        const avgScore = row.avg_score || 0;
        const badges = row.badges || [];

        const card = document.createElement('div');
        card.className = `student-card ${row.updated_since_view ? 'updated' : ''}`;

        // 添加点击卡片查看详情的功能
        card.style.cursor = 'pointer';
        card.addEventListener('click', (e) => {
            // 如果点击的是按钮或输入框，不触发详情
            if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.tagName === 'A') {
                return;
            }
            showStudentDetails(row.name);
        });

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
                    onchange="handleScoreChange(this)"
                    onclick="event.stopPropagation()">
            </div>
        `).join('');

        const badgesHtml = renderBadges(badges);

        card.innerHTML = `
            <div class="student-card-header">
                <div class="student-info-header">
                    <div class="student-avatar-wrapper">
                        ${renderAvatar(row.avatar_url, row.name)}
                    </div>
                    <div>
                        <div class="student-name">${row.name || '-'}</div>
                        <a href="${row.repo}" target="_blank" class="student-repo-link" onclick="event.stopPropagation()">
                            🔗 ${truncateUrl(row.repo)}
                        </a>
                    </div>
                </div>
                ${statusBadge}
            </div>

            ${badgesHtml}

            <div class="student-meta">
                <div class="meta-item">
                    <div class="meta-label">最后更新</div>
                    <div class="meta-value">${formatDate(row.last_known_pushed_at)}</div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">最后查看</div>
                    <div class="meta-value">${formatDate(row.last_viewed_at)}</div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">提交数</div>
                    <div class="meta-value">${getCommitsDisplay(row.commits_count)}</div>
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
                <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation(); showStudentDetails('${row.name}')">
                    📊 详情
                </button>
                <button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); markViewed('${row.name}', '${row.repo}')">
                    👁️ 查看
                </button>
                <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation(); editStudent('${row.name}')">
                    ✏️ 编辑
                </button>
                <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); deleteStudent('${row.name}')">
                    🗑️ 删除
                </button>
            </div>
        `;

        container.appendChild(card);
    });

    initTooltips();
}

function renderTableView() {
    const tbody = document.querySelector('#tableView tbody');
    if (!tbody) {
        console.error('Table tbody not found');
        return;
    }

    tbody.innerHTML = '';

    if (filteredRows.length === 0) {
        const emptyMsg = searchQuery.trim() ? '未找到匹配的学员' : '暂无学员数据';
        tbody.innerHTML = `
            <tr>
                <td colspan="12" style="text-align: center; padding: 40px; color: var(--text-light);">
                    ${emptyMsg}
                    ${searchQuery.trim() ? '<br><button class="btn btn-ghost" style="margin-top: 10px;" onclick="clearSearch()">清除搜索</button>' : ''}
                </td>
            </tr>
        `;
        return;
    }

    filteredRows.forEach(row => {
        const tr = document.createElement('tr');
        if (row.updated_since_view) tr.classList.add('updated');

        const scores = row.scores || [0, 0, 0, 0, 0];
        const badges = row.badges || [];

        const statusBadge = row.updated_since_view
            ? '<span class="badge badge-warning">📌 已更新</span>'
            : '<span class="badge badge-success">✓ 无更新</span>';

        const badgesHtml = badges.length > 0
            ? `<div class="table-badges" data-tooltip="共${badges.length}个成就：${badges.map(b => b.name).join(', ')}">${badges.slice(0, 3).map(b => b.icon).join(' ')}${badges.length > 3 ? '...' : ''}</div>`
            : '<div class="table-badges no-badges">-</div>';

        tr.innerHTML = `
            <td>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div class="student-avatar-wrapper" style="width: 32px; height: 32px;">
                        ${renderAvatar(row.avatar_url, row.name)}
                    </div>
                    <div>
                        <strong>${row.name || '-'}</strong>
                        ${badgesHtml}
                    </div>
                </div>
            </td>
            <td>${statusBadge}</td>
            <td>${formatDate(row.last_known_pushed_at)}</td>
            <td>${formatDate(row.last_viewed_at)}</td>
            <td>${getCommitsDisplay(row.commits_count)}</td>
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

    initTooltips();
}

// Tooltip 功能 - 修复自动消失问题
let activeTooltipElement = null;

function initTooltips() {
    const elementsWithTooltip = document.querySelectorAll('[data-tooltip]');

    elementsWithTooltip.forEach(element => {
        // 移除旧的事件监听器（如果有）
        element.removeEventListener('mouseenter', showTooltip);
        element.removeEventListener('mouseleave', hideTooltip);

        // 添加新的事件监听器
        element.addEventListener('mouseenter', showTooltip);
        element.addEventListener('mouseleave', hideTooltip);
    });
}

function showTooltip(event) {
    // 先清理已存在的 tooltip
    hideTooltip();

    const text = event.currentTarget.getAttribute('data-tooltip');
    if (!text) return;

    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    tooltip.textContent = text;
    tooltip.id = 'active-tooltip';
    document.body.appendChild(tooltip);

    // 保存到全局变量
    activeTooltipElement = tooltip;

    const rect = event.currentTarget.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();

    let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
    let top = rect.top - tooltipRect.height - 10;

    if (left < 10) left = 10;
    if (left + tooltipRect.width > window.innerWidth - 10) {
        left = window.innerWidth - tooltipRect.width - 10;
    }
    if (top < 10) {
        top = rect.bottom + 10;
    }

    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';

    setTimeout(() => tooltip.classList.add('show'), 10);
}

function hideTooltip() {
    if (activeTooltipElement) {
        activeTooltipElement.classList.remove('show');
        const tooltipToRemove = activeTooltipElement;
        setTimeout(() => {
            if (tooltipToRemove && tooltipToRemove.parentNode) {
                tooltipToRemove.remove();
            }
        }, 200);
        activeTooltipElement = null;
    }

    // 额外清理：移除所有可能残留的 tooltip
    const existingTooltips = document.querySelectorAll('#active-tooltip');
    existingTooltips.forEach(t => {
        t.classList.remove('show');
        setTimeout(() => {
            if (t.parentNode) t.remove();
        }, 200);
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
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({name, phase, score})
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
    document.querySelector('.main-content > div:last-child').scrollIntoView({behavior: 'smooth'});
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
        ? {name, repo, old_name: editingStudent}
        : {name, repo};

    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
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
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({name})
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
        const res = await fetch(API.MARK, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({name})
        });

        if (res.ok) {
            // 立即更新本地数据状态
            const row = allRows.find(r => r.name === name);
            if (row) {
                row.updated_since_view = false;
                row.last_viewed_at = new Date().toISOString();
            }
            // 重新应用过滤和渲染
            applyFilters();
            updateStats();
        }
    } catch (e) {
        console.error('Failed to mark as viewed:', e);
    }
}

async function checkNow() {
    const btn = document.getElementById('checkBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> 检查中...';

    try {
        await fetch(API.CHECK, {method: 'POST'});
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
        a.download = `students_scores_${new Date().toISOString().slice(0, 10)}.csv`;
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
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({text})
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
            headers: {'Content-Type': 'application/json'},
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
    const cardView = document.getElementById('cardView');
    const tableView = document.getElementById('tableView');
    const viewSwitcher = document.getElementById('viewSwitcher');

    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const view = this.dataset.view;
            if (currentView === view) return;

            currentView = view;

            // 更新按钮激活状态
            document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');

            // 更新 view-switcher 的状态类
            if (view === 'table') {
                viewSwitcher.classList.add('table-active');
            } else {
                viewSwitcher.classList.remove('table-active');
            }

            if (view === 'card') {
                // 切换到卡片视图
                tableView.classList.remove('active');
                setTimeout(() => {
                    cardView.classList.remove('hiding');
                    tableView.style.display = 'none';
                }, 400);
            } else {
                // 切换到表格视图
                cardView.classList.add('hiding');
                tableView.style.display = 'block';
                setTimeout(() => {
                    tableView.classList.add('active');
                }, 50);
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
    const searchInput = document.getElementById('searchInput');

    if (checkBtn) checkBtn.addEventListener('click', checkNow);
    if (exportCsvBtn) exportCsvBtn.addEventListener('click', exportCsv);
    if (saveStudentBtn) saveStudentBtn.addEventListener('click', saveStudent);
    if (cancelEditBtn) cancelEditBtn.addEventListener('click', cancelEdit);
    if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', saveSettings);
    if (importBtn) importBtn.addEventListener('click', importStudents);

    // 绑定搜索输入框
    if (searchInput) {
        searchInput.addEventListener('input', handleSearch);
    }

    if (updatedOnlyToggle) {
        updatedOnlyToggle.addEventListener('click', function () {
            this.classList.toggle('active');
            applyFilters();
        });
    }
}

// Initialize
function init() {
    initThemeToggle();
    initViewSwitcher();
    initEventListeners();
    initAchievementsGuide();
    loadSettings();
    fetchList();
}

// 成就指南功能
function initAchievementsGuide() {
    const guideBtn = document.getElementById('achievementsGuideBtn');
    const guidePanel = document.getElementById('achievementsGuidePanel');
    const closeBtn = document.getElementById('closeGuideBtn');

    if (guideBtn && guidePanel && closeBtn) {
        guideBtn.addEventListener('click', () => {
            guidePanel.classList.add('show');
        });

        closeBtn.addEventListener('click', () => {
            guidePanel.classList.remove('show');
        });

        // 点击面板外部关闭
        guidePanel.addEventListener('click', (e) => {
            if (e.target === guidePanel) {
                guidePanel.classList.remove('show');
            }
        });
    }
}

// 显示所有成就的弹窗
function showAllBadges(event, badges) {
    event.stopPropagation();

    const modal = document.createElement('div');
    modal.className = 'badges-modal';
    modal.innerHTML = `
        <div class="badges-modal-content">
            <div class="badges-modal-header">
                <h3>🏆 获得的成就 (${badges.length}个)</h3>
                <button class="badges-modal-close" onclick="closeBadgesModal()">✕</button>
            </div>
            <div class="badges-modal-body">
                ${badges.map(b => {
                    const levelClass = b.level ? `badge-${b.level}` : '';
                    const levelText = getLevelText(b.level);
                    return `
                        <div class="badge-detail-item ${levelClass}">
                            <span class="badge-detail-icon">${b.icon}</span>
                            <div class="badge-detail-info">
                                <div class="badge-detail-name">${b.name}</div>
                                <div class="badge-detail-desc">${b.desc}</div>
                                <div class="badge-detail-level">[${levelText}]</div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add('show'), 10);

    // 点击背景关闭
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeBadgesModal();
        }
    });
}

function closeBadgesModal() {
    const modal = document.querySelector('.badges-modal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);
    }
}



// 显示学员详情模态框
async function showStudentDetails(studentName) {
    const modal = document.createElement('div');
    modal.className = 'student-details-modal';
    modal.innerHTML = `
        <div class="student-details-content">
            <div class="student-details-header">
                <h3>🔍 加载中...</h3>
                <button class="details-close-btn" onclick="closeStudentDetails()">✕</button>
            </div>
            <div class="student-details-body">
                <div class="loading-spinner">
                    <div class="spinner"></div>
                    <p>正在加载学员详情...</p>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    // 触发重绘以启动动画
    requestAnimationFrame(() => {
        modal.classList.add('show');
    });

    // 点击背景关闭
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeStudentDetails();
        }
    });

    try {
        const res = await fetch(API.STUDENT_DETAILS(studentName));
        if (!res.ok) throw new Error('Failed to load');
        const data = await res.json();

        if (!data.ok) throw new Error(data.error || 'Unknown error');

        renderStudentDetails(modal, data);
    } catch (e) {
        console.error('Failed to load student details:', e);
        modal.querySelector('.student-details-body').innerHTML = `
            <div class="error-state">
                <div class="error-icon">❌</div>
                <div class="error-text">加载失败：${e.message}</div>
                <button class="btn btn-ghost" onclick="closeStudentDetails()">关闭</button>
            </div>
        `;
    }
}

function renderStudentDetails(modal, data) {
    const { student, commits, commit_frequency, score_trend, score_history, remarks } = data;

    // 计算提交活跃度
    const totalCommits = commit_frequency.reduce((sum, item) => sum + item.count, 0);
    const activeDays = commit_frequency.filter(item => item.count > 0).length;
    const avgCommitsPerDay = activeDays > 0 ? (totalCommits / activeDays).toFixed(1) : 0;

    // 判断提交模式
    let commitPattern = "稳步提交";
    if (commits.length > 0) {
        const recentCommits = commits.slice(0, 5).length;
        const olderCommits = commits.slice(5).length;
        if (recentCommits > olderCommits * 2) {
            commitPattern = "⚡ 最后冲刺型";
        } else if (activeDays < 5 && totalCommits > 10) {
            commitPattern = "💥 集中突击型";
        } else if (activeDays > 20) {
            commitPattern = "🌟 持续稳定型";
        }
    }

    const tagsOptions = [
        { value: 'on-leave', label: '已请假', color: '#f59e0b' },
        { value: 'dropped', label: '弃坑', color: '#ef4444' },
        { value: 'technical-issue', label: '电脑故障', color: '#6b7280' },
        { value: 'excellent', label: '优秀学员', color: '#10b981' },
        { value: 'needs-help', label: '需要帮助', color: '#8b5cf6' },
        { value: 'verified', label: '已核实', color: '#0066ff' }
    ];

    modal.querySelector('.student-details-content').innerHTML = `
        <div class="student-details-header">
            <div class="details-header-left">
                <div class="details-avatar-wrapper">
                    ${renderAvatar(student.avatar_url, student.name)}
                </div>
                <div>
                    <h3>${student.name}</h3>
                    <a href="${student.repo}" target="_blank" class="details-repo-link" onclick="event.stopPropagation()">
                        🔗 ${truncateUrl(student.repo)}
                    </a>
                </div>
            </div>
            <button class="details-close-btn" onclick="closeStudentDetails()">✕</button>
        </div>

        <div class="student-details-body">
            <!-- 概览卡片 -->
            <div class="details-section">
                <h4 class="section-title">📊 学习概览</h4>
                <div class="overview-grid">
                    <div class="overview-card">
                        <div class="overview-icon">📈</div>
                        <div class="overview-value">${student.avg_score.toFixed(1)}</div>
                        <div class="overview-label">平均分</div>
                    </div>
                    <div class="overview-card">
                        <div class="overview-icon">🔥</div>
                        <div class="overview-value">${student.commits_count}</div>
                        <div class="overview-label">总提交数</div>
                    </div>
                    <div class="overview-card">
                        <div class="overview-icon">📅</div>
                        <div class="overview-value">${activeDays}</div>
                        <div class="overview-label">活跃天数</div>
                    </div>
                    <div class="overview-card">
                        <div class="overview-icon">⚡</div>
                        <div class="overview-value">${avgCommitsPerDay}</div>
                        <div class="overview-label">日均提交</div>
                    </div>
                </div>
                <div class="commit-pattern">
                    <span class="pattern-label">提交模式：</span>
                    <span class="pattern-value">${commitPattern}</span>
                </div>
            </div>

            <!-- 成就展示 -->
            ${student.badges && student.badges.length > 0 ? `
            <div class="details-section">
                <h4 class="section-title">🏆 获得的成就</h4>
                ${renderBadges(student.badges)}
            </div>
            ` : ''}

            <!-- 分数趋势图 -->
            <div class="details-section">
                <h4 class="section-title">📈 分数趋势</h4>
                <div class="score-trend-chart">
                    ${renderScoreTrendChart(score_trend)}
                </div>
            </div>

            <!-- 提交频率图 -->
            <div class="details-section">
                <h4 class="section-title">📊 提交频率 (最近30天)</h4>
                <div class="commit-frequency-chart">
                    ${renderCommitFrequencyChart(commit_frequency)}
                </div>
            </div>

            <!-- 提交历史时间轴 -->
            <div class="details-section">
                <h4 class="section-title">⏰ 提交历史 (最近30条)</h4>
                <div class="commit-timeline">
                    ${commits.length > 0 ? commits.map(commit => `
                        <div class="timeline-item">
                            <div class="timeline-dot"></div>
                            <div class="timeline-content">
                                <div class="timeline-header">
                                    <a href="${commit.url}" target="_blank" class="commit-sha" onclick="event.stopPropagation()">${commit.sha}</a>
                                    <span class="commit-date">${formatDate(commit.date)}</span>
                                </div>
                                <div class="commit-message">${escapeHtml(commit.message.split('\n')[0])}</div>
                                <div class="commit-author">by ${escapeHtml(commit.author)}</div>
                            </div>
                        </div>
                    `).join('') : '<div class="empty-timeline">暂无提交记录</div>'}
                </div>
            </div>

            <!-- 导师备注 -->
            <div class="details-section">
                <h4 class="section-title">📝 导师备注</h4>
                <div class="remarks-section">
                    <div class="remarks-tags">
                        ${tagsOptions.map(tag => `
                            <label class="tag-checkbox">
                                <input type="checkbox" value="${tag.value}" 
                                    ${remarks.tags && remarks.tags.includes(tag.value) ? 'checked' : ''}
                                    onchange="handleTagChange('${student.name}', this)">
                                <span class="tag-label" style="--tag-color: ${tag.color}">${tag.label}</span>
                            </label>
                        `).join('')}
                    </div>
                    <textarea class="remarks-textarea" 
                        placeholder="记录学员情况、特殊说明等..."
                        onchange="handleRemarksChange('${student.name}', this)">${remarks.text || ''}</textarea>
                    ${remarks.updated_at ? `<div class="remarks-timestamp">最后更新: ${formatDate(remarks.updated_at)}</div>` : ''}
                </div>
            </div>
        </div>
    `;
}

function renderScoreTrendChart(scoreTrend) {
    if (!scoreTrend || scoreTrend.length === 0) {
        return '<div class="empty-chart">暂无数据</div>';
    }

    const maxScore = 100;
    return `
        <div class="trend-chart">
            ${scoreTrend.map((item, index) => {
                const height = (item.score / maxScore) * 100;
                return `
                    <div class="trend-bar-wrapper">
                        <div class="trend-bar" style="height: ${height}%">
                            <div class="trend-value">${item.score}</div>
                        </div>
                        <div class="trend-label">${item.phase}</div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function renderCommitFrequencyChart(commitFrequency) {
    if (!commitFrequency || commitFrequency.length === 0) {
        return '<div class="empty-chart">暂无数据</div>';
    }

    const maxCommits = Math.max(...commitFrequency.map(d => d.count), 1);
    return `
        <div class="frequency-chart">
            ${commitFrequency.map(item => {
                const height = (item.count / maxCommits) * 100;
                const date = new Date(item.date);
                const dayLabel = date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
                return `
                    <div class="frequency-bar-wrapper" title="${item.date}: ${item.count} 次提交">
                        <div class="frequency-bar" style="height: ${Math.max(height, 2)}%">
                            ${item.count > 0 ? `<div class="frequency-value">${item.count}</div>` : ''}
                        </div>
                        <div class="frequency-label">${dayLabel}</div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

async function handleTagChange(studentName, checkbox) {
    const allCheckboxes = checkbox.parentElement.parentElement.querySelectorAll('input[type="checkbox"]');
    const selectedTags = Array.from(allCheckboxes)
        .filter(cb => cb.checked)
        .map(cb => cb.value);

    try {
        const res = await fetch(API.STUDENT_REMARKS(studentName), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tags: selectedTags,
                text: checkbox.closest('.remarks-section').querySelector('.remarks-textarea').value
            })
        });

        if (res.ok) {
            showToast('✓ 标签已更新');
        }
    } catch (e) {
        console.error('Failed to update tags:', e);
        showToast('✗ 标签更新失败', 'error');
    }
}

async function handleRemarksChange(studentName, textarea) {
    const tagsCheckboxes = textarea.closest('.remarks-section').querySelectorAll('input[type="checkbox"]');
    const selectedTags = Array.from(tagsCheckboxes)
        .filter(cb => cb.checked)
        .map(cb => cb.value);

    try {
        const res = await fetch(API.STUDENT_REMARKS(studentName), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: textarea.value,
                tags: selectedTags
            })
        });

        if (res.ok) {
            showToast('✓ 备注已保存');
        }
    } catch (e) {
        console.error('Failed to update remarks:', e);
        showToast('✗ 备注保存失败', 'error');
    }
}

function closeStudentDetails() {
    const modal = document.querySelector('.student-details-modal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;

    const icon = toast.querySelector('.toast-icon');
    const messageEl = toast.querySelector('.toast-message');

    icon.textContent = type === 'success' ? '✓' : '✗';
    messageEl.textContent = message;

    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// 在 window 上暴露函数以便内联事件调用
window.showStudentDetails = showStudentDetails;
window.closeStudentDetails = closeStudentDetails;
window.handleTagChange = handleTagChange;
window.handleRemarksChange = handleRemarksChange;



