// ---- SINOIDAL PULSE
// -------------------
function pulse(sk, min, max, time) {
  const mid = (min + max) / 2;
  const amplitude = (max - min) / 2;
  return amplitude * sk.sin(sk.frameCount * (sk.TWO_PI / time)) + mid;
}

// ---- AVERAGE LANDMARK POSITION FOR SMOOTHING
// --------------------------------------------
// Usage on index.js:
// const avgPos = averageLandmarkPosition(2);
// const noseX = avgPos("NX", LM.X0);
// const noseY = avgPos("NY", LM.Y0);

function averageLandmarkPosition(size) {
  let queues = {};

  return (key, value) => {
    if (!queues[key]) {
      queues[key] = [];
    }

    let queue = queues[key];
    queue.push(value);
    if (queue.length > size) {
      queue.shift();
    }

    // Calculate average
    let sum = queue.reduce((a, b) => a + b, 0);
    return sum / queue.length;
  };
}

export { averageLandmarkPosition };
