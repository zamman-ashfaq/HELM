# Research Package: Astronaut Health Monitor (research branch)

Complete, verified research for all five dashboard cards plus the extra features
(distance mode / Autonomy Meter, webcam fatigue screening, AI advisor rules).
Nothing here needs more work from the research lead. Teammates can use it as is.

## What is inside

| Path | Who uses it | What it is |
|---|---|---|
| knowledge/00_advisor_rules.md | LLM / advisor lead | System prompt, guardrails, example answers |
| knowledge/oxygen_co2.md | everyone | Cabin air limits and CO2 evidence |
| knowledge/radiation.md | everyone | Dose limits, dose rates, solar storms |
| knowledge/sleep_fatigue.md | everyone | Sleep data, PVT test, fatigue |
| knowledge/heart_fitness.md | everyone | Heart, HRV, bone, muscle, exercise |
| knowledge/mental_stress.md | everyone | Isolation, mood, cognitive testing |
| knowledge/distance_autonomy.md | logic lead | Communication delay and Autonomy Meter design |
| knowledge/vision_fatigue_screening.md | vision lead | PERCLOS and eye-closure screening method |
| knowledge/common_conditions.md | advisor lead | NASA list of likely in-flight conditions |
| knowledge/indicator_table.md | frontend lead | One-page summary table for the detail views |
| knowledge/glossary.md | everyone | Plain-language terms and unit conversions |
| knowledge/pitch_facts.md | whoever presents | Best facts for the demo plus judge Q&A |
| knowledge/verification_log.md | research lead | What was checked, corrected and resolved |
| knowledge/sources.md | everyone | All sources, graded A/B |
| data/demo_data.json | logic lead | Thresholds, environments, crew baselines |
| data/scenarios.json | logic and frontend | Six ready-made demo scenarios |

## Source grades used in every file

- [A] NASA standard, NASA technical report, or peer-reviewed paper
- [B] Reputable secondary source (news or summary of A-level work)
- [TEAM] A design choice made by us. It is not a NASA number.

## Honest limits (say these out loud if asked)

1. The green / yellow / red bands are TEAM choices anchored on real NASA numbers.
2. All astronaut data in the demo is simulated.
3. The webcam fatigue screen is a screening aid, not a medical diagnosis.
4. The AI advisor supports a crew member. It does not replace a doctor.

## How to put this on your branch

    git checkout -b research
    (copy knowledge/ and data/ and this README into the repo)
    git add .
    git commit -m "Add verified research package"
    git push -u origin research
