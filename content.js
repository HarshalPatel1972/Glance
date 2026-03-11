if (!document.getElementById('glance-init-flag')) {
  const _f = document.createElement('div');
  _f.id = 'glance-init-flag';
  _f.style.display = 'none';
  document.documentElement.appendChild(_f);
  const DBG = (...a) => console.log('[Glance CS]', ...a);
  DBG('Content script initialized on', window.location.href);

  function getActiveSnips(callback) {
    chrome.storage.session.get({ activeSnips: [] }, (result) => {
      if (!chrome.runtime.lastError && result && Array.isArray(result.activeSnips)) {
        callback(result.activeSnips);
        return;
      }

      const err = chrome.runtime.lastError?.message || 'session storage unavailable';
      DBG('session.get failed, falling back to BG:', err);
      chrome.runtime.sendMessage({ action: 'get_active_snips' }, (response) => {
        if (chrome.runtime.lastError) {
          DBG('BG get_active_snips failed:', chrome.runtime.lastError.message);
          callback([]);
          return;
        }
        callback(Array.isArray(response?.activeSnips) ? response.activeSnips : []);
      });
    });
  }

  function setActiveSnips(activeSnips, callback) {
    chrome.storage.session.set({ activeSnips }, () => {
      if (!chrome.runtime.lastError) {
        if (callback) callback();
        return;
      }

      const err = chrome.runtime.lastError.message;
      DBG('session.set failed, falling back to BG:', err);
      chrome.runtime.sendMessage({ action: 'set_active_snips', activeSnips }, () => {
        if (chrome.runtime.lastError) {
          DBG('BG set_active_snips failed:', chrome.runtime.lastError.message);
        }
        if (callback) callback();
      });
    });
  }
  
  const isSnipping = () => document.documentElement.dataset.glanceSnipping === '1';
  const setSnipping = (v) => { document.documentElement.dataset.glanceSnipping = v ? '1' : '0'; };
  let overlayContent = null;
  let selectionBox = null;
  
  let startX = 0, startY = 0;
  let endX = 0, endY = 0;
  let isDragging = false;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    DBG('Message received:', request.action);
    if (request.action === "activate_snip") {
      if (isSnipping()) { DBG('Already snipping, ignoring'); return; }
      setSnipping(true);

      getActiveSnips((activeSnips) => {
        DBG('Active snips count:', activeSnips.length);
        if (activeSnips.length >= 5) {
          showToast("Maximum 5 snips active. Close one to continue.");
          DBG('Snip limit reached');
          setSnipping(false);
          return;
        }
        DBG('Creating overlay...');
        try { createOverlay(); } catch(e) { console.error('[Glance CS] createOverlay error:', e); setSnipping(false); }
      });
    } else if (request.action === "crop_image") {
      cropImage(request.dataUrl, request.area, request.devicePixelRatio, request.reframeId);
    } else if (request.action === "restore_snips") {
      getActiveSnips((activeSnips) => {
        activeSnips.forEach(snip => {
          if (!document.querySelector(`.glance-widget[data-snip-id="${snip.id}"]`)) {
            createWidget({
              image: snip.image,
              width: parseFloat(snip.width),
              height: parseFloat(snip.height),
              id: snip.id,
              left: snip.left,
              top: snip.top,
              snipNumber: snip.snipNumber
            });
          }
        });
      });
    } else if (request.action === "inject_snip") {
      // Re-inject saved snip
      const img = new Image();
      img.onload = () => {
        getActiveSnips((activeSnips) => {
          createWidget({ image: request.image, width: img.width, height: img.height, snipNumber: activeSnips.length + 1 });
        });
      };
      img.src = request.image;
    }
      sendResponse({ ok: true });
      return true;
  });

  function showToast(message) {
    let toast = document.getElementById("glance-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "glance-toast";
      document.body.appendChild(toast);
    }
    toast.innerText = message;
    toast.className = "show";
    setTimeout(() => {
      toast.className = toast.className.replace("show", "");
    }, 2000);
  }

  function cropImage(dataUrl, area, dpr, reframeId) {
    DBG('cropImage called, area:', area, 'dpr:', dpr);
    // Show a brief flash animation indicating capture is complete
    const flash = document.createElement("div");
    flash.id = "glance-flash";
    document.body.appendChild(flash);
    setTimeout(() => {
      if (flash.parentNode) flash.parentNode.removeChild(flash);
    }, 200);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      canvas.width = area.width;
      canvas.height = area.height;

      // Draw the cropped region to the canvas
      ctx.drawImage(
        img,
        area.left * dpr,
        area.top * dpr,
        area.width * dpr,
        area.height * dpr,
        0,
        0,
        area.width,
        area.height
      );

      const croppedDataUrl = canvas.toDataURL('image/png');
      getActiveSnips((activeSnips) => {
        createWidget({ image: croppedDataUrl, width: area.width, height: area.height, snipNumber: activeSnips.length + 1 });
      });
    };
    img.src = dataUrl;
  }

    function createWidget({ image, width, height, id, left, top, snipNumber, drawing, notes }) {
    const widget = document.createElement("div");
    widget.className = "glance-widget";
    widget.style.width = width + "px";
    widget.style.height = height + "px";
    
    // Use provided coords or base it on viewport centering with a slight offset based on snipNumber
    const offset = snipNumber ? (snipNumber - 1) * 20 : 0;
    widget.style.left = left || Math.max(10, (window.innerWidth - width) / 2 + offset) + "px";
    widget.style.top = top || Math.max(10, (window.innerHeight - height) / 2 + offset) + "px";

    const toolbar = document.createElement("div");
    toolbar.className = "glance-widget-toolbar";
    
    const snipBadge = document.createElement("span");
    snipBadge.className = "glance-snip-badge";
    if(snipNumber) {
        snipBadge.textContent = `#${snipNumber}`;
    }

    let isDrawingMode = false;
    let isPainting = false;
    let lastX = 0, lastY = 0;
    let currentColor = '#ff0000';
    let isTextMode = false;

    const drawBtn = document.createElement('button');
    drawBtn.className = 'glance-btn glance-draw-btn';
    drawBtn.innerHTML = '✏️';
    drawBtn.title = 'Draw';
    
    const colorPicker = document.createElement('input');
    colorPicker.type = 'color';
    colorPicker.value = '#ff0000';
    colorPicker.className = 'glance-color-picker';
    colorPicker.title = 'Pen Color';
    colorPicker.style.display = 'none';

    drawBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      isDrawingMode = !isDrawingMode;
      if (isDrawingMode) {
        drawBtn.style.background = 'rgba(0,0,0,0.2)';
        widget.classList.add('drawing-mode');
        colorPicker.style.display = 'inline-block';
        isTextMode = false;
        textBtn.style.background = 'none';
        widget.classList.remove('text-mode');
      } else {
        drawBtn.style.background = 'none';
        widget.classList.remove('drawing-mode');
        colorPicker.style.display = 'none';
        saveWidgetState(widget);
      }
    });

    colorPicker.addEventListener('input', (e) => {
      currentColor = e.target.value;
    });

    const textBtn = document.createElement('button');
    textBtn.className = 'glance-btn glance-text-btn';
    textBtn.innerHTML = 'T';
    textBtn.title = 'Add Text';
    textBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      isTextMode = !isTextMode;
      if (isTextMode) {
        textBtn.style.background = 'rgba(0,0,0,0.2)';
        widget.classList.add('text-mode');
        isDrawingMode = false;
        drawBtn.style.background = 'none';
        widget.classList.remove('drawing-mode');
        colorPicker.style.display = 'none';
      } else {
        textBtn.style.background = 'none';
        widget.classList.remove('text-mode');
      }
    });

    const reframeBtn = document.createElement('button');
    reframeBtn.className = 'glance-btn glance-reframe-btn';
    reframeBtn.innerHTML = '⛶';
    reframeBtn.title = 'Reframe';
    let isReframeMode = true;
    reframeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      isReframeMode = !isReframeMode;
      if (isReframeMode) {
        widget.classList.remove('no-reframe');
        reframeBtn.style.background = 'none';
      } else {
        widget.classList.add('no-reframe');
        reframeBtn.style.background = 'rgba(0,0,0,0.2)';
      }
    });

    const copyBtn = document.createElement("button");
    copyBtn.className = "glance-btn glance-copy-btn";
    copyBtn.innerHTML = "📋";
    copyBtn.title = "Copy to Clipboard";
    copyBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        const res = await fetch(image);
        const blob = await res.blob();
        await navigator.clipboard.write([new ClipboardItem({[blob.type]: blob})]);
        copyBtn.innerHTML = "✓";
        setTimeout(() => copyBtn.innerHTML = "📋", 1500);
      } catch (err) {
        console.error("Copy failed", err);
      }
    });

    const downloadBtn = document.createElement("button");
    downloadBtn.className = "glance-btn glance-download-btn";
    downloadBtn.innerHTML = "⬇";
    downloadBtn.title = "Download Snip";
    downloadBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const a = document.createElement("a");
      a.href = image;
      a.download = `snip_${Date.now()}.png`;
      a.click();
      downloadBtn.innerHTML = "✓";
      setTimeout(() => downloadBtn.innerHTML = "⬇", 1500);
    });

    const opacitySlider = document.createElement("input");
    opacitySlider.type = "range";
    opacitySlider.min = "0.1";
    opacitySlider.max = "1";
    opacitySlider.step = "0.1";
    opacitySlider.value = "1";
    opacitySlider.className = "glance-opacity-slider";
    opacitySlider.title = "Adjust Opacity";
    opacitySlider.addEventListener("input", (e) => {
      widget.style.opacity = e.target.value;
    });
    // Prevent dragging when using slider
    opacitySlider.addEventListener("mousedown", (e) => {
      e.stopPropagation();
    });

    const saveBtn = document.createElement("button");
    saveBtn.className = "glance-btn glance-save-btn";
    saveBtn.innerHTML = "🔖";
    saveBtn.title = "Save Snip";
    saveBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      saveSnip(image);
      saveBtn.innerHTML = "✓";
      setTimeout(() => saveBtn.innerHTML = "🔖", 1500);
    });

    const closeBtn = document.createElement("button");
    closeBtn.className = "glance-btn glance-close-btn";
    closeBtn.innerHTML = "✕";
    closeBtn.title = "Close plugin";
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      
      // Update session storage when closing
      getActiveSnips((activeSnips) => {
        const remaining = activeSnips.filter(s => s.id !== widget.dataset.snipId);
        setActiveSnips(remaining, () => {
          chrome.runtime.sendMessage({ action: "update_badge", count: remaining.length });
        });
      });

      widget.remove();
    });

    if(snipNumber) {
        toolbar.appendChild(snipBadge);
    }
    toolbar.appendChild(drawBtn);
    toolbar.appendChild(colorPicker);
    toolbar.appendChild(textBtn);
    toolbar.appendChild(reframeBtn);
    toolbar.appendChild(copyBtn);
