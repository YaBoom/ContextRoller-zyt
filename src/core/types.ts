/**
 * ContextRoller - 核心类型定义
 * 
 * 定义了会话快照、上下文块、标签等核心数据结构
 * 
 * TODO:
 * - [ ] 支持更多AI工具格式（Cursor、Copilot Chat等）
 * - [ ] 添加加密支持保护敏感信息
 */

/**
 * 消息角色类型
 */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

/**
 * 单个对话消息
 */
export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  metadata?: {
    tool_calls?: unknown[];
    tokens?: number;
    files_modified?: string[];
  };
}

/**
 * 会话快照 - 完整捕获一个AI会话
 */
export interface SessionSnapshot {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
  source: 'claude-code' | 'cursor' | 'aider' | 'manual';
  messages: Message[];
  context_window: {
    max_tokens: number;
    used_tokens: number;
    compression_ratio: number;
  };
  file_context?: {
    working_directory: string;
    relevant_files: string[];
    file_snapshots: Record<string, string>; // file_path -> content hash
  };
  environment?: {
    shell: string;
    node_version?: string;
    env_vars: Record<string, string>; // 只记录非敏感变量
  };
  tags: string[];
  notes: string;
}

/**
 * 压缩后的上下文块 - 用于节省token
 */
export interface CompressedContext {
  id: string;
  original_session_id: string;
  compression_level: 'lossless' | 'semantic' | 'summary';
  summary: string; // 压缩后的摘要
  key_decisions: string[]; // 关键决策点（保留）
  original_token_count: number;
  compressed_token_count: number;
  created_at: number;
}

/**
 * 用户定义的标签
 */
export interface ContextTag {
  id: string;
  name: string;
  description: string;
  session_ids: string[];
  file_patterns: string[];
  created_at: number;
  color?: string;
}

/**
 * 健康度报告
 */
export interface ContextHealthReport {
  current_session_id?: string;
  total_sessions: number;
  total_tags: number;
  storage_used_mb: number;
  recommendations: string[];
  warnings: string[];
}

/**
 * 支持的AI工具类型
 */
export enum AITool {
  CLAUDE_CODE = 'claude-code',
  CURSOR = 'cursor',
  AIDER = 'aider',
  COPILOT_CHAT = 'copilot-chat',
  MANUAL = 'manual'
}

/**
 * 解析后的会话文件
 */
export interface ParsedSessionFile {
  tool: AITool;
  version?: string;
  messages: Message[];
  working_directory: string;
  timestamp: number;
}