// #22-1：像素小屋角色造型——手繪16x16像素人形版型，依配色/配件產生4款可選造型
// 執行方式：node assets/characters/generate.js（重新產生4個svg檔）
const fs = require("fs");
const path = require("path");

const SIZE = 16;

// 基礎人形遮罩：0=透明 1=髮 2=膚 3=衣 4=褲 5=配件/眼睛 6=鞋
function buildGrid(opts) {
  const g = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  const fillRow = (y, x0, x1, v) => { for (let x = x0; x <= x1; x++) g[y][x] = v; };

  fillRow(0, 5, 10, 1);
  fillRow(1, 4, 11, 1);
  fillRow(2, 4, 11, 2);
  fillRow(3, 4, 11, 2);
  g[3][5] = 5; g[3][10] = 5; // 眼睛
  fillRow(4, 4, 11, 2);
  fillRow(5, 4, 11, 2);
  fillRow(6, 3, 12, 3);
  fillRow(7, 2, 13, 3);
  fillRow(8, 2, 13, 3);
  fillRow(9, 2, 13, 3);
  fillRow(10, 3, 12, 3);
  fillRow(11, 5, 10, 4);
  fillRow(12, 5, 10, 4);
  fillRow(13, 5, 10, 4);
  fillRow(14, 5, 10, 4);
  fillRow(15, 5, 6, 6);
  fillRow(15, 9, 10, 6);

  if (opts.headband) fillRow(1, 4, 11, opts.headbandColor ? 7 : 1);
  return g;
}

const VARIANTS = {
  char_1: { name: "短髮・藍衣", colors: { 1: "#4a3a2c", 2: "#d9b38f", 3: "#5a7a9a", 4: "#2c333a", 5: "#1c1c1c", 6: "#1c1c1c" } },
  char_2: { name: "黑髮・綠衣", colors: { 1: "#1c1c1c", 2: "#c9966f", 3: "#5a9a5e", 4: "#2c333a", 5: "#1c1c1c", 6: "#3a2c20" } },
  char_3: { name: "金髮・紫衣＋髮帶", colors: { 1: "#b8973f", 2: "#e8c9a3", 3: "#9a5a8f", 4: "#2c333a", 5: "#1c1c1c", 6: "#1c1c1c", 7: "#c0392b" }, opts: { headband: true, headbandColor: true } },
  char_4: { name: "白髮・紅衣＋墨鏡", colors: { 1: "#c9cfd6", 2: "#b3805a", 3: "#c0392b", 4: "#2c333a", 5: "#2c333a", 6: "#1c1c1c" }, opts: { glasses: true } },
};

Object.entries(VARIANTS).forEach(([id, def]) => {
  const grid = buildGrid(def.opts || {});
  if (def.opts && def.opts.glasses) { grid[3][5] = 5; grid[3][10] = 5; grid[3][6] = 5; grid[3][9] = 5; }
  let rects = "";
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const v = grid[y][x];
      if (v === 0) continue;
      const color = def.colors[v];
      rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${color}"/>`;
    }
  }
  const svg = `<svg viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg"><rect width="${SIZE}" height="${SIZE}" fill="#20262b"/>${rects}</svg>`;
  fs.writeFileSync(path.join(__dirname, `${id}.svg`), svg, "utf8");
  console.log(`wrote ${id}.svg (${def.name})`);
});
