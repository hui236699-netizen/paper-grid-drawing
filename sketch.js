// =================== 全局设置（响应式 + AI式拖拽 + Smart Guides + 选中移动） ===================

let cw = 240;
let cellSize = 36;

let dragStart, dragEnd;
let isDragging = false;
let isMoving = false;

let currentShape = 0;
let currentColor;

let shapes = [];
let undoStack = [];
let showGrid = true;

// 选中/移动
let selectedIndex = -1;
let moveStartGrid = null;
let moveOrigXY = null;

// Smart Guides
let smartGuides = true;
let snapThreshold = 0.75; // 单位：网格格数（允许 0.5 线）
let activeGuideX = null;  // 当前吸附的垂直参考线（网格坐标，可为 .5）
let activeGuideY = null;  // 当前吸附的水平参考线（网格坐标，可为 .5）

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

// 鼠标 -> 网格坐标（更稳：floor）
function mouseToGrid() {
  const gx = floor((mouseX - cw) / cellSize);
  const gy = floor(mouseY / cellSize);
  return { gx, gy };
}

/**
 * AI矩形工具核心（角点到角点），允许负宽高
 * Shift：锁比例
 * Alt：中心扩张
 */
function getAIBoxGrid(start, end, useCenter, lockAspect) {
  let sx = start.x, sy = start.y;
  let ex = end.x, ey = end.y;

  let w = ex - sx;
  let h = ey - sy;

  if (useCenter) {
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

  if (lockAspect) {
    const size = max(abs(w), abs(h));
    w = sign1(w) * size;
    h = sign1(h) * size;
  }

  return { x: sx, y: sy, w, h };
}

function gridBoxToPixel(box) {
  return {
    x: box.x * cellSize,
    y: box.y * cellSize,
    w: box.w * cellSize,
    h: box.h * cellSize
  };
}

// 统一 Shape 存储为正 w/h
function normalizeBoxToShape(box) {
  let x = box.x;
  let y = box.y;
  let w = box.w;
  let h = box.h;

  if (w < 0) { x = x + w; w = -w; }
  if (h < 0) { y = y + h; h = -h; }

  w = max(1, w);
  h = max(1, h);

  return { x, y, w, h };
}

// 命中图形（Shape 存的是正 w/h）
function hitTestShape(gx, gy) {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i];
    const x0 = s.x;
    const y0 = s.y;
    const x1 = s.x + s.w;
    const y1 = s.y + s.h;

    if (gx >= x0 && gx < x1 && gy >= y0 && gy < y1) return i;
  }
  return -1;
}

// =================== Smart Guides（吸附 + 提示线） ===================
function getGuideLines(excludeIndex) {
  const xLines = [];
  const yLines = [];

  for (let i = 0; i < shapes.length; i++) {
    if (i === excludeIndex) continue;
    const s = shapes[i];

    const left = s.x;
    const right = s.x + s.w;
    const cx = s.x + s.w / 2;

    const top = s.y;
    const bottom = s.y + s.h;
    const cy = s.y + s.h / 2;

    xLines.push(left, cx, right);
    yLines.push(top, cy, bottom);
  }

  return { xLines, yLines };
}

function boxEdgesCenter(box) {
  const left = min(box.x, box.x + box.w);
  const right = max(box.x, box.x + box.w);
  const top = min(box.y, box.y + box.h);
  const bottom = max(box.y, box.y + box.h);
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  return { left, right, top, bottom, cx, cy };
}

function bestSnapDelta(currentLines, targetLines, threshold) {
  let best = null;
  for (let i = 0; i < currentLines.length; i++) {
    const cl = currentLines[i];
    for (let j = 0; j < targetLines.length; j++) {
      const tl = targetLines[j];
      const d = tl - cl;
      if (abs(d) <= threshold) {
        if (best === null || abs(d) < abs(best.delta)) {
          best = { delta: d, target: tl };
        }
      }
    }
  }
  return best;
}

// 将 box 整体平移吸附到其它 shape 的边/中心（不改变 w/h）
function applySmartGuidesToBox(box, excludeIndex) {
  activeGuideX = null;
  activeGuideY = null;

  if (!smartGuides || shapes.length === 0) return box;

  const { xLines, yLines } = getGuideLines(excludeIndex);
  if (xLines.length === 0 && yLines.length === 0) return box;

  const ec = boxEdgesCenter(box);

  const snapX = bestSnapDelta([ec.left, ec.cx, ec.right], xLines, snapThreshold);
  const snapY = bestSnapDelta([ec.top, ec.cy, ec.bottom], yLines, snapThreshold);

  const out = { x: box.x, y: box.y, w: box.w, h: box.h };

  if (snapX) {
    out.x += snapX.delta;
    activeGuideX = snapX.target;
  }
  if (snapY) {
    out.y += snapY.delta;
    activeGuideY = snapY.target;
  }

  return out;
}

function drawGuides() {
  if (!smartGuides) return;
  if (activeGuideX === null && activeGuideY === null) return;

  const w = width - cw;
  const h = height;

  push();
  strokeWeight(1.5);
  stroke(255, 0, 200, 200); // 类似 AI 的洋红参考线

  if (activeGuideX !== null) {
    const x = activeGuideX * cellSize;
    line(x, 0, x, h);
  }
  if (activeGuideY !== null) {
    const y = activeGuideY * cellSize;
    line(0, y, w, y);
  }
  pop();
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

// =================== 颜色贴图 ===================
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

  // 高清：让大图边缘更顺
  pixelDensity(window.devicePixelRatio || 1);
  smooth();

  currentColor = color("#482BCC");
  recentColors = defaultRecentHex.map(h => color(h));
  layoutUI();
  for (let i = 0; i < svgs.length; i++) computeSvgBounds(i);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);

  pixelDensity(window.devicePixelRatio || 1);
  smooth();

  layoutUI();
}

