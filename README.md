# 每日打卡 — 完整部署教程

## 项目简介

面向大众的打卡 + 数据榜单网页应用。管理员后台管理，用户打卡赚积分。

---

## 🚀 快速部署到 GitHub Pages（免费，推荐）

### 第一步：注册 GitHub

1. 打开 [github.com](https://github.com)，点 **Sign up** 注册账号
2. 验证邮箱后登录

### 第二步：创建仓库

1. 点右上角 **+** → **New repository**
2. Repository name：`daily-checkin`
3. 选 **Public**（公开）
4. **不要**勾选 "Add a README file"
5. 点 **Create repository**

### 第三步：上传文件

1. 在仓库页面，点 **uploading an existing file**
2. 将以下文件**全部拖入**上传区域：

```
index.html
app.html
admin.html
manifest.json
sw.js
README.md
css/style.css
js/supabase.js
js/auth.js
js/app.js
js/admin.js
supabase/schema.sql
```

3. 点 **Commit changes**

### 第四步：开启 GitHub Pages

1. 仓库页面 → **Settings** → 左侧点 **Pages**
2. **Branch** 选择 `main`，点 **Save**
3. 等待 1-2 分钟，页面显示：
   > ✅ Your site is live at `https://你的用户名.github.io/daily-checkin/`

### 第五步：在 iPhone 上添加到主屏幕

1. Safari 打开上面的网址
2. 点底部 **分享按钮**（方框+箭头）
3. 滑动找到 **添加到主屏幕**
4. 名称改为「每日打卡」，点 **添加**
5. 主屏幕出现 ✅ 图标，像原生 App 一样打开！

---

## 🔧 Supabase 配置（可选，演示模式已可用）

不配置 Supabase 也能用——数据存在浏览器本地。但多人数据和跨设备同步需要配置：

1. [supabase.com](https://supabase.com) 注册 → 创建项目
2. Authentication → Settings → 关闭 **Confirm email**
3. Settings → API → 复制 Project URL 和 anon key
4. 修改 `js/supabase.js` 中的 `SUPABASE_URL` 和 `SUPABASE_ANON_KEY`
5. SQL Editor → 运行 `supabase/schema.sql` 全部内容
6. 重新部署（重复第三步上传文件）

---

## 👑 管理员账号

| 模式 | 管理员账号 |
|------|-----------|
| 演示模式（本地） | **admin** / **admin123** |
| Supabase 模式 | 注册后手动在数据库 `profiles` 表设 `is_admin = true` |

---

## 📁 文件结构

```
daily-checkin/
├── index.html          ← 登录/注册页
├── app.html            ← 用户主页面（打卡+榜单+排行+我的）
├── admin.html          ← 管理员后台
├── manifest.json       ← PWA 配置
├── sw.js               ← 离线缓存
├── css/
│   └── style.css       ← 全局样式
├── js/
│   ├── supabase.js     ← 数据库配置
│   ├── auth.js         ← 认证逻辑
│   ├── app.js          ← 用户端逻辑
│   └── admin.js        ← 管理员逻辑
└── supabase/
    └── schema.sql      ← 数据库建表脚本
```

---

## ❓ 常见问题

**Q: 演示模式数据会丢吗？**
A: 存在手机浏览器本地，清除浏览器数据会丢失。配置 Supabase 后永久保存。

**Q: 怎么让别人也能用？**
A: 把 GitHub Pages 网址发给任何人即可。打开就能注册使用。

**Q: iPhone 添加到主屏幕后没有通知？**
A: PWA 不支持 iOS 推送通知（苹果限制）。可通过网页内提示替代。
