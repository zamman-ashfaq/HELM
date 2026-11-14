/* ===========================================================================
   HELM knowledge base: ALL TEXT HERE IS EDITABLE PLACEHOLDER CONTENT.
   Teammates: edit freely. Keep advice general and conservative.
   System entries are matched to data/demo_data.json by system id OR label,
   ignoring case, spaces and punctuation ("life_support" = "Life support").
   Nothing here is a medical threshold. No statistics beyond the cited CSA note.
   =========================================================================== */
(function (g) {
  'use strict';

  const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

  const PROTOCOL_NOTE = 'Follow your mission medical protocol.';

  /* ---- Distance modes. oneWaySec = [min, max] one-way delay in seconds. ---- */
  const MODES = {
    ISS:  { label: 'ISS',  sub: 'Low Earth orbit', oneWaySec: [0, 0],       delayClass: 0, delayLabel: 'Near-instant' },
    Moon: { label: 'Moon', sub: 'Lunar surface',   oneWaySec: [1.3, 1.3],   delayClass: 1, delayLabel: 'About 1.3 seconds' },
    Mars: { label: 'Mars', sub: 'Mars transit or surface', oneWaySec: [240, 1440], delayClass: 2, delayLabel: 'About 4 to 24 minutes' }
  };

  /* ---- Advice by mode, then by worst system status. {reply} = estimated round-trip time. ---- */
  const ADVICE = {
    ISS: {
      NOMINAL: { headline: 'All systems nominal.', steps: ['Continue routine monitoring and your scheduled check-ins.'] },
      CAUTION: { headline: 'Monitor closely.', steps: [
        'Re-check the flagged readings later today and log them.',
        'Note any symptoms with times.',
        'Raise it with the flight surgeon at your next scheduled contact.'] },
      WARNING: { headline: 'Contact flight surgeon now.', steps: [
        'Pause non-essential tasks and rest.',
        'Have your latest readings and symptoms ready to report.',
        'Follow the interim steps in your mission medical protocol while you wait.'] }
    },
    Moon: {
      NOMINAL: { headline: 'Nominal. Routine monitoring.', steps: ['Continue scheduled check-ins. Earth contact is fast if you need it.'] },
      CAUTION: { headline: 'Report to Earth and keep watching.', steps: [
        'Re-check the flagged readings and log them.',
        'Send a status note to Earth; replies take only seconds.',
        'Start the "What to do" steps for the affected system.'] },
      WARNING: { headline: 'Call Earth now, and start interim care while you talk.', steps: [
        'Start the interim steps from your protocol for the affected system.',
        'Have readings and symptoms ready.',
        'Call the flight surgeon now: the delay is only about 1.3 seconds each way, so a live conversation is possible.'] }
    },
    Mars: {
      NOMINAL: { headline: 'Nominal. You are your own first responder.', steps: [
        'Keep the daily check-in routine going.',
        'Routine reports go to Earth on the normal schedule.'] },
      CAUTION: { headline: 'Act on it yourself, and report early.', steps: [
        'Review the affected system\'s "What to do" steps and begin them now.',
        'Re-check readings after rest to see whether the trend continues.',
        'Queue a report to Earth early: a reply can take a long time.'] },
      WARNING: { headline: 'Start the self-treatment protocol first.', queue: true,
        steps: [
          'Follow your onboard medical protocol for the affected system immediately.',
          'Stop strenuous activity, rest, and brief a crewmate if you have one.',
          'Record symptoms, readings and times as you go.'],
        after: 'Report queued for Earth. Expected reply in ~{reply} after it is received.' }
    }
  };

  const OUTBOX_TEMPLATE = 'Health status report: {systems} in WARNING. Latest readings and symptom log attached. (Simulated)';

  /* ---- NASA's five hazards of human spaceflight -> systems affected (placeholder mapping). ---- */
  const HAZARDS = [
    { name: 'Radiation', note: 'Space radiation exposure over the mission.', systems: ['shielding', 'lifesupport', 'flightcomputer'] },
    { name: 'Isolation and confinement', note: 'Small crew, small space, long duration.', systems: ['flightcomputer', 'power'] },
    { name: 'Distance from Earth', note: 'Delayed communication and no quick return or resupply.', systems: ['power', 'flightcomputer', 'shielding'] },
    { name: 'Gravity fields', note: 'Microgravity in transit, partial gravity on the surface.', systems: ['structure', 'lifesupport', 'flightcomputer'] },
    { name: 'Hostile closed environments', note: 'Shared air, water, microbes and equipment.', systems: ['shielding', 'lifesupport', 'power'] }
  ];

  /* ---- Fields shown as a 1-10 slider in the check-in form: matched on indicator id, label or unit. ---- */
  const SLIDER = { match: /mood|\/10|1-10/i, min: 1, max: 10 };

  /* ---- Per-system notes. ---- */
  const SYSTEMS = {
    structure: {
      why: 'In microgravity, bones and muscles carry far less load than on Earth, so they can lose strength and mass unless they are regularly loaded through exercise.',
      measure: ['Log completed exercise time from your exercise device or session log.', 'Note any new bone, joint or back pain, or unusual muscle weakness.', 'Use the fitness checks defined in your mission medical protocol.'],
      actions: ['Complete your scheduled exercise session today.', 'If short on time, shorten the session rather than skipping it.', 'Report new pain or weakness at your next contact with the flight surgeon.', PROTOCOL_NOTE],
      sources: ['NASA HRP: Risk of Spaceflight-Induced Bone Changes', 'NASA HRP: Risk of Reduced Cardiorespiratory and Musculoskeletal Fitness']
    },
    lifesupport: {
      why: 'Without gravity, body fluids shift toward the head and the heart and blood vessels adapt, which can change heart rate, blood pressure and how you feel when you stand. Cabin air quality also matters for oxygen supply.',
      measure: ['Take resting heart rate and blood pressure at the same time each day, seated and rested, with the onboard device.', 'Note lightheadedness, breathlessness or chest discomfort.', 'Check cabin atmosphere readouts when available.'],
      actions: ['Stop strenuous activity and rest, then re-check.', 'Check cabin air readouts if breathing feels harder than usual.', 'Report persistent changes to the flight surgeon.', PROTOCOL_NOTE],
      sources: ['NASA HRP: Risk of Cardiovascular Adaptations', 'NASA HRP: Risk of Hypoxia']
    },
    shielding: {
      why: 'Spaceflight can alter immune responses and how microbes interact with the crew in a closed habitat. Radiation exposure is monitored too: the CSA notes that neutron radiation is about 30% of the radiation on the ISS.',
      measure: ['Take body temperature at the same time each day with the onboard thermometer.', 'Log symptoms such as sore throat, cough, rash or unusual tiredness.', 'Read your personal dosimeter as your protocol specifies.'],
      actions: ['Rest and re-check temperature after a while.', 'If you have a fever, limit close contact with crewmates as your protocol directs.', 'Stay hydrated as your protocol advises.', 'Report to the flight surgeon.', PROTOCOL_NOTE],
      sources: ['NASA HRP: Risk of Altered Immune System Responses', 'NASA HRP: Risk of Host-Microorganism Interactions', 'CSA: Monitoring radiation for astronaut health']
    },
    power: {
      why: 'Food supply is limited, and appetite and taste can change in space. Eating too little energy or too few nutrients can affect every other system.',
      measure: ['Log what and how much you eat each day.', 'Record body mass with the onboard device if your protocol includes it.', 'Note appetite, nausea or changes in thirst.'],
      actions: ['Eat your scheduled meals even if appetite is low.', 'Log intake so trends are visible.', 'Report sustained appetite loss to the flight surgeon.', PROTOCOL_NOTE],
      sources: ['NASA HRP: Risk of Inadequate Food and Nutrition']
    },
    flightcomputer: {
      why: 'Disrupted sleep, workload, isolation and fluid shifts can affect sleep, mood, concentration, balance and vision.',
      measure: ['Log hours slept from your sleep log or wearable.', 'Rate your mood on the 1-10 scale.', 'Note headaches, vision changes or dizziness.'],
      actions: ['Protect a consistent sleep window and keep the cabin calm before it.', 'Talk to crewmates or Earth support about mood.', 'Report any vision change promptly.', PROTOCOL_NOTE],
      sources: ['NASA HRP: Risk of Spaceflight Associated Neuro-ocular Syndrome (SANS)', 'NASA HRP: Risk of Altered Sensorimotor and Vestibular Function', 'ARCHeR sleep and activity study']
    }
  };

  const GENERIC = {
    why: 'Notes for this system have not been written yet. Add an entry in knowledge.js.',
    measure: ['Add measurement instructions in knowledge.js.'],
    actions: [PROTOCOL_NOTE],
    sources: ['Source not yet added']
  };

  function system(id, label) { return SYSTEMS[norm(id)] || SYSTEMS[norm(label)] || GENERIC; }

  g.HELM = g.HELM || {};
  g.HELM.Knowledge = { norm, PROTOCOL_NOTE, MODES, ADVICE, OUTBOX_TEMPLATE, HAZARDS, SLIDER, SYSTEMS, GENERIC, system };
})(window);