// =================== 全局设置（响应式 + 网格强吸附 + 统一拖拽锚点翻转 + Anti-Jitter） ===================

let cw = 240;
let cellSize = 36;

let dragAnchor;          // ✅ 角点锚点（grid int）
let dragEndFloat;        // ✅ 当前鼠标（grid float）
let isDragging = false;  // 画新图
let isMoving = false;    // 移动选中图

let currentShape = 0;
let currentColor;

let shapes = [];
let undoStack = [];
let showGrid = true;

// 选中/移动
let selectedIndex = -1;
let moveStartGrid = null;
let moveOrigXY = null;
let moveDidChange = false;

// 资源
let icons = new Array(10);
let buttons = new Array(10);
let svgs = new Array(8);
let svgBounds = new Array(8).fill(null);

// HSV 颜色
let hue = 220;
let sat = 100;
let bri = 80;

// 颜色拖动
let isColorDragging = false;
let colorDragMode = null; // "sb" | "hue"

// 动态布局
let COLOR_MAIN, COLOR_HUE;
let RECENT_RECTS = [];
let FUNC_RECTS = {};
let SHAPE_RECTS = [];

let sbGraphic, hueGraphic;

const defaultRecentHex = ["#482BCC", "#FF04A5", "#FFE900", "#8CE255", "#8EC8EC"];
let recentColors = [];

let undoButton, clearButton, gridButton, saveButton;

// ✅ 拖拽符号状态（用于 Anti-Jitter：边界附近不抖动）
let dragSignX = 1;
let dragSignY = 1;

// =================== 工具函数 ===================
function clamp(v, lo, hi) { return max(lo, min(hi, v)); }

// ✅ 清空 redo 栈（你的 undoStack 在这里承担 redo 功能）
function clearRedo() { undoStack = []; }

// ✅ 限制主画布 DPR，避免超高 DPR 设备性能暴涨
function setCanvasDPR() {
  pixelDensity(min(window.devicePixelRatio || 1, 2));
  smooth();
}

// ✅ 右侧网格区域可用格子数
function gridCols() { return max(1, floor((width - cw) / cellSize)); }
function gridRows() { return max(1, floor(height / cellSize)); }

// 鼠标 -> 网格坐标（整数格，强吸附）
function mouseToGridInt() {
  const gx = floor((mouseX - cw) / cellSize);
  const gy = floor(mouseY / cellSize);
  return { gx, gy };
}

// ✅ 鼠标 -> 网格坐标（浮点，用于 Anti-Jitter/平滑翻转判断）
function mouseToGridFloat() {
  const gx = (mouseX - cw) / cellSize;
  const gy = mouseY / cellSize;
  return { gx, gy };
}

// ✅ Anti-Jitter：根据“死区”更新 dragSignX / dragSignY
function updateDragSigns(dx, dy) {
  // 死区像素（越大越稳，但越不灵敏）。你想更“像 Adobe”，8~14 px 都行。
  const deadPx = 10;
  const eps = deadPx / cellSize; // 转成 grid 单位

  // X：在 [-eps, +eps] 内保持上一次符号，不切换
  if (dx > eps) dragSignX = 1;
  else if (dx < -eps) dragSignX = -1;

  // Y：同理
  if (dy > eps) dragSignY = 1;
  else if (dy < -eps) dragSignY = -1;
}

