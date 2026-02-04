const API = {
    LEADERBOARD: '/api/leaderboard'
};

let currentSort = 'avg_score';
let leaderboardData = [];
let filteredData = [];
let searchQuery = '';

// Utility Functions
function truncateUrl(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.pathname.slice(1);
    } catch {
        return url;
    }
}

function getScoreClass(score) {
    if (score >= 80) return 'high';
    if (score >= 60) return 'medium';
    return 'low';
}

function getRankBadgeClass(rank) {
    if (rank <= 3) return 'top-3';
    if (rank <= 10) return 'top-10';
    return 'other';
}

function getSortLabel(sortBy) {
    const labels = {
        'avg_score': '按平均分排序',
        'total_score': '按总分排序',
        'commits_count': '按提交数排序'
    };
    return labels[sortBy] || '按平均分排序';
}

function renderAvatar(avatarUrl, name) {
    if (avatarUrl) {
        return `<img src="${avatarUrl}" alt="${name}" class="podium-avatar-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                <div class="podium-avatar-fallback" style="display:none;">👤</div>`;
    }
    return '<div class="podium-avatar-fallback">👤</div>';
}

function renderBadges(badges) {
    if (!badges || badges.length === 0) return '';
    return badges.slice(0, 3).map(b => `<span class="mini-badge" title="${b.desc}">${b.icon}</span>`).join('');
}

// Search Functions
function handleSearch(event) {
    searchQuery = event.target.value.toLowerCase();
    applyFilters();

    // 显示/隐藏清除按钮
    const clearBtn = document.querySelector('.search-clear-btn');
    if (clearBtn) {
        clearBtn.style.display = searchQuery.trim() ? 'flex' : 'none';
    }

    const resultCount = filteredData.length;
    const searchResult = document.getElementById('searchResult');
    if (searchQuery.trim() && searchResult) {
        searchResult.textContent = `找到 ${resultCount} 位学员`;
        searchResult.style.display = 'block';
    } else if (searchResult) {
        searchResult.style.display = 'none';
    }
}

function clearSearch() {
    searchQuery = '';
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';

    const clearBtn = document.querySelector('.search-clear-btn');
    if (clearBtn) clearBtn.style.display = 'none';

    applyFilters();
    const searchResult = document.getElementById('searchResult');
    if (searchResult) searchResult.style.display = 'none';
}

