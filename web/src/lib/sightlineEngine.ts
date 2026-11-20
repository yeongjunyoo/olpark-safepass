export type Venue3DId = '88-lawn' | 'lake-stage' | 'kspo-dome' | 'handball' | 'woori';

export interface SightlineParams {
  venueId: Venue3DId;
  frontRowPosture: 'seated' | 'standing';
  wheelchairEyeCm: number; // default 115 cm
  platformLiftCm: number; // wheelchair platform elevation 0..90 cm
  stageHeightM: number; // 1.0..2.2 m
  thrustStageM: number; // 0..10 m
  frontRowGapM: number; // 1.0..2.5 m
  railingHeightCm: number; // 0..115 cm (Handball VOC 470 views)
}

export interface SightlineRay {
  index: number;
  targetX: number;
  targetY: number;
  blockedBy: 'none' | 'spectator' | 'railing';
  hitX: number;
  hitY: number;
}

export interface SightlineResult {
  eyeY: number;
  frontBlockerY: number;
  railingTopY: number;
  stageDistanceM: number;
  occlusionPct: number;
  visiblePct: number;
  blockedBySpectatorCount: number;
  blockedByRailingCount: number;
  clearAngleDeg: number;
  status: 'pass' | 'caution' | 'critical';
  recommendedPlatformLiftCm: number;
  recommendedStageHeightM: number;
  rays: SightlineRay[];
}

export interface VenueGeometrySpec {
  id: Venue3DId;
  nameKo: string;
  nameEn: string;
  seatsKo: string;
  seatsEn: string;
  baseStageDistanceM: number;
  defaultStageHeightM: number;
  defaultRailingCm: number;
  frontTierDropM: number; // height difference where front row stands relative to wheelchair base floor
  vocContextKo: string;
  vocContextEn: string;
  hasOfficialGlb: boolean;
}

export const VENUE_3D_SPECS: Record<Venue3DId, VenueGeometrySpec> = {
  '88-lawn': {
    id: '88-lawn',
    nameKo: '88잔디마당 (실물 15127487 GLB)',
    nameEn: '88 Lawn Yard (Official 15127487 GLB)',
    seatsKo: '야외 수용 약 10,000명',
    seatsEn: 'Outdoor ~10,000 capacity',
    baseStageDistanceM: 28,
    defaultStageHeightM: 1.8,
    defaultRailingCm: 0,
    frontTierDropM: 0,
    vocContextKo: 'KSPO&CO 공공데이터 15127487 실물 3D 모델(88JandiMadang.glb, 10.4MB) 직접 로드 + 야외 단상 시야 검증',
    vocContextEn: 'Loads official KSPO&CO 15127487 3D GLB (88JandiMadang.glb, 10.4MB) + outdoor wheelchair riser check',
    hasOfficialGlb: true,
  },
  'lake-stage': {
    id: 'lake-stage',
    nameKo: '수변무대 (실물 15127487 GLB)',
    nameEn: '88 Lake Waterside Stage (Official GLB)',
    seatsKo: '야외 수변공연 약 3,500명',
    seatsEn: 'Outdoor waterside ~3,500 capacity',
    baseStageDistanceM: 22,
    defaultStageHeightM: 1.6,
    defaultRailingCm: 80,
    frontTierDropM: 0.15,
    vocContextKo: 'KSPO&CO 공공데이터 15127487 실물 3D 모델(OlympicPark_LakeSideStage.glb) 직접 로드 + 수변 관람석 휠체어 시야 검증',
    vocContextEn: 'Loads official KSPO&CO 15127487 GLB (OlympicPark_LakeSideStage.glb) + waterside wheelchair sightline audit',
    hasOfficialGlb: true,
  },
  'kspo-dome': {
    id: 'kspo-dome',
    nameKo: 'KSPO DOME (체조경기장)',
    nameEn: 'KSPO DOME (Gymnastics Arena)',
    seatsKo: '실내 최대 15,000석 (휠체어석 1~2F)',
    seatsEn: 'Indoor up to 15,000 seats',
    baseStageDistanceM: 26,
    defaultStageHeightM: 1.5,
    defaultRailingCm: 85,
    frontTierDropM: 0.0,
    vocContextKo: 'VOC 단일 최다 조회(1,262회·828회): 앞열 일반석 기립(165cm) 시 휠체어석(115cm) 무대 시야 가림 집중 민원',
    vocContextEn: 'Top VOC (1,262 & 828 views): Standing front-row spectators (165cm) block wheelchair sightlines (115cm)',
    hasOfficialGlb: false,
  },
  handball: {
    id: 'handball',
    nameKo: '티켓링크 라이브아레나 (SK핸드볼)',
    nameEn: 'Ticketlink Live Arena (SK Handball)',
    seatsKo: '실내 5,000석 (휠체어석 2F 난간)',
    seatsEn: 'Indoor 5,000 seats (2F railing)',
    baseStageDistanceM: 21,
    defaultStageHeightM: 1.4,
    defaultRailingCm: 105,
    frontTierDropM: 0.12,
    vocContextKo: 'VOC 470회(2025-09-28): 휠체어석 전면 안전 난간 높이(105cm)가 착석 시야 중심선을 가리는 구조적 민원',
    vocContextEn: 'VOC 470 views: Front safety railing (105cm) obstructs seated wheelchair eye-level sightline',
    hasOfficialGlb: true,
  },
  woori: {
    id: 'woori',
    nameKo: '우리금융아트홀',
    nameEn: 'Woori Art Hall',
    seatsKo: '실내 1,184석 (뮤지컬·중형공연)',
    seatsEn: 'Indoor 1,184 seats (Theater)',
    baseStageDistanceM: 17,
    defaultStageHeightM: 1.2,
    defaultRailingCm: 75,
    frontTierDropM: 0.18,
    vocContextKo: '중형 프로시니엄 극장 구조 — 단차(18cm)와 무대 높이에 따른 1층 후방 휠체어석 시야각 시뮬레이션',
    vocContextEn: 'Proscenium theater — rear 1F wheelchair sightline verification with floor slope & stage height',
    hasOfficialGlb: true,
  },
};

