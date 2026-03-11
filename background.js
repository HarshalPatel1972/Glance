chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get({ savedSnips: [], snipExpirationDays: 7 }, (res) => {
    const now = Date.now();
    const maxAge = res.snipExpirationDays * 24 * 60 * 60 * 1000;
    const filtered = res.savedSnips.filter(s => now - s.timestamp < maxAge);
    if(filtered.length !== res.savedSnips.length) {
      chrome.storage.local.set({ savedSnips: filtered });
    }
  });
});

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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => { if(request.action === "update_badge") { if(request.count > 0) { chrome.action.setBadgeText({text: request.count.toString()}); chrome.action.setBadgeBackgroundColor({color: "#4688F1"}); } else { chrome.action.setBadgeText({text: ""}); } } });
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  injectAndRestore(activeInfo.tabId);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    injectAndRestore(tabId);
  }
});

async function injectAndRestore(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("edge://") || tab.url.startsWith("about:")) return;

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ["content.css"]
    });

    chrome.tabs.sendMessage(tab.id, { action: "restore_snips" });
  } catch (e) {
    // Ignore errors for uninjectable tabs
  }
}
