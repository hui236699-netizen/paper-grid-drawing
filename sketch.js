// =================== 全局设置（响应式 + AI式拖拽 + 选中移动） ===================

let cw = 240;
let cellSize = 36;

let dragStart, dragEnd;
let isDragging = false;   // 正在画新图形
let isMoving = false;     // 正在移动选中图形

let currentShape = 0;
let currentColor;

let shapes = [];
let undoStack = [];
let showGrid = true;

// 选中/移动
let selectedIndex = -1;
let moveStartGrid = null;
let moveOrigXY = null;

// 资源
let icons = new Array(10);
let buttons = new Array(10);
let svgs = new Array(8);
let svgBounds = new Array(8).fill(null);

// 颜色：HSV
let hue = 220;
let sat = 100;
let bri = 80;

// 动态布局
let COLOR_PANEL_H = 190;
let COLOR_MAIN, COLOR_HUE;
let RECENT_RECTS = [];
let FUNC_RECTS = {};
let SHAPE_RECTS = [];

let sbGraphic, hueGraphic;

const defaultRecentHex = ["#482BCC", "#FF04A5", "#FFE900", "#8CE255", "#8EC8EC"];
let recentColors = [];

let undoButton, clearButton, gridButton, saveButton;

// =================== 工具函数 ===================
function clamp(v, lo, hi) {
  return max(lo, min(hi, v));
}

function sign1(v) {
  return v >= 0 ? 1 : -1;
}

// 鼠标 -> 网格坐标（AI手感更稳：floor）
function mouseToGrid() {
  const gx = floor((mouseX - cw) / cellSize);
  const gy = floor(mouseY / cellSize);
  return { gx, gy };
}

/**
 * AI矩形工具核心（角点到角点），允许负宽高：
 * x = sx, y = sy, w = ex - sx, h = ey - sy
 *
 * Shift：锁比例 |w| == |h|，方向符号保留
 * Alt：从中心扩张（AI 的 Option 行为）
 */
function getAIBoxGrid(start, end, useCenter, lockAspect) {
  let sx = start.x, sy = start.y;
  let ex = end.x, ey = end.y;

  let w = ex - sx;
  let h = ey - sy;

  // Alt/Option：中心扩张（start 是中心）
  if (useCenter) {
    // 让 w/h 表示“半径方向”的位移，然后生成左右/上下对称的框
    // 这里 w/h 仍然保留符号用于方向（仅影响 Shift 的符号一致性）
    // 实际框用 halfW/halfH 的 abs。
    let halfW = abs(w);
    let halfH = abs(h);

    if (lockAspect) {
      const m = max(halfW, halfH);
      halfW = m;
      halfH = m;
    }

    return {
      x: sx - halfW,
      y: sy - halfH,
      w: 2 * halfW,
      h: 2 * halfH
    };
  }

  // Shift：锁比例（角点模式）
  if (lockAspect) {
    const size = max(abs(w), abs(h));
    w = sign1(w) * size;
    h = sign1(h) * size;
  }

  return { x: sx, y: sy, w, h };
}

// 把网格盒子转成像素盒子
function gridBoxToPixel(box) {
  return {
    x: box.x * cellSize,
    y: box.y * cellSize,
    w: box.w * cellSize,
    h: box.h * cellSize
  };
}

// 命中最上层图形（从后往前）
function hitTestShape(gx, gy) {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i];
    const x0 = s.x;
    const y0 = s.y;
    const x1 = s.x + s.w; // 注意：这里 w/h 存储为正数（Shape 内部统一正）
    const y1 = s.y + s.h;

    if (gx >= x0 && gx < x1 && gy >= y0 && gy < y1) return i;
  }
  return -1;
}

// 选中框
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

// 将 AI box（可能负宽高）转换为 Shape 的“统一正向存储”
function normalizeBoxToShape(box) {
  let x = box.x;
  let y = box.y;
  let w = box.w;
  let h = box.h;

  // 统一：Shape 存 w/h 为正数，并把 x/y 调整到左上角
  if (w < 0) { x = x + w; w = -w; }
  if (h < 0) { y = y + h; h = -h; }

  // 至少 1 格（避免 0）
  w = max(1, w);
  h = max(1, h);

  return { x, y, w, h };
}

