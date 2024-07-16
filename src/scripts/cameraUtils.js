export function initializeCamCapture(sketch, mediaPipeHandler) {
  const camFeed = sketch.createCapture(
    {
      flipped: true,
      audio: false,
    },
    () => {
      calculateVideoDimensions(sketch, camFeed);
      mediaPipeHandler.predictWebcam(camFeed);
    }
  );
  camFeed.elt.setAttribute("playsinline", "");
  camFeed.hide();
  return camFeed;
}

function calculateVideoDimensions(sketch, feed) {
  let canvasRatio = sketch.width / sketch.height;
  let videoRatio = feed.width / feed.height;
  let x = 0;
  let y = 0;
  let w = sketch.width;
  let h = sketch.height;

  if (canvasRatio > videoRatio) {
    // Canvas is wider than video
    h = sketch.width / videoRatio;
    y = (sketch.height - h) / 2;
  } else {
    // Canvas is taller than video
    w = sketch.height * videoRatio;
    x = (sketch.width - w) / 2;
  }

  feed.scaledWidth = w;
  feed.scaledHeight = h;
  feed.x = x;
  feed.y = y;
}
