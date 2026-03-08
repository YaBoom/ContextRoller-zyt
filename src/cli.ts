/#!/usr/bin/env node
/**
 * CLI - ContextRoller 命令行界面
 * 
 * 提供交互式命令来管理AI会话上下文
 * 
 * TODO:
 * - [ ] 添加交互式TUI界面
 * - [ ] 支持配置文件(.ctxrrc)
 * - [ ] 添加导入/导出功能
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { SessionStorage } from './core/storage.js';
import { SessionParser } from './core/parser.js';
import { ContextCompressor } from './core/compressor.js';
import { SessionSnapshot, ContextHealthReport } from './core/types.js';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { resolve, join } from 'path';

const program = new Command();

program
  .name('ctxr')
  .description('ContextRoller - AI会话上下文管理器')
  .version('0.1.0');

// 获取或创建存储实例
async function getStorage(projectPath: string): Promise<SessionStorage> {
  const storage = new SessionStorage(projectPath);
  await storage.init();
  return storage;
}

// 检查项目是否已初始化
function checkInitialized(projectPath: string): boolean {
  return existsSync(join(projectPath, '.ctxr', 'ctxr.db'));
}

// init 命令
program
  .command('init')
  .description('在当前目录初始化 ContextRoller')
  .action(async () => {
    const spinner = ora('初始化 ContextRoller...').start();
    
    try {
      const storage = await getStorage(process.cwd());
      await storage.close();
      
      spinner.succeed(chalk.green('ContextRoller 初始化成功！'));
      console.log(chalk.gray('\n提示：运行 `ctxr capture` 开始捕获会话'));
    } catch (error) {
      spinner.fail(chalk.red(`初始化失败: ${error}`));
      process.exit(1);
    }
  });

// capture 命令
program
  .command('capture')
  .description('捕获当前AI会话')
  .option('-n, --name <name>', '会话名称')
  .option('-s, --source <source>', '会话来源 (claude-code|cursor|manual)', 'manual')
  .action(async (options) => {
    if (!checkInitialized(process.cwd())) {
      console.log(chalk.yellow('⚠️  请先运行 `ctxr init` 初始化项目'));
      return;
    }

    const spinner = ora('捕获会话...').start();
    
    try {
      const storage = await getStorage(process.cwd());
      const parser = new SessionParser();
      
      // 检测当前AI工具
      const detectedTool = parser.detectTool();
      const source = detectedTool || options.source;
      
      // 尝试解析Claude会话
      const parsed = await parser.parseClaudeSession();
      
      let snapshot: SessionSnapshot;
      
      if (parsed) {
        spinner.text = '检测到 Claude Code 会话，正在解析...';
        snapshot = parser.createSnapshot(parsed, options.name || `Claude会话 ${new Date().toLocaleString()}`);
      } else {
        // 创建手动会话
        spinner.text = '创建手动会话快照...';
        snapshot = {
          id: `manual_${Date.now()}`,
          name: options.name || `手动快照 ${new Date().toLocaleString()}`,
          created_at: Date.now(),
          updated_at: Date.now(),
          source: options.source,
          messages: [{
            id: 'init',
            role: 'system',
            content: `手动创建的会话快照\n工作目录: ${process.cwd()}`,
            timestamp: Date.now()
          }],
          context_window: {
            max_tokens: 200000,
            used_tokens: 100,
            compression_ratio: 0
          },
          tags: [],
          notes: ''
        };
      }
      
      await storage.saveSession(snapshot);
      await storage.close();
      
      spinner.succeed(chalk.green(`会话已保存: ${chalk.bold(snapshot.name)}`));
      console.log(chalk.gray(`ID: ${snapshot.id}`));
      console.log(chalk.gray(`Token使用: ${snapshot.context_window.used_tokens.toLocaleString()}`));
    } catch (error) {
      spinner.fail(chalk.red(`捕获失败: ${error}`));
      process.exit(1);
    }
  });

// list 命令
program
  .command('list')
  .alias('ls')
  .description('列出所有保存的会话')
  .option('-l, --limit <n>', '显示数量限制', '20')
  .action(async (options) => {
    if (!checkInitialized(process.cwd())) {
      console.log(chalk.yellow('⚠️  请先运行 `ctxr init` 初始化项目'));
      return;
    }

    try {
      const storage = await getStorage(process.cwd());
      const sessions = await storage.listSessions(parseInt(options.limit));
      await storage.close();
      
      if (sessions.length === 0) {
        console.log(chalk.gray('暂无保存的会话'));
        return;
      }
      
      console.log(chalk.bold('\n📋 保存的会话:\n'));
      
      sessions.forEach((s, i) => {
        const date = new Date(s.created_at).toLocaleString('zh-CN');
        const source = chalk.gray(`[${s.source}]`);
        const tokens = chalk.cyan(`${s.context_window.used_tokens.toLocaleString()} tokens`);
        
        console.log(`${chalk.gray(`${i + 1}.`)} ${chalk.white(s.name)} ${source}`);
        console.log(`   ${chalk.gray(date)} · ${tokens}`);
        console.log(`   ${chalk.dim(s.id)}`);
        console.log();
      });
    } catch (error) {
      console.error(chalk.red(`列出会话失败: ${error}`));
      process.exit(1);
    }
  });

// show 命令
program
  .command('show <id>')
  .description('显示会话详情')
  .action(async (id) => {
    if (!checkInitialized(process.cwd())) {
      console.log(chalk.yellow('⚠️  请先运行 `ctxr init` 初始化项目'));
      return;
    }

    try {
      const storage = await getStorage(process.cwd());
      const session = await storage.getSession(id);
      await storage.close();
      
      if (!session) {
        console.log(chalk.yellow(`未找到会话: ${id}`));
        return;
      }
      
      console.log(chalk.bold('\n📄 会话详情\n'));
      console.log(`名称: ${chalk.white(session.name)}`);
      console.log(`ID: ${chalk.dim(session.id)}`);
      console.log(`来源: ${chalk.gray(session.source)}`);
      console.log(`创建时间: ${chalk.gray(new Date(session.created_at).toLocaleString('zh-CN'))}`);
      console.log(`消息数: ${chalk.cyan(session.messages.length)}`);
      console.log(`Token使用: ${chalk.cyan(`${session.context_window.used_tokens.toLocaleString()} / ${session.context_window.max_tokens.toLocaleString()}`)}`);
      
      if (session.tags.length > 0) {
        console.log(`标签: ${session.tags.map(t => chalk.yellow(t)).join(', ')}`);
      }
      
      console.log(chalk.bold('\n💬 最近消息:\n'));
      
      session.messages.slice(-5).forEach((m) => {
        const role = m.role === 'user' ? chalk.blue('User') : 
                     m.role === 'assistant' ? chalk.green('AI') : chalk.gray('System');
        const preview = m.content.slice(0, 100).replace(/\n/g, ' ');
        console.log(`${role}: ${preview}${m.content.length > 100 ? '...' : ''}`);
      });
      
    } catch (error) {
      console.error(chalk.red(`显示会话失败: ${error}`));
      process.exit(1);
    }
  });

// delete 命令
program
  .command('delete <id>')
  .alias('rm')
  .description('删除会话')
  .action(async (id) => {
    if (!checkInitialized(process.cwd())) {
      console.log(chalk.yellow('⚠️  请先运行 `ctxr init` 初始化项目'));
      return;
    }

    const spinner = ora('删除会话...').start();
    
    try {
      const storage = await getStorage(process.cwd());
      await storage.deleteSession(id);
      await storage.close();
      
      spinner.succeed(chalk.green('会话已删除'));
    } catch (error) {
      spinner.fail(chalk.red(`删除失败: ${error}`));
      process.exit(1);
    }
  });

// compress 命令
program
  .command('compress <id>')
  .description('压缩会话上下文')
  .option('-l, --level <level>', '压缩级别 (lossless|semantic|summary)', 'semantic')
  .action(async (id, options) => {
    if (!checkInitialized(process.cwd())) {
      console.log(chalk.yellow('⚠️  请先运行 `ctxr init` 初始化项目'));
      return;
    }

    const spinner = ora('压缩会话...').start();
    
    try {
      const storage = await getStorage(process.cwd());
      const session = await storage.getSession(id);
      
      if (!session) {
        spinner.fail(chalk.yellow(`未找到会话: ${id}`));
        return;
      }
      
      const compressor = new ContextCompressor();
      const compressed = compressor.compress(session, {
        level: options.level,
        preserveLastN: 5
      });
      
      await storage.close();
      
      spinner.succeed(chalk.green('压缩完成'));
      console.log(chalk.gray(`\n原始Token: ${compressed.original_token_count.toLocaleString()}`));
      console.log(chalk.gray(`压缩后Token: ${compressed.compressed_token_count.toLocaleString()}`));
      console.log(chalk.green(`节省: ${((1 - compressed.compressed_token_count / compressed.original_token_count) * 100).toFixed(1)}%`));
      console.log(chalk.gray(`\n摘要: ${compressed.summary}`));
      
    } catch (error) {
      spinner.fail(chalk.red(`压缩失败: ${error}`));
      process.exit(1);
    }
  });

// stats 命令
program
  .command('stats')
  .description('显示存储统计信息')
  .action(async () => {
    if (!checkInitialized(process.cwd())) {
      console.log(chalk.yellow('⚠️  请先运行 `ctxr init` 初始化项目'));
      return;
    }

    try {
      const storage = await getStorage(process.cwd());
      const stats = await storage.getStats();
      await storage.close();
      
      console.log(chalk.bold('\n📊 存储统计\n'));
      console.log(`总会话数: ${chalk.cyan(stats.totalSessions)}`);
      console.log(`存储大小: ${chalk.cyan(stats.storageSizeMB.toFixed(2) + ' MB')}`);
      
    } catch (error) {
      console.error(chalk.red(`获取统计失败: ${error}`));
      process.exit(1);
    }
  });

// 解析命令行参数
program.parse();