// Version 2.1 - 03.07.2025 - Pose Model
export function initializeCamCapture(sk, poseModel) {
  const startPosePrediction = () => {
    if (poseModel?.isInitialized) {
      console.log("Starting pose prediction...");
      poseModel.predictWebcam(camFeed);
    } else {
      console.log("Pose model not initialized yet");
    }
  };

  const camFeed = sk.createCapture(
    {
      flipped: true,
      audio: false,
      video: {
        width: { ideal: 1920, min: 1280 },
        height: { ideal: 1080, min: 720 },
        frameRate: { ideal: 30, min: 15 },
      },
    },
    () => {
      updateFeedDimensions(sk, camFeed, false);
      startPosePrediction();
    }
  );

  // Event listeners
  camFeed.elt.addEventListener("loadeddata", () =>
    console.log(
      `Camera loaded: ${camFeed.elt.videoWidth}x${camFeed.elt.videoHeight}`
    )
  );
  camFeed.elt.addEventListener("error", (e) =>
    console.error("Camera error:", e)
  );
  camFeed.elt.addEventListener("canplay", startPosePrediction);

  camFeed.elt.setAttribute("playsinline", "");
  camFeed.hide();
  return camFeed;
}

export function updateFeedDimensions(sk, feed, fitToHeight = false) {
  if (!feed) return;

  const canvasRatio = sk.width / sk.height;
  const videoRatio = feed.width / feed.height;
  let x = 0,
    y = 0,
    w = sk.width,
    h = sk.height;

  if (canvasRatio > videoRatio) {
    if (fitToHeight) {
      w = sk.height * videoRatio;
      x = (sk.width - w) / 2;
    } else {
      h = sk.width / videoRatio;
      y = (sk.height - h) / 2;
    }
  } else {
    w = sk.height * videoRatio;
    x = (sk.width - w) / 2;
  }

  Object.assign(feed, { scaledWidth: w, scaledHeight: h, x, y });
}
