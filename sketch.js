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
  '#FF0000', '#00FF00', '#0000FF',
  '#FFFF00', '#FF00FF', '#00FFFF',
  '#000000', '#FFFFFF'
];

// ----- 预加载 -----
function preload() {
  // 左侧按钮图标：0.png~11.png 放在 assets/ 里
  for (let i = 0; i < icons.length; i++) {
    icons[i] = loadImage('assets/' + i + '.png');
  }

  // SVG 图形：1.svg~8.svg 放在 svg/ 里
  for (let i = 0; i < svgs.length; i++) {
    svgs[i] = loadImage('svg/' + (i + 1) + '.svg');
  }
}

// ----- setup -----
function setup() {
  createCanvas(1440, 900);
  currentColor = color(0, 0, 255);

  canvasG = createGraphics(webWidth - cw, webHeight - ch);
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

  gridSizeSlider = new Slider(cw / 2, 250, 120, 40, 'GridSize');
  undoButton = new CapButton(cw / 2 - 45, 330, 75, 30, 'Undo');
  clearButton = new CapButton(cw / 2 + 45, 330, 75, 30, 'Clear');
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

// ----- UI 背景 -----
function drawUIBackground() {
  noStroke();
  fill(31, 30, 36);
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
    line(cw, i
