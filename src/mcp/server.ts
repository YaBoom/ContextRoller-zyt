/**
 * MCP Server - Model Context Protocol 服务端
 * 
 * 将ContextRoller功能暴露为MCP工具，让任何AI Agent都能调用
 * 
 * TODO:
 * - [ ] 实现完整的MCP协议支持
 * - [ ] 添加工具权限控制
 * - [ ] 支持流式响应
 */

import { SessionStorage } from '../core/storage.js';
import { SessionParser } from '../core/parser.js';
import { ContextCompressor } from '../core/compressor.js';
import { SessionSnapshot, CompressedContext, ContextTag } from '../core/types.js';

// MCP Tool 定义
interface MCPTool {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// MCP 工具集合
export const mcpTools: MCPTool[] = [
  {
    name: 'capture_session',
    description: '捕获当前AI会话的快照，保存完整上下文',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: '会话名称，用于后续查找'
        },
        notes: {
          type: 'string',
          description: '可选的会话备注'
        }
      },
      required: ['name']
    }
  },
  {
    name: 'list_sessions',
    description: '列出所有保存的会话快照',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: '返回的最大会话数量',
          default: 10
        }
      }
    }
  },
  {
    name: 'get_session',
    description: '获取指定会话的详细信息',
    parameters: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: '会话ID'
        }
      },
      required: ['session_id']
    }
  },
  {
    name: 'restore_session',
    description: '恢复指定会话的上下文，用于继续之前的任务',
    parameters: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: '要恢复的会话ID'
        },
        include_compressed: {
          type: 'boolean',
          description: '是否包含压缩后的上下文',
          default: true
        }
      },
      required: ['session_id']
    }
  },
  {
    name: 'compress_session',
    description: '压缩会话上下文以节省token',
    parameters: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: '要压缩的会话ID'
        },
        level: {
          type: 'string',
          enum: ['lossless', 'semantic', 'summary'],
          description: '压缩级别',
          default: 'semantic'
        }
      },
      required: ['session_id']
    }
  },
  {
    name: 'search_sessions',
    description: '搜索历史会话',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '搜索关键词'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'get_context_health',
    description: '获取当前上下文健康度报告，包括token使用情况和优化建议',
    parameters: {
      type: 'object',
      properties: {}
    }
  }
];

export class ContextRollerMCPServer {
  private storage: SessionStorage;

  constructor(projectPath: string) {
    this.storage = new SessionStorage(projectPath);
  }

  async init(): Promise<void> {
    await this.storage.init();
  }

