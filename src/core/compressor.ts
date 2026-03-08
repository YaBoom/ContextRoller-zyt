/**
 * ContextCompressor - 上下文压缩器
 * 
 * 智能压缩会话历史以节省token，同时保留关键信息
 * 
 * 三种压缩级别：
 * - lossless: 无损压缩，仅移除重复和空白
 * - semantic: 语义压缩，合并相似消息
 * - summary: 摘要模式，生成高层次总结
 * 
 * TODO:
 * - [ ] 使用LLM生成更智能的摘要
 * - [ ] 添加用户可配置的保留规则
 * - [ ] 实现增量压缩策略
 */

import { SessionSnapshot, Message, CompressedContext, MessageRole } from './types.js';

export interface CompressionOptions {
  level: 'lossless' | 'semantic' | 'summary';
  maxTokens?: number;
  preservePatterns?: string[]; // 正则表达式模式，匹配的内容保留
  preserveLastN?: number; // 保留最后N条消息不压缩
}

export class ContextCompressor {
  /**
   * 压缩会话
   */
  compress(snapshot: SessionSnapshot, options: CompressionOptions): CompressedContext {
    const originalTokens = snapshot.context_window.used_tokens;
    let compressedMessages: Message[] = [];
    let summary = '';
    let keyDecisions: string[] = [];

    switch (options.level) {
      case 'lossless':
        ({ messages: compressedMessages, summary, keyDecisions } = 
          this.losslessCompress(snapshot.messages, options));
        break;
      case 'semantic':
        ({ messages: compressedMessages, summary, keyDecisions } = 
          this.semanticCompress(snapshot.messages, options));
        break;
      case 'summary':
        ({ summary, keyDecisions } = 
          this.summaryCompress(snapshot.messages, options));
        compressedMessages = this.getRecentMessages(snapshot.messages, options.preserveLastN || 3);
        break;
    }

    const compressedSnapshot: SessionSnapshot = {
      ...snapshot,
      messages: compressedMessages,
      context_window: {
        ...snapshot.context_window,
        used_tokens: this.estimateTokens(compressedMessages),
        compression_ratio: compressedMessages.length / snapshot.messages.length
      },
      updated_at: Date.now()
    };

    return {
      id: `compressed_${Date.now()}`,
      original_session_id: snapshot.id,
      compression_level: options.level,
      summary,
      key_decisions: keyDecisions,
      original_token_count: originalTokens,
      compressed_token_count: compressedSnapshot.context_window.used_tokens,
      created_at: Date.now()
    };
  }

  /**
   * 无损压缩 - 仅清理和去重
   */
  private losslessCompress(
    messages: Message[], 
    options: CompressionOptions
  ): { messages: Message[]; summary: string; keyDecisions: string[] } {
    const preserved = this.preserveRecent(messages, options.preserveLastN || 5);
    const toCompress = messages.slice(0, messages.length - preserved.length);

    // 合并连续相同角色的短消息
    const merged: Message[] = [];
    let current: Message | null = null;

    for (const msg of toCompress) {
      if (current && current.role === msg.role) {
        // 检查是否都应该被保留
        const shouldPreserve = this.shouldPreserve(current) || this.shouldPreserve(msg);
        
        if (!shouldPreserve && current.content.length + msg.content.length < 500) {
          current.content += '\n' + msg.content;
          current.metadata = {
            ...current.metadata,
            merged_count: (current.metadata?.merged_count || 1) + 1
          };
        } else {
          merged.push(current);
          current = msg;
        }
      } else {
        if (current) merged.push(current);
        current = msg;
      }
    }
    if (current) merged.push(current);

    // 清理内容
    const cleaned = merged.map(m => ({
      ...m,
      content: this.cleanContent(m.content)
    }));

    const finalMessages = [...cleaned, ...preserved];
    const removed = messages.length - finalMessages.length;

    return {
      messages: finalMessages,
      summary: `无损压缩：合并 ${removed} 条消息，保留关键信息`,
      keyDecisions: this.extractKeyDecisions(finalMessages)
    };
  }

  /**
   * 语义压缩 - 基于内容相似度合并
   */
  private semanticCompress(
    messages: Message[],
    options: CompressionOptions
  ): { messages: Message[]; summary: string; keyDecisions: string[] } {
    const preserved = this.preserveRecent(messages, options.preserveLastN || 5);
    const toCompress = messages.slice(0, messages.length - preserved.length);

    // 识别关键消息（用户指令、AI决策、代码块）
    const keyMessages = toCompress.filter(m => this.isKeyMessage(m));
    const otherMessages = toCompress.filter(m => !this.isKeyMessage(m));

    // 对其他消息进行分组摘要
    const chunks = this.chunkMessages(otherMessages, 5);
    const chunkSummaries = chunks.map((chunk, i) => {
      return `[对话片段 ${i + 1}] ${this.summarizeChunk(chunk)}`;
    });

    // 创建压缩后的消息
    const systemMessage: Message = {
      id: `compressed_${Date.now()}`,
      role: 'system',
      content: `### 历史对话摘要\n\n${chunkSummaries.join('\n\n')}`,
      timestamp: Date.now()
    };

    const finalMessages = [systemMessage, ...keyMessages, ...preserved];

    return {
      messages: finalMessages,
      summary: `语义压缩：${messages.length} 条消息 → ${finalMessages.length} 条消息，保留 ${keyMessages.length} 条关键消息`,
      keyDecisions: this.extractKeyDecisions(keyMessages)
    };
  }

