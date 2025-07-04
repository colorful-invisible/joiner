import p5 from "p5";
import { mediaPipe } from "./handsModel";
import { initializeCamCapture, updateFeedDimensions } from "./videoFeedUtils";
import { getMappedLandmarks } from "./landmarksHandler";

new p5((sk) => {
  let camFeed;
  let snapshots = [];
  let isSelecting = false;
  let selectionStart = null;
  let selectionEnd = null;
  let isDeveloping = false;
  let developmentStartTime = null;
  let pendingCapture = null;
  let flash = null;

  const developmentDuration = 750;
  const centroidThreshold = 48;
  const minSnapshotSize = 80; // Minimum size of the dimesions in pixels for a valid snapshot
  const snapshotLimit = 20; // Maximum number of snapshots to keep
  const fadeEnabled = false;
  const fadeStartTime = 120000; // Start fading after
  const fadeDuration = 10000;

  sk.setup = () => {
    sk.createCanvas(sk.windowWidth, sk.windowHeight);
    sk.background(0);
    sk.textSize(20);
    sk.textAlign(sk.CENTER, sk.CENTER);
    camFeed = initializeCamCapture(sk, mediaPipe);
  };

  sk.draw = () => {
    sk.background(0);

    if (!camFeed) {
      sk.fill(0);
      sk.text("LOADING", sk.width / 2, sk.height / 2);
      return;
    }

    sk.image(camFeed, 0, 0, camFeed.scaledWidth, camFeed.scaledHeight);

    const landmarksIndex = [4, 8, 12];
    const LM = getMappedLandmarks(sk, mediaPipe, camFeed, landmarksIndex);

    let centroid = null;
    let gesture = "released";

    if (LM.X4 !== undefined && LM.X8 !== undefined && LM.X12 !== undefined) {
      centroid = {
        x: (LM.X4 + LM.X8 + LM.X12) / 3,
        y: (LM.Y4 + LM.Y8 + LM.Y12) / 3,
      };

      const dThumbToCentroid = sk.dist(LM.X4, LM.Y4, centroid.x, centroid.y);
      const dIndexToCentroid = sk.dist(LM.X8, LM.Y8, centroid.x, centroid.y);
      const dMiddleToCentroid = sk.dist(LM.X12, LM.Y12, centroid.x, centroid.y);

      if (
        dThumbToCentroid < centroidThreshold &&
        dIndexToCentroid < centroidThreshold &&
        dMiddleToCentroid < centroidThreshold
      ) {
        gesture = "selecting";
      }
    }

    if (gesture === "selecting" && !isSelecting && !isDeveloping && centroid) {
      isSelecting = true;
      selectionStart = { ...centroid };
      selectionEnd = { ...centroid };
    } else if (gesture === "selecting" && isSelecting && centroid) {
      selectionEnd = { ...centroid };
    } else if (gesture === "released" && isSelecting) {
      isSelecting = false;
      const w = Math.abs(selectionStart.x - selectionEnd.x);
      const h = Math.abs(selectionStart.y - selectionEnd.y);

      // Only start development if selection is large enough
      if (w > minSnapshotSize || h > minSnapshotSize) {
        isDeveloping = true;
        developmentStartTime = sk.millis();
        pendingCapture = {
          x: Math.min(selectionStart.x, selectionEnd.x),
          y: Math.min(selectionStart.y, selectionEnd.y),
          w,
          h,
        };
        flash = {
          ...pendingCapture,
          flashDuration: developmentDuration,
          flashStartTime: sk.millis(),
        };
      } else {
        // Reset immediately for small selections
        selectionStart = null;
        selectionEnd = null;
      }
    }

    for (let i = snapshots.length - 1; i >= 0; i--) {
      const { img, x, y, w, h, startTime } = snapshots[i];

      if (fadeEnabled) {
        const elapsed = sk.millis() - startTime;
        if (elapsed > fadeStartTime) {
          // Calculate fade opacity
          const fadeElapsed = elapsed - fadeStartTime;
          const opacity = sk.map(fadeElapsed, 0, fadeDuration, 255, 0);

          if (opacity <= 0) {
            // Remove completely faded snapshots
            snapshots.splice(i, 1);
            continue;
          }

          // Apply fade
          sk.tint(255, opacity);
          sk.image(img, x, y, w, h);
          sk.noTint();
        } else {
          // No fade yet
          sk.image(img, x, y, w, h);
        }
      } else {
        // No fade, normal display
        sk.image(img, x, y, w, h);
      }
    }

    if ((isSelecting || isDeveloping) && selectionStart) {
      sk.push();
      sk.noFill();
      sk.strokeWeight(2);
      sk.drawingContext.setLineDash([5, 5]);

      const bounds = pendingCapture || {
        x: Math.min(selectionStart.x, selectionEnd.x),
        y: Math.min(selectionStart.y, selectionEnd.y),
        w: Math.abs(selectionStart.x - selectionEnd.x),
        h: Math.abs(selectionStart.y - selectionEnd.y),
      };

      // Yellow for too small, red for good size selection
      if (bounds.w < minSnapshotSize && bounds.h < minSnapshotSize) {
        sk.stroke(255, 255, 0); // Yellow
      } else {
        sk.stroke(255, 0, 0); // Red
      }

      sk.rect(bounds.x, bounds.y, bounds.w, bounds.h);
      sk.drawingContext.setLineDash([]);
      sk.pop();
    }

    if (flash) {
      const elapsed = sk.millis() - flash.flashStartTime;
      if (elapsed < flash.flashDuration) {
        const opacity = sk.map(elapsed, 0, flash.flashDuration, 240, 0);
        sk.fill(255, opacity);
        sk.noStroke();
        sk.rect(flash.x, flash.y, flash.w, flash.h);
      } else {
        flash = null;
      }
    }

    if (centroid) {
      sk.push();
      if (isSelecting) {
        // Check if current selection is large enough
        const currentW = selectionEnd
          ? Math.abs(selectionStart.x - selectionEnd.x)
          : 0;
        const currentH = selectionEnd
          ? Math.abs(selectionStart.y - selectionEnd.y)
          : 0;

        if (currentW < minSnapshotSize && currentH < minSnapshotSize) {
          sk.fill(255, 255, 0); // Yellow for too small
        } else {
          sk.fill(255, 0, 0); // Red for good size
        }
        sk.noStroke();
      } else {
        sk.noFill();
        sk.stroke(255);
        sk.strokeWeight(2);
      }
      sk.ellipse(centroid.x, centroid.y, 24);
      sk.pop();
    }

    // if (centroid) {
    //   sk.push();
    //   sk.fill(0, 255, 0);
    //   sk.noStroke();
    //   sk.ellipse(LM.X4, LM.Y4, 8);
    //   sk.ellipse(LM.X8, LM.Y8, 8);
    //   sk.ellipse(LM.X12, LM.Y12, 8);
    //   sk.pop();
    // }

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

      if (snapshots.length > snapshotLimit) {
        snapshots.shift();
      }

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
