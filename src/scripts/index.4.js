import p5 from "p5";
import { mediaPipe as handModel } from "./handsModel";
import { mediaPipe as poseModel } from "./poseModel";
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
  let useHandModel = true;

  const developmentDuration = 750;
  const minSnapshotSize = 80; // Minimum dimesions in pixels for a valid snapshot
  const snapshotLimit = 20; // Maximum number of snapshots to keep
  const fadeEnabled = true;
  const fadeStartTime = 120000; // Start fading after
  const fadeDuration = 10000;

  function detectHandGesture(LM) {
    const baseCentroidThreshold = 32; // Base threshold for centroid distance (camera distance relation)
    const referenceHandSize = 128;

    if (
      LM.X4 !== undefined &&
      LM.X8 !== undefined &&
      LM.X12 !== undefined &&
      LM.X0 !== undefined
    ) {
      const handSize = sk.dist(LM.X0, LM.Y0, LM.X12, LM.Y12);
      const dynamicThreshold =
        (handSize / referenceHandSize) * baseCentroidThreshold;

      const centroid = {
        x: (LM.X4 + LM.X8 + LM.X12) / 3,
        y: (LM.Y4 + LM.Y8 + LM.Y12) / 3,
      };

      const dThumbToCentroid = sk.dist(LM.X4, LM.Y4, centroid.x, centroid.y);
      const dIndexToCentroid = sk.dist(LM.X8, LM.Y8, centroid.x, centroid.y);
      const dMiddleToCentroid = sk.dist(LM.X12, LM.Y12, centroid.x, centroid.y);

      if (
        dThumbToCentroid < dynamicThreshold &&
        dIndexToCentroid < dynamicThreshold &&
        dMiddleToCentroid < dynamicThreshold
      ) {
        return { gesture: "selecting", centroid };
      }

      return { gesture: "released", centroid };
    }
    return { gesture: "released", centroid: null };
  }

  function detectPoseGesture(LM) {
    const poseThreshold = 80;

    if (LM.X21 !== undefined && LM.X22 !== undefined) {
      // Use landmark 22 (right index fingertip) as the tip position
      const centroid = {
        x: LM.X22,
        y: LM.Y22,
      };

      // Use distance between landmarks 21 and 22 as the trigger
      const distance = sk.dist(LM.X21, LM.Y21, LM.X22, LM.Y22);

      console.log("Pose distance:", distance, "threshold:", poseThreshold);

      if (distance < poseThreshold) {
        return { gesture: "selecting", centroid };
      }

      return { gesture: "released", centroid };
    }
    console.log("Pose landmarks 21 or 22 not found");
    return { gesture: "released", centroid: null };
  }

  sk.setup = () => {
    sk.createCanvas(sk.windowWidth, sk.windowHeight);
    sk.background(0);
    sk.textSize(20);
    sk.textAlign(sk.CENTER, sk.CENTER);
    camFeed = initializeCamCapture(sk, useHandModel ? handModel : poseModel);

    // Add toggle button event listener
    const toggleButton = document.getElementById("modelToggle");
    toggleButton.addEventListener("click", () => {
      useHandModel = !useHandModel;
      toggleButton.querySelector(".toggle-text").textContent = useHandModel
        ? "HAND"
        : "POSE";

      // Reinitialize camera with new model
      camFeed = initializeCamCapture(sk, useHandModel ? handModel : poseModel);
    });
  };

  sk.draw = () => {
    sk.background(0);

    if (!camFeed) {
      sk.fill(0);
      sk.text("LOADING", sk.width / 2, sk.height / 2);
      return;
    }

    sk.image(camFeed, 0, 0, camFeed.scaledWidth, camFeed.scaledHeight);

    // Get the current model and landmark indices
    const currentModel = useHandModel ? handModel : poseModel;
    const landmarksIndex = useHandModel ? [4, 8, 12, 0] : [21, 22]; // Hand: thumb, index, middle, wrist | Pose: both index fingertips for distance check

    // Debug: Log model state
    if (!useHandModel) {
      console.log("Pose model landmarks count:", currentModel.landmarks.length);
      if (currentModel.landmarks.length > 0) {
        console.log("First pose landmarks:", currentModel.landmarks[0]);
      }
    }

    const LM = getMappedLandmarks(sk, currentModel, camFeed, landmarksIndex);

    // Get gesture and centroid using the appropriate model
    const gestureResult = useHandModel
      ? detectHandGesture(LM)
      : detectPoseGesture(LM);
    const centroid = gestureResult.centroid;
    const gesture = gestureResult.gesture;

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

    // Debug: Show landmark points (uncomment for debugging)
    // if (centroid) {
    //   sk.push();
    //   sk.fill(0, 255, 0);
    //   sk.noStroke();
    //   if (useHandModel) {
    //     sk.ellipse(LM.X4, LM.Y4, 8);  // Thumb
    //     sk.ellipse(LM.X8, LM.Y8, 8);  // Index
    //     sk.ellipse(LM.X12, LM.Y12, 8); // Middle
    //   } else {
    //     sk.ellipse(LM.X19, LM.Y19, 8); // Left index
    //     sk.ellipse(LM.X20, LM.Y20, 8); // Right index
    //   }
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
