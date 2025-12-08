<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>The Path Method: Complete Experience</title>
    <style>
        /* --- 全局重置 --- */
        body {
            margin: 0;
            overflow: hidden;
            background-color: #000;
            color: #ccc;
            font-family: 'Roboto Mono', 'Consolas', monospace;
            height: 100vh;
            width: 100vw;
        }

        /* --- 通用背景网格 (所有界面共用) --- */
        .grid-bg {
            position: absolute;
            top: 0; left: 0; width: 100%; height: 100%;
            background-image: 
                linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
            background-size: 50px 50px;
            z-index: -1;
            pointer-events: none;
        }

        /* =========================================
           LEVEL 1: LANDING PAGE (一级界面 - 首页)
           ========================================= */
        #level-1 {
            position: absolute;
            top: 0; left: 0; width: 100%; height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            z-index: 10;
            transition: opacity 0.8s ease;
            background: radial-gradient(circle at center, rgba(0,20,0,0.4), #000 90%);
        }

        .hero-content {
            max-width: 800px;
            text-align: center;
            padding: 40px;
            border: 1px solid #333;
            background: rgba(10, 10, 10, 0.8);
            backdrop-filter: blur(5px);
            box-shadow: 0 0 50px rgba(0,0,0,0.5);
        }

        h1.main-title {
            font-size: 3rem;
            color: #fff;
            margin-bottom: 10px;
            letter-spacing: 5px;
            text-transform: uppercase;
            border-bottom: 2px solid #fff;
            display: inline-block;
            padding-bottom: 10px;
        }

        .subtitle {
            font-size: 0.9rem;
            color: #00ffcc;
            margin-bottom: 30px;
            letter-spacing: 2px;
            text-transform: uppercase;
        }

        .manifesto {
            font-size: 0.85rem;
            line-height: 1.8;
            color: #888;
            text-align: left;
            margin-bottom: 40px;
            font-family: 'Helvetica', sans-serif; /* 阅读体验更好 */
            border-left: 2px solid #333;
            padding-left: 20px;
        }

        .start-btn {
            background: transparent;
            color: #00ffcc;
            border: 1px solid #00ffcc;
            padding: 15px 40px;
            font-size: 1rem;
            font-family: 'Roboto Mono', monospace;
            cursor: pointer;
            transition: all 0.3s ease;
            text-transform: uppercase;
            letter-spacing: 2px;
        }

        .start-btn:hover {
            background: #00ffcc;
            color: #000;
            box-shadow: 0 0 20px rgba(0, 255, 204, 0.4);
        }

        /* =========================================
           LEVEL 2: LABORATORY (二级界面 - 实验台)
           ========================================= */
        #level-2 {
            position: absolute;
            top: 0; left: 0; width: 100%; height: 100%;
            display: flex;
            opacity: 0;
            pointer-events: none; /* 初始不可点击 */
            transition: opacity 0.8s ease;
            z-index: 5;
        }

        /* 激活状态 */
        #level-2.active {
            opacity: 1;
            pointer-events: auto;
            z-index: 20;
        }

        /* 实验台左侧画布 */
        #canvas-container {
            flex-grow: 1;
            position: relative;
            display: flex;
            justify-content: center;
            align-items: center;
        }

        /* 实验台右侧控制台 */
        #controls {
            width: 360px;
            background: #0b0b0b;
            border-left: 1px solid #333;
            padding: 25px;
            display: flex;
            flex-direction: column;
            gap: 18px;
            box-shadow: -10px 0 40px rgba(0,0,0,0.8);
            overflow-y: auto;
            z-index: 30;
        }

        /* 实验台内部样式 */
        .lab-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #333;
            padding-bottom: 15px;
            margin-bottom: 10px;
        }

        .back-btn {
            font-size: 0.7rem;
            color: #666;
            cursor: pointer;
            border: 1px solid #333;
            padding: 5px 10px;
            transition: 0.2s;
        }
        .back-btn:hover { border-color: #fff; color: #fff; }

        h2.lab-title {
            font-size: 0.9rem; margin: 0; color: #fff; letter-spacing: 1px;
        }

        .control-group { display: flex; flex-direction: column; gap: 5px; }
        
        .label-row {
            display: flex; justify-content: space-between;
            font-size: 0.7rem; color: #888; text-transform: uppercase; font-weight: bold;
        }
        .value-display { color: #00ffcc; font-family: 'Consolas', monospace; }

        #scope-container {
            border: 1px solid #333; background: #000; height: 80px; position: relative;
        }
        canvas#oscilloscope { width: 100%; height: 100%; display: block; }

        select {
            width: 100%; padding: 10px; background: #111; color: #fff;
            border: 1px solid #444; outline: none; font-family: inherit;
        }
        input[type="range"] {
            -webkit-appearance: none; width: 100%; height: 2px;
            background: #444; outline: none; margin-top: 8px;
        }
        input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none; width: 12px; height: 12px;
            background: #00ffcc; border-radius: 50%;
            cursor: pointer; transition: transform 0.1s;
        }
        input[type="range"]::-webkit-slider-thumb:hover { transform: scale(1.5); }

        .math-big {
            font-family: 'Times New Roman', serif; font-style: italic;
            font-size: 1.4rem; color: #fff; text-align: center; margin: 10px 0;
            font-weight: bold;
        }
    </style>
