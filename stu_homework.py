import os
import json
import threading
import time
from datetime import datetime, timezone
from urllib.parse import urlparse
import requests
from flask import Flask, jsonify, request, send_file, redirect, abort

# 基本路径
BASE_DIR = os.path.dirname(__file__)
STUDENTS_FILE = os.path.join(BASE_DIR, "students.json")
STATE_FILE = os.path.join(BASE_DIR, "state.json")
HTML_FILE = os.path.join(BASE_DIR, "homework.html")
SETTINGS_FILE = os.path.join(BASE_DIR, "settings.json")

GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN")  # 可选，放在环境变量中以提高配额
POLL_INTERVAL = 300  # 5 分钟轮询一次
DEFAULT_SETTINGS = {
    "server_poll_interval_seconds": POLL_INTERVAL,
    "client_refresh_seconds": 60,
}

app = Flask(__name__)


def load_students():
    with open(STUDENTS_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    # 支持两种结构：{ "students": [...] } 或直接列表
    if isinstance(data, dict) and "students" in data:
        return data["students"]
    return data


def save_students(students):
    with open(STUDENTS_FILE, "w", encoding="utf-8") as f:
        json.dump({"students": students}, f, ensure_ascii=False, indent=2)


def load_state():
    if not os.path.exists(STATE_FILE):
        return {}
    with open(STATE_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_state(state):
    with open(STATE_FILE, "w", encoding="utf-8") as f:
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
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(normalized, f, ensure_ascii=False, indent=2)
    return normalized


def iso_now():
    return datetime.now(timezone.utc).isoformat()


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
        if pushed_at and prev.get("last_known_pushed_at") != pushed_at:
            # 更新了
            prev["last_known_pushed_at"] = pushed_at
            # 保留 last_viewed_at 不变
            if "last_viewed_at" not in prev:
                prev["last_viewed_at"] = None
            state[name] = prev
            changed = True
    if changed:
        save_state(state)
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


@app.route("/")
def index():
    # 直接返回静态 html 页面文件
    if os.path.exists(HTML_FILE):
        return send_file(HTML_FILE)
    return "homework.html not found", 404


@app.route("/api/list")
def api_list():
    students = load_students()
    state = load_state()
    rows = []
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
        rows.append({
            "name": name,
            "repo": repo,
            "last_known_pushed_at": last_known,
            "last_viewed_at": last_viewed,
            "updated_since_view": updated_since_view
        })
    return jsonify(rows)


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
    if not name or not repo:
        return jsonify({"ok": False, "error": "missing name or repo"}), 400

    students = load_students()
    if any(s.get("name") == name for s in students):
        return jsonify({"ok": False, "error": "name exists"}), 409
    if any(s.get("repo") == repo for s in students):
        return jsonify({"ok": False, "error": "repo exists"}), 409

    students.append({"name": name, "repo": repo})
    save_students(students)
    return jsonify({"ok": True})


@app.route("/api/students/update", methods=["POST"])
def api_students_update():
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    repo = normalize_repo_url(data.get("repo") or "")
    old_name = (data.get("old_name") or name).strip()
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


def repo_owner_and_name(repo_url):
    # 处理常见 github 地址，返回 owner/repo
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
    return repo_url.strip()


def parse_import_text(text):
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
    owner, repo = repo_owner_and_name(repo_url)
    if not owner or not repo:
        return None
    api_url = f"https://api.github.com/repos/{owner}/{repo}"
    headers = {"Accept": "application/vnd.github.v3+json"}
    if GITHUB_TOKEN:
        headers["Authorization"] = f"token {GITHUB_TOKEN}"
    resp = requests.get(api_url, headers=headers, timeout=10)
    if resp.status_code != 200:
        return None
    return resp.json()
