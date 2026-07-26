# HELICASE

一个公开只读的个人数字展厅，以及一个只在本地运行的 Studio。它展示技术项目、作品、兴趣和持续成长；Obsidian/Git 是内容源，不把整个私人 Vault 上传。

## 日常工作流

```text
Obsidian / Quick Capture
  → Studio inbox
  → approve for public
  → npm run publish:captures
  → npm run verify
  → git push
  → Cloudflare Workers Builds
```

### 启动本地 Studio

终端 1：

```sh
npm run studio:api
```

终端 2：

```sh
npm run dev
```

访问 `http://localhost:4321/studio`。Quick Capture 写入本机 `.helicase/studio-state.json`，该文件已被 Git 忽略。Studio 中点击 `approve for public` 后运行：

```sh
npm run publish:captures
```

仅 `项目进展`、`学习记录` 和 `灵感` 可自动进入公开活动/灵感数据；图片和新文章必须人工检查后再发布，避免私密素材误公开。

### 项目、灵感与活动数据

- `src/data/projects.ts`：公开项目、状态、下一步、技术栈。
- `src/data/activities.ts`：网站自身真实活动，驱动 `/now` 热力图。
- `src/data/inspirations.ts`：公开灵感索引。
- `src/data/links.ts`：友链；只需添加 `name`、`note`、`url`。
- `src/data/integrations.json`：GitHub、LeetCode 的可选公开数据同步配置，默认关闭。

开启 GitHub 或 LeetCode 后执行：

```sh
npm run sync:activity
```

该命令只请求公开活动，不使用令牌；若第三方接口不可用，旧数据保持不变。LeetCode 并没有稳定的官方公开活动 API，因此它是可选的、可随时移除的视觉补充，网站热力图本身始终以你的真实网站/项目活动为核心。

### 写文章

```sh
npm run new:post -- tech "文章标题"
```

新文章默认是草稿。完成 `summary` 后把 `draft` 改为 `false`。本地 `/editor` 的快捷键：

- `Cmd/Ctrl + S`：保存浏览器草稿。
- `Cmd/Ctrl + Enter`：校验并导出 Markdown。
- `Cmd/Ctrl + B/I/K`：粗体、斜体、链接。

浏览器草稿仅是临时保护，不是发布内容或版本备份。

#### 安全发布清单

1. 文章必须放入 `src/content/blog/<tech|daily|reviews>/`；浏览器 Editor 的导出文件不会自动上线。
2. 写作期间保持 `draft: true`。草稿不会进入首页、归档、详情、搜索、RSS 或 sitemap。
3. 完成标题、摘要、标签和正文后，将 `draft` 改为 `false`。
4. 运行 `npm run verify`。公开文章的摘要仍为 `TODO` 时验证会失败。
5. 打开 `/blog` 搜索文章标题或正文词，确认分类、详情页和前后篇导航正确。
6. 提交并推送后由 Cloudflare Workers Builds 构建；不要上传整个 Obsidian Vault、`.helicase/`、`.env` 或密钥。

完整开发与安全边界见 [`DEVELOPMENT-CONTRACT.md`](./DEVELOPMENT-CONTRACT.md)。

## 验证与部署

```sh
npm run verify
```

Cloudflare Workers Builds：

- Production branch：`main`
- Build command：`npm run verify`
- Deploy command：`npx wrangler deploy`
- Root directory：`/`
- Build variable：`NODE_VERSION=22.12.0`
- Build variable：`SITE_URL=https://<最终 workers.dev 或自定义域名>`
- 强制 HTTPS：开启
- `/studio`、`/editor`：Cloudflare Zero Trust Access 限制为站长邮箱

如果当前 Cloudflare Zero Trust 需要绑定银行卡，可暂时使用 Worker Basic Auth：在 Worker **Settings → Variables and Secrets** 中新增 `STUDIO_USERNAME`、`STUDIO_PASSWORD` 两个 Secret。Worker 会保护 `/studio*` 与 `/editor*`；真实密码不要提交到 Git，也不要复用在其他服务。

`/editor` 的 `publish →` 需要另外配置 GitHub Secrets：`GITHUB_CONTENT_TOKEN`（仅目标仓库 Contents 读写权限）、`GITHUB_OWNER=HelicasECoode42`、`GITHUB_REPO=helicase-blog`。配置后，发布按钮会将 Markdown 写入 `src/content/blog/<category>/`，再由 GitHub/Cloudflare 自动构建；未配置时只使用 `export ↓` 下载文件。

`wrangler.toml` 使用 Worker + Static Assets：只有 `/api/*` 进入 `worker/index.ts`，其他路由直接读取 `dist`。`public/_headers` 已包含 CSP、HSTS、点击劫持防护、MIME 嗅探防护、Referrer Policy 与 Permissions Policy。不要提交 `.env`、`.dev.vars`、模型 API Key、Obsidian Vault 或 `.helicase/studio-state.json`。

OC 对话已经由 `/api/oc-chat` Worker 代理，并限制方法、请求体、消息数量、单条长度、总长度与上游超时。上线前仍应加入 Turnstile、限流和预算保护；完成这些保护前不要配置生产 `DEEPSEEK_API_KEY`。

完整 Worker 打包检查：

```sh
npm run check:worker
```

本地运行真实 Worker 路由（不同于只提供静态页面的 `npm run dev`）：

```sh
npm run dev:worker
```

## 数据边界与维护

- Markdown 文章和 `src/data/` 是公开站点的构建期数据；修改后必须重新构建和部署。
- Editor 草稿、收藏、情绪板、Zine、播放器和 OS 布局使用 `localStorage`，只存在当前浏览器，不会跨设备同步、自动备份或自动公开。清理站点数据会丢失这些内容。
- Studio 使用本机 `127.0.0.1:4317` API 和 `.helicase/studio-state.json`；捕获内容只有在批准并运行相应发布脚本后才可能进入公开数据。
- `publish:profile` 会拒绝超长字段、不安全协议和异常结构；社交链接必须是 HTTPS，头像必须是 HTTPS 或 `/images/...` 站内路径。
- 每次发布前运行 `npm run check:worker`。定期运行 `npm audit`；当前低危告警属于开发工具依赖，破坏性升级应在单独迁移分支处理。
- 音乐页及其播放器已移除；兴趣区目前聚焦收藏、Zine 与 Moodboard。
- Cloudflare Workers、Zero Trust、域名、DNS 和 Secrets 属于外部账号配置；本地代码无法证明它们已经正确启用，上线前需在 Cloudflare 控制台单独核验。

### 环境变量

- `.env`：本地 Node 脚本设置；`HELICASE_STUDIO_PORT` 默认 `4177`。本地指定 canonical 时使用 `SITE_URL=https://... npm run verify`；Cloudflare Builds 直接注入 `SITE_URL`。
- `.dev.vars`：本地 Worker 密钥；当前只有 OC 联网对话使用的 `DEEPSEEK_API_KEY`。
- 两个真实文件都已被 Git 忽略。可提交模板是 `.env.example` 和 `.dev.vars.example`。
- Cloudflare 线上环境不要上传 `.dev.vars`；在 Worker 的 **Settings → Variables and Secrets** 中新增同名 Secret。
- `GITHUB_TOKEN`、D1、Vectorize 和 Workers AI 绑定要等发布/embedding 后端实现后再配置；当前代码不会读取它们。
