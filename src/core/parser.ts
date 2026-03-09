/**
 * SessionParser - 会话解析器
 * 
 * 从各种AI工具中解析会话数据
 * 
 * 当前支持：
 * - Claude Code: 读取 ~/.claude/ 下的会话文件
 * 
 * TODO:
 * - [ ] 支持 Cursor 的 SQLite 数据库格式
 * - [ ] 支持 Aider 的聊天记录格式
 * - [ ] 支持从环境变量检测当前运行工具
 */

import { readFile, readdir, stat } from 'fs/promises';
import { homedir } from 'os';
import { join as pathJoin } from 'path';
import { 
  AITool, 
  ParsedSessionFile, 
  Message, 
  MessageRole,
  SessionSnapshot 
} from './types.js';

export class SessionParser {
  /**
   * 检测当前环境运行的AI工具
   */
  detectTool(): AITool | null {
    // 检查环境变量
    if (process.env.CLAUDE_CODE_VERSION) return AITool.CLAUDE_CODE;
    if (process.env.CURSOR_VERSION) return AITool.CURSOR;
    if (process.env.AIDER_VERSION) return AITool.AIDER;

    // 检查进程树（简化处理）
    if (process.argv.some(arg => arg.includes('claude'))) {
      return AITool.CLAUDE_CODE;
    }

    return null;
  }

  /**
   * 解析Claude Code的会话
   * 
   * Claude Code 在 ~/.claude/ 目录下存储会话文件
   * 格式为 JSON Lines (JSONL)
   */
  async parseClaudeSession(sessionId?: string): Promise<ParsedSessionFile | null> {
    try {
      const claudeDir = pathJoin(homedir(), '.claude');
      
      // 如果没有指定sessionId，获取最新的会话
      if (!sessionId) {
        const sessions = await this.listClaudeSessions();
        if (sessions.length === 0) return null;
        sessionId = sessions[0];
      }

      const sessionPath = pathJoin(claudeDir, sessionId);
      
      // 检查文件是否存在
      try {
        await stat(sessionPath);
      } catch {
        return null;
      }

      const content = await readFile(sessionPath, 'utf-8');
      return this.parseClaudeContent(content);
    } catch (error) {
      console.error('Failed to parse Claude session:', error);
      return null;
    }
  }

  /**
   * 列出所有Claude会话
   */
  async listClaudeSessions(): Promise<string[]> {
    try {
      const claudeDir = pathJoin(homedir(), '.claude');
      const entries = await readdir(claudeDir);
      
      // 过滤出会话文件（通常是UUID格式）
      const sessions: string[] = [];
      
      for (const entry of entries) {
        const entryPath = pathJoin(claudeDir, entry);
        const stats = await stat(entryPath);
        
        if (stats.isFile() && this.isValidSessionFile(entry)) {
          sessions.push(entry);
        }
      }

      // 按修改时间排序（最新的在前）
      const sorted = await Promise.all(
        sessions.map(async (s) => {
          const stats = await stat(pathJoin(claudeDir, s));
          return { name: s, mtime: stats.mtime.getTime() };
        })
      );
      
      return sorted
        .sort((a, b) => b.mtime - a.mtime)
        .map(s => s.name);
    } catch {
      return [];
    }
  }

  /**
   * 解析Claude内容
   */
  private parseClaudeContent(content: string): ParsedSessionFile {
    const messages: Message[] = [];
    const lines = content.split('\n').filter(line => line.trim());
    
    let currentWorkingDir = process.cwd();

    for (let i = 0; i < lines.length; i++) {
      try {
        const line = lines[i];
        if (!line.trim()) continue;

        const event = JSON.parse(line);
        
        // 提取工作目录
        if (event.type === 'cwd') {
          currentWorkingDir = event.value || currentWorkingDir;
          continue;
        }

        // 提取消息
        if (event.type === 'user' || event.type === 'assistant') {
          const message: Message = {
            id: `msg_${i}`,
            role: event.type as MessageRole,
            content: this.extractContent(event),
            timestamp: event.timestamp || Date.now(),
            metadata: {
              tool_calls: event.tool_use || event.tool_calls,
              files_modified: this.extractModifiedFiles(event)
            }
          };
          messages.push(message);
        }
      } catch (e) {
        // 跳过无法解析的行
        continue;
      }
    }

    return {
      tool: AITool.CLAUDE_CODE,
      messages,
      working_directory: currentWorkingDir,
      timestamp: Date.now()
    };
  }

