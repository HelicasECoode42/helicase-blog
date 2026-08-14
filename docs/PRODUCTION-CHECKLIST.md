# HELICASE 生产发布清单

生产发布是独立操作。任何一项失败都停止，不继续迁移或部署。

## 1. 发布前代码证据

```sh
npm run verify
npm run check:worker
npm audit --omit=dev
git diff --check
```

要求：Astro `0 errors / 0 warnings / 0 hints`，Worker dry-run 与隔离 smoke 通过，生产依赖 0 vulnerabilities。

## 2. Git 状态

1. 审核并提交全部预期改动；
2. 确认没有把 `.helicase/`、`.env`、`.dev.vars` 或令牌加入 Git；
3. 推送 `main`；
4. 确认本地 `HEAD` 等于 `origin/main`。

`npm run deploy` 会再次强制检查以上状态，不接受脏工作树或未推送提交。

## 3. Cloudflare 配置

先配置 README 列出的全部 Secrets、Worker Variables 和构建 Variables。GitHub OAuth callback 必须是：

```text
https://helicase.xin/api/auth/github/callback
```

应用远端 D1 migration：

```sh
npx wrangler d1 migrations apply helicase-blog-data --remote
```

先查看待执行 migration：

```sh
npx wrangler d1 migrations list helicase-blog-data --remote
```

确认包含 `0002_github_comments.sql` 和 `0003_site_setting_revisions.sql`，再执行 apply。

## 4. 部署

只选择一种路径：

- 推荐：推送 `main`，等待 Cloudflare Git Build；
- 手动：运行 `npm run deploy`，它会重新构建、核对 HEAD 与 build-meta 后部署。

不得在提交后直接运行裸 `wrangler deploy`，也不得混用旧 `dist`。

## 5. 自动线上 smoke

```sh
npm run smoke:site -- https://helicase.xin
```

它检查首页/Now 一致、build-meta commit 与内容 hash、Studio/Editor Basic Auth 和公开 D1 API。

## 6. 浏览器人工 smoke

在 1280、768、390 三档检查：

- 首页、`/now`、`/projects`、`/links` 无横向溢出和控制台错误；
- `/studio` 未登录返回 Basic Auth，登录后可读取三类设置；
- 两个窗口读取同一 revision，窗口 A 保存后，窗口 B 保存必须得到冲突且不丢输入；
- Save Draft 后公开站不变；刷新 Studio 后 revision 和上次发布状态仍存在；
- Publish 后出现 commit，部署前为 Waiting；部署后刷新仍为 Live；
- 填写新私有草稿后显示“公开站不变”，上次发布坐标仍保留；
- GitHub 登录、文章评论、Favorites/Mood/Zine 和 OC 各执行一次最小成功路径。

记录部署 commit、migration 输出、smoke 结果和异常；全部通过才宣布上线。
