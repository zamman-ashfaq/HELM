# MediaPipe pose runtime (optional)

The physical assessment page looks for the pose bundle in this folder:

```
frontend/vendor/mediapipe/
  vision_bundle.mjs                  MediaPipe Tasks Vision ESM bundle
  wasm/                              the wasm files that ship with it
  pose_landmarker_lite.task          pose landmarker model
```

Drop those three in and reload the page — no code change is needed.
`frontend/js/vision.js` imports `vision_bundle.mjs`, resolves
`FilesetResolver.forVisionTasks("../vendor/mediapipe/wasm/")` and creates a
`PoseLandmarker` in `VIDEO` mode.

Without them the page runs in motion mode: it measures real frame-to-frame
movement (motion energy, active time, centroid sway, trace jitter) and says so.
It never fabricates landmarks, joint angles or a skeleton, and it never loads a
model from a CDN, because the platform has to work with the link switched off.

Everything is processed in the browser tab. No video is uploaded anywhere.
