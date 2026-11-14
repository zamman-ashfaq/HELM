# Radiation

## What it measures
Cumulative effective dose in millisieverts (mSv) from personal and cabin dosimeters,
plus the current dose rate (mSv per day) and any solar storm.

## NASA limits [A: NASA-STD-3001 Vol 1 Rev C, checked directly]
- Career limit [V1 4030]: total career spaceflight dose must be below 600 mSv. Same
  for all ages and sexes. Based on a 3 percent risk of cancer death for a
  35-year-old woman. It includes all past flights.
- Solar particle event [V1 4031]: the programme must protect crew from the design
  reference storm (the October 1989 events) so it stays below 250 mSv. This is a
  vehicle design requirement, not a personal alarm level.
- Galactic cosmic rays [V1 4033]: habitats for stays over 60 days must keep the dose
  rate below 1.3 mSv per day in free space and 0.9 mSv per day on a planet surface.
  (A 2021 NASA overview listed 0.8 for surfaces, Rev C says 0.9. Use 0.9.)
- Nuclear power sources [V1 4032]: less than 20 mSv per mission year.
- Principle: keep every dose As Low As Reasonably Achievable (ALARA).
- 30-day blood-forming-organ limit: 250 mGy-Eq. [A: earlier NASA-STD-3001 table]

## Measured dose rates
| Place | Dose equivalent | Grade |
|---|---|---|
| Earth surface, natural | about 2 to 3 mSv per year | A |
| ISS (low orbit) | roughly 0.5 to 0.7 mSv per day, varies | B |
| Cruise to Mars (measured by Curiosity's RAD, 2011 to 2012) | 1.84 mSv per day | A |
| Mars surface (measured by RAD) | 0.64 mSv per day | A |
| Solar storms during that cruise | 24.7 mSv in total (events of 4.0, 19.5, 1.2) | A |

- Solar storms were only about 5 percent of the cruise dose. Cosmic rays dominate.
- Mars mission: 180 days out, 500 on Mars, 180 back is about 1.01 Sv (1,010 mSv).
  Cruise legs alone are about 660 mSv. Both exceed the 600 mSv limit.
  At 1.84 mSv per day, 600 mSv is reached after about 326 days.
  NASA would need a waiver or better shielding for Mars. [A and B: Science 2013,
  Zeitlin, National Academies 2021]
- Solar maximum lowers the cosmic-ray dose, possibly to a quarter of the measured
  rate, but raises storm risk. [A: Guo et al., arXiv 1503.06631]

## Health effects
Long term: higher cancer risk, possible effects on brain, heart and eyes.
Short term (big storms only): nausea, vomiting, fatigue. Vomiting is expected from
roughly 750 to 1,000 mSv in a short time. [A: arXiv 1710.07711]

## Demo thresholds [TEAM]
Cumulative: green below 300 (50 percent), yellow 300 to 480, red 480 to 600, critical 600 or more.
Single storm: green below 20 (similar to the 19.5 mSv event Curiosity measured),
yellow 20 to 100, red 100 to 250, critical above 250.

## Actions
Move to the shielded storm shelter, reduce time outside, track the total against
600 mSv, and report big jumps to the commander and ground.
