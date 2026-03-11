document.addEventListener("DOMContentLoaded", () => {
  const savedContainer = document.getElementById("snips-container");
  const activeContainer = document.getElementById("active-snips");
  const emptyState = document.getElementById("empty-state");
  const activeCount = document.getElementById("active-count");
  const savedCount = document.getElementById("saved-count");

  function showPopupToast(message) {
    let toast = document.getElementById('popup-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'popup-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 1800);
  }

  function renderGrid(container, snips, onClick) {
    container.innerHTML = "";
    if (!snips.length) {
      if (container === savedContainer) {
        container.appendChild(emptyState);
        emptyState.style.display = 'block';
      }
      return;
    }

    if (container === savedContainer) {
      emptyState.style.display = 'none';
    }

    snips.forEach((snip) => {
      const item = document.createElement("div");
      item.className = "snip-item";

      const img = document.createElement("img");
      img.src = snip.image;
      img.className = "snip-thumb";

      const info = document.createElement("div");
      info.className = "snip-info";
      const date = snip.timestamp ? new Date(snip.timestamp).toLocaleTimeString() : (snip.snipNumber ? `#${snip.snipNumber}` : 'Snip');
      info.innerText = date;

      item.appendChild(img);
      item.appendChild(info);
      item.addEventListener("click", () => onClick(snip));
      container.appendChild(item);
    });
  }

  function injectSnipToCurrentTab(image, onDone) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs.length) return;
      const tabId = tabs[0].id;
      chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] }).then(() => {
        chrome.scripting.insertCSS({ target: { tabId }, files: ["content.css"] }).then(() => {
          chrome.tabs.sendMessage(tabId, { action: "inject_snip", image }, () => {
            if (onDone) onDone();
          });
        });
      }).catch(() => {});
    });
  }

  function loadAll() {
    chrome.storage.session.get({ activeSnips: [] }, (sessionRes) => {
      const activeSnips = Array.isArray(sessionRes.activeSnips) ? sessionRes.activeSnips : [];
      activeCount.textContent = String(activeSnips.length);
      renderGrid(activeContainer, activeSnips, () => {
        showPopupToast('Active snip focused');
      });
    });

    chrome.storage.local.get({ savedSnips: [] }, (result) => {
      const snips = result.savedSnips;
      savedCount.textContent = String(snips.length);
      renderGrid(savedContainer, snips, (snip) => {
        injectSnipToCurrentTab(snip.image, () => showPopupToast('Snip restored!'));
      });
    });
  }

  loadAll();

  document.getElementById("clear-all").addEventListener("click", () => {
    chrome.storage.local.set({ savedSnips: [] }, () => {
      loadAll();
    });
  });

  document.getElementById("save-workspace").addEventListener("click", () => {
    chrome.storage.session.get({ activeSnips: [] }, (res) => {
      chrome.storage.local.set({ savedWorkspace: res.activeSnips }, () => {
        showPopupToast("Workspace Saved!");
      });
    });
  });

  document.getElementById("load-workspace").addEventListener("click", () => {
    chrome.storage.local.get({ savedWorkspace: [] }, (res) => {
      chrome.storage.session.set({ activeSnips: res.savedWorkspace }, async () => {
        chrome.runtime.sendMessage({ action: "update_badge", count: res.savedWorkspace.length });
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
          chrome.tabs.sendMessage(tab.id, { action: "restore_snips" });
        }
        showPopupToast("Workspace Loaded!");
        loadAll();
      });
    });
  });
});
