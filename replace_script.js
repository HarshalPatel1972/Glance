const fs = require('fs');
let c = fs.readFileSync('content.js', 'utf8');

c = c.replace(
`      } else if (request.action === "inject_snip") {
        // Re-inject saved snip
        const img = new Image();
        img.onload = () => {
          createWidget(request.image, img.width, img.height);
        };
        img.src = request.image;
      }`,
`      } else if (request.action === "inject_snip") {
        // Re-inject saved snip
        const img = new Image();
        img.onload = () => {
          chrome.storage.session.get({ activeSnips: [] }, (result) => {
            createWidget({
              image: request.image,
              width: img.width,
              height: img.height,
              snipNumber: result.activeSnips.length + 1
            });
          });
        };
        img.src = request.image;
      }`
);

c = c.replace(
`        const croppedDataUrl = canvas.toDataURL('image/png');
        createWidget(croppedDataUrl, area.width, area.height);
      };`,
`        const croppedDataUrl = canvas.toDataURL('image/png');
        chrome.storage.session.get({ activeSnips: [] }, (result) => {
          createWidget({
            image: croppedDataUrl,
            width: area.width,
            height: area.height,
            snipNumber: result.activeSnips.length + 1
          });
        });
      };`
);

fs.writeFileSync('content.js', c);
