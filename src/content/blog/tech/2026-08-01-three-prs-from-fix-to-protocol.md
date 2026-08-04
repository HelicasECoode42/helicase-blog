---
title: "第一次开源PR虽然无人鸟的技术博客"
date: 2026-08-01
category: tech
tags: [开源, Agent-Memory, OpenClaw, Context-Engineering, RAG, Prompt-Cache]
summary: "记录三个 PR 让我重新理解记忆、状态和缓存边界的过程。"
draft: false
---

最近因为犀牛鸟向 TencentDB-Agent-Memory 提交了三个 PR。虽然它们现在都还是 Open 状态，不过选择一个项目丢了三个issue的神秘解法也想水一篇blog故更新。主要由codex撰写语气会ai味比较重

## TencentDB Agent Memory 是什么

[TencentDB Agent Memory](https://github.com/TencentCloud/TencentDB-Agent-Memory) 是一套面向 AI Agent 的记忆系统。目前可以作为 OpenClaw 插件运行，也通过 Gateway 和 HostAdapter 接入 Hermes；存储既可以使用本地 `SQLite + sqlite-vec`，也可以接腾讯云向量数据库。最近出了2.0版本并且和datawhale有合作总之看起来很牛逼。

我目前把它理解成在解决两种不同尺度的问题：

- **单次长任务的信息过载**：搜索结果、工具输出、代码和报错会迅速填满上下文。
- **跨会话的经验丢失**：用户偏好、项目背景、工作流程和历史事实，在新会话里又要从头解释。

很多记忆系统的直接做法，是把历史切片、向量化，再把 Top-K 全部塞回 Prompt。这个方案简单，但会逐渐暴露三个问题：低层事实与高层偏好混在一起；摘要压缩后难以回到原始证据；召回内容越多，上下文成本和噪声越高。

这个项目认为**记忆应该是一套可以逐层抽象、逐层下钻的结构。**这点其实和我很早以前做过的 LifeBook，以及玩 Elys 时对记忆的想象有点像。只不过这次我是在一个真实代码库里，第一次看到它被拆成了检索、抽象、存储和回溯几条可以验证的链路。


## 它的设计思路

长期记忆采用一座语义金字塔：

```text
L3 Persona       用户的长期画像、偏好与行为模式
      ↑
L2 Scenario      按工作或生活场景组织的记忆块
      ↑
L1 Atom          从对话中提取出的事实、偏好和事件
      ↑
L0 Conversation  原始对话与证据
```

<figure>
  <img src="/images/blog/tencentdb/memory-architecture.svg" alt="TencentDB Agent Memory 分层记忆与检索架构图" />
  <figcaption>我对长期记忆链路的简化理解：高层负责结构，低层保留证据，召回时再按需下钻。</figcaption>
</figure>

日常对话时，Persona 和 Scenario 提供稳定的宏观背景；当前问题需要具体证据时，再通过关键词与向量混合检索召回 L1 Atom，必要时继续回到 L0 原文。系统使用 BM25、向量检索和 RRF 融合兼顾字面命中与语义相似度。

这套设计可以概括为“低层保留证据，高层保留结构”。L0/L1 更适合数据库、JSONL 和检索索引，L2/L3 则保留为人可以直接阅读和修改的 Markdown。
短期记忆走的是另一条链路：完整工具结果被卸载到 `refs/*.md`，中间步骤写入 JSONL，当前上下文只保留带 `node_id` 的 Mermaid 任务画布。当 Agent 需要核对细节时，再沿节点引用下钻到原始输出。它更接近 **Context Offloading**，目标不是让模型遗忘，而是让高成本信息暂时退出注意力中心。

```text
OpenClaw / Hermes
       ↓ HostAdapter
    TDAI Core
       ├─ Capture：保存 L0
       ├─ Extract：生成 L1
       ├─ Organize：归纳 L2 / L3
       ├─ Retrieve：BM25 + Vector + RRF
       └─ Recall：把稳定背景与动态事实送回下一轮 Prompt
```

这里还有一个我在读代码时很在意的工程边界：记忆算法放在宿主无关的 TDAI Core 中，OpenClaw 和 Hermes 只负责把各自的 session、LLM、日志和生命周期翻译成统一接口。#666 之所以困难，正是因为算法可以宿主无关，但 Prompt 的真实字节顺序和 compaction 时机仍然属于宿主契约。

## 它对应哪些技术方向

| 方向 | 项目中的具体问题 | 关键词 |
|---|---|---|
| Agent 长期记忆 | 如何跨会话保留事实、场景与用户画像 | Agent Memory、Long-term Memory、Personalization、Persona |
| 检索增强 | 如何同时找到字面事实和语义相关内容 | RAG、BM25、Vector Search、Hybrid Retrieval、RRF、FTS5 |
| 上下文工程 | 如何控制长任务中的 Token、前缀和历史增长 | Context Engineering、Context Offloading、Prompt Cache、Compaction、Token Budget |
| 记忆抽象与溯源 | 如何压缩信息，同时保留回到原文的路径 | Hierarchical Memory、Progressive Disclosure、Provenance、Reversible Abstraction |
| Agent 基础设施 | 如何让同一套记忆算法适配不同 Agent 宿主 | OpenClaw、Hermes、Plugin Lifecycle、HostAdapter、Session State |
| 可靠性工程 | 如何让异步 pipeline、清理和恢复保持一致 | Checkpoint、Source of Truth、Concurrency、Idempotency、Observability |

如果从研究方向看，它处在 **Agent Memory、RAG、Context Engineering 和 Personalization** 的交叉处；如果从工程方向看，它又包含检索系统、状态机、缓存协议、数据一致性和插件适配。三个 PR 分别落在这张地图的不同位置。

## 三个issue

<figure>
  <img src="/images/blog/tencentdb/three-pr-boundaries.svg" alt="三个 TencentDB Agent Memory PR 对应的工程边界" />
  <figcaption>三个 PR 表面上分属安全、状态和缓存，最后都落到了“边界到底由谁定义”这个问题上。</figcaption>
</figure>

| PR | 问题 | 真正要回答的事 |
|---|---|---|
| [#580](https://github.com/TencentCloud/TencentDB-Agent-Memory/pull/580) | FTS5 查询语义可被用户输入改变 | 参数绑定安全，是否等于查询语言安全？ |
| [#594](https://github.com/TencentCloud/TencentDB-Agent-Memory/pull/594) | Checkpoint 计数在清理后漂移 | JSONL、Store 和计数器，谁才是事实源？ |
| [#666](https://github.com/TencentCloud/TencentDB-Agent-Memory/pull/666) | OpenAI-compatible provider 缓存命中率下降 | 怎样同时维持前缀稳定、召回新鲜和上下文有界？ |

回头看，三个问题最值得记录的都不是最终写了多少代码，而是几次推翻“看起来已经能用”的方案。

## 第一层：参数化查询并不自动保证查询语义

[Issue #160](https://github.com/TencentCloud/TencentDB-Agent-Memory/issues/160) 最初看起来只需要几行代码：先删掉 `AND`、`OR`、`NOT`、`NEAR`，再把 token 用 `OR` 拼起来。

但 SQLite FTS5 的 `MATCH ?` 虽然避免了 SQL 注入，绑定进去的字符串仍然会被 FTS5 当成一门查询语言解释。也就是说，这里存在两层语法：外层是 SQL，内层是 FTS5。保护了外层，不代表用户不能改变内层表达式。

直接删除操作符也不完全正确。用户可能真的想搜索单词 “AND”；更复杂的 tokenizer 还可能产生引号、括号、列过滤或 `NEAR` 结构。最终方案不是不断扩充黑名单，而是把每个 tokenizer 输出编码成 FTS5 quoted phrase，让用户输入只能成为字面量，查询结构只由代码生成。

这个 PR 给我的第一个提醒是：安全不是“有没有参数化”这种布尔值，而是要沿着完整解释链追踪数据。只要字符串还会进入下一层 parser，就还没有走完。

## 第二层：计数器修复，本质上是事实源选择

[Issue #157](https://github.com/TencentCloud/TencentDB-Agent-Memory/issues/157) 被标为 good first issue：Checkpoint 中的计数只增不减，Cleaner 删除数据后它不会自动回落。

最自然的修复，是清理结束后重新数一遍。但很快会遇到两个问题。

第一，数谁？JSONL 是 append-only 的恢复日志，更新或合并后的旧记录仍可能留在里面；Vector Store 表示当前可检索的活动集合。如果 `total_memories_extracted` 要服务状态展示和后续 pipeline 判断，那么当前 Store 才应该是权威源。

第二，什么时候数？只在 Cleaner 确实删到数据时校准，会漏掉手工操作或历史漂移；只在启动时校准，又无法覆盖长时间运行。更隐蔽的是，Cleaner 写绝对值的同时，L1 pipeline 可能还在执行 `+= 1`。两个操作即使各自正确，交错后仍可能 double count。

最后的做法是让 Store 健康时的启动、L1 完成和每次 Cleaner 运行都写入 Store 的绝对计数，并复用已有的 Checkpoint 文件锁作为一致性边界。Store 降级时才保留原来的增量路径。

这里没有再造一把跨模块大锁，也没有增加一层只转发两行代码的 helper。关键不是多写保护，而是让所有健康路径共享同一个权威语义。

## 第三层：缓存不是一个 Map，而是一份跨轮协议

[Issue #120](https://github.com/TencentCloud/TencentDB-Agent-Memory/issues/120) 是三个问题里最难的一个。

DeepSeek 和 MiMo 的 OpenAI-compatible 接口使用 prefix matching：新请求与旧请求拥有相同前缀时，provider 才能复用已经处理过的 token。插件原本每轮把动态召回写到用户消息前面；当这些内容进入历史，下一轮重放出来的旧消息与上一轮真实发送的字节并不一致。与此同时，稳定的 Persona 和 Scene 又位于 OpenClaw 的 `CACHE_BOUNDARY` 之后，同样不能稳定参与缓存。

一开始我们做了 Stable Snapshot：Persona 和 Scene 在一个 Epoch 内只构建一次。它让本地上下文构建快了大约 8.5 倍，但这只能证明少读了磁盘、少做了序列化，不能证明 provider 的 `cached_tokens`、TTFT 或费用改善了 8.5 倍。

更关键的问题是，单纯把动态召回移到消息尾部也不够。只要本轮模型看到的 user message 和下一轮历史重放的 user message 不是逐字一致，前缀仍会在那里断开。

最终实现把问题拆成两个不同的 Epoch：

1. **Stable Cache Epoch** 管理系统前缀。Persona 或 Scene 没有显式发布变化时，系统字节保持稳定；变化后，活跃 session 在下一轮切换 Snapshot，接受一次有意的缓存失效。
2. **Memory Epoch Ledger** 管理动态召回。记忆正文按内容 ID 只注册一次，后续主题变化只追加 Focus ID；本轮发送给 provider 的事件会以相同字节写回 transcript。

Registry 和 Focus 必须分开。A → B → A 的对话中，第二次回到 A 只需要重新 focus A，而不是再写一遍 A 的全文。

```text
system
├─ Stable Snapshot（Cache Epoch 内稳定）
├─ OpenClaw base system prompt
├─ CACHE_BOUNDARY
└─ dynamic system suffix

messages
├─ user 1: register A,B + focus A,B + 原始问题
├─ assistant 1
├─ user 2: focus C + 原始问题
├─ assistant 2
└─ user 3: focus A + 原始问题
```

<figure>
  <img src="/images/blog/tencentdb/cache-epoch-ledger.svg" alt="Prompt Cache 的 Stable Snapshot 与 Memory Epoch Ledger 架构图" />
  <figcaption>#120 的关键不是简单地把内容挪到消息末尾，而是分别管理稳定前缀和动态记忆事件。</figcaption>
</figure>

只追加的 Ledger 又带来上下文增长问题，所以它有 token budget：下一条事件将越界时先写 sealed 事件，此后召回只在当前轮临时注入，不再进入历史；等 OpenClaw 发出 `after_compaction`，再用当前工作集建立新 Epoch。

这不是免费的。封口后到 compaction 之前，动态尾部会牺牲一部分跨轮缓存连续性。换来的则是 transcript 不会无限增长。这里没有“所有目标同时最大化”的完美答案，只有明确写出来的工程取舍。

## 为什么最后一定要跑真实 provider

本地字符串 hash、状态机测试和微基准都很有用，但它们不能代替真实链路。

我们后来分别对 DeepSeek 和 `mimo-v2.5-pro` 做了 A/B。MiMo 的测试使用四个独立 session、每种模式两组、每组六轮，并交错执行 epoch 与 append，尽量降低时间顺序偏差。样本不是只改末尾一个字符，而是不同的自然语言背景和问题。

最终 MiMo 的稳态加权缓存命中率从 64.53% 提高到 84.43%，每轮重复动态注入从约 3449 字符降到 23 字符。DeepSeek 样本中，未缓存输入也显著减少。

但端到端延迟仍然很吵。有一轮请求即使接近全量缓存命中，也因为 provider 排队或网络波动耗时 23 秒。因此文章里可以说“缓存命中率改善”，不能把它包装成固定的 TTFT 或总时长加速。

另一个必须核对的是宿主契约。字段名叫 `prependSystemContext`，不代表它一定出现在缓存边界前。最后实际检查了官方 `openclaw@2026.5.28` 发布包中的 hook 类型和 prompt composer，确认它的真实位置，并把最低兼容版本明确提高到 2026.5.28。比起为未知旧版本增加静默兼容分支，我更愿意让契约清楚地失败。


这几次修改也让我更明确地看到，未经约束的 AI 很容易写出三类诡异代码。

第一类是过量防御性编程。业务上不可能为空的对象也层层判空，真正的不变量反而被藏起来。需要保护的是进程边界、网络、磁盘和外部输入，不是给每一行都加保险。

第二类是薄封装。一个函数只有一两条语句，既不建立新语义，也不隔离变化，只是让调用链更长。#594 最后就删除了这种只做一次转发的 reconciliation helper。

第三类是无条件前向兼容。尤其处理历史数据或宿主 API 时，AI 倾向于保留旧格式、猜测新格式、再加 fallback。结果是错误被静默吞掉，系统表面可运行，却没人知道走的是哪条路径。#666 删除了从旧 Prompt 文本反向解析召回内容的分支，改为只接受结构化数据，并明确最低 OpenClaw 版本。


#580 的核心是解释边界，#594 的核心是状态权威，#666 的核心是跨轮协议。难度不同，但解法有一个共同点：先定义语义，再决定代码。

什么叫“字面量”？什么叫“当前记忆数量”？什么叫“同一个缓存前缀”？如果这些词没有被写成可验证的定义，测试再多也可能只是在证明错误实现内部自洽。