function applyFilters() {
    if (searchQuery.trim()) {
        filteredData = leaderboardData.filter(student => {
            const name = (student.name || '').toLowerCase();
            const repo = (student.repo || '').toLowerCase();
            return name.includes(searchQuery) || repo.includes(searchQuery);
        });
    } else {
        filteredData = [...leaderboardData];
    }
    renderPodium();
    renderTable();
    updateStats();
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

// Load Leaderboard Data
async function loadLeaderboard(sortBy = 'avg_score') {
    try {
        const res = await fetch(`${API.LEADERBOARD}?sort_by=${sortBy}`);
        if (!res.ok) throw new Error('Failed to fetch leaderboard');

        leaderboardData = await res.json();
        currentSort = sortBy;
        applyFilters(); // 应用搜索过滤

        // Update sort info
        document.getElementById('sortInfo').textContent = getSortLabel(sortBy);

    } catch (e) {
        console.error('Failed to load leaderboard:', e);
        showError();
    }
}

// Render Podium (Top 3)
function renderPodium() {
    const top3 = filteredData.slice(0, 3);

    // Render rank 1 (first place)
    if (top3[0]) {
        const rank1 = document.getElementById('rank1');
        rank1.querySelector('.podium-name').textContent = top3[0].name || '-';
        rank1.querySelector('.podium-score').textContent = getScoreForDisplay(top3[0]);
        rank1.querySelector('.podium-commits').textContent = top3[0].commits_count || 0;

        // Update avatar
        const avatarContainer = rank1.querySelector('.podium-avatar');
        avatarContainer.innerHTML = renderAvatar(top3[0].avatar_url, top3[0].name);
    }

    // Render rank 2 (second place)
    if (top3[1]) {
        const rank2 = document.getElementById('rank2');
        rank2.querySelector('.podium-name').textContent = top3[1].name || '-';
        rank2.querySelector('.podium-score').textContent = getScoreForDisplay(top3[1]);
        rank2.querySelector('.podium-commits').textContent = top3[1].commits_count || 0;

        const avatarContainer = rank2.querySelector('.podium-avatar');
        avatarContainer.innerHTML = renderAvatar(top3[1].avatar_url, top3[1].name);
    }

    // Render rank 3 (third place)
    if (top3[2]) {
        const rank3 = document.getElementById('rank3');
        rank3.querySelector('.podium-name').textContent = top3[2].name || '-';
        rank3.querySelector('.podium-score').textContent = getScoreForDisplay(top3[2]);
        rank3.querySelector('.podium-commits').textContent = top3[2].commits_count || 0;

        const avatarContainer = rank3.querySelector('.podium-avatar');
        avatarContainer.innerHTML = renderAvatar(top3[2].avatar_url, top3[2].name);
    }
}

function getScoreForDisplay(student) {
    if (currentSort === 'avg_score') {
        return student.avg_score.toFixed(1);
    } else if (currentSort === 'total_score') {
        return student.total_score;
    } else if (currentSort === 'commits_count') {
        return student.commits_count || 0;
    }
    return student.avg_score.toFixed(1);
}

// Render Table
function renderTable() {
    const tbody = document.getElementById('leaderboardBody');
    tbody.innerHTML = '';

    if (filteredData.length === 0) {
        const emptyMsg = searchQuery.trim() ? '未找到匹配的学员' : '暂无排行数据';
        tbody.innerHTML = `
            <tr>
                <td colspan="11" class="empty-state">
                    <div class="empty-state-icon">${searchQuery.trim() ? '🔍' : '📭'}</div>
                    <div class="empty-state-text">${emptyMsg}</div>
                    ${searchQuery.trim() ? '<button class="btn btn-ghost" onclick="clearSearch()" style="margin-top: 10px;">清除搜索</button>' : ''}
                </td>
            </tr>
        `;
        return;
    }

    filteredData.forEach((student, index) => {
        const tr = document.createElement('tr');
        tr.style.animationDelay = `${index * 0.05}s`;

        const rank = student.rank;
        const rankBadgeClass = getRankBadgeClass(rank);

        // Render scores with color coding
        const scoresHtml = student.scores.map(score => {
            const scoreClass = getScoreClass(score);
            return `<td><span class="score-cell ${scoreClass}">${score}</span></td>`;
        }).join('');

        // Format commits count with loading indicator
        const commitsCount = student.commits_count;
        let commitsHtml;
        if (commitsCount === undefined || commitsCount === null) {
            commitsHtml = '<span class="commits-loading"><span class="spinner-mini"></span> 抓取中</span>';
        } else if (commitsCount === -1) {
            commitsHtml = '<span class="commits-loading" style="color: #f59e0b;"><span class="spinner-mini"></span> 重试中</span>';
        } else {
            commitsHtml = `<span class="commits-badge">🔥 ${commitsCount}</span>`;
        }

        tr.innerHTML = `
            <td>
                <div class="rank-badge ${rankBadgeClass}">
                    ${rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : rank}
                </div>
            </td>
            <td>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div class="table-avatar-wrapper">
                        ${renderAvatar(student.avatar_url, student.name)}
                    </div>
                    <div>
                        <strong>${student.name || '-'}</strong>
                        ${student.badges && student.badges.length > 0 ? `<div style="margin-top: 4px;">${renderBadges(student.badges)}</div>` : ''}
                    </div>
                </div>
            </td>
            ${scoresHtml}
            <td><strong>${student.total_score}</strong></td>
            <td>
                <span class="score-cell ${getScoreClass(student.avg_score)}">
                    ${student.avg_score.toFixed(1)}
                </span>
            </td>
            <td>${commitsHtml}</td>
            <td>
                <a href="${student.repo}" target="_blank" class="repo-link">
                    🔗 ${truncateUrl(student.repo)}
                </a>
            </td>
        `;

        tbody.appendChild(tr);
    });
}

// Update Statistics
function updateStats() {
    const totalStudents = filteredData.length;
    const avgScore = totalStudents > 0
        ? (filteredData.reduce((sum, s) => sum + s.avg_score, 0) / totalStudents).toFixed(1)
        : '0';
    const totalCommits = filteredData.reduce((sum, s) => sum + (s.commits_count || 0), 0);

    document.getElementById('totalStudents').textContent = totalStudents;
    document.getElementById('avgClassScore').textContent = avgScore;
    document.getElementById('totalCommits').textContent = totalCommits;
}

// Show Error
function showError() {
    const tbody = document.getElementById('leaderboardBody');
    tbody.innerHTML = `
        <tr>
            <td colspan="11" class="empty-state">
                <div class="empty-state-icon">⚠️</div>
                <div class="empty-state-text">加载失败，请重试</div>
            </td>
        </tr>
    `;
}

// Sort Buttons
function initSortButtons() {
    const sortButtons = document.querySelectorAll('.sort-btn');

    sortButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            // Update active state
            sortButtons.forEach(b => b.classList.remove('active'));
            this.classList.add('active');

            // Get sort type and reload
            currentSort = this.dataset.sort;
            loadLeaderboard(currentSort);
        });
    });
}

// Refresh Button
function initRefreshButton() {
    const refreshBtn = document.getElementById('refreshBtn');
    if (!refreshBtn) return;

    refreshBtn.addEventListener('click', async function() {
        this.disabled = true;
        this.innerHTML = '<span class="spinner"></span> 刷新中...';

        await loadLeaderboard(currentSort);

        this.disabled = false;
        this.innerHTML = '<span>🔄</span> 刷新排名';
    });
}

// Initialize
function init() {
    console.log('Initializing leaderboard page...');
    initThemeToggle();
    initSortButtons();
    initRefreshButton();
    loadLeaderboard(currentSort);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