// =================== draw ===================
function draw() {
  background(240);

  // 右侧画布区
  push();
  translate(cw, 0);

  if (showGrid) drawGrid();

  drawShapes();

  // 你要求：选中移动时不要黑色边框
  // 所以这里不画任何选中框

  if (isDragging) drawPreview();

  // Smart Guides 提示线
  drawGuides();

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

// =================== 网格 / 图形 ===================
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

// =================== 预览（AI式拖拽 + Smart Guides） ===================
function drawPreview() {
  const useCenter = keyIsDown(ALT);
  const lockAspect = keyIsDown(SHIFT);

  let box = getAIBoxGrid(dragStart, dragEnd, useCenter, lockAspect);

  // 预览时做 Smart Guides（排除无：-1）
  box = applySmartGuidesToBox(box, -1);

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
      ellipse(px.x + px.w / 2, px.y + px.h / 2, abs(px.w), abs(px.h));
      break;
    case 2:
      drawTriFromBox(px.x, px.y, px.w, px.h);
      break;
    case 3:
      drawParaFromBox(px.x, px.y, px.w, px.h);
      break;
    default: {
      const norm = normalizeBoxToShape(box);
      drawSvgShape(currentShape, norm.x * cellSize, norm.y * cellSize, norm.w * cellSize, norm.h * cellSize, previewFill);
      break;
    }
  }

  pop();
}

function addNewShape() {
  const useCenter = keyIsDown(ALT);
  const lockAspect = keyIsDown(SHIFT);

  let box = getAIBoxGrid(dragStart, dragEnd, useCenter, lockAspect);

  // 落笔最终也吸附（保证预览=最终）
  box = applySmartGuidesToBox(box, -1);

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
  if (mouseX >= COLOR_MAIN.x && mouseX <= COLOR_MAIN.x + COLOR_MAIN.w &&
      mouseY >= COLOR_MAIN.y && mouseY <= COLOR_MAIN.y + COLOR_MAIN.h) {
    let sx = constrain(mouseX, COLOR_MAIN.x, COLOR_MAIN.x + COLOR_MAIN.w);
    let sy = constrain(mouseY, COLOR_MAIN.y, COLOR_MAIN.y + COLOR_MAIN.h);
    sat = map(sx, COLOR_MAIN.x, COLOR_MAIN.x + COLOR_MAIN.w, 0, 100);
    bri = map(sy, COLOR_MAIN.y, COLOR_MAIN.y + COLOR_MAIN.h, 100, 0);
    updateCurrentColor();
    return true;
  }

  if (mouseX >= COLOR_HUE.x && mouseX <= COLOR_HUE.x + COLOR_HUE.w &&
      mouseY >= COLOR_HUE.y && mouseY <= COLOR_HUE.y + COLOR_HUE.h) {
    let hy = constrain(mouseY, COLOR_HUE.y, COLOR_HUE.y + COLOR_HUE.h);
    hue = map(hy, COLOR_HUE.y, COLOR_HUE.y + COLOR_HUE.h, 0, 360);
    buildSBGraphic();
    updateCurrentColor();
    return true;
  }

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

// =================== 鼠标交互（选中移动 + Smart Guides） ===================
function mousePressed() {
  // 右侧区域
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
    dragStart = createVector(gx, gy);
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

    // 先得到“提议位置”
    let nx = max(0, moveOrigXY.x + dx);
    let ny = max(0, moveOrigXY.y + dy);

    // 对移动也做 Smart Guides：把选中 shape 当作 box，整体平移吸附
    const s = shapes[selectedIndex];
    let box = { x: nx, y: ny, w: s.w, h: s.h };
    box = applySmartGuidesToBox(box, selectedIndex);

    // 再应用回去（shape 存正 w/h）
    shapes[selectedIndex].x = max(0, box.x);
    shapes[selectedIndex].y = max(0, box.y);
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
    activeGuideX = null;
    activeGuideY = null;
    return;
  }

  if (isDragging) {
    isDragging = false;
    addNewShape();
    activeGuideX = null;
    activeGuideY = null;
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
  activeGuideX = null;
  activeGuideY = null;
}

// =================== Shape ===================
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

// =================== 形状绘制辅助 ===================
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

function drawParallelogram(x, y, w, h) {
  beginShape();
  vertex(x + w / 4, y);
  vertex(x + w, y);
  vertex(x + (3 * w) / 4, y + h);
  vertex(x, y + h);
  endShape(CLOSE);
}

// SVG 形状（提升大尺寸绘制平滑度）
function drawSvgShape(type, x, y, w, h, col) {
  let idx = type - 4;
  if (idx < 0 || idx >= svgs.length) return;
  const img = svgs[idx];
  if (!img) return;

  // 高质量平滑（对大尺寸边缘锯齿有帮助）
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

  push();
  if (col) tint(col);
  else tint(255);
  image(img, x, y, w, h, sx, sy, sw, sh);
  noTint();
  pop();
}

// =================== 左侧按钮 ===================
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
  if ((keyCode === BACKSPACE || keyCode === DELETE) && selectedIndex >= 0) {
    shapes.splice(selectedIndex, 1);
    selectedIndex = -1;
    activeGuideX = null;
    activeGuideY = null;
    return false;
  }

  if (key === "z" || key === "Z") undo();
  if (key === "y" || key === "Y") redo();

  // 可选：G 切换 Smart Guides
  if (key === "g" || key === "G") {
    smartGuides = !smartGuides;
    activeGuideX = null;
    activeGuideY = null;
  }
}
