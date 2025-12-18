// =================== 全局设置 ===================

let cw = 240;
let cellSize = 36;

// 交互状态机
const STATE_IDLE = 0;
const STATE_DRAWING = 1;
const STATE_MOVING = 2; // 移动整个图形
const STATE_RESIZING = 3; // 拖动控制点调整大小

let appState = STATE_IDLE;

// 绘制相关
let drawAnchor = null; // 绘制起始点 (grid x, y)
let drawCurrent = null; // 绘制当前点 (grid x, y)

// 选中/变形相关
let selectedIndex = -1;
let transformHandle = null; // 当前拖拽的是哪个控制点 ('nw', 'se', 'rotate' 等)
let transformStartShape = null; // 变形前的图形状态备份
let transformStartMouse = null; // 变形开始时的鼠标格点位置

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

// ✅ 核心修复：纯粹的整数网格坐标，消除漂移
function mouseToGrid() {
  const gx = floor((mouseX - cw) / cellSize);
  const gy = floor(mouseY / cellSize);
  return { x: gx, y: gy };
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

  // 1. 绘制所有已确认的图形
  for (let s of shapes) s.display();

  // 2. 绘制正在创建的图形预览（硬吸附，无延迟）
  if (appState === STATE_DRAWING && drawAnchor && drawCurrent) {
    const box = getPreviewBox(drawAnchor, drawCurrent, keyIsDown(SHIFT));
    const pf = color(red(currentColor), green(currentColor), blue(currentColor), 80);
    push();
    stroke(currentColor);
    strokeWeight(2);
    fill(pf);
    // 预览时不旋转，rot=0
    drawShapePrimitive(currentShape, box.x * cellSize, box.y * cellSize, box.w * cellSize, box.h * cellSize, 0);
    pop();
  }

  // 3. 绘制选区框（如果在空闲、移动或变形状态，且有选中项）
  if (selectedIndex !== -1 && selectedIndex < shapes.length) {
    if (appState !== STATE_DRAWING) {
      drawSelectionBox(shapes[selectedIndex]);
    }
  }

  pop();

  // --- 左侧 UI ---
  drawLeftPanel();
}

// =================== 交互逻辑核心（重写） ===================

