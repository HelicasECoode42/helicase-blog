---
title: "静态画布的机械美学"
date: 2026-05-20
category: tech
tags: [astro, css, design-system]
summary: "用 Astro MPA + View Transitions 构建一张无边线索画布的技术笔记。"
---

## 为什么不是 SPA

这个网站看起来像一张无限画布，但底层是标准的 MPA（多页面应用）。每个模块——文章、CD、Zine——都是独立的 Astro 页面。

选择 MPA 的原因：

1. **URL 即真理**。每篇文章有独立 URL，可分享、可索引。
2. **首屏零 JS**。画布首页的所有布局都是纯 CSS Grid。CORE 的 ASCII 动效是唯一的客户端脚本。
3. **后退按钮**。浏览器原生导航，不需要自己实现路由栈。

## View Transitions 的幻觉

Astro 的 View Transitions API 让页面跳转看起来像在画布上游走。标题文字从一个位置飞行到另一个位置——用户感觉自己没有离开画布，但 URL 已经变了。

```css
::view-transition-old(article-title) {
  animation: 300ms cubic-bezier(0.2, 0, 0.8, 1) both fade-out;
}
```

关键是 `transition:name` 和 `transition:persist` 的配合。标题元素共享同一个名称，浏览器自动计算两个位置之间的 morph 动画。