toolbar.appendChild(downloadBtn);
toolbar.appendChild(opacitySlider);
    toolbar.appendChild(saveBtn);
    toolbar.appendChild(closeBtn);
    widget.appendChild(toolbar);

    const imgElement = document.createElement("img");
    imgElement.className = "glance-widget-img";
    imgElement.src = image;
    widget.appendChild(imgElement);

    const canvas = document.createElement("canvas");
    canvas.className = "glance-widget-canvas";
    canvas.width = width;
    canvas.height = height;
    widget.appendChild(canvas);
    
    const ctx = canvas.getContext('2d');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;

    canvas.addEventListener('mousedown', (e) => {
      if (isTextMode) {
        e.stopPropagation();
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const ta = document.createElement("textarea");
        ta.className = "glance-text-note";
        ta.style.position = "absolute";
        ta.style.left = x + "px";
        ta.style.top = y + "px";
        ta.style.background = "rgba(255,255,255,0.8)";
        ta.style.border = "1px dashed #333";
        ta.style.padding = "4px";
        ta.style.color = "#000";
        ta.style.fontFamily = "sans-serif";
        ta.style.fontSize = "14px";
        ta.style.zIndex = "3";
        ta.style.minWidth = "100px";
        ta.style.minHeight = "40px";
        
        // Auto-resize
        ta.addEventListener('input', () => {
          ta.style.height = 'auto';
          ta.style.height = ta.scrollHeight + 'px';
        });
        
        // Make draggable by the textarea itself or allow typing
        let isTaDragging = false;
        let startTaX, startTaY, initLeft, initTop;
        ta.addEventListener('mousedown', (te) => {
          if (isTextMode) {
             // In text mode, maybe we drag it
             isTaDragging = true;
             startTaX = te.clientX;
             startTaY = te.clientY;
             initLeft = parseFloat(ta.style.left) || 0;
             initTop = parseFloat(ta.style.top) || 0;
          }
          te.stopPropagation();
        });
        document.addEventListener('mousemove', (te) => {
          if (!isTaDragging) return;
          ta.style.left = initLeft + (te.clientX - startTaX) + "px";
          ta.style.top = initTop + (te.clientY - startTaY) + "px";
        });
        document.addEventListener('mouseup', () => isTaDragging = false);

        widget.appendChild(ta);
        ta.focus();
        
        // Turn off text mode after placing one
        isTextMode = false;
        textBtn.style.background = "none";
        widget.classList.remove("text-mode");
        return;
      }

      if(!isDrawingMode) return;
      isPainting = true;
      const rect = canvas.getBoundingClientRect();
      lastX = e.clientX - rect.left;
      lastY = e.clientY - rect.top;
    });

    canvas.addEventListener('mousemove', (e) => {
      if(!isDrawingMode || !isPainting) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      ctx.strokeStyle = currentColor;
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(x, y);
      ctx.stroke();

      lastX = x;
      lastY = y;
    });

    canvas.addEventListener('mouseup', () => isPainting = false);
    canvas.addEventListener('mouseleave', () => isPainting = false);


    document.body.appendChild(widget);

    if(drawing) { const dimg = new Image(); dimg.onload = () => ctx.drawImage(dimg, 0, 0); dimg.src = drawing; }

    if(notes) { notes.forEach(note => { const ta = document.createElement("textarea"); ta.className = "glance-text-note"; ta.style.position = "absolute"; ta.style.background = "rgba(255,255,255,0.8)"; ta.style.border = "1px dashed #333"; ta.style.padding = "4px"; ta.style.color = "#000"; ta.style.fontFamily = "sans-serif"; ta.style.fontSize = "14px"; ta.style.zIndex = "3"; ta.style.left = note.left; ta.style.top = note.top; ta.style.width = note.width; ta.style.height = note.height; ta.value = note.value; widget.appendChild(ta); ta.addEventListener('input', () => saveWidgetState(widget)); let isTaDragging = false; let startTaX, startTaY, initLeft, initTop; ta.addEventListener('mousedown', (te) => { if(isTextMode) { isTaDragging = true; startTaX = te.clientX; startTaY = te.clientY; initLeft = parseFloat(ta.style.left) || 0; initTop = parseFloat(ta.style.top) || 0; } te.stopPropagation(); }); document.addEventListener('mousemove', (te) => { if(!isTaDragging) return; ta.style.left = initLeft + (te.clientX - startTaX) + "px"; ta.style.top = initTop + (te.clientY - startTaY) + "px"; }); document.addEventListener('mouseup', () => isTaDragging = false); }); }

    makeDraggable(widget);
    makeResizable(widget);

    let isCollapsed = false;
    let previousHeight = height;
    widget.addEventListener("dblclick", (e) => {
      if(e.target.closest(".glance-btn") || e.target.closest(".glance-opacity-slider") || widget.classList.contains("drawing-mode")) return;
      isCollapsed = !isCollapsed;
      if(isCollapsed) {
        previousHeight = widget.style.height;
        widget.style.height = "36px";
        imgElement.style.display = "none";
        canvas.style.display = "none";
      } else {
        widget.style.height = previousHeight;
        imgElement.style.display = "block";
        canvas.style.display = "block";
      }
    });

    // Assign ID to widget for session tracking
    widget.dataset.snipId = id || (Date.now().toString() + Math.random().toString(36).substr(2, 5)); widget.dataset.image = image; if (snipNumber) widget.dataset.snipNumber = snipNumber;
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
        drawing: widget.querySelector('.glance-widget-canvas') ? widget.querySelector('.glance-widget-canvas').toDataURL() : null,
        notes: Array.from(widget.querySelectorAll('.glance-text-note')).map(ta => ({ left: ta.style.left, top: ta.style.top, width: ta.style.width, height: ta.style.height, value: ta.value }))
    };
    
    // We'll wait to fully build out the session storage logic in Feature 3,
    // but the prompt for Feature 2 implies setting it now.
    getActiveSnips((activeSnips) => {
      let snips = activeSnips;
      const index = snips.findIndex(s => s.id === state.id);
      if (index >= 0) {
        snips[index] = { ...snips[index], ...state };
      } else {
        snips.push(state);
      }
      setActiveSnips(snips, () => {
        chrome.runtime.sendMessage({ action: "update_badge", count: snips.length });
      });
    });
  }

  function makeDraggable(element) {
    let isDragging = false;
    let startX, startY;
    let initialLeft, initialTop;

    element.addEventListener("mousedown", (e) => {
      // Prevent dragging if clicking on UI elements
      if (e.target.closest('.glance-btn') || e.target.closest('.glance-resize-handle') || element.classList.contains('drawing-mode')) return;

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      initialLeft = parseFloat(element.style.left) || 0;
      initialTop = parseFloat(element.style.top) || 0;
      
      e.stopPropagation();
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      element.style.left = (initialLeft + dx) + "px";
      element.style.top = (initialTop + dy) + "px";
    });

    document.addEventListener("mouseup", () => {
      if (isDragging) {
        isDragging = false;
        saveWidgetState(element);
      }
    });
  }

  function makeResizable(widget) {
    const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
    handles.forEach(pos => {
      const handle = document.createElement('div');
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

        if (pos.includes('e')) newWidth = startWidth + dx;
        if (pos.includes('s')) newHeight = startHeight + dy;
        if (pos.includes('w')) {
          newWidth = startWidth - dx;
          newLeft = startLeft + dx;
        }
        if (pos.includes('n')) {
          newHeight = startHeight - dy;
          newTop = startTop + dy;
        }

        const minW = 150, minH = 100;
        const maxW = window.innerWidth * 0.8;
        const maxH = window.innerHeight * 0.8;

        if (newWidth >= minW && newWidth <= maxW) {
          widget.style.width = newWidth + "px";
          // Only adjust left if we resize from the left
          if (pos.includes('w')) widget.style.left = newLeft + "px";
        }
        if (newHeight >= minH && newHeight <= maxH) {
          widget.style.height = newHeight + "px";
          // Only adjust top if we resize from the top
          if (pos.includes('n')) widget.style.top = newTop + "px";
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
    
    selectionBox = document.createElement("div");
    selectionBox.id = "glance-selection-box";
    overlayContent.appendChild(selectionBox);

    overlayContent.addEventListener("mousedown", onMouseDown);
    overlayContent.addEventListener("mousemove", onMouseMove);
    overlayContent.addEventListener("mouseup", onMouseUp);

    document.addEventListener("keydown", handleKeyDown);

    document.body.appendChild(overlayContent);
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
    
    selectionBox.style.left = startX + "px";
    selectionBox.style.top = startY + "px";
    selectionBox.style.width = "0px";
    selectionBox.style.height = "0px";
    selectionBox.style.display = "block";
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
  }

  function onMouseUp(e) {
    if (!isDragging) return;
    isDragging = false;
    
    const left = Math.min(startX, endX);
    const top = Math.min(startY, endY);
    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);
    
    // Only capture if selection is large enough
    if (width > 10 && height > 10) {
      // Hide the overlay to avoid tinting the screenshot
      if (overlayContent) overlayContent.style.visibility = 'hidden';
      
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
    }
  }

  function saveSnip(dataUrl) {
    const snip = {
      id: Date.now().toString(),
      image: dataUrl,
      timestamp: Date.now(),
      url: window.location.href
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
    DBG('captureSelection sending to BG:', { left, top, width, height });
    // Send coordinates to background to capture
    chrome.runtime.sendMessage({
      action: "capture_area",
      area: { left, top, width, height },
      devicePixelRatio: window.devicePixelRatio
    });
  }
}
