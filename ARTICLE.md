# 我被Claude Code"失忆"折磨了3天后，写了一个工具拯救自己

> 如果你用 Claude Code、Cursor 或其他 AI 编码工具，你一定经历过这种绝望：切换标签页，整个会话没了。Prompt太长，应用崩溃。早期说的需求，AI早就忘得一干二净。
>
> **GitHub: [YaBoom/ContextRoller-zyt](https://github.com/YaBoom/ContextRoller-zyt)** ⭐ Star 支持一下！

---

## 我是怎么发现这个痛点的

这周我在做一个 AI 项目，连续用了 3 天 Claude Code。这期间我经历了：

**第一次崩溃**：我在一个复杂的功能上跟 Claude 聊了 2 小时，上下文已经建立得很完整——它知道我要做什么、代码结构是怎样的、之前踩过哪些坑。这时候我不小心点了一下浏览器的另一个标签页，回来时发现整个会话没了。没有警告，没有恢复按钮，2 小时的上下文灰飞烟灭。

**第二次崩溃**：我学聪明了，用终端版的 `claude` 命令。这次聊得更久，大概 4 小时，Prompt 累积得很大。突然报错：`"Prompt is too long"`，然后直接退出。没有自动压缩，没有优雅的降级，只有冷冰冰的错误。

**第三次崩溃**：我试着用 `CLAUDE.md` 文件来持久化一些规则。但问题是，这个项目越做越复杂，CLAUDE.md 越来越长，每次启动时 Claude 都要先读完这个文件，反而占用大量上下文窗口。而且，CLAUDE.md 只是静态的规则，没法保存动态的会话状态。

我受不了了。上 GitHub 搜了一圈，发现**我不是一个人**。

---

## 为什么现有方案不够用

在 anthropic/claude-code 仓库里，关于「会话丢失」「上下文失忆」的 Issue 有几十个：

- Issue #28511: "Session lost when switching between Code/Chat/Cowork tabs"
- Issue #21105: "Context truncation causes loss of conversation history"
- Issue #1110: "Prompt is too long without warning"

Stack Overflow 的 2025 开发者调查显示：**45% 的开发者表示调试 AI 生成的代码比预期更耗时**，其中很大一部分原因是「上下文丢失导致的重复沟通」。

我研究了一下现有的解决方案：

| 方案 | 问题 |
|------|------|
| **CLAUDE.md** | 静态文件，无法保存动态会话状态；太长会占用上下文 |
| **tmux/screen** | 只保持进程运行，不保存 AI 对话历史 |
| **Git** | 版本控制代码，不保存 AI 交互过程 |
| **手动复制粘贴** | 太累，容易遗漏 |

**没有一个工具能真正解决「AI 会话生命周期管理」这个问题。**

---

## 我是怎么设计解决方案的

我决定自己写一个工具，核心需求很明确：

1. **自动捕获**：能自动或手动保存完整会话（包括对话历史、文件状态、环境变量）
2. **智能压缩**：当接近上下文限制时，自动压缩历史，保留关键决策点
3. **快速恢复**：能在任意时刻恢复到任意会话的状态
4. **AI 友好**：最好能作为 MCP 工具被 AI Agent 自己调用

我把它命名为 **ContextRoller**（上下文滚轮），意思是让会话上下文像滚轮一样顺滑地流转。

### 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                    ContextRoller Core                        │
├─────────────────────────────────────────────────────────────┤
│  📝 Session Parser    │  Parse Claude/Cursor session files   │
│  🗜️ Compression       │  Token-aware context compression     │
│  💾 Storage           │  Local SQLite + optional cloud sync  │
│  🔌 MCP Server        │  Expose as MCP tool for any AI agent │
└─────────────────────────────────────────────────────────────┘
```

### 三个压缩级别

我设计了三种压缩策略，应对不同场景：

- **Lossless（无损）**: 只合并重复消息、清理空白，适合需要完整历史的场景
- **Semantic（语义）**: 保留代码块、错误信息、关键决策，压缩普通对话，我的默认推荐
- **Summary（摘要）**: 生成高层次总结，只保留最后几条消息，适合紧急救场

---

## 踩了什么坑

**坑 #1: Claude 的会话文件格式**

Claude Code 在 `~/.claude/` 目录下保存会话，但格式是 JSON Lines（每行一个 JSON 对象），而且字段名在不同版本有变化。我花了半天时间逆向工程，才搞明白怎么正确解析。

**坑 #2: Token 估算**

要智能压缩，必须先知道当前用了多少 token。但 Tiktoken（OpenAI 的 tokenizer）不支持异步加载，而且不同模型的 tokenizer 不一样。最后我用了简化算法：`token ≈ 字符数 / 4`，虽然不完美，但够用。

**坑 #3: MCP Server 的 stdio 模式**

MCP 协议用 stdio 传输数据，这意味着我的 Server 不能用普通的 `console.log` 调试，否则会污染 JSON 消息流。我改了三次日志方案才搞定。

**坑 #4: SQLite 在 Node.js 的兼容性**

`sqlite3` 包有原生依赖，在某些环境下编译会失败。我加了 `better-sqlite3` 作为 fallback，但打包体积又变大了。最后决定先用 `sqlite3`，让用户自己处理环境问题。

---

## 最终实现效果

### CLI 使用体验

```bash
# 在项目根目录初始化
$ ctxr init
✓ ContextRoller 初始化成功！

# 捕获当前 Claude Code 会话
$ ctxr capture --name="用户认证模块重构"
✓ 会话已保存: 用户认证模块重构
  ID: session_1741401600000_a1b2c
  Token使用: 12,345

# 查看所有会话
$ ctxr list
📋 保存的会话:

1. 用户认证模块重构 [claude-code]
   2026/3/8 10:00:00 · 12,345 tokens
   session_1741401600000_a1b2c

2. 数据库表设计 [manual]
   2026/3/7 18:30:00 · 8,900 tokens
   session_1741315200000_d4e5f

# 会话太大，压缩一下
$ ctxr compress session_1741401600000_a1b2c --level=semantic
✓ 压缩完成
  原始Token: 45,678
  压缩后Token: 18,234
  节省: 60.1%
```

### MCP Server 集成

配置好后，Claude 自己就能调用 ContextRoller：

```
用户: 我昨天做的那个功能，现在想继续优化

Claude: 让我先查看您的历史会话...
[调用 contextroller/list_sessions]

找到了几个相关会话：
1. "用户认证模块重构" (12,345 tokens)
2. "API 性能优化" (8,900 tokens)

您想恢复哪个？

用户: 第一个

Claude: [调用 contextroller/restore_session]
好的，我已经恢复了 "用户认证模块重构" 的上下文。
关键决策点：
- 使用 JWT + Refresh Token 方案
- 密码用 bcrypt 加密，salt rounds 设为 12
- 已实现 /login 和 /register 接口

我们可以继续了！
```

---

## 代码实现

核心代码在这里，感兴趣可以看看：

**GitHub: [YaBoom/ContextRoller-zyt](https://github.com/YaBoom/ContextRoller-zyt)** ⭐

几个关键模块：

```typescript
// 智能压缩器
export class ContextCompressor {
  compress(session: SessionSnapshot, options: CompressionOptions): CompressedContext {
    // 三种压缩策略...
  }
}

// 会话解析器（支持 Claude/Cursor）
export class SessionParser {
  async parseClaudeSession(): Promise<ParsedSessionFile | null> {
    // 解析 ~/.claude/ 下的会话文件
  }
}

// MCP Server
export class ContextRollerMCPServer {
  async handleToolCall(name: string, args: Record<string, unknown>): Promise<unknown> {
    // 暴露 capture_session, restore_session, compress_session 等工具
  }
}
```

项目结构：
```
ContextRoller-zyt/
├── src/
│   ├── core/
│   │   ├── types.ts      # 类型定义
│   │   ├── storage.ts    # SQLite 存储
│   │   ├── parser.ts     # 会话解析
│   │   └── compressor.ts # 智能压缩
│   ├── cli.ts            # 命令行界面
│   └── mcp/
│       └── server.ts     # MCP Server
├── tests/                # 测试套件
└── examples/             # 使用示例
```

---

## 还有哪些不足

这个项目还很早期，有很多地方需要完善：

1. **只支持 Claude Code**: Cursor、Copilot Chat 的格式还没适配
2. **压缩算法很初级**: 没用 LLM 生成摘要，只是基于规则的压缩
3. **没有团队同步**: 目前只是本地 SQLite，多人协作时无法共享上下文
4. **Token 估算不准**: 不同模型 tokenizer 不同，估算会有偏差
5. **缺少 GUI**: 纯 CLI，不够直观

如果你对这个方向感兴趣，欢迎来 [GitHub](https://github.com/YaBoom/ContextRoller-zyt) 提 Issue 或 PR！

---

## 为什么选这个方向

做这个工具，不只是为了解决我自己的问题。

2025-2026 是 AI Agent 爆发的一年，但开发者工具明显滞后。我们有了越来越强的 AI，却还在用「手动复制粘贴」的方式来管理上下文。

我觉得 **Context 管理** 会成为 AI 原生开发的核心基础设施之一，就像 Git 是代码协作的基础设施一样。

ContextRoller 是我的一个实验性尝试。如果你也有类似的痛点，或者对这个方向有想法，欢迎交流！

**GitHub: [YaBoom/ContextRoller-zyt](https://github.com/YaBoom/ContextRoller-zyt)** — 求 Star ⭐ 求 Fork 🍴

---

*写于 2026年3月8日*
*用时：6小时从 0 到 MVP*
*状态：能用，但还很粗糙*