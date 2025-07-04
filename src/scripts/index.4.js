import p5 from "p5";
import { mediaPipe } from "./handsModel";
import { initializeCamCapture, updateFeedDimensions } from "./videoFeedUtils";
import { getMappedLandmarks } from "./landmarksHandler";

new p5((sk) => {
  // State
  let camFeed;
  let snapshots = [];
  let isSelecting = false;
  let selectionStart = null;
  let selectionEnd = null;
  let isDeveloping = false;
  let developmentStartTime = null;
  let pendingCapture = null;
  let flash = null;

  // Config
  const developmentDuration = 2000;

  sk.setup = () => {
    sk.createCanvas(sk.windowWidth, sk.windowHeight);
    sk.background(0);
    sk.textSize(20);
    sk.textAlign(sk.CENTER, sk.CENTER);
    camFeed = initializeCamCapture(sk, mediaPipe);
  };

  sk.draw = () => {
    sk.background(0);

    // Check camera readiness
    if (!camFeed || camFeed.width <= 0 || camFeed.height <= 0) {
      sk.fill(255);
      sk.text("Loading camera...", sk.width / 2, sk.height / 2);
      return;
    }

    // Draw camera feed
    sk.image(camFeed, 0, 0, camFeed.scaledWidth, camFeed.scaledHeight);

    // Get only needed landmarks
    const landmarksIndex = [4, 8, 12]; // Only thumb, index, middle tips
    const LM = getMappedLandmarks(sk, mediaPipe, camFeed, landmarksIndex);

    // Calculate centroid and gesture in one pass
    let centroid = null;
    let gesture = "released";

    if (LM.X4 !== undefined && LM.X8 !== undefined && LM.X12 !== undefined) {
      centroid = {
        x: (LM.X4 + LM.X8 + LM.X12) / 3,
        y: (LM.Y4 + LM.Y8 + LM.Y12) / 3,
      };

      // Check if all fingertips are close to the centroid
      const dThumbToCentroid = sk.dist(LM.X4, LM.Y4, centroid.x, centroid.y);
      const dIndexToCentroid = sk.dist(LM.X8, LM.Y8, centroid.x, centroid.y);
      const dMiddleToCentroid = sk.dist(LM.X12, LM.Y12, centroid.x, centroid.y);

      if (
        dThumbToCentroid < 60 &&
        dIndexToCentroid < 60 &&
        dMiddleToCentroid < 60
      ) {
        gesture = "selecting";
      }
    }
    // Selection logic
    if (gesture === "selecting" && !isSelecting && !isDeveloping && centroid) {
      isSelecting = true;
      selectionStart = { ...centroid };
      selectionEnd = { ...centroid };
    } else if (gesture === "selecting" && isSelecting && centroid) {
      selectionEnd = { ...centroid };
    } else if (gesture === "released" && isSelecting) {
      isSelecting = false;
      isDeveloping = true;
      developmentStartTime = sk.millis();
      pendingCapture = {
        x: Math.min(selectionStart.x, selectionEnd.x),
        y: Math.min(selectionStart.y, selectionEnd.y),
        w: Math.abs(selectionStart.x - selectionEnd.x),
        h: Math.abs(selectionStart.y - selectionEnd.y),
      };
      flash = {
        ...pendingCapture,
        flashDuration: developmentDuration,
        flashStartTime: sk.millis(),
      };
    }

    // Draw snapshots
    for (let i = snapshots.length - 1; i >= 0; i--) {
      const { img, x, y, w, h } = snapshots[i];
      sk.image(img, x, y, w, h);
    }

    // Draw selection rectangle
    if ((isSelecting || isDeveloping) && selectionStart) {
      sk.push();
      sk.noFill();
      sk.stroke(255, 0, 0);
      sk.strokeWeight(2);
      sk.drawingContext.setLineDash([5, 5]);

      const bounds = pendingCapture || {
        x: Math.min(selectionStart.x, selectionEnd.x),
        y: Math.min(selectionStart.y, selectionEnd.y),
        w: Math.abs(selectionStart.x - selectionEnd.x),
        h: Math.abs(selectionStart.y - selectionEnd.y),
      };

      sk.rect(bounds.x, bounds.y, bounds.w, bounds.h);
      sk.pop();
    }

    // Draw flash effect
    if (flash) {
      const elapsed = sk.millis() - flash.flashStartTime;
      if (elapsed < flash.flashDuration) {
        const opacity = sk.map(elapsed, 0, flash.flashDuration, 255, 0);
        sk.fill(255, opacity);
        sk.noStroke();
        sk.rect(flash.x, flash.y, flash.w, flash.h);
      } else {
        flash = null;
      }
    }

    // Draw selection tip at centroid
    if (centroid) {
      sk.push();
      if (isSelecting) {
        sk.fill(255, 0, 0);
        sk.noStroke();
      } else {
        sk.noFill();
        sk.stroke(255);
        sk.strokeWeight(2);
      }
      sk.ellipse(centroid.x, centroid.y, 24);
      sk.pop();
    }

    // Draw fingertips
    if (centroid) {
      sk.push();
      sk.fill(0, 255, 0);
      sk.noStroke();
      sk.ellipse(LM.X4, LM.Y4, 8);
      sk.ellipse(LM.X8, LM.Y8, 8);
      sk.ellipse(LM.X12, LM.Y12, 8);
      sk.pop();
    }

    // Complete development
    if (
      isDeveloping &&
      sk.millis() - developmentStartTime >= developmentDuration &&
      pendingCapture
    ) {
      const { x, y, w, h } = pendingCapture;
      const videoX = (camFeed.width / camFeed.scaledWidth) * x;
      const videoY = (camFeed.height / camFeed.scaledHeight) * y;
      const videoW = (camFeed.width / camFeed.scaledWidth) * w;
      const videoH = (camFeed.height / camFeed.scaledHeight) * h;

      const selectedImage = sk.createGraphics(w, h);
      selectedImage.copy(camFeed, videoX, videoY, videoW, videoH, 0, 0, w, h);

      snapshots.push({
        img: selectedImage,
        x,
        y,
        w,
        h,
        startTime: sk.millis(),
      });

      // Reset
      isDeveloping = false;
      developmentStartTime = null;
      pendingCapture = null;
      selectionStart = null;
      selectionEnd = null;
    }
  };

  sk.windowResized = () => {
    sk.resizeCanvas(window.innerWidth, window.innerHeight);
    updateFeedDimensions(sk, camFeed);
  };
});
