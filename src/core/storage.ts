/**
 * SessionStorage - 会话存储管理
 * 
 * 使用 sql.js (纯 JavaScript SQLite) 作为后端存储，无需编译
 * 
 * TODO:
 * - [ ] 添加索引优化查询性能
 * - [ ] 支持数据导出为 JSON 格式
 * - [ ] 实现自动清理旧会话的策略
 */

import initSqlJs, { Database } from 'sql.js';
import { SessionSnapshot, ContextTag, CompressedContext } from './types.js';
import { join } from 'path';
import { homedir } from 'os';
import { readFile, writeFile, mkdir } from 'fs/promises';

export class SessionStorage {
  private db: Database | null = null;
  private projectPath: string;
  private ctxrDir: string;
  private dbPath: string;

  constructor(projectPath: string = process.cwd()) {
    this.projectPath = projectPath;
    this.ctxrDir = join(projectPath, '.ctxr');
    this.dbPath = join(this.ctxrDir, 'ctxr.db');
  }

  /**
   * 初始化数据库连接和表结构
   */
  async init(): Promise<void> {
    // 确保.ctxr 目录存在
    await this.ensureDir(this.ctxrDir);
      
    // 初始化 sql.js
    const SQL = await initSqlJs();
      
    // 尝试加载现有的数据库文件
    try {
      const dbData = await readFile(this.dbPath);
      this.db = new SQL.Database(dbData);
    } catch {
      // 文件不存在，创建新数据库
      this.db = new SQL.Database();
    }
  
    await this.createTables();
    await this.saveDb();
  }

  /**
   * 保存数据库到磁盘
   */
  private async saveDb(): Promise<void> {
    if (!this.db) return;
    
    await this.ensureDir(this.ctxrDir);
    const data = this.db.export();
    await writeFile(this.dbPath, Buffer.from(data));
  }

  /**
   * 创建必要的表结构
   */
  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    this.db.exec(`
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
   * 执行 SQL 查询并返回结果
   */
  private async execQuery(sql: string, params: any[] = []): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized');
    
    const stmt = this.db.prepare(sql);
    if (params.length > 0) {
      stmt.bind(params);
    }
    try {
      const results: any[] = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();
      return results;
    } catch (error) {
      stmt.free();
      throw error;
    }
  }

  /**
   * 执行 SQL 语句（不返回结果）
   */
  private async execRun(sql: string, params: any[] = []): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    this.db.run(sql, params);
    await this.saveDb();
  }
  /**
   * 保存会话快照
   */
  async saveSession(snapshot: SessionSnapshot): Promise<void> {
    await this.execRun(
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
    const rows = await this.execQuery(
      'SELECT data FROM sessions WHERE id = ?',
      [id]
    );

    if (rows.length === 0) return null;
    return JSON.parse(rows[0].data as string) as SessionSnapshot;
  }

  /**
   * 列出所有会话
   */
  async listSessions(limit: number = 50, offset: number = 0): Promise<SessionSnapshot[]> {
    const rows = await this.execQuery(
      `SELECT data FROM sessions 
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    return rows.map(row => JSON.parse(row.data as string) as SessionSnapshot);
  }

  /**
   * 搜索会话
   */
  async searchSessions(query: string): Promise<SessionSnapshot[]> {
    const rows = await this.execQuery(
      `SELECT data FROM sessions 
       WHERE name LIKE ? OR notes LIKE ?
       ORDER BY created_at DESC`,
      [`%${query}%`, `%${query}%`]
    );

    return rows.map(row => JSON.parse(row.data as string) as SessionSnapshot);
  }

  /**
   * 删除会话
   */
  async deleteSession(id: string): Promise<void> {
    await this.execRun('DELETE FROM sessions WHERE id = ?', [id]);
    await this.execRun('DELETE FROM compressed_contexts WHERE original_session_id = ?', [id]);
  }

  /**
   * 创建标签
   */
  async createTag(tag: ContextTag): Promise<void> {
    await this.execRun(
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
    const rows = await this.execQuery('SELECT * FROM tags ORDER BY created_at DESC');
    
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
    const countRows = await this.execQuery('SELECT COUNT(*) as count FROM sessions');
    const sizeRows = await this.execQuery(
      "SELECT SUM(LENGTH(data)) as total_bytes FROM sessions"
    );
      
    const totalBytes = sizeRows[0]?.total_bytes || 0;
      
    return {
      totalSessions: countRows[0]?.count || 0,
      storageSizeMB: parseFloat((totalBytes / 1024 / 1024).toFixed(2))
    };
  }

  /**
   * 关闭数据库连接
   */
  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
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