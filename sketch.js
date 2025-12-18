// =================== 代码优化（修复漂移和选区框功能） ===================

let cw = 240;
let cellSize = 36;

let dragAnchor;          // ✅ 角点锚点（grid int）
let dragEndFloat;        // ✅ 当前鼠标（grid float）
let isDragging = false;  // 画新图
let isMoving = false;    // 移动选中图形
let isResizing = false;  // 缩放选中图形
let isRotating = false;  // 旋转选中图形

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

let resizeAnchor = null;  // 用于缩放操作的锚点

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
  const deadPx = 10;
  const eps = deadPx / cellSize;

  if (dx > eps) dragSignX = 1;
  else if (dx < -eps) dragSignX = -1;

  if (dy > eps) dragSignY = 1;
  else if (dy < -eps) dragSignY = -1;
}

// =================== 核心：选区框及缩放 ===================
function getDragBoxSigned(lockAspect) {
  const ax = dragAnchor.x;
  const ay = dragAnchor.y;

  const mx = dragEndFloat.x;
  const my = dragEndFloat.y;

  const dx = mx - ax;
  const dy = my - ay;

  updateDragSigns(dx, dy);

  let lenX = max(1, floor(abs(dx)));
  let lenY = max(1, floor(abs(dy)));

  if (lockAspect) {
    const s = max(lenX, lenY);
    lenX = s;
    lenY = s;
  }

  let w = dragSignX * lenX;
  let h = dragSignY * lenY;

  const cols = gridCols();
  const rows = gridRows();

  if (w > 0) w = min(w, cols - ax);
  else w = max(w, -ax);

  if (h > 0) h = min(h, rows - ay);
  else h = max(h, -ay);

  return { ax, ay, w, h };
}

// =================== 形状缩放和旋转处理 ===================
function resizeShape() {
  if (selectedIndex >= 0) {
    const s = shapes[selectedIndex];
    const { gx, gy } = mouseToGridInt();

    // 更新图形大小
    if (resizeAnchor) {
      const dx = gx - resizeAnchor.x;
      const dy = gy - resizeAnchor.y;

      s.w += dx;
      s.h += dy;
      s.w = max(1, s.w);
      s.h = max(1, s.h);

      resizeAnchor = { x: gx, y: gy }; // 更新锚点
    }
  }
}

function rotateShape() {
  if (selectedIndex >= 0) {
    const s = shapes[selectedIndex];
    const { gx, gy } = mouseToGridInt();

    const centerX = s.x + s.w / 2;
    const centerY = s.y + s.h / 2;

    const angle = atan2(gy - centerY, gx - centerX);
    s.rotation = angle;
  }
}

// =================== UI布局和功能 ===================
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

// =================== draw ===================
function draw() {
  background(240);
  noTint();

  push();
  translate(cw, 0);

  if (showGrid) drawGrid();
  drawShapes();

  if (isDragging) drawPreview(); 

  pop();

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

  shapes.push(new Shape(box.ax, box.ay, box.w, box.h, currentShape, currentColor));
  clearRedo();
}

// =================== 鼠标交互 ===================
function mousePressed() {
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

    isDragging = true;
    dragAnchor = createVector(gx, gy);

    dragSignX = 1;
    dragSignY = 1;

    const f = mouseToGridFloat();
    dragEndFloat = createVector(f.gx, f.gy);
  }
}

function mouseDragged() {
  if (isColorDragging) {
    updateColorByMouse();
    return;
  }

  // 移动：严格按格子 + 不出界
  if (isMoving && selectedIndex >= 0 && selectedIndex < shapes.length) {
    const { gx, gy } = mouseToGridInt();
    const dx = gx - moveStartGrid.x;
    const dy = gy - moveStartGrid.y;
    if (dx !== 0 || dy !== 0) moveDidChange = true;

    const s = shapes[selectedIndex];
    const cols = gridCols();
    const rows = gridRows();

    let minAx, maxAx;
    if (s.w > 0) { minAx = 0; maxAx = cols - s.w; }
    else { minAx = -s.w; maxAx = cols; }

    let minAy, maxAy;
    if (s.h > 0) { minAy = 0; maxAy = rows - s.h; }
    else { minAy = -s.h; maxAy = rows; }

    let nx = clamp(round(moveOrigXY.x + dx), minAx, maxAx);
    let ny = clamp(round(moveOrigXY.y + dy), minAy, maxAy);

    s.x = nx;
    s.y = ny;
    return;
  }

  if (isResizing) {
    resizeShape();
    return;
  }

  if (isRotating) {
    rotateShape();
    return;
  }

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
    addNewShapeFromDrag();
  }
}
