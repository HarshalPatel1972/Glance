const fs = require('fs');
let c = fs.readFileSync('content.js', 'utf8');

c = c.replace(
`    toolbar.appendChild(closeBtn);
    widget.appendChild(toolbar);`,
`    const drawBtn = document.createElement("button");
    drawBtn.className = "glance-btn glance-draw-btn";
    drawBtn.innerHTML = "🖌";
    drawBtn.title = "Toggle Pen/Draw";
    
    let isDrawingMode = false;
    let currentColor = "red";
    let isPainting = false;
    let lastX = 0, lastY = 0;

    const colorPicker = document.createElement("div");
    colorPicker.className = "glance-color-picker";
    const colors = ["red", "yellow", "blue", "black"];
    colors.forEach(color => {
      const btn = document.createElement("div");
      btn.className = "glance-color-btn";
      btn.style.backgroundColor = color;
      if(color === 'yellow') btn.style.border = '1px solid #aaa';
      if(color === 'black') btn.style.border = '1px solid #222';
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        currentColor = color;
        drawBtn.style.color = color;
      });
      colorPicker.appendChild(btn);
    });
    toolbar.appendChild(colorPicker);

    drawBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      isDrawingMode = !isDrawingMode;
      if (isDrawingMode) {
        widget.classList.add("drawing-mode");
        drawBtn.style.background = "#ddd";
        drawBtn.style.color = currentColor;
      } else {
        widget.classList.remove("drawing-mode");
        drawBtn.style.background = "none";
        drawBtn.style.color = "inherit";
      }
    });

    toolbar.appendChild(drawBtn);
    toolbar.appendChild(closeBtn);
    widget.appendChild(toolbar);`
);

let canvasSetup = `    const canvas = document.createElement("canvas");
    canvas.className = "glance-widget-canvas";
    canvas.width = width;
    canvas.height = height;
    widget.appendChild(canvas);`;

c = c.replace(
canvasSetup,
`${canvasSetup}
    
    const ctx = canvas.getContext('2d');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;

    canvas.addEventListener('mousedown', (e) => {
      if(!isDrawingMode) return;
      isPainting = true;
      const rect = canvas.getBoundingClientRect();
      lastX = e.clientX - rect.left;
      lastY = e.clientY - rect.top;
    });

    canvas.addEventListener('mousemove', (e) => {
      if(!isDrawingMode || !isPainting) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      ctx.strokeStyle = currentColor;
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(x, y);
      ctx.stroke();

      lastX = x;
      lastY = y;
    });

    canvas.addEventListener('mouseup', () => isPainting = false);
    canvas.addEventListener('mouseleave', () => isPainting = false);
`
);

fs.writeFileSync('content.js', c);
