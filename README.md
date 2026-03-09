# ContextRoller

> 🔄 永不丢失的AI会话上下文管理器

## 痛点

使用Claude Code、Cursor等AI编码工具时，你是否遇到过：
- 切换标签页 → 整个会话消失 💥
- Prompt太长 → 应用崩溃 🤯
- 早期指令 → 被AI遗忘 😵‍💫
- 多任务切换 → 上下文混乱 🌀

**ContextRoller** 解决这一切。

## 核心功能

### 🎯 Session Snapshot（会话快照）
自动捕获完整会话状态：对话历史、文件修改、运行中的命令、环境变量

### 🗜️ Smart Compression（智能压缩）
当接近上下文限制时，自动压缩历史记录，保留关键决策点

### 🏷️ Context Tags（上下文标签）
为不同任务创建可恢复的标签：
```bash
ctxr tag "重构用户模块" --scope="src/user/**"
ctxr restore "重构用户模块"
```

### 📊 Context Dashboard（上下文看板）
可视化展示当前会话健康度：token使用量、关键决策点、可恢复标签

## 快速开始

```bash
# 安装
npm install -g @contextroller/cli

# 在AI项目根目录初始化
ctxr init

# 自动捕获当前Claude Code会话
ctxr capture --name="初始架构设计"

# 查看所有保存的快照
ctxr list

# 恢复到指定快照（包括完整上下文）
ctxr restore "初始架构设计"
```

## 技术架构

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

## 为什么与众不同？

| 工具 | 解决的问题 | ContextRoller |
|------|-----------|---------------|
| CLAUDE.md | 手动维护项目规则 | 自动捕获完整会话 |
| Git | 代码版本控制 | AI对话+代码双重版本 |
| tmux/screen | 终端会话保持 | 上下文感知恢复 |

## 本地构建指南

由于 `@contextroller/cli` 尚未发布到 npm 仓库，需要从源码构建：

```bash
# 克隆项目后，在项目根目录执行
npm install           # 安装依赖
npm run build         # 构建项目
npm link              # 全局链接，使 ctxr 命令可用
ctxr --version        # 验证安装成功
```

## 构建问题修复记录

以下是本地构建时遇到的问题及详细修复方案：

### 1. `src/core/parser.ts` - 导入路径错误

**问题**：第15-16行错误的导入语句
```typescript
// 错误代码
import { join, homedir } from 'os';
import { join as pathJoin } from 'path';
```

**原因**：`join` 不是 `os` 模块的导出，`homedir` 才是 `os` 模块的函数

**修复**：
```typescript
// 正确代码
import { homedir } from 'os';
import { join as pathJoin } from 'path';
```

---

### 2. `src/core/storage.ts` - sql.js API 同步调用问题

**问题**：第70行和第266行对同步方法使用了 `await`

```typescript
// 错误代码（第70行）
await this.db.exec(`CREATE TABLE IF NOT EXISTS ...`);

// 错误代码（第266行）
await this.db.close();
```

**原因**：sql.js 库的 `exec()` 和 `close()` 方法是同步的，不支持 Promise

**修复**：
```typescript
// 正确代码（第70行）
this.db.exec(`CREATE TABLE IF NOT EXISTS ...`);

// 正确代码（第266行）
this.db.close();
```

---

### 3. `src/core/storage.ts` - SQL 参数绑定缺失

**问题**：`execQuery` 方法中 `prepare()` 后未绑定参数

```typescript
// 错误代码
private async execQuery(sql: string, params: any[] = []): Promise<any[]> {
  const stmt = this.db.prepare(sql);
  // params 未被使用！
  while (stmt.step()) { ... }
}
```

**原因**：sql.js 的 `prepare()` 只编译 SQL，需要调用 `bind()` 绑定参数

**修复**：
```typescript
// 正确代码
private async execQuery(sql: string, params: any[] = []): Promise<any[]> {
  const stmt = this.db.prepare(sql);
  if (params.length > 0) {
    stmt.bind(params);  // 添加参数绑定
  }
  while (stmt.step()) { ... }
}
```

---

### 4. `src/core/types.ts` - 类型定义不完整

**问题**：`Message.metadata` 接口缺少动态属性支持

```typescript
// 错误代码
metadata?: {
  tool_calls?: unknown[];
  tokens?: number;
  files_modified?: string[];
};
```

**原因**：`compressor.ts` 中使用了 `merged_count` 属性，但类型定义中不存在

**修复**：
```typescript
// 正确代码
metadata?: {
  tool_calls?: unknown[];
  tokens?: number;
  files_modified?: string[];
  merged_count?: number;      // 新增
  [key: string]: unknown;     // 支持动态属性
};
```

同时修复 `SessionSnapshot.source` 类型：
```typescript
// 原来（过于严格）
source: 'claude-code' | 'cursor' | 'aider' | 'manual';

// 修复后（兼容 AITool 枚举）
source: string;
```

---

### 5. `src/mcp/server.ts` - 导入路径错误

**问题**：MCP Server 位于 `src/mcp/` 目录，但导入路径错误

```typescript
// 错误代码
import { SessionStorage } from './core/storage.js';
import { SessionParser } from './core/parser.js';
import { ContextCompressor } from './core/compressor.js';
import { SessionSnapshot, CompressedContext, ContextTag } from './core/types.js';
```

**原因**：MCP Server 在 `src/mcp/` 子目录，应使用 `../core/` 相对路径

**修复**：
```typescript
// 正确代码
import { SessionStorage } from '../core/storage.js';
import { SessionParser } from '../core/parser.js';
import { ContextCompressor } from '../core/compressor.js';
import { SessionSnapshot, CompressedContext, ContextTag } from '../core/types.js';
```

---

### 6. `src/mcp/server.ts` - 隐式 any 类型错误

**问题**：TypeScript 严格模式下，回调参数缺少类型注解

```typescript
// 错误代码
sessions.map(s => ({ ... }))           // 第224行
session.messages.slice(-5).map(m => ({ ... }))  // 第273行
sessions.map(s => ({ ... }))           // 第334行
```

**修复**：
```typescript
// 正确代码
sessions.map((s: SessionSnapshot) => ({ ... }))
session.messages.slice(-5).map((m: { role: string; content: string }) => ({ ... }))
sessions.map((s: SessionSnapshot) => ({ ... }))
```

---

### 7. `src/cli.ts` - 缺少 restore 命令

**问题**：README 文档中提到 `ctxr restore` 命令，但 CLI 中未实现

**修复**：在 `src/cli.ts` 中添加完整的 `restore` 命令实现（约50行代码）

```typescript
// 新增代码
program
  .command('restore <name>')
  .description('恢复指定会话的上下文')
  .action(async (name) => {
    // ... 完整实现
  });
```

---

## 修复后的完整构建流程

```bash
# 1. 清理并重新构建
npm run build

# 2. 全局链接
npm link

# 3. 验证命令可用
ctxr --version  # 输出: 0.1.0

# 4. 初始化并测试
ctxr init
ctxr capture --name="测试会话"
ctxr list
ctxr restore "测试会话"
```

## 实验性功能 ⚗️

- [ ] MCP Server模式：让任何AI Agent都能调用ContextRoller
- [ ] Context Diff：对比两个会话的上下文差异
- [ ] Team Sync：团队共享会话上下文

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=YaBoom/ContextRoller-zyt&type=Date)](https://star-history.com/#YaBoom/ContextRoller-zyt&Date)

---

**License**: MIT  
**Author**: [@YaBoom](https://github.com/YaBoom)
