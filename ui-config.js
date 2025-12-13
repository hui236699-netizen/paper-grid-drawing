// ui-config.js  —— 让 draw.html / path.html 用同一套 UI 尺寸 & 网格样式
window.UI_CONFIG = {
  PANEL_W: 240,          // 左侧栏宽度（把它改成 sketch.js 里的真实值）
  PANEL_PAD: 10,         // 左侧栏内边距
  COLOR_PANEL_H: 190,    // 色盘区域整体高度（或色盘区占用高度）

  // 色盘：主色块 + Hue 条
  HUE_W: 30,             // Hue 条宽度
  COLOR_MAIN_TOP: 10,    // 色盘距顶部
  COLOR_MAIN_SIDE: 10,   // 色盘左右 padding（主色块从这里开始）

  // 网格：和 sketch.js 一样
  GRID_STEP: 25,         // 小格间距
  GRID_MAJOR: 100,       // 大格间距（如果 sketch.js 没有大格就设成 0）
  GRID_MINOR_STROKE: 230,// 小格线灰度
  GRID_MAJOR_STROKE: 210 // 大格线灰度
};
