// =================== 全局设置（响应式布局 + 更强交互版） ===================

// 左侧栏宽度（动态计算）
let cw = 240;

// 网格尺寸（动态计算）
let cellSize = 36;

let dragStart, dragEnd;
let isDragging = false;     // 画新图形
let isMoving = false;       // 移动已选图形

let currentShape = 0;
let currentColor;

let shapes = [];
let undoStack = [];
let showGrid = true;

// 选中
let selectedIndex = -1;
let moveStartGrid = null;
let moveOrigXY = null;

// 左侧按钮 & 图标（只用前 10 个）
let icons = new Array(10);
let buttons = new Array(10);
let svgs = new Array(8);
let svgBounds = new Array(8).fill(null);

// 颜色选择：HSV
let hue = 220;
let sat = 100;
let bri = 80;

// 动态布局对象
let COLOR_PANEL_H = 190;
let COLOR_MAIN, COLOR_HUE;
let RECENT_RECTS = [];
let FUNC_RECTS = {};
let SHAPE_RECTS = [];

let sbGraphic, hueGraphic;

const defaultRecentHex = [
  "#482BCC",
  "#FF04A5",
  "#FFE900",
  "#8CE255",
  "#8EC8EC"
];
let recentColors = [];

let undoButton, clearButton, gridButton, saveButton;

// =================== 工具函数 ===================
function clamp(v, lo, hi) {
  return max(lo, min(hi, v));
}

// 鼠标 -> 网格坐标（更顺滑：floor）
function mouseToGrid() {
  const gx = floor((mouseX - cw) / cellSize);
  const gy = floor(mouseY / cellSize);
  return { gx, gy };
}

// 从 dragStart/dragEnd 得到“归一化矩形”（支持四向）
function getNormalizedDragRect(a, b) {
  const x0 = min(a.x, b.x);
  const y0 = min(a.y, b.y);
  const x1 = max(a.x, b.x);
  const y1 = max(a.y, b.y);

  // +1 保证 1 格也有面积
  const w = max(1, x1 - x0 + 1);
  const h = max(1, y1 - y0 + 1);

  return { x: x0, y: y0, w, h };
}

// Shift 锁比例：把 w/h 变成正方形/正圆（保持方向）
function lockAspectByShift(start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  const adx = abs(dx);
  const ady = abs(dy);
  const m = max(adx, ady);

  const sx = dx >= 0 ? 1 : -1;
  const sy = dy >= 0 ? 1 : -1;

  // 让 end 跟随更大的那个变化量
  return createVector(start.x + sx * m, start.y + sy * m);
}

// 查找鼠标所在网格格子命中的“最上层”图形（从后往前）
function hitTestShape(gx, gy) {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i];
    if (gx >= s.x && gx < s.x + s.w && gy >= s.y && gy < s.y + s.h) {
      return i;
    }
  }
  return -1;
}

// 画选中框
function drawSelectionOutline(s) {
  const px = s.x * cellSize;
  const py = s.y * cellSize;
  const pw = s.w * cellSize;
  const ph = s.h * cellSize;

  push();
  noFill();
  stroke(0, 140);
  strokeWeight(2);
  rect(px + 1, py + 1, pw - 2, ph - 2, 6);
  pop();
}

