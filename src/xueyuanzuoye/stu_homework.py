import os
import json
import threading
import time
from datetime import datetime, timezone
from urllib.parse import urlparse
import requests
from flask import Flask, jsonify, request, send_file, redirect, abort, make_response
import io
import csv
from pathlib import Path

# 基本路径（兼容重构后的位置）
# PACKAGE_DIR: package folder (e.g. .../src/xueyuanzuoye)
PACKAGE_DIR = Path(__file__).resolve().parent
# REPO_ROOT: two levels up from package dir (repo root)
REPO_ROOT = PACKAGE_DIR.parents[1] if len(PACKAGE_DIR.parents) > 1 else PACKAGE_DIR

# 缓存配置
CACHE_DURATION = 60  # API 响应缓存60秒
api_cache = {
    'leaderboard': {'data': None, 'timestamp': 0},
    'list': {'data': None, 'timestamp': 0}
}
cache_lock = threading.Lock()

def resolve_data_file(name: str) -> str:
    """Return a sensible path for a data file (students.json/state.json/settings.json).
    Search order:
      1. package dir (PACKAGE_DIR/name)
      2. repo root (REPO_ROOT/name)
      3. repo root data/ (REPO_ROOT/data/name)
    Returns the first existing path, otherwise returns PACKAGE_DIR/name as default.
    """
    candidates = [PACKAGE_DIR / name, REPO_ROOT / name, REPO_ROOT / 'data' / name]
    for p in candidates:
        if p.exists():
            return str(p)
    # default to package-local path (ensure parent exists on save)
    return str(candidates[0])

def resolve_static_file(rel: str) -> str:
    """Resolve a static file (like 'static/homework.html') from package or repo root."""
    cand_pkg = PACKAGE_DIR / rel
    cand_root = REPO_ROOT / rel
    if cand_pkg.exists():
        return str(cand_pkg)
    if cand_root.exists():
        return str(cand_root)
    return str(cand_pkg)

# Flask static folder points to package static by default
STATIC_FOLDER = str(PACKAGE_DIR / 'static')

# Data files (resolved dynamically for compatibility)
STUDENTS_FILE = resolve_data_file('students.json')
STATE_FILE = resolve_data_file('state.json')
HTML_FILE = resolve_static_file('static/homework.html')
SETTINGS_FILE = resolve_data_file('settings.json')

GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN")  # 可选，放在环境变量中以提高配额
POLL_INTERVAL = 300  # 5 分钟轮询一次
DEFAULT_SETTINGS = {
    "server_poll_interval_seconds": POLL_INTERVAL,
    "client_refresh_seconds": 60,
}

# 时间阶段标签
PHASE_LABELS = ["第一阶段", "第二阶段", "第三阶段", "第四阶段", "第五阶段"]

# 将 app 初始化为使用 static 文件夹
app = Flask(__name__, static_url_path='/static', static_folder=STATIC_FOLDER)


def clamp_score(v):
    """将分数限制在0-100之间"""
    try:
        i = int(v)
    except (TypeError, ValueError):
        return 0
    if i < 0:
        return 0
    if i > 100:
        return 100
    return i


def init_scores():
    """初始化5个阶段的分数"""
    return [0, 0, 0, 0, 0]


