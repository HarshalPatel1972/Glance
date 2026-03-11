function createWidget(dataUrl, width, height) {
    const widget = document.createElement("div");
    widget.className = "glance-widget";
    widget.style.width = width + "px";
    widget.style.height = height + "px";
    // Set initial position centered
    widget.style.left = Math.max(10, (window.innerWidth - width) / 2) + "px";
    widget.style.top = Math.max(10, (window.innerHeight - height) / 2) + "px";

    const toolbar = document.createElement("div");
    toolbar.className = "glance-widget-toolbar";
    
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
      saveSnip(dataUrl);
      saveBtn.innerHTML = "✓";
      setTimeout(() => saveBtn.innerHTML = "🔖", 1500);
    });

    const closeBtn = document.createElement("button");
    closeBtn.className = "glance-btn glance-close-btn";
    closeBtn.innerHTML = "✕";
    closeBtn.title = "Close plugin";
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      widget.remove();
    });

    toolbar.appendChild(saveBtn);
    toolbar.appendChild(closeBtn);
    widget.appendChild(toolbar);

    const img = document.createElement("img");
    img.className = "glance-widget-img";
    img.src = dataUrl;
    widget.appendChild(img);

    document.body.appendChild(widget);
    
    makeDraggable(widget);
    makeResizable(widget);
    
    // Assign ID to widget for session tracking
    widget.dataset.snipId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
    saveWidgetState(widget);
  }

  