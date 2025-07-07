# Chronotope #1 - Fragments

An interactive digital collage application inspired by David Hockney's photographic collages. Create layered snapshots of live video using gesture-based selection.

![Screenshot](readme-images/screenshot_01.png "Screen")

## How It Works

### Gesture Controls

The application supports two interaction modes:

#### Close Gesture Mode (3-Finger)

- **Selection**: Bring thumb, index, and middle finger together to start selecting
- **Area Definition**: Move your closed fingers to define the capture area
- **Capture**: Release fingers to capture the selected region

#### Far Gesture Mode (2-Hand)

- **Selection**: Bring index fingers of both hands close together
- **Area Definition**: Move hands apart while keeping fingers close to define capture area
- **Capture**: Separate index fingers to capture the selected region

### Visual Feedback

- **Dashed Lines**: Show active selection boundaries
- **Yellow Rectangle**: Selection area is too small (below 80px threshold)
- **Red Rectangle**: Valid selection area ready for capture
- **White Flash**: Indicates successful capture during development phase

### Technical Features

- **Real-time Camera Processing**: Live video feed with MediaPipe hand tracking
- **Frame-based Debouncing**: Gesture confirmation over 12 frames for stability
- **Snapshot Management**: Stores up to 20 captured fragments with automatic cleanup
- **Configurable Fade**: Snapshots fade after 2 minutes over 10 seconds (configurable)
- **Development Timer**: 750ms processing time with visual feedback (gives time to the photographer to scape or to be at the snapshot)
- **Responsive Layout**: Adapts to window resizing while maintaining aspect ratios
- **Toggle Switch**: Switch between Close/Far gesture modes

## Reference

Inspired by David Hockney's photographic collages: https://www.hockney.com/works/photos/photographic-collages
