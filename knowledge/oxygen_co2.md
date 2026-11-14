# Oxygen and CO2 (cabin air)

## What it measures
Oxygen partial pressure (ppO2) and CO2 partial pressure (ppCO2) in the cabin, plus
crew symptoms (headache, drowsiness, poor concentration).

## Key facts
- ISS cabin design range: total pressure 97.9 to 102.7 kPa, oxygen 19.5 to 23.1 kPa.
  Normal ISS air is about 21 percent oxygen. [A: NASA NTRS 20120015343]
- Normal oxygen intake (normoxia) is a PIO2 of 149 mmHg. NASA-STD-3001 also
  requires at least 30 percent inert gas in the cabin mix to prevent lung collapse
  from absorbed oxygen. [A: NASA-STD-3001 Vol 2]
- CO2 limits have tightened over time, because crews felt symptoms below old limits:

| Level | mmHg | kPa | ppm (at 1 atm) | Meaning | Grade |
|---|---|---|---|---|---|
| Old ISS design range | 5.3 to 7.5 | 0.7 to 1.0 | 7,000+ | Original design, long-stay SMAC about 7,000 ppm | A |
| ISS operations since 2010 | 4.0 (24-hour average) | 0.53 | about 5,260 | Operational limit, lower if crew have symptoms | A |
| NASA-STD-3001 for new vehicles | 3.0 (1-hour average) | 0.40 | about 3,950 | Current standard [V2 6004] | A |
| First symptoms reported by ISS crew | 2.3 | 0.31 | about 3,030 | Headache and similar complaints | A |
| Suggested health and performance range | 0.5 to 2.0 | 0.07 to 0.27 | 660 to 2,630 | NASA medical authors' view | A |
| Earth outdoor air | about 0.3 | 0.04 | about 420 | General reference value | common knowledge |

- Conversion: 1 mmHg = 0.1333 kPa = about 1,316 ppm at 1 atmosphere.
- When ventilation stops, CO2 builds up around a person's face. In a NASA model of a
  lunar outpost, one crew member breathing in an unventilated cabin reached an
  inspired CO2 of 10 mmHg after about 2 hours, and two crew reached it in about
  1.4 hours. Earlier simple models predicted limits within 40 seconds, which NASA
  found overly pessimistic. [A: NASA NTRS 20250006273, 20250003881]
- NASA's Integrated Medical Model counts CO2-induced headache as a named condition
  (about 2 per mission in the sample output). [A: NASA NASA-STD-3001 Appendix E]
- Metabolic oxygen use: 0.49 to 1.25 kg per person per day, average 0.84.
  [A: NASA NTRS 20120015343]

## Demo thresholds [TEAM, anchored on the table above]
CO2 (1-hour average): green below 2.3, yellow 2.3 to 3.0, red 3.0 to 10, critical 10 or more.
Oxygen: green 19.5 to 23.1 kPa, yellow within 1 kPa outside that range, red beyond.

## Actions
Turn fans on, check the CO2 scrubber, move the person to fresher air, report to the
commander, and follow the emergency procedure if CO2 keeps rising.
