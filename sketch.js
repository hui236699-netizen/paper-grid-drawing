// ----- 全局变量 -----
let minSize = 10, maxSize = 80;
let cellSize = 20;
let dragStart, dragEnd;
let isDragging = false;
let currentShape = 0;
let currentColor;
let shapes = [];
let undoStack = [];
let canvasG;
let snapThreshold = 5;

let webWidth = 1600;
let webHeight = 1080;
let ch = 0;

// 左侧操作栏宽度：260 像素
let cw = 260;

let icons = new Array(12);
let buttons = new Array(12);
let svgs = new Array(8);

// 4 个功能按钮：Undo / Clear / Grid / Save
let undoButton, clearButton, gridButton, saveButton;

// 网格是否显示
let showGrid = true;

// 颜色相关：默认的 5 个记忆颜色
const defaultRecentHex = [
  "#482BCC",
  "#FF04A5",
  "#FFE900",
  "#8CE255",
  "#8EC8EC"
];
let recentColors = [];
let colorWheelCX, colorWheelCY, colorWheelR;

// 每个 SVG 自动计算的“有颜色区域”边界（0~1 比例）
let svgBounds = new Array(8).fill(null);

// ----- 预加载 -----
function preload() {
  // 左侧按钮图标：0.png~11.png 放在 assets/ 里
  for (let i = 0; i < icons.length; i++) {
    icons[i] = loadImage("assets/" + i + ".png");
  }

  // SVG 图形：1.svg~8.svg 放在 svg/ 里
  for (let i = 0; i < svgs.length; i++) {
    // ?v=2 用来绕过浏览器缓存
    svgs[i] = loadImage("svg/" + (i + 1) + ".svg?v=2");
  }
}