// ✅ 核心：角点锚 + 对角拉伸 + 翻转 + Shift 等比 + Anti-Jitter + 贴网格
// 返回：{ ax, ay, w, h } 其中 w/h 是“带符号”的格子数（可为负），且最小为 1（带符号）
function getDragBoxSigned(lockAspect) {
  const ax = dragAnchor.x;
  const ay = dragAnchor.y;

  const mx = dragEndFloat.x;
  const my = dragEndFloat.y;

  // 相对锚点的连续位移（grid float）
  const dx = mx - ax;
  const dy = my - ay;

  // 更新符号（含死区）
  updateDragSigns(dx, dy);

  // 长度（grid int）：用 abs(dx/dy) 的 floor 做吸附，最小 1
  // 这样“点一下” dx/dy≈0 => length=1，满足你要的 1×1
  let lenX = max(1, floor(abs(dx)));
  let lenY = max(1, floor(abs(dy)));

  if (lockAspect) {
    const s = max(lenX, lenY);
    lenX = s;
    lenY = s;
  }

  let w = dragSignX * lenX;
  let h = dragSignY * lenY;

  // ✅ 限制不出可视网格（保持锚点不动，裁剪 w/h）
  const cols = gridCols();
  const rows = gridRows();

  // X 方向裁剪
  if (w > 0) {
    // 右下拉：右边界 = ax + w <= cols
    w = min(w, cols - ax);
    w = max(1, w); // 保底
  } else {
    // 左边翻：左边界 = ax + w >= 0  (w 为负)
    w = max(w, -ax);
    w = min(-1, w); // 保底（负）
  }

  // Y 方向裁剪
  if (h > 0) {
    h = min(h, rows - ay);
    h = max(1, h);
  } else {
    h = max(h, -ay);
    h = min(-1, h);
  }

  return { ax, ay, w, h };
}

// =================== 响应式布局（颜色区重写，且强制整数尺寸） ===================
function computeLayout() {
  cw = clamp(width * 0.18, 200, 320);

  const rightW = max(1, width - cw);
  const byWidth = rightW / 26;
  const byHeight = height / 22;
  cellSize = clamp(min(byWidth, byHeight), 24, 52);

  // 颜色区
  const pad = 16;
  const gap = 10;
  const hueW = clamp(cw * 0.09, 18, 28);
  const maxSB = clamp(height * 0.28, 170, 260);

  const sbW = cw - pad * 2 - hueW - gap;
  const sbSize = clamp(min(sbW, maxSB), 150, maxSB);

  // ✅ 强制整数尺寸（修复 Retina 下 pixels 长度/绘制错位问题）
  const sbSizeI = max(1, floor(sbSize));
  const hueWI = max(1, floor(hueW));

  const topY = pad;

  COLOR_MAIN = { x: pad, y: topY, w: sbSizeI, h: sbSizeI };
  COLOR_HUE  = { x: pad + sbSizeI + gap, y: topY, w: hueWI,  h: sbSizeI };

  // Recent colors
  RECENT_RECTS = [];
  const recentCount = 5;
  const recentGap = 10;
  const rW = clamp((cw - pad * 2 - recentGap * (recentCount - 1)) / recentCount, 22, 34);
  const recentY = topY + sbSizeI + 18;

  for (let i = 0; i < recentCount; i++) {
    RECENT_RECTS.push({ x: pad + i * (rW + recentGap), y: recentY, w: rW, h: rW });
  }

  // 功能按钮
  const btnGapX = 12;
  const btnW = (cw - pad * 2 - btnGapX) / 2;
  const btnH = clamp(height * 0.035, 30, 38);
  const funcY1 = recentY + rW + 18;
  const funcY2 = funcY1 + btnH + 12;

  FUNC_RECTS = {
    undo:  { x: pad, y: funcY1, w: btnW, h: btnH },
    clear: { x: pad + btnW + btnGapX, y: funcY1, w: btnW, h: btnH },
    grid:  { x: pad, y: funcY2, w: btnW, h: btnH },
    save:  { x: pad + btnW + btnGapX, y: funcY2, w: btnW, h: btnH }
  };

  // 形状按钮 2x5
  SHAPE_RECTS = [];
  const shapesTopY = funcY2 + btnH + 18;
  const availableH = max(1, height - shapesTopY - 18);

  const cols = 2, rows = 5;
  const gridGapX = clamp(cw * 0.08, 10, 16);
  const gridGapY = clamp(height * 0.015, 10, 18);

  const cellW2 = (cw - pad * 2 - gridGapX) / cols;
  const cellH2 = (availableH - gridGapY * (rows - 1)) / rows;
  const size = clamp(min(cellW2, cellH2), 56, 86);

  const col1x = pad + (cellW2 - size) / 2;
  const col2x = pad + cellW2 + gridGapX + (cellW2 - size) / 2;

  for (let row = 0; row < rows; row++) {
    const y = shapesTopY + row * (size + gridGapY);
    SHAPE_RECTS.push({ x: col1x, y, w: size, h: size });
    SHAPE_RECTS.push({ x: col2x, y, w: size, h: size });
  }
}

