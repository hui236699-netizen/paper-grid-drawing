// =================== 全局设置 ===================

// 画布大小
const CANVAS_W = 1440;
const CANVAS_H = 900;

// 左侧操作栏宽度（根据你给的 0~250 坐标）
let cw = 250;

// 网格
let cellSize = 30;

let dragStart, dragEnd;
let isDragging = false;
let currentShape = 0;
let currentColor;
let shapes = [];
let undoStack = [];
let showGrid = true;

// 左侧按钮 & 图标（只用前 10 个）
let icons = new Array(10);
let buttons = new Array(10);
let svgs = new Array(8);              // 8 个 SVG 形状
let svgBounds = new Array(8).fill(null); // 每个 SVG 的非透明区域范围

// 颜色选择：HSV 控制
let hue = 220;   // 色相 0..360
let sat = 100;   // 饱和度 0..100
let bri = 80;    // 明度 0..100

// 颜色面板布局——完全按你给的矩形坐标
// 1: 颜色主区域 (0,0)~(190,-220) → (0,0) 宽 190 高 220
const COLOR_MAIN = { x: 0,   y: 0,   w: 190, h: 220 };
// 2: 色相条 (200,0)~(250,-220) → (200,0) 宽 50 高 220
const COLOR_HUE  = { x: 200, y: 0,   w: 50,  h: 220 };

let sbGraphic, hueGraphic;

// 最近颜色（3~7）
// 3: (20,-230)~(50,-260) → (20,230) 宽30 高30
// 4: (65,-230)~(95,-260) → (65,230)
// 5: (110,-230)~(140,-260) → (110,230)
// 6: (155,-230)~(185,-260) → (155,230)
// 7: (200,-230)~(230,-260) → (200,230)
const RECENT_RECTS = [
  { x: 20,  y: 230, w: 30, h: 30 }, // 3
  { x: 65,  y: 230, w: 30, h: 30 }, // 4
  { x: 110, y: 230, w: 30, h: 30 }, // 5
  { x: 155, y: 230, w: 30, h: 30 }, // 6
  { x: 200, y: 230, w: 30, h: 30 }  // 7
];

// 最近颜色初始 5 个
const defaultRecentHex = [
  "#482BCC",
  "#FF04A5",
  "#FFE900",
  "#8CE255",
  "#8EC8EC"
];
let recentColors = [];

// 功能按钮 8~11
// 8: (20,-290)~(110,-320) → (20,290) 宽90 高30
// 9: (140,-290)~(230,-320) → (140,290)
// 10:(20,-340)~(110,-370) → (20,340)
// 11:(140,-340)~(230,-370) → (140,340)
const FUNC_RECTS = {
  undo:  { x: 20,  y: 290, w: 90, h: 30 },
  clear: { x: 140, y: 290, w: 90, h: 30 },
  grid:  { x: 20,  y: 340, w: 90, h: 30 },
  save:  { x: 140, y: 340, w: 90, h: 30 }
};

let undoButton, clearButton, gridButton, saveButton;

// 图形按钮区域 12~21（全部 80x80）
// 12 (30,-400)~(110,-480) → (30,400)
// 13 (140,-400)~(220,-480) → (140,400)
// 14 (30,-500)~(110,-580) → (30,500)
// 15 (140,-500)~(220,-580) → (140,500)
// 16 (30,-600)~(110,-680) → (30,600)
// 17 (140,-600)~(220,-680) → (140,600)
// 18 (30,-700)~(110,-780) → (30,700)
// 19 (140,-700)~(220,-780) → (140,700)
// 20 (30,-800)~(110,-880) → (30,800)
// 21 (140,-800)~(220,-880) → (140,800)
const SHAPE_RECTS = [
  { x: 30,  y: 400, w: 80, h: 80 }, // 12
  { x: 140, y: 400, w: 80, h: 80 }, // 13
  { x: 30,  y: 500, w: 80, h: 80 }, // 14
  { x: 140, y: 500, w: 80, h: 80 }, // 15
  { x: 30,  y: 600, w: 80, h: 80 }, // 16
  { x: 140, y: 600, w: 80, h: 80 }, // 17
  { x: 30,  y: 700, w: 80, h: 80 }, // 18
  { x: 140, y: 700, w: 80, h: 80 }, // 19
  { x: 30,  y: 800, w: 80, h: 80 }, // 20
  { x: 140, y: 800, w: 80, h: 80 }  // 21
];

