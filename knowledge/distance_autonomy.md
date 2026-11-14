# Distance mode and the Autonomy Meter

## The problem [A: NASA]
- Moon: about 1.3 seconds one way. Lunar-surface links via relays may run about 3 to
  10 seconds one way.
- Mars: about 4 minutes one way at closest approach to about 24 minutes at greatest
  distance. A question and its answer take 8 to 48 minutes.
- Mars can also be hidden behind the Sun, which interrupts contact. [B]
- NASA analysis of ground-to-crew roles shows that as delay grows, the ground
  moves from direct control toward guidance and oversight, and crews must solve
  more problems themselves. [A: NASA NTRS 20240006867]
- NASA calls the goal Earth-Independent Medical Operations. [B]
- Mars-500 ground analog tested delays from 8 to 737 seconds. [A]

## Distance modes (use in the toggle)
| Mode | One-way delay | Round trip | Who decides |
|---|---|---|---|
| ISS / low orbit | negligible | negligible | Ground can guide in real time |
| Moon | 1.3 s (3 to 10 s surface relay) | 2.6 s (6 to 20 s) | Shared, ground confirms |
| Mars, close | about 4 min | about 8 min | Crew leads, ground reviews |
| Mars, far | about 24 min | about 48 min | Crew decides alone |
| Link down / blackout | no link | none | Crew decides alone, store messages |

## Autonomy Meter [TEAM design, inspired by NASA's shift from control to oversight]
Autonomy = how much the crew and onboard system must handle without Earth.
| Round-trip delay | Meter | App behaviour |
|---|---|---|
| under 10 s | Low (about 10 percent) | Show alert and offer live ground consult |
| 10 s to 5 min | Medium (about 40 percent) | Advisor gives first steps, ground confirms |
| 5 to 30 min | High (about 75 percent) | Advisor leads, ground gets a summary |
| over 30 min or no link | Full (100 percent) | Advisor leads, queue everything for Earth |

## Message priority for delay-tolerant sync [TEAM]
- P0 emergency: act locally now AND transmit immediately.
- P1 urgent: transmit at the next link, include the advisor's reasoning.
- P2 routine: batch into a daily summary.
Show on screen the "expected ground reply time" (round trip) for P0 and P1.

## Pitch line support
NASA and Google are testing CMO-DA, a medical AI assistant for exactly this gap.
Our project is the monitoring layer that feeds and triggers that kind of assistant.
[B: TechCrunch Aug 2025, Space.com, MeriTalk]
