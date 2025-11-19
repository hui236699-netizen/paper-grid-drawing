<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd">
<html>
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta http-equiv="Content-Style-Type" content="text/css">
  <title></title>
  <meta name="Generator" content="Cocoa HTML Writer">
  <meta name="CocoaVersion" content="2575.4">
  <style type="text/css">
    p.p1 {margin: 0.0px 0.0px 0.0px 0.0px; font: 12.0px Helvetica}
    p.p2 {margin: 0.0px 0.0px 0.0px 0.0px; font: 12.0px Helvetica; min-height: 14.0px}
  </style>
</head>
<body>
<p class="p1">// ----- 全局变量：尽量保留你原来的结构 -----</p>
<p class="p1">let minSize = 10, maxSize = 80;</p>
<p class="p1">let cellSize = 20;</p>
<p class="p1">let dragStart, dragEnd;</p>
<p class="p1">let isDragging = false;</p>
<p class="p1">let currentShape = 0;</p>
<p class="p1">let currentColor;</p>
<p class="p1">let shapes = [];</p>
<p class="p1">let undoStack = [];</p>
<p class="p1">let canvasG;</p>
<p class="p1">let snapThreshold = 5;</p>
<p class="p2"><br></p>
<p class="p1">let webWidth = 1600;</p>
<p class="p1">let webHeight = 1080;</p>
<p class="p1">let ch = 0;</p>
<p class="p1">let cw = 200;</p>
<p class="p2"><br></p>
<p class="p1">let icons = new Array(12);</p>
<p class="p1">let buttons = new Array(12);</p>
<p class="p1">let svgs = new Array(8);</p>
<p class="p2"><br></p>
<p class="p1">let gridSizeSlider;</p>
<p class="p1">let undoButton, clearButton;</p>
<p class="p2"><br></p>
<p class="p1">let paletteColors = [</p>
<p class="p1"><span class="Apple-converted-space">  </span>'#FF0000', '#00FF00', '#0000FF',</p>
<p class="p1"><span class="Apple-converted-space">  </span>'#FFFF00', '#FF00FF', '#00FFFF',</p>
<p class="p1"><span class="Apple-converted-space">  </span>'#000000', '#FFFFFF'</p>
<p class="p1">];</p>
<p class="p2"><br></p>
<p class="p2"><br></p>
<p class="p1">// ----- 资源预加载：PNG 图标 + SVG 图形 -----</p>
<p class="p1">function preload() {</p>
<p class="p1"><span class="Apple-converted-space">  </span>// 左侧按钮 icon：你需要把 0.png~11.png 放进 assets/</p>
<p class="p1"><span class="Apple-converted-space">  </span>for (let i = 0; i &lt; icons.length; i++) {</p>
<p class="p1"><span class="Apple-converted-space">    </span>icons[i] = loadImage('assets/' + i + '.png');</p>
<p class="p1"><span class="Apple-converted-space">  </span>}</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">  </span>// 加载 SVG 图形：你需要把 1.svg~8.svg 放进 svg/</p>
<p class="p1"><span class="Apple-converted-space">  </span>for (let i = 0; i &lt; svgs.length; i++) {</p>
<p class="p1"><span class="Apple-converted-space">    </span>svgs[i] = loadImage('svg/' + (i + 1) + '.svg'); <span class="Apple-converted-space"> </span></p>
<p class="p1"><span class="Apple-converted-space">  </span>}</p>
<p class="p1">}</p>
<p class="p2"><br></p>
<p class="p2"><br></p>
<p class="p1">// ----- setup -----</p>
<p class="p1">function setup() {</p>
<p class="p1"><span class="Apple-converted-space">  </span>createCanvas(1440, 900);</p>
<p class="p1"><span class="Apple-converted-space">  </span>currentColor = color(0, 0, 255);</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">  </span>canvasG = createGraphics(webWidth - cw, webHeight - ch);</p>
<p class="p1"><span class="Apple-converted-space">  </span>updateCanvas();</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">  </span>// 创建左侧按钮</p>
<p class="p1"><span class="Apple-converted-space">  </span>let i = 0;</p>
<p class="p1"><span class="Apple-converted-space">  </span>for (let y = 0; y &lt;= 5; y++) {</p>
<p class="p1"><span class="Apple-converted-space">    </span>for (let x = 0; x &lt;= 1; x++) {</p>
<p class="p1"><span class="Apple-converted-space">      </span>if (i &lt; icons.length) {</p>
<p class="p1"><span class="Apple-converted-space">        </span>let bx = map(x, -0.75, 1.75, 0, cw);</p>
<p class="p1"><span class="Apple-converted-space">        </span>let by = map(y, 0, 4, 400, 750);</p>
<p class="p1"><span class="Apple-converted-space">        </span>let s = 60;</p>
<p class="p1"><span class="Apple-converted-space">        </span>buttons[i] = new IconButton(bx, by, s, i);</p>
<p class="p1"><span class="Apple-converted-space">        </span>i++;</p>
<p class="p1"><span class="Apple-converted-space">      </span>}</p>
<p class="p1"><span class="Apple-converted-space">    </span>}</p>
<p class="p1"><span class="Apple-converted-space">  </span>}</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">  </span>// 滑条、按钮</p>
<p class="p1"><span class="Apple-converted-space">  </span>gridSizeSlider = new Slider(cw / 2, 250, 120, 40, 'GridSize');</p>
<p class="p1"><span class="Apple-converted-space">  </span>undoButton = new CapButton(cw / 2 - 45, 330, 75, 30, 'Undo');</p>
<p class="p1"><span class="Apple-converted-space">  </span>clearButton = new CapButton(cw / 2 + 45, 330, 75, 30, 'Clear');</p>
<p class="p1">}</p>
<p class="p2"><br></p>
<p class="p2"><br></p>
<p class="p1">// ----- draw -----</p>
<p class="p1">function draw() {</p>
<p class="p1"><span class="Apple-converted-space">  </span>background(240);</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">  </span>image(canvasG, cw, ch);</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">  </span>if (isDragging) {</p>
<p class="p1"><span class="Apple-converted-space">    </span>drawPreview();</p>
<p class="p1"><span class="Apple-converted-space">  </span>}</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">  </span>drawGrid();</p>
<p class="p1"><span class="Apple-converted-space">  </span>drawUIBackground();</p>
<p class="p1"><span class="Apple-converted-space">  </span>drawColorPalette();</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">  </span>for (let i = 0; i &lt; buttons.length; i++) buttons[i].display();</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">  </span>updateGridSize(int(map(gridSizeSlider.val, 0, 1, minSize, maxSize)));</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">  </span>undoButton.display();</p>
<p class="p1"><span class="Apple-converted-space">  </span>clearButton.display();</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">  </span>gridSizeSlider.run();</p>
<p class="p1">}</p>
<p class="p2"><br></p>
<p class="p2"><br></p>
<p class="p1">// ----- UI 背景 -----</p>
<p class="p1">function drawUIBackground() {</p>
<p class="p1"><span class="Apple-converted-space">  </span>noStroke();</p>
<p class="p1"><span class="Apple-converted-space">  </span>fill(31, 30, 36);</p>
<p class="p1"><span class="Apple-converted-space">  </span>rect(0, 0, cw, height);</p>
<p class="p1">}</p>
<p class="p2"><br></p>
<p class="p2"><br></p>
<p class="p1">// ----- 网格 -----</p>
<p class="p1">function drawGrid() {</p>
<p class="p1"><span class="Apple-converted-space">  </span>stroke(220);</p>
<p class="p1"><span class="Apple-converted-space">  </span>strokeWeight(1);</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">  </span>for (let i = 0; i &lt;= webWidth; i += cellSize) {</p>
<p class="p1"><span class="Apple-converted-space">    </span>line(i + cw, ch, i + cw, webHeight);</p>
<p class="p1"><span class="Apple-converted-space">  </span>}</p>
<p class="p1"><span class="Apple-converted-space">  </span>for (let i = ch; i &lt;= webHeight; i += cellSize) {</p>
<p class="p1"><span class="Apple-converted-space">    </span>line(cw, i, webWidth + cw, i);</p>
<p class="p1"><span class="Apple-converted-space">  </span>}</p>
<p class="p1">}</p>
<p class="p2"><br></p>
<p class="p2"><br></p>
<p class="p1">// ----- 颜色选择 -----</p>
<p class="p1">function drawColorPalette() {</p>
<p class="p1"><span class="Apple-converted-space">  </span>let x = cw / 2;</p>
<p class="p1"><span class="Apple-converted-space">  </span>let yStart = 40;</p>
<p class="p1"><span class="Apple-converted-space">  </span>let sw = 30, sh = 30;</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">  </span>fill(255);</p>
<p class="p1"><span class="Apple-converted-space">  </span>noStroke();</p>
<p class="p1"><span class="Apple-converted-space">  </span>textAlign(CENTER, CENTER);</p>
<p class="p1"><span class="Apple-converted-space">  </span>textSize(14);</p>
<p class="p1"><span class="Apple-converted-space">  </span>text('Color', x, yStart - 20);</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">  </span>for (let i = 0; i &lt; paletteColors.length; i++) {</p>
<p class="p1"><span class="Apple-converted-space">    </span>let row = floor(i / 2);</p>
<p class="p1"><span class="Apple-converted-space">    </span>let col = i % 2;</p>
<p class="p1"><span class="Apple-converted-space">    </span>let px = x + (col - 0.5) * (sw + 10);</p>
<p class="p1"><span class="Apple-converted-space">    </span>let py = yStart + row * (sh + 10);</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">    </span>stroke(60);</p>
<p class="p1"><span class="Apple-converted-space">    </span>strokeWeight(1);</p>
<p class="p1"><span class="Apple-converted-space">    </span>fill(paletteColors[i]);</p>
<p class="p1"><span class="Apple-converted-space">    </span>rectMode(CENTER);</p>
<p class="p1"><span class="Apple-converted-space">    </span>rect(px, py, sw, sh, 6);</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">    </span>let c = color(paletteColors[i]);</p>
<p class="p1"><span class="Apple-converted-space">    </span>if (red(c) === red(currentColor) &amp;&amp;</p>
<p class="p1"><span class="Apple-converted-space">        </span>green(c) === green(currentColor) &amp;&amp;</p>
<p class="p1"><span class="Apple-converted-space">        </span>blue(c) === blue(currentColor)) {</p>
<p class="p1"><span class="Apple-converted-space">      </span>noFill();</p>
<p class="p1"><span class="Apple-converted-space">      </span>stroke(255);</p>
<p class="p1"><span class="Apple-converted-space">      </span>strokeWeight(2);</p>
<p class="p1"><span class="Apple-converted-space">      </span>rect(px, py, sw + 6, sh + 6, 8);</p>
<p class="p1"><span class="Apple-converted-space">    </span>}</p>
<p class="p1"><span class="Apple-converted-space">  </span>}</p>
<p class="p1">}</p>
<p class="p2"><br></p>
<p class="p1">function handleColorClick() {</p>
<p class="p1"><span class="Apple-converted-space">  </span>let x = cw / 2;</p>
<p class="p1"><span class="Apple-converted-space">  </span>let yStart = 40;</p>
<p class="p1"><span class="Apple-converted-space">  </span>let sw = 30, sh = 30;</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">  </span>for (let i = 0; i &lt; paletteColors.length; i++) {</p>
<p class="p1"><span class="Apple-converted-space">    </span>let row = floor(i / 2);</p>
<p class="p1"><span class="Apple-converted-space">    </span>let col = i % 2;</p>
<p class="p1"><span class="Apple-converted-space">    </span>let px = x + (col - 0.5) * (sw + 10);</p>
<p class="p1"><span class="Apple-converted-space">    </span>let py = yStart + row * (sh + 10);</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">    </span>if (abs(mouseX - px) &lt; sw / 2 &amp;&amp; abs(mouseY - py) &lt; sh / 2) {</p>
<p class="p1"><span class="Apple-converted-space">      </span>currentColor = color(paletteColors[i]);</p>
<p class="p1"><span class="Apple-converted-space">    </span>}</p>
<p class="p1"><span class="Apple-converted-space">  </span>}</p>
<p class="p1">}</p>
<p class="p2"><br></p>
<p class="p2"><br></p>
<p class="p1">// ----- 更新画布内容 -----</p>
<p class="p1">function updateCanvas() {</p>
<p class="p1"><span class="Apple-converted-space">  </span>canvasG.push();</p>
<p class="p1"><span class="Apple-converted-space">  </span>canvasG.background(240);</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">  </span>for (let s of shapes) s.display(canvasG);</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">  </span>canvasG.pop();</p>
<p class="p1">}</p>
<p class="p2"><br></p>
<p class="p2"><br></p>
<p class="p1">// ----- 添加新图形 -----</p>
<p class="p1">function addNewShape() {</p>
<p class="p1"><span class="Apple-converted-space">  </span>let snappedStart = snapToGrid(mouseX - cw, dragStart.y);</p>
<p class="p1"><span class="Apple-converted-space">  </span>let snappedEnd = snapToGrid(mouseX - cw, dragEnd.y);</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">  </span>let x = min(snappedStart.x, snappedEnd.x);</p>
<p class="p1"><span class="Apple-converted-space">  </span>let y = min(snappedStart.y, snappedEnd.y);</p>
<p class="p1"><span class="Apple-converted-space">  </span>let w = abs(snappedEnd.x - snappedStart.x);</p>
<p class="p1"><span class="Apple-converted-space">  </span>let h = abs(snappedEnd.y - snappedStart.y);</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">  </span>shapes.push(new Shape(x, y, w, h, currentShape, currentColor));</p>
<p class="p1"><span class="Apple-converted-space">  </span>undoStack = [];</p>
<p class="p1">}</p>
<p class="p2"><br></p>
<p class="p2"><br></p>
<p class="p1">// ----- 预览绘制 -----</p>
<p class="p1">function drawPreview() {</p>
<p class="p1"><span class="Apple-converted-space">  </span>let snappedStart = snapToGrid(mouseX - cw, dragStart.y);</p>
<p class="p1"><span class="Apple-converted-space">  </span>let snappedEnd = snapToGrid(mouseX - cw, dragEnd.y);</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">  </span>let x = min(snappedStart.x, snappedEnd.x) * cellSize;</p>
<p class="p1"><span class="Apple-converted-space">  </span>let y = min(snappedStart.y, snappedEnd.y) * cellSize;</p>
<p class="p1"><span class="Apple-converted-space">  </span>let w = abs(snappedEnd.x - snappedStart.x) * cellSize;</p>
<p class="p1"><span class="Apple-converted-space">  </span>let h = abs(snappedEnd.y - snappedStart.y) * cellSize;</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">  </span>push();</p>
<p class="p1"><span class="Apple-converted-space">  </span>translate(cw, ch);</p>
<p class="p1"><span class="Apple-converted-space">  </span>stroke(currentColor);</p>
<p class="p1"><span class="Apple-converted-space">  </span>strokeWeight(4);</p>
<p class="p1"><span class="Apple-converted-space">  </span>noFill();</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">  </span>switch (currentShape) {</p>
<p class="p1"><span class="Apple-converted-space">    </span>case 0: rect(x, y, w, h); break;</p>
<p class="p1"><span class="Apple-converted-space">    </span>case 1: ellipse(x + w / 2, y + h / 2, w, h); break;</p>
<p class="p1"><span class="Apple-converted-space">    </span>case 2: triangle(x + w / 2, y, x, y + h, x + w, y + h); break;</p>
<p class="p1"><span class="Apple-converted-space">    </span>case 3: drawParallelogramPreview(x, y, w, h); break;</p>
<p class="p1"><span class="Apple-converted-space">    </span>default: drawSvgPreview(currentShape, x, y, w, h); break;</p>
<p class="p1"><span class="Apple-converted-space">  </span>}</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">  </span>pop();</p>
<p class="p1">}</p>
<p class="p2"><br></p>
<p class="p2"><br></p>
<p class="p1">// ----- SVG 预览绘制 -----</p>
<p class="p1">function drawSvgPreview(type, x, y, w, h) {</p>
<p class="p1"><span class="Apple-converted-space">  </span>let idx = type - 4;</p>
<p class="p1"><span class="Apple-converted-space">  </span>if (!svgs[idx]) return;</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">  </span>// 缩放比例与 Processing 版本统一</p>
<p class="p1"><span class="Apple-converted-space">  </span>let scaledW = w * 0.707;</p>
<p class="p1"><span class="Apple-converted-space">  </span>let offsetX = x + w * (1 - 0.707) / 2;</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">  </span>image(svgs[idx], cw + offsetX, ch + y, scaledW, h);</p>
<p class="p1">}</p>
<p class="p2"><br></p>
<p class="p2"><br></p>
<p class="p1">// ----- 鼠标操作 -----</p>
<p class="p1">function mousePressed() {</p>
<p class="p1"><span class="Apple-converted-space">  </span>if (mouseX &gt; cw &amp;&amp; mouseY &gt; ch) {</p>
<p class="p1"><span class="Apple-converted-space">    </span>isDragging = true;</p>
<p class="p1"><span class="Apple-converted-space">    </span>dragStart = createVector(mouseX, mouseY - ch);</p>
<p class="p1"><span class="Apple-converted-space">    </span>dragEnd = dragStart.copy();</p>
<p class="p1"><span class="Apple-converted-space">  </span>} else {</p>
<p class="p1"><span class="Apple-converted-space">    </span>for (let i = 0; i &lt; buttons.length; i++) buttons[i].click();</p>
<p class="p1"><span class="Apple-converted-space">    </span>gridSizeSlider.click();</p>
<p class="p1"><span class="Apple-converted-space">    </span>if (undoButton.hover()) undo();</p>
<p class="p1"><span class="Apple-converted-space">    </span>if (clearButton.hover()) clearShapes();</p>
<p class="p1"><span class="Apple-converted-space">    </span>handleColorClick();</p>
<p class="p1"><span class="Apple-converted-space">  </span>}</p>
<p class="p1">}</p>
<p class="p2"><br></p>
<p class="p1">function mouseDragged() {</p>
<p class="p1"><span class="Apple-converted-space">  </span>if (isDragging) dragEnd = createVector(mouseX, mouseY - ch);</p>
<p class="p1">}</p>
<p class="p2"><br></p>
<p class="p1">function mouseReleased() {</p>
<p class="p1"><span class="Apple-converted-space">  </span>if (isDragging) {</p>
<p class="p1"><span class="Apple-converted-space">    </span>isDragging = false;</p>
<p class="p1"><span class="Apple-converted-space">    </span>addNewShape();</p>
<p class="p1"><span class="Apple-converted-space">    </span>updateCanvas();</p>
<p class="p1"><span class="Apple-converted-space">  </span>}</p>
<p class="p1"><span class="Apple-converted-space">  </span>gridSizeSlider.state = false;</p>
<p class="p1">}</p>
<p class="p2"><br></p>
<p class="p2"><br></p>
<p class="p1">// ----- 撤销/重做/清空 -----</p>
<p class="p1">function undo() {</p>
<p class="p1"><span class="Apple-converted-space">  </span>if (shapes.length &gt; 0) {</p>
<p class="p1"><span class="Apple-converted-space">    </span>undoStack.push(shapes.pop());</p>
<p class="p1"><span class="Apple-converted-space">    </span>updateCanvas();</p>
<p class="p1"><span class="Apple-converted-space">  </span>}</p>
<p class="p1">}</p>
<p class="p2"><br></p>
<p class="p1">function redo() {</p>
<p class="p1"><span class="Apple-converted-space">  </span>if (undoStack.length &gt; 0) {</p>
<p class="p1"><span class="Apple-converted-space">    </span>shapes.push(undoStack.pop());</p>
<p class="p1"><span class="Apple-converted-space">    </span>updateCanvas();</p>
<p class="p1"><span class="Apple-converted-space">  </span>}</p>
<p class="p1">}</p>
<p class="p2"><br></p>
<p class="p1">function clearShapes() {</p>
<p class="p1"><span class="Apple-converted-space">  </span>shapes = [];</p>
<p class="p1"><span class="Apple-converted-space">  </span>undoStack = [];</p>
<p class="p1"><span class="Apple-converted-space">  </span>updateCanvas();</p>
<p class="p1">}</p>
<p class="p2"><br></p>
<p class="p2"><br></p>
<p class="p1">// ----- 快捷键 -----</p>
<p class="p1">function keyPressed() {</p>
<p class="p1"><span class="Apple-converted-space">  </span>if (key === 'z' || key === 'Z') undo();</p>
<p class="p1"><span class="Apple-converted-space">  </span>if (key === 'y' || key === 'Y') redo();</p>
<p class="p1">}</p>
<p class="p2"><br></p>
<p class="p2"><br></p>
<p class="p1">// ----- 网格对齐 -----</p>
<p class="p1">function snapToGrid(x, y) {</p>
<p class="p1"><span class="Apple-converted-space">  </span>return createVector(round(x / cellSize), round(y / cellSize));</p>
<p class="p1">}</p>
<p class="p2"><br></p>
<p class="p1">function updateGridSize(newSize) {</p>
<p class="p1"><span class="Apple-converted-space">  </span>cellSize = newSize;</p>
<p class="p1"><span class="Apple-converted-space">  </span>updateCanvas();</p>
<p class="p1">}</p>
<p class="p2"><br></p>
<p class="p2"><br></p>
<p class="p1">// ----- Shape 类 -----</p>
<p class="p1">class Shape {</p>
<p class="p1"><span class="Apple-converted-space">  </span>constructor(x, y, w, h, type, c) {</p>
<p class="p1"><span class="Apple-converted-space">    </span>this.x = x; this.y = y;</p>
<p class="p1"><span class="Apple-converted-space">    </span>this.w = w; this.h = h;</p>
<p class="p1"><span class="Apple-converted-space">    </span>this.type = type;</p>
<p class="p1"><span class="Apple-converted-space">    </span>this.c = color(c);</p>
<p class="p1"><span class="Apple-converted-space">  </span>}</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">  </span>display(pg) {</p>
<p class="p1"><span class="Apple-converted-space">    </span>pg.push();</p>
<p class="p1"><span class="Apple-converted-space">    </span>pg.fill(this.c);</p>
<p class="p1"><span class="Apple-converted-space">    </span>pg.noStroke();</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">    </span>let px = this.x * cellSize;</p>
<p class="p1"><span class="Apple-converted-space">    </span>let py = this.y * cellSize;</p>
<p class="p1"><span class="Apple-converted-space">    </span>let pw = this.w * cellSize;</p>
<p class="p1"><span class="Apple-converted-space">    </span>let ph = this.h * cellSize;</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">    </span>switch (this.type) {</p>
<p class="p1"><span class="Apple-converted-space">      </span>case 0: pg.rect(px, py, pw, ph); break;</p>
<p class="p1"><span class="Apple-converted-space">      </span>case 1: pg.ellipse(px + pw / 2, py + ph / 2, pw, ph); break;</p>
<p class="p1"><span class="Apple-converted-space">      </span>case 2: pg.triangle(px + pw / 2, py, px, py + ph, px + pw, py + ph); break;</p>
<p class="p1"><span class="Apple-converted-space">      </span>case 3: drawParallelogramPG(pg, px, py, pw, ph); break;</p>
<p class="p1"><span class="Apple-converted-space">      </span>default: pgDrawSvg(pg, this.type, px, py, pw, ph); break;</p>
<p class="p1"><span class="Apple-converted-space">    </span>}</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">    </span>pg.pop();</p>
<p class="p1"><span class="Apple-converted-space">  </span>}</p>
<p class="p1">}</p>
<p class="p2"><br></p>
<p class="p2"><br></p>
<p class="p1">// ----- 平行四边形 -----</p>
<p class="p1">function drawParallelogramPreview(x, y, w, h) {</p>
<p class="p1"><span class="Apple-converted-space">  </span>beginShape();</p>
<p class="p1"><span class="Apple-converted-space">  </span>vertex(x + w / 4, y);</p>
<p class="p1"><span class="Apple-converted-space">  </span>vertex(x + w, y);</p>
<p class="p1"><span class="Apple-converted-space">  </span>vertex(x + (3 * w) / 4, y + h);</p>
<p class="p1"><span class="Apple-converted-space">  </span>vertex(x, y + h);</p>
<p class="p1"><span class="Apple-converted-space">  </span>endShape(CLOSE);</p>
<p class="p1">}</p>
<p class="p2"><br></p>
<p class="p1">function drawParallelogramPG(pg, x, y, w, h) {</p>
<p class="p1"><span class="Apple-converted-space">  </span>pg.beginShape();</p>
<p class="p1"><span class="Apple-converted-space">  </span>pg.vertex(x + w / 4, y);</p>
<p class="p1"><span class="Apple-converted-space">  </span>pg.vertex(x + w, y);</p>
<p class="p1"><span class="Apple-converted-space">  </span>pg.vertex(x + (3 * w) / 4, y + h);</p>
<p class="p1"><span class="Apple-converted-space">  </span>pg.vertex(x, y + h);</p>
<p class="p1"><span class="Apple-converted-space">  </span>pg.endShape(CLOSE);</p>
<p class="p1">}</p>
<p class="p2"><br></p>
<p class="p2"><br></p>
<p class="p1">// ----- SVG 图形绘制 -----</p>
<p class="p1">function pgDrawSvg(pg, type, x, y, w, h) {</p>
<p class="p1"><span class="Apple-converted-space">  </span>let idx = type - 4;</p>
<p class="p1"><span class="Apple-converted-space">  </span>if (!svgs[idx]) return;</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">  </span>let scaledW = w * 0.707;</p>
<p class="p1"><span class="Apple-converted-space">  </span>let offsetX = x + w * (1 - 0.707) / 2;</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">  </span>pg.image(svgs[idx], offsetX, y, scaledW, h);</p>
<p class="p1">}</p>
<p class="p2"><br></p>
<p class="p2"><br></p>
<p class="p1">// ----- 左侧图标按钮 -----</p>
<p class="p1">class IconButton {</p>
<p class="p1"><span class="Apple-converted-space">  </span>constructor(x, y, s, index) {</p>
<p class="p1"><span class="Apple-converted-space">    </span>this.x = x; this.y = y;</p>
<p class="p1"><span class="Apple-converted-space">    </span>this.s = s;</p>
<p class="p1"><span class="Apple-converted-space">    </span>this.index = index;</p>
<p class="p1"><span class="Apple-converted-space">    </span>this.img = icons[index];</p>
<p class="p1"><span class="Apple-converted-space">    </span>this.scl = 1;</p>
<p class="p1"><span class="Apple-converted-space">    </span>this.gray = 50;</p>
<p class="p1"><span class="Apple-converted-space">    </span>this.state = false;</p>
<p class="p1"><span class="Apple-converted-space">  </span>}</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">  </span>display() {</p>
<p class="p1"><span class="Apple-converted-space">    </span>push();</p>
<p class="p1"><span class="Apple-converted-space">    </span>rectMode(CENTER);</p>
<p class="p1"><span class="Apple-converted-space">    </span>imageMode(CENTER);</p>
<p class="p1"><span class="Apple-converted-space">    </span>noStroke();</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">    </span>if (this.hover() || this.state) {</p>
<p class="p1"><span class="Apple-converted-space">      </span>this.gray = lerp(this.gray, 180, 0.12);</p>
<p class="p1"><span class="Apple-converted-space">      </span>this.scl = lerp(this.scl, 1.2, 0.12);</p>
<p class="p1"><span class="Apple-converted-space">    </span>} else {</p>
<p class="p1"><span class="Apple-converted-space">      </span>this.gray = lerp(this.gray, 50, 0.12);</p>
<p class="p1"><span class="Apple-converted-space">      </span>this.scl = lerp(this.scl, 1, 0.12);</p>
<p class="p1"><span class="Apple-converted-space">    </span>}</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">    </span>fill(this.gray, 150);</p>
<p class="p1"><span class="Apple-converted-space">    </span>translate(this.x, this.y);</p>
<p class="p1"><span class="Apple-converted-space">    </span>scale(this.scl);</p>
<p class="p1"><span class="Apple-converted-space">    </span>rect(0, 0, this.s, this.s, this.s * 0.4);</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">    </span>if (this.img) {</p>
<p class="p1"><span class="Apple-converted-space">      </span>let factor = this.index &lt; 4 ? 0.75 : 0.9;</p>
<p class="p1"><span class="Apple-converted-space">      </span>image(this.img, 0, 0, this.s * factor, this.s * factor);</p>
<p class="p1"><span class="Apple-converted-space">    </span>}</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">    </span>pop();</p>
<p class="p1"><span class="Apple-converted-space">  </span>}</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">  </span>click() {</p>
<p class="p1"><span class="Apple-converted-space">    </span>if (this.hover()) {</p>
<p class="p1"><span class="Apple-converted-space">      </span>for (let b of buttons) b.state = false;</p>
<p class="p1"><span class="Apple-converted-space">      </span>this.state = true;</p>
<p class="p1"><span class="Apple-converted-space">      </span>currentShape = this.index;</p>
<p class="p1"><span class="Apple-converted-space">    </span>}</p>
<p class="p1"><span class="Apple-converted-space">  </span>}</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">  </span>hover() {</p>
<p class="p1"><span class="Apple-converted-space">    </span>return (abs(mouseX - this.x) &lt; this.s / 2 &amp;&amp;</p>
<p class="p1"><span class="Apple-converted-space">            </span>abs(mouseY - this.y) &lt; this.s / 2);</p>
<p class="p1"><span class="Apple-converted-space">  </span>}</p>
<p class="p1">}</p>
<p class="p2"><br></p>
<p class="p2"><br></p>
<p class="p1">// ----- CapButton -----</p>
<p class="p1">class CapButton {</p>
<p class="p1"><span class="Apple-converted-space">  </span>constructor(x, y, w, h, str) {</p>
<p class="p1"><span class="Apple-converted-space">    </span>this.x = x; this.y = y;</p>
<p class="p1"><span class="Apple-converted-space">    </span>this.w = w; this.h = h;</p>
<p class="p1"><span class="Apple-converted-space">    </span>this.str = str;</p>
<p class="p1"><span class="Apple-converted-space">    </span>this.scl = 1;</p>
<p class="p1"><span class="Apple-converted-space">    </span>this.gray = 150;</p>
<p class="p1"><span class="Apple-converted-space">    </span>this.state = false;</p>
<p class="p1"><span class="Apple-converted-space">  </span>}</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">  </span>display() {</p>
<p class="p1"><span class="Apple-converted-space">    </span>push();</p>
<p class="p1"><span class="Apple-converted-space">    </span>rectMode(CENTER);</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">    </span>if (this.hover() || this.state) {</p>
<p class="p1"><span class="Apple-converted-space">      </span>this.gray = lerp(this.gray, 200, 0.12);</p>
<p class="p1"><span class="Apple-converted-space">      </span>this.scl = lerp(this.scl, 1.2, 0.12);</p>
<p class="p1"><span class="Apple-converted-space">    </span>} else {</p>
<p class="p1"><span class="Apple-converted-space">      </span>this.gray = lerp(this.gray, 150, 0.12);</p>
<p class="p1"><span class="Apple-converted-space">      </span>this.scl = lerp(this.scl, 1, 0.12);</p>
<p class="p1"><span class="Apple-converted-space">    </span>}</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">    </span>translate(this.x, this.y);</p>
<p class="p1"><span class="Apple-converted-space">    </span>push();</p>
<p class="p1"><span class="Apple-converted-space">    </span>scale(this.scl);</p>
<p class="p1"><span class="Apple-converted-space">    </span>fill(this.gray);</p>
<p class="p1"><span class="Apple-converted-space">    </span>rect(0, 0, this.w, this.h, 40);</p>
<p class="p1"><span class="Apple-converted-space">    </span>pop();</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">    </span>fill(255);</p>
<p class="p1"><span class="Apple-converted-space">    </span>textAlign(CENTER, CENTER);</p>
<p class="p1"><span class="Apple-converted-space">    </span>textSize(this.h * 0.5);</p>
<p class="p1"><span class="Apple-converted-space">    </span>text(this.str, 0, 0);</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">    </span>pop();</p>
<p class="p1"><span class="Apple-converted-space">  </span>}</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">  </span>hover() {</p>
<p class="p1"><span class="Apple-converted-space">    </span>return (abs(mouseX - this.x) &lt; this.w / 2 &amp;&amp;</p>
<p class="p1"><span class="Apple-converted-space">            </span>abs(mouseY - this.y) &lt; this.h / 2);</p>
<p class="p1"><span class="Apple-converted-space">  </span>}</p>
<p class="p1">}</p>
<p class="p2"><br></p>
<p class="p2"><br></p>
<p class="p1">// ----- Slider -----</p>
<p class="p1">class Slider {</p>
<p class="p1"><span class="Apple-converted-space">  </span>constructor(x, y, w, h, str) {</p>
<p class="p1"><span class="Apple-converted-space">    </span>this.x = x; this.y = y;</p>
<p class="p1"><span class="Apple-converted-space">    </span>this.w = w; this.h = h;</p>
<p class="p1"><span class="Apple-converted-space">    </span>this.str = str;</p>
<p class="p1"><span class="Apple-converted-space">    </span>this.val = 0.5;</p>
<p class="p1"><span class="Apple-converted-space">    </span>this.state = false;</p>
<p class="p1"><span class="Apple-converted-space">  </span>}</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">  </span>run() {</p>
<p class="p1"><span class="Apple-converted-space">    </span>this.drag();</p>
<p class="p1"><span class="Apple-converted-space">    </span>this.display();</p>
<p class="p1"><span class="Apple-converted-space">  </span>}</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">  </span>display() {</p>
<p class="p1"><span class="Apple-converted-space">    </span>push();</p>
<p class="p1"><span class="Apple-converted-space">    </span>translate(this.x, this.y);</p>
<p class="p1"><span class="Apple-converted-space">    </span>rectMode(CENTER);</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">    </span>fill(60);</p>
<p class="p1"><span class="Apple-converted-space">    </span>rect(0, 0, this.w, this.h, this.h);</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">    </span>let vw = map(this.val, 0, 1, 0, this.w);</p>
<p class="p1"><span class="Apple-converted-space">    </span>fill(120);</p>
<p class="p1"><span class="Apple-converted-space">    </span>rect(-this.w / 2, -this.h / 2, vw, this.h, this.h);</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">    </span>fill(255);</p>
<p class="p1"><span class="Apple-converted-space">    </span>textAlign(CENTER, CENTER);</p>
<p class="p1"><span class="Apple-converted-space">    </span>textSize(this.h * 0.4);</p>
<p class="p1"><span class="Apple-converted-space">    </span>text(this.str, 0, 0);</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">    </span>pop();</p>
<p class="p1"><span class="Apple-converted-space">  </span>}</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">  </span>click() {</p>
<p class="p1"><span class="Apple-converted-space">    </span>if (this.hover()) this.state = true;</p>
<p class="p1"><span class="Apple-converted-space">    </span>else this.state = false;</p>
<p class="p1"><span class="Apple-converted-space">  </span>}</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">  </span>drag() {</p>
<p class="p1"><span class="Apple-converted-space">    </span>if (this.state) {</p>
<p class="p1"><span class="Apple-converted-space">      </span>let v = map(mouseX, this.x - this.w / 2, this.x + this.w / 2, 0, 1);</p>
<p class="p1"><span class="Apple-converted-space">      </span>this.val = constrain(v, 0, 1);</p>
<p class="p1"><span class="Apple-converted-space">    </span>}</p>
<p class="p1"><span class="Apple-converted-space">  </span>}</p>
<p class="p2"><br></p>
<p class="p1"><span class="Apple-converted-space">  </span>hover() {</p>
<p class="p1"><span class="Apple-converted-space">    </span>return (abs(mouseX - this.x) &lt; this.w / 2 &amp;&amp;</p>
<p class="p1"><span class="Apple-converted-space">            </span>abs(mouseY - this.y) &lt; this.h / 2);</p>
<p class="p1"><span class="Apple-converted-space">  </span>}</p>
<p class="p1">}</p>
</body>
</html>