  /**
   * 从事件中提取内容
   */
  private extractContent(event: unknown): string {
    if (!event || typeof event !== 'object') return '';
    
    const e = event as Record<string, unknown>;
    
    // 尝试各种可能的字段
    if (typeof e.content === 'string') return e.content;
    if (typeof e.message === 'string') return e.message;
    if (typeof e.text === 'string') return e.text;
    if (Array.isArray(e.content)) {
      return e.content.map(c => {
        if (typeof c === 'string') return c;
        if (c && typeof c === 'object' && 'text' in c) {
          return String((c as {text: string}).text);
        }
        return '';
      }).join('\n');
    }
    
    return JSON.stringify(event);
  }

  /**
   * 提取修改的文件列表
   */
  private extractModifiedFiles(event: unknown): string[] {
    const files: string[] = [];
    
    if (!event || typeof event !== 'object') return files;
    
    const e = event as Record<string, unknown>;
    
    // 检查tool_use中的文件操作
    if (e.tool_use && typeof e.tool_use === 'object') {
      const toolUse = e.tool_use as Record<string, unknown>;
      
      // 文件写入
      if (toolUse.command === 'write' && typeof toolUse.path === 'string') {
        files.push(toolUse.path);
      }
      
      // 文件编辑
      if (toolUse.command === 'edit' && typeof toolUse.path === 'string') {
        files.push(toolUse.path);
      }
    }
    
    return files;
  }

  /**
   * 检查是否为有效的会话文件
   */
  private isValidSessionFile(name: string): boolean {
    // Claude会话文件通常是UUID格式
    // 简化检查：包含数字和字母，没有扩展名或.jsonl扩展名
    return /^[a-zA-Z0-9_-]+$/.test(name) || name.endsWith('.jsonl');
  }

  /**
   * 将解析的会话转换为标准快照格式
   */
  createSnapshot(
    parsed: ParsedSessionFile, 
    name: string,
    options?: { includeFiles?: boolean; maxFileSize?: number }
  ): SessionSnapshot {
    const now = Date.now();
    
    // 估算token使用量（简化算法：4字符 ≈ 1 token）
    const totalChars = parsed.messages.reduce(
      (sum, m) => sum + m.content.length, 0
    );
    const estimatedTokens = Math.ceil(totalChars / 4);

    return {
      id: `session_${now}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      created_at: now,
      updated_at: now,
      source: parsed.tool,
      messages: parsed.messages,
      context_window: {
        max_tokens: 200000, // Claude默认
        used_tokens: estimatedTokens,
        compression_ratio: 0
      },
      file_context: {
        working_directory: parsed.working_directory,
        relevant_files: [],
        file_snapshots: {}
      },
      environment: {
        shell: process.env.SHELL || '/bin/bash',
        node_version: process.version,
        env_vars: this.sanitizeEnvVars()
      },
      tags: [],
      notes: ''
    };
  }

  /**
   * 清理环境变量（移除敏感信息）
   */
  private sanitizeEnvVars(): Record<string, string> {
    const sensitive = [
      'TOKEN', 'KEY', 'SECRET', 'PASSWORD', 'AUTH', 
      'CREDENTIAL', 'PRIVATE', 'API_KEY'
    ];
    
    const result: Record<string, string> = {};
    
    for (const [key, value] of Object.entries(process.env)) {
      // 跳过敏感变量
      if (sensitive.some(s => key.toUpperCase().includes(s))) continue;
      if (value && value.length < 500) {
        result[key] = value;
      }
    }
    
    return result;
  }
}