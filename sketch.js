// =================== 全局设置 ===================

let cw = 240;
let cellSize = 36;

// 交互状态机
const STATE_IDLE = 0;
const STATE_DRAWING = 1;
const STATE_MOVING = 2; // 移动整个图形
const STATE_RESIZING = 3; // 拖动控制点调整大小
const STATE_ROTATING = 4; // ✅ 新增：旋转状态

let appState = STATE_IDLE;

// 绘制相关
let drawAnchor = null;
let drawCurrent = null;

// 选中/变形相关
let selectedIndex = -1;
let transformHandle = null; // 'nw', 'se', ... 或 'rotate-nw' 等
let transformStartShape = null; // 备份
let transformStartMouse = null; // 屏幕像素坐标 (px)
let transformStartAngle = 0;    // 旋转开始时的鼠标角度

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

// 鼠标 -> 网格坐标 (int)
function mouseToGrid() {
  const gx = floor((mouseX - cw) / cellSize);
  const gy = floor(mouseY / cellSize);
  return { x: gx, y: gy };
}

// 辅助：旋转点 (x, y) 围绕 (cx, cy) 旋转 angle 弧度
function rotatePoint(x, y, cx, cy, angle) {
  const cosA = cos(angle);
  const sinA = sin(angle);
  const dx = x - cx;
  const dy = y - cy;
  return {
    x: cx + dx * cosA - dy * sinA,
    y: cy + dx * sinA + dy * cosA
  };
}

// =================== 布局与预加载 (保持原样) ===================
function computeLayout() {
  cw = clamp(width * 0.18, 200, 320);
  const rightW = max(1, width - cw);
  const byWidth = rightW / 26;
  const byHeight = height / 22;
  cellSize = clamp(min(byWidth, byHeight), 24, 52);

  const pad = 16, gap = 10;
  const hueW = clamp(cw * 0.09, 18, 28);
  const maxSB = clamp(height * 0.28, 170, 260);
  const sbW = cw - pad * 2 - hueW - gap;
  const sbSize = clamp(min(sbW, maxSB), 150, maxSB);
  const sbSizeI = max(1, floor(sbSize));
  const hueWI = max(1, floor(hueW));
  const topY = pad;

  COLOR_MAIN = { x: pad, y: topY, w: sbSizeI, h: sbSizeI };
  COLOR_HUE  = { x: pad + sbSizeI + gap, y: topY, w: hueWI,  h: sbSizeI };

  RECENT_RECTS = [];
  const recentCount = 5, recentGap = 10;
  const rW = clamp((cw - pad * 2 - recentGap * (recentCount - 1)) / recentCount, 22, 34);
  const recentY = topY + sbSizeI + 18;
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

  // 1. 绘制所有图形
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

  // 3. 绘制选区框 (旋转后的)
  if (selectedIndex !== -1 && selectedIndex < shapes.length && appState !== STATE_DRAWING) {
    drawSelectionBox(shapes[selectedIndex]);
  }

  pop();

  // --- 左侧 UI ---
  drawLeftPanel();
  
  // --- 鼠标光标逻辑 ---
  updateCursor();
}

function updateCursor() {
  // 简单光标反馈
  if (mouseX <= cw) {
    cursor(ARROW);
    return;
  }
  if (appState === STATE_ROTATING) {
    // 旋转中
    cursor('grab'); // 或 alias
  } else if (appState === STATE_RESIZING) {
    // 缩放中 (简化统一十字)
    cursor(CROSS);
  } else {
    // 空闲或移动
    cursor(ARROW);
  }
}

// =================== 交互逻辑核心 ===================