// =================== 预加载 ===================
function preload() {
  for (let i = 0; i < icons.length; i++) icons[i] = loadImage("assets/" + i + ".png");
  for (let i = 0; i < svgs.length; i++) svgs[i] = loadImage("svg/" + (i + 1) + ".svg?v=10");
}

// ------------------- 计算 SVG 的非透明区域 -------------------
function computeSvgBounds(index) {
  const img = svgs[index];
  if (!img) return;

  const sampleW = 256, sampleH = 256;
  const pg = createGraphics(sampleW, sampleH);
  pg.pixelDensity(1);
  pg.clear();
  pg.image(img, 0, 0, sampleW, sampleH);
  pg.loadPixels();

  let minX = sampleW, minY = sampleH;
  let maxX = -1, maxY = -1;

  for (let y = 0; y < sampleH; y++) {
    for (let x = 0; x < sampleW; x++) {
      const idx4 = (y * sampleW + x) * 4;
      const a = pg.pixels[idx4 + 3];
      if (a > 10) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  let bounds;
  if (maxX < minX || maxY < minY) {
    bounds = { x0: 0, y0: 0, w: 1, h: 1 };
  } else {
    let x0 = minX / sampleW;
    let y0 = minY / sampleH;
    let w = (maxX - minX + 1) / sampleW;
    let h = (maxY - minY + 1) / sampleH;

    const margin = 0.03;
    let x1 = x0 + w, y1 = y0 + h;
    x0 = max(0, x0 - margin);
    y0 = max(0, y0 - margin);
    x1 = min(1, x1 + margin);
    y1 = min(1, y1 + margin);
    w = x1 - x0;
    h = y1 - y0;
    bounds = { x0, y0, w, h };
  }

  svgBounds[index] = bounds;
  pg.remove();
}

// =================== 颜色贴图（关键修复：pixelDensity(1) + 整数尺寸） ===================
function rebuildHueGraphic() {
  const w = max(1, floor(COLOR_HUE.w));
  const h = max(1, floor(COLOR_HUE.h));

  hueGraphic = createGraphics(w, h);
  hueGraphic.pixelDensity(1);
  hueGraphic.colorMode(HSB, 360, 100, 100);
  hueGraphic.noStroke();
  hueGraphic.loadPixels();

  for (let y = 0; y < h; y++) {
    const hh = map(y, 0, h - 1, 0, 360);
    const c = hueGraphic.color(hh, 100, 100);
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      hueGraphic.pixels[idx]     = red(c);
      hueGraphic.pixels[idx + 1] = green(c);
      hueGraphic.pixels[idx + 2] = blue(c);
      hueGraphic.pixels[idx + 3] = 255;
    }
  }
  hueGraphic.updatePixels();
}

function rebuildSBGraphic() {
  const w = max(1, floor(COLOR_MAIN.w));
  const h = max(1, floor(COLOR_MAIN.h));

  sbGraphic = createGraphics(w, h);
  sbGraphic.pixelDensity(1);
  sbGraphic.colorMode(HSB, 360, 100, 100);
  sbGraphic.noStroke();
  sbGraphic.loadPixels();

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sVal = map(x, 0, w - 1, 0, 100);
      const bVal = map(y, 0, h - 1, 100, 0);
      const c = sbGraphic.color(hue, sVal, bVal);
      const idx = (y * w + x) * 4;
      sbGraphic.pixels[idx]     = red(c);
      sbGraphic.pixels[idx + 1] = green(c);
      sbGraphic.pixels[idx + 2] = blue(c);
      sbGraphic.pixels[idx + 3] = 255;
    }
  }
  sbGraphic.updatePixels();
}