def load_students():
    # If the students file doesn't exist, return an empty list so module import
    # or background threads do not crash after a layout change.
    if not Path(STUDENTS_FILE).exists():
        return []
    try:
        with open(STUDENTS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        # Backup corrupt file and create a fresh empty students file to avoid API 500s
        try:
            import shutil
            ts = datetime.now().strftime('%Y%m%d-%H%M%S')
            backup_dir = Path(REPO_ROOT) / 'backups' / f'corrupt-{ts}'
            backup_dir.mkdir(parents=True, exist_ok=True)
            shutil.copy2(STUDENTS_FILE, backup_dir / Path(STUDENTS_FILE).name)
            # overwrite with a safe empty structure so subsequent saves work
            p = Path(STUDENTS_FILE)
            if not p.parent.exists():
                p.parent.mkdir(parents=True, exist_ok=True)
            with open(str(p), 'w', encoding='utf-8') as fw:
                json.dump({"students": []}, fw, ensure_ascii=False, indent=2)
            # debug output removed
        except Exception:
            # debug output removed
            pass
        return []
    except Exception:
        # Any other IO error - silently return empty list (no debug prints)
        return []

    # 支持两种结构：{ "students": [...] } 或直接列表
    if isinstance(data, dict) and "students" in data:
        students = data["students"]
    else:
        students = data
    # 确保每一项都有 scores 字段（5个阶段）
    mutated = False
    for s in students:
        if not isinstance(s, dict):
            continue
        # 迁移旧的 score 字段到 scores 数组
        if "score" in s and "scores" not in s:
            s["scores"] = init_scores()
            del s["score"]
            mutated = True
        elif "scores" not in s:
            s["scores"] = init_scores()
            mutated = True
        else:
            # 确保 scores 是长度为5的列表
            if not isinstance(s["scores"], list) or len(s["scores"]) != 5:
                s["scores"] = init_scores()
                mutated = True
            else:
                # 规范化每个分数
                normalized = [clamp_score(sc) for sc in s["scores"]]
                if normalized != s["scores"]:
                    s["scores"] = normalized
                    mutated = True
    if mutated:
        save_students(students)
    return students


def save_students(students):
    p = Path(STUDENTS_FILE)
    if not p.parent.exists():
        p.parent.mkdir(parents=True, exist_ok=True)
    with open(str(p), "w", encoding="utf-8") as f:
        json.dump({"students": students}, f, ensure_ascii=False, indent=2)


def load_state():
    if not os.path.exists(STATE_FILE):
        return {}
    with open(STATE_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_state(state):
    p = Path(STATE_FILE)
    if not p.parent.exists():
        p.parent.mkdir(parents=True, exist_ok=True)
    with open(str(p), "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)


def normalize_settings(data):
    settings = DEFAULT_SETTINGS.copy()
    if isinstance(data, dict):
        for key, default in DEFAULT_SETTINGS.items():
            raw = data.get(key, default)
            try:
                value = int(raw)
            except (TypeError, ValueError):
                value = default
            if value < 5:
                value = 5
            if value > 3600:
                value = 3600
            settings[key] = value
    return settings


def load_settings():
    if not os.path.exists(SETTINGS_FILE):
        return DEFAULT_SETTINGS.copy()
    with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    return normalize_settings(data)


def save_settings(settings):
    normalized = normalize_settings(settings)
    p = Path(SETTINGS_FILE)
    if not p.parent.exists():
        p.parent.mkdir(parents=True, exist_ok=True)
    with open(str(p), "w", encoding="utf-8") as f:
        json.dump(normalized, f, ensure_ascii=False, indent=2)
    return normalized


def iso_now():
    return datetime.now(timezone.utc).isoformat()


def get_cached_response(cache_key):
    """获取缓存的响应"""
    with cache_lock:
        cached = api_cache.get(cache_key)
        if cached and cached['data'] is not None:
            elapsed = time.time() - cached['timestamp']
            if elapsed < CACHE_DURATION:
                return cached['data']
    return None


def set_cached_response(cache_key, data):
    """设置缓存响应"""
    with cache_lock:
        api_cache[cache_key] = {
            'data': data,
            'timestamp': time.time()
        }


def invalidate_cache():
    """清空所有缓存"""
    with cache_lock:
        for key in api_cache:
            api_cache[key] = {'data': None, 'timestamp': 0}


def check_all():
    students = load_students()
    state = load_state()
    changed = False
    for s in students:
        name = s.get("name")
        repo = s.get("repo")
        if not name or not repo:
            continue
        info = fetch_repo_info(repo)
        if not info:
            continue
        pushed_at = info.get("pushed_at")  # ISO 8601 string or None
        prev = state.get(name, {})

        # Update pushed_at if changed
        if pushed_at and prev.get("last_known_pushed_at") != pushed_at:
            prev["last_known_pushed_at"] = pushed_at
            if "last_viewed_at" not in prev:
                prev["last_viewed_at"] = None
            changed = True

        # Fetch and update commits count periodically
        commits_count = fetch_commits_count(repo)
        # Update if: 1) we got a valid count (>= 0), 2) it's different from current, or 3) it's the first time
        if commits_count >= 0:
            current_count = prev.get("commits_count", None)
            # Always update if we don't have a count yet, or if the count changed
            if current_count is None or current_count != commits_count:
                prev["commits_count"] = commits_count
                changed = True

        if changed:
            state[name] = prev
            save_state(state)  # Save immediately after each student
            changed = False  # Reset for next student

    return state


def background_loop():
    while True:
        try:
            check_all()
        except Exception:
            pass
        settings = load_settings()
        interval = settings.get("server_poll_interval_seconds", POLL_INTERVAL)
        time.sleep(interval)


# 启动后台检查线程（守护线程）
t = threading.Thread(target=background_loop, daemon=True)
t.start()


# ==================== 辅助函数 ====================

def repo_owner_and_name(repo_url):
    """处理常见 github 地址，返回 owner/repo"""
    parsed = urlparse(repo_url)
    path = parsed.path.rstrip("/")
    if path.startswith("/"):
        path = path[1:]
    # 去掉.git 后缀
    if path.endswith(".git"):
        path = path[:-4]
    parts = path.split("/")
    if len(parts) >= 2:
        return parts[0], parts[1]
    return None, None


def normalize_repo_url(repo_url):
    """标准化仓库 URL"""
    return repo_url.strip()


def extract_github_username(repo_url):
    """Extract GitHub username from repo URL"""
    owner, _ = repo_owner_and_name(repo_url)
    return owner if owner else None


def get_avatar_url(repo_url, size=80):
    """Generate GitHub avatar URL from repo URL"""
    username = extract_github_username(repo_url)
    if username:
        return f"https://github.com/{username}.png?size={size}"
    return None


def calculate_badges(student_data, state_entry):
    """Calculate badges for a student based on their data"""
    badges = []
    scores = student_data.get("scores", [0, 0, 0, 0, 0])
    commits_count = state_entry.get("commits_count", 0)
    last_pushed = state_entry.get("last_known_pushed_at")

    # 确保 scores 是有效的列表
    if not isinstance(scores, list) or len(scores) != 5:
        scores = [0, 0, 0, 0, 0]

    avg_score = sum(scores) / len(scores) if scores else 0
    total_score = sum(scores)
    non_zero_scores = [s for s in scores if s > 0]

    # ========== 入门级成就（非常容易达成） ==========

    # 🎉 初来乍到 - 只要有1个阶段有分数
    if len(non_zero_scores) >= 1:
        badges.append({"icon": "🎉", "name": "初来乍到", "desc": "完成第一个阶段", "level": "common"})

    # 📝 踏实前行 - 有2个阶段有分数
    if len(non_zero_scores) >= 2:
        badges.append({"icon": "📝", "name": "踏实前行", "desc": "完成2个阶段", "level": "common"})

    # 🌱 成长中 - 有3个阶段有分数
    if len(non_zero_scores) >= 3:
        badges.append({"icon": "🌱", "name": "成长中", "desc": "完成3个阶段", "level": "common"})

    # 🚶 稳步推进 - 有4个阶段有分数
    if len(non_zero_scores) >= 4:
        badges.append({"icon": "🚶", "name": "稳步推进", "desc": "完成4个阶段", "level": "common"})

    # 💯 任务达人 - 完成所有5个阶段
    if len(non_zero_scores) >= 5:
        badges.append({"icon": "💯", "name": "任务达人", "desc": "完成全部5个阶段", "level": "rare"})

    # 📊 及格万岁 - 平均分≥60
    if avg_score >= 60:
        badges.append({"icon": "📊", "name": "及格万岁", "desc": "平均分≥60", "level": "common"})

    # 🔰 开门红 - 第一个阶段得分≥70
    if len(scores) >= 1 and scores[0] >= 70:
        badges.append({"icon": "🔰", "name": "开门红", "desc": "第一阶段≥70", "level": "common"})

    # ⭐ 新手之光 - 第一个阶段得分≥85
    if len(scores) >= 1 and scores[0] >= 85:
        badges.append({"icon": "⭐", "name": "新手之光", "desc": "第一阶段≥85", "level": "rare"})

    # 💪 努力者 - 提交数≥10
    if commits_count >= 10:
        badges.append({"icon": "💪", "name": "努力者", "desc": "提交数≥10次", "level": "common"})

    # ⚡ 初露锋芒 - 提交数≥25
    if commits_count >= 25:
        badges.append({"icon": "⚡", "name": "初露锋芒", "desc": "提交数≥25次", "level": "common"})

    # ========== 进阶级成就（容易达成） ==========

    # 📖 良好 - 平均分≥70
    if avg_score >= 70:
        badges.append({"icon": "📖", "name": "良好", "desc": "平均分≥70", "level": "rare"})

    # ✏️ 优等生 - 平均分≥80
    if avg_score >= 80:
        badges.append({"icon": "✏️", "name": "优等生", "desc": "平均分≥80", "level": "rare"})

    # 🔥 勤奋者 - 提交数≥50
    if commits_count >= 50:
        badges.append({"icon": "🔥", "name": "勤奋者", "desc": "提交数≥50次", "level": "rare"})

    # 🎯 单项冠军 - 有1个阶段≥90分
    high_score_phases = sum(1 for score in scores if score >= 90)
    if high_score_phases >= 1:
        badges.append({"icon": "🎯", "name": "单项冠军", "desc": "有1个阶段≥90分", "level": "rare"})

    # 🌟 双冠王 - 有2个阶段≥90分
    if high_score_phases >= 2:
        badges.append({"icon": "🌟", "name": "双冠王", "desc": "有2个阶段≥90分", "level": "rare"})

    # 💎 满分首秀 - 有任意1个阶段满分
    perfect_phases = sum(1 for score in scores if score == 100)
    if perfect_phases >= 1:
        badges.append({"icon": "💎", "name": "满分首秀", "desc": "获得首个满分", "level": "rare"})

    # ========== 稀有级成就（中等难度） ==========

    # 🚀 全能战士 - 所有阶段都及格(≥60)
    if all(score >= 60 for score in scores) and all(score > 0 for score in scores):
        badges.append({"icon": "🚀", "name": "全能战士", "desc": "所有阶段≥60", "level": "rare"})

    # 💪 勤奋之星 - 提交数≥80
    if commits_count >= 80:
        badges.append({"icon": "💪", "name": "勤奋之星", "desc": "提交数≥80次", "level": "epic"})

    # 🎯 三冠王 - 有3个阶段≥90分
    if high_score_phases >= 3:
        badges.append({"icon": "🎯", "name": "三冠王", "desc": "有3个阶段≥90分", "level": "epic"})

    # 🌈 进步之星 - 分数呈上升趋势（后三阶段明显高于前两阶段）
    if len(scores) >= 5 and all(s > 0 for s in scores):
        first_avg = sum(scores[:2]) / 2
        last_avg = sum(scores[2:]) / 3
        if last_avg > first_avg + 15 and last_avg >= 70:
            badges.append({"icon": "🌈", "name": "进步之星", "desc": "持续进步超15分", "level": "rare"})

    # 💫 冲刺王 - 最后一个阶段分数最高且≥85
    if len(scores) >= 5 and scores[-1] > 0:
        if scores[-1] == max(scores) and scores[-1] >= 85:
            badges.append({"icon": "💫", "name": "冲刺王", "desc": "最后阶段表现最好", "level": "rare"})

    # 🎖️ 稳定发挥 - 五个阶段分数波动小
    if len(scores) == 5 and all(s > 0 for s in scores):
        import math
        mean = sum(scores) / len(scores)
        variance = sum((s - mean) ** 2 for s in scores) / len(scores)
        std_dev = math.sqrt(variance)
        if std_dev < 10 and mean >= 70:
            badges.append({"icon": "🎖️", "name": "稳定发挥", "desc": "分数波动小且稳定", "level": "rare"})

    # 🏅 均衡发展 - 所有阶段分数在70-90之间（没有特别高或特别低）
    if all(70 <= score <= 90 for score in scores) and all(score > 0 for score in scores):
        badges.append({"icon": "🏅", "name": "均衡发展", "desc": "所有阶段70-90分", "level": "rare"})

    # ========== 史诗级成就（较难） ==========

    # 📚 学霸 - 平均分≥90
    if avg_score >= 90:
        badges.append({"icon": "📚", "name": "学霸", "desc": "平均分≥90", "level": "epic"})

    # 💎 精益求精 - 所有阶段分数≥85
    if all(score >= 85 for score in scores) and all(score > 0 for score in scores):
        badges.append({"icon": "💎", "name": "精益求精", "desc": "所有阶段≥85", "level": "epic"})

    # 🔥 超级肝帝 - 提交数≥150
    if commits_count >= 150:
        badges.append({"icon": "🔥", "name": "超级肝帝", "desc": "提交数≥150次", "level": "epic"})

    # ⭐ 高效新星 - 提交数少但平均分高
    if 10 <= commits_count <= 35 and avg_score >= 85:
        badges.append({"icon": "⭐", "name": "高效新星", "desc": "低提交高分数", "level": "epic"})

    # 🎯 四冠王 - 有4个阶段≥90分
    if high_score_phases >= 4:
        badges.append({"icon": "🎯", "name": "四冠王", "desc": "有4个阶段≥90分", "level": "epic"})

    # 💫 满分双响 - 有2个阶段满分
    if perfect_phases >= 2:
        badges.append({"icon": "💫", "name": "满分双响", "desc": "获得2个满分", "level": "epic"})

    # ========== 传奇级成就（最难） ==========

    # 🏆 完美主义者 - 所有阶段满分
    if all(score == 100 for score in scores) and len(scores) == 5:
        badges.append({"icon": "🏆", "name": "完美主义者", "desc": "所有阶段满分", "level": "legendary"})

    # 🌟 神级学霸 - 平均分≥95
    if avg_score >= 95:
        badges.append({"icon": "🌟", "name": "神级学霸", "desc": "平均分≥95", "level": "legendary"})

    # 🎨 代码艺术家 - 提交数很多且平均分也高
    if commits_count >= 100 and avg_score >= 85:
        badges.append({"icon": "🎨", "name": "代码艺术家", "desc": "量质兼优", "level": "legendary"})

    # 🎓 学习榜样 - 平均分≥90且提交数≥60
    if avg_score >= 90 and commits_count >= 60:
        badges.append({"icon": "🎓", "name": "学习榜样", "desc": "成绩优异且勤奋", "level": "legendary"})

    # 👑 全满贯 - 有4个或以上阶段满分
    if perfect_phases >= 4:
        badges.append({"icon": "👑", "name": "全满贯", "desc": f"获得{perfect_phases}个满分", "level": "legendary"})

    # ========== 特殊成就（彩蛋） ==========

    # 🦉 夜猫子 - 凌晨2-5点提交过代码
    if last_pushed:
        try:
            push_time = datetime.fromisoformat(last_pushed.replace("Z", "+00:00"))
            from datetime import timedelta
            local_time = push_time + timedelta(hours=8)
            if 2 <= local_time.hour < 5:
                badges.append({"icon": "🦉", "name": "夜猫子", "desc": "凌晨2-5点提交", "level": "special"})
        except Exception:
            pass

    # 🌠 早起鸟 - 早上6-8点提交过代码
    if last_pushed:
        try:
            push_time = datetime.fromisoformat(last_pushed.replace("Z", "+00:00"))
            from datetime import timedelta
            local_time = push_time + timedelta(hours=8)
            if 6 <= local_time.hour < 8:
                badges.append({"icon": "🌠", "name": "早起鸟", "desc": "早上6-8点提交", "level": "special"})
        except Exception:
            pass

    # 🎁 幸运儿 - 总分正好是特殊数字
    lucky_numbers = [222, 250, 300, 333, 350, 400, 444, 450, 500]
    if int(total_score) in lucky_numbers:
        badges.append({"icon": "🎁", "name": "幸运儿", "desc": f"总分正好{int(total_score)}分", "level": "special"})

    # 🎲 幸运7 - 有任意阶段分数是77
    if 77 in scores:
        badges.append({"icon": "🎲", "name": "幸运7", "desc": "获得77分", "level": "special"})

    # 🎰 对称美 - 分数回文（如 80, 90, 100, 90, 80）
    if len(scores) == 5 and scores == scores[::-1] and all(s > 0 for s in scores):
        badges.append({"icon": "🎰", "name": "对称美", "desc": "分数完美对称", "level": "special"})

    # 📈 直线上升 - 每个阶段都比前一个高（严格递增）
    if len(scores) >= 3 and all(s > 0 for s in scores):
        is_increasing = all(scores[i] < scores[i+1] for i in range(len(scores)-1))
        if is_increasing:
            badges.append({"icon": "📈", "name": "直线上升", "desc": "分数逐步提升", "level": "special"})

    # 🎪 提交狂人 - 提交数≥200（超级稀有）
    if commits_count >= 200:
        badges.append({"icon": "🎪", "name": "提交狂人", "desc": "提交数≥200次", "level": "special"})

    # 按稀有度和字母排序
    level_order = {"legendary": 0, "epic": 1, "rare": 2, "common": 3, "special": 4}
    badges.sort(key=lambda b: (level_order.get(b.get("level", "common"), 99), b.get("name", "")))

    return badges


def parse_import_text(text):
    """解析导入文本"""
    entries = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        name = None
        repo = None
        if "," in line:
            name, repo = [p.strip() for p in line.split(",", 1)]
        elif "\t" in line:
            name, repo = [p.strip() for p in line.split("\t", 1)]
        else:
            parts = line.split()
            if len(parts) >= 2:
                name, repo = parts[0], parts[1]
            else:
                repo = parts[0]
        if repo:
            repo = normalize_repo_url(repo)
        if repo and not name:
            owner, repo_name = repo_owner_and_name(repo)
            name = owner or repo_name or repo
        entries.append({"name": name, "repo": repo})
    return entries


def fetch_repo_info(repo_url):
    """获取仓库信息"""
    owner, repo = repo_owner_and_name(repo_url)
    if not owner or not repo:
        return None
    api_url = f"https://api.github.com/repos/{owner}/{repo}"
    headers = {"Accept": "application/vnd.github.v3+json"}
    if GITHUB_TOKEN:
        headers["Authorization"] = f"token {GITHUB_TOKEN}"
    try:
        resp = requests.get(api_url, headers=headers, timeout=10)
        if resp.status_code != 200:
            return None
        return resp.json()
    except Exception:
        # debug output removed
        return None


def fetch_commits_count(repo_url):
    """Fetch total commits count for a repository"""
    owner, repo = repo_owner_and_name(repo_url)
    if not owner or not repo:
        return 0
    api_url = f"https://api.github.com/repos/{owner}/{repo}/commits"
    headers = {"Accept": "application/vnd.github.v3+json"}
    if GITHUB_TOKEN:
        headers["Authorization"] = f"token {GITHUB_TOKEN}"
    try:
        # Try to get the first page with per_page=1 to check pagination
        resp = requests.get(api_url, headers=headers, timeout=10, params={"per_page": 1})
        if resp.status_code == 404:
            # Repository not found or empty
            return 0
        if resp.status_code != 200:
            # Other errors, return -1 to indicate we should retry
            return -1

        # Check if there's a Link header with pagination info
        link_header = resp.headers.get('Link', '')
        if 'rel="last"' in link_header:
            # Extract last page number (this is the total count when per_page=1)
            import re
            match = re.search(r'page=(\d+)>; rel="last"', link_header)
            if match:
                return int(match.group(1))

        # If no pagination, the repository has fewer commits than per_page
        # Get actual count by requesting without pagination limit
        resp2 = requests.get(api_url, headers=headers, timeout=10, params={"per_page": 100})
        if resp2.status_code == 200:
            commits = resp2.json()
            if isinstance(commits, list):
                return len(commits)
        return 0
    except Exception:
        # debug output removed
        return -1


# ==================== Flask 路由 ====================

@app.route("/")
def index():
    # 优先从 static 中返回 homework.html
    try:
        # 如果 static/homework.html 存在，直接返回
        if os.path.exists(HTML_FILE):
            return send_file(HTML_FILE)
        return "homework.html not found", 404
    except Exception as e:
        print(f"Error serving index: {e}")
        return "内部错误", 500


@app.route("/settings")
def settings_page():
    """Serve the settings page"""
    try:
        settings_file = resolve_static_file('static/settings.html')
        if os.path.exists(settings_file):
            return send_file(settings_file)
        return "settings.html not found", 404
    except Exception as e:
        print(f"Error serving settings page: {e}")
        return "内部错误", 500


@app.route("/leaderboard")
def leaderboard_page():
    """Serve the leaderboard page"""
    try:
        leaderboard_file = resolve_static_file('static/leaderboard.html')
        if os.path.exists(leaderboard_file):
            return send_file(leaderboard_file)
        return "leaderboard.html not found", 404
    except Exception as e:
        print(f"Error serving leaderboard page: {e}")
        return "内部错误", 500


@app.route("/api/list")
def api_list():
    students = load_students()
    state = load_state()
    rows = []
    students_by_name = {s.get("name"): s for s in students if s.get("name")}

    for s in students:
        name = s.get("name")
        repo = s.get("repo")
        st = state.get(name, {})
        last_known = st.get("last_known_pushed_at")
        last_viewed = st.get("last_viewed_at")
        updated_since_view = False
        if last_known:
            if not last_viewed:
                updated_since_view = True
            else:
                try:
                    updated_since_view = datetime.fromisoformat(last_known.replace("Z", "+00:00")) > datetime.fromisoformat(last_viewed.replace("Z", "+00:00"))
                except Exception:
                    updated_since_view = last_viewed != last_known

        # 获取 scores（5个阶段）
        scores = init_scores()
        if name and name in students_by_name:
            student_scores = students_by_name[name].get("scores", init_scores())
            if isinstance(student_scores, list) and len(student_scores) == 5:
                scores = [clamp_score(sc) for sc in student_scores]
            else:
                scores = init_scores()

        commits_count = st.get("commits_count", 0)
        avatar_url = get_avatar_url(repo)
        badges = calculate_badges(s, st)

        rows.append({
            "name": name,
            "repo": repo,
            "last_known_pushed_at": last_known,
            "last_viewed_at": last_viewed,
            "updated_since_view": updated_since_view,
            "scores": scores,
            "avg_score": sum(scores) / 5 if scores else 0,
            "commits_count": commits_count,
            "avatar_url": avatar_url,
            "badges": badges
        })

    return jsonify(rows)


@app.route("/api/leaderboard")
def api_leaderboard():
    """Get leaderboard data with sorting options"""
    sort_by = request.args.get("sort_by", "avg_score")
    cache_key = f'leaderboard_{sort_by}'

    # 检查缓存
    cached = get_cached_response(cache_key)
    if cached is not None:
        return jsonify(cached)

    students = load_students()
    state = load_state()

    leaderboard = []
    for s in students:
        name = s.get("name")
        repo = s.get("repo")
        scores = s.get("scores", init_scores())
        if not isinstance(scores, list) or len(scores) != 5:
            scores = init_scores()

        st = state.get(name, {})
        commits_count = st.get("commits_count", 0)

        avg_score = sum(scores) / 5 if scores else 0
        total_score = sum(scores)

        # Get avatar URL
        avatar_url = get_avatar_url(repo)

        # Calculate badges
        badges = calculate_badges(s, st)

        leaderboard.append({
            "name": name,
            "repo": repo,
            "scores": scores,
            "avg_score": avg_score,
            "total_score": total_score,
            "commits_count": commits_count,
            "avatar_url": avatar_url,
            "badges": badges
        })

    # Sort based on the requested field
    reverse = True  # Higher is better
    if sort_by == "avg_score":
        leaderboard.sort(key=lambda x: x["avg_score"], reverse=reverse)
    elif sort_by == "total_score":
        leaderboard.sort(key=lambda x: x["total_score"], reverse=reverse)
    elif sort_by == "commits_count":
        leaderboard.sort(key=lambda x: x["commits_count"], reverse=reverse)

    # Add rank
    for idx, item in enumerate(leaderboard, 1):
        item["rank"] = idx

    # 缓存结果
    set_cached_response(cache_key, leaderboard)
    return jsonify(leaderboard)


@app.route("/api/check", methods=["POST"])
def api_check():
    try:
        state = check_all()
        return jsonify({"ok": True, "state": state})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/mark_viewed", methods=["POST"])
def api_mark_viewed():
    data = request.get_json() or {}
    name = data.get("name")
    if not name:
        return jsonify({"ok": False, "error": "missing name"}), 400
    state = load_state()
    entry = state.get(name, {})
    entry["last_viewed_at"] = iso_now()
    # 如果没有 last_known_pushed_at，尝试先 fetch
    if "last_known_pushed_at" not in entry:
        students = load_students()
        repo = next((s.get("repo") for s in students if s.get("name") == name), None)
        if repo:
            info = fetch_repo_info(repo)
            if info:
                entry["last_known_pushed_at"] = info.get("pushed_at")
    state[name] = entry
    save_state(state)
    return jsonify({"ok": True, "entry": entry})


@app.route("/api/settings", methods=["GET", "POST"])
def api_settings():
    if request.method == "GET":
        return jsonify(load_settings())
    data = request.get_json() or {}
    saved = save_settings(data)
    return jsonify({"ok": True, "settings": saved})


@app.route("/api/students/import", methods=["POST"])
def api_students_import():
    data = request.get_json() or {}
    new_entries = []
    if isinstance(data.get("students"), list):
        for item in data["students"]:
            if not isinstance(item, dict):
                continue
            name = item.get("name")
            repo = item.get("repo")
            if name and repo:
                new_entries.append({"name": name, "repo": normalize_repo_url(repo)})
    text = data.get("text")
    if isinstance(text, str) and text.strip():
        new_entries.extend(parse_import_text(text))

    if not new_entries:
        return jsonify({"ok": False, "error": "no valid entries"}), 400

    students = load_students()
    existing_by_name = {s.get("name"): s for s in students if s.get("name")}
    existing_repos = {s.get("repo") for s in students if s.get("repo")}
    added = 0
    updated = 0
    skipped = 0
    for entry in new_entries:
        name = entry.get("name")
        repo = entry.get("repo")
        if not name or not repo:
            skipped += 1
            continue
        if name in existing_by_name:
            if existing_by_name[name].get("repo") != repo:
                existing_by_name[name]["repo"] = repo
                updated += 1
            else:
                skipped += 1
            continue
        if repo in existing_repos:
            skipped += 1
            continue
        students.append({"name": name, "repo": repo})
        existing_repos.add(repo)
        added += 1

    save_students(students)
    return jsonify({"ok": True, "added": added, "updated": updated, "skipped": skipped})


@app.route("/api/students/add", methods=["POST"])
def api_students_add():
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    repo = normalize_repo_url(data.get("repo") or "")
    scores = data.get("scores", init_scores())
    if not isinstance(scores, list) or len(scores) != 5:
        scores = init_scores()
    else:
        scores = [clamp_score(sc) for sc in scores]

    if not name or not repo:
        return jsonify({"ok": False, "error": "missing name or repo"}), 400

    students = load_students()
    if any(s.get("name") == name for s in students):
        return jsonify({"ok": False, "error": "name exists"}), 409
    if any(s.get("repo") == repo for s in students):
        return jsonify({"ok": False, "error": "repo exists"}), 409

    students.append({"name": name, "repo": repo, "scores": scores})
    save_students(students)
    return jsonify({"ok": True})


@app.route("/api/students/update", methods=["POST"])
def api_students_update():
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    repo = normalize_repo_url(data.get("repo") or "")
    old_name = (data.get("old_name") or name).strip()
    scores_provided = "scores" in data
    scores = data.get("scores", init_scores())
    if not isinstance(scores, list) or len(scores) != 5:
        scores = init_scores()
    else:
        scores = [clamp_score(sc) for sc in scores]

    if not name or not repo or not old_name:
        return jsonify({"ok": False, "error": "missing name or repo"}), 400

    students = load_students()
    target = next((s for s in students if s.get("name") == old_name), None)
    if not target:
        return jsonify({"ok": False, "error": "not found"}), 404

    if name != old_name and any(s.get("name") == name for s in students):
        return jsonify({"ok": False, "error": "name exists"}), 409
    if any(s.get("repo") == repo and s is not target for s in students):
        return jsonify({"ok": False, "error": "repo exists"}), 409

    target["name"] = name
    target["repo"] = repo
    if scores_provided:
        target["scores"] = scores
    save_students(students)
    return jsonify({"ok": True})


@app.route("/api/students/delete", methods=["POST"])
def api_students_delete():
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"ok": False, "error": "missing name"}), 400

    students = load_students()
    filtered = [s for s in students if s.get("name") != name]
    if len(filtered) == len(students):
        return jsonify({"ok": False, "error": "not found"}), 404

    save_students(filtered)
    return jsonify({"ok": True})


def load_remarks():
    """Load teacher remarks for students"""
    remarks_file = resolve_data_file('remarks.json')
    if not os.path.exists(remarks_file):
        return {}
    try:
        with open(remarks_file, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}

def save_remarks(remarks):
    """Save teacher remarks"""
    remarks_file = resolve_data_file('remarks.json')
    p = Path(remarks_file)
    if not p.parent.exists():
        p.parent.mkdir(parents=True, exist_ok=True)
    with open(str(p), 'w', encoding='utf-8') as f:
        json.dump(remarks, f, ensure_ascii=False, indent=2)

def fetch_commit_history(repo_url, limit=30):
    """Fetch commit history for timeline visualization"""
    owner, repo = repo_owner_and_name(repo_url)
    if not owner or not repo:
        return []

    api_url = f"https://api.github.com/repos/{owner}/{repo}/commits"
    headers = {"Accept": "application/vnd.github.v3+json"}
    if GITHUB_TOKEN:
        headers["Authorization"] = f"token {GITHUB_TOKEN}"

    try:
        resp = requests.get(api_url, headers=headers, timeout=10, params={"per_page": limit})
        if resp.status_code != 200:
            # debug output removed
            return []

        commits = resp.json()
        if not isinstance(commits, list):
            # debug output removed
            return []

        history = []
        for commit in commits:
            commit_data = commit.get("commit", {})
            author_data = commit_data.get("author", {})

            history.append({
                "sha": commit.get("sha", "")[:7],
                "message": commit_data.get("message", "No message"),
                "date": author_data.get("date", ""),
                "author": author_data.get("name", "Unknown"),
                "url": commit.get("html_url", "")
            })
        return history
    except requests.exceptions.Timeout:
        # debug output removed
        return []
    except requests.exceptions.RequestException:
        # debug output removed
        return []
    except Exception:
        # debug output removed
        return []

def load_score_history():
    """Load historical score changes"""
    history_file = resolve_data_file('score_history.json')
    if not os.path.exists(history_file):
        return {}
    try:
        with open(history_file, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}

def save_score_history(history):
    """Save score history"""
    history_file = resolve_data_file('score_history.json')
    p = Path(history_file)
    if not p.parent.exists():
        p.parent.mkdir(parents=True, exist_ok=True)
    with open(str(p), 'w', encoding='utf-8') as f:
        json.dump(history, f, ensure_ascii=False, indent=2)

def record_score_change(name, phase, old_score, new_score):
    """Record a score change for trend analysis"""
    history = load_score_history()
    if name not in history:
        history[name] = []

    history[name].append({
        "timestamp": iso_now(),
        "phase": phase,
        "old_score": old_score,
        "new_score": new_score
    })

    # Keep only last 100 changes per student
    if len(history[name]) > 100:
        history[name] = history[name][-100:]

    save_score_history(history)

@app.route("/api/students/<name>/details")
def api_student_details(name):
    """Get detailed information for a specific student"""
    students = load_students()
    state = load_state()
    remarks = load_remarks()
    score_history = load_score_history()

    student = next((s for s in students if s.get("name") == name), None)
    if not student:
        return jsonify({"ok": False, "error": "not found"}), 404

    repo = student.get("repo", "")
    scores = student.get("scores", init_scores())
    if not isinstance(scores, list) or len(scores) != 5:
        scores = init_scores()

    st = state.get(name, {})

    # Fetch commit history
    commits = fetch_commit_history(repo, limit=30)

    # Get score history
    student_score_history = score_history.get(name, [])

    # Get remarks
    student_remarks = remarks.get(name, {
        "text": "",
        "tags": [],
        "updated_at": None
    })

    # Calculate commit frequency (commits per day over last 30 days)
    commit_frequency = []
    if commits:
        from collections import defaultdict
        from datetime import datetime, timedelta

        commits_by_date = defaultdict(int)
        for commit in commits:
            try:
                commit_date = datetime.fromisoformat(commit["date"].replace("Z", "+00:00"))
                date_str = commit_date.strftime("%Y-%m-%d")
                commits_by_date[date_str] += 1
            except Exception:
                # debug output removed
                pass

        # Fill in missing dates for last 30 days
        today = datetime.now()
        for i in range(29, -1, -1):
            date = today - timedelta(days=i)
            date_str = date.strftime("%Y-%m-%d")
            commit_frequency.append({
                "date": date_str,
                "count": commits_by_date.get(date_str, 0)
            })
    else:
        # 如果没有提交记录，返回30天的空数据
        from datetime import datetime, timedelta
        today = datetime.now()
        for i in range(29, -1, -1):
            date = today - timedelta(days=i)
            date_str = date.strftime("%Y-%m-%d")
            commit_frequency.append({
                "date": date_str,
                "count": 0
            })

    # Calculate score trend (aggregate by phase)
    score_trend = []
    for i, score in enumerate(scores):
        score_trend.append({
            "phase": PHASE_LABELS[i],
            "score": score
        })

    response_data = {
        "ok": True,
        "student": {
            "name": name,
            "repo": repo,
            "scores": scores,
            "avg_score": sum(scores) / 5 if scores else 0,
            "commits_count": st.get("commits_count", 0),
            "last_pushed": st.get("last_known_pushed_at"),
            "last_viewed": st.get("last_viewed_at"),
            "avatar_url": get_avatar_url(repo),
            "badges": calculate_badges(student, st)
        },
        "commits": commits,
        "commit_frequency": commit_frequency,
        "score_trend": score_trend,
        "score_history": student_score_history[-20:],
        "remarks": student_remarks
    }

    # debug output removed
    return jsonify(response_data)

@app.route("/api/students/<name>/remarks", methods=["GET", "POST"])
def api_student_remarks(name):
    """Get or update teacher remarks for a student"""
    remarks = load_remarks()

    if request.method == "GET":
        return jsonify(remarks.get(name, {
            "text": "",
            "tags": [],
            "updated_at": None
        }))

    # POST: Update remarks
    data = request.get_json() or {}
    text = data.get("text", "").strip()
    tags = data.get("tags", [])

    if not isinstance(tags, list):
        tags = []

    remarks[name] = {
        "text": text,
        "tags": tags,
        "updated_at": iso_now()
    }

    save_remarks(remarks)
    return jsonify({"ok": True, "remarks": remarks[name]})

@app.route("/api/students/score", methods=["POST"])
def api_students_score():
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"ok": False, "error": "missing name"}), 400
    if "phase" not in data or "score" not in data:
        return jsonify({"ok": False, "error": "missing phase or score"}), 400
    try:
        phase = int(data.get("phase"))
        if phase < 0 or phase > 4:
            return jsonify({"ok": False, "error": "invalid phase"}), 400
        score = clamp_score(data.get("score"))
    except Exception:
        return jsonify({"ok": False, "error": "invalid phase or score"}), 400

    students = load_students()
    target = next((s for s in students if s.get("name") == name), None)
    if not target:
        return jsonify({"ok": False, "error": "not found"}), 404

    if "scores" not in target or not isinstance(target["scores"], list) or len(target["scores"]) != 5:
        target["scores"] = init_scores()

    old_score = target["scores"][phase]
    target["scores"][phase] = score

    # Record score change for history
    if old_score != score:
        record_score_change(name, phase, old_score, score)

    save_students(students)
    invalidate_cache()
    return jsonify({"ok": True, "student": {"name": target.get("name"), "repo": target.get("repo"), "scores": target.get("scores")}})


