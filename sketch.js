// ===== 全局设置 =====
let minSize = 10, maxSize = 80;
// 默认网格大小（适中）
let cellSize = 30;

let dragStart, dragEnd;
let isDragging = false;
let currentShape = 0;
let currentColor;
let shapes = [];
let undoStack = [];
let canvasG;

let webWidth = 1600;
let webHeight = 1080;
let ch = 0;
let cw = 260; // 左侧操作栏宽度

// 只保留前 10 个图标按钮
let icons = new Array(10);
let buttons = new Array(10);

// svg 还是按 1~8.svg 预加载，用前 6 个即可
let svgs = new Array(8);

// 4 个功能按钮：Undo / Clear / Grid / Save
let undoButton, clearButton, gridButton, saveButton;
let showGrid = true;

// 颜色记忆
const defaultRecentHex = [
  "#482BCC",
  "#FF04A5",
  "#FFE900",
  "#8CE255",
  "#8EC8EC"
];
let recentColors = [];

// --- 新颜色面板（方块+色条） ---
let pickerHue = 240;   // 色相
let pickerSat = 100;   // 饱和度
let pickerBri = 100;   // 明度

let sbX, sbY, sbSize;      // Saturation/Brightness 方块
let hueX, hueY, hueW, hueH; // Hue 色条

let sbGraphic, hueGraphic;
let sbDirty = true; // 当 hue 变化时，重新生成 SB 方块图像

// 每个 SVG 自动计算“有颜色区域”边界（0~1 比例）
let svgBounds = new Array(8).fill(null);

// ===== 预加载资源 =====
function preload() {
  for (let i = 0; i < icons.length; i++) {
    icons[i] = loadImage("assets/" + i + ".png");
  }
  for (let i = 0; i < svgs.length; i++) {
    svgs[i] = loadImage("svg/" + (i + 1) + ".svg?v=2");
  }
}

// ===== 计算 SVG 内有颜色的包围盒 =====
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
    let w  = (maxX - minX + 1) / sampleW;
    let h  = (maxY - minY + 1) / sampleH;

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

// ===== 颜色面板图像：Hue 色条 =====
function buildHueGraphic() {
  hueGraphic = createGraphics(20, 150);
  hueGraphic.pixelDensity(1);
  hueGraphic.colorMode(HSB, 360, 100, 100);
  hueGraphic.noStroke();

  hueGraphic.loadPixels();
  const w = hueGraphic.width;
  const h = hueGraphic.height;

  for (let y = 0; y < h; y++) {
    const deg = map(y, 0, h - 1, 0, 360);
    const c = hueGraphic.color(deg, 100, 100);
    for (let x = 0; x < w; x++) {
      const idx4 = (y * w + x) * 4;
      hueGraphic.pixels[idx4 + 0] = red(c);
      hueGraphic.pixels[idx4 + 1] = green(c);
      hueGraphic.pixels[idx4 + 2] = blue(c);
      hueGraphic.pixels[idx4 + 3] = 255;
    }
  }
  hueGraphic.updatePixels();
}

// ===== 颜色面板图像：Sat/Bri 方块（随 Hue 变化） =====
function buildSBGraphic() {
  sbGraphic = createGraphics(sbSize, sbSize);
  sbGraphic.pixelDensity(1);
  sbGraphic.colorMode(HSB, 360, 100, 100);
  sbGraphic.noStroke();

  sbGraphic.loadPixels();
  const w = sbGraphic.width;
  const h = sbGraphic.height;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = map(x, 0, w - 1, 0, 100);
      const b = map(h - 1 - y, 0, h - 1, 0, 100); // 上亮下暗
      const c = sbGraphic.color(pickerHue, s, b);
      const idx4 = (y * w + x) * 4;
      sbGraphic.pixels[idx4 + 0] = red(c);
      sbGraphic.pixels[idx4 + 1] = green(c);
      sbGraphic.pixels[idx4 + 2] = blue(c);
      sbGraphic.pixels[idx4 + 3] = 255;
    }
  }
  sbGraphic.updatePixels();
}

// HSB 转 p5 Color 小工具
function hsbToColor(h, s, b) {
  let c;
  push();
  colorMode(HSB, 360, 100, 100);
  c = color(h, s, b);
  pop();
  return c;
}

