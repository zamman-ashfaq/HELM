# Webcam fatigue screening (vision lead)

Screening aid only. It is not a diagnosis.

## Why this method
PERCLOS (percentage of eye closure) is the most validated video measure of
drowsiness. In Dinges' NASA/US-DOT-backed work it correlated highly with vigilance
lapses on the reaction test (PVT), both within and between people (average r = 0.875).
[A: FMCSA TB98-006, Dinges and Grace 1998]

## Definitions
- PERCLOS: share of time in a window (usually 60 seconds) when the eyes are at least
  80 percent closed (the "P80" version). [A: Wierwille 1994, US DOT]
- Eye Aspect Ratio (EAR): eye height divided by eye width from face landmarks. It falls
  towards 0 as the eye closes. MediaPipe Face Mesh gives 468 landmarks. [A: Soukupova
  and Cech 2016, arXiv 2511.13618]
- Blink duration and blink rate: fatigued people blink more often and more slowly. [A]
- MAR (mouth aspect ratio) can detect yawns. Head nodding can be tracked with pose.

## Numbers
- Fixed EAR thresholds in published systems are about 0.20 to 0.25. They fail across
  different faces, so CALIBRATE: set the closed-eye threshold at about 65 percent of
  the person's open-eye EAR. [A/B]
- A real drowsy-driver monitor used PERCLOS warning levels of 8, 10 and 12 percent over
  1, 2 and 3 minute windows. Open projects use about 15 percent over 60 s. [A: CMU]
- Reported accuracy of simple EAR systems is about 80 to 92 percent in small tests,
  and drops with glasses, low light and head turns. [B]
- PERCLOS alone may miss some drowsiness; combine it with other cues. [A: Abe 2023]

## Recommended design [TEAM]
1. 20-second calibration at the start per person (open eyes, a few blinks).
2. Compute PERCLOS over 60 seconds. Green below 8 percent, yellow 8 to 15, red above 15.
3. Add blink duration and yawn count to the score. Use hysteresis to avoid flicker.
4. Feed the result into the Sleep and fatigue card as a "visual fatigue" sub-score.
5. Show a clear note: "Screening only. Confirm with the reaction test."
6. Process on the device. Do not store video (privacy).
