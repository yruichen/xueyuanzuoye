# Student Homework Monitor

A small Flask dashboard that monitors student GitHub repositories and highlights updates since you last viewed them.

## Features
- Pulls `pushed_at` from GitHub and stores it locally.
- Tracks `last_viewed_at` per student.
- Highlights repos updated since your last view.
- One-click open/mark-as-viewed from the dashboard.

## Project files
- `stu_homework.py`: Flask backend and background poller.
- `homework.html`: Frontend dashboard.
- `students.json`: Student list (name + repo URL).
- `state.json`: Auto-generated state store.

## Quick start
1. Ensure Python 3.10+ is available.
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Run the server:

```bash
python run_server.py
```

4. Open the dashboard in your browser:

```
http://localhost:5001
```

## Configuration
- Optional: set a GitHub token to avoid rate limits.

```bash
export GITHUB_TOKEN=your_token_here
```

- Adjust polling interval in `stu_homework.py` via `POLL_INTERVAL`.

## 학생列表格式 (students.json)
```json
{
  "students": [
    { "name": "张三", "repo": "https://github.com/user/repo" }
  ]
}
```

## Smoke check
Run a quick API check without starting the server:

```bash
python smoke_check.py
```