  /**
   * 处理MCP工具调用
   */
  async handleToolCall(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'capture_session':
        return this.captureSession(args as { name: string; notes?: string });
      case 'list_sessions':
        return this.listSessions(args as { limit?: number });
      case 'get_session':
        return this.getSession(args as { session_id: string });
      case 'restore_session':
        return this.restoreSession(args as { session_id: string; include_compressed?: boolean });
      case 'compress_session':
        return this.compressSession(args as { session_id: string; level?: 'lossless' | 'semantic' | 'summary' });
      case 'search_sessions':
        return this.searchSessions(args as { query: string });
      case 'get_context_health':
        return this.getContextHealth();
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  /**
   * 捕获会话
   */
  private async captureSession(args: { name: string; notes?: string }): Promise<{ session_id: string; message: string }> {
    const parser = new SessionParser();
    const parsed = await parser.parseClaudeSession();
    
    let snapshot: SessionSnapshot;
    
    if (parsed) {
      snapshot = parser.createSnapshot(parsed, args.name);
    } else {
      // 创建手动会话
      snapshot = {
        id: `manual_${Date.now()}`,
        name: args.name,
        created_at: Date.now(),
        updated_at: Date.now(),
        source: 'manual',
        messages: [{
          id: 'init',
          role: 'system',
          content: `手动捕获的会话\n工作目录: ${process.cwd()}\n备注: ${args.notes || '无'}`,
          timestamp: Date.now()
        }],
        context_window: {
          max_tokens: 200000,
          used_tokens: 100,
          compression_ratio: 0
        },
        tags: [],
        notes: args.notes || ''
      };
    }
    
    await this.storage.saveSession(snapshot);
    
    return {
      session_id: snapshot.id,
      message: `会话已保存: ${snapshot.name}`
    };
  }

  /**
   * 列出会话
   */
  private async listSessions(args: { limit?: number }): Promise<{ sessions: Array<{ id: string; name: string; created_at: string; token_count: number }> }> {
    const sessions = await this.storage.listSessions(args.limit || 10);
    
    return {
      sessions: sessions.map((s: SessionSnapshot) => ({
        id: s.id,
        name: s.name,
        created_at: new Date(s.created_at).toISOString(),
        token_count: s.context_window.used_tokens
      }))
    };
  }

  /**
   * 获取会话详情
   */
  private async getSession(args: { session_id: string }): Promise<SessionSnapshot | { error: string }> {
    const session = await this.storage.getSession(args.session_id);
    
    if (!session) {
      return { error: `Session not found: ${args.session_id}` };
    }
    
    return session;
  }

  /**
   * 恢复会话
   */
  private async restoreSession(args: { session_id: string; include_compressed?: boolean }): Promise<{ 
    success: boolean; 
    context_summary: string;
    key_decisions: string[];
    recent_messages: Array<{ role: string; content: string }>;
  }> {
    const session = await this.storage.getSession(args.session_id);
    
    if (!session) {
      return {
        success: false,
        context_summary: `Session not found: ${args.session_id}`,
        key_decisions: [],
        recent_messages: []
      };
    }

    // 提取关键决策点
    const compressor = new ContextCompressor();
    const compressed = compressor.compress(session, {
      level: 'semantic',
      preserveLastN: 10
    });

    const recentMessages = session.messages.slice(-5).map((m: { role: string; content: string }) => ({
      role: m.role,
      content: m.content.slice(0, 500) + (m.content.length > 500 ? '...' : '')
    }));

    return {
      success: true,
      context_summary: compressed.summary,
      key_decisions: compressed.key_decisions,
      recent_messages: recentMessages
    };
  }

  /**
   * 压缩会话
   */
  private async compressSession(args: { session_id: string; level?: 'lossless' | 'semantic' | 'summary' }): Promise<{
    success: boolean;
    original_tokens: number;
    compressed_tokens: number;
    savings_percent: number;
    summary: string;
  }> {
    const session = await this.storage.getSession(args.session_id);
    
    if (!session) {
      return {
        success: false,
        original_tokens: 0,
        compressed_tokens: 0,
        savings_percent: 0,
        summary: `Session not found: ${args.session_id}`
      };
    }

    const compressor = new ContextCompressor();
    const compressed = compressor.compress(session, {
      level: args.level || 'semantic',
      preserveLastN: 5
    });

    const savings = (1 - compressed.compressed_token_count / compressed.original_token_count) * 100;

    return {
      success: true,
      original_tokens: compressed.original_token_count,
      compressed_tokens: compressed.compressed_token_count,
      savings_percent: parseFloat(savings.toFixed(1)),
      summary: compressed.summary
    };
  }

  /**
   * 搜索会话
   */
  private async searchSessions(args: { query: string }): Promise<{
    results: Array<{ id: string; name: string; relevance: number }>;
  }> {
    const sessions = await this.storage.searchSessions(args.query);
    
    return {
      results: sessions.map((s: SessionSnapshot) => ({
        id: s.id,
        name: s.name,
        relevance: 1.0 // 简化处理
      }))
    };
  }

  /**
   * 获取上下文健康度
   */
  private async getContextHealth(): Promise<{
    total_sessions: number;
    storage_size_mb: number;
    recommendations: string[];
    warnings: string[];
  }> {
    const stats = await this.storage.getStats();
    const recommendations: string[] = [];
    const warnings: string[] = [];

    if (stats.totalSessions > 100) {
      recommendations.push('会话数量较多，建议清理旧的会话以提升性能');
    }

    if (stats.storageSizeMB > 50) {
      warnings.push('存储空间超过50MB，建议压缩或删除旧会话');
    }

    if (stats.totalSessions === 0) {
      recommendations.push('还没有保存任何会话，运行 capture_session 开始记录');
    }

    return {
      total_sessions: stats.totalSessions,
      storage_size_mb: stats.storageSizeMB,
      recommendations,
      warnings
    };
  }

  /**
   * 生成MCP配置
   */
  generateMCPConfig(): Record<string, unknown> {
    return {
      name: 'contextroller',
      description: 'AI会话上下文管理器',
      tools: mcpTools,
      transport: {
        type: 'stdio',
        command: 'npx',
        args: ['@contextroller/cli', 'mcp-server']
      }
    };
  }

  async close(): Promise<void> {
    await this.storage.close();
  }
}