// 计算某个 SVG 内部“非透明像素”的包围盒，得到去掉透明边后的区域
function computeSvgBounds(index) {
  const img = svgs[index];
  if (!img) return;

  const sampleW = 256;
  const sampleH = 256;

  const pg = createGraphics(sampleW, sampleH);
  pg.pixelDensity(1); // 采样时用密度 1，方便计算
  pg.clear();
  pg.image(img, 0, 0, sampleW, sampleH);
  pg.loadPixels();

  let minX = sampleW, minY = sampleH;
  let maxX = -1, maxY = -1;

  for (let y = 0; y < sampleH; y++) {
    for (let x = 0; x < sampleW; x++) {
      const idx4 = (y * sampleW + x) * 4;
      const a = pg.pixels[idx4 + 3];
      if (a > 10) { // alpha > 10 认为是“有颜色”的区域
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  let bounds;
  if (maxX < minX || maxY < minY) {
    // 整张图都透明，就用整张图
    bounds = { x0: 0, y0: 0, w: 1, h: 1 };
  } else {
    let x0 = minX / sampleW;
    let y0 = minY / sampleH;
    let w  = (maxX - minX + 1) / sampleW;
    let h  = (maxY - minY + 1) / sampleH;

    // 向外再扩一点点，让图形略微“吃”到边界，减少空隙
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

// ----- setup -----
function setup() {
  const d = window.devicePixelRatio || 1;
  pixelDensity(d);
  createCanvas(1440, 900);
  currentColor = color(0, 0, 255);

  canvasG = createGraphics(webWidth - cw, webHeight - ch);
  canvasG.pixelDensity(d);
  updateCanvas();

  // 颜色轮位置与大小
  colorWheelCX = cw / 2;
  colorWheelCY = 90;
  colorWheelR  = 60;

  // 初始化 5 个记忆颜色
  recentColors = defaultRecentHex.map(h => color(h));

  // 左侧按钮布局（加宽后图标也稍微放大）
  let i = 0;
  for (let y = 0; y <= 5; y++) {
    for (let x = 0; x <= 1; x++) {
      if (i < icons.length) {
        let bx = map(x, -0.75, 1.75, 0, cw);
        let by = map(y, 0, 5, 420, 820);
        let s  = 70; // 图标从 60 放大到 70
        buttons[i] = new IconButton(bx, by, s, i);
        i++;
      }
    }
  }

  // 四个功能按钮：两行
  let row1Y = 340;
  let row2Y = 380;
  let bw = 80;
  let bh = 32;
  let offset = 60;

  undoButton  = new CapButton(cw / 2 - offset, row1Y, bw, bh, "Undo");
  clearButton = new CapButton(cw / 2 + offset, row1Y, bw, bh, "Clear");
  gridButton  = new CapButton(cw / 2 - offset, row2Y, bw, bh, "Grid");
  saveButton  = new CapButton(cw / 2 + offset, row2Y, bw, bh, "Save");

  // 为每个 SVG 计算一次“有颜色区域”边界
  for (let j = 0; j < svgs.length; j++) {
    computeSvgBounds(j);
  }
}

// ----- draw -----
function draw() {
  background(240);

  image(canvasG, cw, ch);

  if (isDragging) {
    drawPreview();
  }

  if (showGrid) {
    drawGrid();
  }
  drawUIBackground();
  drawColorPanel(); // 新颜色选择 UI

  for (let i = 0; i < buttons.length; i++) {
    buttons[i].display();
  }

  // 显示 4 个功能按钮
  undoButton.display();
  clearButton.display();
  gridButton.display();
  saveButton.display();
}

// ----- UI 背景（左侧栏是浅灰）-----
function drawUIBackground() {
  noStroke();
  fill(240);
  rect(0, 0, cw, height);
}

// ----- 网格 -----
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

// ----- 颜色面板：上方取色轮 + 下方 5 个记忆颜色 -----
function drawColorPanel() {
  // 标题
  fill(0);
  noStroke();
  textAlign(CENTER, CENTER);
  textSize(14);
  text("Color", colorWheelCX, colorWheelCY - colorWheelR - 20);

  // 颜色轮
  push();
  translate(colorWheelCX, colorWheelCY);
  colorMode(HSB, 360, 100, 100);
  noStroke();
  let rOuter = colorWheelR;
  let rInner = colorWheelR * 0.55;

  for (let a = 0; a < 360; a += 3) {
    let ang1 = radians(a);
    let ang2 = radians(a + 3);
    fill(a, 100, 100);
    arc(0, 0, rOuter * 2, rOuter * 2, ang1, ang2, PIE);
  }
  // 中间挖掉一圈，视觉更干净
  fill(240);
  ellipse(0, 0, rInner * 2, rInner * 2);

  pop();
  colorMode(RGB, 255);

  // 最近使用颜色
  let sw = 30, sh = 30;
  let gap = 8;
  let n = recentColors.length;
  let totalW = n * sw + (n - 1) * gap;
  let startX = colorWheelCX - totalW / 2;
  let y = colorWheelCY + colorWheelR + 25;

  rectMode(CORNER);
  for (let i = 0; i < n; i++) {
    let px = startX + i * (sw + gap);
    stroke(60);
    strokeWeight(1);
    fill(recentColors[i]);
    rect(px, y, sw, sh, 6);

    // 高亮当前颜色
    if (colorsEqual(recentColors[i], currentColor)) {
      noFill();
      stroke(0);
      strokeWeight(2);
      rect(px - 3, y - 3, sw + 6, sh + 6, 8);
    }
  }
}

// 点击颜色面板：取色轮 + 记忆颜色
function handleColorPanelClick() {
  // 点击取色轮
  let dx = mouseX - colorWheelCX;
  let dy = mouseY - colorWheelCY;
  let distSq = dx * dx + dy * dy;
  if (distSq <= colorWheelR * colorWheelR) {
    let angle = atan2(dy, dx); // -PI..PI
    let deg = degrees(angle);
    if (deg < 0) deg += 360;

    // 用 HSB 生成颜色
    push();
    colorMode(HSB, 360, 100, 100);
    let c = color(deg, 100, 100);
    pop();

    currentColor = c;
    addRecentColor(c);
    return;
  }

  // 点击 5 个记忆颜色
  let sw = 30, sh = 30;
  let gap = 8;
  let n = recentColors.length;
  let totalW = n * sw + (n - 1) * gap;
  let startX = colorWheelCX - totalW / 2;
  let y = colorWheelCY + colorWheelR + 25;

  for (let i = 0; i < n; i++) {
    let px = startX + i * (sw + gap);
    if (mouseX >= px && mouseX <= px + sw && mouseY >= y && mouseY <= y + sh) {
      currentColor = color(recentColors[i]);
      addRecentColor(currentColor); // 选中后挪到最前
      break;
    }
  }
}

// 把一个颜色加入最近使用列表
function addRecentColor(c) {
  let nc = color(c);
  // 去掉相同的
  recentColors = recentColors.filter(rc => !colorsEqual(rc, nc));
  // 插到最前面
  recentColors.unshift(nc);
  // 限制最多 5 个
  if (recentColors.length > 5) {
    recentColors.length = 5;
  }
}

// 比较两个 p5 颜色是否一样
function colorsEqual(c1, c2) {
  return (
    red(c1) === red(c2) &&
    green(c1) === green(c2) &&
    blue(c1) === blue(c2)
  );
}

// ----- 更新画布 -----
function updateCanvas() {
  canvasG.push();
  canvasG.background(240);
  for (let s of shapes) {
    s.display(canvasG);
  }
  canvasG.pop();
}

// ----- 添加图形 -----
// dragStart / dragEnd 都是“网格坐标”
// 第一个点 = 左上角锚点，不会被 min() 改变
function addNewShape() {
  let x = dragStart.x;
  let y = dragStart.y;
  let w = max(1, dragEnd.x - dragStart.x);
  let h = max(1, dragEnd.y - dragStart.y);

  shapes.push(new Shape(x, y, w, h, currentShape, currentColor));
  undoStack = [];
}

// ----- 预览 -----
// 用 dragStart 作为左上角，只往右 / 下生长
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

// ----- SVG 预览：裁掉透明边 + 轻微外扩 -----
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

// ----- 鼠标交互 -----
function mousePressed() {
  if (mouseX > cw && mouseY > ch) {
    // 在画布区域：开始拖拽绘制
    isDragging = true;
    let gx = round((mouseX - cw) / cellSize);
    let gy = round((mouseY - ch) / cellSize);
    dragStart = createVector(gx, gy);
    dragEnd = dragStart.copy();
  } else {
    // 在左侧工具栏：按钮 / 颜色
    // 优先判断功能按钮，避免同时触发颜色面板
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
      // 保存右侧画布为 PNG 图片
      saveCanvas(canvasG, "paper-grid-drawing", "png");
      return;
    }

    // 图形按钮
    for (let i = 0; i < buttons.length; i++) {
      buttons[i].click();
    }

    // 颜色面板
    handleColorPanelClick();
  }
}

function mouseDragged() {
  if (isDragging) {
    let gx = round((mouseX - cw) / cellSize);
    let gy = round((mouseY - ch) / cellSize);
    // 锚点不动，只能往右 / 下拉
    gx = max(gx, dragStart.x);
    gy = max(gy, dragStart.y);
    dragEnd = createVector(gx, gy);
  }
}

function mouseReleased() {
  if (isDragging) {
    isDragging = false;
    addNewShape();
    updateCanvas();
  }
}

// ----- 撤销 / 重做 / 清空 -----
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

// ----- 键盘快捷键 -----
function keyPressed() {
  if (key === "z" || key === "Z") {
    undo();
  } else if (key === "y" || key === "Y") {
    redo();
  }
}

// ----- Shape 类（用网格坐标存储） -----
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

// ----- 平行四边形 -----
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

// ----- SVG 真正绘制到画布：同样裁掉透明边 -----
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

// ----- 左侧图标按钮 -----
class IconButton {
  constructor(x, y, s, index) {
    this.x = x;
    this.y = y;
    this.s = s;
    this.index = index;
    this.img = icons[index];
    this.scl = 1;
    this.gray = 50;
    this.state = false;
  }

  display() {
    push();
    rectMode(CENTER);
    imageMode(CENTER);
    noStroke();

    if (this.hover() || this.state) {
      this.gray = lerp(this.gray, 180, 0.12);
      this.scl = lerp(this.scl, 1.2, 0.12);
    } else {
      this.gray = lerp(this.gray, 50, 0.12);
      this.scl = lerp(this.scl, 1, 0.12);
    }

    fill(this.gray, 150);
    translate(this.x, this.y);
    scale(this.scl);
    rect(0, 0, this.s, this.s, this.s * 0.4);

    if (this.img) {
      let factor = this.index < 4 ? 0.75 : 0.9;
      image(this.img, 0, 0, this.s * factor, this.s * factor);
    }

    pop();
  }

  click() {
    if (this.hover()) {
      for (let b of buttons) {
        b.state = false;
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

// ----- CapButton -----
class CapButton {
  constructor(x, y, w, h, str) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.str = str;
    this.scl = 1;
    this.gray = 150;
    this.state = false;
  }

  display() {
    push();
    rectMode(CENTER);

    if (this.hover() || this.state) {
      this.gray = lerp(this.gray, 200, 0.12);
      this.scl = lerp(this.scl, 1.2, 0.12);
    } else {
      this.gray = lerp(this.gray, 150, 0.12);
      this.scl = lerp(this.scl, 1, 0.12);
    }

    translate(this.x, this.y);
    push();
    scale(this.scl);
    fill(this.gray);
    rect(0, 0, this.w, this.h, 40);
    pop();

    fill(0);
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
