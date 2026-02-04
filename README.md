# 学员作业监控（QG AI 训练营）

这是一个基于 Flask 的小型仪表盘，用于监控学员的 GitHub 仓库、展示分数与提交情况，并支持导师备注与成就系统。

## 功能概览
- 学员列表（卡片 / 表格视图切换）
- 成就（Badges）自动计算并展示
- 学员详情透视：提交时间轴、提交频率、分数趋势、导师备注
- 导入/导出学员数据（CSV）
- 后台定期抓取仓库提交信息（可配置）

## 目录结构（常见）
- `src/xueyuanzuoye/stu_homework.py`：后端主程序
- `src/xueyuanzuoye/static/`：前端静态资源（HTML / CSS / JS）
- `students.json`、`state.json`：数据文件（可放在 repo 根或 `data/`）
- `scripts/run_server.py`：启动脚本（兼容重构前后结构）

## 运行环境
- Python 3.10+
- 建议使用虚拟环境

安装依赖（示例）：

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 启动（开发）
使用项目自带启动器：

```bash
python3 scripts/run_server.py
```

可通过环境变量调整：
- `FLASK_RUN_HOST`（默认 `127.0.0.1`）
- `FLASK_RUN_PORT`（默认 `5001`）
- `FLASK_DEBUG`（`1`/`true`/`yes` 开启 debug）
- `GITHUB_TOKEN`（可选，提升 GitHub API 配额）

示例：

```bash
export FLASK_RUN_PORT=5001
export FLASK_DEBUG=1
python3 scripts/run_server.py
```

访问：`http://localhost:5001/`

## 配置与数据文件
- `students.json`：学员列表；支持两种格式：直接数组或 `{ "students": [...] }`。
- `state.json`：运行时保存的每学员抓取信息（last_known_pushed_at、last_viewed_at、commits_count 等）
- `settings.json`：可配置项（轮询间隔、前端刷新等），首次不存在会使用默认设置。

注意：生产部署时请把数据文件放在持久化目录（如 `data/`），并保证读写权限。

## 常见操作
- 添加/编辑学员：右侧管理面板
- 批量导入：粘贴 `姓名, 仓库` 或每行一个链接
- 导出 CSV：顶部工具栏导出当前学员数据
- 查看详情：点击学员卡片打开详情模态框（包含提交时间轴与备注）

## 维护建议
- 重要改动前请先 git 提交（`git add -A && git commit -m "checkpoint"`）
- 若要重构目录，使用 `tools/restructure.py`（会生成备份）
- 若需提高 GitHub API 限额，请设置 `GITHUB_TOKEN` 环境变量

---

## 更新日志（CHANGELOG）
- v0.0.1 — 初始稳定版本
  - 基本的学员列表 / 分数管理 / 导入导出功能
  - 后台抓取仓库信息与提交计数
  - 成就系统基础实现

- v0.0.2 — 改进（本次）
  - 移除后端运行时的调试打印输出，减少控制台噪音，生产/部署更干净
  - 修复并完善学员详情模态框的数据结构返回（包含提交历史、提交频率、分数趋势、导师备注）
  - README 重写，补充运行说明与 CHANGELOG
  - 前端交互优化（模态框、成就展示、tooltip 行为等）——参见前端静态文件变更记录

如果需要我把 README 中的示例命令改为更具体的部署说明（如 systemd 配置、Dockerfile、supervisor 等），请说明偏好，我会继续补充。
