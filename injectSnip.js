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
      
      chrome.storage.session.get({ activeSnips: [] }, (result) => {
        if (result.activeSnips.length >= 5) {
          showToast("Maximum 5 snips active. Close one to continue.");
          return;
        }
        isSnipping = true;
        createOverlay();
      });
    } else if (request.action === "crop_image") {
      cropImage(request.dataUrl, request.area, request.devicePixelRatio);
    