// ===== setup =====
function setup() {
  const d = window.devicePixelRatio || 1;
  pixelDensity(d);
  createCanvas(1440, 900);

  currentColor = color(0, 0, 255);

  canvasG = createGraphics(webWidth - cw, webHeight - ch);
  canvasG.pixelDensity(d);
  updateCanvas();

  // 颜色面板布局
  sbSize = 150;
  sbX = 20;
  sbY = 40;
  hueW = 20;
  hueH = sbSize;
  hueX = sbX + sbSize + 12;
  hueY = sbY;

  // 初始化 5 个记忆颜色
  recentColors = defaultRecentHex.map(h => color(h));
  // 初始化色板图像
  buildHueGraphic();
  buildSBGraphic();

  // 功能按钮区域
  const buttonsPanelTop = sbY + sbSize + 60;
  let row1Y = buttonsPanelTop;
  let row2Y = buttonsPanelTop + 40;
  let bw = 90;
  let bh = 34;
  let offset = 70;

  undoButton  = new CapButton(cw / 2 - offset, row1Y, bw, bh, "Undo");
  clearButton = new CapButton(cw / 2 + offset, row1Y, bw, bh, "Clear");
  gridButton  = new CapButton(cw / 2 - offset, row2Y, bw, bh, "Grid");
  saveButton  = new CapButton(cw / 2 + offset, row2Y, bw, bh, "Save");

  // 图形按钮均匀排布在左侧下半部分（5 行 × 2 列）
  const iconRows = 5;
  const iconCols = 2;
  const iconsTop = buttonsPanelTop + 80;
  const bottomMargin = 40;
  const areaH = height - iconsTop - bottomMargin;
  const rowStep = areaH / iconRows;
  const colX1 = cw * 0.33;
  const colX2 = cw * 0.73;

  let idx = 0;
  for (let r = 0; r < iconRows; r++) {
    let by = iconsTop + rowStep * (r + 0.5);
    for (let c = 0; c < iconCols; c++) {
      if (idx >= icons.length) break;
      let bx = c === 0 ? colX1 : colX2;
      let s = 70;
      buttons[idx] = new IconButton(bx, by, s, idx);
      idx++;
    }
  }

  // 计算每个 SVG 的有颜色区域
  for (let j = 0; j < svgs.length; j++) {
    computeSvgBounds(j);
  }
}

// ===== draw =====
function draw() {
  background(240);

  // 画布
  image(canvasG, cw, ch);
  if (isDragging) {
    drawPreview();
  }
  if (showGrid) {
    drawGrid();
  }

  drawUIBackground();
  drawColorPanel();

  // 功能按钮
  undoButton.display();
  clearButton.display();
  gridButton.display();
  saveButton.display();

  // 图形按钮
  for (let i = 0; i < buttons.length; i++) {
    if (buttons[i]) buttons[i].display();
  }
}

// ===== 左侧背景（深色） =====
function drawUIBackground() {
  noStroke();
  fill(0x1F, 0x1E, 0x24); // #1F1E24
  rect(0, 0, cw, height);
}

// ===== 网格 =====
function drawGrid() {
  stroke(220);
  strokeWeight(1);
  for (let i = 0; i <= webWidth; i += cellSize) {
    line(i + cw, ch, i + cw, webHeight);
  }
  for (let i = ch; i <= webHeight; i += cellSize) {
    line(cw, i, webWidth + cw, i);
  }
}

// ===== 颜色面板：顶部文字 + 色板 + 5 个记忆颜色 =====
function drawColorPanel() {
  // 标题
  fill(255);
  noStroke();
  textAlign(CENTER, CENTER);
  textSize(14);
  text("Color", cw / 2, 18);

  // 如果 hue 变过，更新 SB 方块
  if (sbDirty) {
    buildSBGraphic();
    sbDirty = false;
  }

  // 绘制 SB 方块
  imageMode(CORNER);
  image(sbGraphic, sbX, sbY, sbSize, sbSize);

  // 当前选择点（小白圈）
  const selX = sbX + map(pickerSat, 0, 100, 0, sbSize);
  const selY = sbY + map(100 - pickerBri, 0, 100, 0, sbSize);
  stroke(255);
  strokeWeight(2);
  noFill();
  circle(selX, selY, 10);

  // 绘制 Hue 色条
  image(hueGraphic, hueX, hueY, hueW, hueH);

  // 在 Hue 条上画一个小指示三角
  const hueYPos = hueY + map(pickerHue, 0, 360, 0, hueH);
  noStroke();
  fill(255);
  triangle(
    hueX + hueW + 2, hueYPos,
    hueX + hueW + 10, hueYPos - 6,
    hueX + hueW + 10, hueYPos + 6
  );

  // 最近使用颜色（5 个小方块）
  let sw = 30, sh = 30;
  let gap = 8;
  let n = recentColors.length;
  let totalW = n * sw + (n - 1) * gap;
  let startX = cw / 2 - totalW / 2;
  let y = sbY + sbSize + 16;

  rectMode(CORNER);
  for (let i = 0; i < n; i++) {
    let px = startX + i * (sw + gap);
    stroke(60);
    strokeWeight(1);
    fill(recentColors[i]);
    rect(px, y, sw, sh, 6);

    if (colorsEqual(recentColors[i], currentColor)) {
      noFill();
      stroke(255);
      strokeWeight(2);
      rect(px - 3, y - 3, sw + 6, sh + 6, 8);
    }
  }
}

