# ContextRoller 示例

## 示例1: 基础会话捕获

```bash
# 在项目根目录初始化
ctxr init

# 捕获当前Claude Code会话
ctxr capture --name="用户认证模块重构"

# 查看保存的会话
ctxr list
```

## 示例2: 多任务切换场景

```bash
# 在任务A中工作
ctxr capture --name="任务A: 数据库设计"

# ... 切换到任务B ...

# 稍后回到任务A
ctxr list
ctxr show <任务A的ID>

# 恢复上下文继续工作
# (使用 MCP Server 工具恢复)
```

## 示例3: 使用 Context Compressor

```bash
# 当会话历史很长时，进行压缩
ctxr compress <session_id> --level=semantic

# 可选级别:
# - lossless: 无损压缩，合并重复消息
# - semantic: 语义压缩，保留关键消息
# - summary: 摘要模式，生成高层总结
```

## 示例4: 在代码中使用

```typescript
import { SessionStorage, ContextCompressor } from '@contextroller/core';

const storage = new SessionStorage('/path/to/project');
await storage.init();

// 保存会话
await storage.saveSession({
  id: 'my-session',
  name: '重要工作',
  source: 'claude-code',
  messages: [...],
  context_window: { ... },
  tags: ['urgent'],
  notes: '关键决策点记录'
});

// 压缩会话
const compressor = new ContextCompressor();
const compressed = compressor.compress(session, {
  level: 'semantic'
});

console.log(`节省 ${compressed.savings_percent}% token`);
```

## 示例5: MCP Server 集成

在 Claude Desktop 或其他支持 MCP 的客户端中配置:

```json
{
  "mcpServers": {
    "contextroller": {
      "command": "npx",
      "args": ["@contextroller/cli", "mcp-server"],
      "env": {
        "CTX_PROJECT_PATH": "/path/to/your/project"
      }
    }
  }
}
```

然后AI Agent就可以调用:
- `capture_session` - 保存当前会话
- `restore_session` - 恢复历史会话
- `list_sessions` - 查看所有会话
- `compress_session` - 压缩会话