// =================== UI layout ===================
function layoutUI() {
  computeLayout();
  rebuildHueGraphic();
  rebuildSBGraphic();

  undoButton  = rectToCapButton(FUNC_RECTS.undo,  "Undo");
  clearButton = rectToCapButton(FUNC_RECTS.clear, "Clear");
  gridButton  = rectToCapButton(FUNC_RECTS.grid,  "Grid");
  saveButton  = rectToCapButton(FUNC_RECTS.save,  "Save");

  for (let i = 0; i < SHAPE_RECTS.length; i++) {
    const r = SHAPE_RECTS[i];
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const size = min(r.w, r.h);
    buttons[i] = new IconButton(cx, cy, size, i);
  }
}

function rectToCapButton(rect, label) {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  return new CapButton(cx, cy, rect.w, rect.h, label);
}

// =================== setup / resize ===================
function setup() {
  createCanvas(windowWidth, windowHeight);
  setCanvasDPR();

  currentColor = color("#482BCC");
  recentColors = defaultRecentHex.map(h => color(h));

  layoutUI();
  for (let i = 0; i < svgs.length; i++) computeSvgBounds(i);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  setCanvasDPR();
  layoutUI();
}

// =================== draw ===================
function draw() {
  background(240);
  noTint(); // 防 tint 泄漏

  // 右侧画布区域
  push();
  translate(cw, 0);

  if (showGrid) drawGrid();
  drawShapes();

  if (isDragging) drawPreview(); // ✅ 统一预览逻辑（所有形状一致）

  pop();

  // 左侧 UI 背景
  noStroke();
  fill("#1F1E24");
  rect(0, 0, cw, height);

  drawColorPanelNew();
  drawRecentColors();

  undoButton.display();
  clearButton.display();
  gridButton.display();
  saveButton.display();

  for (let b of buttons) b.display();
}

// =================== 网格 & 图形 ===================
function drawGrid() {
  const w = width - cw;
  const h = height;

  noStroke();
  fill(245);
  rect(0, 0, w, h);

  stroke(220);
  strokeWeight(1);
  for (let x = 0; x <= w; x += cellSize) line(x, 0, x, h);
  for (let y = 0; y <= h; y += cellSize) line(0, y, w, y);
}

function drawShapes() {
  for (let s of shapes) s.display();
}

// =================== 统一预览（角点锚 + 翻转 + Shift 等比 + Anti-Jitter） ===================
function drawPreview() {
  const lockAspect = keyIsDown(SHIFT);
  const box = getDragBoxSigned(lockAspect);

  const px = box.ax * cellSize;
  const py = box.ay * cellSize;
  const pw = box.w * cellSize;
  const ph = box.h * cellSize;

  const previewFill = color(red(currentColor), green(currentColor), blue(currentColor), 80);

  push();
  stroke(currentColor);
  strokeWeight(3);
  fill(previewFill);

  drawShapeByType(currentShape, px, py, pw, ph, previewFill, true);

  pop();
}

function addNewShapeFromDrag() {
  const lockAspect = keyIsDown(SHIFT);
  const box = getDragBoxSigned(lockAspect);

  // ✅ 存储为“锚点 + 带符号 w/h”（这样翻转信息不会丢，SVG 也稳定）
  shapes.push(new Shape(box.ax, box.ay, box.w, box.h, currentShape, currentColor));
  clearRedo();
}

