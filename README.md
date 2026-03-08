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

## 实验性功能 ⚗️

- [ ] MCP Server模式：让任何AI Agent都能调用ContextRoller
- [ ] Context Diff：对比两个会话的上下文差异
- [ ] Team Sync：团队共享会话上下文

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=YaBoom/ContextRoller-zyt&type=Date)](https://star-history.com/#YaBoom/ContextRoller-zyt&Date)

---

**License**: MIT  
**Author**: [@YaBoom](https://github.com/YaBoom)
