import type { ModelBundle } from '../types/data';

export interface VenueSelection {
  kspoDome: boolean; // 15,000 seats
  handball: boolean; // 5,000 seats (Ticketlink Live Arena)
  olympicHall: boolean; // 3,000 seats
  wooriArtHall: boolean; // 1,184 seats
  lawn88: boolean; // 10,000 outdoor capacity
}

export interface ForecastInputs {
  dow: number; // 0=Mon .. 6=Sun
  venues: VenueSelection;
  rainMm: number; // 0 .. 60
  tempC: number; // -5 .. 38
  travelMode: 'car' | 'subway' | 'park-and-ride';
}

export interface HourlyPrediction {
  hour: number;
  label: string;
  entries: number;
  exits: number;
  netParked: number;
  occupancyPct: number;
  isNightBottleneck: boolean;
}

export interface ForecastOutput {
  hourly: HourlyPrediction[];
  totalDailyEntries: number;
  stayGt10mEntries: number;
  nightExit2022: number;
  peakOccupancyVehicles: number;
  peakOccupancyPct: number;
  peakHour: number;
  estimatedExitWaitMin: number;
  congestionTier: 'smooth' | 'busy' | 'severe' | 'critical';
  activeSeatsTotal: number;
  activeVenueCount: number;
  isNonlinearRainSurge: boolean;
  recommendedGateKo: string;
  recommendedGateEn: string;
  overflowNeeded: boolean;
  adviceKo: string;
  adviceEn: string;
}

export const VENUE_SEATS: Record<keyof VenueSelection, { seats: number; nameKo: string; nameEn: string; nearGate: string }> = {
  kspoDome: { seats: 15000, nameKo: 'KSPO DOME (체조경기장)', nameEn: 'KSPO DOME', nearGate: '동2문 / P4·P5·P6' },
  handball: { seats: 5000, nameKo: '티켓링크 라이브아레나 (핸드볼)', nameEn: 'Ticketlink Live Arena (Handball)', nearGate: '동2문 / P5·P6' },
  olympicHall: { seats: 3000, nameKo: '올림픽홀', nameEn: 'Olympic Hall', nearGate: '동2문 / P2·P11' },
  wooriArtHall: { seats: 1184, nameKo: '우리금융아트홀', nameEn: 'Woori Art Hall', nearGate: '남2문 / P1A·P1B' },
  lawn88: { seats: 10000, nameKo: '88잔디마당 (야외)', nameEn: '88 Lawn Yard (Outdoor)', nearGate: '남2문·북2문 / P7·P8' },
};

const TOTAL_CAPACITY = 2716;