// =================== 根据窗口尺寸重算布局 ===================
function computeLayout() {
  // 左侧栏宽度
  cw = clamp(width * 0.18, 200, 320);

  // 颜色面板高度
  COLOR_PANEL_H = clamp(height * 0.22, 160, 230);

  // 网格 cellSize（你可以调整 targetCols）
  const rightW = max(1, width - cw);
  const targetCols = 26;
  const byWidth = rightW / targetCols;
  const byHeight = height / 22;
  cellSize = clamp(min(byWidth, byHeight), 24, 52);

  // 颜色区
  COLOR_MAIN = { x: 0, y: 0, w: cw - 30, h: COLOR_PANEL_H };
  COLOR_HUE = { x: cw - 30, y: 0, w: 30, h: COLOR_PANEL_H };

  // 最近颜色 5 个
  RECENT_RECTS = [];
  const recentCount = 5;
  const padX = 16;
  const gap = 10;
  const rW = clamp((cw - padX * 2 - gap * (recentCount - 1)) / recentCount, 22, 34);
  const rH = rW;
  const recentY = COLOR_PANEL_H + clamp(height * 0.03, 18, 30);
  for (let i = 0; i < recentCount; i++) {
    const x = padX + i * (rW + gap);
    RECENT_RECTS.push({ x, y: recentY, w: rW, h: rH });
  }

  // 功能按钮
  const btnGapX = 12;
  const btnW = (cw - padX * 2 - btnGapX) / 2;
  const btnH = clamp(height * 0.035, 30, 38);
  const funcY1 = recentY + rH + clamp(height * 0.02, 16, 26);
  const funcY2 = funcY1 + btnH + clamp(height * 0.012, 10, 16);

  FUNC_RECTS = {
    undo:  { x: padX, y: funcY1, w: btnW, h: btnH },
    clear: { x: padX + btnW + btnGapX, y: funcY1, w: btnW, h: btnH },
    grid:  { x: padX, y: funcY2, w: btnW, h: btnH },
    save:  { x: padX + btnW + btnGapX, y: funcY2, w: btnW, h: btnH }
  };

  // 形状按钮：2x5
  SHAPE_RECTS = [];
  const topY = funcY2 + btnH + clamp(height * 0.02, 14, 24);
  const bottomPad = clamp(height * 0.02, 14, 26);
  const availableH = max(1, height - topY - bottomPad);

  const cols = 2;
  const rows = 5;
  const gridGapX = clamp(cw * 0.08, 10, 16);
  const gridGapY = clamp(height * 0.015, 10, 18);

  const cellW = (cw - padX * 2 - gridGapX) / cols;
  const cellH = (availableH - gridGapY * (rows - 1)) / rows;
  const size = clamp(min(cellW, cellH), 56, 86);

  const col1x = padX + (cellW - size) / 2;
  const col2x = padX + cellW + gridGapX + (cellW - size) / 2;

  for (let row = 0; row < rows; row++) {
    const y = topY + row * (size + gridGapY);
    SHAPE_RECTS.push({ x: col1x, y, w: size, h: size });
    SHAPE_RECTS.push({ x: col2x, y, w: size, h: size });
  }
}

// =================== 预加载资源 ===================
function preload() {
  for (let i = 0; i < icons.length; i++) {
    icons[i] = loadImage("assets/" + i + ".png");
  }
  for (let i = 0; i < svgs.length; i++) {
    svgs[i] = loadImage("svg/" + (i + 1) + ".svg?v=10");
  }
}

