const DBG = (...a) => console.log('[Glance BG]', ...a);

chrome.runtime.onStartup.addListener(() => {
  DBG('onStartup fired');
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
      if (!tab || !tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("edge://") || tab.url.startsWith("about:")) return;
      
      // Inject the scripts and styles
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"]
      });
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ["content.css"]
      });
      
      DBG('Injected content scripts OK, sending activate_snip');
      chrome.tabs.sendMessage(tab.id, { action: "activate_snip" }, (r) => {
        if (chrome.runtime.lastError) DBG('sendMessage activate_snip error:', chrome.runtime.lastError.message);
        else DBG('activate_snip ack:', r);
      });
    } catch (err) {
      console.error('[Glance BG] Failed to inject snip mode:', err);
    }
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  DBG('Message received:', request.action);
  if (request.action === "capture_area") {
    DBG('Capturing visible tab...');
    chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError) { console.error('[Glance BG] captureVisibleTab error:', chrome.runtime.lastError.message); return; }
      DBG('Capture success, cropping area:', request.area);
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
  DBG('injectAndRestore tabId:', tabId);
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

    setTimeout(() => {
      chrome.tabs.sendMessage(tab.id, { action: "restore_snips" }, (r) => {
        if (chrome.runtime.lastError) DBG('restore_snips msg error:', chrome.runtime.lastError.message);
        else DBG('restore_snips ack:', r);
      });
    }, 150);
  } catch (e) {
    DBG('injectAndRestore skipped/error:', e.message);
  }
}