</head>
<body>

    <div class="grid-bg"></div>

    <div id="level-1">
        <div class="hero-content">
            <h1 class="main-title">The Path Method</h1>
            <div class="subtitle">Mathematical Logic & Typography</div>
            
            <div class="manifesto">
                <p><strong>The Path Method:</strong> By cleverly combining the path of mathematical functions with the outline of letters, a dynamic and beautiful font design is formed.</p>
                <p>This method not only demonstrates the close connection between mathematics and design but also provides users with a platform to explore new possibilities in digital art.</p>
                <p style="margin-top:20px; color:#555; font-size:0.75rem;">
                    CORE FUNCTIONS: f(x)=sin(x) | f(x)=tan(x) | f(x)=x² | f(x)=x³
                </p>
            </div>

            <button class="start-btn" onclick="enterLab()">Enter Laboratory</button>
        </div>
    </div>

    <div id="level-2">
        <div id="canvas-container">
            <canvas id="mainCanvas"></canvas>
        </div>

        <div id="controls">
            <div class="lab-header">
                <h2 class="lab-title">CONTROL PANEL</h2>
                <div class="back-btn" onclick="exitLab()">← BACK TO HOME</div>
            </div>

            <div class="control-group">
                <div class="label-row">Math Model</div>
                <select id="funcSelect">
                    <option value="sin">Sine Wave [ f(x) = sin(x) ]</option>
                    <option value="tan">Tangent [ f(x) = tan(x) ]</option>
                    <option value="sqr">Quadratic [ f(x) = x² ]</option>
                    <option value="cub">Cubic [ f(x) = x³ ]</option>
                </select>
            </div>

            <div class="math-big" id="formula-text">f(x) = sin(x)</div>

            <div class="control-group">
                <div class="label-row">Oscilloscope</div>
                <div id="scope-container">
                    <canvas id="oscilloscope"></canvas>
                    <div style="position:absolute; top:50%; width:100%; height:1px; background:rgba(255,255,255,0.2);"></div>
                    <div style="position:absolute; left:50%; top:0; height:100%; width:1px; background:rgba(255,255,255,0.1);"></div>
                </div>
            </div>

            <hr style="border:0; border-top:1px solid #222; width:100%;">

            <div class="control-group">
                <div class="label-row"><label>Amplitude (振幅)</label><span id="val-amp" class="value-display">25</span></div>
                <input type="range" id="amp" min="0" max="100" value="25">
            </div>

            <div class="control-group">
                <div class="label-row"><label>Frequency (频率)</label><span id="val-freq" class="value-display">0.10</span></div>
                <input type="range" id="freq" min="0.01" max="0.5" step="0.01" value="0.1">
            </div>

            <div class="control-group">
                <div class="label-row"><label>Velocity (流速)</label><span id="val-speed" class="value-display">1.0x</span></div>
                <input type="range" id="speed" min="0" max="3.0" step="0.1" value="1.0">
            </div>

            <div class="control-group">
                <div class="label-row"><label>Sampling (采样点)</label><span id="val-res" class="value-display">200</span></div>
                <input type="range" id="res" min="4" max="300" step="1" value="200">
            </div>
            
            <div style="margin-top:auto; font-size:0.7rem; color:#555; border-top:1px solid #222; padding-top:10px;">
                Drag "Sampling" to left (< 20) to view discrete vertices.
            </div>
        </div>
    </div>

    <script>
        // === 页面切换逻辑 ===
        function enterLab() {
            document.getElementById('level-1').style.opacity = '0';
            setTimeout(() => {
                document.getElementById('level-1').style.display = 'none';
                document.getElementById('level-2').classList.add('active');
                resize(); // 重新计算画布大小
            }, 800);
        }

        function exitLab() {
            document.getElementById('level-2').classList.remove('active');
            document.getElementById('level-1').style.display = 'flex';
            setTimeout(() => {
                document.getElementById('level-1').style.opacity = '1';
            }, 100);
        }

        // === 实验室核心代码 (Math Logic) ===
        const canvas = document.getElementById('mainCanvas');
        const ctx = canvas.getContext('2d');
        const oscCanvas = document.getElementById('oscilloscope');
        const oscCtx = oscCanvas.getContext('2d');

        // 状态
        const state = {
            func: 'sin',
            amp: 25,
            freq: 0.1,
            speed: 1.0,
            resolution: 200,
            time: 0
        };

        // 辅助：锯齿波相位 (用于将非周期函数映射到循环动画)
        function getSawtoothPhase(t) {
            const period = Math.PI * 2;
            let val = (t % period) / period; 
            return (val * 2) - 1; // -1 到 1
        }

        const MathLogic = {
            sin: (t) => Math.sin(t),
            tan: (t) => Math.max(-5, Math.min(5, Math.tan(t))),
            sqr: (t) => { let x = getSawtoothPhase(t); return x * x; },
            cub: (t) => { let x = getSawtoothPhase(t); return x * x * x; }
        };

        const FormulaText = {
            sin: "f(x) = sin(x)",
            tan: "f(x) = tan(x)",
            sqr: "f(x) = x²",
            cub: "f(x) = x³"
        };

        function generatePath(w, h, count) {
            const pts = [];
            const sx = (canvas.width - w)/2;
            const sy = (canvas.height - h)/2;
            let segments = Math.floor(count/3);
            if(segments < 1) segments = 1;

            // N 的路径
            for(let i=0; i<=segments; i++) {
                let t = i/segments; pts.push({x:sx, y:sy+h*(1-t), ref:i});
            }
            for(let i=0; i<=segments; i++) {
                let t = i/segments; pts.push({x:sx+w*t, y:sy+h*t, ref:segments+i});
            }
            for(let i=0; i<=segments; i++) {
                let t = i/segments; pts.push({x:sx+w, y:sy+h*(1-t), ref:segments*2+i});
            }
            return pts;
        }

        function draw() {
            state.time += state.speed * 0.03;

            // 无论是否在显示，画布都需要刷新以保持动画连贯，
            // 或者你可以判断 if(!level2.active) return; 来节省性能。
            // 这里为了简单，一直运行。
            
            ctx.clearRect(0,0,canvas.width, canvas.height);

            const nWidth = 250;
            const points = generatePath(nWidth, 350, state.resolution);
            
            ctx.strokeStyle = '#00ffcc';
            ctx.lineWidth = 3;
            ctx.lineJoin = state.resolution < 50 ? 'miter' : 'round';
            ctx.beginPath();

            let first = true;
            points.forEach(p => {
                const input = (p.ref * state.freq * 0.1) - state.time;
                let scale = state.amp;
                if(state.func === 'sqr' || state.func === 'cub') scale = state.amp * 1.5;
                const val = MathLogic[state.func](input);
                const offset = val * scale;
                
                if(first) { ctx.moveTo(p.x + offset, p.y); first = false; }
                else { ctx.lineTo(p.x + offset, p.y); }
            });
            ctx.stroke();

            // 绘制采样点 (低分辨率模式)
            if(state.resolution < 50) {
                ctx.fillStyle = '#ff0044';
                points.forEach(p => {
                    const input = (p.ref * state.freq * 0.1) - state.time;
                    let scale = state.amp;
                    if(state.func === 'sqr' || state.func === 'cub') scale = state.amp * 1.5;
                    const val = MathLogic[state.func](input);
                    ctx.fillRect(p.x + val*scale - 2, p.y - 2, 4, 4);
                });
            }

            drawOscilloscope();
            requestAnimationFrame(draw);
        }

        function drawOscilloscope() {
            const w = oscCanvas.width;
            const h = oscCanvas.height;
            oscCtx.clearRect(0, 0, w, h);
            
            // 中线
            oscCtx.strokeStyle = '#333';
            oscCtx.beginPath(); oscCtx.moveTo(0, h/2); oscCtx.lineTo(w, h/2); oscCtx.stroke();

            oscCtx.strokeStyle = '#00ffcc';
            oscCtx.lineWidth = 2;
            oscCtx.beginPath();
            const cx = w/2;
            for(let i=0; i<w; i++) {
                const x = (i - cx) * 0.05 * (state.freq * 10) - state.time;
                let val = MathLogic[state.func](x);
                if(state.func === 'tan') val = Math.max(-2, Math.min(2, val));
                const y = h/2 - val * (h/5);
                if(i===0) oscCtx.moveTo(i, y); else oscCtx.lineTo(i, y);
            }
            oscCtx.stroke();
        }

        // --- 初始化与绑定 ---
        function resize() {
            const cw = document.getElementById('controls').offsetWidth;
            // 如果在 Level 1，canvas容器可能是隐藏的，取 window 宽度
            // 这里为了安全，计算 Level 2 激活时的宽度
            canvas.width = window.innerWidth - cw; 
            canvas.height = window.innerHeight;
            oscCanvas.width = document.getElementById('scope-container').clientWidth;
            oscCanvas.height = 80;
        }
        window.addEventListener('resize', resize);

        document.getElementById('funcSelect').addEventListener('change', (e) => {
            state.func = e.target.value;
            document.getElementById('formula-text').innerText = FormulaText[state.func];
        });

        const sliders = [
            {id:'amp', disp:'val-amp'}, {id:'freq', disp:'val-freq'},
            {id:'speed', disp:'val-speed', suffix:'x'}, {id:'res', disp:'val-res'}
        ];
        sliders.forEach(s => {
            document.getElementById(s.id).addEventListener('input', (e) => {
                let v = parseFloat(e.target.value);
                state[s.id==='res'?'resolution':s.id] = v;
                document.getElementById(s.disp).innerText = v + (s.suffix||'');
            });
        });

        // 启动
        resize();
        draw();

    </script>
</body>
</html>
