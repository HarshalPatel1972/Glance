const fs = require('fs');
let c = fs.readFileSync('content.js', 'utf8');

c = c.replace(
`    const drawBtn = document.createElement("button");`,
`    const reframeBtn = document.createElement("button");
    reframeBtn.className = "glance-btn glance-reframe-btn";
    reframeBtn.innerHTML = "⛶";
    reframeBtn.title = "Reframe Snip";
    reframeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      widget.style.display = 'none';
      window.glanceReframingTarget = widget;
      
      const left = parseFloat(widget.style.left) || 0;
      const top = parseFloat(widget.style.top) || 0;
      const w = parseFloat(widget.style.width) || 0;
      const h = parseFloat(widget.style.height) || 0;
      
      isSnipping = true;
      createOverlay();
      
      // Simulate initial selection box matches widget position
      startX = left;
      startY = top;
      endX = left + w;
      endY = top + h;
      
      selectionBox.style.left = left + "px";
      selectionBox.style.top = top + "px";
      selectionBox.style.width = w + "px";
      selectionBox.style.height = h + "px";
      selectionBox.style.display = "block";
    });

    toolbar.appendChild(reframeBtn);
    const drawBtn = document.createElement("button");`
);

c = c.replace(
`  function captureSelection(left, top, width, height) {
    // Send coordinates to background to capture
    chrome.runtime.sendMessage({
      action: "capture_area",
      area: { left, top, width, height },
      devicePixelRatio: window.devicePixelRatio
    });
  }`,
`  function captureSelection(left, top, width, height) {
    chrome.runtime.sendMessage({
      action: "capture_area",
      area: { left, top, width, height },
      devicePixelRatio: window.devicePixelRatio,
      reframeId: window.glanceReframingTarget ? window.glanceReframingTarget.dataset.snipId : null
    });
  }`
);

// We need background.js to reflect back reframeId
let bg = fs.readFileSync('background.js', 'utf8');
bg = bg.replace(
`      chrome.tabs.sendMessage(sender.tab.id, {
        action: "crop_image",
        dataUrl: dataUrl,
        area: request.area,
        devicePixelRatio: request.devicePixelRatio
      });`,
`      chrome.tabs.sendMessage(sender.tab.id, {
        action: "crop_image",
        dataUrl: dataUrl,
        area: request.area,
        devicePixelRatio: request.devicePixelRatio,
        reframeId: request.reframeId
      });`
);
fs.writeFileSync('background.js', bg);

c = c.replace(
`cropImage(request.dataUrl, request.area, request.devicePixelRatio);`,
`cropImage(request.dataUrl, request.area, request.devicePixelRatio, request.reframeId);`
);

c = c.replace(
`function cropImage(dataUrl, area, dpr) {`,
`function cropImage(dataUrl, area, dpr, reframeId) {`
);

c = c.replace(
`        const croppedDataUrl = canvas.toDataURL('image/png');
        chrome.storage.session.get({ activeSnips: [] }, (result) => {
          createWidget({
            image: croppedDataUrl,
            width: area.width,
            height: area.height,
            snipNumber: result.activeSnips.length + 1
          });
        });
      };`,
`        const croppedDataUrl = canvas.toDataURL('image/png');
        if (reframeId) {
          const widget = document.querySelector(\`.glance-widget[data-snip-id="\${reframeId}"]\`);
          if (widget) {
            widget.style.display = 'block';
            widget.style.width = area.width + "px";
            widget.style.height = area.height + "px";
            widget.style.left = area.left + "px";
            widget.style.top = area.top + "px";
            const img = widget.querySelector('.glance-widget-img');
            if (img) img.src = croppedDataUrl;
            widget.dataset.image = croppedDataUrl;
            
            // Clear canvas
            const targetCanvas = widget.querySelector('.glance-widget-canvas');
            if (targetCanvas) {
              targetCanvas.width = area.width;
              targetCanvas.height = area.height;
              targetCanvas.getContext('2d').clearRect(0, 0, area.width, area.height);
            }
            saveWidgetState(widget);
          }
          window.glanceReframingTarget = null;
        } else {
          chrome.storage.session.get({ activeSnips: [] }, (result) => {
            createWidget({
              image: croppedDataUrl,
              width: area.width,
              height: area.height,
              snipNumber: result.activeSnips.length + 1,
              left: area.left + "px",
              top: area.top + "px"
            });
          });
        }
      };`
);

// We should also abort reframing cleanly in `closeOverlay`
c = c.replace(
`  function closeOverlay() {
    isSnipping = false;
    document.removeEventListener("keydown", handleKeyDown);
    if (overlayContent && overlayContent.parentNode) {
      overlayContent.parentNode.removeChild(overlayContent);
      overlayContent = null;
      selectionBox = null;
    }
  }`,
`  function closeOverlay() {
    isSnipping = false;
    document.removeEventListener("keydown", handleKeyDown);
    if (overlayContent && overlayContent.parentNode) {
      overlayContent.parentNode.removeChild(overlayContent);
      overlayContent = null;
      selectionBox = null;
    }
    // If we aborted while reframing, restore the widget
    if (window.glanceReframingTarget) {
      window.glanceReframingTarget.style.display = 'block';
      window.glanceReframingTarget = null;
    }
  }`
);

fs.writeFileSync('content.js', c);
