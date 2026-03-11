chrome.commands.onCommand.addListener(async (command) => {
  if (command === "trigger_snip") {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;
      
      // Inject the scripts and styles
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"]
      });
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ["content.css"]
      });
      
      // We'll send a message to the content script to activate snip mode
      chrome.tabs.sendMessage(tab.id, { action: "activate_snip" });
    } catch (err) {
      console.error("Failed to inject snip mode:", err);
    }
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "capture_area") {
    chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
      // Send back the full dataUrl for cropping
      chrome.tabs.sendMessage(sender.tab.id, {
        action: "crop_image",
        dataUrl: dataUrl,
        area: request.area,
        devicePixelRatio: request.devicePixelRatio
      });
    });
  }
});