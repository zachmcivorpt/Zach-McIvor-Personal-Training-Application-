// Illustrative wearable/measurement history for the demo client — structured
// exactly like a real device-sync feed would be, so swapping in Apple
// Health/Garmin/Whoop later is a data-source change, not a UI change.

export const WEIGHT_HISTORY = [
  { date: "Jul 5", value: 84.2 }, { date: "Jul 12", value: 83.9 }, { date: "Jul 19", value: 83.5 },
  { date: "Jul 26", value: 83.1 }, { date: "Aug 2", value: 82.8 }, { date: "Aug 9", value: 82.6 },
  { date: "Aug 16", value: 82.0 }, { date: "Aug 23", value: 81.9 }, { date: "Aug 30", value: 81.8 },
];

export const STEPS_HISTORY = [
  { date: "Aug 28", value: 7120 }, { date: "Aug 29", value: 9840 }, { date: "Aug 30", value: 6200 },
  { date: "Aug 31", value: 11400 }, { date: "Sep 1", value: 8760 }, { date: "Sep 2", value: 10200 },
  { date: "Sep 3", value: 8421 },
];

export const SLEEP_HISTORY = [
  { date: "Aug 28", value: 7.1 }, { date: "Aug 29", value: 6.4 }, { date: "Aug 30", value: 7.8 },
  { date: "Aug 31", value: 8.2 }, { date: "Sep 1", value: 7.5 }, { date: "Sep 2", value: 6.9 },
  { date: "Sep 3", value: 8.2 },
];

export const BODY_FAT_HISTORY = [
  { date: "Jun 15", value: 21.4 }, { date: "Jul 15", value: 20.1 }, { date: "Aug 15", value: 18.9 },
  { date: "Sep 3", value: 18.0 },
];

export const RESTING_HR_HISTORY = [
  { date: "Aug 28", value: 61 }, { date: "Aug 29", value: 60 }, { date: "Aug 30", value: 59 },
  { date: "Aug 31", value: 60 }, { date: "Sep 1", value: 58 }, { date: "Sep 2", value: 59 },
  { date: "Sep 3", value: 58 },
];

export const BLOOD_PRESSURE_HISTORY = [
  { date: "Aug 6", systolic: 122, diastolic: 78 },
  { date: "Aug 20", systolic: 119, diastolic: 76 },
  { date: "Sep 3", systolic: 118, diastolic: 75 },
];

export const CALORIC_INTAKE_HISTORY = [
  { date: "Aug 28", value: 2140 }, { date: "Aug 29", value: 1980 }, { date: "Aug 30", value: 2260 },
  { date: "Aug 31", value: 2050 }, { date: "Sep 1", value: 1890 }, { date: "Sep 2", value: 2010 },
  { date: "Sep 3", value: 1762 },
];

export const CALORIC_BURN_HISTORY = [
  { date: "Aug 28", value: 2680 }, { date: "Aug 29", value: 2910 }, { date: "Aug 30", value: 2540 },
  { date: "Aug 31", value: 3020 }, { date: "Sep 1", value: 2790 }, { date: "Sep 2", value: 2880 },
  { date: "Sep 3", value: 2650 },
];

export const LEAN_MASS_HISTORY = [
  { date: "Jun 15", value: 62.8 }, { date: "Jul 15", value: 63.6 }, { date: "Aug 15", value: 64.3 },
  { date: "Sep 3", value: 65.1 },
];

export const BENCH_HISTORY = [
  { date: "Jun", value: 92 }, { date: "Jul", value: 96 }, { date: "Aug", value: 101 }, { date: "Sep", value: 103 },
];

export const VOLUME_HISTORY = [
  { week: "W1", volume: 18200 }, { week: "W2", volume: 19100 }, { week: "W3", volume: 17800 },
  { week: "W4", volume: 20400 }, { week: "W5", volume: 21200 }, { week: "W6", volume: 22600 },
];

function last(series) {
  return series[series.length - 1];
}

export function METRIC_TILES() {
  const bp = last(BLOOD_PRESSURE_HISTORY);
  return [
    { key: "steps", label: "Steps", unit: "", decimals: 0, series: STEPS_HISTORY, latest: last(STEPS_HISTORY).value, date: last(STEPS_HISTORY).date },
    { key: "sleep", label: "Sleep", unit: "h", decimals: 1, series: SLEEP_HISTORY, latest: last(SLEEP_HISTORY).value, date: last(SLEEP_HISTORY).date },
    { key: "weight", label: "Body Weight", unit: "kg", decimals: 1, series: WEIGHT_HISTORY, latest: last(WEIGHT_HISTORY).value, date: last(WEIGHT_HISTORY).date },
    { key: "bodyfat", label: "Body Fat", unit: "%", decimals: 1, series: BODY_FAT_HISTORY, latest: last(BODY_FAT_HISTORY).value, date: last(BODY_FAT_HISTORY).date },
    { key: "hr", label: "Resting HR", unit: " bpm", decimals: 0, series: RESTING_HR_HISTORY, latest: last(RESTING_HR_HISTORY).value, date: last(RESTING_HR_HISTORY).date },
    { key: "bp", label: "Blood Pressure", unit: "", decimals: 0, series: null, latest: `${bp.systolic}/${bp.diastolic}`, date: bp.date },
    { key: "intake", label: "Caloric Intake", unit: " cal", decimals: 0, series: CALORIC_INTAKE_HISTORY, latest: last(CALORIC_INTAKE_HISTORY).value, date: last(CALORIC_INTAKE_HISTORY).date },
    { key: "burn", label: "Caloric Burn", unit: " cal", decimals: 0, series: CALORIC_BURN_HISTORY, latest: last(CALORIC_BURN_HISTORY).value, date: last(CALORIC_BURN_HISTORY).date },
    { key: "lean", label: "Lean Body Mass", unit: "kg", decimals: 1, series: LEAN_MASS_HISTORY, latest: last(LEAN_MASS_HISTORY).value, date: last(LEAN_MASS_HISTORY).date },
  ];
}
