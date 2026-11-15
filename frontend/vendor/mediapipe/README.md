# MediaPipe runtime (vendored, offline)

Everything the Physical Assessment page needs to track a body is in this folder.
The page loads these files from this directory with relative URLs only — no CDN,
no font, no model download at runtime.

## Files

| File | Size | Version / source |
| --- | --- | --- |
| `vision_bundle.mjs` | 155,990 B | `@mediapipe/tasks-vision@1.2.3` → `npm pack @mediapipe/tasks-vision` → `package/vision_bundle.mjs` |
| `vision_bundle.js` | 155,990 B | byte-identical copy of `vision_bundle.mjs` |
| `wasm/vision_wasm_internal.js` | 336,624 B | same tarball, `package/wasm/` |
| `wasm/vision_wasm_internal.wasm` | 14,665,716 B | same tarball, `package/wasm/` |
| `wasm/vision_wasm_module_internal.js` | 336,662 B | same tarball, `package/wasm/` |
| `wasm/vision_wasm_module_internal.wasm` | 14,665,738 B | same tarball, `package/wasm/` |
| `pose_landmarker_lite.task` | 5,777,746 B | `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task` |

The bundle and the WASM must stay on the **same** version: the JS loader in
`wasm/vision_wasm_internal.js` is generated to match the Emscripten glue of that
package release.

### Why two copies of the bundle

`vision_bundle.mjs` is the upstream name. `python -m http.server` (and a few
other static servers) reply `Content-Type: text/plain` for `.mjs`, and browsers
refuse to import a module served as text. `vision_bundle.js` is served correctly,
so `js/vision.js` asks the server which copy it labels as JavaScript before it
imports anything — it never fires a failing import at the console.

## Optional: better accuracy

Drop `pose_landmarker_full.task` (float16, same URL with
`pose_landmarker_full` instead of `pose_landmarker_lite`) next to the lite model.
`vision.js` probes for it and uses it automatically; without it the lite model
runs. Both are pose models, the 33-landmark topology is identical.

## Offline check

With the network disabled, `frontend/physical.html` must show
**Pose tracking · on device** in the header pill, draw the skeleton and report
joint angles. Requests are limited to this folder plus the page's own CSS/JS.

## If these files are missing

The page keeps working in **motion mode**: frame differencing on a 96×54 copy of
the video, movement energy and a mobility index, no landmarks, no joint angles,
no skeleton. It says so in the header pill and in "Details". Nothing is
simulated and no landmark is ever invented.

## Licence

The MediaPipe Tasks runtime and the pose models are Apache-2.0, © Google LLC.
They are vendored here unchanged so the demo runs without a network.
