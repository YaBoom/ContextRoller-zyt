/**
 * 生成 ContextRoller 封面图
 * 尺寸: 1200×630px (Open Graph 标准)
 * 风格: GitHub 暗色主题
 */

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const WIDTH = 1200;
const HEIGHT = 630;

// GitHub 暗色主题配色
const COLORS = {
  bg: '#0d1117',
  bgSecondary: '#161b22',
  border: '#30363d',
  text: '#f0f6fc',
  textMuted: '#8b949e',
  accent: '#58a6ff',
  accentGreen: '#3fb950',
  accentPurple: '#a371f7'
};

// 创建画布
const canvas = createCanvas(WIDTH, HEIGHT);
const ctx = canvas.getContext('2d');

// 背景
ctx.fillStyle = COLORS.bg;
ctx.fillRect(0, 0, WIDTH, HEIGHT);

// 绘制装饰性网格
ctx.strokeStyle = COLORS.border;
ctx.lineWidth = 1;
ctx.globalAlpha = 0.3;

const gridSize = 40;
for (let x = 0; x < WIDTH; x += gridSize) {
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, HEIGHT);
  ctx.stroke();
}
for (let y = 0; y < HEIGHT; y += gridSize) {
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(WIDTH, y);
  ctx.stroke();
}
ctx.globalAlpha = 1;

// 绘制装饰性圆环
ctx.strokeStyle = COLORS.accent;
ctx.lineWidth = 2;
ctx.globalAlpha = 0.15;
ctx.beginPath();
ctx.arc(WIDTH * 0.85, HEIGHT * 0.2, 100, 0, Math.PI * 2);
ctx.stroke();

ctx.strokeStyle = COLORS.accentPurple;
ctx.beginPath();
ctx.arc(WIDTH * 0.15, HEIGHT * 0.8, 80, 0, Math.PI * 2);
ctx.stroke();
ctx.globalAlpha = 1;

// 绘制主标题背景卡片
const cardX = 100;
const cardY = 120;
const cardW = 1000;
const cardH = 390;

// 卡片阴影
ctx.fillStyle = 'rgba(0,0,0,0.3)';
ctx.fillRect(cardX + 8, cardY + 8, cardW, cardH);

// 卡片主体
ctx.fillStyle = COLORS.bgSecondary;
ctx.fillRect(cardX, cardY, cardW, cardH);

// 卡片边框
ctx.strokeStyle = COLORS.border;
ctx.lineWidth = 2;
ctx.strokeRect(cardX, cardY, cardW, cardH);

// 绘制 Logo 图标（滚轮概念）
const logoX = cardX + 80;
const logoY = cardY + 80;
const logoSize = 80;

// 外圈
ctx.strokeStyle = COLORS.accent;
ctx.lineWidth = 6;
ctx.beginPath();
ctx.arc(logoX, logoY, logoSize / 2, 0, Math.PI * 2);
ctx.stroke();

// 内圈（表示循环）
ctx.strokeStyle = COLORS.accentGreen;
ctx.lineWidth = 4;
ctx.beginPath();
ctx.arc(logoX, logoY, logoSize / 3, 0.5, Math.PI * 1.5);
ctx.stroke();

// 箭头（表示方向）
ctx.fillStyle = COLORS.accentGreen;
ctx.beginPath();
ctx.moveTo(logoX + logoSize/3 - 5, logoY - logoSize/3 + 10);
ctx.lineTo(logoX + logoSize/3 + 10, logoY - logoSize/3);
ctx.lineTo(logoX + logoSize/3 - 5, logoY - logoSize/3 - 10);
ctx.closePath();
ctx.fill();

// 主标题
ctx.fillStyle = COLORS.text;
ctx.font = 'bold 72px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';
ctx.textAlign = 'left';
ctx.fillText('ContextRoller', logoX + 60, logoY + 25);

// 副标题
ctx.fillStyle = COLORS.textMuted;
ctx.font = '32px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';
ctx.fillText('AI 会话上下文管理器', logoX, logoY + 100);

// 描述语
ctx.fillStyle = COLORS.textMuted;
ctx.font = '24px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';
ctx.fillText('永不丢失的 Claude / Cursor 开发会话', logoX, logoY + 150);

// 绘制特性列表
const features = [
  '✓ Session Snapshot  会话快照',
  '✓ Smart Compression  智能压缩',
  '✓ Context Tags  上下文标签',
  '✓ MCP Server  MCP 集成'
];

let featureY = logoY + 210;
ctx.font = '22px "SF Mono", Monaco, monospace';

features.forEach((feature, i) => {
  const x = logoX + (i % 2) * 400;
  const y = featureY + Math.floor(i / 2) * 45;
  
  // 特性颜色
  ctx.fillStyle = COLORS.accentGreen;
  ctx.fillText('✓', x, y);
  
  ctx.fillStyle = COLORS.textMuted;
  ctx.fillText(feature.slice(2), x + 25, y);
});

// 底部信息
const footerY = HEIGHT - 50;
ctx.fillStyle = COLORS.textMuted;
ctx.font = '20px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';
ctx.textAlign = 'center';
ctx.fillText('github.com/YaBoom/ContextRoller-zyt', WIDTH / 2, footerY);

// 保存为 JPG
const buffer = canvas.toBuffer('image/jpeg', { quality: 0.92 });
fs.writeFileSync(path.join(__dirname, 'cover.jpg'), buffer);

console.log('✓ 封面图已生成: cover.jpg (1200×630px)');