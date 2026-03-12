const fs = require("fs");
let c = fs.readFileSync("content.js", "utf8");

c = c.replace(
  `    const reframeBtn = document.createElement("button");`,
  `    const textBtn = document.createElement("button");
    textBtn.className = "glance-btn glance-text-btn";
    textBtn.innerHTML = "T";
    textBtn.title = "Add Text Note";
    let isTextMode = false;
    textBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      isTextMode = !isTextMode;
      textBtn.style.background = isTextMode ? "#ddd" : "none";
      widget.classList.toggle("text-mode", isTextMode);
    });
    toolbar.appendChild(textBtn);

    const reframeBtn = document.createElement("button");`,
);

c = c.replace(
  `    canvas.addEventListener('mousedown', (e) => {
      if(!isDrawingMode) return;`,
  `    canvas.addEventListener('mousedown', (e) => {
      if (isTextMode) {
        e.stopPropagation();
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const ta = document.createElement("textarea");
        ta.className = "glance-text-note";
        ta.style.position = "absolute";
        ta.style.left = x + "px";
        ta.style.top = y + "px";
        ta.style.background = "rgba(255,255,255,0.8)";
        ta.style.border = "1px dashed #333";
        ta.style.padding = "4px";
        ta.style.color = "#000";
        ta.style.fontFamily = "sans-serif";
        ta.style.fontSize = "14px";
        ta.style.zIndex = "3";
        ta.style.minWidth = "100px";
        ta.style.minHeight = "40px";
        
        // Auto-resize
        ta.addEventListener('input', () => {
          ta.style.height = 'auto';
          ta.style.height = ta.scrollHeight + 'px';
        });
        
        // Make draggable by the textarea itself or allow typing
        let isTaDragging = false;
        let startTaX, startTaY, initLeft, initTop;
        ta.addEventListener('mousedown', (te) => {
          if (isTextMode) {
             // In text mode, maybe we drag it
             isTaDragging = true;
             startTaX = te.clientX;
             startTaY = te.clientY;
             initLeft = parseFloat(ta.style.left) || 0;
             initTop = parseFloat(ta.style.top) || 0;
          }
          te.stopPropagation();
        });
        document.addEventListener('mousemove', (te) => {
          if (!isTaDragging) return;
          ta.style.left = initLeft + (te.clientX - startTaX) + "px";
          ta.style.top = initTop + (te.clientY - startTaY) + "px";
        });
        document.addEventListener('mouseup', () => isTaDragging = false);

        widget.appendChild(ta);
        ta.focus();
        
        // Turn off text mode after placing one
        isTextMode = false;
        textBtn.style.background = "none";
        widget.classList.remove("text-mode");
        return;
      }

      if(!isDrawingMode) return;`,
);

fs.writeFileSync("content.js", c);
