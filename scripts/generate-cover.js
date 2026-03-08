const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

// 创建1200x630px封面图
const width = 1200;
const height = 630;

const canvas = createCanvas(width, height);
const ctx = canvas.getContext('2d');

// 背景色 #0d1117 (GitHub暗色)
ctx.fillStyle = '#0d1117';
ctx.fillRect(0, 0, width, height);

// 渐变装饰
const gradient = ctx.createLinearGradient(0, 0, width, height);
gradient.addColorStop(0, 'rgba(56, 139, 253, 0.15)');
gradient.addColorStop(0.5, 'rgba(46, 160, 67, 0.1)');
gradient.addColorStop(1, 'rgba(56, 139, 253, 0.05)');
ctx.fillStyle = gradient;
ctx.fillRect(0, 0, width, height);

// 右侧装饰圆环
ctx.strokeStyle = '#388bfd';
ctx.lineWidth = 3;
ctx.beginPath();
ctx.arc(950, 200, 120, 0, Math.PI * 2);
ctx.stroke();

ctx.strokeStyle = '#2ea043';
ctx.lineWidth = 2;
ctx.beginPath();
ctx.arc(950, 200, 80, 0, Math.PI * 2);
ctx.stroke();

// 中心圆点
ctx.fillStyle = '#388bfd';
ctx.beginPath();
ctx.arc(950, 200, 20, 0, Math.PI * 2);
ctx.fill();

// 左侧装饰线
ctx.strokeStyle = '#388bfd';
ctx.lineWidth = 4;
ctx.beginPath();
ctx.moveTo(60, 200);
ctx.lineTo(60, 430);
ctx.stroke();

ctx.strokeStyle = '#2ea043';
ctx.lineWidth = 3;
ctx.beginPath();
ctx.moveTo(85, 250);
ctx.lineTo(85, 380);
ctx.stroke();

// 主标题
ctx.fillStyle = '#ffffff';
ctx.font = 'bold 68px "DejaVu Sans", sans-serif';
ctx.textAlign = 'center';
ctx.fillText('ContextRoller', width / 2 - 100, 260);

// 副标题
ctx.fillStyle = '#8b949e';
ctx.font = '32px "DejaVu Sans", sans-serif';
ctx.fillText('AI Session Context Manager', width / 2 - 100, 330);

// 描述
ctx.fillStyle = '#58a6ff';
ctx.font = '22px "DejaVu Sans", sans-serif';
ctx.fillText('Never lose your AI conversation context again', width / 2 - 100, 390);

// 底部标签背景
const drawTag = (x, y, w, h, text) => {
  ctx.fillStyle = '#21262d';
  ctx.strokeStyle = '#30363d';
  ctx.lineWidth = 1;
  
  // 圆角矩形
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.stroke();
  
  // 文字
  ctx.fillStyle = '#ffffff';
  ctx.font = '16px "DejaVu Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, x + w / 2, y + h / 2 + 5);
};

drawTag(320, 480, 140, 36, 'TypeScript');
drawTag(480, 480, 110, 36, 'Node.js');
drawTag(610, 480, 130, 36, 'MCP Server');
drawTag(760, 480, 100, 36, 'CLI');

// 保存为JPG
const buffer = canvas.toBuffer('image/jpeg', { quality: 0.95 });
const outputPath = path.join(__dirname, '..', 'cover.jpg');
fs.writeFileSync(outputPath, buffer);

console.log('✅ Cover image generated successfully!');
console.log('Path:', outputPath);
console.log('Size:', (fs.statSync(outputPath).size / 1024).toFixed(1), 'KB');