export function runTrafficForecast(inputs: ForecastInputs, model: ModelBundle): ForecastOutput {
  const c = model.coefficients;
  const activeSeatsTotal =
    (inputs.venues.kspoDome ? VENUE_SEATS.kspoDome.seats : 0) +
    (inputs.venues.handball ? VENUE_SEATS.handball.seats : 0) +
    (inputs.venues.olympicHall ? VENUE_SEATS.olympicHall.seats : 0) +
    (inputs.venues.wooriArtHall ? VENUE_SEATS.wooriArtHall.seats : 0) +
    (inputs.venues.lawn88 ? VENUE_SEATS.lawn88.seats : 0);

  const activeVenueCount = Object.values(inputs.venues).filter(Boolean).length;
  const seatsK = activeSeatsTotal / 1000;
  const dowMult = model.dowMultiplier[inputs.dow] ?? 1.0;

  // 1. General park demand modified by rainfall (outdoor visits drop in rain, empirically r = -0.346)
  const rainGeneralDrop = Math.min(c.rainNonConcertCapDrop, inputs.rainMm * c.rainLinearPerMm);
  const tempEffect = (inputs.tempC - 22) * c.tempDeviationPerDeg;

  // 2. Concert car arrival + NONLINEAR Rain x Concert modal shift (2024-07-20 empirical surge)
  const concertBaseAdd = seatsK * c.concertPer1kSeatsEntries;
  // Outdoor 88 lawn is dampened by heavy rain (>20mm), whereas indoor arenas surge in rain!
  const indoorSeatsK = seatsK - (inputs.venues.lawn88 ? 10 : 0);
  const effectiveRainForInteraction = Math.min(inputs.rainMm, 30);
  const rainConcertSurge =
    indoorSeatsK > 0 && inputs.rainMm >= 3
      ? indoorSeatsK * (effectiveRainForInteraction / 10) * c.concertRainInteractionPer1kPer10mm
      : 0;

  const outdoorRainPenalty = inputs.venues.lawn88 && inputs.rainMm >= 15 ? -650 : 0;

  const rawDaily =
    c.baseDailyVehicles * dowMult * (1 - rainGeneralDrop) +
    tempEffect +
    concertBaseAdd +
    rainConcertSurge +
    outdoorRainPenalty;

  const totalDailyEntries = Math.max(3800, Math.round(rawDaily));
  const stayGt10mEntries = Math.round(totalDailyEntries * (1 - 0.314)); // 31.4% are <=10min turnarounds

  // 3. Hourly entry and exit distribution adjusted for concert arrival (16-19h) & exit (20-22h)
  const entryWeights = [...model.baseHourlyEntryShare];
  const exitWeights = [...model.baseHourlyExitShare];

  if (seatsK > 0) {
    const concertIntensity = Math.min(1.6, seatsK / 15);
    const rainShiftMult = inputs.rainMm >= 5 && indoorSeatsK > 0 ? 1.24 : 1.0;
    // Concert arrivals concentrate 16~19h
    entryWeights[16] += 0.016 * concertIntensity * rainShiftMult;
    entryWeights[17] += 0.030 * concertIntensity * rainShiftMult;
    entryWeights[18] += 0.036 * concertIntensity * rainShiftMult;
    entryWeights[19] += 0.014 * concertIntensity;

    // Concert night exits surge sharply 20~22h (emp. r = +0.817)
    const nightBoost = c.concertNightExitBoostPer1k * seatsK * rainShiftMult;
    exitWeights[20] += nightBoost * 0.44;
    exitWeights[21] += nightBoost * 0.41;
    exitWeights[22] += nightBoost * 0.15;
  }

  // Normalize weights
  const sumEntry = entryWeights.reduce((a, b) => a + b, 0);
  const sumExit = exitWeights.reduce((a, b) => a + b, 0);

  // Simulate 24h net inventory (morning overnight base ~360 vehicles)
  let runningInventory = 340;
  let peakOccupancyVehicles = runningInventory;
  let peakHour = 11;
  let nightExit2022 = 0;

  const hourly: HourlyPrediction[] = [];
  for (let h = 0; h < 24; h++) {
    const entries = Math.round((entryWeights[h] / sumEntry) * totalDailyEntries);
    const exits = Math.round((exitWeights[h] / sumExit) * totalDailyEntries);

    // Only vehicles staying >10 min stay in inventory across hourly boundaries;
    // short turnarounds (~31.4%) enter and leave within the same hour.
    const netDelta = Math.round((entries - exits) * 0.72);
    // Add concert accumulation pressure before 20h
    const concertHold =
      seatsK > 0 && h >= 17 && h <= 19
        ? Math.round(seatsK * (inputs.rainMm >= 5 ? 36 : 28))
        : seatsK > 0 && h >= 20 && h <= 22
          ? -Math.round(seatsK * (inputs.rainMm >= 5 ? 34 : 26))
          : 0;

    runningInventory = Math.max(260, Math.min(Math.round(TOTAL_CAPACITY * 1.04), runningInventory + netDelta + concertHold));

    const occupancyPct = Math.min(100, Math.round((runningInventory / TOTAL_CAPACITY) * 1000) / 10);
    if (runningInventory > peakOccupancyVehicles) {
      peakOccupancyVehicles = runningInventory;
      peakHour = h;
    }
    if (h >= 20 && h <= 22) {
      nightExit2022 += exits;
    }

    hourly.push({
      hour: h,
      label: `${String(h).padStart(2, '0')}시`,
      entries,
      exits,
      netParked: runningInventory,
      occupancyPct,
      isNightBottleneck: h >= 20 && h <= 22,
    });
  }

  // Nonlinear rain+concert surge flag
  const isNonlinearRainSurge = indoorSeatsK >= 8 && inputs.rainMm >= 5;

  // Estimate exit queue wait time (gate exit capacity ~480 veh/hr across East2/South2/North2)
  const peakNightExitHr = Math.max(hourly[20].exits, hourly[21].exits);
  const overloadRatio = Math.max(0, (peakNightExitHr - 430) / 430);
  const estimatedExitWaitMin = Math.round(
    Math.min(105, 8 + overloadRatio * 52 + (isNonlinearRainSurge ? 18 : 0) + (activeVenueCount >= 2 ? 12 : 0))
  );

  const congestionTier: ForecastOutput['congestionTier'] =
    peakOccupancyPctFrom(peakOccupancyVehicles) >= 92 || nightExit2022 >= 1650
      ? 'critical'
      : peakOccupancyPctFrom(peakOccupancyVehicles) >= 82 || nightExit2022 >= 1350
        ? 'severe'
        : peakOccupancyPctFrom(peakOccupancyVehicles) >= 68 || nightExit2022 >= 1100
          ? 'busy'
          : 'smooth';

  const overflowNeeded = peakOccupancyPctFrom(peakOccupancyVehicles) >= 85 || activeVenueCount >= 2;

  const recommendedGateKo =
    congestionTier === 'critical'
      ? '송파구 인근 공영주차장(방이동·잠실 환승) + 지하철 8호선 몽촌토성 / 9호선 한성백제 분산 권장'
      : inputs.venues.kspoDome || inputs.venues.handball
        ? '동2문(P4~P6) 만차 위험 높음 → 북2문(P7·P8) 또는 남2문 진입 권장'
        : '동2문·남2문 모두 원활 예상 (10분 이내 회차는 전용 드롭오프 구역 이용)';

  const recommendedGateEn =
    congestionTier === 'critical'
      ? 'Use Songpa Overflow Public Lots + Disperse via Line 8 Mongchontoseong / Line 9 Hansung Baekje'
      : inputs.venues.kspoDome || inputs.venues.handball
        ? 'East Gate 2 (P4–P6) high full risk → Divert to North Gate 2 (P7/P8) or South Gate 2'
        : 'East Gate 2 & South Gate 2 smooth (Use drop-off lane for <10 min pick-up)';

  const adviceKo = isNonlinearRainSurge
    ? `우천(${inputs.rainMm}mm)과 대형공연(${activeSeatsTotal.toLocaleString()}석)이 겹쳐 일반 방문은 줄지만 공연객 자차 전환으로 20~22시 야간 출차가 ${nightExit2022.toLocaleString()}대까지 폭증합니다. 예상 출차 대기 ${estimatedExitWaitMin}분 — 지하철 분산 귀가를 강력 권고합니다.`
    : congestionTier === 'critical' || congestionTier === 'severe'
      ? `동시·대형 공연 영향으로 ${peakHour}시경 주차 점유율 ${peakOccupancyPctFrom(peakOccupancyVehicles)}% 도달 및 20~22시 출차 ${nightExit2022.toLocaleString()}대 집중이 예상됩니다. 9호선 올림픽공원역 대신 8호선 몽촌토성·9호선 한성백제역 분산을 권장합니다.`
      : `전반적으로 수용 범위 내(${peakOccupancyPctFrom(peakOccupancyVehicles)}%) 운영이 예상됩니다. 다만 08~10시 오전 스포츠센터 피크와 10분 이내 회차(31.4%) 차량 동선을 유의하세요.`;

  const adviceEn = isNonlinearRainSurge
    ? `Nonlinear surge alert: Rain (${inputs.rainMm}mm) + major concerts (${activeSeatsTotal.toLocaleString()} seats) triggers private-car modal shift, pushing 20:00–22:00 exits to ${nightExit2022.toLocaleString()} vehicles (~${estimatedExitWaitMin} min exit queue). Subway dispersion strongly advised.`
    : congestionTier === 'critical' || congestionTier === 'severe'
      ? `Peak occupancy projected at ${peakOccupancyPctFrom(peakOccupancyVehicles)}% around ${peakHour}:00 with ${nightExit2022.toLocaleString()} night exits (20:00–22:00). Divert to Mongchontoseong (Line 8) or Hansung Baekje (Line 9).`
      : `Manageable occupancy projected (${peakOccupancyPctFrom(peakOccupancyVehicles)}% peak). Watch morning 08:00–10:00 sports center inflow and 31.4% short drop-off traffic.`;

  return {
    hourly,
    totalDailyEntries,
    stayGt10mEntries,
    nightExit2022,
    peakOccupancyVehicles,
    peakOccupancyPct: peakOccupancyPctFrom(peakOccupancyVehicles),
    peakHour,
    estimatedExitWaitMin,
    congestionTier,
    activeSeatsTotal,
    activeVenueCount,
    isNonlinearRainSurge,
    recommendedGateKo,
    recommendedGateEn,
    overflowNeeded,
    adviceKo,
    adviceEn,
  };
}

