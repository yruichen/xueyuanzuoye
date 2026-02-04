# 学员作业监控（README）

这是一个小型的 Flask 仪表盘项目，用来监控学员的 GitHub 仓库并高亮显示自上次查看以来的更新。

本文档（中文）说明如何准备环境并正确启动服务器，以及常见的运行/重构步骤说明。

---

## 先决条件

- Python 3.10 或更高版本
- 建议使用虚拟环境来隔离依赖

项目根目录结构（简要）:

- `stu_homework.py`：应用主逻辑（将来可能位于包内 `src/xueyuanzuoye/`）
- `static/`、`templates/`：前端静态文件和模板
- `students.json`、`state.json`：学员数据与运行时状态（可移动到 `data/`）
- `tools/`：开发/调试脚本（可能包含若干 helper）
- `scripts/run_server.py`：启动脚本（现在已提供，兼容重构前/后布局）

---

## 快速启动（推荐）

下面的步骤在 macOS zsh 环境下可直接复制执行。

1) 创建并激活虚拟环境：

```bash
python3 -m venv .venv
source .venv/bin/activate
```

2) 安装依赖：

```bash
pip install -r requirements.txt
```

3) 启动服务器（使用项目内的启动器，兼容重构前后）：

```bash
python3 scripts/run_server.py
```

默认行为：
- 地址：`127.0.0.1`（可通过环境变量修改）
- 端口：`5000`（可通过环境变量修改）

可用环境变量：
- `FLASK_RUN_HOST`：设置监听地址（例如 `0.0.0.0`）
- `FLASK_RUN_PORT`：设置端口（例如 `5001`）
- `FLASK_DEBUG`：启用 debug（`1`/`true`/`yes`）
- `GITHUB_TOKEN`：可选，设置 GitHub token 以提高 API 访问配额

例如在 5001 端口启动并开启 debug：

```bash
export FLASK_RUN_PORT=5001
export FLASK_DEBUG=1
python3 scripts/run_server.py
```

然后在浏览器打开：

```
http://localhost:5001/
```

---

## 如果你要重构项目布局（可选）

仓库中已经包含一个安全的重构脚本 `tools/restructure.py`，它会把若干开发/调试文件归档到更合理的位置，并在移动任何东西之前创建带时间戳的备份。

使用方法（强烈建议先做 git 提交以保留当前状态）：

```bash
# 保存当前状态
git add -A
git commit -m "chore: checkpoint before restructure"

# 查看将要执行的操作（干跑）
python3 tools/restructure.py --dry-run

# 如果输出看起来正确，执行实际迁移（会提示确认）
python3 tools/restructure.py

# 非交互模式（跳过确认）
python3 tools/restructure.py --yes
```

重构脚本会把被移动的原文件复制到 `backups/<timestamp>/` 里，迁移后如需恢复可以手动从该目录复制回原位置。

---

## 数据文件（students/state）说明

- `students.json`：学员列表，通常格式如下：

```json
{
  "students": [
    { "name": "张三", "repo": "https://github.com/user/repo" }
  ]
}
```

- `state.json`：运行时保存的每个学员上次查看/上次更新时间信息。请在生产部署时把这些运行时状态放到 `data/` 或其它持久化位置（不要随意把临时状态覆盖）。

---

## 排错（常见问题）

- 端口被占用：更改 `FLASK_RUN_PORT`，或停止占用进程（`lsof -i :5000`）
- 无法导入 `stu_homework`：如果你已经运行过重构，确保使用 `python3 scripts/run_server.py`（它会尝试多种导入方式）。
- 权限问题：确保运行用户对 `students.json`/`state.json` 有读写权限。

---

## 其他建议

- 在进行大改动前请先提交代码（git commit）。
- 若打算将项目打包/发布，建议采用 `src/` 布局并在 `pyproject.toml` 中配置包查找（脚本 `tools/restructure.py` 已为你提供了建议）。

---

如果你希望我直接执行重构（用 `tools/restructure.py` 实际移动文件并修正 `stu_homework.py` 中的数据路径），我可以继续执行：请回复“现在执行重构”或告诉我你想保留的具体布局选项（例如 `src/` 布局或保留顶层模块）。