// =================== 新颜色面板（重写 + 修复黑屏） ===================
function drawColorPanelNew() {
  noTint();
  const r = 14;

  noStroke();
  fill(38);
  rect(
    COLOR_MAIN.x - 8,
    COLOR_MAIN.y - 8,
    (COLOR_MAIN.w + COLOR_HUE.w + 10) + 16,
    COLOR_MAIN.h + 16,
    16
  );

  stroke(70);
  strokeWeight(1);
  fill(20);
  rect(COLOR_MAIN.x, COLOR_MAIN.y, COLOR_MAIN.w, COLOR_MAIN.h, r);

  imageMode(CORNER);
  image(sbGraphic, COLOR_MAIN.x, COLOR_MAIN.y, COLOR_MAIN.w, COLOR_MAIN.h);

  stroke(70);
  strokeWeight(1);
  fill(20);
  rect(COLOR_HUE.x, COLOR_HUE.y, COLOR_HUE.w, COLOR_HUE.h, r);

  image(hueGraphic, COLOR_HUE.x, COLOR_HUE.y, COLOR_HUE.w, COLOR_HUE.h);

  // SB 手柄
  const hx = COLOR_MAIN.x + (sat / 100) * COLOR_MAIN.w;
  const hy = COLOR_MAIN.y + (1 - bri / 100) * COLOR_MAIN.h;

  stroke(255);
  strokeWeight(2);
  noFill();
  circle(hx, hy, 14);
  stroke(0, 140);
  strokeWeight(2);
  circle(hx, hy, 10);

  // Hue 指示线
  const hueY = COLOR_HUE.y + (hue / 360) * COLOR_HUE.h;
  stroke(255);
  strokeWeight(3);
  line(COLOR_HUE.x - 3, hueY, COLOR_HUE.x + COLOR_HUE.w + 3, hueY);
}

// =================== 最近颜色 ===================
function drawRecentColors() {
  for (let i = 0; i < RECENT_RECTS.length; i++) {
    const r = RECENT_RECTS[i];
    stroke(40);
    strokeWeight(1);
    fill(recentColors[i] || color(0));
    rect(r.x, r.y, r.w, r.h, 8);

    if (recentColors[i] && colorsEqual(recentColors[i], currentColor)) {
      noFill();
      stroke(255);
      strokeWeight(2);
      rect(r.x - 3, r.y - 3, r.w + 6, r.h + 6, 10);
    }
  }
}

function handleColorPress() {
  // SB
  if (
    mouseX >= COLOR_MAIN.x && mouseX <= COLOR_MAIN.x + COLOR_MAIN.w &&
    mouseY >= COLOR_MAIN.y && mouseY <= COLOR_MAIN.y + COLOR_MAIN.h
  ) {
    isColorDragging = true;
    colorDragMode = "sb";
    updateColorByMouse();
    return true;
  }

  // Hue
  if (
    mouseX >= COLOR_HUE.x && mouseX <= COLOR_HUE.x + COLOR_HUE.w &&
    mouseY >= COLOR_HUE.y && mouseY <= COLOR_HUE.y + COLOR_HUE.h
  ) {
    isColorDragging = true;
    colorDragMode = "hue";
    updateColorByMouse();
    return true;
  }

  // Recent
  for (let i = 0; i < RECENT_RECTS.length; i++) {
    const r = RECENT_RECTS[i];
    if (mouseX >= r.x && mouseX <= r.x + r.w && mouseY >= r.y && mouseY <= r.y + r.h) {
      if (recentColors[i]) {
        currentColor = color(recentColors[i]);
        addRecentColor(currentColor);
      }
      return true;
    }
  }

  return false;
}

function updateColorByMouse() {
  if (colorDragMode === "sb") {
    const sx = clamp(mouseX, COLOR_MAIN.x, COLOR_MAIN.x + COLOR_MAIN.w - 1);
    const sy = clamp(mouseY, COLOR_MAIN.y, COLOR_MAIN.y + COLOR_MAIN.h - 1);
    sat = map(sx, COLOR_MAIN.x, COLOR_MAIN.x + COLOR_MAIN.w - 1, 0, 100);
    bri = map(sy, COLOR_MAIN.y, COLOR_MAIN.y + COLOR_MAIN.h - 1, 100, 0);
    updateCurrentColor(false);
    return true;
  }

  if (colorDragMode === "hue") {
    const hy = clamp(mouseY, COLOR_HUE.y, COLOR_HUE.y + COLOR_HUE.h - 1);
    hue = map(hy, COLOR_HUE.y, COLOR_HUE.y + COLOR_HUE.h - 1, 0, 360);
    rebuildSBGraphic();
    updateCurrentColor(false);
    return true;
  }
  return false;
}