// =================== 预加载资源 ===================
function preload() {
  // 左侧按钮图标：assets/0.png ~ assets/9.png
  for (let i = 0; i < icons.length; i++) {
    icons[i] = loadImage("assets/" + i + ".png");
  }

  // SVG 图形：svg/1.svg ~ svg/8.svg
  for (let i = 0; i < svgs.length; i++) {
    svgs[i] = loadImage("svg/" + (i + 1) + ".svg?v=9");
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

// =================== 布局 ===================
function layoutUI() {
  // 构造颜色面板贴图
  buildHueGraphic();
  buildSBGraphic();

  // 最近颜色：直接用 RECENT_RECTS 绘制

  // 四个功能按钮
  undoButton = rectToCapButton(FUNC_RECTS.undo, "Undo");
  clearButton = rectToCapButton(FUNC_RECTS.clear, "Clear");
  gridButton = rectToCapButton(FUNC_RECTS.grid, "Grid");
  saveButton = rectToCapButton(FUNC_RECTS.save, "Save");

  // 10 个图形按钮
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

// =================== setup / 不自动自适应 ===================
function setup() {
  createCanvas(CANVAS_W, CANVAS_H);
  currentColor = color("#482BCC");
  recentColors = defaultRecentHex.map(h => color(h));

  layoutUI();

  for (let i = 0; i < svgs.length; i++) computeSvgBounds(i);
}

// 不再根据窗口调整布局，只保持画布大小
function windowResized() {
  // 不做任何事，让画布保持 1440x900
}

// =================== draw ===================
function draw() {
  background(240);

  // 右侧画布区域：平移 cw
  push();
  translate(cw, 0);
  if (showGrid) drawGrid();
  drawShapes();
  if (isDragging) drawPreview();
  pop();

  // 左侧操作栏背景 #1F1E24
  noStroke();
  fill("#1F1E24");
  rect(0, 0, cw, height);

  // 颜色面板 & 最近颜色 & 功能按钮 & 图形按钮
  drawColorPanel();
  drawRecentColors();

  undoButton.display();
  clearButton.display();
  gridButton.display();
  saveButton.display();

  for (let b of buttons) b.display();
}

// =================== 网格和图形 ===================
function drawGrid() {
  stroke(220);
  strokeWeight(1);
  const w = width - cw;
  const h = height;
  for (let x = 0; x <= w; x += cellSize) {
    line(x, 0, x, h);
  }
  for (let y = 0; y <= h; y += cellSize) {
    line(0, y, w, y);
  }
}

function drawShapes() {
  for (let s of shapes) s.display();
}

// 鼠标拖拽时的预览（在画布坐标系中）
function drawPreview() {
  let gx0 = dragStart.x;
  let gy0 = dragStart.y;
  let gw = max(1, dragEnd.x - dragStart.x);
  let gh = max(1, dragEnd.y - dragStart.y);

  let x = gx0 * cellSize;
  let y = gy0 * cellSize;
  let w = gw * cellSize;
  let h = gh * cellSize;

  stroke(currentColor);
  strokeWeight(4);
  noFill();

  switch (currentShape) {
    case 0: rect(x, y, w, h); break;
    case 1: ellipse(x + w / 2, y + h / 2, w, h); break;
    case 2: triangle(x + w / 2, y, x, y + h, x + w, y + h); break;
    case 3: drawParallelogramPreview(x, y, w, h); break;
    default: drawSvgShape(currentShape, x, y, w, h, currentColor); break;
  }
}

// 添加图形
function addNewShape() {
  let x = dragStart.x;
  let y = dragStart.y;
  let w = max(1, dragEnd.x - dragStart.x);
  let h = max(1, dragEnd.y - dragStart.y);
  shapes.push(new Shape(x, y, w, h, currentShape, currentColor));
  undoStack = [];
}

// =================== 颜色面板 ===================
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
      hueGraphic.pixels[idx] = red(c);
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
      let sVal = map(x, 0, COLOR_MAIN.w - 1, 0, 100);       // 左→右：饱和度增加
      let bVal = map(y, 0, COLOR_MAIN.h - 1, 100, 0);       // 上→下：明度降低
      let c = sbGraphic.color(hue, sVal, bVal);
      let idx = (y * COLOR_MAIN.w + x) * 4;
      sbGraphic.pixels[idx] = red(c);
      sbGraphic.pixels[idx + 1] = green(c);
      sbGraphic.pixels[idx + 2] = blue(c);
      sbGraphic.pixels[idx + 3] = 255;
    }
  }
  sbGraphic.updatePixels();
}

