# 🍅 番茄钟Todo

> 一个功能完整的番茄钟 + Todo 任务管理 + 在线自习室 Web 应用

基于 Node.js 构建，纯前端 SPA，JSON 文件存储，无需数据库即可运行。

---

## ✨ 功能

### ⏱ 番茄计时
- **专注模式** — 25~180 分钟可调倒计时，支持中途暂停
- **短休 / 长休** — 自动交替，长休间隔可配置
- **正计时** — 不限时模式，适合自由学习
- **番茄进度** — 每个任务显示 🍅 完成进度（如 2/4）
- **完成提醒** — 声音提示 + 桌面通知 + 学习报告弹窗

### ✅ 任务管理
- **分组标签** — 自定义分组（如"工作""学习""阅读"）
- **番茄目标** — 每个任务可设定目标番茄数
- **今日任务** — 每日自动重置，专注当日

### 🏫 在线自习室
- **实时同步** — WebSocket 实时推送成员状态
- **排行榜** — 按今日专注时长排名
- **鼓励系统** — 给自习室伙伴送 🔥 鼓励
- **活动动态** — 实时显示谁开始学习 / 完成任务
- **复制口令** — 一键复制房间码邀请好友

### 🎨 界面
- 深色模式（一键切换）
- 响应式设计（桌面 + 移动端）
- 4 种自习室主题（静谧图书馆 / 温馨咖啡厅 / 清晨森林 / 深夜自习室）

---

## 🚀 快速开始

### 前置条件
- Node.js >= 16

### 安装 & 运行

```bash
# 1. 进入项目目录
cd pomodoro-todo

# 2. 安装依赖
npm install

# 3. 启动服务器
node server.js
```

访问 `http://localhost:3000` 即可使用。

### 公网访问（ngrok）

```bash
ngrok http 3000
```

首次通过 ngrok 访问时，页面会显示一个**安全提醒页**，点击 **"Visit Site"** 即可进入。

---

## 📁 项目结构

```
pomodoro-todo/
├── server.js          # 入口文件，Express + WebSocket
├── db.js              # JSON 文件数据库（类 SQLite 接口）
├── auth.js            # JWT 认证中间件
├── database.json      # 数据存储文件
├── package.json
├── api/
│   ├── auth.js        # 注册 / 登录 / 个人信息
│   ├── task.js        # 任务 CRUD
│   └── room.js        # 自习室 CRUD + 统计
├── ws/
│   └── room.js        # WebSocket 自习室实时通信
└── public/
    └── index.html     # 完整前端 SPA
```

---

## 🛠 技术栈

| 前端 | 后端 |
|------|------|
| 原生 JavaScript (ES6+) | Express |
| CSS 变量（深色模式） | ws (WebSocket) |
| Canvas/SVG (环形进度条) | bcryptjs (密码加密) |
| 响应式设计 | jsonwebtoken (JWT) |
| 桌面通知 API | JSON 文件存储 |

---

## 🔌 API 概览

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 注册 |
| POST | `/api/auth/login` | 登录 |
| GET | `/api/auth/me` | 当前用户信息 |
| GET | `/api/tasks` | 今日任务列表 |
| POST | `/api/tasks` | 创建任务 |
| PATCH | `/api/tasks/:id` | 更新任务 |
| DELETE | `/api/tasks/:id` | 删除任务 |
| POST | `/api/rooms` | 创建自习室 |
| GET | `/api/rooms` | 公开自习室列表 |
| POST | `/api/rooms/join` | 加入自习室（口令） |
| GET | `/api/rooms/:code` | 自习室详情 |
| DELETE | `/api/rooms/:code` | 解散自习室 |

WebSocket 连接：`ws://localhost:3000?token=<JWT>`

---

## 📜 许可

MIT