function updateCurrentColor(addRecent = true) {
  push();
  colorMode(HSB, 360, 100, 100);
  currentColor = color(hue, sat, bri);
  pop();
  if (addRecent) addRecentColor(currentColor);
}

function addRecentColor(c) {
  const nc = color(c);
  recentColors = recentColors.filter(rc => !colorsEqual(rc, nc));
  recentColors.unshift(nc);
  if (recentColors.length > 5) recentColors.length = 5;
}

function colorsEqual(c1, c2, eps = 1) {
  return abs(red(c1) - red(c2)) <= eps &&
         abs(green(c1) - green(c2)) <= eps &&
         abs(blue(c1) - blue(c2)) <= eps;
}

// =================== 鼠标交互（左侧颜色拖动 + 右侧绘制/移动） ===================
function mousePressed() {
  // 左侧 UI
  if (mouseX <= cw) {
    if (undoButton.hover()) { undo(); return; }
    if (clearButton.hover()) { clearShapes(); return; }
    if (gridButton.hover()) { showGrid = !showGrid; return; }
    if (saveButton.hover()) { saveCanvas("paper-grid-drawing", "png"); return; }

    if (handleColorPress()) return;

    for (let b of buttons) b.click();
    return;
  }

  // 右侧画布区
  if (mouseX > cw && mouseY >= 0 && mouseY <= height) {
    const { gx, gy } = mouseToGridInt();

    const hit = hitTestShape(gx, gy);
    if (hit >= 0) {
      selectedIndex = hit;
      isMoving = true;
      moveDidChange = false;
      moveStartGrid = { x: gx, y: gy };
      moveOrigXY = { x: shapes[hit].x, y: shapes[hit].y };
      return;
    }

    selectedIndex = -1;

    // ✅ 开始绘制：锚点 = 按下格子
    isDragging = true;
    dragAnchor = createVector(gx, gy);

    // 初始符号设为正向（不会中心跳变）
    dragSignX = 1;
    dragSignY = 1;

    // 初始 end 也设成当前（点一下也能生成 1×1）
    const f = mouseToGridFloat();
    dragEndFloat = createVector(f.gx, f.gy);
  }
}

function mouseDragged() {
  if (isColorDragging) {
    updateColorByMouse();
    return;
  }

  // 移动：严格按格子 + 不出界（支持带符号 w/h 的形状）
  if (isMoving && selectedIndex >= 0 && selectedIndex < shapes.length) {
    const { gx, gy } = mouseToGridInt();
    const dx = gx - moveStartGrid.x;
    const dy = gy - moveStartGrid.y;
    if (dx !== 0 || dy !== 0) moveDidChange = true;

    const s = shapes[selectedIndex];
    const cols = gridCols();
    const rows = gridRows();

    // 对于带符号 w/h：允许范围取决于符号
    // X
    let minAx, maxAx;
    if (s.w > 0) { // 右伸
      minAx = 0;
      maxAx = cols - s.w;
    } else {       // 左伸：最左 = ax + w >= 0 => ax >= -w；最右 = ax <= cols
      minAx = -s.w;
      maxAx = cols;
    }
    // Y
    let minAy, maxAy;
    if (s.h > 0) {
      minAy = 0;
      maxAy = rows - s.h;
    } else {
      minAy = -s.h;
      maxAy = rows;
    }

    let nx = clamp(round(moveOrigXY.x + dx), minAx, maxAx);
    let ny = clamp(round(moveOrigXY.y + dy), minAy, maxAy);

    s.x = nx;
    s.y = ny;
    return;
  }

  // 绘制：更新 dragEndFloat（用 float 以便 Anti-Jitter）
  if (isDragging) {
    const f = mouseToGridFloat();
    dragEndFloat = createVector(f.gx, f.gy);
  }
}