  /**
   * 摘要压缩 - 生成高层总结
   */
  private summaryCompress(
    messages: Message[],
    options: CompressionOptions
  ): { summary: string; keyDecisions: string[] } {
    const keyDecisions = this.extractKeyDecisions(messages);
    
    // 构建摘要
    const userMessages = messages.filter(m => m.role === 'user');
    const assistantMessages = messages.filter(m => m.role === 'assistant');

    const summary = `## 会话摘要

**用户请求**: ${userMessages.slice(0, 3).map(m => m.content.slice(0, 100)).join('; ')}

**主要工作**: 共 ${messages.length} 条消息，其中 ${userMessages.length} 条用户输入，${assistantMessages.length} 条AI回复

**关键决策点**:\n${keyDecisions.map((d, i) => `${i + 1}. ${d.slice(0, 150)}...`).join('\n')}

**最后更新**: ${new Date().toLocaleString()}`;

    return { summary, keyDecisions };
  }

  /**
   * 识别关键消息
   */
  private isKeyMessage(message: Message): boolean {
    // 包含代码块
    if (message.content.includes('```')) return true;
    
    // 包含文件操作
    if (message.metadata?.files_modified?.length) return true;
    
    // 包含关键决策词
    const decisionWords = ['决定', '选择', '方案', '架构', '设计', '确认'];
    if (decisionWords.some(w => message.content.includes(w))) return true;
    
    // 包含错误信息
    if (message.content.includes('error') || message.content.includes('Error')) return true;
    
    return false;
  }

  /**
   * 检查是否应该保留消息
   */
  private shouldPreserve(message: Message): boolean {
    // 保留代码块
    if (message.content.includes('```')) return true;
    
    // 保留错误信息
    if (message.content.toLowerCase().includes('error')) return true;
    
    return false;
  }

  /**
   * 保留最近N条消息
   */
  private preserveRecent(messages: Message[], n: number): Message[] {
    return messages.slice(-n);
  }

  /**
   * 获取最近消息
   */
  private getRecentMessages(messages: Message[], n: number): Message[] {
    return messages.slice(-n);
  }

  /**
   * 将消息分块
   */
  private chunkMessages(messages: Message[], chunkSize: number): Message[][] {
    const chunks: Message[][] = [];
    for (let i = 0; i < messages.length; i += chunkSize) {
      chunks.push(messages.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * 摘要消息块
   */
  private summarizeChunk(chunk: Message[]): string {
    const topics = chunk
      .filter(m => m.role === 'user')
      .map(m => m.content.slice(0, 50));
    
    if (topics.length === 0) {
      return 'AI回复和确认';
    }
    
    return `讨论: ${topics.join(', ')}...`;
  }

  /**
   * 提取关键决策点
   */
  private extractKeyDecisions(messages: Message[]): string[] {
    const decisions: string[] = [];
    
    for (const msg of messages) {
      const content = msg.content;
      
      // 提取代码块（作为技术决策）
      const codeBlocks = content.match(/```[\s\S]*?```/g);
      if (codeBlocks) {
        codeBlocks.slice(0, 2).forEach(block => {
          const desc = block.split('\n')[0].slice(0, 50);
          decisions.push(`代码实现: ${desc}...`);
        });
      }
      
      // 提取关键选择
      if (content.includes('选择') || content.includes('decided') || content.includes('choose')) {
        const lines = content.split('\n').filter(l => 
          l.includes('选择') || l.includes('decided') || l.includes('使用')
        );
        decisions.push(...lines.slice(0, 2).map(l => l.slice(0, 100)));
      }
    }
    
    return [...new Set(decisions)].slice(0, 10);
  }

  /**
   * 清理内容（移除多余空白等）
   */
  private cleanContent(content: string): string {
    return content
      .replace(/\n{3,}/g, '\n\n') // 多个空行合并
      .trim();
  }

  /**
   * 估算token数量（简化算法）
   */
  private estimateTokens(messages: Message[]): number {
    const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
    return Math.ceil(totalChars / 4);
  }

  /**
   * 检查是否需要压缩
   */
  shouldCompress(snapshot: SessionSnapshot, threshold: number = 150000): boolean {
    return snapshot.context_window.used_tokens > threshold;
  }
}