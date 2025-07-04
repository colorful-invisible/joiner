export const getMappedLandmarks = (sketch, mediaPipe, camFeed, indices) => {
  const mappedLandmarks = {};

  if (mediaPipe.landmarks.length > 0 && mediaPipe.landmarks[0]) {
    indices.forEach((index) => {
      if (mediaPipe.landmarks[0][index]) {
        const LMX = `X${index}`;
        const LMY = `Y${index}`;

        mappedLandmarks[LMX] = sketch.map(
          mediaPipe.landmarks[0][index].x,
          1,
          0,
          0,
          camFeed.scaledWidth
        );

        mappedLandmarks[LMY] = sketch.map(
          mediaPipe.landmarks[0][index].y,
          0,
          1,
          0,
          camFeed.scaledHeight
        );
      }
    });
  }

  return mappedLandmarks;
};