function mousePressed() {
  // 左侧 UI 处理
  if (mouseX <= cw) {
    handleUIInteractions();
    return;
  }

  // 右侧画布处理
  const g = mouseToGrid();
  
  // 1. 检查选区控制点 (Handles)
  if (selectedIndex !== -1) {
    const s = shapes[selectedIndex];
    const handle = getHitHandle(s, mouseX - cw, mouseY);
    if (handle) {
      if (handle === 'rotate') {
        // 旋转是即时动作，点击即转 90 度
        rotateShape(s);
        clearRedo();
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

  // 2. 检查是否点击了图形 (Hit Test)
  const hitIndex = hitTestShape(g.x, g.y);
  
  if (hitIndex !== -1) {
    // 点击了图形 -> 选中并准备移动
    selectedIndex = hitIndex;
    appState = STATE_MOVING;
    transformStartShape = shapes[hitIndex].clone(); // 备份位置用于计算差量
    transformStartMouse = g;
    
    // 如果点击的是已经选中的，不用变；如果是新的，切换选中
    return;
  }

  // 3. 点击了空白处 -> 取消选中 或 开始绘制
  if (selectedIndex !== -1) {
    // 点击空白取消选中
    selectedIndex = -1;
    return;
  }

  // 开始新绘制
  appState = STATE_DRAWING;
  drawAnchor = g;
  drawCurrent = g; // 初始为 1x1
  // 确保颜色刷新
  updateCurrentColor(false);
}

function mouseDragged() {
  if (isColorDragging) {
    updateColorByMouse();
    return;
  }

  const g = mouseToGrid();

  if (appState === STATE_DRAWING) {
    drawCurrent = g; // 直接跟手，无延迟
  } 
  else if (appState === STATE_MOVING) {
    const dx = g.x - transformStartMouse.x;
    const dy = g.y - transformStartMouse.y;
    const s = shapes[selectedIndex];
    
    // 限制在画布内
    const cols = gridCols();
    const rows = gridRows();
    const newX = transformStartShape.x + dx;
    const newY = transformStartShape.y + dy;

    // 简单边界检查
    // 这里允许拖出去一部分，但保留操作感
    s.x = newX;
    s.y = newY;
  } 
  else if (appState === STATE_RESIZING) {
    updateResize(g);
  }
}

function mouseReleased() {
  if (isColorDragging) {
    isColorDragging = false; colorDragMode = null;
    addRecentColor(currentColor);
    return;
  }

  if (appState === STATE_DRAWING) {
    // 结束绘制，生成图形
    const box = getPreviewBox(drawAnchor, drawCurrent, keyIsDown(SHIFT));
    // 创建图形，rot 默认为 0
    shapes.push(new Shape(box.x, box.y, box.w, box.h, currentShape, currentColor, 0));
    selectedIndex = shapes.length - 1; // 绘制完自动选中，方便后续调整
    clearRedo();
    appState = STATE_IDLE;
    drawAnchor = null;
  } 
  else if (appState === STATE_MOVING) {
    // 移动结束
    const s = shapes[selectedIndex];
    // 如果并没有移动，视为一次单纯的点击选中
    if (s.x === transformStartShape.x && s.y === transformStartShape.y) {
      // no-op
    } else {
      clearRedo();
    }
    appState = STATE_IDLE;
  } 
  else if (appState === STATE_RESIZING) {
    clearRedo();
    appState = STATE_IDLE;
    transformHandle = null;
  }
}

// =================== 选区与变形逻辑 ===================

function drawSelectionBox(s) {
  const x = s.x * cellSize;
  const y = s.y * cellSize;
  const w = s.w * cellSize;
  const h = s.h * cellSize;

  push();
  noFill();
  stroke("#3B82F6"); // 亮蓝色
  strokeWeight(2);
  // 虚线边框
  drawingContext.setLineDash([5, 5]);
  rect(x, y, w, h);
  drawingContext.setLineDash([]);

  // 绘制8个控制点
  const handleSize = 10;
  fill(255);
  stroke("#3B82F6");
  strokeWeight(1);
  rectMode(CENTER);

  // 辅助函数绘制点
  const drawHandle = (hx, hy) => {
    rect(hx, hy, handleSize, handleSize);
  };

  // 角点
  drawHandle(x, y);       // nw
  drawHandle(x + w, y);   // ne
  drawHandle(x + w, y + h); // se
  drawHandle(x, y + h);   // sw
  
  // 边中点
  drawHandle(x + w/2, y); // n
  drawHandle(x + w/2, y + h); // s
  drawHandle(x, y + h/2); // w
  drawHandle(x + w, y + h/2); // e

  // 旋转柄 (上方伸出一根线)
  const rotX = x + w/2;
  const rotY = y - 25;
  line(x + w/2, y, rotX, rotY);
  circle(rotX, rotY, 12);
  
  // 旋转图标（简单的弧线）
  noFill();
  arc(rotX, rotY, 8, 8, 0, PI * 1.5);

  pop();
}

// 检测鼠标是否点击了某个控制柄
function getHitHandle(s, mx, my) {
  const x = s.x * cellSize;
  const y = s.y * cellSize;
  const w = s.w * cellSize;
  const h = s.h * cellSize;
  const tol = 8; // 像素容差

  const check = (hx, hy) => dist(mx, my, hx, hy) < tol;

  // 旋转柄优先
  const rotX = x + w/2;
  const rotY = y - 25;
  if (check(rotX, rotY)) return 'rotate';

  // 角点
  if (check(x, y)) return 'nw';
  if (check(x+w, y)) return 'ne';
  if (check(x+w, y+h)) return 'se';
  if (check(x, y+h)) return 'sw';

  // 边点
  if (check(x+w/2, y)) return 'n';
  if (check(x+w/2, y+h)) return 's';
  if (check(x, y+h/2)) return 'w';
  if (check(x+w, y+h/2)) return 'e';

  return null;
}

// 核心变形算法：基于网格
function updateResize(g) {
  const s = shapes[selectedIndex];
  const start = transformStartShape;
  const startMouse = transformStartMouse;
  
  // 鼠标相对位移 (grid units)
  const dx = g.x - startMouse.x;
  const dy = g.y - startMouse.y;

  let nx = start.x;
  let ny = start.y;
  let nw = start.w;
  let nh = start.h;

  const h = transformHandle;

  // 根据拖动的点调整 x,y,w,h
  if (h.includes('e')) nw = start.w + dx;
  if (h.includes('w')) { nx = start.x + dx; nw = start.w - dx; }
  if (h.includes('s')) nh = start.h + dy;
  if (h.includes('n')) { ny = start.y + dy; nh = start.h - dy; }

  // 翻转处理：如果宽度变成负数，自动交换锚点
  // 比如从右向左拉过头，nx 应该变成新的左边界，nw 取绝对值
  let finalX = nx;
  let finalY = ny;
  let finalW = nw;
  let finalH = nh;

  if (finalW < 0) {
    finalX = nx + finalW; // 新的左边
    finalW = abs(finalW);
  }
  if (finalH < 0) {
    finalY = ny + finalH;
    finalH = abs(finalH);
  }

  // 最小尺寸限制 1x1
  if (finalW === 0) finalW = 1;
  if (finalH === 0) finalH = 1;

  s.x = finalX;
  s.y = finalY;
  s.w = finalW;
  s.h = finalH;
}

// 旋转：交换宽高，步进 90 度
function rotateShape(s) {
  // 1. 增加旋转角度计数 (0-3)
  s.rot = (s.rot + 1) % 4;

  // 2. 几何交换宽高，使其适应网格
  // 如果不交换，仅仅旋转渲染，会导致图形在网格上错位（比如 2x3 的矩形转 90 度变成 3x2，但中心点对齐很麻烦）
  // 更好的“像素画/网格”体验是直接改变包围盒
  const oldW = s.w;
  const oldH = s.h;
  
  // 保持中心点大致不变
  const cx = s.x + oldW / 2;
  const cy = s.y + oldH / 2;
  
  s.w = oldH;
  s.h = oldW;
  
  s.x = round(cx - s.w / 2);
  s.y = round(cy - s.h / 2);
}

// 计算绘制时的预览框 (normalize 负数尺寸)
function getPreviewBox(p1, p2, isShift) {
  let x = min(p1.x, p2.x);
  let y = min(p1.y, p2.y);
  let w = abs(p2.x - p1.x) + 1; // 包含起点和终点，所以 +1
  let h = abs(p2.y - p1.y) + 1;

  if (isShift) {
    const s = max(w, h);
    w = s; h = s;
    // 如果向左上拉，需要修正 x,y
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
    this.rot = rot || 0; // 0, 1, 2, 3 (x90 deg)
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

    drawShapePrimitive(this.type, px, py, pw, ph, this.rot, this.c);
    pop();
  }
}

// 统一绘制原语 (增加了 rotation 参数)
function drawShapePrimitive(type, x, y, w, h, rot, col) {
  if (col) { noStroke(); fill(col); }
  
  // 对于 Rect, Ellipse, Triangle，直接在包围盒内画即可。
  // 但是对于 SVG 和 三角形，旋转属性需要生效。
  // 注意：因为我们在 rotateShape 里已经交换了 w/h，
  // 所以这里的 rot 主要是为了控制 SVG 的方向或者三角形的朝向。
  
  push();
  // 移动到中心进行旋转渲染
  translate(x + w/2, y + h/2);
  rotate(rot * HALF_PI);
  translate(-w/2, -h/2); // 这里的坐标系其实是基于交换宽高后的，所以回退时要注意
  // 修正：旋转后局部坐标系的 w/h 含义变了
  // 如果 rot=1 (90deg)，视觉上的宽其实是 h，高是 w。
  // 但为了简化，我们假设 Shape 里的 w/h 永远是轴对齐包围盒 (AABB)。
  // 只有 SVG 需要真正的纹理旋转。
  
  // 实际上，因为我在 rotateShape 里交换了 w/h，
  // 对于矩形和椭圆，rot 参数其实不重要（除了视觉上的长短轴已经变了）。
  // 对于三角形和 SVG，我们需要反向思考：
  // 如果 w/h 已经交换，那我们画图时应该画在一个 (0,0, w, h) 的框里吗？
  // 是的。但是 SVG 需要旋转内容。
  
  // 让我们简化策略：
  // 形状的 w/h 总是当前占用的网格大小。
  // rot 仅仅影响 SVG 的内部贴图方向。基本形状（矩形椭圆）不需要旋转（因为对称）。
  // 三角形需要跟随旋转。

  // 为了让旋转逻辑通用，我们回退掉上面的 translate/rotate，
  // 仅针对特定形状做旋转处理，或者直接画在 (x,y,w,h) 里。
  pop();

  // 重新实现：
  switch(type) {
    case 0: // rect
      rect(x, y, w, h);
      break;
    case 1: // ellipse
      ellipse(x + w/2, y + h/2, w, h);
      break;
    case 2: // triangle
      // 三角形需要根据 rot 调整顶点方向
      drawRotatedTriangle(x, y, w, h, rot);
      break;
    case 3: // parallelogram
      drawParallelogram(x, y, w, h); // 暂不复杂旋转
      break;
    default: // svg
      drawSvgShape(type, x, y, w, h, col, rot);
      break;
  }
}

function drawRotatedTriangle(x, y, w, h, rot) {
  // 默认(rot=0): 尖朝上
  // rot=1: 尖朝右
  // rot=2: 尖朝下
  // rot=3: 尖朝左
  
  let x1, y1, x2, y2, x3, y3;
  
  // 映射到当前的 w, h 盒子内
  if (rot === 0) { // 上
    x1 = x + w/2; y1 = y;
    x2 = x;       y2 = y + h;
    x3 = x + w;   y3 = y + h;
  } else if (rot === 1) { // 右
    x1 = x + w;   y1 = y + h/2;
    x2 = x;       y2 = y;
    x3 = x;       y3 = y + h;
  } else if (rot === 2) { // 下
    x1 = x + w/2; y1 = y + h;
    x2 = x + w;   y2 = y;
    x3 = x;       y3 = y;
  } else { // 左
    x1 = x;       y1 = y + h/2;
    x2 = x + w;   y2 = y + h;
    x3 = x + w;   y3 = y;
  }
  triangle(x1, y1, x2, y2, x3, y3);
}

function drawParallelogram(x, y, w, h) {
  // 简单绘制充满框
  const skew = w * 0.25;
  beginShape();
  vertex(x + skew, y);
  vertex(x + w, y);
  vertex(x + w - skew, y + h);
  vertex(x, y + h);
  endShape(CLOSE);
}

function drawSvgShape(type, x, y, w, h, col, rot) {
  const idx = type - 4;
  if (idx < 0 || idx >= svgs.length) return;
  const img = svgs[idx];
  if (!img) return;

  const bounds = svgBounds[idx];
  // 提取原始 SVG 里的有效区域比例
  const bx = bounds ? bounds.x0 : 0;
  const by = bounds ? bounds.y0 : 0;
  const bw = bounds ? bounds.w : 1;
  const bh = bounds ? bounds.h : 1;

  push();
  // 移动到中心
  translate(x + w/2, y + h/2);
  rotate(rot * HALF_PI);
  
  // 此时坐标系旋转了。
  // 我们需要把图片画在一个框里。
  // 如果 rot=0/2，框的大小是 (w, h)。
  // 如果 rot=1/3，框的大小是 (h, w) (因为 w/h 在外层 Shape 里已经交换过了，这里需要逆向匹配回来，或者直接匹配当前长短边)
  
  // 简单做法：总是画在 -currentW/2, -currentH/2
  // 但要注意，旋转后，本地坐标系的 X 轴对应屏幕的什么方向。
  
  // 逻辑修正：
  // 假设我们有一个 2x4 的格子 (Shape w=2, h=4)。
  // 如果 rot=0，我们画一个 2x4 的图。
  // 如果 rot=1，Shape 变成了 4x2。我们在 4x2 的中心转了 90度。
  // 此时本地坐标系的 X 轴指向下方。我们需要画一个 "高4宽2" 的图（原始比例）。
  // 所以：
  let drawW = (rot % 2 === 0) ? w : h;
  let drawH = (rot % 2 === 0) ? h : w;

  if (col) tint(col);
  
  imageMode(CENTER);
  // 为了保证裁剪正确，稍微复杂一点，这里简化为直接绘制整图
  // 如果需要极其精确的 svgBounds 裁剪，需要根据 rot 变换源坐标，略繁琐，这里使用整图缩放体验通常足够好
  image(img, 0, 0, drawW, drawH);
  
  pop();
}

function hitTestShape(gx, gy) {
  // 倒序遍历（选最上面的）
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i];
    if (gx >= s.x && gx < s.x + s.w && gy >= s.y && gy < s.y + s.h) {
      return i;
    }
  }
  return -1;
}

// =================== 辅助绘制 ===================
function drawGrid() {
  const w = width - cw;
  const h = height;
  noStroke(); fill(245); rect(0, 0, w, h);
  stroke(220); strokeWeight(1);
  for (let x = 0; x <= w; x += cellSize) line(x, 0, x, h);
  for (let y = 0; y <= h; y += cellSize) line(0, y, w, y);
}

// =================== UI 部分 (面板内容) ===================
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

// UI Classes
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
