/**
 * SessionStorage - 会话存储管理
 * 
 * 使用SQLite作为后端存储，提供高效的会话CRUD操作
 * 
 * TODO:
 * - [ ] 添加索引优化查询性能
 * - [ ] 支持数据导出为JSON格式
 * - [ ] 实现自动清理旧会话的策略
 */

import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { SessionSnapshot, ContextTag, CompressedContext } from './types.js';
import { join } from 'path';
import { homedir } from 'os';

// 使用named import避免类型问题
const sqlite3Verbose = sqlite3.verbose();

export class SessionStorage {
  private db: Database | null = null;
  private projectPath: string;
  private ctxrDir: string;

  constructor(projectPath: string = process.cwd()) {
    this.projectPath = projectPath;
    this.ctxrDir = join(projectPath, '.ctxr');
  }

  /**
   * 初始化数据库连接和表结构
   */
  async init(): Promise<void> {
    // 确保.ctxr目录存在
    await this.ensureDir(this.ctxrDir);
    
    const dbPath = join(this.ctxrDir, 'ctxr.db');
    
    this.db = await open({
      filename: dbPath,
      driver: sqlite3Verbose.Database
    });

    await this.createTables();
  }

  /**
   * 创建必要的表结构
   */
  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        source TEXT NOT NULL,
        data TEXT NOT NULL, -- JSON格式的完整快照
        tags TEXT, -- JSON数组
        notes TEXT
      );

      CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        session_ids TEXT, -- JSON数组
        file_patterns TEXT, -- JSON数组
        created_at INTEGER NOT NULL,
        color TEXT
      );

      CREATE TABLE IF NOT EXISTS compressed_contexts (
        id TEXT PRIMARY KEY,
        original_session_id TEXT NOT NULL,
        compression_level TEXT NOT NULL,
        summary TEXT NOT NULL,
        key_decisions TEXT, -- JSON数组
        original_token_count INTEGER NOT NULL,
        compressed_token_count INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (original_session_id) REFERENCES sessions(id)
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sessions_name ON sessions(name);
    `);
  }

  /**
   * 保存会话快照
   */
  async saveSession(snapshot: SessionSnapshot): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.run(
      `INSERT OR REPLACE INTO sessions (id, name, created_at, updated_at, source, data, tags, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        snapshot.id,
        snapshot.name,
        snapshot.created_at,
        snapshot.updated_at,
        snapshot.source,
        JSON.stringify(snapshot),
        JSON.stringify(snapshot.tags),
        snapshot.notes
      ]
    );
  }

  /**
   * 获取单个会话
   */
  async getSession(id: string): Promise<SessionSnapshot | null> {
    if (!this.db) throw new Error('Database not initialized');

    const row = await this.db.get(
      'SELECT data FROM sessions WHERE id = ?',
      id
    );

    if (!row) return null;
    return JSON.parse(row.data) as SessionSnapshot;
  }

  /**
   * 列出所有会话
   */
  async listSessions(limit: number = 50, offset: number = 0): Promise<SessionSnapshot[]> {
    if (!this.db) throw new Error('Database not initialized');

    const rows = await this.db.all(
      `SELECT data FROM sessions 
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`,
      limit,
      offset
    );

    return rows.map(row => JSON.parse(row.data) as SessionSnapshot);
  }

  /**
   * 搜索会话
   */
  async searchSessions(query: string): Promise<SessionSnapshot[]> {
    if (!this.db) throw new Error('Database not initialized');

    const rows = await this.db.all(
      `SELECT data FROM sessions 
       WHERE name LIKE ? OR notes LIKE ?
       ORDER BY created_at DESC`,
      `%${query}%`,
      `%${query}%`
    );

    return rows.map(row => JSON.parse(row.data) as SessionSnapshot);
  }

  /**
   * 删除会话
   */
  async deleteSession(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.run('DELETE FROM sessions WHERE id = ?', id);
    await this.db.run('DELETE FROM compressed_contexts WHERE original_session_id = ?', id);
  }

  /**
   * 创建标签
   */
  async createTag(tag: ContextTag): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.run(
      `INSERT OR REPLACE INTO tags (id, name, description, session_ids, file_patterns, created_at, color)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        tag.id,
        tag.name,
        tag.description,
        JSON.stringify(tag.session_ids),
        JSON.stringify(tag.file_patterns),
        tag.created_at,
        tag.color
      ]
    );
  }

  /**
   * 获取所有标签
   */
  async listTags(): Promise<ContextTag[]> {
    if (!this.db) throw new Error('Database not initialized');

    const rows = await this.db.all('SELECT * FROM tags ORDER BY created_at DESC');
    
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      session_ids: JSON.parse(row.session_ids || '[]'),
      file_patterns: JSON.parse(row.file_patterns || '[]'),
      created_at: row.created_at,
      color: row.color
    }));
  }

  /**
   * 获取存储统计信息
   */
  async getStats(): Promise<{ totalSessions: number; storageSizeMB: number }> {
    if (!this.db) throw new Error('Database not initialized');

    const countRow = await this.db.get('SELECT COUNT(*) as count FROM sessions');
    
    // 估算存储大小（SQLite不直接提供，这里简化处理）
    const sizeRow = await this.db.get(
      "SELECT SUM(LENGTH(data)) as total_bytes FROM sessions"
    );
    
    const totalBytes = sizeRow?.total_bytes || 0;
    
    return {
      totalSessions: countRow.count,
      storageSizeMB: parseFloat((totalBytes / 1024 / 1024).toFixed(2))
    };
  }

  /**
   * 关闭数据库连接
   */
  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
  }

  /**
   * 确保目录存在（简化版）
   */
  private async ensureDir(dir: string): Promise<void> {
    const { mkdir } = await import('fs/promises');
    try {
      await mkdir(dir, { recursive: true });
    } catch {
      // 目录可能已存在
    }
  }
}