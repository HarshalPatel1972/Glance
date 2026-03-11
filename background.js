const DBG = (...a) => console.log('[Glance BG]', ...a);

const isRestrictedUrl = (url) => !url || url.startsWith("chrome://") || url.startsWith("edge://") || url.startsWith("about:");

function sendToTab(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve({ ok: true, response });
    });
  });
}

async function ensureInjected(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"]
  });
  await chrome.scripting.insertCSS({
    target: { tabId },
    files: ["content.css"]
  });
}

async function sendWithInjection(tabId, message) {
  let result = await sendToTab(tabId, message);
  if (result.ok) return result;

  const missingReceiver = result.error && result.error.includes('Receiving end does not exist');
  if (!missingReceiver) return result;

  await ensureInjected(tabId);
  await new Promise((r) => setTimeout(r, 120));
  result = await sendToTab(tabId, message);
  return result;
}

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
      if (!tab || isRestrictedUrl(tab.url)) return;

      const result = await sendWithInjection(tab.id, { action: 'activate_snip' });
      if (!result.ok) DBG('activate_snip error:', result.error);
      else DBG('activate_snip ack:', result.response);
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
    return true;
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'get_active_snips') {
    chrome.storage.session.get({ activeSnips: [] }, (result) => {
      if (chrome.runtime.lastError) {
        DBG('get_active_snips error:', chrome.runtime.lastError.message);
        sendResponse({ ok: false, activeSnips: [] });
        return;
      }
      sendResponse({ ok: true, activeSnips: Array.isArray(result.activeSnips) ? result.activeSnips : [] });
    });
    return true;
  }

  if (request.action === 'set_active_snips') {
    const activeSnips = Array.isArray(request.activeSnips) ? request.activeSnips : [];
    chrome.storage.session.set({ activeSnips }, () => {
      if (chrome.runtime.lastError) {
        DBG('set_active_snips error:', chrome.runtime.lastError.message);
        sendResponse({ ok: false });
        return;
      }
      sendResponse({ ok: true });
    });
    return true;
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
    if (isRestrictedUrl(tab.url)) return;

    const result = await sendWithInjection(tab.id, { action: "restore_snips" });
    if (!result.ok) DBG('restore_snips msg error:', result.error);
    else DBG('restore_snips ack:', result.response);
  } catch (e) {
    DBG('injectAndRestore skipped/error:', e.message);
  }
}
