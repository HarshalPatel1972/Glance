if (typeof window.glanceSnippingInitialized === 'undefined') {
  window.glanceSnippingInitialized = true;
  
  let isSnipping = false;
  let overlayContent = null;
  let selectionBox = null;
  
  let startX = 0, startY = 0;
  let endX = 0, endY = 0;
  let isDragging = false;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "activate_snip") {
      if (isSnipping) return;
      isSnipping = true;
      createOverlay();
    } else if (request.action === "crop_image") {
      cropImage(request.dataUrl, request.area, request.devicePixelRatio);
    }
  });

  function cropImage(dataUrl, area, dpr) {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      canvas.width = area.width;
      canvas.height = area.height;

      // Draw the cropped region to the canvas
      ctx.drawImage(
        img,
        area.left * dpr,
        area.top * dpr,
        area.width * dpr,
        area.height * dpr,
        0,
        0,
        area.width,
        area.height
      );

      const croppedDataUrl = canvas.toDataURL('image/png');
      createWidget(croppedDataUrl, area.width, area.height);
    };
    img.src = dataUrl;
  }

  function createWidget(dataUrl, width, height) {
    const widget = document.createElement("div");
    widget.className = "glance-widget";
    widget.style.width = width + "px";
    widget.style.height = height + "px";
    // Set initial position centered
    widget.style.left = Math.max(10, (window.innerWidth - width) / 2) + "px";
    widget.style.top = Math.max(10, (window.innerHeight - height) / 2) + "px";

    const img = document.createElement("img");
    img.className = "glance-widget-img";
    img.src = dataUrl;
    widget.appendChild(img);

    document.body.appendChild(widget);
  }

  function createOverlay() {
    if (document.getElementById("glance-snipping-overlay")) return;

    overlayContent = document.createElement("div");
    overlayContent.id = "glance-snipping-overlay";
    
    selectionBox = document.createElement("div");
    selectionBox.id = "glance-selection-box";
    overlayContent.appendChild(selectionBox);

    overlayContent.addEventListener("mousedown", onMouseDown);
    overlayContent.addEventListener("mousemove", onMouseMove);
    overlayContent.addEventListener("mouseup", onMouseUp);

    document.body.appendChild(overlayContent);
  }

  function onMouseDown(e) {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    
    selectionBox.style.left = startX + "px";
    selectionBox.style.top = startY + "px";
    selectionBox.style.width = "0px";
    selectionBox.style.height = "0px";
    selectionBox.style.display = "block";
  }

  function onMouseMove(e) {
    if (!isDragging) return;
    
    endX = e.clientX;
    endY = e.clientY;
    
    const left = Math.min(startX, endX);
    const top = Math.min(startY, endY);
    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);
    
    selectionBox.style.left = left + "px";
    selectionBox.style.top = top + "px";
    selectionBox.style.width = width + "px";
    selectionBox.style.height = height + "px";
  }

  function onMouseUp(e) {
    if (!isDragging) return;
    isDragging = false;
    
    const left = Math.min(startX, endX);
    const top = Math.min(startY, endY);
    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);
    
    // Only capture if selection is large enough
    if (width > 10 && height > 10) {
      captureSelection(left, top, width, height);
    }
    
    closeOverlay();
  }

  function closeOverlay() {
    isSnipping = false;
    if (overlayContent && overlayContent.parentNode) {
      overlayContent.parentNode.removeChild(overlayContent);
      overlayContent = null;
      selectionBox = null;
    }
  }

  function captureSelection(left, top, width, height) {
    // Show a brief flash animation
    const flash = document.createElement("div");
    flash.id = "glance-flash";
    document.body.appendChild(flash);
    setTimeout(() => {
      if (flash.parentNode) flash.parentNode.removeChild(flash);
    }, 200);

    // Send coordinates to background to capture
    chrome.runtime.sendMessage({
      action: "capture_area",
      area: { left, top, width, height },
      devicePixelRatio: window.devicePixelRatio
    });
  }
}