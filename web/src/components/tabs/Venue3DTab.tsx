import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  Box,
  Eye,
  Accessibility,
  Sliders,
  AlertTriangle,
  CheckCircle2,
  Camera,
  Layers,
  Sparkles,
} from 'lucide-react';
import type { AppBundle, Lang } from '../../types/data';
import {
  computeSightline,
  VENUE_3D_SPECS,
  type SightlineParams,
  type SightlineResult,
  type Venue3DId,
} from '../../lib/sightlineEngine';
import { AccessibleTableToggle } from '../AccessibleTableToggle';

interface Venue3DTabProps {
  bundle: AppBundle;
  lang: Lang;
}

type CameraPreset = 'overview' | 'wheelchair-pov' | 'side-section' | 'stage-front';

function detectWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')));
  } catch {
    return false;
  }
}

export function Venue3DTab({ bundle, lang }: Venue3DTabProps) {
  const [params, setParams] = useState<SightlineParams>({
    venueId: 'kspo-dome',
    frontRowPosture: 'standing',
    wheelchairEyeCm: 115,
    platformLiftCm: 0,
    stageHeightM: 1.5,
    thrustStageM: 2,
    frontRowGapM: 1.4,
    railingHeightCm: 85,
  });

  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('overview');
  const [wireframe, setWireframe] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'3d' | '2d'>('3d');
  const [glbStatus, setGlbStatus] = useState<string>('');
  const [webglSupported] = useState<boolean>(() => detectWebGL());

  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneObjectsRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    dynamicGroup: THREE.Group;
    glbGroup: THREE.Group;
  } | null>(null);

  const sightline = useMemo(() => computeSightline(params), [params]);
  const venueSpec = VENUE_3D_SPECS[params.venueId];
  const modelMeta = bundle.availableModels.find((m) => m.venueId === params.venueId);

  const handleSelectVenue = (id: Venue3DId) => {
    const spec = VENUE_3D_SPECS[id];
    setParams((prev) => ({
      ...prev,
      venueId: id,
      stageHeightM: spec.defaultStageHeightM,
      railingHeightCm: spec.defaultRailingCm,
      platformLiftCm: 0,
      thrustStageM: id === 'kspo-dome' ? 2 : 0,
    }));
  };

  // Mount Three.js renderer once when in 3D mode
  useEffect(() => {
    if (!webglSupported || viewMode !== '3d' || !mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth || 720;
    const height = 410;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0B192C');
    scene.fog = new THREE.Fog('#0B192C', 45, 110);

    const camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 200);
    camera.position.set(-8, 12, 22);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
    } catch {
      setViewMode('2d');
      return;
    }

    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 - 0.03;
    controls.target.set(8, 2.2, 0);

    // Lighting
    const hemi = new THREE.HemisphereLight('#E2E8F0', '#1E293B', 1.1);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight('#FFFFFF', 1.4);
    dir.position.set(14, 24, 16);
    scene.add(dir);
    const rim = new THREE.DirectionalLight('#2DD4BF', 0.55);
    rim.position.set(-16, 10, -14);
    scene.add(rim);

    // Subtle floor grid
    const grid = new THREE.GridHelper(64, 32, '#334155', '#1E293B');
    grid.position.y = -0.01;
    scene.add(grid);

    const dynamicGroup = new THREE.Group();
    const glbGroup = new THREE.Group();
    scene.add(dynamicGroup);
    scene.add(glbGroup);

    sceneObjectsRef.current = { scene, camera, controls, dynamicGroup, glbGroup };

    let rafId = 0;
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || 720;
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
      renderer.setSize(w, height);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      controls.dispose();
      renderer.dispose();
      sceneObjectsRef.current = null;
    };
  }, [webglSupported, viewMode]);

  // Load real KSPO&CO 15127487 GLB when available for selected venue
  useEffect(() => {
    const ctx = sceneObjectsRef.current;
    if (!ctx) return;

    // Clear old GLB
    while (ctx.glbGroup.children.length > 0) {
      ctx.glbGroup.remove(ctx.glbGroup.children[0]);
    }

    const glbUrl = modelMeta?.glbUrl;
    if (!glbUrl) {
      setGlbStatus('');
      return;
    }

    let cancelled = false;
    setGlbStatus(lang === 'ko' ? '실물 15127487 GLB 3D 모델 로딩 중...' : 'Loading official 15127487 GLB model...');
    const loader = new GLTFLoader();
    loader.load(
      glbUrl,
      (gltf) => {
        if (cancelled || !sceneObjectsRef.current) return;
        const root = gltf.scene;
        // Auto-normalize scale to fit nicely around the 40m arena coordinate frame
        const box = new THREE.Box3().setFromObject(root);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const scale = 42 / maxDim;
        root.scale.setScalar(scale);
        root.position.set(-center.x * scale + 12, -box.min.y * scale - 0.05, -center.z * scale);
        root.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const m = (obj as THREE.Mesh).material;
            if (m && 'transparent' in m) {
              (m as THREE.MeshStandardMaterial).opacity = 0.85;
              (m as THREE.MeshStandardMaterial).transparent = true;
            }
          }
        });
        ctx.glbGroup.add(root);
        const fileName = glbUrl.split('/').pop() ?? glbUrl;
        setGlbStatus(
          lang === 'ko'
            ? `실물 15127487 GLB 로드 완료 (${fileName})`
            : `Loaded official 15127487 GLB (${fileName})`
        );
      },
      undefined,
      () => {
        if (!cancelled) {
          setGlbStatus(
            lang === 'ko'
              ? '파라메트릭 3D 공연장 모델로 표시 중 (GLB 자산 준비 대기)'
              : 'Rendering parametric 3D architectural twin (GLB asset standby)'
          );
        }
      }
    );

    return () => {
      cancelled = true;
    };
  }, [modelMeta?.glbUrl, lang, viewMode]);

  // Rebuild parametric stage + wheelchair deck + standing/seated front row + 3D sightline rays
  useEffect(() => {
    const ctx = sceneObjectsRef.current;
    if (!ctx) return;
    const g = ctx.dynamicGroup;
    while (g.children.length > 0) {
      g.remove(g.children[0]);
    }

    const stageX = sightline.stageDistanceM;
    const stageH = params.stageHeightM;
    const deckY = params.platformLiftCm / 100;
    const eyeY = sightline.eyeY;
    const frontH = sightline.frontBlockerY;

    // 1. Main Stage & Thrust Stage
    const stageMat = new THREE.MeshStandardMaterial({
      color: '#1E3A8A',
      roughness: 0.55,
      wireframe,
    });
    const mainStage = new THREE.Mesh(new THREE.BoxGeometry(9, stageH, 16), stageMat);
    mainStage.position.set(stageX + 4.5, stageH / 2, 0);
    g.add(mainStage);

    // Stage LED Backdrop
    const ledMat = new THREE.MeshStandardMaterial({
      color: '#0F766E',
      emissive: '#0D9488',
      emissiveIntensity: 0.35,
      wireframe,
    });
    const backdrop = new THREE.Mesh(new THREE.BoxGeometry(0.4, 5.2, 13.5), ledMat);
    backdrop.position.set(stageX + 8.5, stageH + 2.6, 0);
    g.add(backdrop);

    // Thrust stage extension
    if (params.thrustStageM > 0) {
      const thrust = new THREE.Mesh(
        new THREE.BoxGeometry(params.thrustStageM, stageH * 0.96, 4.2),
        new THREE.MeshStandardMaterial({ color: '#2563EB', roughness: 0.5, wireframe })
      );
      thrust.position.set(stageX + params.thrustStageM * 0.1 - 0.2, (stageH * 0.96) / 2, 0);
      g.add(thrust);
    }

    // Performer silhouette on front edge of stage
    const perfMat = new THREE.MeshStandardMaterial({ color: '#FBBF24', emissive: '#D97706', emissiveIntensity: 0.25 });
    const perfBody = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 1.4, 12), perfMat);
    perfBody.position.set(stageX, stageH + 0.7, 0);
    g.add(perfBody);
    const perfHead = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), perfMat);
    perfHead.position.set(stageX, stageH + 1.58, 0);
    g.add(perfHead);

    // 2. Arena Bowl Rings (subtle architectural context when not showing full GLB)
    if (!modelMeta?.glbUrl) {
      const tierMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.8, wireframe });
      [-10, 10].forEach((zSide) => {
        const sideTier = new THREE.Mesh(new THREE.BoxGeometry(28, 3.2, 3.8), tierMat);
        sideTier.position.set(stageX * 0.48, 1.6, zSide);
        g.add(sideTier);
      });
    }

    // 3. Wheelchair Platform Deck (elevation = platformLiftCm)
    const deckH = Math.max(0.08, deckY);
    const deckMesh = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, deckH, 6.5),
      new THREE.MeshStandardMaterial({ color: '#0F766E', roughness: 0.4, wireframe })
    );
    deckMesh.position.set(-0.5, deckH / 2, 0);
    g.add(deckMesh);

    // Wheelchair Spectator Avatar (at x = 0)
    const wcMat = new THREE.MeshStandardMaterial({ color: '#38BDF8', emissive: '#0284C7', emissiveIntensity: 0.25 });
    const wheelLeft = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.05, 8, 16), wcMat);
    wheelLeft.position.set(0, deckY + 0.34, 0.35);
    g.add(wheelLeft);
    const wheelRight = wheelLeft.clone();
    wheelRight.position.z = -0.35;
    g.add(wheelRight);
    const wcTorso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 0.42), wcMat);
    wcTorso.position.set(0, deckY + 0.72, 0);
    g.add(wcTorso);
    const wcHead = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), wcMat);
    wcHead.position.set(0, eyeY, 0);
    g.add(wcHead);

    // 4. Safety Railing in front of wheelchair deck (x = 0.65)
    if (params.railingHeightCm > 0) {
      const railH = params.railingHeightCm / 100;
      const railMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, railH, 6.4),
        new THREE.MeshStandardMaterial({
          color: sightline.blockedByRailingCount > 0 ? '#EF4444' : '#94A3B8',
          transparent: true,
          opacity: 0.65,
          wireframe,
        })
      );
      railMesh.position.set(0.65, deckY + railH / 2, 0);
      g.add(railMesh);
    }

    // 5. Front-Row General Spectators (Seated 1.25m vs Standing 1.65m)
    const frontMat = new THREE.MeshStandardMaterial({
      color: params.frontRowPosture === 'standing' ? '#F97316' : '#64748B',
      roughness: 0.5,
      wireframe,
    });
    [-1.8, -0.9, 0, 0.9, 1.8].forEach((zPos) => {
      const bodyH = Math.max(0.6, frontH - 0.32);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, bodyH, 10), frontMat);
      body.position.set(params.frontRowGapM, bodyH / 2, zPos);
      g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), frontMat);
      head.position.set(params.frontRowGapM, frontH - 0.16, zPos);
      g.add(head);
    });

    // 6. Optical Sightline Rays (Teal = clear, Red = blocked)
    sightline.rays.forEach((ray, idx) => {
      if (idx % 2 !== 0) return; // Keep 12 crisp rays in 3D for clean readability
      const blocked = ray.blockedBy !== 'none';
      const pts = [
        new THREE.Vector3(0.15, eyeY, 0),
        new THREE.Vector3(ray.hitX, ray.hitY, 0),
      ];
      const geom = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(
        geom,
        new THREE.LineBasicMaterial({ color: blocked ? '#EF4444' : '#2DD4BF' })
      );
      g.add(line);
    });
  }, [params, sightline, wireframe, modelMeta?.glbUrl, viewMode]);

  // Camera Presets
  useEffect(() => {
    const ctx = sceneObjectsRef.current;
    if (!ctx) return;
    const { camera, controls } = ctx;
    const stageX = sightline.stageDistanceM;

    if (cameraPreset === 'wheelchair-pov') {
      camera.position.set(-0.2, sightline.eyeY + 0.08, 0.01);
      controls.target.set(stageX, params.stageHeightM + 1.0, 0);
    } else if (cameraPreset === 'side-section') {
      camera.position.set(stageX * 0.45, 3.6, 22);
      controls.target.set(stageX * 0.45, 2.0, 0);
    } else if (cameraPreset === 'stage-front') {
      camera.position.set(stageX + 3, params.stageHeightM + 4, 10);
      controls.target.set(0, sightline.eyeY, 0);
    } else {
      camera.position.set(-9, 10.5, 19);
      controls.target.set(stageX * 0.45, 2.0, 0);
    }
    controls.update();
  }, [cameraPreset, sightline.eyeY, sightline.stageDistanceM, params.stageHeightM]);

  const statusMeta = {
    pass: {
      ko: '적합 (시야 확보 양호)',
      en: 'PASS (Clear Sightline)',
      cls: 'border-emerald-300 bg-emerald-50 text-emerald-900',
    },
    caution: {
      ko: '주의 (부분 시야 제한)',
      en: 'CAUTION (Partial Occlusion)',
      cls: 'border-amber-300 bg-amber-50 text-amber-950',
    },
    critical: {
      ko: '부적합 (단상 보강 · 무대 상향 필수)',
      en: 'CRITICAL (Riser Required)',
      cls: 'border-red-300 bg-red-50 text-red-900',
    },
  }[sightline.status];

  return (
    <div className="space-y-6">
      <section aria-labelledby="venue3d-heading" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-[#0F2C59] border border-blue-200">
              <Sparkles className="h-3.5 w-3.5 text-[#0F766E]" aria-hidden="true" />
              {lang === 'ko'
                ? '공모 예시 3번(실감형 3D 무대설계) × 휠체어석 VOC 1,262회 직접 해결'
                : 'Contest Ex. #3 (3D Stage Design) × Wheelchair Sightline VOC (1,262 views)'}
            </div>
            <h2 id="venue3d-heading" className="mt-1.5 flex items-center gap-2 text-base font-bold text-[#0F2C59] sm:text-lg">
              <Box className="h-5 w-5 text-[#0F766E]" aria-hidden="true" />
              {lang === 'ko'
                ? '실감형 3D 공연장 탐색 & 휠체어석 기하학적 광선추적 시야 검증기'
                : 'Interactive 3D Venue Twin & Geometric Wheelchair Sightline Raycaster'}
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              {lang === 'ko' ? venueSpec.vocContextKo : venueSpec.vocContextEn}
            </p>
          </div>

          <div className={`rounded-xl border px-3.5 py-2 text-right ${statusMeta.cls}`}>
            <div className="text-[11px] font-bold">
              {lang === 'ko' ? statusMeta.ko : statusMeta.en}
            </div>
            <div className="text-xl font-extrabold">
              {lang === 'ko' ? `가림률 ${sightline.occlusionPct}%` : `${sightline.occlusionPct}% Blocked`}
            </div>
          </div>
        </div>

        {/* Venue Selector Pills */}
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={lang === 'ko' ? '공연장 3D 선택' : 'Select 3D venue'}>
          {(Object.keys(VENUE_3D_SPECS) as Venue3DId[]).map((vid) => {
            const sp = VENUE_3D_SPECS[vid];
            return (
              <button
                key={vid}
                type="button"
                aria-pressed={params.venueId === vid}
                onClick={() => handleSelectVenue(vid)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
                  params.venueId === vid
                    ? 'border-[#0F2C59] bg-[#0F2C59] text-white'
                    : 'border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {lang === 'ko' ? sp.nameKo : sp.nameEn}
              </button>
            );
          })}
        </div>

        {/* Main 3D Viewport + Controls */}
        <div className="mt-5 grid gap-5 lg:grid-cols-12">
          {/* Left: 3D Viewport & Camera Toolbar */}
          <div className="space-y-3 lg:col-span-8">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <Camera className="h-4 w-4 text-[#0F2C59]" aria-hidden="true" />
                {(
                  [
                    { id: 'overview', ko: '전체 조감', en: 'Overview' },
                    { id: 'wheelchair-pov', ko: '휠체어 1인칭', en: 'Wheelchair POV' },
                    { id: 'side-section', ko: '측면 단면', en: 'Side Section' },
                    { id: 'stage-front', ko: '무대 정면', en: 'Stage Front' },
                  ] as const
                ).map((cam) => (
                  <button
                    key={cam.id}
                    type="button"
                    aria-pressed={cameraPreset === cam.id}
                    onClick={() => setCameraPreset(cam.id)}
                    className={`rounded-md border px-2 py-1 text-[11px] font-bold ${
                      cameraPreset === cam.id
                        ? 'border-[#0F766E] bg-[#0F766E] text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {lang === 'ko' ? cam.ko : cam.en}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-pressed={wireframe}
                  onClick={() => setWireframe((v) => !v)}
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-bold ${
                    wireframe ? 'border-[#0F2C59] bg-[#0F2C59] text-white' : 'border-slate-300 bg-white text-slate-700'
                  }`}
                >
                  <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                  {lang === 'ko' ? '와이어프레임' : 'Wireframe'}
                </button>
                <button
                  type="button"
                  aria-pressed={viewMode === '2d'}
                  onClick={() => setViewMode((v) => (v === '3d' ? '2d' : '3d'))}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-[#0F2C59] hover:bg-slate-100"
                >
                  {viewMode === '3d'
                    ? lang === 'ko'
                      ? '2D 평면/단면 전환'
                      : 'Switch to 2D SVG'
                    : lang === 'ko'
                      ? '3D WebGL 복귀'
                      : 'Back to 3D WebGL'}
                </button>
              </div>
            </div>

            {/* Three.js Canvas or 2D Fallback */}
            {viewMode === '3d' && webglSupported ? (
              <div
                role="region"
                aria-label={
                  lang === 'ko'
                    ? `${venueSpec.nameKo} 3D 공연장 및 휠체어 시야 광선추적 뷰어 (드래그로 회전, 스크롤로 줌)`
                    : `${venueSpec.nameEn} 3D WebGL venue and wheelchair sightline raycasting viewer`
                }
                className="relative overflow-hidden rounded-xl border border-slate-300 bg-[#0B192C]"
              >
                <div ref={mountRef} className="h-[410px] w-full" />
                <div className="pointer-events-none absolute bottom-2.5 left-3 right-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-950/75 px-3 py-1.5 text-[11px] text-slate-100 backdrop-blur-xs">
                  <span>
                    {glbStatus || (lang === 'ko' ? modelMeta?.sourceNoteKo : modelMeta?.sourceNoteEn)}
                  </span>
                  <span className="font-semibold text-teal-300">
                    {lang === 'ko'
                      ? '청록 광선 = 가시 시야 · 적색 광선 = 가림(차단)'
                      : 'Teal ray = Clear · Red ray = Occluded'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="mb-2 text-xs font-semibold text-slate-600">
                  {lang === 'ko'
                    ? '2D 건축 단면도 모드 (WebGL 미지원 기기 및 저사양 모바일 자동 폴백)'
                    : '2D Architectural Cross-Section Mode (Auto fallback for non-WebGL devices)'}
                </p>
                <SightlineCrossSectionSVG params={params} result={sightline} lang={lang} />
              </div>
            )}

            {/* Synchronized 2D Architectural Sightline Cross-Section (always shown in 3D mode too!) */}
            {viewMode === '3d' && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <h3 className="flex items-center gap-1.5 font-bold text-[#0F2C59]">
                    <Eye className="h-4 w-4 text-[#0F766E]" aria-hidden="true" />
                    {lang === 'ko'
                      ? '실시간 2D 광학 단면도 (24개 광선추적 정량 분석 · KWCAG 대체 시각화)'
                      : 'Synchronized 2D Optical Cross-Section (24-Ray Geometric Verification)'}
                  </h3>
                  <span className="font-mono text-[11px] font-bold text-[#0F766E]">
                    {lang === 'ko'
                      ? `가시율 ${sightline.visiblePct}% · 유효 시야각 ${sightline.clearAngleDeg}°`
                      : `Visible ${sightline.visiblePct}% · Angle ${sightline.clearAngleDeg}°`}
                  </span>
                </div>
                <SightlineCrossSectionSVG params={params} result={sightline} lang={lang} />
              </div>
            )}
          </div>

          {/* Right: Interactive Sightline Simulator Controls & Engineering Verdict */}
          <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 lg:col-span-4">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[#0F2C59]">
              <Sliders className="h-4 w-4 text-[#0F766E]" aria-hidden="true" />
              {lang === 'ko' ? '무대·휠체어석 설계 변수' : 'Stage & Wheelchair Geometry Controls'}
            </div>

            {/* Front Row Standing vs Seated Toggle */}
            <div>
              <div className="mb-1.5 text-xs font-bold text-slate-800">
                {lang === 'ko' ? '앞열 일반석 관객 자세 (핵심 민원 변수)' : 'Front-Row Spectator Posture'}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  aria-pressed={params.frontRowPosture === 'seated'}
                  onClick={() => setParams((p) => ({ ...p, frontRowPosture: 'seated' }))}
                  className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${
                    params.frontRowPosture === 'seated'
                      ? 'border-[#0F766E] bg-[#0F766E] text-white'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {lang === 'ko' ? '착석 (125 cm)' : 'Seated (125 cm)'}
                </button>
                <button
                  type="button"
                  aria-pressed={params.frontRowPosture === 'standing'}
                  onClick={() => setParams((p) => ({ ...p, frontRowPosture: 'standing' }))}
                  className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${
                    params.frontRowPosture === 'standing'
                      ? 'border-red-700 bg-red-700 text-white'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {lang === 'ko' ? '기립·스탠딩 (165 cm)' : 'Standing (165 cm)'}
                </button>
              </div>
            </div>

            {/* Sliders */}
            <div className="space-y-3 text-xs">
              <div>
                <div className="flex justify-between font-semibold text-slate-700">
                  <label htmlFor="wc-eye">{lang === 'ko' ? '휠체어 관객 눈높이' : 'Wheelchair Eye Height'}</label>
                  <span className="font-bold text-[#0F2C59]">{params.wheelchairEyeCm} cm</span>
                </div>
                <input
                  id="wc-eye"
                  type="range"
                  min={100}
                  max={130}
                  step={1}
                  value={params.wheelchairEyeCm}
                  onChange={(e) => setParams((p) => ({ ...p, wheelchairEyeCm: Number(e.target.value) }))}
                  className="mt-1 w-full accent-[#0F2C59]"
                />
              </div>

              <div>
                <div className="flex justify-between font-semibold text-slate-700">
                  <label htmlFor="wc-lift">{lang === 'ko' ? '휠체어석 단상(라이저) 높이' : 'Wheelchair Riser Lift'}</label>
                  <span className="font-bold text-[#0F766E]">+{params.platformLiftCm} cm</span>
                </div>
                <input
                  id="wc-lift"
                  type="range"
                  min={0}
                  max={90}
                  step={5}
                  value={params.platformLiftCm}
                  onChange={(e) => setParams((p) => ({ ...p, platformLiftCm: Number(e.target.value) }))}
                  className="mt-1 w-full accent-[#0F766E]"
                />
              </div>

              <div>
                <div className="flex justify-between font-semibold text-slate-700">
                  <label htmlFor="stage-h">{lang === 'ko' ? '무대 높이 (m)' : 'Stage Height (m)'}</label>
                  <span className="font-bold text-[#0F2C59]">{params.stageHeightM.toFixed(1)} m</span>
                </div>
                <input
                  id="stage-h"
                  type="range"
                  min={1.0}
                  max={2.2}
                  step={0.1}
                  value={params.stageHeightM}
                  onChange={(e) => setParams((p) => ({ ...p, stageHeightM: Number(e.target.value) }))}
                  className="mt-1 w-full accent-[#0F2C59]"
                />
              </div>

              <div>
                <div className="flex justify-between font-semibold text-slate-700">
                  <label htmlFor="thrust-m">{lang === 'ko' ? '돌출무대 확장 길이' : 'Thrust Stage Extension'}</label>
                  <span className="font-bold text-[#0F2C59]">{params.thrustStageM} m</span>
                </div>
                <input
                  id="thrust-m"
                  type="range"
                  min={0}
                  max={10}
                  step={1}
                  value={params.thrustStageM}
                  onChange={(e) => setParams((p) => ({ ...p, thrustStageM: Number(e.target.value) }))}
                  className="mt-1 w-full accent-[#0F2C59]"
                />
              </div>

              <div>
                <div className="flex justify-between font-semibold text-slate-700">
                  <label htmlFor="rail-cm">{lang === 'ko' ? '전면 안전 난간 높이 (핸드볼 VOC)' : 'Front Safety Railing Height'}</label>
                  <span className="font-bold text-amber-800">{params.railingHeightCm} cm</span>
                </div>
                <input
                  id="rail-cm"
                  type="range"
                  min={0}
                  max={115}
                  step={5}
                  value={params.railingHeightCm}
                  onChange={(e) => setParams((p) => ({ ...p, railingHeightCm: Number(e.target.value) }))}
                  className="mt-1 w-full accent-amber-700"
                />
              </div>
            </div>

            {/* Quick Apply Recommended Riser Button */}
            <div className="rounded-xl border border-teal-200 bg-white p-3.5 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-[#0F2C59]">
                <Accessibility className="h-4 w-4 text-[#0F766E]" aria-hidden="true" />
                {lang === 'ko' ? '자동 광학 개선 처방 (대관 무대설계 가이드)' : 'Auto Optical Design Recommendation'}
              </div>

              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-slate-50 p-2">
                  <div className="text-[10px] text-slate-500">{lang === 'ko' ? '권장 휠체어 단상' : 'Rec. Riser Lift'}</div>
                  <div className="text-base font-extrabold text-[#0F766E]">+{sightline.recommendedPlatformLiftCm} cm</div>
                </div>
                <div className="rounded-lg bg-slate-50 p-2">
                  <div className="text-[10px] text-slate-500">{lang === 'ko' ? '권장 최소 무대고' : 'Rec. Stage Height'}</div>
                  <div className="text-base font-extrabold text-[#0F2C59]">{sightline.recommendedStageHeightM.toFixed(1)} m</div>
                </div>
              </div>

              {sightline.occlusionPct > 5 ? (
                <button
                  type="button"
                  onClick={() =>
                    setParams((p) => ({
                      ...p,
                      platformLiftCm: Math.min(90, sightline.recommendedPlatformLiftCm),
                      railingHeightCm: Math.min(p.railingHeightCm, 80),
                    }))
                  }
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#0F766E] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#0D625B]"
                >
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  {lang === 'ko'
                    ? `권장 단상(+${Math.min(90, sightline.recommendedPlatformLiftCm)}cm)·저시야 난간 즉시 적용`
                    : `Apply Recommended Riser (+${Math.min(90, sightline.recommendedPlatformLiftCm)}cm)`}
                </button>
              ) : (
                <div className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-2 font-bold text-emerald-900">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
                  {lang === 'ko' ? '앞열 기립 상황에서도 무대 시야 95%+ 확보!' : '95%+ clear sightline verified!'}
                </div>
              )}

              {sightline.blockedByRailingCount > 0 && (
                <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-[11px] text-amber-950">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" aria-hidden="true" />
                  <span>
                    {lang === 'ko'
                      ? `전면 불투명 난간(${params.railingHeightCm}cm)이 광선 ${sightline.blockedByRailingCount}개를 직접 차단 중 → 강화유리·80cm 하향 권장`
                      : `Opaque railing (${params.railingHeightCm}cm) blocks ${sightline.blockedByRailingCount} rays → use tempered glass / 80cm height`}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        <AccessibleTableToggle
          lang={lang}
          caption={
            lang === 'ko'
              ? '3D 공연장 휠체어석 광선추적 시야 검증 정량 결과 표'
              : '3D Venue Wheelchair Sightline Raycasting Summary Table'
          }
          headers={
            lang === 'ko'
              ? ['항목', '현재 설정값', '판정 / 권고']
              : ['Metric', 'Current Value', 'Verdict / Recommendation']
          }
          rows={[
            [lang === 'ko' ? '대상 공연장' : 'Venue', lang === 'ko' ? venueSpec.nameKo : venueSpec.nameEn, lang === 'ko' ? venueSpec.seatsKo : venueSpec.seatsEn],
            [lang === 'ko' ? '휠체어 눈높이 (단상 포함)' : 'Wheelchair Eye Y', `${Math.round(sightline.eyeY * 100)} cm`, `${params.wheelchairEyeCm}cm + ${params.platformLiftCm}cm`],
            [lang === 'ko' ? '앞열 관객 상단 높이' : 'Front Spectator Height', `${Math.round(sightline.frontBlockerY * 100)} cm`, params.frontRowPosture === 'standing' ? 'Standing (165cm)' : 'Seated (125cm)'],
            [lang === 'ko' ? '무대 시야 가림률' : 'Stage Occlusion %', `${sightline.occlusionPct}%`, lang === 'ko' ? statusMeta.ko : statusMeta.en],
            [lang === 'ko' ? '권장 휠체어 단상 높이' : 'Recommended Riser', `+${sightline.recommendedPlatformLiftCm} cm`, lang === 'ko' ? '가림률 5% 이하 달성 기준' : 'Target <= 5% occlusion'],
          ]}
        />
      </section>
    </div>
  );
}

function SightlineCrossSectionSVG({
  params,
  result,
  lang,
}: {
  params: SightlineParams;
  result: SightlineResult;
  lang: Lang;
}) {
  const W = 720;
  const H = 220;
  const padL = 44;
  const padR = 36;
  const padB = 34;
  const padT = 18;
  const maxX = Math.max(18, result.stageDistanceM + 4);
  const maxY = 4.6;

  const sx = (x: number) => padL + ((x + 1.2) / (maxX + 1.2)) * (W - padL - padR);
  const sy = (y: number) => H - padB - (y / maxY) * (H - padT - padB);
  const deckY = params.platformLiftCm / 100;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full rounded-lg bg-white border border-slate-200"
      role="img"
      aria-label={
        lang === 'ko'
          ? `휠체어석 시야 2D 광학 단면도: 가림률 ${result.occlusionPct}%, 가시율 ${result.visiblePct}%`
          : `2D Sightline Cross-Section: ${result.occlusionPct}% occluded, ${result.visiblePct}% visible`
      }
    >
      {/* Floor baseline */}
      <line x1={padL} y1={sy(0)} x2={W - padR} y2={sy(0)} stroke="#94A3B8" strokeWidth="2" />

      {/* Height guide lines */}
      {[1, 2, 3, 4].map((m) => (
        <g key={m}>
          <line x1={padL} y1={sy(m)} x2={W - padR} y2={sy(m)} stroke="#E2E8F0" strokeDasharray="3 3" />
          <text x={padL - 8} y={sy(m) + 3} textAnchor="end" fontSize="10" fill="#64748B">
            {m}m
          </text>
        </g>
      ))}

      {/* Wheelchair Deck */}
      {deckY > 0 && (
        <rect
          x={sx(-1.0)}
          y={sy(deckY)}
          width={sx(0.8) - sx(-1.0)}
          height={sy(0) - sy(deckY)}
          fill="#0F766E"
          opacity="0.28"
          stroke="#0F766E"
        />
      )}

      {/* Wheelchair Eye Marker */}
      <circle cx={sx(0)} cy={sy(result.eyeY)} r="6" fill="#0284C7" stroke="#FFFFFF" strokeWidth="2" />
      <text x={sx(0)} y={sy(result.eyeY) - 10} textAnchor="middle" fontSize="10" fontWeight="700" fill="#0F2C59">
        {lang === 'ko' ? `휠체어 ${(result.eyeY * 100).toFixed(0)}cm` : `WC ${(result.eyeY * 100).toFixed(0)}cm`}
      </text>

      {/* Safety Railing */}
      {params.railingHeightCm > 0 && (
        <line
          x1={sx(0.65)}
          y1={sy(deckY)}
          x2={sx(0.65)}
          y2={sy(result.railingTopY)}
          stroke={result.blockedByRailingCount > 0 ? '#DC2626' : '#64748B'}
          strokeWidth="3.5"
        />
      )}

      {/* Front-Row Blocker */}
      <rect
        x={sx(params.frontRowGapM) - 5}
        y={sy(result.frontBlockerY)}
        width="10"
        height={sy(0) - sy(result.frontBlockerY)}
        rx="4"
        fill={params.frontRowPosture === 'standing' ? '#EA580C' : '#64748B'}
      />
      <text
        x={sx(params.frontRowGapM) + 6}
        y={sy(result.frontBlockerY) - 6}
        fontSize="10"
        fontWeight="700"
        fill={params.frontRowPosture === 'standing' ? '#C2410C' : '#475569'}
      >
        {params.frontRowPosture === 'standing'
          ? lang === 'ko'
            ? '앞열 기립'
            : 'Standing'
          : lang === 'ko'
            ? '앞열 착석'
            : 'Seated'}
      </text>

      {/* Stage Block & Performer Target Band */}
      <rect
        x={sx(result.stageDistanceM)}
        y={sy(params.stageHeightM)}
        width={sx(maxX) - sx(result.stageDistanceM)}
        height={sy(0) - sy(params.stageHeightM)}
        fill="#0F2C59"
        opacity="0.88"
      />
      <rect
        x={sx(result.stageDistanceM) + 4}
        y={sy(params.stageHeightM + 1.75)}
        width="10"
        height={sy(params.stageHeightM) - sy(params.stageHeightM + 1.75)}
        rx="4"
        fill="#F59E0B"
      />
      <text
        x={sx(result.stageDistanceM) + 18}
        y={sy(params.stageHeightM + 1.5)}
        fontSize="10"
        fontWeight="700"
        fill="#0F2C59"
      >
        {lang === 'ko' ? `무대 ${params.stageHeightM.toFixed(1)}m` : `Stage ${params.stageHeightM.toFixed(1)}m`}
      </text>

      {/* Optical Rays */}
      {result.rays.map((ray) => {
        const blocked = ray.blockedBy !== 'none';
        return (
          <line
            key={ray.index}
            x1={sx(0)}
            y1={sy(result.eyeY)}
            x2={sx(ray.hitX)}
            y2={sy(ray.hitY)}
            stroke={blocked ? '#EF4444' : '#0F766E'}
            strokeWidth={blocked ? 1.15 : 1.05}
            strokeDasharray={blocked ? '3 2' : undefined}
            opacity={blocked ? 0.85 : 0.6}
          />
        );
      })}

      {/* Distance axis label */}
      <text x={W / 2} y={H - 8} textAnchor="middle" fontSize="10.5" fill="#475569">
        {lang === 'ko'
          ? `휠체어석(0m) → 앞열(${params.frontRowGapM}m) → 무대 전면(${result.stageDistanceM}m)`
          : `Wheelchair (0m) → Front Row (${params.frontRowGapM}m) → Stage Front (${result.stageDistanceM}m)`}
      </text>
    </svg>
  );
}
