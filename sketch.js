这是一个非常符合直觉的设计需求。Adobe Illustrator、Figma 和 PPT 确实都是这样做的：**靠近角落是缩放，再往外一点是旋转**。

为了实现这个功能，同时保持“网格吸附”和“45度步进”，我需要对数学逻辑做一点升级。

**核心改动点：**

1. **移除旋转手柄**：不再画那个顶部的“棒棒糖”。
2. **双层感应区**：

   * **内圈（Resize）**：鼠标直接覆盖在角落控制点上 -> 触发缩放。
   * **外圈（Rotate）**：鼠标在角落控制点稍微往外一点的区域 -> 触发旋转。
3. **坐标系转换**：因为图形现在可以旋转，判断鼠标是否点中角落时，我会把鼠标坐标**逆向旋转**回图形的坐标系中判断，这样无论图形转成什么角度，控制点永远准确。
4. **45度吸附**：计算鼠标相对于中心的角度，强制吸附到 `PI/4` (45
5. **移除旋转手柄**：不再画那个顶部的“棒棒糖”。
6. **双层感应区**：

   * **内圈（Resize）**：鼠标直接覆盖在角落控制点上 -> 触发缩放。
   * **外圈（Rotate）**：鼠标在角落控制点稍微往外一点的区域 -> 触发旋转。
7. **坐标系转换**：因为图形现在可以旋转，判断鼠标是否点中角落时，我会把鼠标坐标**逆向旋转**回图形的坐标系中判断，这样无论图形转成什么角度，控制点永远准确。
8. **45度吸附**：计算鼠标相对于中心的角度，强制吸附到 `PI/4` (45度) 的倍数。

以下是完整的、优化后的代码：

```javascript
// =================== 全局设置 ===================

let cw = 240;
let cellSize = 36;

// 交互状态机
const STATE_IDLE = 0;
const STATE_DRAWING = 1;
const STATE_MOVING = 2;   // 移动整个图形
const STATE_RESIZING = 3; // 拖动控制点调整大小
const STATE_ROTATING = 4; // 旋转

let appState = STATE_IDLE;

// 绘制相关
let drawAnchor = null; 
let drawCurrent = null; 

// 选中/变形相关
let selectedIndex = -1;
let transformHandle = null;     // 'nw', 'se', 'rotate_nw' 等
let transformStartShape = null; // 备份
let transformStartMouse = null; // 备份鼠标位置
let transformStartAngle = 0;    // 旋转起始角度

// 图形数据
let currentShape = 0;
let currentColor;
let shapes = [];
let undoStack = [];
let showGrid = true;

// 资源
let icons = new Array(10);
let buttons = new Array(10);
let svgs = new Array(8);
let svgBounds = new Array(8).fill(null);

// 颜色系统
let hue = 220, sat = 100, bri = 80;
let isColorDragging = false;
let colorDragMode = null;
let COLOR_MAIN, COLOR_HUE, RECENT_RECTS = [], FUNC_RECTS = {}, SHAPE_RECTS = [];
let sbGraphic, hueGraphic;
const defaultRecentHex = ["#482BCC", "#FF04A5", "#FFE900", "#8CE255", "#8EC8EC"];
let recentColors = [];
let undoButton, clearButton, gridButton, saveButton;

// =================== 工具函数 ===================
function clamp(v, lo, hi) { return max(lo, min(hi, v)); }
function clearRedo() { undoStack = []; }

function setCanvasDPR() {
  pixelDensity(min(window.devicePixelRatio || 1, 2));
  smooth();
}

function gridCols() { return max(1, floor((width - cw) / cellSize)); }
function gridRows() { return max(1, floor(height / cellSize)); }

// 纯网格坐标 (Integer)
function mouseToGrid() {
  const gx = floor((mouseX - cw) / cellSize);
  const gy = floor(mouseY / cellSize);
  return { x: gx, y: gy };
}

// 像素坐标 (Float) - 用于旋转计算
function mouseLocal() {
  return { x: mouseX - cw, y: mouseY };
}

// =================== 布局与预加载 ===================
function computeLayout() {
  cw = clamp(width * 0.18, 200, 320);
  const rightW = max(1, width - cw);
  cellSize = clamp(min(rightW / 26, height / 22), 24, 52);

  const pad = 16, gap = 10;
  const hueW = clamp(cw * 0.09, 18, 28);
  const maxSB = clamp(height * 0.28, 170, 260);
  const sbW = cw - pad * 2 - hueW - gap;
  const sbSize = floor(clamp(min(sbW, maxSB), 150, maxSB));
  const hueWI = floor(hueW);
  const topY = pad;

  COLOR_MAIN = { x: pad, y: topY, w: sbSize, h: sbSize };
  COLOR_HUE  = { x: pad + sbSize + gap, y: topY, w: hueWI,  h: sbSize };

  RECENT_RECTS = [];
  const recentCount = 5, recentGap = 10;
  const rW = clamp((cw - pad * 2 - recentGap * (recentCount - 1)) / recentCount, 22, 34);
  const recentY = topY + sbSize + 18;
  for (let i = 0; i < recentCount; i++) RECENT_RECTS.push({ x: pad + i * (rW + recentGap), y: recentY, w: rW, h: rW });

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

function preload() {
  for (let i = 0; i < icons.length; i++) icons[i] = loadImage("assets/" + i + ".png");
  for (let i = 0; i < svgs.length; i++) svgs[i] = loadImage("svg/" + (i + 1) + ".svg?v=10");
}

function computeSvgBounds(index) {
  const img = svgs[index];
  if (!img) return;
  const pg = createGraphics(256, 256);
  pg.pixelDensity(1);
  pg.clear();
  pg.image(img, 0, 0, 256, 256);
  pg.loadPixels();
  let minX = 256, minY = 256, maxX = -1, maxY = -1;
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      if (pg.pixels[(y * 256 + x) * 4 + 3] > 10) {
        if (x < minX) minX = x; if (y < minY) minY = y;
        if (x > maxX) maxX = x; if (y > maxY) maxY = y;
      }
    }
  }
  pg.remove();
  if (maxX < minX) svgBounds[index] = { x0: 0, y0: 0, w: 1, h: 1 };
  else svgBounds[index] = { x0: minX/256, y0: minY/256, w: (maxX-minX+1)/256, h: (maxY-minY+1)/256 };
}

function rebuildHueGraphic() {
  const w = floor(COLOR_HUE.w), h = floor(COLOR_HUE.h);
  hueGraphic = createGraphics(w, h);
  hueGraphic.pixelDensity(1);
  hueGraphic.colorMode(HSB, 360, 100, 100);
  hueGraphic.noStroke();
  for (let y = 0; y < h; y++) {
    hueGraphic.fill(map(y, 0, h, 0, 360), 100, 100);
    hueGraphic.rect(0, y, w, 1);
  }
}

function rebuildSBGraphic() {
  const w = floor(COLOR_MAIN.w), h = floor(COLOR_MAIN.h);
  sbGraphic = createGraphics(w, h);
  sbGraphic.pixelDensity(1);
  sbGraphic.colorMode(HSB, 360, 100, 100);
  sbGraphic.loadPixels();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const c = sbGraphic.color(hue, map(x, 0, w, 0, 100), map(y, 0, h, 100, 0));
      sbGraphic.pixels[idx] = red(c); sbGraphic.pixels[idx+1] = green(c);
      sbGraphic.pixels[idx+2] = blue(c); sbGraphic.pixels[idx+3] = 255;
    }
  }
  sbGraphic.updatePixels();
}

function layoutUI() {
  computeLayout();
  rebuildHueGraphic();
  rebuildSBGraphic();
  undoButton = new CapButton(FUNC_RECTS.undo, "Undo");
  clearButton = new CapButton(FUNC_RECTS.clear, "Clear");
  gridButton = new CapButton(FUNC_RECTS.grid, "Grid");
  saveButton = new CapButton(FUNC_RECTS.save, "Save");
  for (let i = 0; i < SHAPE_RECTS.length; i++) {
    const r = SHAPE_RECTS[i];
    buttons[i] = new IconButton(r.x + r.w/2, r.y + r.h/2, min(r.w, r.h), i);
  }
}

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

// =================== 主循环 ===================
function draw() {
  background(240);
  noTint();

  // --- 右侧画布 ---
  push();
  translate(cw, 0);

  if (showGrid) drawGrid();

  // 1. 绘制所有已确认的图形
  for (let s of shapes) s.display();

  // 2. 绘制正在创建的图形预览
  if (appState === STATE_DRAWING && drawAnchor && drawCurrent) {
    const box = getPreviewBox(drawAnchor, drawCurrent, keyIsDown(SHIFT));
    const pf = color(red(currentColor), green(currentColor), blue(currentColor), 80);
    push();
    stroke(currentColor);
    strokeWeight(2);
    fill(pf);
    drawShapePrimitive(currentShape, box.x * cellSize, box.y * cellSize, box.w * cellSize, box.h * cellSize, 0);
    pop();
  }

  // 3. 绘制选区框
  if (selectedIndex !== -1 && selectedIndex < shapes.length) {
    if (appState !== STATE_DRAWING) {
      drawSelectionBox(shapes[selectedIndex]);
    }
  }

  pop();

  // --- 左侧 UI ---
  drawLeftPanel();
}

// =================== 交互逻辑核心 ===================

function mousePressed() {
  // 左侧 UI
  if (mouseX <= cw) { handleUIInteractions(); return; }

  const g = mouseToGrid();
  const mLocal = mouseLocal();
  
  // 1. 检查控制点 (Resize / Rotate)
  if (selectedIndex !== -1) {
    const s = shapes[selectedIndex];
    const handle = getHitHandle(s, mLocal.x, mLocal.y);
    
    if (handle) {
      if (handle.startsWith('rot_')) {
        // 开始旋转
        appState = STATE_ROTATING;
        transformHandle = handle;
        transformStartShape = s.clone();
        
        // 计算初始角度，以便后续算 delta
        const cx = (s.x + s.w / 2) * cellSize;
        const cy = (s.y + s.h / 2) * cellSize;
        transformStartAngle = atan2(mLocal.y - cy, mLocal.x - cx);
      } else {
        // 开始调整大小
        appState = STATE_RESIZING;
        transformHandle = handle;
        transformStartShape = s.clone();
        transformStartMouse = g;
      }
      return;
    }
  }

  // 2. 检查 Hit Test (考虑旋转)
  const hitIndex = hitTestShape(mLocal.x, mLocal.y);
  
  if (hitIndex !== -1) {
    selectedIndex = hitIndex;
    appState = STATE_MOVING;
    transformStartShape = shapes[hitIndex].clone(); 
    transformStartMouse = g;
    return;
  }

  // 3. 点击空白 -> 新建绘制
  if (selectedIndex !== -1) {
    selectedIndex = -1;
    return;
  }

  appState = STATE_DRAWING;
  drawAnchor = g;
  drawCurrent = g;
  updateCurrentColor(false);
}

function mouseDragged() {
  if (isColorDragging) { updateColorByMouse(); return; }

  const g = mouseToGrid();
  const mLocal = mouseLocal();

  if (appState === STATE_DRAWING) {
    drawCurrent = g;
  } 
  else if (appState === STATE_MOVING) {
    const dx = g.x - transformStartMouse.x;
    const dy = g.y - transformStartMouse.y;
    const s = shapes[selectedIndex];
    s.x = transformStartShape.x + dx;
    s.y = transformStartShape.y + dy;
  } 
  else if (appState === STATE_RESIZING) {
    updateResize(g);
  }
  else if (appState === STATE_ROTATING) {
    updateRotate(mLocal.x, mLocal.y);
  }
}

function mouseReleased() {
  if (isColorDragging) {
    isColorDragging = false; colorDragMode = null;
    addRecentColor(currentColor);
    return;
  }

  if (appState === STATE_DRAWING) {
    const box = getPreviewBox(drawAnchor, drawCurrent, keyIsDown(SHIFT));
    shapes.push(new Shape(box.x, box.y, box.w, box.h, currentShape, currentColor, 0));
    selectedIndex = shapes.length - 1;
    clearRedo();
    appState = STATE_IDLE;
    drawAnchor = null;
  } 
  else if (appState === STATE_MOVING || appState === STATE_RESIZING || appState === STATE_ROTATING) {
    const s = shapes[selectedIndex];
    // 如果有变化才清空 redo
    if (s.x !== transformStartShape.x || s.y !== transformStartShape.y || 
        s.w !== transformStartShape.w || s.h !== transformStartShape.h || 
        s.rot !== transformStartShape.rot) {
      clearRedo();
    }
    appState = STATE_IDLE;
    transformHandle = null;
  } 
}

// =================== 选区、变形与旋转逻辑 ===================

function drawSelectionBox(s) {
  const w = s.w * cellSize;
  const h = s.h * cellSize;
  const cx = (s.x + s.w/2) * cellSize;
  const cy = (s.y + s.h/2) * cellSize;

  push();
  // 关键：将坐标系移动到图形中心并旋转，这样选区框就跟着图形转了
  translate(cx, cy);
  rotate(s.rot); // 使用弧度
  translate(-w/2, -h/2); // 回到左上角进行局部绘制

  // 1. 虚线框
  noFill();
  stroke("#3B82F6"); 
  strokeWeight(2);
  drawingContext.setLineDash([5, 5]);
  rect(0, 0, w, h);
  drawingContext.setLineDash([]);

  // 2. 控制点
  const handleSize = 8;
  fill(255);
  stroke("#3B82F6");
  strokeWeight(1);
  rectMode(CENTER);

  // 绘制角落点 (这些点用来 Resizing)
  rect(0, 0, handleSize, handleSize);     // nw
  rect(w, 0, handleSize, handleSize);     // ne
  rect(w, h, handleSize, handleSize);     // se
  rect(0, h, handleSize, handleSize);     // sw
  
  // 绘制边中点
  rect(w/2, 0, handleSize, handleSize);   // n
  rect(w/2, h, handleSize, handleSize);   // s
  rect(0, h/2, handleSize, handleSize);   // w
  rect(w, h/2, handleSize, handleSize);   // e

  pop();
}

// 核心：在旋转后的局部坐标系中检测控制点
function getHitHandle(s, mx, my) {
  const cx = (s.x + s.w/2) * cellSize;
  const cy = (s.y + s.h/2) * cellSize;
  
  // 1. 将鼠标坐标转换到图形的“局部未旋转空间”
  // 逆变换：先减去中心，再逆旋转
  const dx = mx - cx;
  const dy = my - cy;
  const cosA = cos(-s.rot);
  const sinA = sin(-s.rot);
  const localX = dx * cosA - dy * sinA;
  const localY = dx * sinA + dy * cosA;

  // 此时 localX/Y 是相对于图形中心 (0,0) 的坐标
  // 我们需要相对于左上角的坐标以便计算 (因为 w/h 是从左上角算的)
  const w = s.w * cellSize;
  const h = s.h * cellSize;
  const lx = localX + w/2;
  const ly = localY + h/2;

  const resizeTol = 10; // 内部半径：缩放
  const rotateTol = 30; // 外部半径：旋转

  const check = (hx, hy) => dist(lx, ly, hx, hy);

  // 检查四个角落
  const corners = [
    { id: 'nw', x: 0, y: 0 },
    { id: 'ne', x: w, y: 0 },
    { id: 'se', x: w, y: h },
    { id: 'sw', x: 0, y: h }
  ];

  for (let c of corners) {
    const d = check(c.x, c.y);
    if (d <= resizeTol) return c.id; // 命中核心 -> 缩放
    if (d <= rotateTol) return 'rot_' + c.id; // 命中外围 -> 旋转
  }

  // 检查边中点 (只有缩放)
  if (check(w/2, 0) <= resizeTol) return 'n';
  if (check(w/2, h) <= resizeTol) return 's';
  if (check(0, h/2) <= resizeTol) return 'w';
  if (check(w, h/2) <= resizeTol) return 'e';

  return null;
}

function updateResize(g) {
  const s = shapes[selectedIndex];
  const start = transformStartShape;
  const startMouse = transformStartMouse;
  
  const dx = g.x - startMouse.x;
  const dy = g.y - startMouse.y;

  let nx = start.x, ny = start.y, nw = start.w, nh = start.h;
  const h = transformHandle;

  // 这里的 resize 逻辑是基于“网格对齐”的，所以暂时忽略旋转带来的轴向变化
  // 保持“原始矩形”在网格上的缩放，旋转只是由于 rot 属性叠加的效果
  if (h.includes('e')) nw = start.w + dx;
  if (h.includes('w')) { nx = start.x + dx; nw = start.w - dx; }
  if (h.includes('s')) nh = start.h + dy;
  if (h.includes('n')) { ny = start.y + dy; nh = start.h - dy; }

  let finalX = nx, finalY = ny, finalW = nw, finalH = nh;

  if (finalW < 0) { finalX = nx + finalW; finalW = abs(finalW); }
  if (finalH < 0) { finalY = ny + finalH; finalH = abs(finalH); }
  if (finalW === 0) finalW = 1;
  if (finalH === 0) finalH = 1;

  s.x = finalX; s.y = finalY; s.w = finalW; s.h = finalH;
}

function updateRotate(mx, my) {
  const s = shapes[selectedIndex];
  const cx = (s.x + s.w/2) * cellSize;
  const cy = (s.y + s.h/2) * cellSize;
  
  // 计算当前鼠标对于中心的角度
  const currentAngle = atan2(my - cy, mx - cx);
  
  // 45度吸附 logic
  // 将角度吸附到 PI/4 的倍数
  const snapStep = PI / 4; // 45 degrees
  let snappedAngle = round(currentAngle / snapStep) * snapStep;

  s.rot = snappedAngle;
}

// 命中检测：同样需要逆旋转鼠标来检测
function hitTestShape(mx, my) {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i];
    const cx = (s.x + s.w/2) * cellSize;
    const cy = (s.y + s.h/2) * cellSize;
    
    // 逆变换
    const dx = mx - cx;
    const dy = my - cy;
    const cosA = cos(-s.rot);
    const sinA = sin(-s.rot);
    const localX = dx * cosA - dy * sinA;
    const localY = dx * sinA + dy * cosA; // 此时是相对于中心

    // 转回相对于左上角 (0,0)
    const w = s.w * cellSize;
    const h = s.h * cellSize;
    const testX = localX + w/2;
    const testY = localY + h/2;

    if (testX >= 0 && testX <= w && testY >= 0 && testY <= h) {
      return i;
    }
  }
  return -1;
}

function getPreviewBox(p1, p2, isShift) {
  let x = min(p1.x, p2.x);
  let y = min(p1.y, p2.y);
  let w = abs(p2.x - p1.x) + 1;
  let h = abs(p2.y - p1.y) + 1;

  if (isShift) {
    const s = max(w, h);
    w = s; h = s;
    if (p2.x < p1.x) x = p1.x - s + 1;
    if (p2.y < p1.y) y = p1.y - s + 1;
  }
  return { x, y, w, h };
}

// =================== Shape 类 ===================
class Shape {
  constructor(x, y, w, h, type, c, rot) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.type = type;
    this.c = color(c);
    this.rot = rot || 0; // 弧度
  }

  clone() {
    return new Shape(this.x, this.y, this.w, this.h, this.type, this.c, this.rot);
  }

  display() {
    push();
    const px = this.x * cellSize;
    const py = this.y * cellSize;
    const pw = this.w * cellSize;
    const ph = this.h * cellSize;

    // 移动到中心 -> 旋转 -> 移回左上角绘制 (以保持原语绘制逻辑简单)
    translate(px + pw/2, py + ph/2);
    rotate(this.rot);
    translate(-pw/2, -ph/2);

    // 注意：这里的绘制原语还是画在 (0,0) 到 (pw, ph)
    // 但因为外层做了 transform，所以视觉上是旋转的
    drawShapePrimitive(this.type, 0, 0, pw, ph, 0); // 内部 rot 传 0，因为外部已转
    pop();
  }
}

function drawShapePrimitive(type, x, y, w, h, rot) {
  // 注意：这里的 rot 参数已经不再需要用于变换 context 了，
  // 因为我们在 display 里已经转过了。
  // 但是对于 SVG 或者某些需要内部方向的图形，如果需要额外处理可以保留。
  // 在本例中，因为是从外部整体旋转，所以内部不再需要处理 rot。
  
  if (currentColor) { /* fill is handled outside usually, but helper functions might need it */ }

  switch(type) {
    case 0: // rect
      rect(x, y, w, h);
      break;
    case 1: // ellipse
      ellipse(x + w/2, y + h/2, w, h);
      break;
    case 2: // triangle
      triangle(x + w/2, y, x, y + h, x + w, y + h);
      break;
    case 3: // parallelogram
      const skew = w * 0.25;
      beginShape();
      vertex(x + skew, y);
      vertex(x + w, y);
      vertex(x + w - skew, y + h);
      vertex(x, y + h);
      endShape(CLOSE);
      break;
    default: // svg
      drawSvgShape(type, x, y, w, h);
      break;
  }
}

function drawSvgShape(type, x, y, w, h) {
  const idx = type - 4;
  if (idx < 0 || idx >= svgs.length) return;
  const img = svgs[idx];
  if (!img) return;
  image(img, x, y, w, h);
}

// =================== 辅助绘制 & UI ===================
function drawGrid() {
  const w = width - cw;
  const h = height;
  noStroke(); fill(245); rect(0, 0, w, h);
  stroke(220); strokeWeight(1);
  for (let x = 0; x <= w; x += cellSize) line(x, 0, x, h);
  for (let y = 0; y <= h; y += cellSize) line(0, y, w, y);
}

function drawLeftPanel() {
  noStroke(); fill("#1F1E24"); rect(0, 0, cw, height);
  drawColorPanelNew();
  drawRecentColors();
  undoButton.display();
  clearButton.display();
  gridButton.display();
  saveButton.display();
  for (let b of buttons) b.display();
}

function handleUIInteractions() {
  if (undoButton.hover()) { undo(); return; }
  if (clearButton.hover()) { shapes = []; clearRedo(); selectedIndex = -1; return; }
  if (gridButton.hover()) { showGrid = !showGrid; return; }
  if (saveButton.hover()) { saveCanvas("grid-art", "png"); return; }
  if (handleColorPress()) return;
  for (let b of buttons) b.click();
}

function undo() {
  if (shapes.length > 0) {
    undoStack.push(shapes.pop());
    selectedIndex = -1;
  }
}

// 颜色相关逻辑
function drawColorPanelNew() {
  const r = 14;
  noStroke(); fill(38);
  rect(COLOR_MAIN.x-8, COLOR_MAIN.y-8, (COLOR_MAIN.w+COLOR_HUE.w+10)+16, COLOR_MAIN.h+16, 16);
  stroke(70); fill(20);
  rect(COLOR_MAIN.x, COLOR_MAIN.y, COLOR_MAIN.w, COLOR_MAIN.h, r);
  imageMode(CORNER);
  image(sbGraphic, COLOR_MAIN.x, COLOR_MAIN.y, COLOR_MAIN.w, COLOR_MAIN.h);
  rect(COLOR_HUE.x, COLOR_HUE.y, COLOR_HUE.w, COLOR_HUE.h, r);
  image(hueGraphic, COLOR_HUE.x, COLOR_HUE.y, COLOR_HUE.w, COLOR_HUE.h);
  const hx = COLOR_MAIN.x + (sat/100)*COLOR_MAIN.w;
  const hy = COLOR_MAIN.y + (1-bri/100)*COLOR_MAIN.h;
  stroke(255); noFill(); circle(hx, hy, 14); stroke(0, 140); circle(hx, hy, 10);
  const hueY = COLOR_HUE.y + (hue/360)*COLOR_HUE.h;
  stroke(255); strokeWeight(3); line(COLOR_HUE.x-3, hueY, COLOR_HUE.x+COLOR_HUE.w+3, hueY);
}

function drawRecentColors() {
  for (let i = 0; i < RECENT_RECTS.length; i++) {
    const r = RECENT_RECTS[i];
    stroke(40); strokeWeight(1); fill(recentColors[i] || color(0));
    rect(r.x, r.y, r.w, r.h, 8);
    if (recentColors[i] && currentColor && 
        red(recentColors[i])===red(currentColor) && 
        green(recentColors[i])===green(currentColor) && 
        blue(recentColors[i])===blue(currentColor)) {
      noFill(); stroke(255); strokeWeight(2); rect(r.x-3, r.y-3, r.w+6, r.h+6, 10);
    }
  }
}

function handleColorPress() {
  if (mouseX >= COLOR_MAIN.x && mouseX <= COLOR_MAIN.x + COLOR_MAIN.w && mouseY >= COLOR_MAIN.y && mouseY <= COLOR_MAIN.y + COLOR_MAIN.h) {
    isColorDragging = true; colorDragMode = "sb"; updateColorByMouse(); return true;
  }
  if (mouseX >= COLOR_HUE.x && mouseX <= COLOR_HUE.x + COLOR_HUE.w && mouseY >= COLOR_HUE.y && mouseY <= COLOR_HUE.y + COLOR_HUE.h) {
    isColorDragging = true; colorDragMode = "hue"; updateColorByMouse(); return true;
  }
  for (let i = 0; i < RECENT_RECTS.length; i++) {
    const r = RECENT_RECTS[i];
    if (mouseX >= r.x && mouseX <= r.x + r.w && mouseY >= r.y && mouseY <= r.y + r.h) {
      if (recentColors[i]) { currentColor = color(recentColors[i]); addRecentColor(currentColor); }
      return true;
    }
  }
  return false;
}

function updateColorByMouse() {
  if (colorDragMode === "sb") {
    sat = map(clamp(mouseX, COLOR_MAIN.x, COLOR_MAIN.x+COLOR_MAIN.w), COLOR_MAIN.x, COLOR_MAIN.x+COLOR_MAIN.w, 0, 100);
    bri = map(clamp(mouseY, COLOR_MAIN.y, COLOR_MAIN.y+COLOR_MAIN.h), COLOR_MAIN.y, COLOR_MAIN.y+COLOR_MAIN.h, 100, 0);
  } else if (colorDragMode === "hue") {
    hue = map(clamp(mouseY, COLOR_HUE.y, COLOR_HUE.y+COLOR_HUE.h), COLOR_HUE.y, COLOR_HUE.y+COLOR_HUE.h, 0, 360);
    rebuildSBGraphic();
  }
  updateCurrentColor(false);
}

function updateCurrentColor(addRecent) {
  push(); colorMode(HSB, 360, 100, 100); currentColor = color(hue, sat, bri); pop();
  if (addRecent) addRecentColor(currentColor);
}

function addRecentColor(c) {
  const nc = color(c);
  recentColors = recentColors.filter(rc => !(red(rc)===red(nc) && green(rc)===green(nc) && blue(rc)===blue(nc)));
  recentColors.unshift(nc);
  if (recentColors.length > 5) recentColors.length = 5;
}

class IconButton {
  constructor(x, y, s, index) { this.x = x; this.y = y; this.s = s; this.index = index; this.state = false; this.img = icons[index]; }
  display() {
    push(); translate(this.x, this.y); rectMode(CENTER); imageMode(CENTER); noStroke();
    fill(this.hover() || this.index === currentShape ? "#504F53" : "#3A393D");
    rect(0, 0, this.s, this.s, this.s * 0.35);
    if (this.img) { tint(255); let f = this.index < 4 ? 0.75 : 0.9; image(this.img, 0, 0, this.s*f, this.s*f); }
    pop();
  }
  click() { if (this.hover()) { currentShape = this.index; selectedIndex = -1; } }
  hover() { return abs(mouseX - this.x) < this.s/2 && abs(mouseY - this.y) < this.s/2; }
}

class CapButton {
  constructor(rect, str) { this.x = rect.x+rect.w/2; this.y = rect.y+rect.h/2; this.w = rect.w; this.h = rect.h; this.str = str; }
  display() {
    push(); translate(this.x, this.y); rectMode(CENTER);
    fill(this.hover() ? "#5A595D" : "#464548"); rect(0, 0, this.w, this.h, 40);
    fill(255); textAlign(CENTER, CENTER); textSize(this.h*0.4); text(this.str, 0, 0); pop();
  }
  hover() { return abs(mouseX - this.x) < this.w/2 && abs(mouseY - this.y) < this.h/2; }
}

function keyPressed() {
  if ((keyCode === BACKSPACE || keyCode === DELETE) && selectedIndex !== -1) {
    shapes.splice(selectedIndex, 1); selectedIndex = -1; clearRedo();
  }
  if (key === 'z' || key === 'Z') undo();
}
```
