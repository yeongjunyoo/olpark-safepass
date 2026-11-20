export type Venue3DId = 'kspo-dome' | 'handball' | 'woori' | '88-lawn' | 'lake-stage';

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
  nameJa: string;
  seatsKo: string;
  seatsEn: string;
  seatsJa: string;
  baseStageDistanceM: number;
  defaultStageHeightM: number;
  defaultRailingCm: number;
  frontTierDropM: number;
  vocContextKo: string;
  vocContextEn: string;
  vocContextJa: string;
  hasOfficialGlb: boolean;
}

export const VENUE_3D_SPECS: Record<Venue3DId, VenueGeometrySpec> = {
  'kspo-dome': {
    id: 'kspo-dome',
    nameKo: 'KSPO DOME (실물 15127487 DAE→GLB)',
    nameEn: 'KSPO DOME (Official 15127487 GLB)',
    nameJa: 'KSPO DOME（公式15127487実物GLB）',
    seatsKo: '실내 최대 15,000석 (휠체어석 1~2F)',
    seatsEn: 'Indoor up to 15,000 seats',
    seatsJa: '屋内最大15,000席（車椅子席1〜2F）',
    baseStageDistanceM: 26,
    defaultStageHeightM: 1.5,
    defaultRailingCm: 85,
    frontTierDropM: 0.0,
    vocContextKo:
      'VOC 단일 최다 조회(1,262회·828회): 공식 15127487 DAE(453MB)를 웹표준 Draco GLB로 경량 변환 탑재 + 앞열 기립(165cm) 시 휠체어석(115cm) 시야 가림 정량 검증',
    vocContextEn:
      'Top VOC (1,262 & 828 views): Official 15127487 DAE (453MB) converted to Draco Web GLB + geometric raycasting for standing front-row (165cm) wheelchair occlusion',
    vocContextJa:
      'VOC最多閲覧（1,262回・828回）：公式15127487 DAE（453MB）をDraco Web GLBへ軽量変換搭載＋前列起立（165cm）時の車椅子席（115cm）視界遮蔽を定量検証',
    hasOfficialGlb: true,
  },
  handball: {
    id: 'handball',
    nameKo: '티켓링크 라이브아레나 (실물 15127487 GLB)',
    nameEn: 'Ticketlink Live Arena (Official 15127487 GLB)',
    nameJa: 'チケットリンク・ライブアリーナ（公式実物GLB）',
    seatsKo: '실내 5,000석 (휠체어석 2F 난간)',
    seatsEn: 'Indoor 5,000 seats (2F railing)',
    seatsJa: '屋内5,000席（2F車椅子席手すり）',
    baseStageDistanceM: 21,
    defaultStageHeightM: 1.4,
    defaultRailingCm: 105,
    frontTierDropM: 0.12,
    vocContextKo:
      'VOC 470회(2025-09-28): 공식 15127487 SK핸드볼 GLB(53.7MB→1.5MB Draco 압축) 직접 로드 + 휠체어석 전면 안전 난간(105cm) 시야 가림 검증',
    vocContextEn:
      'VOC 470 views: Official 15127487 SK Handball GLB (53.7MB→1.5MB Draco) loaded live + 2F front railing (105cm) sightline verification',
    vocContextJa:
      'VOC 470回（2025-09-28）：公式15127487ハンドボール競技場GLB（53.7MB→1.5MB Draco圧縮）搭載＋前面安全手すり（105cm）の視界遮蔽検証',
    hasOfficialGlb: true,
  },
  woori: {
    id: 'woori',
    nameKo: '우리금융아트홀 (실물 15127487 GLB)',
    nameEn: 'Woori Art Hall (Official 15127487 GLB)',
    nameJa: 'ウリ金融アートホール（公式実物GLB）',
    seatsKo: '실내 1,184석 (뮤지컬·중형공연)',
    seatsEn: 'Indoor 1,184 seats (Theater)',
    seatsJa: '屋内1,184席（ミュージカル・劇場）',
    baseStageDistanceM: 17,
    defaultStageHeightM: 1.2,
    defaultRailingCm: 75,
    frontTierDropM: 0.18,
    vocContextKo:
      '공식 15127487 우리금융아트홀 GLB(162.4MB→4.2MB Draco 압축) 직접 로드 + 프로시니엄 극장 단차(18cm) 1층 후방 휠체어석 시야 검증',
    vocContextEn:
      'Official 15127487 Woori Art Hall GLB (162.4MB→4.2MB Draco) loaded live + proscenium theater 1F wheelchair sightline check',
    vocContextJa:
      '公式15127487ウリ金融アートホールGLB（162.4MB→4.2MB Draco圧縮）搭載＋プロセニアム劇場1階後方車椅子席の視界検証',
    hasOfficialGlb: true,
  },
  '88-lawn': {
    id: '88-lawn',
    nameKo: '88잔디마당 (실물 15127487 GLB)',
    nameEn: '88 Lawn Yard (Official 15127487 GLB)',
    nameJa: '88芝生広場（公式15127487実物GLB）',
    seatsKo: '야외 수용 약 10,000명',
    seatsEn: 'Outdoor ~10,000 capacity',
    seatsJa: '屋外収容 約10,000名',
    baseStageDistanceM: 28,
    defaultStageHeightM: 1.8,
    defaultRailingCm: 0,
    frontTierDropM: 0,
    vocContextKo:
      'KSPO&CO 공공데이터 15127487 실물 3D 모델(88JandiMadang.glb, 10.4MB→1.5MB Draco 압축) 직접 로드 + 야외 페스티벌 배리어프리 단상 시야 검증',
    vocContextEn:
      'Official KSPO&CO 15127487 GLB (88JandiMadang.glb, 10.4MB→1.5MB Draco) loaded live + outdoor festival wheelchair riser check',
    vocContextJa:
      'KSPO&CO公式15127487実物3Dモデル（88JandiMadang.glb、10.4MB→1.5MB Draco圧縮）搭載＋屋外フェス用バリアフリー観覧台視界検証',
    hasOfficialGlb: true,
  },
  'lake-stage': {
    id: 'lake-stage',
    nameKo: '수변무대 (실물 15127487 GLB)',
    nameEn: '88 Lake Waterside Stage (Official 15127487 GLB)',
    nameJa: '88湖水辺ステージ（公式実物GLB）',
    seatsKo: '야외 수변공연 약 3,500명',
    seatsEn: 'Outdoor waterside ~3,500 capacity',
    seatsJa: '屋外水辺公演 約3,500名',
    baseStageDistanceM: 22,
    defaultStageHeightM: 1.6,
    defaultRailingCm: 80,
    frontTierDropM: 0.15,
    vocContextKo:
      'KSPO&CO 공공데이터 15127487 실물 3D 모델(OlympicPark_LakeSideStage.glb, 23.6MB→1.4MB Draco 압축) 직접 로드 + 수변 관람석 휠체어 시야 검증',
    vocContextEn:
      'Official KSPO&CO 15127487 GLB (OlympicPark_LakeSideStage.glb, 23.6MB→1.4MB Draco) loaded live + waterside wheelchair sightline audit',
    vocContextJa:
      'KSPO&CO公式15127487実物3Dモデル（OlympicPark_LakeSideStage.glb、23.6MB→1.4MB Draco圧縮）搭載＋水辺観覧席の車椅子視界検証',
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

  const frontTopM = (params.frontRowPosture === 'standing' ? 1.65 : 1.25) - spec.frontTierDropM;
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

  const visibleRays = res.rays.filter((r) => r.blockedBy === 'none');
  let clearAngleDeg = 0;
  if (visibleRays.length >= 2) {
    const low = visibleRays[0];
    const high = visibleRays[visibleRays.length - 1];
    const a1 = Math.atan2(low.targetY - res.eyeY, low.targetX);
    const a2 = Math.atan2(high.targetY - res.eyeY, high.targetX);
    clearAngleDeg = Math.round(((a2 - a1) * 180) / Math.PI * 10) / 10;
  }

  let recommendedPlatformLiftCm = params.platformLiftCm;
  if (res.occlusionPct > 5) {
    for (let lift = 0; lift <= 110; lift += 5) {
      const test = evaluateRays({
        ...params,
        platformLiftCm: lift,
        railingHeightCm: Math.min(params.railingHeightCm, 80),
      });
      if (test.occlusionPct <= 5) {
        recommendedPlatformLiftCm = lift;
        break;
      }
      recommendedPlatformLiftCm = 110;
    }
  }

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