// ===== 处理颜色面板点击 / 拖动 =====
function handleColorPanelMouse() {
  // 点击 SB 方块
  if (
    mouseX >= sbX && mouseX <= sbX + sbSize &&
    mouseY >= sbY && mouseY <= sbY + sbSize
  ) {
    let s = map(mouseX, sbX, sbX + sbSize, 0, 100);
    let b = map(mouseY, sbY, sbY + sbSize, 100, 0); // 上亮下暗

    pickerSat = constrain(s, 0, 100);
    pickerBri = constrain(b, 0, 100);

    currentColor = hsbToColor(pickerHue, pickerSat, pickerBri);
    addRecentColor(currentColor);
    return true;
  }

  // 点击 Hue 色条
  if (
    mouseX >= hueX && mouseX <= hueX + hueW &&
    mouseY >= hueY && mouseY <= hueY + hueH
  ) {
    let h = map(mouseY, hueY, hueY + hueH, 0, 360);
    pickerHue = constrain(h, 0, 360);

    sbDirty = true;
    currentColor = hsbToColor(pickerHue, pickerSat, pickerBri);
    addRecentColor(currentColor);
    return true;
  }

  // 点击记忆颜色
  let sw = 30, sh = 30;
  let gap = 8;
  let n = recentColors.length;
  let totalW = n * sw + (n - 1) * gap;
  let startX = cw / 2 - totalW / 2;
  let y = sbY + sbSize + 16;

  for (let i = 0; i < n; i++) {
    let px = startX + i * (sw + gap);
    if (
      mouseX >= px && mouseX <= px + sw &&
      mouseY >= y && mouseY <= y + sh
    ) {
      currentColor = color(recentColors[i]);
      addRecentColor(currentColor);
      return true;
    }
  }
  return false;
}

function addRecentColor(c) {
  let nc = color(c);
  recentColors = recentColors.filter(rc => !colorsEqual(rc, nc));
  recentColors.unshift(nc);
  if (recentColors.length > 5) recentColors.length = 5;
}

function colorsEqual(c1, c2) {
  return (
    red(c1) === red(c2) &&
    green(c1) === green(c2) &&
    blue(c1) === blue(c2)
  );
}

// ===== 更新画布 =====
function updateCanvas() {
  canvasG.push();
  canvasG.background(240);
  for (let s of shapes) {
    s.display(canvasG);
  }
  canvasG.pop();
}

// ===== 添加图形（左上角锚点固定在网格点） =====
function addNewShape() {
  let x = dragStart.x;
  let y = dragStart.y;
  let w = max(1, dragEnd.x - dragStart.x);
  let h = max(1, dragEnd.y - dragStart.y);

  shapes.push(new Shape(x, y, w, h, currentShape, currentColor));
  undoStack = [];
}

// 预览
function drawPreview() {
  let gx0 = dragStart.x;
  let gy0 = dragStart.y;
  let gw = max(1, dragEnd.x - dragStart.x);
  let gh = max(1, dragEnd.y - dragStart.y);

  let x = gx0 * cellSize;
  let y = gy0 * cellSize;
  let w = gw * cellSize;
  let h = gh * cellSize;

  push();
  translate(cw, ch);
  stroke(currentColor);
  strokeWeight(4);
  noFill();

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
      drawSvgPreview(currentShape, x, y, w, h);
      break;
  }
  pop();
}

// SVG 预览
function drawSvgPreview(type, x, y, w, h) {
  let idx = type - 4;
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
    sx = 0;
    sy = 0;
    sw = img.width;
    sh = img.height;
  }

  image(img, x, y, w, h, sx, sy, sw, sh);
}

