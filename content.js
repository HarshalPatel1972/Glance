if (typeof window.glanceSnippingInitialized === 'undefined') {
  window.glanceSnippingInitialized = true;
  
  let isSnipping = false;
  let overlayContent = null;

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
    document.body.appendChild(overlayContent);
  }
}