export type Lang = 'ko' | 'en' | 'ja';
export type TabId = 'pulse' | 'forecast' | 'map' | 'venue3d' | 'opendata';
export type FontScale = '100' | '115' | '130';

export interface ParkingLotStatus {
  name: string;
  nameEn: string;
  nameJa?: string;
  code: string;
  capacity: number;
  seoulCurPrkYn: 'Y' | 'N';
  seoulCurPrkCnt: number | null;
  lat: number;
  lng: number;
  ratePer10Min: number;
  address: string;
}

export interface PopulationForecastPoint {
  time: string; // "2026-11-20 13:00"
  hourLabel: string; // "13시"
  min: number;
  max: number;
  mid: number;
  level: string; // "여유" | "보통" | "약간 붐빔" | "붐빔"
}

export interface WeatherStatus {
  observedAt: string;
  tempC: number;
  maxTempC: number;
  minTempC: number;
  humidityPct: number;
  windSpeedMs: number;
  windDir: string;
  precipitationMm: number;
  precptType: string;
  pcpMsg: string;
  pm25: number;
  pm25Grade: string;
  pm10: number;
  pm10Grade: string;
  uvLevel: string;
  uvIndex: number;
  sunrise: string;
  sunset: string;
  gridNx: number;
  gridNy: number;
}

export interface SubwayStationSnapshot {
  id: string;
  nameKo: string;
  nameEn: string;
  nameJa?: string;
  line: string;
  lineColor: string;
  lat: number;
  lng: number;
  exitInfoKo: string;
  exitInfoEn: string;
  exitInfoJa?: string;
  hasElevator: boolean;
  monthlyTotal202610: number;
  hour20Boardings: number;
  hour21Boardings: number;
  crowdingRisk: 'high' | 'medium' | 'low';
}

export interface ConcertItem {
  id: string;
  titleKo: string;
  titleEn: string;
  venueId: 'kspo-dome' | 'handball' | 'olympic-hall' | 'woori' | '88-lawn' | 'museum' | 'other';
  venueKo: string;
  venueEn: string;
  venueJa?: string;
  startDate: string;
  endDate: string;
  status: 'live' | 'upcoming' | 'archive';
  expectedCapacity: number;
  maxSimultaneousVenues?: number;
  ticketUrl?: string;
  source: string;
}

export interface LiveSnapshot {
  updatedAt: string;
  sourceMode: 'live-worker' | 'static-snapshot' | 'baseline-verified';
  kspoParking: {
    parkingSum: number;
    totalCapacity: number;
    occupancyPct: number;
    apiStatus: 'ok' | 'fallback';
    measuredAt: string;
    tenMinTurnaroundSharePct: number;
    tenMinTurnaroundCount: number;
    totalTripsSample: number;
    lots: ParkingLotStatus[];
  };
  seoulPopulation: {
    areaName: string;
    congestLevel: string;
    congestMsg: string;
    min: number;
    max: number;
    observedAt: string;
    nonResidentPct: number;
    forecast12h: PopulationForecastPoint[];
  };
  weather: WeatherStatus;
  subwayStations: SubwayStationSnapshot[];
  concerts: ConcertItem[];
}

export interface ModelBenchmarkRow {
  modelId: string;
  nameKo: string;
  nameEn: string;
  nameJa?: string;
  typeKo: string;
  typeEn: string;
  typeJa?: string;
  hourlyMae: number;
  hourlyRmse: number;
  r2: number;
  nightExitMae: number;
  usesWeather: boolean;
  usesConcerts: boolean;
  isWinner?: boolean;
}

export interface CaseStudyDay {
  date: string;
  dowKo: string;
  dowEn: string;
  dowJa?: string;
  labelKo: string;
  labelEn: string;
  labelJa?: string;
  totalEntries: number;
  stayGt10m: number;
  nightExit2022: number;
  rainMm: number;
  tempMaxC: number;
  concertsKo: string;
  concertsEn: string;
  concertsJa?: string;
  highlightTagKo: string;
  highlightTagEn: string;
  highlightTagJa?: string;
}

