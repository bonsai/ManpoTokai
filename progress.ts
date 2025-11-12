import { Station, STATIONS } from "./tokaidoStations";

export type StepEntry = {
  id: string; // UUID 等
  dateIso: string; // 入力日（例: "2025-11-12"）または timestamp ISO
  steps: number;
  source?: string; // "manual" / "coca-cola-app" 等
  note?: string;
};

export type ProgressResult = {
  totalSteps: number;
  totalDistanceMeters: number;
  clampedDistanceMeters: number;
  currentStationIndex: number;
  currentStation: Station;
  nextStation: Station;
  progressedBetween: number; // 0..1
  percentOverall: number; // 0..100
};

/**
 * デフォルトの歩幅(m)。ユーザ設定を優先すること。
 */
export const DEFAULT_STEP_LENGTH_METERS = 0.72;

/**
 * steps -> meters
 */
export function stepsToMeters(steps: number, stepLengthMeters = DEFAULT_STEP_LENGTH_METERS) {
  return steps * stepLengthMeters;
}

/**
 * entries の合計歩数を計算する（重複や過去日の上書きは UI 側で管理）
 */
export function totalStepsFromEntries(entries: StepEntry[]) {
  return entries.reduce((s, e) => s + Math.max(0, Math.floor(e.steps)), 0);
}

/**
 * 東海道における現在の進捗を計算する
 * - totalSteps: ユーザーの累計歩数（合計）
 * - stepLengthMeters: 1歩の平均距離
 */
export function computeProgress(totalSteps: number, stepLengthMeters = DEFAULT_STEP_LENGTH_METERS): ProgressResult {
  const totalDistance = stepsToMeters(totalSteps, stepLengthMeters);
  const totalRoute = STATIONS[STATIONS.length - 1].distanceMeters;
  const clamped = Math.min(totalDistance, totalRoute);

  let idx = 0;
  for (let i = 0; i < STATIONS.length; i++) {
    if (clamped >= STATIONS[i].distanceMeters) idx = i;
    else break;
  }
  const currentStation = STATIONS[idx];
  const nextStation = STATIONS[Math.min(idx + 1, STATIONS.length - 1)];
  const betweenDist = Math.max(1, nextStation.distanceMeters - currentStation.distanceMeters);
  const progressedBetween = (clamped - currentStation.distanceMeters) / betweenDist;
  const percentOverall = (clamped / totalRoute) * 100;

  return {
    totalSteps,
    totalDistanceMeters: totalDistance,
    clampedDistanceMeters: clamped,
    currentStationIndex: idx,
    currentStation,
    nextStation,
    progressedBetween,
    percentOverall
  };
}

/**
 * 直近の活動ペースから到達予測（時間：hours）
 * - recentStepsPerHour: ユーザが直近に示した「1時間あたりの歩数」の推定値（例：2000 steps/hour）
 * - Returns hours needed to reach the nextStation from current totalSteps
 */
export function hoursToReachNextStation(totalSteps: number, recentStepsPerHour: number, stepLengthMeters = DEFAULT_STEP_LENGTH_METERS) {
  const progress = computeProgress(totalSteps, stepLengthMeters);
  const remainingMeters = Math.max(0, progress.nextStation.distanceMeters - progress.clampedDistanceMeters);
  const stepsNeeded = Math.ceil(remainingMeters / stepLengthMeters);
  if (recentStepsPerHour <= 0) return { hours: Infinity, stepsNeeded, remainingMeters };
  const hours = stepsNeeded / recentStepsPerHour;
  return { hours, stepsNeeded, remainingMeters };
}

/**
 * 「指定日数以内に到達できるか」の判定
 * - days: 目標日数（例：3日）
 * - recentStepsPerHour: 1時間あたりの推定歩数
 * - dailyActiveHours: 1日に歩く想定時間（例：2時間/日を想定）
 */
export function canReachWithinDays(totalSteps: number, recentStepsPerHour: number, days: number, dailyActiveHours = 2, stepLengthMeters = DEFAULT_STEP_LENGTH_METERS) {
  const { hours, stepsNeeded, remainingMeters } = hoursToReachNextStation(totalSteps, recentStepsPerHour, stepLengthMeters);
  if (!isFinite(hours)) return { canReach: false, hoursNeeded: Infinity, availableHours: days * dailyActiveHours, stepsNeeded, remainingMeters };
  const availableHours = days * dailyActiveHours;
  return {
    canReach: hours <= availableHours,
    hoursNeeded: hours,
    availableHours,
    stepsNeeded,
    remainingMeters
  };
}

/**
 * シンプルな報酬計算例：
 * - 到達にかかる "難度" を次駅までの距離で評価し、報酬を決める。
 */
export function computeRewardForStation(station: Station) {
  const base = Math.max(10, Math.round((station.distanceMeters + 1) / 1000)); // 1kmごとに1コイン以上
  return { coins: base * 10, badge: `reach-${station.id}` };
}

/**
 * サンプルユース：
 */
if (require.main === module) {
  // テストデータ
  const entries = [
    { id: "1", dateIso: "2025-11-10", steps: 5000, source: "manual" },
    { id: "2", dateIso: "2025-11-11", steps: 8000, source: "manual" }
  ];
  const total = totalStepsFromEntries(entries);
  console.log("total steps", total);
  const prog = computeProgress(total);
  console.log("progress", prog);
  console.log("hours to next (pace 2000 steps/h):", hoursToReachNextStation(total, 2000));
  console.log("can reach in 3 days:", canReachWithinDays(total, 2000, 3));
}