function mouseReleased() {
  if (isColorDragging) {
    isColorDragging = false;
    colorDragMode = null;
    addRecentColor(currentColor);
    return;
  }

  if (isMoving) {
    isMoving = false;
    moveStartGrid = null;
    moveOrigXY = null;
    if (moveDidChange) clearRedo();
    moveDidChange = false;
    return;
  }

  if (isDragging) {
    isDragging = false;
    addNewShapeFromDrag(); // ✅ 点一下也生成 1×1（你要的功能保留）
  }
}

// =================== 撤销 / 清空 ===================
function undo() {
  if (shapes.length > 0) {
    undoStack.push(shapes.pop());
    if (selectedIndex >= shapes.length) selectedIndex = -1;
  }
}
function redo() {
  if (undoStack.length > 0) shapes.push(undoStack.pop());
}
function clearShapes() {
  shapes = [];
  clearRedo();
  selectedIndex = -1;
}

// =================== Shape 命中（支持带符号 w/h） ===================
function hitTestShape(gx, gy) {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i];
    const x0 = min(s.x, s.x + s.w);
    const x1 = max(s.x, s.x + s.w);
    const y0 = min(s.y, s.y + s.h);
    const y1 = max(s.y, s.y + s.h);
    if (gx >= x0 && gx < x1 && gy >= y0 && gy < y1) return i;
  }
  return -1;
}

// =================== Shape 类（存锚点 + 带符号 w/h） ===================
class Shape {
  constructor(ax, ay, w, h, type, c) {
    this.x = round(ax);
    this.y = round(ay);
    // ✅ w/h 可为负，但绝不为 0
    this.w = (w === 0 ? 1 : round(w));
    this.h = (h === 0 ? 1 : round(h));
    this.type = type;
    this.c = color(c);
  }

  display() {
    push();
    noStroke();
    fill(this.c);

    const px = this.x * cellSize;
    const py = this.y * cellSize;
    const pw = this.w * cellSize;
    const ph = this.h * cellSize;

    drawShapeByType(this.type, px, py, pw, ph, this.c, false);

    pop();
  }
}

// =================== 统一绘制入口（所有图形同一套“锚点 + 带符号 w/h”） ===================
function drawShapeByType(type, x, y, w, h, col, isPreview) {
  switch (type) {
    case 0: // rect
      rect(x, y, w, h);
      break;

    case 1: { // ellipse：中心随 w/h 带符号移动，大小取 abs（这样不会中心跳）
      const cx = x + w / 2;
      const cy = y + h / 2;
      ellipse(cx, cy, abs(w), abs(h));
      break;
    }

    case 2: // triangle（支持负 w/h）
      drawTriFromBox(x, y, w, h);
      break;

    case 3: // parallelogram（支持负 w/h）
      drawParaFromBox(x, y, w, h);
      break;

    default: // svg（✅ 支持翻转：负缩放）
      drawSvgShapeSigned(type, x, y, w, h, col);
      break;
  }
}

// =================== 形状辅助（支持负宽高） ===================
function drawTriFromBox(x, y, w, h) {
  const x0 = x, y0 = y;
  const x1 = x + w, y1 = y + h;

  const topY = min(y0, y1);
  const botY = max(y0, y1);
  const leftX = min(x0, x1);
  const rightX = max(x0, x1);
  const midX = (leftX + rightX) / 2;

  triangle(midX, topY, leftX, botY, rightX, botY);
}

function drawParaFromBox(x, y, w, h) {
  const x0 = min(x, x + w);
  const y0 = min(y, y + h);
  const ww = abs(w);
  const hh = abs(h);

  beginShape();
  vertex(x0 + ww / 4, y0);
  vertex(x0 + ww, y0);
  vertex(x0 + (3 * ww) / 4, y0 + hh);
  vertex(x0, y0 + hh);
  endShape(CLOSE);
}

