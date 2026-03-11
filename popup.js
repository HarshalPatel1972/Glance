document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("snips-container");
  const emptyState = document.getElementById("empty-state");

  function loadSnips() {
    chrome.storage.local.get({ savedSnips: [] }, (result) => {
      const snips = result.savedSnips;
      if (snips.length > 0) {
        emptyState.style.display = "none";
        renderSnips(snips);
      } else {
        emptyState.style.display = "block";
      }
    });
  }

  function renderSnips(snips) {
    // Keep empty state, remove others
    container.innerHTML = "";
    container.appendChild(emptyState);

    snips.forEach(snip => {
      const item = document.createElement("div");
      item.className = "snip-item";

      const img = document.createElement("img");
      img.src = snip.image;
      img.className = "snip-thumb";

      const info = document.createElement("div");
      info.className = "snip-info";
      const date = new Date(snip.timestamp).toLocaleString();
      info.innerText = date;

      item.appendChild(img);
      item.appendChild(info);
      
      item.addEventListener("click", () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs.length > 0) {
            // Make sure content script is available, then send message
            chrome.scripting.executeScript({
              target: { tabId: tabs[0].id },
              files: ["content.js"]
            }).then(() => {
              chrome.scripting.insertCSS({
                target: { tabId: tabs[0].id },
                files: ["content.css"]
              });
              
              chrome.tabs.sendMessage(tabs[0].id, {
                action: "inject_snip",
                image: snip.image
              });
            }).catch(err => console.log(err));
          }
        });
      });

      container.appendChild(item);
    });
  }

  loadSnips();

  const clearBtn = document.getElementById("clear-all");
  clearBtn.addEventListener("click", () => {
    chrome.storage.local.set({ savedSnips: [] }, () => {
      loadSnips();
    });
  });
});

document.getElementById("save-workspace").addEventListener("click", () => {
  chrome.storage.session.get({ activeSnips: [] }, (res) => {
    chrome.storage.local.set({ savedWorkspace: res.activeSnips }, () => {
      alert("Workspace Saved!");
    });
  });
});

document.getElementById("load-workspace").addEventListener("click", () => {
  chrome.storage.local.get({ savedWorkspace: [] }, (res) => {
    chrome.storage.session.set({ activeSnips: res.savedWorkspace }, async () => {
      chrome.runtime.sendMessage({ action: "update_badge", count: res.savedWorkspace.length });
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if(tab) {
        chrome.tabs.sendMessage(tab.id, { action: "restore_snips" });
      }
      alert("Workspace Loaded!");
    });
  });
});
