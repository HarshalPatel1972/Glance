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