function mousePressed() {
  if (mouseX <= cw) {
    handleUIInteractions();
    return;
  }

  const mx = mouseX - cw;
  const my = mouseY;
  const g = mouseToGrid();
  
  // 1. 检查选中图形的控制点（Resize 或 Rotate）
  if (selectedIndex !== -1) {
    const s = shapes[selectedIndex];
    const action = getHitAction(s, mx, my);
    
    if (action.type === 'resize') {
      appState = STATE_RESIZING;
      transformHandle = action.handle;
      transformStartShape = s.clone();
      transformStartMouse = { x: mx, y: my }; // 记录像素坐标用于计算
      return;
    } 
    else if (action.type === 'rotate') {
      appState = STATE_ROTATING;
      transformHandle = action.handle;
      transformStartShape = s.clone();
      // 计算中心点 (px)
      const cx = (s.x + s.w/2) * cellSize;
      const cy = (s.y + s.h/2) * cellSize;
      // 记录起始角度
      transformStartAngle = atan2(my - cy, mx - cx);
      return;
    }
  }

  // 2. 命中测试 (Hit Test)
  const hitIndex = hitTestShape(mx, my); // 传入像素坐标，支持旋转检测
  if (hitIndex !== -1) {
    selectedIndex = hitIndex;
    appState = STATE_MOVING;
    transformStartShape = shapes[hitIndex].clone();
    transformStartMouse = mouseToGrid(); // 移动还是用网格对齐
    return;
  }

  // 3. 空白处 -> 取消选中 或 开始绘制
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
  if (isColorDragging) {
    updateColorByMouse();
    return;
  }

  const mx = mouseX - cw;
  const my = mouseY;
  const g = mouseToGrid();

  if (appState === STATE_DRAWING) {
    drawCurrent = g;
  } 
  else if (appState === STATE_MOVING) {
    // 移动：直接修改 grid 坐标
    const s = shapes[selectedIndex];
    const dx = g.x - transformStartMouse.x;
    const dy = g.y - transformStartMouse.y;
    s.x = transformStartShape.x + dx;
    s.y = transformStartShape.y + dy;
  } 
  else if (appState === STATE_RESIZING) {
    // 缩放：需要将屏幕像素位移投影回局部坐标系，以支持旋转后的缩放
    updateResize(mx, my);
  } 
  else if (appState === STATE_ROTATING) {
    // 旋转：计算角度差，吸附 45 度
    updateRotate(mx, my);
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
  } 
  else if (appState === STATE_MOVING) {
     const s = shapes[selectedIndex];
     if (s.x !== transformStartShape.x || s.y !== transformStartShape.y) clearRedo();
  }
  else if (appState === STATE_RESIZING || appState === STATE_ROTATING) {
    clearRedo();
  }

  appState = STATE_IDLE;
  drawAnchor = null;
  transformHandle = null;
}

// =================== 选区、缩放与旋转逻辑 (关键修改) ===================

// 计算图形的 8 个控制点和 4 个角点在屏幕上的实际位置
function getShapeCorners(s) {
  const cx = (s.x + s.w/2) * cellSize;
  const cy = (s.y + s.h/2) * cellSize;
  const hw = (s.w * cellSize) / 2;
  const hh = (s.h * cellSize) / 2;
  const ang = s.rot;

  // 局部坐标系下的 8 个点
  const p = {
    nw: {x: -hw, y: -hh}, n: {x: 0, y: -hh}, ne: {x: hw, y: -hh},
    w:  {x: -hw, y: 0},                      e:  {x: hw, y: 0},
    sw: {x: -hw, y: hh},  s: {x: 0, y: hh},  se: {x: hw, y: hh}
  };

  const corners = {};
  for (let key in p) {
    corners[key] = rotatePoint(cx + p[key].x, cy + p[key].y, cx, cy, ang);
  }
  return { corners, cx, cy };
}

// 绘制旋转后的选区框
function drawSelectionBox(s) {
  const { corners, cx, cy } = getShapeCorners(s);

  push();
  noFill();
  stroke("#3B82F6");
  strokeWeight(2);
  
  // 绘制旋转的矩形框
  beginShape();
  vertex(corners.nw.x, corners.nw.y);
  vertex(corners.ne.x, corners.ne.y);
  vertex(corners.se.x, corners.se.y);
  vertex(corners.sw.x, corners.sw.y);
  endShape(CLOSE);

  // 绘制控制点
  strokeWeight(1);
  fill(255);
  rectMode(CENTER);
  const size = 10;
  
  const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  for (let h of handles) {
    const pt = corners[h];
    // 如果是角点，画圆一点或者方一点都行，这里统一方块
    rect(pt.x, pt.y, size, size);
  }
  pop();
}

// 判断鼠标在控制点的行为 (Resize 还是 Rotate)
function getHitAction(s, mx, my) {
  const { corners } = getShapeCorners(s);
  const resizeDist = 8; // 像素：在这个距离内是 Resize
  const rotateDist = 24; // 像素：在 resize 外但在 rotate 内是 Rotate

  // 1. 优先检查角点 (nw, ne, se, sw) -> 支持 Rotate 和 Resize
  const cornersList = ['nw', 'ne', 'sw', 'se'];
  for (let h of cornersList) {
    const pt = corners[h];
    const d = dist(mx, my, pt.x, pt.y);
    if (d <= resizeDist) {
      return { type: 'resize', handle: h };
    } else if (d <= rotateDist) {
      // ✅ 靠近角落但没点中方块 -> 旋转
      return { type: 'rotate', handle: h };
    }
  }

  // 2. 检查边点 (n, s, w, e) -> 仅支持 Resize
  const edgesList = ['n', 's', 'w', 'e'];
  for (let h of edgesList) {
    const pt = corners[h];
    if (dist(mx, my, pt.x, pt.y) <= resizeDist) {
      return { type: 'resize', handle: h };
    }
  }

  return { type: null };
}