export interface ModelBundle {
  trainedOn: string;
  validationMethod: string;
  sampleRows: number;
  daysCovered: number;
  corrDailyTotalVsNightExit: number;
  corrRainDaily: number;
  corrCarVsSubwayExit: number;
  baseHourlyEntryShare: number[]; // length 24, sums ~1.0
  baseHourlyExitShare: number[]; // length 24, sums ~1.0
  dowMultiplier: number[]; // Mon(0) .. Sun(6)
  coefficients: {
    baseDailyVehicles: number;
    rainLinearPerMm: number;
    rainNonConcertCapDrop: number;
    concertPer1kSeatsEntries: number;
    concertRainInteractionPer1kPer10mm: number;
    tempDeviationPerDeg: number;
    baseNightExitShare: number;
    concertNightExitBoostPer1k: number;
    rainConcertNightShiftBoost: number;
  };
  benchmarks: ModelBenchmarkRow[];
  caseStudies: CaseStudyDay[];
  monthlySeasonality2025: { month: string; vehicles: number }[];
}

export interface ParkingZoneInfo {
  id: string;
  nameKo: string;
  nameEn: string;
  nameJa?: string;
  gateKo: string;
  gateEn: string;
  gateJa?: string;
  lat: number;
  lng: number;
  fullCount15164156: number;
  congestCount15164156: number;
  riskLevel: 'high' | 'medium' | 'low';
  disabledSpaces: number;
  nearVenueKo: string;
  nearVenueEn: string;
  nearVenueJa?: string;
}

export interface OverflowParkingLot {
  id: string;
  nameKo: string;
  nameEn: string;
  nameJa?: string;
  lat: number;
  lng: number;
  capacity: number;
  occupied?: number;
  available?: number;
  occupancyPct?: number;
  updatedAt?: string;
  walkMinToPark: number;
  rateInfoKo: string;
  rateInfoEn: string;
  rateInfoJa?: string;
  distanceM: number;
}

export interface FacilityPOI {
  id: string;
  category: 'venue' | 'museum' | 'aed' | 'info' | 'shade' | 'running-caution' | 'disabled-parking' | 'stroller-detour';
  nameKo: string;
  nameEn: string;
  nameJa?: string;
  lat: number;
  lng: number;
  descKo: string;
  descEn: string;
  descJa?: string;
  capacity?: number;
  barrierFreeNoteKo?: string;
  barrierFreeNoteEn?: string;
  barrierFreeNoteJa?: string;
}

export interface DataAuditDefect {
  id: number;
  datasetId: string;
  datasetNameKo: string;
  datasetNameEn: string;
  datasetNameJa?: string;
  severity: 'critical' | 'high' | 'medium';
  titleKo: string;
  titleEn: string;
  titleJa?: string;
  evidenceKo: string;
  evidenceEn: string;
  evidenceJa?: string;
  beforeSample: string;
  afterFixSample: string;
}

export interface OpenDataProposalSchema {
  id: string;
  filename: string;
  titleKo: string;
  titleEn: string;
  titleJa?: string;
  targetDataset: string;
  rationaleKo: string;
  rationaleEn: string;
  rationaleJa?: string;
  columns: string[];
  sampleRows: Record<string, string | number | boolean>[];
}

export interface DatasetProvenance {
  id: string;
  agencyKo: string;
  agencyEn: string;
  agencyJa?: string;
  nameKo: string;
  nameEn: string;
  nameJa?: string;
  format: string;
  refreshCycleKo: string;
  refreshCycleEn: string;
  refreshCycleJa?: string;
  records: string;
  status: 'live' | 'static-verified' | 'upstream-maintenance';
  usageKo: string;
  usageEn: string;
  usageJa?: string;
  url: string;
}

export interface AppBundle {
  live: LiveSnapshot;
  model: ModelBundle;
  parkingZones: ParkingZoneInfo[];
  overflowLots: OverflowParkingLot[];
  pois: FacilityPOI[];
  auditDefects: DataAuditDefect[];
  proposals: OpenDataProposalSchema[];
  provenance: DatasetProvenance[];
  availableModels: {
    venueId: '88-lawn' | 'lake-stage' | 'kspo-dome' | 'handball' | 'woori';
    glbUrl: string | null;
    fileSizeMb?: number;
    rawSizeMb?: number;
    sourceNoteKo: string;
    sourceNoteEn: string;
    sourceNoteJa: string;
  }[];
  b1LoadedFiles: string[];
}
