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
    } else if (request.action === "inject_snip") {
      // Re-inject saved snip
      const img = new Image();
      img.onload = () => {
        createWidget(request.image, img.width, img.height);
      };
      img.src = request.image;
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

    const toolbar = document.createElement("div");
    toolbar.className = "glance-widget-toolbar";
    
    const opacitySlider = document.createElement("input");
    opacitySlider.type = "range";
    opacitySlider.min = "0.1";
    opacitySlider.max = "1";
    opacitySlider.step = "0.1";
    opacitySlider.value = "1";
    opacitySlider.className = "glance-opacity-slider";
    opacitySlider.title = "Adjust Opacity";
    opacitySlider.addEventListener("input", (e) => {
      widget.style.opacity = e.target.value;
    });
    // Prevent dragging when using slider
    opacitySlider.addEventListener("mousedown", (e) => {
      e.stopPropagation();
    });

    const saveBtn = document.createElement("button");
    saveBtn.className = "glance-btn glance-save-btn";
    saveBtn.innerHTML = "🔖";
    saveBtn.title = "Save Snip";
    saveBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      saveSnip(dataUrl);
      saveBtn.innerHTML = "✓";
      setTimeout(() => saveBtn.innerHTML = "🔖", 1500);
    });

    const closeBtn = document.createElement("button");
    closeBtn.className = "glance-btn glance-close-btn";
    closeBtn.innerHTML = "✕";
    closeBtn.title = "Close plugin";
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      widget.remove();
    });

    toolbar.appendChild(saveBtn);
    toolbar.appendChild(closeBtn);
    widget.appendChild(toolbar);

    const img = document.createElement("img");
    img.className = "glance-widget-img";
    img.src = dataUrl;
    widget.appendChild(img);

    document.body.appendChild(widget);
    
    makeDraggable(widget);
  }

  function makeDraggable(element) {
    let isDragging = false;
    let startX, startY;
    let initialLeft, initialTop;

    element.addEventListener("mousedown", (e) => {
      // Prevent dragging if clicking on interactive elements inside widget later
      if (e.target.closest('.glance-btn')) return;

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      initialLeft = parseFloat(element.style.left) || 0;
      initialTop = parseFloat(element.style.top) || 0;
      
      // Stop events from bubbling
      e.stopPropagation();
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      element.style.left = (initialLeft + dx) + "px";
      element.style.top = (initialTop + dy) + "px";
    });

    document.addEventListener("mouseup", () => {
      isDragging = false;
    });
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

    document.addEventListener("keydown", handleKeyDown);

    document.body.appendChild(overlayContent);
  }

  function handleKeyDown(e) {
    if (e.key === "Escape") {
      closeOverlay();
    }
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
    document.removeEventListener("keydown", handleKeyDown);
    if (overlayContent && overlayContent.parentNode) {
      overlayContent.parentNode.removeChild(overlayContent);
      overlayContent = null;
      selectionBox = null;
    }
  }

  function saveSnip(dataUrl) {
    const snip = {
      id: Date.now().toString(),
      image: dataUrl,
      timestamp: Date.now(),
      url: window.location.href
    };

    chrome.storage.local.get({ savedSnips: [] }, (result) => {
      let snips = result.savedSnips;
      snips.unshift(snip); // add to front
      
      // Limit to 20 snips
      if (snips.length > 20) {
        snips = snips.slice(0, 20);
      }
      
      chrome.storage.local.set({ savedSnips: snips });
    });
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