// 旋转逻辑：吸附 45 度
function updateRotate(mx, my) {
  const s = shapes[selectedIndex];
  const cx = (s.x + s.w/2) * cellSize;
  const cy = (s.y + s.h/2) * cellSize;
  
  const currentAngle = atan2(my - cy, mx - cx);
  const angleDiff = currentAngle - transformStartAngle;
  
  // 原始角度 + 差值
  let newRot = transformStartShape.rot + angleDiff;
  
  // ✅ 强制吸附到 45 度 (PI/4)
  const snapStep = PI / 4;
  newRot = round(newRot / snapStep) * snapStep;
  
  s.rot = newRot;
}

// 缩放逻辑：投影回局部坐标系
function updateResize(mx, my) {
  const s = shapes[selectedIndex];
  const startS = transformStartShape;
  const startM = transformStartMouse;
  const h = transformHandle;

  // 屏幕上的位移 (px)
  let dxPx = mx - startM.x;
  let dyPx = my - startM.y;

  // 将位移逆向旋转，投影到图形的局部坐标轴上
  // 这样无论图形怎么转，拖拽 "右" 手柄总是改变 "宽"
  const ang = -startS.rot; // 逆向旋转
  const dxLocal = dxPx * cos(ang) - dyPx * sin(ang);
  const dyLocal = dxPx * sin(ang) + dyPx * cos(ang);

  // 转回 Grid 单位
  const dGridX = round(dxLocal / cellSize);
  const dGridY = round(dyLocal / cellSize);

  let nx = startS.x;
  let ny = startS.y;
  let nw = startS.w;
  let nh = startS.h;

  // 逻辑：修改 nw/nh。如果变负，需要调整 nx/ny
  // 注意：因为我们是基于局部坐标系修改，nx/ny 的调整比较复杂（需要旋转回世界坐标）。
  // 为了简化且稳健，且因这是网格工具，我们假设：
  // "Resize" 总是改变这一块 Grid Box 的定义 (x,y,w,h)。
  // 旋转仅仅是渲染时的变换。
  
  if (h.includes('e')) nw = startS.w + dGridX;
  if (h.includes('w')) { nx = startS.x + dGridX; nw = startS.w - dGridX; }
  if (h.includes('s')) nh = startS.h + dGridY;
  if (h.includes('n')) { ny = startS.y + dGridY; nh = startS.h - dGridY; }

  // 翻转处理
  if (nw < 0) { nx = nx + nw; nw = abs(nw); }
  if (nh < 0) { ny = ny + nh; nh = abs(nh); }
  
  if (nw === 0) nw = 1;
  if (nh === 0) nh = 1;

  s.x = nx;
  s.y = ny;
  s.w = nw;
  s.h = nh;
}

// 命中测试 (支持旋转矩形)
function hitTestShape(mx, my) {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i];
    const cx = (s.x + s.w/2) * cellSize;
    const cy = (s.y + s.h/2) * cellSize;
    
    // 将鼠标点逆向旋转，变回轴对齐坐标系检查
    const p = rotatePoint(mx, my, cx, cy, -s.rot);
    
    // 局部坐标系下的边界
    const halfW = (s.w * cellSize) / 2;
    const halfH = (s.h * cellSize) / 2;
    
    if (p.x >= cx - halfW && p.x <= cx + halfW &&
        p.y >= cy - halfH && p.y <= cy + halfH) {
      return i;
    }
  }
  return -1;
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
    // 图形中心
    const cx = (this.x + this.w / 2) * cellSize;
    const cy = (this.y + this.h / 2) * cellSize;
    const pw = this.w * cellSize;
    const ph = this.h * cellSize;

    // 移动到中心 -> 旋转 -> 移回左上角绘制
    translate(cx, cy);
    rotate(this.rot);
    translate(-pw/2, -ph/2);

    drawShapePrimitive(this.type, 0, 0, pw, ph, 0, this.c); // 内部不再旋转，由外部 matrix 控制
    pop();
  }
}

// 统一绘制原语
function drawShapePrimitive(type, x, y, w, h, localRot, col) {
  if (col) { noStroke(); fill(col); }
  
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
      const idx = type - 4;
      if (idx >= 0 && idx < svgs.length && svgs[idx]) {
        if (col) tint(col);
        image(svgs[idx], x, y, w, h);
      }
      break;
  }
}

// 计算预览框
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

// =================== UI 与辅助 ===================
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

// 颜色相关逻辑保持原样
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
