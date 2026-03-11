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
    }
  });

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