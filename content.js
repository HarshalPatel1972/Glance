if (!document.getElementById("glance-init-flag")) {
  const _f = document.createElement("div");
  _f.id = "glance-init-flag";
  _f.style.display = "none";
  document.documentElement.appendChild(_f);
  const DBG = (...a) => console.log("[Glance CS]", ...a);
  DBG("Content script initialized on", window.location.href);

  function getActiveSnips(callback) {
    // Content scripts can't access chrome.storage.session directly in all contexts
    // Fallback immediately to background script to ensure reliable data retrieval
    chrome.runtime.sendMessage({ action: "get_active_snips" }, (response) => {
      if (chrome.runtime.lastError) {
        DBG("BG get_active_snips failed:", chrome.runtime.lastError.message);
        callback([]);
        return;
      }
      callback(
        Array.isArray(response?.activeSnips) ? response.activeSnips : [],
      );
    });
  }

  function setActiveSnips(activeSnips, callback) {
    chrome.runtime.sendMessage(
      { action: "set_active_snips", activeSnips },
      (response) => {
        if (chrome.runtime.lastError) {
          DBG("BG set_active_snips failed:", chrome.runtime.lastError.message);
        }
        if (callback) callback();
      },
    );
  }

  const isSnipping = () =>
    document.documentElement.dataset.glanceSnipping === "1";
  const setSnipping = (v) => {
    document.documentElement.dataset.glanceSnipping = v ? "1" : "0";
  };
  const ICONS = {
    grip: '<circle cx="6" cy="7" r="1"></circle><circle cx="12" cy="7" r="1"></circle><circle cx="18" cy="7" r="1"></circle><circle cx="6" cy="12" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="18" cy="12" r="1"></circle>',
    minimize: '<path d="M5 12h14"></path>',
    maximize: '<rect x="5" y="5" width="14" height="14" rx="2"></rect>',
    close: '<path d="M6 6l12 12"></path><path d="M18 6L6 18"></path>',
    pen: '<path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path>',
    text: '<path d="M4 7V4h16v3"></path><path d="M9 20h6"></path><path d="M12 4v16"></path>',
    copy: '<rect x="9" y="9" width="10" height="10" rx="2"></rect><path d="M5 15V5a2 2 0 0 1 2-2h10"></path>',
    download:
      '<path d="M12 3v12"></path><path d="m7 10 5 5 5-5"></path><path d="M5 21h14"></path>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><path d="M17 21v-8H7v8"></path><path d="M7 3v5h8"></path>',
    frame: '<rect x="4" y="4" width="16" height="16" rx="2"></rect>',
    share:
      '<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"></path><path d="M12 16V3"></path><path d="m7 8 5-5 5 5"></path>',
    video:
      '<polygon points="10 8 16 12 10 16 10 8"></polygon><rect x="3" y="5" width="18" height="14" rx="2"></rect>',
    check: '<path d="M20 6 9 17l-5-5"></path>',
  };
  const icon = (name) =>
    `<svg class="glance-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ""}</svg>`;
  let overlayContent = null;
  let selectionBox = null;
  let dimensionPill = null;
  let maskTop = null;
  let maskLeft = null;
  let maskRight = null;
  let maskBottom = null;

  let startX = 0,
    startY = 0;
  let endX = 0,
    endY = 0;
  let isDragging = false;

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    DBG("Message received:", request.action);
    if (request.action === "activate_snip") {
      if (isSnipping()) {
        DBG("Already snipping, ignoring");
        return;
      }
      setSnipping(true);

      DBG("Creating overlay (instant)...");
      try {
        createOverlay();
      } catch (e) {
        console.error("[Glance CS] createOverlay error:", e);
        setSnipping(false);
      }

      getActiveSnips((activeSnips) => {
        DBG("Active snips count:", activeSnips.length);
        if (activeSnips.length >= 6) {
          showToast(
            "Maximum 6 snips active. Close one to continue.",
            "warning",
          );
          DBG("Snip limit reached");
          closeOverlay();
          setSnipping(false);
          return;
        }
      });
    } else if (request.action === "crop_image") {
      cropImage(
        request.dataUrl,
        request.area,
        request.devicePixelRatio,
        request.reframeId,
      );
    } else if (request.action === "restore_snips") {
      getActiveSnips((activeSnips) => {
        activeSnips.forEach((snip) => {
          const existing = document.querySelector(`.glance-widget[data-snip-id="${snip.id}"]`);
          if (!existing) {
            createWidget({
              image: snip.image,
              width: parseFloat(snip.width),
              height: parseFloat(snip.height),
              id: snip.id,
              left: snip.left,
              top: snip.top,
              snipNumber: snip.snipNumber,
            });
          }
        });
      });
    } else if (request.action === "inject_snip") {
      // Re-inject saved snip
      const img = new Image();
      img.onload = () => {
        getActiveSnips((activeSnips) => {
          // Check if this image already exists in session to prevent duplicates
          const isDuplicate = activeSnips.some(s => s.image === request.image);
          if (isDuplicate) return;

          createWidget({
            image: request.image,
            width: img.width,
            height: img.height,
            snipNumber: activeSnips.length + 1,
          });
        });
      };
      img.src = request.image;
    }
    sendResponse({ ok: true });
    return true;
  });

  function showToast(message, type = "info") {
    let stack = document.getElementById("glance-toast-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.id = "glance-toast-stack";
      document.body.appendChild(stack);
    }

    const iconName =
      type === "success"
        ? "check"
        : type === "warning"
          ? "frame"
          : type === "error"
            ? "close"
            : "copy";
    const toast = document.createElement("div");
    toast.className = `glance-toast glance-toast-${type}`;
    toast.innerHTML = `<span class="glance-toast-icon">${icon(iconName)}</span><span class="glance-toast-text">${message}</span>`;
    stack.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add("show"));
    setTimeout(() => {
      toast.classList.remove("show");
      toast.classList.add("hide");
      setTimeout(() => toast.remove(), 160);
    }, 2000);
  }

  function cropImage(dataUrl, area, dpr, reframeId) {
    DBG("cropImage called, area:", area, "dpr:", dpr);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      // Set canvas to native device resolution for 4K/HiDPI support
      canvas.width = area.width * dpr;
      canvas.height = area.height * dpr;

      // Draw the cropped region using full device resolution
      ctx.drawImage(
        img,
        area.left * dpr,
        area.top * dpr,
        area.width * dpr,
        area.height * dpr,
        0,
        0,
        area.width * dpr,
        area.height * dpr,
      );

      // Export as high-quality PNG (lossless)
      const croppedDataUrl = canvas.toDataURL("image/png", 1.0);
      getActiveSnips((activeSnips) => {
        createWidget({
          image: croppedDataUrl,
          width: area.width,
          height: area.height,
          snipNumber: activeSnips.length + 1,
        });
      });
    };
    img.src = dataUrl;
  }

  function createWidget({
    image,
    width,
    height,
    id,
    left,
    top,
    snipNumber,
    drawing,
    notes,
  }) {
    const widget = document.createElement("div");
    widget.className = "glance-widget glance-widget-entering";
    widget.style.width = width + "px";
    widget.style.height = height + "px";

    // Use provided coords or base it on viewport centering with a slight offset based on snipNumber
    const offset = snipNumber ? (snipNumber - 1) * 20 : 0;
    widget.style.left =
      left || Math.max(10, (window.innerWidth - width) / 2 + offset) + "px";
    widget.style.top =
      top || Math.max(10, (window.innerHeight - height) / 2 + offset) + "px";

    const verticalMenu = document.createElement("div");
    verticalMenu.className = "glance-vertical-tools"; 
    verticalMenu.innerHTML = `
      <button class="glance-v-btn v-copy" data-tool="copy" title="Copy">${icon("copy")}</button>
      <button class="glance-v-btn v-save" data-tool="save" title="Save">${icon("save")}</button>
      <button class="glance-v-btn v-download" data-tool="download" title="Download">${icon("download")}</button>
    `;

    verticalMenu.addEventListener("click", (e) => {
      const toolBtn = e.target.closest(".glance-v-btn");
      if (!toolBtn) return;
      const tool = toolBtn.dataset.tool;
      if (tool === "copy") copyBtn.click();
      if (tool === "save") saveBtn.click();
      if (tool === "download") downloadBtn.click();
      e.stopPropagation();
    });

    const closeBtn = document.createElement("button");
    closeBtn.className = "glance-btn glance-close-btn";
    closeBtn.innerHTML = icon("close");
    closeBtn.title = "Close plugin";
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      getActiveSnips((activeSnips) => {
        const remaining = activeSnips.filter(
          (s) => s.id !== widget.dataset.snipId,
        );
        setActiveSnips(remaining, () => {
          chrome.runtime.sendMessage({
            action: "update_badge",
            count: remaining.length,
          });
        });
      });
      widget.classList.add("glance-widget-exit");
      widget.remove();
    });

    widget.appendChild(closeBtn);
    widget.appendChild(verticalMenu);

    // Filtered Action Bar (Hidden)
    const actionBar = document.createElement("div");
    actionBar.className = "glance-widget-actionbar h-hidden";
    actionBar.setAttribute("style", "display: none !important;");
    
    // Hidden functionality triggers
    const copyBtn = document.createElement("button");
    copyBtn.className = "glance-copy-btn h-hidden";
    copyBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        const res = await fetch(image);
        const blob = await res.blob();
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        showToast("Copied to clipboard", "success");
      } catch (err) { console.error(err); }
    });

    const saveBtn = document.createElement("button");
    saveBtn.className = "glance-save-btn h-hidden";
    saveBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      saveSnip(image);
      showToast("Saved to library", "success");
    });

    const downloadBtn = document.createElement("button");
    downloadBtn.className = "glance-download-btn h-hidden";
    downloadBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const a = document.createElement("a");
      a.href = image;
      a.download = `snip_${Date.now()}.png`;
      a.click();
    });

    widget.appendChild(copyBtn);
    widget.appendChild(saveBtn);
    widget.appendChild(downloadBtn);

    const body = document.createElement("div");
    body.className = "glance-widget-body";

    const imgElement = document.createElement("img");
    imgElement.className = "glance-widget-img";
    imgElement.src = image;
    body.appendChild(imgElement);

    const canvas = document.createElement("canvas");
    canvas.className = "glance-widget-canvas";
    canvas.width = width;
    canvas.height = height;
    body.appendChild(canvas);
    widget.appendChild(body);

    const ctx = canvas.getContext("2d");
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 3;

    canvas.addEventListener("mousedown", (e) => {
      // In minimal mode, we only allow dragging or tool interaction
      if (e.target.closest(".glance-btn") || e.target.closest(".glance-vertical-tools")) return;
    });

    canvas.addEventListener("mousemove", (e) => {
      // No-op for now in minimal mode
    });

    canvas.addEventListener("mouseup", () => {
       // No-op for now in minimal mode
    });
    canvas.addEventListener("mouseleave", () => {
       // No-op for now in minimal mode
    });

    document.body.appendChild(widget);
    requestAnimationFrame(() => {
      widget.classList.remove("glance-widget-entering");
      widget.classList.add("glance-widget-ready");
    });


    if (drawing) {
      const dimg = new Image();
      dimg.onload = () => ctx.drawImage(dimg, 0, 0);
      dimg.src = drawing;
    }

    makeDraggable(widget);
    makeResizable(widget);

    let isCollapsed = false;
    let previousHeight = height;
    let minimizedThumb = null;
    let previousLeft = widget.style.left;
    let previousTop = widget.style.top;
    const toggleCollapsed = () => {
      isCollapsed = !isCollapsed;
      widget.classList.toggle("glance-collapsed", isCollapsed);
      if (isCollapsed) {
        previousHeight = widget.style.height;
        previousLeft = widget.style.left;
        previousTop = widget.style.top;
        minBtn.innerHTML = icon("maximize");
        widget.classList.add("glance-minimized-hidden");
        minimizedThumb = document.createElement("button");
        minimizedThumb.className = "glance-widget-thumbnail";
        minimizedThumb.dataset.snipId = widget.dataset.snipId || "";
        minimizedThumb.style.left = previousLeft;
        minimizedThumb.style.top = previousTop;
        minimizedThumb.style.backgroundImage = `url(${image})`;
        minimizedThumb.innerHTML = `<span class="glance-thumb-dot"></span><span class="glance-thumb-tooltip">${titleEl.textContent} · Click to expand</span>`;
        minimizedThumb.addEventListener("click", (e) => {
          e.stopPropagation();
          isCollapsed = false;
          widget.classList.remove("glance-collapsed");
          widget.classList.remove("glance-minimized-hidden");
          widget.style.left = minimizedThumb.style.left;
          widget.style.top = minimizedThumb.style.top;
          minBtn.innerHTML = icon("minimize");
          minimizedThumb.remove();
          minimizedThumb = null;
        });
        document.body.appendChild(minimizedThumb);
      } else {
        widget.style.height = previousHeight;
        minBtn.innerHTML = icon("minimize");
        widget.classList.remove("glance-minimized-hidden");
        if (minimizedThumb) {
          minimizedThumb.remove();
          minimizedThumb = null;
        }
      }
    };

    const openLightbox = () => {
      const lightbox = document.createElement("div");
      lightbox.className = "glance-lightbox";
      lightbox.innerHTML = `
        <button class="glance-lightbox-close" title="Close">${icon("close")}</button>
        <img class="glance-lightbox-image" src="${image}" alt="Snip preview" />
        <div class="glance-lightbox-actions">
          <button class="glance-btn" data-act="copy" title="Copy">${icon("copy")}</button>
          <button class="glance-btn" data-act="share" title="Share">${icon("share")}</button>
          <button class="glance-btn" data-act="download" title="Download">${icon("download")}</button>
        </div>
      `;

      const closeLightbox = () => {
        lightbox.classList.add("closing");
        setTimeout(() => lightbox.remove(), 150);
      };

      lightbox
        .querySelector(".glance-lightbox-close")
        .addEventListener("click", closeLightbox);
      lightbox.addEventListener("click", (e) => {
        if (e.target === lightbox) closeLightbox();
      });
      lightbox
        .querySelector('[data-act="copy"]')
        .addEventListener("click", () => copyBtn.click());
      lightbox
        .querySelector('[data-act="download"]')
        .addEventListener("click", () => downloadBtn.click());
      lightbox
        .querySelector('[data-act="share"]')
        .addEventListener("click", () => shareBtn.click());
      document.body.appendChild(lightbox);
      requestAnimationFrame(() => lightbox.classList.add("show"));
    };

    minBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleCollapsed();
    });

    expandBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (isCollapsed) {
        toggleCollapsed();
      }
      openLightbox();
    });

    widget.addEventListener("dblclick", (e) => {
      if (
        e.target.closest(".glance-btn") ||
        e.target.closest(".glance-opacity-slider") ||
        widget.classList.contains("drawing-mode")
      )
        return;
      openLightbox();
    });

    // Assign ID to widget for session tracking
    widget.dataset.snipId =
      id || Date.now().toString() + Math.random().toString(36).substr(2, 5);
    widget.dataset.image = image;
    if (snipNumber) widget.dataset.snipNumber = snipNumber;
    saveWidgetState(widget);
  }
  function saveWidgetState(widget) {
    if (!widget.dataset.snipId) return;
    const state = {
      id: widget.dataset.snipId,
      left: widget.style.left,
      top: widget.style.top,
      width: widget.style.width,
      height: widget.style.height,
      image: widget.dataset.image,
      snipNumber: widget.dataset.snipNumber,
      drawing: widget.querySelector(".glance-widget-canvas")
        ? widget.querySelector(".glance-widget-canvas").toDataURL()
        : null,
      notes: Array.from(widget.querySelectorAll(".glance-text-note")).map(
        (ta) => ({
          left: ta.style.left,
          top: ta.style.top,
          width: ta.style.width,
          height: ta.style.height,
          value: ta.value,
        }),
      ),
    };

    // We'll wait to fully build out the session storage logic in Feature 3,
    // but the prompt for Feature 2 implies setting it now.
    getActiveSnips((activeSnips) => {
      let snips = activeSnips;
      const index = snips.findIndex(s => s.id === state.id || (s.image === state.image && s.timestamp === state.timestamp));
      if (index >= 0) {
        snips[index] = { ...snips[index], ...state };
      } else {
        snips.push(state);
      }
      setActiveSnips(snips, () => {
        chrome.runtime.sendMessage({
          action: "update_badge",
          count: snips.length,
        });
      });
    });
  }

  function makeDraggable(element) {
    let isDragging = false;
    let startX, startY;
    let initialLeft, initialTop;

    element.addEventListener("mousedown", (e) => {
      // Prevent dragging if clicking on UI elements
      if (
        e.target.closest(".glance-btn") ||
        e.target.closest(".glance-resize-handle") ||
        e.target.closest(".glance-vertical-tools") ||
        element.classList.contains("drawing-mode")
      )
        return;

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      initialLeft = parseFloat(element.style.left) || 0;
      initialTop = parseFloat(element.style.top) || 0;
      element.classList.add("glance-dragging");

      e.stopPropagation();
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      element.style.left = initialLeft + dx + "px";
      element.style.top = initialTop + dy + "px";
    });

    document.addEventListener("mouseup", () => {
      if (isDragging) {
        isDragging = false;
        element.classList.remove("glance-dragging");
        saveWidgetState(element);
      }
    });
  }

  function makeResizable(widget) {
    const handles = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
    handles.forEach((pos) => {
      const handle = document.createElement("div");
      handle.className = `glance-resize-handle glance-resize-${pos}`;
      handle.dataset.pos = pos;
      widget.appendChild(handle);

      let isResizing = false;
      let startX, startY, startWidth, startHeight, startLeft, startTop;

      handle.addEventListener("mousedown", (e) => {
        isResizing = true;
        startX = e.clientX;
        startY = e.clientY;
        startWidth = parseFloat(widget.style.width);
        startHeight = parseFloat(widget.style.height);
        startLeft = parseFloat(widget.style.left);
        startTop = parseFloat(widget.style.top);

        e.stopPropagation();
        e.preventDefault();
      });

      document.addEventListener("mousemove", (e) => {
        if (!isResizing) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        let newWidth = startWidth;
        let newHeight = startHeight;
        let newLeft = startLeft;
        let newTop = startTop;

        if (pos.includes("e")) newWidth = startWidth + dx;
        if (pos.includes("s")) newHeight = startHeight + dy;
        if (pos.includes("w")) {
          newWidth = startWidth - dx;
          newLeft = startLeft + dx;
        }
        if (pos.includes("n")) {
          newHeight = startHeight - dy;
          newTop = startTop + dy;
        }

        const minW = 150,
          minH = 100;
        const maxW = window.innerWidth * 0.8;
        const maxH = window.innerHeight * 0.8;

        if (newWidth >= minW && newWidth <= maxW) {
          widget.style.width = newWidth + "px";
          // Only adjust left if we resize from the left
          if (pos.includes("w")) widget.style.left = newLeft + "px";
        }
        if (newHeight >= minH && newHeight <= maxH) {
          widget.style.height = newHeight + "px";
          // Only adjust top if we resize from the top
          if (pos.includes("n")) widget.style.top = newTop + "px";
        }
      });

      document.addEventListener("mouseup", () => {
        if (isResizing) {
          isResizing = false;
          saveWidgetState(widget);
        }
      });
    });
  }

  function createOverlay() {
    if (document.getElementById("glance-snipping-overlay")) return;

    overlayContent = document.createElement("div");
    overlayContent.id = "glance-snipping-overlay";

    const instruction = document.createElement("div");
    instruction.id = "glance-instruction-label";
    instruction.innerHTML =
      "Draw a selection to snip <span>[Esc to cancel]</span>";
    overlayContent.appendChild(instruction);

    maskTop = document.createElement("div");
    maskLeft = document.createElement("div");
    maskRight = document.createElement("div");
    maskBottom = document.createElement("div");
    maskTop.className = "glance-overlay-mask-gpu";
    maskLeft.className = "glance-overlay-mask-gpu";
    maskRight.className = "glance-overlay-mask-gpu";
    maskBottom.className = "glance-overlay-mask-gpu";
    overlayContent.appendChild(maskTop);
    overlayContent.appendChild(maskLeft);
    overlayContent.appendChild(maskRight);
    overlayContent.appendChild(maskBottom);

    selectionBox = document.createElement("div");
    selectionBox.id = "glance-selection-box";
    ["tl", "tr", "bl", "br"].forEach((corner) => {
      const marker = document.createElement("span");
      marker.className = `glance-corner glance-corner-${corner}`;
      selectionBox.appendChild(marker);
    });
    overlayContent.appendChild(selectionBox);

    dimensionPill = document.createElement("div");
    dimensionPill.id = "glance-dimension-pill";
    dimensionPill.textContent = "0 × 0";
    overlayContent.appendChild(dimensionPill);

    overlayContent.addEventListener("mousedown", onMouseDown);
    overlayContent.addEventListener("mousemove", onMouseMove);
    overlayContent.addEventListener("mouseup", onMouseUp);

    document.addEventListener("keydown", handleKeyDown);

    document.body.appendChild(overlayContent);

    // Instantly mask the whole screen before user starts drawing
    updateOverlayMasks(window.innerWidth / 2, window.innerHeight / 2, 0, 0);
  }

  function updateOverlayMasks(left, top, width, height) {
    if (!maskTop || !maskLeft || !maskRight || !maskBottom) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Use requestAnimationFrame for smoother updates during drag
    requestAnimationFrame(() => {
      // Use translate3d to move layers to the GPU for "oil smooth" performance
      maskTop.style.transform = `translate3d(0, 0, 0)`;
      maskTop.style.width = vw + "px";
      maskTop.style.height = top + "px";

      maskLeft.style.transform = `translate3d(0, ${top}px, 0)`;
      maskLeft.style.width = left + "px";
      maskLeft.style.height = height + "px";

      maskRight.style.transform = `translate3d(${left + width}px, ${top}px, 0)`;
      maskRight.style.width = Math.max(0, vw - (left + width)) + "px";
      maskRight.style.height = height + "px";

      maskBottom.style.transform = `translate3d(0, ${top + height}px, 0)`;
      maskBottom.style.width = vw + "px";
      maskBottom.style.height = Math.max(0, vh - (top + height)) + "px";
    });
  }

  function handleKeyDown(e) {
    if (e.key === "Escape") {
      closeOverlay();
    }
  }

  function onMouseDown(e) {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    endX = e.clientX;
    endY = e.clientY;

    selectionBox.style.left = startX + "px";
    selectionBox.style.top = startY + "px";
    selectionBox.style.width = "0px";
    selectionBox.style.height = "0px";
    selectionBox.style.display = "block";
    updateOverlayMasks(startX, startY, 0, 0);
  }

  function onMouseMove(e) {
    if (!isDragging) return;

    endX = e.clientX;
    endY = e.clientY;

    const left = Math.min(startX, endX);
    const top = Math.min(startY, endY);
    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);

    selectionBox.style.left = left + "px";
    selectionBox.style.top = top + "px";
    selectionBox.style.width = width + "px";
    selectionBox.style.height = height + "px";

    if (dimensionPill) {
      dimensionPill.style.display = "block";
      dimensionPill.style.left = e.clientX + 12 + "px";
      dimensionPill.style.top = e.clientY + 12 + "px";
      dimensionPill.textContent = `${width} × ${height}`;
    }
    updateOverlayMasks(left, top, width, height);
  }

  function onMouseUp(e) {
    if (!isDragging) return;
    isDragging = false;

    const left = Math.min(startX, endX);
    const top = Math.min(startY, endY);
    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);

    // Only capture if selection is large enough
    if (width > 24 && height > 24) {
      // Hide the overlay to avoid tinting the screenshot
      if (overlayContent) overlayContent.style.visibility = "hidden";

      // Wait for DOM repaint before capturing
      setTimeout(() => {
        captureSelection(left, top, width, height);
        closeOverlay();
      }, 50);
    } else {
      closeOverlay();
    }
  }

  function closeOverlay() {
    setSnipping(false);
    document.removeEventListener("keydown", handleKeyDown);
    if (overlayContent && overlayContent.parentNode) {
      overlayContent.parentNode.removeChild(overlayContent);
      overlayContent = null;
      selectionBox = null;
      dimensionPill = null;
      maskTop = null;
      maskLeft = null;
      maskRight = null;
      maskBottom = null;
    }
  }

  function saveSnip(dataUrl) {
    const snip = {
      id: Date.now().toString(),
      image: dataUrl,
      timestamp: Date.now(),
      url: window.location.href,
    };

    chrome.storage.local.get({ savedSnips: [] }, (result) => {
      let snips = result.savedSnips;
      snips.unshift(snip); // add to front

      // Limit to 20 snips
      if (snips.length > 20) {
        snips = snips.slice(0, 20);
      }

      chrome.storage.local.set({ savedSnips: snips });
    });
  }

  function captureSelection(left, top, width, height) {
    DBG("captureSelection sending to BG:", { left, top, width, height });
    // Send coordinates to background to capture
    chrome.runtime.sendMessage({
      action: "capture_area",
      area: { left, top, width, height },
      devicePixelRatio: window.devicePixelRatio,
    });
  }
}