// 顶部颜色区域：大矩形 + 竖条，贴边
function drawColorPanel() {
  imageMode(CORNER);
  image(sbGraphic, COLOR_MAIN.x, COLOR_MAIN.y);
  image(hueGraphic, COLOR_HUE.x, COLOR_HUE.y);

  // 色条上的 hue 指示
  let huePosY = map(hue, 0, 360, 0, COLOR_HUE.h);
  stroke(255);
  strokeWeight(2);
  let hx = COLOR_HUE.x;
  let hy = COLOR_HUE.y + huePosY;
  line(hx - 4, hy, hx, hy);
  line(hx + COLOR_HUE.w, hy, hx + COLOR_HUE.w + 4, hy);
}

// 最近颜色一行（使用 RECENT_RECTS）
function drawRecentColors() {
  for (let i = 0; i < RECENT_RECTS.length; i++) {
    const r = RECENT_RECTS[i];
    stroke(60);
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
  // 大颜色矩形：修改 sat + bri
  if (mouseX >= COLOR_MAIN.x && mouseX <= COLOR_MAIN.x + COLOR_MAIN.w &&
      mouseY >= COLOR_MAIN.y && mouseY <= COLOR_MAIN.y + COLOR_MAIN.h) {
    let sx = constrain(mouseX, COLOR_MAIN.x, COLOR_MAIN.x + COLOR_MAIN.w);
    let sy = constrain(mouseY, COLOR_MAIN.y, COLOR_MAIN.y + COLOR_MAIN.h);
    sat = map(sx, COLOR_MAIN.x, COLOR_MAIN.x + COLOR_MAIN.w, 0, 100);
    bri = map(sy, COLOR_MAIN.y, COLOR_MAIN.y + COLOR_MAIN.h, 100, 0);
    updateCurrentColor();
    return true;
  }

  // 色相条：修改 hue
  if (mouseX >= COLOR_HUE.x && mouseX <= COLOR_HUE.x + COLOR_HUE.w &&
      mouseY >= COLOR_HUE.y && mouseY <= COLOR_HUE.y + COLOR_HUE.h) {
    let hy = constrain(mouseY, COLOR_HUE.y, COLOR_HUE.y + COLOR_HUE.h);
    hue = map(hy, COLOR_HUE.y, COLOR_HUE.y + COLOR_HUE.h, 0, 360);
    buildSBGraphic();
    updateCurrentColor();
    return true;
  }

  // 最近颜色方块
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

// =================== 鼠标交互 ===================
function mousePressed() {
  // 右侧画布区域
  if (mouseX > cw && mouseY >= 0 && mouseY <= height) {
    isDragging = true;
    let gx = round((mouseX - cw) / cellSize);
    let gy = round(mouseY / cellSize);
    dragStart = createVector(gx, gy);
    dragEnd = dragStart.copy();
    return;
  }

  // 左侧：先检查功能按钮
  if (undoButton.hover()) { undo(); return; }
  if (clearButton.hover()) { clearShapes(); return; }
  if (gridButton.hover()) { showGrid = !showGrid; return; }
  if (saveButton.hover()) { saveCanvas("paper-grid-drawing", "png"); return; }

  // 再检查颜色面板
  if (handleColorClick()) return;

  // 再检查图形按钮
  for (let b of buttons) b.click();
}

function mouseDragged() {
  if (isDragging) {
    let gx = round((mouseX - cw) / cellSize);
    let gy = round(mouseY / cellSize);
    gx = max(gx, dragStart.x);
    gy = max(gy, dragStart.y);
    dragEnd = createVector(gx, gy);
  }
}

function mouseReleased() {
  if (isDragging) {
    isDragging = false;
    addNewShape();
  }
}

// =================== 撤销 / 清空 ===================
function undo() {
  if (shapes.length > 0) {
    undoStack.push(shapes.pop());
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

// 绘制 SVG 形状（裁掉透明边，让它贴网格，并且可以染色）
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
  if (col) {
    tint(col);     // 用当前颜色染色（原 SVG 要白+透明）
  } else {
    tint(255);
  }
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

    // 按钮底色 #3A393D，hover 稍微亮一点
    if (this.hover() || this.state) fill(80, 79, 83);
    else fill("#3A393D");
    rect(0, 0, this.s, this.s, this.s * 0.35);

    if (this.img) {
      tint(255); // 图标用白色
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

    // 底色 #464548，hover 稍微亮一点
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

// =================== 键盘快捷键 ===================
function keyPressed() {
  if (key === 'z' || key === 'Z') undo();
  if (key === 'y' || key === 'Y') redo();
}
