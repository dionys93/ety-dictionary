// web/src/components/house/constants.js
//
// Shared numeric constants used across the house components, so a single
// source of truth defines the building's dimensions and the camera poses.

export const HOUSE_WIDTH = 2;
export const HOUSE_HEIGHT = 1;
export const HOUSE_DEPTH = 1.5;

export const DOOR_WIDTH = 0.4;
export const DOOR_HEIGHT = 0.75; // shorter than the house so there's wall (a header) above it

export const GROUND_SIZE = 30;
export const GROUND_THICKNESS = 0.3;

export const LERP_SPEED = 0.08;

// Camera poses for outside vs. inside the house, and the constants that
// drive the fly-between transition. See CameraRig.jsx.
export const EXTERIOR_CAMERA = { position: [4, 3, 5], target: [0, 0, 0] };
export const INTERIOR_CAMERA = { position: [0, 0.65, 0.5], target: [0, 0.15, -0.3] };
export const CAMERA_LERP_SPEED = 0.045;
export const CAMERA_ARRIVE_EPSILON = 0.01;

// Named states instead of bare strings, so a typo anywhere becomes a visible
// bug (undefined) instead of silently creating a new, never-matched state.
export const VIEW_MODE = {
  EXTERIOR: 'exterior',
  ENTERING: 'entering',
  INTERIOR: 'interior',
  EXITING: 'exiting',
};