// ------------------- 计算 SVG 的非透明区域 -------------------
function computeSvgBounds(index) {
  const img = svgs[index];
  if (!img) return;

  const sampleW = 256;
  const sampleH = 256;

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
    let x1 = x0 + w;
    let y1 = y0 + h;
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

// =================== 颜色面板构建 ===================
function buildHueGraphic() {
  hueGraphic = createGraphics(COLOR_HUE.w, COLOR_HUE.h);
  hueGraphic.colorMode(HSB, 360, 100, 100);
  hueGraphic.noStroke();
  hueGraphic.loadPixels();
  for (let y = 0; y < COLOR_HUE.h; y++) {
    let h = map(y, 0, COLOR_HUE.h - 1, 0, 360);
    let c = hueGraphic.color(h, 100, 100);
    for (let x = 0; x < COLOR_HUE.w; x++) {
      let idx = (y * COLOR_HUE.w + x) * 4;
      hueGraphic.pixels[idx]     = red(c);
      hueGraphic.pixels[idx + 1] = green(c);
      hueGraphic.pixels[idx + 2] = blue(c);
      hueGraphic.pixels[idx + 3] = 255;
    }
  }
  hueGraphic.updatePixels();
}

function buildSBGraphic() {
  sbGraphic = createGraphics(COLOR_MAIN.w, COLOR_MAIN.h);
  sbGraphic.colorMode(HSB, 360, 100, 100);
  sbGraphic.noStroke();
  sbGraphic.loadPixels();
  for (let y = 0; y < COLOR_MAIN.h; y++) {
    for (let x = 0; x < COLOR_MAIN.w; x++) {
      let sVal = map(x, 0, COLOR_MAIN.w - 1, 0, 100);
      let bVal = map(y, 0, COLOR_MAIN.h - 1, 100, 0);
      let c = sbGraphic.color(hue, sVal, bVal);
      let idx = (y * COLOR_MAIN.w + x) * 4;
      sbGraphic.pixels[idx]     = red(c);
      sbGraphic.pixels[idx + 1] = green(c);
      sbGraphic.pixels[idx + 2] = blue(c);
      sbGraphic.pixels[idx + 3] = 255;
    }
  }
  sbGraphic.updatePixels();
}

// =================== UI 布局 ===================
function layoutUI() {
  computeLayout();
  buildHueGraphic();
  buildSBGraphic();

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

// =================== setup ===================
function setup() {
  createCanvas(windowWidth, windowHeight);
  currentColor = color("#482BCC");
  recentColors = defaultRecentHex.map(h => color(h));
  layoutUI();
  for (let i = 0; i < svgs.length; i++) computeSvgBounds(i);
}

// 窗口变化：重算布局
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  layoutUI();
}

// =================== draw ===================
function draw() {
  background(240);

  // 右侧画布区域
  push();
  translate(cw, 0);
  if (showGrid) drawGrid();
  drawShapes();
  if (selectedIndex >= 0 && selectedIndex < shapes.length) {
    drawSelectionOutline(shapes[selectedIndex]);
  }
  if (isDragging) drawPreview();
  pop();

  // 左侧背景
  noStroke();
  fill("#1F1E24");
  rect(0, 0, cw, height);

  drawColorPanel();
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

function drawPreview() {
  let end = dragEnd.copy();
  if (keyIsDown(SHIFT)) {
    end = lockAspectByShift(dragStart, end);
  }

  const r = getNormalizedDragRect(dragStart, end);

  const x = r.x * cellSize;
  const y = r.y * cellSize;
  const w = r.w * cellSize;
  const h = r.h * cellSize;

  const fillCol = color(red(currentColor), green(currentColor), blue(currentColor), 80);

  push();
  stroke(currentColor);
  strokeWeight(3);
  fill(fillCol);

  switch (currentShape) {
    case 0:
      rect(x, y, w, h);
      break;
    case 1:
      ellipse(x + w / 2, y + h / 2, w, h);
      break;
    case 2:
      triangle(x + w / 2, y, x, y + h, x + w, y + h);
      break;
    case 3:
      drawParallelogramPreview(x, y, w, h);
      break;
    default:
      drawSvgShape(currentShape, x, y, w, h, fillCol);
      break;
  }
  pop();
}

function addNewShape() {
  let end = dragEnd.copy();
  if (keyIsDown(SHIFT)) {
    end = lockAspectByShift(dragStart, end);
  }
  const r = getNormalizedDragRect(dragStart, end);
  shapes.push(new Shape(r.x, r.y, r.w, r.h, currentShape, currentColor));
  undoStack = [];
}

// =================== 颜色面板绘制 ===================
function drawColorPanel() {
  imageMode(CORNER);
  image(sbGraphic, COLOR_MAIN.x, COLOR_MAIN.y);
  image(hueGraphic, COLOR_HUE.x, COLOR_HUE.y);

  let huePosY = map(hue, 0, 360, 0, COLOR_HUE.h);
  stroke(255);
  strokeWeight(2);
  let hx = COLOR_HUE.x;
  let hy = COLOR_HUE.y + huePosY;
  line(hx - 4, hy, hx, hy);
  line(hx + COLOR_HUE.w, hy, hx + COLOR_HUE.w + 4, hy);
}

function drawRecentColors() {
  for (let i = 0; i < RECENT_RECTS.length; i++) {
    const r = RECENT_RECTS[i];
    stroke(40);
    strokeWeight(1);
    fill(recentColors[i] || color(0));
    rect(r.x, r.y, r.w, r.h, 6);

    if (recentColors[i] && colorsEqual(recentColors[i], currentColor)) {
      noFill();
      stroke(255);
      strokeWeight(2);
      rect(r.x - 3, r.y - 3, r.w + 6, r.h + 6, 8);
    }
  }
}

// =================== 颜色交互 ===================
function handleColorClick() {
  // S/B
  if (mouseX >= COLOR_MAIN.x && mouseX <= COLOR_MAIN.x + COLOR_MAIN.w &&
      mouseY >= COLOR_MAIN.y && mouseY <= COLOR_MAIN.y + COLOR_MAIN.h) {
    let sx = constrain(mouseX, COLOR_MAIN.x, COLOR_MAIN.x + COLOR_MAIN.w);
    let sy = constrain(mouseY, COLOR_MAIN.y, COLOR_MAIN.y + COLOR_MAIN.h);
    sat = map(sx, COLOR_MAIN.x, COLOR_MAIN.x + COLOR_MAIN.w, 0, 100);
    bri = map(sy, COLOR_MAIN.y, COLOR_MAIN.y + COLOR_MAIN.h, 100, 0);
    updateCurrentColor();
    return true;
  }

  // Hue
  if (mouseX >= COLOR_HUE.x && mouseX <= COLOR_HUE.x + COLOR_HUE.w &&
      mouseY >= COLOR_HUE.y && mouseY <= COLOR_HUE.y + COLOR_HUE.h) {
    let hy = constrain(mouseY, COLOR_HUE.y, COLOR_HUE.y + COLOR_HUE.h);
    hue = map(hy, COLOR_HUE.y, COLOR_HUE.y + COLOR_HUE.h, 0, 360);
    buildSBGraphic();
    updateCurrentColor();
    return true;
  }

  // Recent
  for (let i = 0; i < RECENT_RECTS.length; i++) {
    const r = RECENT_RECTS[i];
    if (mouseX >= r.x && mouseX <= r.x + r.w &&
        mouseY >= r.y && mouseY <= r.y + r.h) {
      if (recentColors[i]) {
        currentColor = color(recentColors[i]);
        addRecentColor(currentColor);
      }
      return true;
    }
  }
  return false;
}

function updateCurrentColor() {
  push();
  colorMode(HSB, 360, 100, 100);
  currentColor = color(hue, sat, bri);
  pop();
  addRecentColor(currentColor);
}

function addRecentColor(c) {
  let nc = color(c);
  recentColors = recentColors.filter(rc => !colorsEqual(rc, nc));
  recentColors.unshift(nc);
  if (recentColors.length > 5) recentColors.length = 5;
}

function colorsEqual(c1, c2) {
  return red(c1) === red(c2) &&
         green(c1) === green(c2) &&
         blue(c1) === blue(c2);
}

// =================== 鼠标交互（绘制 / 选中 / 移动） ===================
function mousePressed() {
  // 右侧区域
  if (mouseX > cw && mouseY >= 0 && mouseY <= height) {
    const { gx, gy } = mouseToGrid();

    // 点击命中图形 -> 选中并进入移动
    const hit = hitTestShape(gx, gy);
    if (hit >= 0) {
      selectedIndex = hit;
      isMoving = true;
      moveStartGrid = { x: gx, y: gy };
      moveOrigXY = { x: shapes[hit].x, y: shapes[hit].y };
      return;
    }

    // 点击空白 -> 取消选中并开始绘制新图形
    selectedIndex = -1;
    isDragging = true;
    dragStart = createVector(gx, gy);
    dragEnd = dragStart.copy();
    return;
  }

  // 左侧：功能按钮
  if (undoButton.hover()) { undo(); return; }
  if (clearButton.hover()) { clearShapes(); return; }
  if (gridButton.hover()) { showGrid = !showGrid; return; }
  if (saveButton.hover()) { saveCanvas("paper-grid-drawing", "png"); return; }

  // 颜色面板
  if (handleColorClick()) return;

  // 图形按钮
  for (let b of buttons) b.click();
}

function mouseDragged() {
  // 移动选中图形
  if (isMoving && selectedIndex >= 0 && selectedIndex < shapes.length) {
    const { gx, gy } = mouseToGrid();
    const dx = gx - moveStartGrid.x;
    const dy = gy - moveStartGrid.y;

    shapes[selectedIndex].x = moveOrigXY.x + dx;
    shapes[selectedIndex].y = moveOrigXY.y + dy;

    // 可选：防止移动到负坐标（至少不出上/左边界）
    shapes[selectedIndex].x = max(0, shapes[selectedIndex].x);
    shapes[selectedIndex].y = max(0, shapes[selectedIndex].y);
    return;
  }

  // 绘制新图形（不限制方向 -> 支持四向）
  if (isDragging) {
    const { gx, gy } = mouseToGrid();
    dragEnd = createVector(gx, gy);
  }
}

function mouseReleased() {
  if (isMoving) {
    isMoving = false;
    moveStartGrid = null;
    moveOrigXY = null;
    return;
  }

  if (isDragging) {
    isDragging = false;
    addNewShape();
  }
}

// =================== 撤销 / 清空 ===================
function undo() {
  if (shapes.length > 0) {
    // 如果删除/移动也要可撤销，需要更复杂的 action 栈
    // 当前保持你原来的“撤销新增”的模型
    undoStack.push(shapes.pop());
    if (selectedIndex >= shapes.length) selectedIndex = -1;
  }
}

function redo() {
  if (undoStack.length > 0) {
    shapes.push(undoStack.pop());
  }
}

function clearShapes() {
  shapes = [];
  undoStack = [];
  selectedIndex = -1;
}

// =================== Shape 类 ===================
class Shape {
  constructor(x, y, w, h, type, c) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.type = type;
    this.c = color(c);
  }

  display() {
    push();
    fill(this.c);
    noStroke();

    let px = this.x * cellSize;
    let py = this.y * cellSize;
    let pw = this.w * cellSize;
    let ph = this.h * cellSize;

    switch (this.type) {
      case 0:
        rect(px, py, pw, ph);
        break;
      case 1:
        ellipse(px + pw / 2, py + ph / 2, pw, ph);
        break;
      case 2:
        triangle(px + pw / 2, py, px, py + ph, px + pw, py + ph);
        break;
      case 3:
        drawParallelogram(px, py, pw, ph);
        break;
      default:
        drawSvgShape(this.type, px, py, pw, ph, this.c);
        break;
    }

    pop();
  }
}

// 平行四边形
function drawParallelogram(x, y, w, h) {
  beginShape();
  vertex(x + w / 4, y);
  vertex(x + w, y);
  vertex(x + (3 * w) / 4, y + h);
  vertex(x, y + h);
  endShape(CLOSE);
}

function drawParallelogramPreview(x, y, w, h) {
  beginShape();
  vertex(x + w / 4, y);
  vertex(x + w, y);
  vertex(x + (3 * w) / 4, y + h);
  vertex(x, y + h);
  endShape(CLOSE);
}

// SVG 形状
function drawSvgShape(type, x, y, w, h, col) {
  let idx = type - 4;
  if (idx < 0 || idx >= svgs.length) return;
  const img = svgs[idx];
  if (!img) return;

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

  push();
  if (col) tint(col);
  else tint(255);
  image(img, x, y, w, h, sx, sy, sw, sh);
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

// =================== 键盘快捷键（删除/撤销/重做） ===================
function keyPressed() {
  // Delete / Backspace 删除选中
  if ((keyCode === BACKSPACE || keyCode === DELETE) && selectedIndex >= 0) {
    shapes.splice(selectedIndex, 1);
    selectedIndex = -1;
    return false; // 防止浏览器后退等默认行为
  }

  // 兼容：Z/Y 快捷键
  if (key === "z" || key === "Z") undo();
  if (key === "y" || key === "Y") redo();
}
