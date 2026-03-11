chrome.commands.onCommand.addListener((command) => {
  if (command === "trigger_snip") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          files: ["content.js"]
        });
        chrome.scripting.insertCSS({
          target: { tabId: tabs[0].id },
          files: ["content.css"]
        });
        // We'll send a message to the content script to activate snip mode
        chrome.tabs.sendMessage(tabs[0].id, { action: "activate_snip" });
      }
    });
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