// =================== 响应式布局 ===================
function computeLayout() {
  cw = clamp(width * 0.18, 200, 320);

  COLOR_PANEL_H = clamp(height * 0.22, 160, 230);

  const rightW = max(1, width - cw);
  const targetCols = 26;
  const byWidth = rightW / targetCols;
  const byHeight = height / 22;
  cellSize = clamp(min(byWidth, byHeight), 24, 52);

  COLOR_MAIN = { x: 0, y: 0, w: cw - 30, h: COLOR_PANEL_H };
  COLOR_HUE = { x: cw - 30, y: 0, w: 30, h: COLOR_PANEL_H };

  // Recent colors
  RECENT_RECTS = [];
  const recentCount = 5;
  const padX = 16;
  const gap = 10;
  const rW = clamp((cw - padX * 2 - gap * (recentCount - 1)) / recentCount, 22, 34);
  const recentY = COLOR_PANEL_H + clamp(height * 0.03, 18, 30);
  for (let i = 0; i < recentCount; i++) {
    RECENT_RECTS.push({ x: padX + i * (rW + gap), y: recentY, w: rW, h: rW });
  }

  // Func buttons
  const btnGapX = 12;
  const btnW = (cw - padX * 2 - btnGapX) / 2;
  const btnH = clamp(height * 0.035, 30, 38);
  const funcY1 = recentY + rW + clamp(height * 0.02, 16, 26);
  const funcY2 = funcY1 + btnH + clamp(height * 0.012, 10, 16);

  FUNC_RECTS = {
    undo:  { x: padX, y: funcY1, w: btnW, h: btnH },
    clear: { x: padX + btnW + btnGapX, y: funcY1, w: btnW, h: btnH },
    grid:  { x: padX, y: funcY2, w: btnW, h: btnH },
    save:  { x: padX + btnW + btnGapX, y: funcY2, w: btnW, h: btnH }
  };

  // Shape buttons 2x5
  SHAPE_RECTS = [];
  const topY = funcY2 + btnH + clamp(height * 0.02, 14, 24);
  const bottomPad = clamp(height * 0.02, 14, 26);
  const availableH = max(1, height - topY - bottomPad);

  const cols = 2, rows = 5;
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

// =================== 预加载 ===================
function preload() {
  for (let i = 0; i < icons.length; i++) icons[i] = loadImage("assets/" + i + ".png");
  for (let i = 0; i < svgs.length; i++) svgs[i] = loadImage("svg/" + (i + 1) + ".svg?v=10");
}

// =================== SVG bounds ===================
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

// =================== Color graphics ===================
function buildHueGraphic() {
  hueGraphic = createGraphics(COLOR_HUE.w, COLOR_HUE.h);
  hueGraphic.colorMode(HSB, 360, 100, 100);
  hueGraphic.noStroke();
  hueGraphic.loadPixels();

  for (let y = 0; y < COLOR_HUE.h; y++) {
    let hh = map(y, 0, COLOR_HUE.h - 1, 0, 360);
    let c = hueGraphic.color(hh, 100, 100);
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

// =================== UI layout ===================
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

// =================== setup / resize ===================
function setup() {
  createCanvas(windowWidth, windowHeight);
  currentColor = color("#482BCC");
  recentColors = defaultRecentHex.map(h => color(h));
  layoutUI();
  for (let i = 0; i < svgs.length; i++) computeSvgBounds(i);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  layoutUI();
}

// =================== draw ===================
function draw() {
  background(240);

  // 右侧
  push();
  translate(cw, 0);
  if (showGrid) drawGrid();
  drawShapes();

  if (selectedIndex >= 0 && selectedIndex < shapes.length) {
    drawSelectionOutline(shapes[selectedIndex]);
  }

  if (isDragging) drawPreview();
  pop();

  // 左侧
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

// =================== grid / shapes ===================
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

// 预览：半透明填充 + 实线边框（AI式：负宽高）
function drawPreview() {
  const useCenter = keyIsDown(ALT);         // Option/Alt：中心扩张
  const lockAspect = keyIsDown(SHIFT);      // Shift：锁比例

  const box = getAIBoxGrid(dragStart, dragEnd, useCenter, lockAspect);
  const px = gridBoxToPixel(box);

  const previewFill = color(red(currentColor), green(currentColor), blue(currentColor), 80);

  push();
  stroke(currentColor);
  strokeWeight(3);
  fill(previewFill);

  switch (currentShape) {
    case 0:
      rect(px.x, px.y, px.w, px.h);
      break;
    case 1:
      // ellipse 不接受负宽高，所以用 abs + 中心点
      ellipse(px.x + px.w / 2, px.y + px.h / 2, abs(px.w), abs(px.h));
      break;
    case 2:
      // triangle：用“包围盒”方式（负宽高也能表现一致）
      drawTriFromBox(px.x, px.y, px.w, px.h);
      break;
    case 3:
      drawParaFromBox(px.x, px.y, px.w, px.h, true);
      break;
    default:
      // SVG：不直接用负宽高裁切，先归一化成正盒子再画
      const norm = normalizeBoxToShape(box);
      drawSvgShape(currentShape, norm.x * cellSize, norm.y * cellSize, norm.w * cellSize, norm.h * cellSize, previewFill);
      break;
  }

  pop();
}

function addNewShape() {
  const useCenter = keyIsDown(ALT);
  const lockAspect = keyIsDown(SHIFT);

  const box = getAIBoxGrid(dragStart, dragEnd, useCenter, lockAspect);
  const norm = normalizeBoxToShape(box);
  shapes.push(new Shape(norm.x, norm.y, norm.w, norm.h, currentShape, currentColor));
  undoStack = [];
}

// =================== 颜色面板 ===================
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

// =================== 鼠标交互（选中移动 / AI式绘制） ===================
function mousePressed() {
  // 右侧画布区
  if (mouseX > cw && mouseY >= 0 && mouseY <= height) {
    const { gx, gy } = mouseToGrid();

    const hit = hitTestShape(gx, gy);
    if (hit >= 0) {
      selectedIndex = hit;
      isMoving = true;
      moveStartGrid = { x: gx, y: gy };
      moveOrigXY = { x: shapes[hit].x, y: shapes[hit].y };
      return;
    }

    selectedIndex = -1;

    isDragging = true;
    dragStart = createVector(gx, gy);   // AI：第一个角
    dragEnd = dragStart.copy();
    return;
  }

  // 左侧按钮
  if (undoButton.hover()) { undo(); return; }
  if (clearButton.hover()) { clearShapes(); return; }
  if (gridButton.hover()) { showGrid = !showGrid; return; }
  if (saveButton.hover()) { saveCanvas("paper-grid-drawing", "png"); return; }

  if (handleColorClick()) return;

  for (let b of buttons) b.click();
}

function mouseDragged() {
  if (isMoving && selectedIndex >= 0 && selectedIndex < shapes.length) {
    const { gx, gy } = mouseToGrid();
    const dx = gx - moveStartGrid.x;
    const dy = gy - moveStartGrid.y;

    shapes[selectedIndex].x = max(0, moveOrigXY.x + dx);
    shapes[selectedIndex].y = max(0, moveOrigXY.y + dy);
    return;
  }

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
    undoStack.push(shapes.pop());
    if (selectedIndex >= shapes.length) selectedIndex = -1;
  }
}

function redo() {
  if (undoStack.length > 0) shapes.push(undoStack.pop());
}

function clearShapes() {
  shapes = [];
  undoStack = [];
  selectedIndex = -1;
}

// =================== Shape 类（内部统一正 w/h） ===================
class Shape {
  constructor(x, y, w, h, type, c) {
    this.x = x;
    this.y = y;
    this.w = max(1, w);
    this.h = max(1, h);
    this.type = type;
    this.c = color(c);
  }

  display() {
    push();
    fill(this.c);
    noStroke();

    const px = this.x * cellSize;
    const py = this.y * cellSize;
    const pw = this.w * cellSize;
    const ph = this.h * cellSize;

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

// =================== 形状绘制辅助（支持预览负宽高） ===================
function drawTriFromBox(x, y, w, h) {
  // 用包围盒的“真实四角”构造三角形：顶点在上边中点，底边左右角
  const x0 = x;
  const y0 = y;
  const x1 = x + w;
  const y1 = y + h;

  // 让顶点始终在“上边”（符合你当前 triangle 样式）
  // 当 h 为负，y0 > y1，需要交换上/下
  const topY = min(y0, y1);
  const botY = max(y0, y1);
  const leftX = min(x0, x1);
  const rightX = max(x0, x1);
  const midX = (leftX + rightX) / 2;

  triangle(midX, topY, leftX, botY, rightX, botY);
}

function drawParaFromBox(x, y, w, h, preview) {
  // 平行四边形用“正向盒子”绘制，预览保持一致
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

// 平行四边形（正向）
function drawParallelogram(x, y, w, h) {
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

// =================== 键盘 ===================
function keyPressed() {
  // 删除选中
  if ((keyCode === BACKSPACE || keyCode === DELETE) && selectedIndex >= 0) {
    shapes.splice(selectedIndex, 1);
    selectedIndex = -1;
    return false;
  }

  // 兼容：Z/Y
  if (key === "z" || key === "Z") undo();
  if (key === "y" || key === "Y") redo();
}
