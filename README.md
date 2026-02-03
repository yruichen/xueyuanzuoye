# 学员作业监控

一个小型的 Flask 仪表盘，用于监控学员的 GitHub 仓库，并高亮显示自上次查看以来的更新。

## 功能
- 从 GitHub 拉取 `pushed_at` 并存储到本地。
- 每个学员跟踪 `last_viewed_at`。
- 高亮显示自上次查看以来更新的仓库。
- 仪表盘支持一键打开/标记为已查看。

## 项目文件
- `stu_homework.py`：Flask 后端和后台轮询器。
- `homework.html`：前端仪表盘。
- `students.json`：学员列表（姓名 + 仓库链接）。
- `state.json`：自动生成的状态存储。

## 快速开始
1. 确保已安装 Python 3.10+。
2. 安装依赖：

```bash
pip install -r requirements.txt
```

3. 运行服务器：

```bash
python run_server.py
```

4. 在浏览器中打开仪表盘：

```
http://localhost:5001
```

## 配置
- 可选：设置 GitHub token 以避免速率限制。

```bash
export GITHUB_TOKEN=your_token_here
```

- 在 `stu_homework.py` 中调整轮询间隔：`POLL_INTERVAL`。

## 学员列表格式 (students.json)
```json
{
  "students": [
    { "name": "张三", "repo": "https://github.com/user/repo" }
  ]
}
```

## 前端功能
- **新增学员**：输入姓名和仓库链接。
- **编辑学员**：修改现有学员信息。
- **删除学员**：移除学员。
- **导入学员**：批量导入学员链接。
- **参数设置**：调整自动刷新和后台检查间隔。
