// =================== 全局设置 ===================
let cellSize = 30;              // 网格大小
let cw = 240;                   // 左侧操作栏宽度

let dragStart, dragEnd;
let isDragging = false;
let currentShape = 0;
let currentColor;
let shapes = [];
let undoStack = [];
let showGrid = true;

// 图形按钮 & 图标，只用前 10 个
let icons = new Array(10);
let buttons = new Array(10);
let svgs = new Array(8);              // 8 个 SVG 形状
let svgBounds = new Array(8).fill(null); // 每个 SVG 的非透明区域范围

// 颜色选择：HSV 控制
let hue = 220;   // 0..360
let sat = 100;   // 0..100
let bri = 80;    // 0..100

// 颜色面板布局参数
let sbX, sbY, sbSize;           // 大色块（Sat/Bri 方块）
let hueX, hueY, hueW, hueH;     // 右侧色条
let sbGraphic, hueGraphic;

// 最近使用颜色（5 个）
const defaultRecentHex = [
  "#482BCC",
  "#FF04A5",
  "#FFE900",
  "#8CE255",
  "#8EC8EC"
];
let recentColors = [];

// 功能按钮
let undoButton, clearButton, gridButton, saveButton;

// =================== 预加载资源 ===================
function preload() {
  // 左侧按钮图标：assets/0.png ~ assets/9.png
  for (let i = 0; i < icons.length; i++) {
    icons[i] = loadImage("assets/" + i + ".png");
  }

  // SVG 图形：svg/1.svg ~ svg/8.svg
  for (let i = 0; i < svgs.length; i++) {
    svgs[i] = loadImage("svg/" + (i + 1) + ".svg?v=5");
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

// =================== 布局：按照你的草图重新排 ===================
function layoutUI() {
  // ----- 1. 顶部颜色区域（大色块 + 竖色条） -----
  // 紧贴顶部和左右两边：没有任何空隙
  hueW = 18;
  sbSize = cw - hueW;
  sbX = 0;
  sbY = 0;
  hueX = sbSize;
  hueY = 0;
  hueH = sbSize;

  buildHueGraphic();
  buildSBGraphic();

  const colorAreaBottom = sbY + sbSize;   // 顶部颜色区域的底部位置

  // ----- 2. 最近使用颜色（5 个小方块） -----
  const sw = 26;
  const sh = 26;
  const swGap = 8;
  const swCount = 5;
  const swTotalW = swCount * sw + (swCount - 1) * swGap;
  const swStartX = (cw - swTotalW) / 2;
  const swY = colorAreaBottom + 12;
  // 记住这个区域底部
  const recentBottom = swY + sh;

  // 我们在 drawRecentColors 里按这个逻辑再算一遍
  layoutUI._sw = { sw, sh, swGap, swStartX, swY };

  // ----- 3. 四个功能按钮（Undo / Clear / Grid / Save），两行 -----
  const bw = cw * 0.4;  // 按钮宽度占栏宽的 40%
  const bh = 34;
  const btnGapRow = 10;
  const btnGapCol = 20;

  const row1Y = recentBottom + 18 + bh / 2;
  const row2Y = row1Y + bh + btnGapRow;

  const centerX = cw / 2;
  undoButton  = new CapButton(centerX - bw / 2 - btnGapCol / 2, row1Y, bw, bh, "Undo");
  clearButton = new CapButton(centerX + bw / 2 + btnGapCol / 2, row1Y, bw, bh, "Clear");
  gridButton  = new CapButton(centerX - bw / 2 - btnGapCol / 2, row2Y, bw, bh, "Grid");
  saveButton  = new CapButton(centerX + bw / 2 + btnGapCol / 2, row2Y, bw, bh, "Save");

  const funcBottom = row2Y + bh / 2;

  // ----- 4. 底部 10 个图形按钮（5 行 × 2 列），自适应高度 -----
  const rows = 5;
  const cols = 2;
  const iconsTopStart = funcBottom + 26;     // 第一个图标矩形区域上边界
  const iconsBottomMargin = 24;              // 底部预留
  const availableH = height - iconsTopStart - iconsBottomMargin;

  // 默认图标尺寸 & 行间距
  let sDefault = 60;
  let gapRowDefault = 16;

  // 先按默认值计算需要的高度
  let needH = rows * sDefault + (rows - 1) * gapRowDefault;
  let s, gapRow;
  if (needH <= availableH) {
    // 空间足够，用默认
    s = sDefault;
    // 把多余的高度均匀分到间距里（让整体更居中）
    const extra = availableH - needH;
    gapRow = gapRowDefault + extra / (rows + 1);
  } else {
    // 空间不够：按比例缩小图标 & 间距
    const scale = availableH / needH;
    s = sDefault * scale;
    gapRow = gapRowDefault * scale;
  }

  const colGap = cw * 0.25;
  const xLeft = cw / 2 - colGap / 2;
  const xRight = cw / 2 + colGap / 2;

  buttons = new Array(icons.length);
  for (let i = 0; i < icons.length; i++) {
    let col = i % cols;
    let row = floor(i / cols);
    let yCenter = iconsTopStart + gapRow * (row + 1) + s * row + s / 2;
    let xCenter = col === 0 ? xLeft : xRight;
    buttons[i] = new IconButton(xCenter, yCenter, s, i);
  }
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

  // 右侧画布区域（平移 cw）
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

  drawColorPanel();
  drawRecentColors();

  // 功能按钮
  undoButton.display();
  clearButton.display();
  gridButton.display();
  saveButton.display();

  // 图形按钮
  for (let b of buttons) b.display();
}

// =================== 网格和图形 ===================
function drawGrid() {
  stroke(220);
  strokeWeight(1);
  for (let x = 0; x <= width - cw; x += cellSize) {
    line(x, 0, x, height);
  }
  for (let y = 0; y <= height; y += cellSize) {
    line(0, y, width - cw, y);
  }
}

function drawShapes() {
  for (let s of shapes) s.display();
}

// 鼠标拖拽时的预览
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
  hueGraphic = createGraphics(hueW, hueH);
  hueGraphic.colorMode(HSB, 360, 100, 100);
  hueGraphic.noStroke();
  hueGraphic.loadPixels();
  for (let y = 0; y < hueH; y++) {
    let h = map(y, 0, hueH - 1, 0, 360);
    let c = hueGraphic.color(h, 100, 100);
    for (let x = 0; x < hueW; x++) {
      let idx = (y * hueW + x) * 4;
      hueGraphic.pixels[idx] = red(c);
      hueGraphic.pixels[idx + 1] = green(c);
      hueGraphic.pixels[idx + 2] = blue(c);
      hueGraphic.pixels[idx + 3] = 255;
    }
  }
  hueGraphic.updatePixels();
}

function buildSBGraphic() {
  sbGraphic = createGraphics(sbSize, sbSize);
  sbGraphic.colorMode(HSB, 360, 100, 100);
  sbGraphic.noStroke();
  sbGraphic.loadPixels();
  for (let y = 0; y < sbSize; y++) {
    for (let x = 0; x < sbSize; x++) {
      let sVal = map(x, 0, sbSize - 1, 0, 100);       // 左→右：饱和度增加
      let bVal = map(y, 0, sbSize - 1, 100, 0);       // 上→下：明度降低
      let c = sbGraphic.color(hue, sVal, bVal);
      let idx = (y * sbSize + x) * 4;
      sbGraphic.pixels[idx] = red(c);
      sbGraphic.pixels[idx + 1] = green(c);
      sbGraphic.pixels[idx + 2] = blue(c);
      sbGraphic.pixels[idx + 3] = 255;
    }
  }
  sbGraphic.updatePixels();
}

function drawColorPanel() {
  // 顶部颜色区域：大色块 + 竖色条，紧贴边缘
  imageMode(CORNER);
  image(sbGraphic, sbX, sbY);
  image(hueGraphic, hueX, hueY);

  // 在色条上画当前 hue 的小指示
  let huePosY = map(hue, 0, 360, 0, hueH);
  stroke(255);
  strokeWeight(2);
  line(hueX - 4, hueY + huePosY, hueX, hueY + huePosY);
  line(hueX + hueW, hueY + huePosY, hueX + hueW + 4, hueY + huePosY);
}

function drawRecentColors() {
  const cfg = layoutUI._sw;
  const sw = cfg.sw;
  const sh = cfg.sh;
  const swGap = cfg.swGap;
  const swStartX = cfg.swStartX;
  const swY = cfg.swY;

  let n = recentColors.length;

  rectMode(CORNER);
  for (let i = 0; i < n; i++) {
    let px = swStartX + i * (sw + swGap);
    stroke(60);
    strokeWeight(1);
    fill(recentColors[i]);
    rect(px, swY, sw, sh, 6);

    if (colorsEqual(recentColors[i], currentColor)) {
      noFill();
      stroke(255);
      strokeWeight(2);
      rect(px - 3, swY - 3, sw + 6, sh + 6, 8);
    }
  }
}

function handleColorClick() {
  // 点在色块上：修改 sat + bri
  if (mouseX >= sbX && mouseX <= sbX + sbSize &&
      mouseY >= sbY && mouseY <= sbY + sbSize) {
    let sx = constrain(mouseX, sbX, sbX + sbSize);
    let sy = constrain(mouseY, sbY, sbY + sbSize);
    sat = map(sx, sbX, sbX + sbSize, 0, 100);
    bri = map(sy, sbY, sbY + sbSize, 100, 0);
    updateCurrentColor();
    return true;
  }

  // 点在色条上：修改 hue
  if (mouseX >= hueX && mouseX <= hueX + hueW &&
      mouseY >= hueY && mouseY <= hueY + hueH) {
    let hy = constrain(mouseY, hueY, hueY + hueH);
    hue = map(hy, hueY, hueY + hueH, 0, 360);
    buildSBGraphic();    // 色相变化后重绘色块
    updateCurrentColor();
    return true;
  }

  // 点击最近颜色
  const cfg = layoutUI._sw;
  const sw = cfg.sw;
  const sh = cfg.sh;
  const swGap = cfg.swGap;
  const swStartX = cfg.swStartX;
  const swY = cfg.swY;

  let n = recentColors.length;

  for (let i = 0; i < n; i++) {
    let px = swStartX + i * (sw + swGap);
    if (mouseX >= px && mouseX <= px + sw &&
        mouseY >= swY && mouseY <= swY + sh) {
      currentColor = color(recentColors[i]);
      addRecentColor(currentColor);
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
    translate(cw, 0);  // 绘制时平移到画布区域

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

// 绘制 SVG 形状（裁掉透明边，让它贴网格，并且可以改变颜色）
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
    tint(col);     // 让白色 SVG 变成当前颜色
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
      abs(mouseX - this.x) < this.s / 2 &&
      abs(mouseY - this.y) < this.s / 2
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

    // 底色改为 #464548，hover 稍微亮一点
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
      abs(mouseX - this.x) < this.w / 2 &&
      abs(mouseY - this.y) < this.h / 2
    );
  }
}

// =================== 键盘快捷键（可选） ===================
function keyPressed() {
  if (key === 'z' || key === 'Z') undo();
  if (key === 'y' || key === 'Y') redo();
}