const NUM_RAYS = 24;
const PERFORMER_HEIGHT_M = 1.75;
const RAILING_DIST_M = 0.65;

function evaluateRays(params: SightlineParams): {
  rays: SightlineRay[];
  occlusionPct: number;
  blockedBySpectatorCount: number;
  blockedByRailingCount: number;
  eyeY: number;
  frontBlockerY: number;
  railingTopY: number;
  stageDistanceM: number;
} {
  const spec = VENUE_3D_SPECS[params.venueId];
  const stageDistanceM = Math.max(8, spec.baseStageDistanceM - params.thrustStageM);
  const deckY = params.platformLiftCm / 100;
  const eyeY = deckY + params.wheelchairEyeCm / 100;

  // Front-row spectator stands/sits on floor below deck (minus natural tier drop)
  const frontTopM = (params.frontRowPosture === 'standing' ? 1.65 : 1.25) - spec.frontTierDropM;
  // Railing mounts along wheelchair deck edge (only effective if height > 0)
  const railingTopY = params.railingHeightCm > 0 ? deckY + params.railingHeightCm / 100 : -1;

  const rays: SightlineRay[] = [];
  let blockedSpec = 0;
  let blockedRail = 0;

  for (let i = 0; i < NUM_RAYS; i++) {
    const t = i / (NUM_RAYS - 1);
    const targetY = params.stageHeightM + t * PERFORMER_HEIGHT_M;
    const slope = (targetY - eyeY) / stageDistanceM;

    const yAtRailing = eyeY + slope * RAILING_DIST_M;
    const yAtFront = eyeY + slope * params.frontRowGapM;

    let blockedBy: SightlineRay['blockedBy'] = 'none';
    let hitX = stageDistanceM;
    let hitY = targetY;

    if (params.railingHeightCm > 0 && yAtRailing <= railingTopY) {
      blockedBy = 'railing';
      hitX = RAILING_DIST_M;
      hitY = yAtRailing;
      blockedRail++;
    } else if (yAtFront <= frontTopM) {
      blockedBy = 'spectator';
      hitX = params.frontRowGapM;
      hitY = yAtFront;
      blockedSpec++;
    }

    rays.push({
      index: i,
      targetX: stageDistanceM,
      targetY,
      blockedBy,
      hitX,
      hitY,
    });
  }

  const occlusionPct = Math.round(((blockedSpec + blockedRail) / NUM_RAYS) * 1000) / 10;
  return {
    rays,
    occlusionPct,
    blockedBySpectatorCount: blockedSpec,
    blockedByRailingCount: blockedRail,
    eyeY,
    frontBlockerY: frontTopM,
    railingTopY,
    stageDistanceM,
  };
}

export function computeSightline(params: SightlineParams): SightlineResult {
  const res = evaluateRays(params);
  const visiblePct = Math.round((100 - res.occlusionPct) * 10) / 10;

  // Compute clear vertical viewing angle (deg)
  const visibleRays = res.rays.filter((r) => r.blockedBy === 'none');
  let clearAngleDeg = 0;
  if (visibleRays.length >= 2) {
    const low = visibleRays[0];
    const high = visibleRays[visibleRays.length - 1];
    const a1 = Math.atan2(low.targetY - res.eyeY, low.targetX);
    const a2 = Math.atan2(high.targetY - res.eyeY, high.targetX);
    clearAngleDeg = Math.round(((a2 - a1) * 180) / Math.PI * 10) / 10;
  }

  // Recommend minimum platform lift (cm) for <= 5% occlusion (with transparent/lowered railing if railing blocks)
  let recommendedPlatformLiftCm = params.platformLiftCm;
  if (res.occlusionPct > 5) {
    for (let lift = 0; lift <= 110; lift += 5) {
      const test = evaluateRays({
        ...params,
        platformLiftCm: lift,
        railingHeightCm: Math.min(params.railingHeightCm, 80), // transparent glass/lowered bar assumption
      });
      if (test.occlusionPct <= 5) {
        recommendedPlatformLiftCm = lift;
        break;
      }
      recommendedPlatformLiftCm = 110;
    }
  }

  // Recommend minimum stage height if deck lift stays 0
  let recommendedStageHeightM = params.stageHeightM;
  if (res.occlusionPct > 5) {
    for (let sh = 1.0; sh <= 2.6; sh += 0.1) {
      const test = evaluateRays({ ...params, stageHeightM: Math.round(sh * 10) / 10 });
      if (test.occlusionPct <= 10) {
        recommendedStageHeightM = Math.round(sh * 10) / 10;
        break;
      }
      recommendedStageHeightM = 2.6;
    }
  }

  const status: SightlineResult['status'] =
    res.occlusionPct <= 10 ? 'pass' : res.occlusionPct <= 35 ? 'caution' : 'critical';

  return {
    eyeY: res.eyeY,
    frontBlockerY: res.frontBlockerY,
    railingTopY: res.railingTopY,
    stageDistanceM: res.stageDistanceM,
    occlusionPct: res.occlusionPct,
    visiblePct,
    blockedBySpectatorCount: res.blockedBySpectatorCount,
    blockedByRailingCount: res.blockedByRailingCount,
    clearAngleDeg,
    status,
    recommendedPlatformLiftCm,
    recommendedStageHeightM,
    rays: res.rays,
  };
}