// =================== SVG 形状（✅ 统一：锚点 + 带符号 w/h + 负缩放翻转 + Anti-Jitter 无关） ===================
function drawSvgShapeSigned(type, x, y, w, h, col) {
  const idx = type - 4;
  if (idx < 0 || idx >= svgs.length) return;
  const img = svgs[idx];
  if (!img) return;

  const ctx = drawingContext;
  ctx.imageSmoothingEnabled = true;
  if (ctx.imageSmoothingQuality) ctx.imageSmoothingQuality = "high";

  const bounds = svgBounds[idx];
  let sx, sy, sw, sh;
  if (bounds) {
    sx = img.width * bounds.x0;
    sy = img.height * bounds.y0;
    sw = img.width * bounds.w;
    sh = img.height * bounds.h;
  } else {
    sx = 0; sy = 0; sw = img.width; sh = img.height;
  }

  const signX = w >= 0 ? 1 : -1;
  const signY = h >= 0 ? 1 : -1;

  const aw = abs(w);
  const ah = abs(h);

  push();
  // ✅ 以锚点(x,y)为原点做带符号缩放 => 翻转自然出现，且锚点绝不跳
  translate(x, y);
  scale(signX, signY);

  if (col) tint(col);
  else tint(255);

  // 在局部坐标系里始终画正尺寸（aw/ah），符号由 scale 承担
  imageMode(CORNER);
  image(img, 0, 0, aw, ah, sx, sy, sw, sh);

  noTint();
  pop();
}

// =================== 左侧图标按钮 ===================
class IconButton {
  constructor(x, y, s, index) {
    this.x = x;
    this.y = y;
    this.s = s;
    this.index = index;
    this.img = icons[index];
    this.state = false;
  }

  display() {
    push();
    translate(this.x, this.y);
    rectMode(CENTER);
    imageMode(CENTER);
    noStroke();

    if (this.hover() || this.state) fill(80, 79, 83);
    else fill("#3A393D");
    rect(0, 0, this.s, this.s, this.s * 0.35);

    if (this.img) {
      tint(255);
      let factor = this.index < 4 ? 0.75 : 0.9;
      image(this.img, 0, 0, this.s * factor, this.s * factor);
      noTint();
    }
    pop();
  }

  click() {
    if (this.hover()) {
      for (let b of buttons) b.state = false;
      this.state = true;
      currentShape = this.index;
    }
  }

  hover() {
    return (
      mouseX >= this.x - this.s / 2 &&
      mouseX <= this.x + this.s / 2 &&
      mouseY >= this.y - this.s / 2 &&
      mouseY <= this.y + this.s / 2
    );
  }
}

// =================== 功能按钮 ===================
class CapButton {
  constructor(x, y, w, h, str) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.str = str;
  }

  display() {
    push();
    translate(this.x, this.y);
    rectMode(CENTER);

    if (this.hover()) fill(90, 89, 93);
    else fill("#464548");
    rect(0, 0, this.w, this.h, 40);

    fill(255);
    textAlign(CENTER, CENTER);
    textSize(this.h * 0.5);
    text(this.str, 0, 0);

    pop();
  }

  hover() {
    return (
      mouseX >= this.x - this.w / 2 &&
      mouseX <= this.x + this.w / 2 &&
      mouseY >= this.y - this.h / 2 &&
      mouseY <= this.y + this.h / 2
    );
  }
}

// =================== 键盘 ===================
function keyPressed() {
  // Delete / Backspace 删除选中
  if ((keyCode === BACKSPACE || keyCode === DELETE) && selectedIndex >= 0) {
    shapes.splice(selectedIndex, 1);
    selectedIndex = -1;
    clearRedo();
    return false;
  }

  // Undo/Redo
  if (key === "z" || key === "Z") undo();
  if (key === "y" || key === "Y") redo();
}
