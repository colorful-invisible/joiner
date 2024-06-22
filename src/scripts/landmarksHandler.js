export const getMappedLandmarks = (sketch, mediaPipe, webcamFeed, indices) => {
  const mappedLandmarks = {};

  mediaPipe.landmarks.forEach((handLandmarks, handIndex) => {
    if (handLandmarks) {
      indices.forEach((index) => {
        if (handLandmarks[index]) {
          const landmarkNameX = `LM${handIndex}_${index}X`;
          const landmarkNameY = `LM${handIndex}_${index}Y`;

          mappedLandmarks[landmarkNameX] = sketch.map(
            handLandmarks[index].x,
            1,
            0,
            0,
            webcamFeed.scaledWidth
          );

          mappedLandmarks[landmarkNameY] = sketch.map(
            handLandmarks[index].y,
            0,
            1,
            0,
            webcamFeed.scaledHeight
          );
        }
      });
    }
  });
  return mappedLandmarks;
};
