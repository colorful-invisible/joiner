// Version 2.1 - 03.07.2025 - Gesture Recognizer
export function initializeCamCapture(sk, gesturePipe) {
  const camFeed = sk.createCapture(
    {
      flipped: true,
      audio: false,
      video: {
        width: { ideal: 1920, min: 1280 },
        height: { ideal: 1080, min: 720 },
        frameRate: { ideal: 30, min: 24 },
      },
    },
    (stream) => {
      console.log("Camera initialized:", stream.getTracks()[0].getSettings());
      updateFeedDimensions(sk, camFeed, false);
      gesturePipe.predict(camFeed);
    }
  );

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

  feed.scaledWidth = w;
  feed.scaledHeight = h;
  feed.x = x;
  feed.y = y;
}