function peakOccupancyPctFrom(vehicles: number): number {
  return Math.min(100, Math.round((vehicles / TOTAL_CAPACITY) * 1000) / 10);
}

export interface EsgResult {
  perPersonCo2SavedKg: number;
  perConcertCo2SavedKg: number;
  perConcertCo2SavedTons: number;
  pineTreesEquivalent: number;
  idlingSavedKgPerCar: number;
  annualProjectedTons: number;
}

/**
 * ESG CO2 reduction calculation:
 * - Passenger car urban emission: 0.21 kg CO2/km (KOTI / Ministry of Environment standard)
 * - Passenger car idling emission: 2.18 kg CO2/hour = 0.0363 kg CO2/min
 * - Seoul Metro emission: 0.035 kg CO2/passenger-km
 * - 30-year Korean pine tree absorption: 6.6 kg CO2/tree/year (Korea Forest Service)
 */
export function calculateEsgSavings(
  idlingMinutes: number,
  roundTripKm: number,
  shiftedCarsPerConcert: number,
  annualMajorConcerts = 70
): EsgResult {
  const carDriveKg = roundTripKm * 0.21;
  const idlingSavedKgPerCar = idlingMinutes * 0.0363;
  const subwayKg = roundTripKm * 0.035;
  const perPersonCo2SavedKg = Math.max(0.2, carDriveKg + idlingSavedKgPerCar - subwayKg);
  const perConcertCo2SavedKg = perPersonCo2SavedKg * shiftedCarsPerConcert;
  const perConcertCo2SavedTons = perConcertCo2SavedKg / 1000;
  const pineTreesEquivalent = Math.round(perConcertCo2SavedKg / 6.6);
  const annualProjectedTons = (perConcertCo2SavedKg * annualMajorConcerts) / 1000;

  return {
    perPersonCo2SavedKg: Math.round(perPersonCo2SavedKg * 100) / 100,
    perConcertCo2SavedKg: Math.round(perConcertCo2SavedKg),
    perConcertCo2SavedTons: Math.round(perConcertCo2SavedTons * 100) / 100,
    pineTreesEquivalent,
    idlingSavedKgPerCar: Math.round(idlingSavedKgPerCar * 100) / 100,
    annualProjectedTons: Math.round(annualProjectedTons * 10) / 10,
  };
}