@app.route('/api/export/csv')
def api_export_csv():
    students = load_students()
    state = load_state()

    output = io.StringIO()
    writer = csv.writer(output)
    # CSV 头部
    header = ["姓名", "仓库链接", "最后更新时间", "最后查看时间"]
    for label in PHASE_LABELS:
        header.append(label)
    header.append("平均分")
    writer.writerow(header)

    for s in students:
        name = s.get('name', '')
        repo = s.get('repo', '')
        st = state.get(name, {})
        last_known = st.get('last_known_pushed_at', '')
        last_viewed = st.get('last_viewed_at', '')
        scores = s.get('scores', init_scores())
        if not isinstance(scores, list) or len(scores) != 5:
            scores = init_scores()
        avg = sum(scores) / 5

        row = [name, repo, last_known, last_viewed] + scores + [f"{avg:.1f}"]
        writer.writerow(row)

    # 添加 UTF-8 BOM 以便 Excel 正确识别中文
    csv_content = '\ufeff' + output.getvalue()
    resp = make_response(csv_content.encode('utf-8'))
    resp.headers['Content-Type'] = 'text/csv; charset=utf-8'
    resp.headers['Content-Disposition'] = 'attachment; filename=students_scores.csv'
    return resp


@app.route("/view/<path:name>")
def view_repo(name):
    # 根据名字找到 repo，标记为已查看并跳转
    students = load_students()
    decoded = name
    repo = next((s.get("repo") for s in students if s.get("name") == decoded), None)
    if not repo:
        return abort(404)
    # 标记为已查看
    state = load_state()
    entry = state.get(decoded, {})
    entry["last_viewed_at"] = iso_now()
    state[decoded] = entry
    save_state(state)
    return redirect(repo)
