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
let cw = 200;

let icons = new Array(12);
let buttons = new Array(12);
let svgs = new Array(8);

let gridSizeSlider;
let undoButton, clearButton;

let paletteColors = [
  "#FF0000", "#00FF00", "#0000FF",
  "#FFFF00", "#FF00FF", "#00FFFF",
  "#000000", "#FFFFFF"
];

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
    svgs[i] = loadImage("svg/" + (i + 1) + ".svg");
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

  if (maxX < minX || maxY < minY) {
    // 整张图都透明，就用整张图
    svgBounds[index] = { x0: 0, y0: 0, w: 1, h: 1 };
  } else {
    const x0 = minX / sampleW;
    const y0 = minY / sampleH;
    const w = (maxX - minX + 1) / sampleW;
    const h = (maxY - minY + 1) / sampleH;
    svgBounds[index] = { x0, y0, w, h };
  }

  pg.remove();
}

// ----- setup -----
function setup() {
  // 使用设备像素密度，让画面更清晰（Retina 等）
  const d = window.devicePixelRatio || 1;
  pixelDensity(d);

  createCanvas(1440, 900);
  currentColor = color(0, 0, 255);

  canvasG = createGraphics(webWidth - cw, webHeight - ch);
  canvasG.pixelDensity(d);
  updateCanvas();

  // 左侧按钮布局
  let i = 0;
  for (let y = 0; y <= 5; y++) {
    for (let x = 0; x <= 1; x++) {
      if (i < icons.length) {
        let bx = map(x, -0.75, 1.75, 0, cw);
        let by = map(y, 0, 4, 400, 750);
        let s = 60;
        buttons[i] = new IconButton(bx, by, s, i);
        i++;
      }
    }
  }

  gridSizeSlider = new Slider(cw / 2, 250, 120, 40, "GridSize");
  undoButton = new CapButton(cw / 2 - 45, 330, 75, 30, "Undo");
  clearButton = new CapButton(cw / 2 + 45, 330, 75, 30, "Clear");

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

  drawGrid();
  drawUIBackground();
  drawColorPalette();

  for (let i = 0; i < buttons.length; i++) {
    buttons[i].display();
  }

  updateGridSize(int(map(gridSizeSlider.val, 0, 1, minSize, maxSize)));

  undoButton.display();
  clearButton.display();

  gridSizeSlider.run();
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

// ----- 颜色选择 -----
function drawColorPalette() {
  let x = cw / 2;
  let yStart = 40;
  let sw = 30, sh = 30;

  fill(0); // 浅背景上用深色文字
  noStroke();
  textAlign(CENTER, CENTER);
  textSize(14);
  text("Color", x, yStart - 20);

  for (let i = 0; i < paletteColors.length; i++) {
    let row = floor(i / 2);
    let col = i % 2;
    let px = x + (col - 0.5) * (sw + 10);
    let py = yStart + row * (sh + 10);

    stroke(60);
    strokeWeight(1);
    fill(paletteColors[i]);
    rectMode(CENTER);
    rect(px, py, sw, sh, 6);

    let c = color(paletteColors[i]);
    if (
      red(c) === red(currentColor) &&
      green(c) === green(currentColor) &&
      blue(c) === blue(currentColor)
    ) {
      noFill();
      stroke(0);
      strokeWeight(2);
      rect(px, py, sw + 6, sh + 6, 8);
    }
  }
}

function handleColorClick() {
  let x = cw / 2;
  let yStart = 40;
  let sw = 30, sh = 30;

  for (let i = 0; i < paletteColors.length; i++) {
    let row = floor(i / 2);
    let col = i % 2;
    let px = x + (col - 0.5) * (sw + 10);
    let py = yStart + row * (sh + 10);

    if (abs(mouseX - px) < sw / 2 && abs(mouseY - py) < sh / 2) {
      currentColor = color(paletteColors[i]);
    }
  }
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

// ----- 添加图形（用拖拽起点/终点） -----
function addNewShape() {
  let snappedStart = snapToGrid(dragStart.x - cw, dragStart.y);
  let snappedEnd = snapToGrid(dragEnd.x - cw, dragEnd.y);

  let x = min(snappedStart.x, snappedEnd.x);
  let y = min(snappedStart.y, snappedEnd.y);
  let w = abs(snappedEnd.x - snappedStart.x);
  let h = abs(snappedEnd.y - snappedStart.y);

  shapes.push(new Shape(x, y, w, h, currentShape, currentColor));
  undoStack = [];
}

// ----- 预览 -----
function drawPreview() {
  let snappedStart = snapToGrid(dragStart.x - cw, dragStart.y);
  let snappedEnd = snapToGrid(dragEnd.x - cw, dragEnd.y);

  let x = min(snappedStart.x, snappedEnd.x) * cellSize;
  let y = min(snappedStart.y, snappedEnd.y) * cellSize;
  let w = abs(snappedEnd.x - snappedStart.x) * cellSize;
  let h = abs(snappedEnd.y - snappedStart.y) * cellSize;

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

// ----- SVG 预览：裁掉透明边 + 特殊处理第二列倒数第二个（currentShape 9） -----
function drawSvgPreview(type, x, y, w, h) {
  let idx = type - 4;
  const img = svgs[idx];
  if (!img) return;

  const bounds = svgBounds[idx];
  const hasBounds = !!bounds;

  // 源区域（去掉透明边）
  let sx, sy, sw, sh;
  if (hasBounds) {
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

  // 👉 特殊：第二列倒数第二个图标（index 9 → type = 9）固定为一个格子宽
  if (type === 9) {
    const destW = cellSize; // 一个格子这么宽
    const dx = x + (w - destW) / 2; // 在拖拽框中水平居中
    w = destW;
    x = dx;
  }

  image(img, x, y, w, h, sx, sy, sw, sh);
}

// ----- 鼠标交互 -----
function mousePressed() {
  if (mouseX > cw && mouseY > ch) {
    isDragging = true;
    dragStart = createVector(mouseX, mouseY - ch);
    dragEnd = dragStart.copy();
  } else {
    for (let i = 0; i < buttons.length; i++) {
      buttons[i].click();
    }
    gridSizeSlider.click();
    if (undoButton.hover()) undo();
    if (clearButton.hover()) clearShapes();
    handleColorClick();
  }
}

function mouseDragged() {
  if (isDragging) {
    dragEnd = createVector(mouseX, mouseY - ch);
  }
}

function mouseReleased() {
  if (isDragging) {
    isDragging = false;
    addNewShape();
    updateCanvas();
  }
  gridSizeSlider.state = false;
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

// ----- 网格对齐 -----
function snapToGrid(x, y) {
  return createVector(round(x / cellSize), round(y / cellSize));
}

function updateGridSize(newSize) {
  cellSize = newSize;
  updateCanvas();
}

// ----- Shape 类 -----
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

// ----- SVG 真正绘制到画布：同样裁掉透明边 + 特殊加宽 type 9 -----
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

  // 同样对第二列倒数第二个（type 9）固定一个格子的宽度
  if (type === 9) {
    const destW = cellSize;
    const dx = x + (w - destW) / 2;
    w = destW;
    x = dx;
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
      abs(mouseX - this.x) < this.s / 2 && abs(mouseY - this.y) < this.s / 2
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

// ----- Slider -----
class Slider {
  constructor(x, y, w, h, str) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.str = str;
    this.val = 0.5;
    this.state = false;
  }

  run() {
    this.drag();
    this.display();
  }

  display() {
    push();
    translate(this.x, this.y);
    rectMode(CENTER);

    fill(200);
    rect(0, 0, this.w, this.h, this.h);

    let vw = map(this.val, 0, 1, 0, this.w);
    fill(120);
    rect(-this.w / 2, -this.h / 2, vw, this.h, this.h);

    fill(0);
    textAlign(CENTER, CENTER);
    textSize(this.h * 0.4);
    text(this.str, 0, 0);

    pop();
  }

  click() {
    if (this.hover()) {
      this.state = true;
    } else {
      this.state = false;
    }
  }

  drag() {
    if (this.state) {
      let v = map(mouseX, this.x - this.w / 2, this.x + this.w / 2, 0, 1);
      this.val = constrain(v, 0, 1);
    }
  }

  hover() {
    return (
      abs(mouseX - this.x) < this.w / 2 &&
      abs(mouseY - this.y) < this.h / 2
    );
  }
}
