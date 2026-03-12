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
  const ICONS = {
    grip: '<circle cx="6" cy="7" r="1"></circle><circle cx="12" cy="7" r="1"></circle><circle cx="18" cy="7" r="1"></circle><circle cx="6" cy="12" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="18" cy="12" r="1"></circle>',
    minimize: '<path d="M5 12h14"></path>',
    maximize: '<rect x="5" y="5" width="14" height="14" rx="2"></rect>',
    close: '<path d="M6 6l12 12"></path><path d="M18 6L6 18"></path>',
    pen: '<path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path>',
    text: '<path d="M4 7V4h16v3"></path><path d="M9 20h6"></path><path d="M12 4v16"></path>',
    copy: '<rect x="9" y="9" width="10" height="10" rx="2"></rect><path d="M5 15V5a2 2 0 0 1 2-2h10"></path>',
    download: '<path d="M12 3v12"></path><path d="m7 10 5 5 5-5"></path><path d="M5 21h14"></path>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><path d="M17 21v-8H7v8"></path><path d="M7 3v5h8"></path>',
    frame: '<rect x="4" y="4" width="16" height="16" rx="2"></rect>',
    share: '<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"></path><path d="M12 16V3"></path><path d="m7 8 5-5 5 5"></path>',
    video: '<polygon points="10 8 16 12 10 16 10 8"></polygon><rect x="3" y="5" width="18" height="14" rx="2"></rect>',
    check: '<path d="M20 6 9 17l-5-5"></path>'
  };
  const icon = (name) => `<svg class="glance-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
  let overlayContent = null;
  let selectionBox = null;
  let dimensionPill = null;
  let maskTop = null;
  let maskLeft = null;
  let maskRight = null;
  let maskBottom = null;
  
  let startX = 0, startY = 0;
  let endX = 0, endY = 0;
  let isDragging = false;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    DBG('Message received:', request.action);
    if (request.action === "activate_snip") {
      if (isSnipping()) { DBG('Already snipping, ignoring'); return; }
      setSnipping(true);
      
      DBG('Creating overlay (instant)...');
      try { createOverlay(); } catch(e) { console.error('[Glance CS] createOverlay error:', e); setSnipping(false); }

      getActiveSnips((activeSnips) => {
        DBG('Active snips count:', activeSnips.length);
        if (activeSnips.length >= 6) {
          showToast("Maximum 6 snips active. Close one to continue.", 'warning');
          DBG('Snip limit reached');
          closeOverlay();
          setSnipping(false);
          return;
        }
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

  function showToast(message, type = 'info') {
    let stack = document.getElementById('glance-toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'glance-toast-stack';
      document.body.appendChild(stack);
    }

    const iconName = type === 'success' ? 'check' : (type === 'warning' ? 'frame' : (type === 'error' ? 'close' : 'copy'));
    const toast = document.createElement('div');
    toast.className = `glance-toast glance-toast-${type}`;
    toast.innerHTML = `<span class="glance-toast-icon">${icon(iconName)}</span><span class="glance-toast-text">${message}</span>`;
    stack.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      toast.classList.add('hide');
      setTimeout(() => toast.remove(), 160);
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
    widget.className = "glance-widget glance-widget-entering";
    widget.style.width = width + "px";
    widget.style.height = height + "px";
    
    // Use provided coords or base it on viewport centering with a slight offset based on snipNumber
    const offset = snipNumber ? (snipNumber - 1) * 20 : 0;
    widget.style.left = left || Math.max(10, (window.innerWidth - width) / 2 + offset) + "px";
    widget.style.top = top || Math.max(10, (window.innerHeight - height) / 2 + offset) + "px";

    const toolbar = document.createElement("div");
    toolbar.className = "glance-widget-toolbar";
    const toolbarLeft = document.createElement("div");
    toolbarLeft.className = "glance-toolbar-left";
    const toolbarRight = document.createElement("div");
    toolbarRight.className = "glance-toolbar-right";

    const dragHandle = document.createElement("button");
    dragHandle.className = "glance-btn glance-drag-handle";
    dragHandle.innerHTML = icon('grip');
    dragHandle.title = "Drag";

    const titleEl = document.createElement("span");
    titleEl.className = "glance-snip-title glance-title-hidden";
    titleEl.contentEditable = "true";
    titleEl.spellcheck = false;
    titleEl.textContent = snipNumber ? `#${snipNumber} Snip` : "Snip";

    let isDrawingMode = false;
    let isPainting = false;
    let lastX = 0, lastY = 0;
    let currentColor = '#ff0000';
    let isTextMode = false;
    const drawHistory = [];

    const drawBtn = document.createElement('button');
    drawBtn.className = 'glance-btn glance-draw-btn';
    drawBtn.innerHTML = icon('pen');
    drawBtn.title = 'Draw';
    
    const colorPicker = document.createElement('input');
    colorPicker.type = 'color';
    colorPicker.value = '#ff0000';
    colorPicker.className = 'glance-color-picker';
    colorPicker.title = 'Pen Color';
    colorPicker.style.display = 'none';

    const annotationHeader = document.createElement('div');
    annotationHeader.className = 'glance-annotation-header';
    annotationHeader.innerHTML = `<span class="glance-annotation-label">Annotation Mode</span>`;
    const undoBtn = document.createElement('button');
    undoBtn.className = 'glance-btn glance-undo-btn';
    undoBtn.innerHTML = icon('frame');
    undoBtn.title = 'Undo';
    const doneBtn = document.createElement('button');
    doneBtn.className = 'glance-btn glance-done-btn';
    doneBtn.innerHTML = icon('check');
    doneBtn.title = 'Done';
    annotationHeader.appendChild(undoBtn);
    annotationHeader.appendChild(doneBtn);

    const annotationSidebar = document.createElement('div');
    annotationSidebar.className = 'glance-annotation-sidebar';

    const markerBtn = document.createElement('button');
    markerBtn.className = 'glance-btn glance-marker-btn';
    markerBtn.innerHTML = icon('pen');
    markerBtn.title = 'Mark';

    const annotationOptions = document.createElement('div');
    annotationOptions.className = 'glance-annotation-options';
    const strokeSlider = document.createElement('input');
    strokeSlider.type = 'range';
    strokeSlider.min = '1';
    strokeSlider.max = '12';
    strokeSlider.value = '3';
    strokeSlider.className = 'glance-stroke-slider';
    const swatches = document.createElement('div');
    swatches.className = 'glance-color-swatches';
    ['#ff4d6d', '#FFB347', '#5B6EF5', '#3DDC84', '#ffffff', '#000000'].forEach((color) => {
      const swatch = document.createElement('button');
      swatch.className = 'glance-color-swatch';
      swatch.style.background = color;
      swatch.addEventListener('click', (e) => {
        e.stopPropagation();
        currentColor = color;
        colorPicker.value = color;
        swatches.querySelectorAll('.glance-color-swatch').forEach((n) => n.classList.remove('selected'));
        swatch.classList.add('selected');
      });
      if (color === '#ff4d6d') swatch.classList.add('selected');
      swatches.appendChild(swatch);
    });
    annotationOptions.appendChild(strokeSlider);
    annotationOptions.appendChild(swatches);

    const updateAnnotationChrome = () => {
      const enabled = isDrawingMode || isTextMode;
      widget.classList.toggle('annotation-mode', enabled);
    };

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
      updateAnnotationChrome();
    });

    colorPicker.addEventListener('input', (e) => {
      currentColor = e.target.value;
    });

    const textBtn = document.createElement('button');
    textBtn.className = 'glance-btn glance-text-btn';
    textBtn.innerHTML = icon('text');
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
      updateAnnotationChrome();
    });

    markerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      isDrawingMode = true;
      isTextMode = false;
      currentColor = '#FFB347';
      colorPicker.value = '#FFB347';
      drawBtn.style.background = 'rgba(0,0,0,0.2)';
      textBtn.style.background = 'none';
      widget.classList.add('drawing-mode');
      widget.classList.remove('text-mode');
      updateAnnotationChrome();
    });

    const reframeBtn = document.createElement('button');
    reframeBtn.className = 'glance-btn glance-reframe-btn';
    reframeBtn.innerHTML = icon('frame');
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
    copyBtn.innerHTML = icon('copy');
    copyBtn.title = "Copy to Clipboard";
    copyBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        const res = await fetch(image);
        const blob = await res.blob();
        await navigator.clipboard.write([new ClipboardItem({[blob.type]: blob})]);
        copyBtn.innerHTML = icon('check');
        copyBtn.classList.add('glance-success-state');
        setTimeout(() => {
          copyBtn.innerHTML = icon('copy');
          copyBtn.classList.remove('glance-success-state');
        }, 1500);
      } catch (err) {
        console.error("Copy failed", err);
      }
    });

    const downloadBtn = document.createElement("button");
    downloadBtn.className = "glance-btn glance-download-btn";
    downloadBtn.innerHTML = icon('download');
    downloadBtn.title = "Download Snip";
    downloadBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const a = document.createElement("a");
      a.href = image;
      a.download = `snip_${Date.now()}.png`;
      a.click();
      downloadBtn.innerHTML = icon('check');
      setTimeout(() => downloadBtn.innerHTML = icon('download'), 1500);
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
    saveBtn.innerHTML = icon('save');
    saveBtn.title = "Save Snip";
    saveBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      saveSnip(image);
      saveBtn.innerHTML = icon('check');
      saveBtn.classList.add('glance-bounce');
      setTimeout(() => {
        saveBtn.innerHTML = icon('save');
        saveBtn.classList.remove('glance-bounce');
      }, 1500);
    });

    const minBtn = document.createElement("button");
    minBtn.className = "glance-btn glance-min-btn";
    minBtn.innerHTML = icon('minimize');
    minBtn.title = "Minimize";

    const expandBtn = document.createElement("button");
    expandBtn.className = "glance-btn glance-expand-btn";
    expandBtn.innerHTML = icon('maximize');
    expandBtn.title = "Expand";

    const closeBtn = document.createElement("button");
    closeBtn.className = "glance-btn glance-close-btn";
    closeBtn.innerHTML = icon('close');
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

      widget.classList.add('glance-widget-exit');
      const removeWidget = () => {
        widget.removeEventListener('transitionend', removeWidget);
        const thumb = document.querySelector(`.glance-widget-thumbnail[data-snip-id="${widget.dataset.snipId}"]`);
        if (thumb) thumb.remove();
        widget.remove();
      };
      widget.addEventListener('transitionend', removeWidget);
    });

    const actionBar = document.createElement("div");
    actionBar.className = "glance-widget-actionbar";
    const annotateTriggerBtn = document.createElement("button");
    annotateTriggerBtn.className = "glance-btn glance-annotate-trigger";
    annotateTriggerBtn.innerHTML = icon('pen');
    annotateTriggerBtn.title = "Annotate";
    annotateTriggerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      drawBtn.click();
    });
    const extractTriggerBtn = document.createElement("button");
    extractTriggerBtn.className = "glance-btn glance-extract-trigger";
    extractTriggerBtn.innerHTML = icon('text');
    extractTriggerBtn.title = "Extract Text";
    extractTriggerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      textBtn.click();
    });
    const shareBtn = document.createElement("button");
    shareBtn.className = "glance-btn glance-share-btn";
    shareBtn.innerHTML = icon('share');
    shareBtn.title = "Share";
    const videoBtn = document.createElement("button");
    videoBtn.className = "glance-btn glance-video-btn";
    videoBtn.innerHTML = icon('video');
    videoBtn.title = "Video Frame";

    toolbarLeft.appendChild(dragHandle);
    toolbarLeft.appendChild(titleEl);
    toolbarRight.appendChild(minBtn);
    toolbarRight.appendChild(expandBtn);
    toolbarRight.appendChild(closeBtn);
    toolbar.appendChild(toolbarLeft);
    toolbar.appendChild(toolbarRight);

    actionBar.appendChild(annotateTriggerBtn);
    actionBar.appendChild(extractTriggerBtn);
    actionBar.appendChild(copyBtn);
    actionBar.appendChild(shareBtn);
    actionBar.appendChild(videoBtn);
    actionBar.appendChild(downloadBtn);
    actionBar.appendChild(reframeBtn);
    actionBar.appendChild(saveBtn);
    actionBar.appendChild(opacitySlider);
    actionBar.appendChild(colorPicker);

    annotationSidebar.appendChild(drawBtn);
    annotationSidebar.appendChild(markerBtn);
    annotationSidebar.appendChild(textBtn);

    widget.appendChild(toolbar);
    widget.appendChild(actionBar);
    widget.appendChild(annotationHeader);
    widget.appendChild(annotationSidebar);
    widget.appendChild(annotationOptions);

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
    
    const ctx = canvas.getContext('2d');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;

    strokeSlider.addEventListener('input', (e) => {
      ctx.lineWidth = parseInt(e.target.value, 10);
    });

    undoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const previous = drawHistory.pop();
      if (!previous) return;
      ctx.putImageData(previous, 0, 0);
      saveWidgetState(widget);
    });

    doneBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      isDrawingMode = false;
      isTextMode = false;
      widget.classList.remove('drawing-mode');
      widget.classList.remove('text-mode');
      widget.classList.remove('annotation-mode');
      drawBtn.style.background = 'none';
      textBtn.style.background = 'none';
      colorPicker.style.display = 'none';
      saveWidgetState(widget);
    });

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
      try {
        drawHistory.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
      } catch (err) {
        DBG('draw history capture failed:', err.message);
      }
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
    requestAnimationFrame(() => {
      widget.classList.remove('glance-widget-entering');
      widget.classList.add('glance-widget-ready');
      setTimeout(() => titleEl.classList.remove('glance-title-hidden'), 80);
    });

    if(drawing) { const dimg = new Image(); dimg.onload = () => ctx.drawImage(dimg, 0, 0); dimg.src = drawing; }

    if(notes) { notes.forEach(note => { const ta = document.createElement("textarea"); ta.className = "glance-text-note"; ta.style.position = "absolute"; ta.style.background = "rgba(255,255,255,0.8)"; ta.style.border = "1px dashed #333"; ta.style.padding = "4px"; ta.style.color = "#000"; ta.style.fontFamily = "sans-serif"; ta.style.fontSize = "14px"; ta.style.zIndex = "3"; ta.style.left = note.left; ta.style.top = note.top; ta.style.width = note.width; ta.style.height = note.height; ta.value = note.value; widget.appendChild(ta); ta.addEventListener('input', () => saveWidgetState(widget)); let isTaDragging = false; let startTaX, startTaY, initLeft, initTop; ta.addEventListener('mousedown', (te) => { if(isTextMode) { isTaDragging = true; startTaX = te.clientX; startTaY = te.clientY; initLeft = parseFloat(ta.style.left) || 0; initTop = parseFloat(ta.style.top) || 0; } te.stopPropagation(); }); document.addEventListener('mousemove', (te) => { if(!isTaDragging) return; ta.style.left = initLeft + (te.clientX - startTaX) + "px"; ta.style.top = initTop + (te.clientY - startTaY) + "px"; }); document.addEventListener('mouseup', () => isTaDragging = false); }); }

    makeDraggable(widget);
    makeResizable(widget);

    let isCollapsed = false;
    let previousHeight = height;
    let minimizedThumb = null;
    let previousLeft = widget.style.left;
    let previousTop = widget.style.top;
    const toggleCollapsed = () => {
      isCollapsed = !isCollapsed;
      widget.classList.toggle('glance-collapsed', isCollapsed);
      if(isCollapsed) {
        previousHeight = widget.style.height;
        previousLeft = widget.style.left;
        previousTop = widget.style.top;
        minBtn.innerHTML = icon('maximize');
        widget.classList.add('glance-minimized-hidden');
        minimizedThumb = document.createElement('button');
        minimizedThumb.className = 'glance-widget-thumbnail';
        minimizedThumb.dataset.snipId = widget.dataset.snipId || '';
        minimizedThumb.style.left = previousLeft;
        minimizedThumb.style.top = previousTop;
        minimizedThumb.style.backgroundImage = `url(${image})`;
        minimizedThumb.innerHTML = `<span class="glance-thumb-dot"></span><span class="glance-thumb-tooltip">${titleEl.textContent} · Click to expand</span>`;
        minimizedThumb.addEventListener('click', (e) => {
          e.stopPropagation();
          isCollapsed = false;
          widget.classList.remove('glance-collapsed');
          widget.classList.remove('glance-minimized-hidden');
          widget.style.left = minimizedThumb.style.left;
          widget.style.top = minimizedThumb.style.top;
          minBtn.innerHTML = icon('minimize');
          minimizedThumb.remove();
          minimizedThumb = null;
        });
        document.body.appendChild(minimizedThumb);
      } else {
        widget.style.height = previousHeight;
        minBtn.innerHTML = icon('minimize');
        widget.classList.remove('glance-minimized-hidden');
        if (minimizedThumb) {
          minimizedThumb.remove();
          minimizedThumb = null;
        }
      }
    };

    const openLightbox = () => {
      const lightbox = document.createElement('div');
      lightbox.className = 'glance-lightbox';
      lightbox.innerHTML = `
        <button class="glance-lightbox-close" title="Close">${icon('close')}</button>
        <img class="glance-lightbox-image" src="${image}" alt="Snip preview" />
        <div class="glance-lightbox-actions">
          <button class="glance-btn" data-act="copy" title="Copy">${icon('copy')}</button>
          <button class="glance-btn" data-act="share" title="Share">${icon('share')}</button>
          <button class="glance-btn" data-act="download" title="Download">${icon('download')}</button>
        </div>
      `;

      const closeLightbox = () => {
        lightbox.classList.add('closing');
        setTimeout(() => lightbox.remove(), 150);
      };

      lightbox.querySelector('.glance-lightbox-close').addEventListener('click', closeLightbox);
      lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) closeLightbox();
      });
      lightbox.querySelector('[data-act="copy"]').addEventListener('click', () => copyBtn.click());
      lightbox.querySelector('[data-act="download"]').addEventListener('click', () => downloadBtn.click());
      lightbox.querySelector('[data-act="share"]').addEventListener('click', () => shareBtn.click());
      document.body.appendChild(lightbox);
      requestAnimationFrame(() => lightbox.classList.add('show'));
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
      if(e.target.closest(".glance-btn") || e.target.closest(".glance-opacity-slider") || widget.classList.contains("drawing-mode")) return;
      openLightbox();
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
      const isDragHandle = e.target.closest('.glance-drag-handle');
      if ((e.target.closest('.glance-btn') && !isDragHandle) || e.target.closest('.glance-resize-handle') || element.classList.contains('drawing-mode')) return;

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      initialLeft = parseFloat(element.style.left) || 0;
      initialTop = parseFloat(element.style.top) || 0;
      element.classList.add('glance-dragging');
      
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
        element.classList.remove('glance-dragging');
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

    const instruction = document.createElement('div');
    instruction.id = 'glance-instruction-label';
    instruction.innerHTML = 'Draw a selection to snip <span>[Esc to cancel]</span>';
    overlayContent.appendChild(instruction);

    maskTop = document.createElement('div');
    maskLeft = document.createElement('div');
    maskRight = document.createElement('div');
    maskBottom = document.createElement('div');
    maskTop.className = 'glance-overlay-mask';
    maskLeft.className = 'glance-overlay-mask';
    maskRight.className = 'glance-overlay-mask';
    maskBottom.className = 'glance-overlay-mask';
    overlayContent.appendChild(maskTop);
    overlayContent.appendChild(maskLeft);
    overlayContent.appendChild(maskRight);
    overlayContent.appendChild(maskBottom);
    
    selectionBox = document.createElement("div");
    selectionBox.id = "glance-selection-box";
    ['tl', 'tr', 'bl', 'br'].forEach((corner) => {
      const marker = document.createElement('span');
      marker.className = `glance-corner glance-corner-${corner}`;
      selectionBox.appendChild(marker);
    });
    overlayContent.appendChild(selectionBox);

    dimensionPill = document.createElement('div');
    dimensionPill.id = 'glance-dimension-pill';
    dimensionPill.textContent = '0 × 0';
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
    maskTop.style.left = '0px';
    maskTop.style.top = '0px';
    maskTop.style.width = vw + 'px';
    maskTop.style.height = top + 'px';

    maskLeft.style.left = '0px';
    maskLeft.style.top = top + 'px';
    maskLeft.style.width = left + 'px';
    maskLeft.style.height = height + 'px';

    maskRight.style.left = (left + width) + 'px';
    maskRight.style.top = top + 'px';
    maskRight.style.width = Math.max(0, vw - (left + width)) + 'px';
    maskRight.style.height = height + 'px';

    maskBottom.style.left = '0px';
    maskBottom.style.top = (top + height) + 'px';
    maskBottom.style.width = vw + 'px';
    maskBottom.style.height = Math.max(0, vh - (top + height)) + 'px';
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
      dimensionPill.style.display = 'block';
      dimensionPill.style.left = (e.clientX + 12) + 'px';
      dimensionPill.style.top = (e.clientY + 12) + 'px';
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