// ===== 鼠标交互 =====
function mousePressed() {
  // 画布区域：开始画图
  if (mouseX > cw && mouseY > ch) {
    isDragging = true;
    let gx = round((mouseX - cw) / cellSize);
    let gy = round((mouseY - ch) / cellSize);
    dragStart = createVector(gx, gy);
    dragEnd = dragStart.copy();
    return;
  }

  // 左侧栏区域：优先功能按钮
  if (undoButton.hover()) {
    undo();
    return;
  }
  if (clearButton.hover()) {
    clearShapes();
    return;
  }
  if (gridButton.hover()) {
    showGrid = !showGrid;
    return;
  }
  if (saveButton.hover()) {
    saveCanvas("paper-grid-drawing", "png");
    return;
  }

  // 颜色面板
  if (handleColorPanelMouse()) {
    return;
  }

  // 图形按钮
  for (let i = 0; i < buttons.length; i++) {
    if (buttons[i]) buttons[i].click();
  }
}

function mouseDragged() {
  if (isDragging) {
    let gx = round((mouseX - cw) / cellSize);
    let gy = round((mouseY - ch) / cellSize);
    gx = max(gx, dragStart.x);
    gy = max(gy, dragStart.y);
    dragEnd = createVector(gx, gy);
  } else {
    // 在颜色面板上拖动时，也让它响应
    if (mouseX < cw) {
      handleColorPanelMouse();
    }
  }
}

function mouseReleased() {
  if (isDragging) {
    isDragging = false;
    addNewShape();
    updateCanvas();
  }
}

// ===== 撤销 / 重做 / 清空 =====
function undo() {
  if (shapes.length > 0) {
    undoStack.push(shapes.pop());
    updateCanvas();
  }
}

function redo() {
  if (undoStack.length > 0) {
    shapes.push(undoStack.pop());
    updateCanvas();
  }
}

function clearShapes() {
  shapes = [];
  undoStack = [];
  updateCanvas();
}

// ===== 键盘快捷键 =====
function keyPressed() {
  if (key === "z" || key === "Z") {
    undo();
  } else if (key === "y" || key === "Y") {
    redo();
  }
}

// ===== 图形类 =====
class Shape {
  constructor(x, y, w, h, type, c) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.type = type;
    this.c = color(c);
  }

  display(pg) {
    pg.push();
    pg.fill(this.c);
    pg.noStroke();

    let px = this.x * cellSize;
    let py = this.y * cellSize;
    let pw = this.w * cellSize;
    let ph = this.h * cellSize;

    switch (this.type) {
      case 0:
        pg.rect(px, py, pw, ph);
        break;
      case 1:
        pg.ellipse(px + pw / 2, py + ph / 2, pw, ph);
        break;
      case 2:
        pg.triangle(px + pw / 2, py, px, py + ph, px + pw, py + ph);
        break;
      case 3:
        drawParallelogramPG(pg, px, py, pw, ph);
        break;
      default:
        pgDrawSvg(pg, this.type, px, py, pw, ph);
        break;
    }

    pg.pop();
  }
}

// 平行四边形
function drawParallelogramPreview(x, y, w, h) {
  beginShape();
  vertex(x + w / 4, y);
  vertex(x + w, y);
  vertex(x + (3 * w) / 4, y + h);
  vertex(x, y + h);
  endShape(CLOSE);
}

function drawParallelogramPG(pg, x, y, w, h) {
  pg.beginShape();
  pg.vertex(x + w / 4, y);
  pg.vertex(x + w, y);
  pg.vertex(x + (3 * w) / 4, y + h);
  pg.vertex(x, y + h);
  pg.endShape(CLOSE);
}

// SVG 真正绘制到画布
function pgDrawSvg(pg, type, x, y, w, h) {
  let idx = type - 4;
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
    sx = 0;
    sy = 0;
    sw = img.width;
    sh = img.height;
  }

  pg.image(img, x, y, w, h, sx, sy, sw, sh);
}

// 图形按钮：深灰底、白色图标
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
    rectMode(CENTER);
    imageMode(CENTER);
    noStroke();

    if (this.hover() || this.state) {
      fill(70, 69, 72);
    } else {
      fill(0x2A, 0x29, 0x2C); // #2A292C
    }
    translate(this.x, this.y);
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
      for (let b of buttons) {
        if (b) b.state = false;
      }
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

// 功能按钮：#969696 底，白字
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
    rectMode(CENTER);

    if (this.hover()) {
      fill(180);
    } else {
      fill(0x96, 0x96, 0x96);
    }
    translate(this.x, this.y);
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
