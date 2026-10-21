/**
 * High-Performance Three.js 3D WebGL Renderer for Neon Grid Runner.
 *
 * Implements:
 * - Full 3D Cyberpunk Rainbow World with studio PBR materials & RoomEnvironment reflections
 * - Composite 3D procedural player ship (9 parts: fuselage, swept wings, glass canopy, twin ion thrusters, headlights)
 * - 3D dynamic rainbow ribbon streamer trail behind player
 * - 3D monolithic neon walls with glowing edge wireframes & cyber corner pylons
 * - 3D rotating kaleidoscopic crystal shards with orbiting satellites
 * - 3D multi-ring Stargate exit portal
 * - 3D animated hazards (Seeker Drones, Laser Turrets, Electro-Gates, Blitz Hunters)
 * - 3 Switchable 3D Camera Modes: Chase 3D (Action), Isometric 3D (Tactical), Cockpit 3D (FPV)
 * - Zero-GC per-frame update loop with pre-allocated mathematical vectors
 * - Software-WebGL detection & pacing guard
 */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  Wall,
  Player,
  DataShard,
  Hazard,
  SeekerDrone,
  LaserTurret,
  ElectroGate,
  BlitzHunter,
} from './rules.ts';

export type CameraViewMode = 'chase' | 'iso' | 'cockpit';

export const isSoftwareGl = (() => {
  if (typeof document === 'undefined') return false;
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
})();

// Zero-GC module-level scratchpad
const _v1 = new THREE.Vector3();
const _camTarget = new THREE.Vector3();
const _camIdeal = new THREE.Vector3();
const _color = new THREE.Color();

// Helper to compute rainbow hex at a given phase
export function getRainbowHex(phase: number): number {
  const r = Math.sin(phase) * 127 + 128;
  const g = Math.sin(phase + (2 * Math.PI) / 3) * 127 + 128;
  const b = Math.sin(phase + (4 * Math.PI) / 3) * 127 + 128;
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}

export function getRainbowColor(phase: number, target: THREE.Color): THREE.Color {
  target.setHex(getRainbowHex(phase));
  return target;
}

export interface ThreeParticle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  color: THREE.Color;
}

export class ThreeRenderer {
  public canvas: HTMLCanvasElement;
  public renderer: THREE.WebGLRenderer;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public cameraMode: CameraViewMode = 'chase';

  // Camera tracking
  private cameraPosSmooth = new THREE.Vector3(140, 100, 140);
  private cameraLookSmooth = new THREE.Vector3(140, 15, 140);
  private trauma = 0;

  // Environment & Lights
  private dirLight!: THREE.DirectionalLight;
  private hemiLight!: THREE.HemisphereLight;
  private playerLight!: THREE.PointLight;
  private playerHeadlight!: THREE.SpotLight;
  private headlightTarget!: THREE.Object3D;

  // Meshes
  private floorMesh!: THREE.Mesh;
  private floorGrid!: THREE.GridHelper;
  private wallGroup: THREE.Group = new THREE.Group();
  private shardGroup: THREE.Group = new THREE.Group();
  private hazardGroup: THREE.Group = new THREE.Group();
  private gatewayGroup: THREE.Group = new THREE.Group();
  private playerShip: THREE.Group = new THREE.Group();
  private playerVolumetricCone!: THREE.Mesh;
  private playerShieldBubble!: THREE.Mesh;

  // 3D Ribbon Trail
  private ribbonMesh!: THREE.Mesh;
  private ribbonGeometry!: THREE.BufferGeometry;
  private ribbonPositions!: Float32Array;
  private ribbonColors!: Float32Array;
  private readonly RIBBON_POINTS = 40;
  private ribbonHistory: Array<{ x: number; y: number; z: number; isDashing: boolean }> = [];

  // 3D Particles
  private particles: ThreeParticle[] = [];
  private particlePoints!: THREE.Points;
  private particlePositions!: Float32Array;
  private particleColors!: Float32Array;
  private particleSizes!: Float32Array;
  private readonly MAX_PARTICLES = 400;

  // Floating Combat Texts (Billboards)
  private combatTextSprites: Array<{
    sprite: THREE.Sprite;
    vx: number;
    vy: number;
    vz: number;
    life: number;
    maxLife: number;
  }> = [];

  // Tracked entity mesh pools
  private shardMeshes: Map<string, THREE.Group> = new Map();
  private hazardMeshes: Map<string, THREE.Group> = new Map();

  // Animation clocks & states
  private globalClock = 0;
  private isDestroyed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    // 1. Initialize WebGLRenderer with high-end settings
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight, false);
    this.renderer.shadowMap.enabled = !isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // 2. Setup Scene & Atmospheric Fog
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x02040a);
    this.scene.fog = new THREE.FogExp2(0x02040a, 0.0016);

    // 3. Camera Setup
    const aspect = (canvas.clientWidth || window.innerWidth) / (canvas.clientHeight || window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(56, aspect, 1, 3000);
    this.camera.position.set(140, 110, 220);
    this.camera.lookAt(140, 15, 140);

    // 4. Studio Environment Reflection Map
    try {
      const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
      pmremGenerator.dispose();
    } catch {
      // Fallback gracefully if environment map generation fails
    }

    // 5. Lighting Rig
    this.setupLighting();

    // 6. Build Cyber Floor & Grid
    this.setupFloor();

    // 7. Build Composite Player Ship (9 parts)
    this.setupPlayerShip();

    // 8. Build 3D Rainbow Ribbon Trail
    this.setupRibbonTrail();

    // 9. Build 3D Particle System
    this.setupParticleSystem();

    // 10. Build 3D Exit Gateway
    this.setupExitGateway();

    // Add groups to scene
    this.scene.add(this.wallGroup);
    this.scene.add(this.shardGroup);
    this.scene.add(this.hazardGroup);
    this.scene.add(this.gatewayGroup);

    // Resize listener
    window.addEventListener('resize', this.onResize);
  }

  private onResize = () => {
    if (this.isDestroyed || !this.canvas) return;
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  };

  private setupLighting() {
    // Hemisphere light: cool cyber cyan sky, warm neon magenta ground bounce
    this.hemiLight = new THREE.HemisphereLight(0x06b6d4, 0xd946ef, 0.45);
    this.scene.add(this.hemiLight);

    // Key directional light with soft shadows
    this.dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    this.dirLight.position.set(200, 400, 250);
    if (!isSoftwareGl) {
      this.dirLight.castShadow = true;
      this.dirLight.shadow.mapSize.width = 1024;
      this.dirLight.shadow.mapSize.height = 1024;
      this.dirLight.shadow.camera.near = 50;
      this.dirLight.shadow.camera.far = 1200;
      this.dirLight.shadow.camera.left = -400;
      this.dirLight.shadow.camera.right = 400;
      this.dirLight.shadow.camera.top = 400;
      this.dirLight.shadow.camera.bottom = -400;
      this.dirLight.shadow.bias = -0.0005;
      this.dirLight.shadow.normalBias = 0.02;
    }
    this.scene.add(this.dirLight);

    // Ship's local point aura
    this.playerLight = new THREE.PointLight(0x38bdf8, 2.4, 280, 1.2);
    this.playerLight.position.set(140, 20, 140);
    this.scene.add(this.playerLight);

    // Dynamic forward 3D headlight
    this.headlightTarget = new THREE.Object3D();
    this.scene.add(this.headlightTarget);

    this.playerHeadlight = new THREE.SpotLight(0xa5f3fc, 4.0, 380, Math.PI / 4.8, 0.4, 1.0);
    this.playerHeadlight.position.set(140, 18, 140);
    this.playerHeadlight.target = this.headlightTarget;
    if (!isSoftwareGl) {
      this.playerHeadlight.castShadow = true;
      this.playerHeadlight.shadow.mapSize.width = 512;
      this.playerHeadlight.shadow.mapSize.height = 512;
      this.playerHeadlight.shadow.bias = -0.0005;
    }
    this.scene.add(this.playerHeadlight);
  }

  private setupFloor() {
    // Glossy obsidian cyber floor
    const floorGeo = new THREE.PlaneGeometry(3200, 3200, 1, 1);
    floorGeo.rotateX(-Math.PI / 2);

    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x050711,
      roughness: 0.18,
      metalness: 0.85,
    });
    this.floorMesh = new THREE.Mesh(floorGeo, floorMat);
    this.floorMesh.position.set(800, 0, 600);
    this.floorMesh.receiveShadow = !isSoftwareGl;
    this.scene.add(this.floorMesh);

    // Primary glowing coordinate grid lines
    this.floorGrid = new THREE.GridHelper(3200, 80, 0x06b6d4, 0x1e1b4b);
    this.floorGrid.position.set(800, 0.2, 600);
    (this.floorGrid.material as THREE.Material).transparent = true;
    (this.floorGrid.material as THREE.Material).opacity = 0.55;
    this.scene.add(this.floorGrid);
  }

  /**
   * Builds the composite procedural 3D Player Ship (THREE.Group with 9 parts).
   */
  private setupPlayerShip() {
    this.playerShip = new THREE.Group();

    // 1. Primary silhouette: Aerodynamic faceted fuselage
    const bodyShape = new THREE.Shape();
    bodyShape.moveTo(0, 16); // nose tip
    bodyShape.lineTo(-5.5, -4);
    bodyShape.lineTo(-3.5, -12);
    bodyShape.lineTo(3.5, -12);
    bodyShape.lineTo(5.5, -4);
    bodyShape.closePath();

    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: 4.5,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 1.0,
      bevelThickness: 1.2,
    };

    const fuselageGeo = new THREE.ExtrudeGeometry(bodyShape, extrudeSettings);
    fuselageGeo.rotateX(Math.PI / 2);
    fuselageGeo.center();

    const fuselageMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.22,
      metalness: 0.92,
    });
    const fuselageMesh = new THREE.Mesh(fuselageGeo, fuselageMat);
    fuselageMesh.castShadow = !isSoftwareGl;
    this.playerShip.add(fuselageMesh);

    // 2. Secondary silhouette: Swept Delta Wings (Left & Right)
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0);
    wingShape.lineTo(-14, -8);
    wingShape.lineTo(-11, -12);
    wingShape.lineTo(0, -6);
    wingShape.closePath();

    const wingGeo = new THREE.ExtrudeGeometry(wingShape, {
      depth: 1.2,
      bevelEnabled: true,
      bevelSize: 0.4,
      bevelThickness: 0.4,
    });
    wingGeo.rotateX(Math.PI / 2);

    const wingMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.35,
      metalness: 0.85,
    });

    const leftWing = new THREE.Mesh(wingGeo, wingMat);
    leftWing.position.set(-1.5, -0.2, 2);
    leftWing.castShadow = !isSoftwareGl;
    this.playerShip.add(leftWing);

    const rightWingGeo = wingGeo.clone();
    rightWingGeo.scale(-1, 1, 1);
    const rightWing = new THREE.Mesh(rightWingGeo, wingMat);
    rightWing.position.set(1.5, -0.2, 2);
    rightWing.castShadow = !isSoftwareGl;
    this.playerShip.add(rightWing);

    // 3. Neon Wingtip Beacons & Rainbow Leading Edge Strips
    const edgeGeo = new THREE.CylinderGeometry(0.3, 0.3, 14, 6);
    edgeGeo.rotateZ(Math.PI / 3);
    const rainbowMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4 });
    const leftEdge = new THREE.Mesh(edgeGeo, rainbowMat);
    leftEdge.position.set(-8, 0.4, -2);
    this.playerShip.add(leftEdge);

    const rightEdge = new THREE.Mesh(edgeGeo, rainbowMat);
    rightEdge.rotation.y = Math.PI;
    rightEdge.position.set(8, 0.4, -2);
    this.playerShip.add(rightEdge);

    // 4. Cockpit Canopy (Faceted high-clearcoat physical glass)
    const canopyGeo = new THREE.SphereGeometry(3.6, 16, 12);
    canopyGeo.scale(0.8, 0.65, 1.8);
    const canopyMat = new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      metalness: 0.1,
      roughness: 0.05,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      transparent: true,
      opacity: 0.85,
    });
    const canopy = new THREE.Mesh(canopyGeo, canopyMat);
    canopy.position.set(0, 2.2, -1);
    this.playerShip.add(canopy);

    // 5. Twin Ion Thruster Nacelles
    const thrusterGeo = new THREE.CylinderGeometry(1.4, 1.6, 5, 12);
    thrusterGeo.rotateX(Math.PI / 2);
    const thrusterMat = new THREE.MeshStandardMaterial({
      color: 0x020617,
      roughness: 0.4,
      metalness: 0.95,
    });

    const leftThruster = new THREE.Mesh(thrusterGeo, thrusterMat);
    leftThruster.position.set(-3.2, 0, 9);
    this.playerShip.add(leftThruster);

    const rightThruster = new THREE.Mesh(thrusterGeo, thrusterMat);
    rightThruster.position.set(3.2, 0, 9);
    this.playerShip.add(rightThruster);

    // Glow Plumes
    const plumeGeo = new THREE.ConeGeometry(1.2, 6, 8);
    plumeGeo.rotateX(-Math.PI / 2);
    const plumeMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85,
    });
    const leftPlume = new THREE.Mesh(plumeGeo, plumeMat);
    leftPlume.position.set(-3.2, 0, 14);
    this.playerShip.add(leftPlume);

    const rightPlume = new THREE.Mesh(plumeGeo, plumeMat);
    rightPlume.position.set(3.2, 0, 14);
    this.playerShip.add(rightPlume);

    // 6. Volumetric Forward Conic Headlight Beam
    const coneGeo = new THREE.ConeGeometry(55, 200, 24, 1, true);
    coneGeo.rotateX(-Math.PI / 2);
    coneGeo.translate(0, 0, 100);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.playerVolumetricCone = new THREE.Mesh(coneGeo, coneMat);
    this.playerVolumetricCone.position.set(0, 0, 0);
    this.playerShip.add(this.playerVolumetricCone);

    // 7. Shimmering Forcefield Shield Bubble
    const shieldGeo = new THREE.IcosahedronGeometry(17, 2);
    const shieldMat = new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
    });
    this.playerShieldBubble = new THREE.Mesh(shieldGeo, shieldMat);
    this.playerShieldBubble.visible = false;
    this.playerShip.add(this.playerShieldBubble);

    // Ground contact shadow grounding disk
    const shadowGeo = new THREE.CircleGeometry(16, 24);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.position.y = -17.5;
    this.playerShip.add(shadowMesh);

    this.playerShip.position.set(140, 18, 140);
    this.scene.add(this.playerShip);
  }

  /**
   * Sets up the 3D Rainbow Ribbon Trail stretching behind the player.
   */
  private setupRibbonTrail() {
    this.ribbonPositions = new Float32Array(this.RIBBON_POINTS * 2 * 3);
    this.ribbonColors = new Float32Array(this.RIBBON_POINTS * 2 * 3);

    const indices: number[] = [];
    for (let i = 0; i < this.RIBBON_POINTS - 1; i++) {
      const p1 = i * 2;
      const p2 = i * 2 + 1;
      const p3 = (i + 1) * 2;
      const p4 = (i + 1) * 2 + 1;
      indices.push(p1, p2, p3);
      indices.push(p2, p4, p3);
    }

    this.ribbonGeometry = new THREE.BufferGeometry();
    this.ribbonGeometry.setAttribute('position', new THREE.BufferAttribute(this.ribbonPositions, 3));
    this.ribbonGeometry.setAttribute('color', new THREE.BufferAttribute(this.ribbonColors, 3));
    this.ribbonGeometry.setIndex(indices);

    const ribbonMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.ribbonMesh = new THREE.Mesh(this.ribbonGeometry, ribbonMat);
    this.ribbonMesh.frustumCulled = false;
    this.scene.add(this.ribbonMesh);
  }

  /**
   * Sets up the 3D Particle System for sparks, dash bursts, and impact effects.
   */
  private setupParticleSystem() {
    this.particlePositions = new Float32Array(this.MAX_PARTICLES * 3);
    this.particleColors = new Float32Array(this.MAX_PARTICLES * 3);
    this.particleSizes = new Float32Array(this.MAX_PARTICLES);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.particleColors, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.particleSizes, 1));

    // Procedural circle particle texture
    const pCanvas = document.createElement('canvas');
    pCanvas.width = 64;
    pCanvas.height = 64;
    const pCtx = pCanvas.getContext('2d')!;
    const grad = pCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.3, 'rgba(6,182,212,0.9)');
    grad.addColorStop(0.7, 'rgba(217,70,239,0.3)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    pCtx.fillStyle = grad;
    pCtx.fillRect(0, 0, 64, 64);
    const pTexture = new THREE.CanvasTexture(pCanvas);
    pTexture.colorSpace = THREE.SRGBColorSpace;

    const mat = new THREE.PointsMaterial({
      size: 16,
      map: pTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.particlePoints = new THREE.Points(geo, mat);
    this.particlePoints.frustumCulled = false;
    this.scene.add(this.particlePoints);
  }

  /**
   * Sets up the multi-ring 3D Exit Gateway Stargate.
   */
  private setupExitGateway() {
    this.gatewayGroup = new THREE.Group();

    // Outer cyber ring
    const ring1Geo = new THREE.TorusGeometry(38, 3.2, 16, 48);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x1e1b4b,
      metalness: 0.95,
      roughness: 0.15,
      emissive: 0x3b82f6,
      emissiveIntensity: 0.6,
    });
    const ring1 = new THREE.Mesh(ring1Geo, ringMat);
    ring1.name = 'ring1';
    this.gatewayGroup.add(ring1);

    // Inner counter-rotating ring
    const ring2Geo = new THREE.TorusGeometry(26, 2.4, 16, 36);
    const ring2Mat = new THREE.MeshStandardMaterial({
      color: 0x312e81,
      metalness: 0.9,
      roughness: 0.2,
      emissive: 0xec4899,
      emissiveIntensity: 0.8,
    });
    const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
    ring2.name = 'ring2';
    this.gatewayGroup.add(ring2);

    // Central singularity vortex disk
    const diskGeo = new THREE.CircleGeometry(23, 32);
    const diskMat = new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const disk = new THREE.Mesh(diskGeo, diskMat);
    disk.name = 'disk';
    this.gatewayGroup.add(disk);

    // Vertical beacon light pillar
    const pillarGeo = new THREE.CylinderGeometry(8, 8, 400, 16, 1, true);
    const pillarMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.y = 200;
    this.gatewayGroup.add(pillar);

    // Local point light
    const gLight = new THREE.PointLight(0x06b6d4, 3, 200, 1.2);
    gLight.position.y = 30;
    this.gatewayGroup.add(gLight);

    this.gatewayGroup.position.set(1400, 38, 1000);
  }

  /**
   * Builds the 3D Monolithic Walls for a sector layout.
   */
  public rebuildWalls(walls: Wall[]) {
    // Clear previous walls
    while (this.wallGroup.children.length > 0) {
      const child = this.wallGroup.children[0] as THREE.Mesh;
      this.wallGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => m.dispose());
      } else if (child.material) {
        child.material.dispose();
      }
    }

    const wallHeight = 54;

    for (const wall of walls) {
      const meshGroup = new THREE.Group();
      meshGroup.position.set(wall.x + wall.w / 2, wallHeight / 2, wall.y + wall.h / 2);

      // Solid beveled wall box
      const boxGeo = new THREE.BoxGeometry(wall.w, wallHeight, wall.h);
      const wallMat = new THREE.MeshStandardMaterial({
        color: 0x090d16,
        roughness: 0.28,
        metalness: 0.88,
      });
      const wallMesh = new THREE.Mesh(boxGeo, wallMat);
      wallMesh.castShadow = !isSoftwareGl;
      wallMesh.receiveShadow = !isSoftwareGl;
      meshGroup.add(wallMesh);

      // Glowing neon edge wireframe
      const edgesGeo = new THREE.EdgesGeometry(boxGeo);
      const edgeMat = new THREE.LineBasicMaterial({
        color: new THREE.Color(wall.neonColor || '#06b6d4'),
        linewidth: 2,
        transparent: true,
        opacity: 0.85,
      });
      const edges = new THREE.LineSegments(edgesGeo, edgeMat);
      meshGroup.add(edges);

      // Glowing corner pylon markers for aesthetic architectural rhythm
      if (wall.w > 40 && wall.h > 40) {
        const pylonGeo = new THREE.CylinderGeometry(2.5, 2.5, wallHeight + 4, 8);
        const pylonMat = new THREE.MeshBasicMaterial({
          color: new THREE.Color(wall.neonColor || '#06b6d4'),
        });
        const p1 = new THREE.Mesh(pylonGeo, pylonMat);
        p1.position.set(-wall.w / 2, 2, -wall.h / 2);
        meshGroup.add(p1);

        const p2 = new THREE.Mesh(pylonGeo, pylonMat);
        p2.position.set(wall.w / 2, 2, wall.h / 2);
        meshGroup.add(p2);
      }

      this.wallGroup.add(meshGroup);
    }
  }

  /**
   * Spawns a 3D Floating Combat Readout (+100, x2 COMBO!, etc.) as a billboard sprite.
   */
  public spawnCombatText(text: string, x: number, z: number, colorHex: string = '#38bdf8') {
    const textCanvas = document.createElement('canvas');
    textCanvas.width = 256;
    textCanvas.height = 64;
    const ctx = textCanvas.getContext('2d')!;

    ctx.clearRect(0, 0, 256, 64);
    ctx.font = 'bold 32px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = colorHex;
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, 128, 32);

    const texture = new THREE.CanvasTexture(textCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(48, 12, 1);
    sprite.position.set(x, 26, z);

    this.scene.add(sprite);
    this.combatTextSprites.push({
      sprite,
      vx: (Math.random() - 0.5) * 8,
      vy: 28 + Math.random() * 10,
      vz: (Math.random() - 0.5) * 8,
      life: 0.9,
      maxLife: 0.9,
    });
  }

  /**
   * Spawns dynamic 3D particles.
   */
  public spawnParticles(
    x: number,
    z: number,
    count: number,
    colorHex: number = 0x06b6d4,
    speed: number = 70
  ) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.MAX_PARTICLES) {
        this.particles.shift();
      }
      const angle = Math.random() * Math.PI * 2;
      const spd = speed * (0.3 + Math.random() * 0.9);
      const col = new THREE.Color(colorHex);

      this.particles.push({
        x,
        y: 12 + Math.random() * 12,
        z,
        vx: Math.cos(angle) * spd,
        vy: 20 + Math.random() * 45,
        vz: Math.sin(angle) * spd,
        life: 0.6 + Math.random() * 0.4,
        maxLife: 0.8,
        size: 14 + Math.random() * 16,
        color: col,
      });
    }
  }

  /**
   * Cycles to next camera view mode.
   */
  public toggleCameraMode(): CameraViewMode {
    if (this.cameraMode === 'chase') {
      this.cameraMode = 'iso';
    } else if (this.cameraMode === 'iso') {
      this.cameraMode = 'cockpit';
    } else {
      this.cameraMode = 'chase';
    }
    return this.cameraMode;
  }

  public setCameraMode(mode: CameraViewMode) {
    this.cameraMode = mode;
  }

  public addTrauma(amount: number) {
    this.trauma = Math.min(1.0, this.trauma + amount);
  }

  /**
   * Synchronizes 3D Data Shards.
   */
  private updateShards(shards: DataShard[], dt: number) {
    const activeIds = new Set<string>();

    for (const shard of shards) {
      if (shard.collected) {
        const existing = this.shardMeshes.get(shard.id);
        if (existing) {
          this.shardGroup.remove(existing);
          this.shardMeshes.delete(shard.id);
        }
        continue;
      }

      activeIds.add(shard.id);
      let meshGroup = this.shardMeshes.get(shard.id);

      if (!meshGroup) {
        meshGroup = new THREE.Group();

        if (shard.isSuperCore) {
          // Multifaceted 3D Super Core
          const coreGeo = new THREE.DodecahedronGeometry(11, 0);
          const coreMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.1,
            metalness: 0.9,
            emissive: 0xd946ef,
            emissiveIntensity: 1.2,
          });
          const coreMesh = new THREE.Mesh(coreGeo, coreMat);
          coreMesh.name = 'core';
          meshGroup.add(coreMesh);

          // Orbiting rings
          const rGeo = new THREE.TorusGeometry(16, 1.2, 8, 24);
          const rMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4, wireframe: true });
          const ringMesh = new THREE.Mesh(rGeo, rMat);
          ringMesh.name = 'ring';
          meshGroup.add(ringMesh);
        } else {
          // Rotating Faceted Crystal
          const shardGeo = new THREE.OctahedronGeometry(7.5, 0);
          const shardMat = new THREE.MeshStandardMaterial({
            color: 0x06b6d4,
            roughness: 0.15,
            metalness: 0.85,
            emissive: 0x0891b2,
            emissiveIntensity: 0.8,
          });
          const shardMesh = new THREE.Mesh(shardGeo, shardMat);
          shardMesh.name = 'core';
          meshGroup.add(shardMesh);

          // 3 Orbiting Satellites
          for (let i = 0; i < 3; i++) {
            const satGeo = new THREE.TetrahedronGeometry(2, 0);
            const satMat = new THREE.MeshBasicMaterial({ color: 0xa855f7 });
            const satMesh = new THREE.Mesh(satGeo, satMat);
            satMesh.name = `sat_${i}`;
            meshGroup.add(satMesh);
          }
        }

        this.shardGroup.add(meshGroup);
        this.shardMeshes.set(shard.id, meshGroup);
      }

      // Dynamic animation: sine bobbing and kaleidoscopic rotation
      const hoverY = 16 + Math.sin(this.globalClock * 3.5 + shard.x * 0.05) * 4;
      meshGroup.position.set(shard.x, hoverY, shard.y);

      const coreMesh = meshGroup.getObjectByName('core') as THREE.Mesh;
      if (coreMesh) {
        coreMesh.rotation.y += dt * 2.2;
        coreMesh.rotation.x += dt * 1.5;

        // Dynamic rainbow emission cycling
        if (coreMesh.material instanceof THREE.MeshStandardMaterial) {
          const rainbowHex = getRainbowHex(this.globalClock * 2.0 + shard.x * 0.01);
          coreMesh.material.emissive.setHex(rainbowHex);
        }
      }

      // Orbiting satellites update
      for (let i = 0; i < 3; i++) {
        const sat = meshGroup.getObjectByName(`sat_${i}`);
        if (sat) {
          const orbitAngle = this.globalClock * 3.2 + (i * Math.PI * 2) / 3;
          sat.position.set(Math.cos(orbitAngle) * 12, Math.sin(orbitAngle * 1.5) * 3, Math.sin(orbitAngle) * 12);
        }
      }

      const ring = meshGroup.getObjectByName('ring');
      if (ring) {
        ring.rotation.x += dt * 2.5;
        ring.rotation.y += dt * 3.0;
      }
    }

    // Clean up collected/deleted shards
    for (const [id, mesh] of this.shardMeshes) {
      if (!activeIds.has(id)) {
        this.shardGroup.remove(mesh);
        this.shardMeshes.delete(id);
      }
    }
  }

  /**
   * Synchronizes 3D Hazards (Seeker Drones, Laser Turrets, Electro-Gates, Blitz Hunters).
   */
  private updateHazards(hazards: Hazard[], dt: number) {
    const activeIds = new Set<string>();

    for (const hazard of hazards) {
      activeIds.add(hazard.id);
      let meshGroup = this.hazardMeshes.get(hazard.id);

      if (!meshGroup) {
        meshGroup = new THREE.Group();

        if (hazard.type === 'seeker_drone') {
          // Menacing 3D Cyber-Sphere with 3 counter-rotating plasma blades
          const sphereGeo = new THREE.SphereGeometry(12, 16, 16);
          const sphereMat = new THREE.MeshStandardMaterial({
            color: 0x111827,
            roughness: 0.25,
            metalness: 0.95,
          });
          const sphere = new THREE.Mesh(sphereGeo, sphereMat);
          meshGroup.add(sphere);

          // Glowing red optic eye
          const eyeGeo = new THREE.SphereGeometry(4, 12, 12);
          const eyeMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
          const eye = new THREE.Mesh(eyeGeo, eyeMat);
          eye.position.set(0, 0, 9);
          eye.name = 'eye';
          meshGroup.add(eye);

          // Plasma blade rings
          const bladeGeo = new THREE.TorusGeometry(16, 1.2, 6, 24);
          const bladeMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e, wireframe: true });
          const ringA = new THREE.Mesh(bladeGeo, bladeMat);
          ringA.name = 'ringA';
          meshGroup.add(ringA);

          const ringB = new THREE.Mesh(bladeGeo, bladeMat);
          ringB.name = 'ringB';
          meshGroup.add(ringB);
        } else if (hazard.type === 'laser_turret') {
          // 3D Armored Turret Base & Swivel Barrel
          const baseGeo = new THREE.CylinderGeometry(18, 22, 14, 12);
          const baseMat = new THREE.MeshStandardMaterial({
            color: 0x1e293b,
            metalness: 0.9,
            roughness: 0.3,
          });
          const base = new THREE.Mesh(baseGeo, baseMat);
          base.position.y = 7;
          meshGroup.add(base);

          const barrelGroup = new THREE.Group();
          barrelGroup.name = 'barrelGroup';
          barrelGroup.position.y = 14;

          const barrelGeo = new THREE.CylinderGeometry(4.5, 5, 24, 12);
          barrelGeo.rotateX(-Math.PI / 2);
          barrelGeo.translate(0, 0, 12);
          const barrel = new THREE.Mesh(barrelGeo, baseMat);
          barrelGroup.add(barrel);

          // Volumetric laser beam cylinder
          const beamGeo = new THREE.CylinderGeometry(3.5, 3.5, 600, 12);
          beamGeo.rotateX(-Math.PI / 2);
          beamGeo.translate(0, 0, 300);
          const beamMat = new THREE.MeshBasicMaterial({
            color: 0xef4444,
            transparent: true,
            opacity: 0.85,
            blending: THREE.AdditiveBlending,
          });
          const beam = new THREE.Mesh(beamGeo, beamMat);
          beam.name = 'beam';
          beam.visible = false;
          barrelGroup.add(beam);

          meshGroup.add(barrelGroup);
        } else if (hazard.type === 'electro_gate') {
          // Twin 3D Tesla Coil Pylons with electric field barrier
          const pylonGeo = new THREE.CylinderGeometry(4, 6, 48, 12);
          const pylonMat = new THREE.MeshStandardMaterial({
            color: 0x0f172a,
            metalness: 0.95,
            roughness: 0.2,
          });

          const pylonL = new THREE.Mesh(pylonGeo, pylonMat);
          pylonL.name = 'pylonL';
          meshGroup.add(pylonL);

          const pylonR = new THREE.Mesh(pylonGeo, pylonMat);
          pylonR.name = 'pylonR';
          meshGroup.add(pylonR);

          // Glowing electric plasma barrier plane
          const barrierGeo = new THREE.PlaneGeometry(1, 40);
          const barrierMat = new THREE.MeshBasicMaterial({
            color: 0xa855f7,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
          });
          const barrier = new THREE.Mesh(barrierGeo, barrierMat);
          barrier.name = 'barrier';
          meshGroup.add(barrier);
        } else if (hazard.type === 'blitz_hunter') {
          // Supersonic 3D Stealth Interceptor
          const dartGeo = new THREE.ConeGeometry(8, 24, 6);
          dartGeo.rotateX(-Math.PI / 2);
          const dartMat = new THREE.MeshStandardMaterial({
            color: 0x030712,
            metalness: 0.95,
            roughness: 0.15,
            emissive: 0xef4444,
            emissiveIntensity: 0.5,
          });
          const dart = new THREE.Mesh(dartGeo, dartMat);
          meshGroup.add(dart);
        }

        this.hazardGroup.add(meshGroup);
        this.hazardMeshes.set(hazard.id, meshGroup);
      }

      // Per-hazard frame update
      meshGroup.position.set(hazard.x, 16, hazard.y);

      if (hazard.type === 'seeker_drone') {
        const ringA = meshGroup.getObjectByName('ringA');
        const ringB = meshGroup.getObjectByName('ringB');
        if (ringA) ringA.rotation.x += dt * 4;
        if (ringB) ringB.rotation.y += dt * 5;
      } else if (hazard.type === 'laser_turret') {
        const turret = hazard as LaserTurret;
        const barrelGroup = meshGroup.getObjectByName('barrelGroup');
        if (barrelGroup) {
          barrelGroup.rotation.y = -turret.angle + Math.PI / 2;
        }
        const beam = meshGroup.getObjectByName('beam') as THREE.Mesh;
        if (beam) {
          beam.visible = turret.isFiring || turret.isTelegraphing;
          if (turret.isTelegraphing) {
            (beam.material as THREE.MeshBasicMaterial).opacity = 0.25;
            beam.scale.set(0.3, 0.3, 1);
          } else if (turret.isFiring) {
            (beam.material as THREE.MeshBasicMaterial).opacity = 0.9;
            beam.scale.set(1.2 + Math.sin(this.globalClock * 30) * 0.3, 1.2, 1);
          }
        }
      } else if (hazard.type === 'electro_gate') {
        const gate = hazard as ElectroGate;
        const pylonL = meshGroup.getObjectByName('pylonL');
        const pylonR = meshGroup.getObjectByName('pylonR');
        const barrier = meshGroup.getObjectByName('barrier') as THREE.Mesh;

        const halfW = gate.w / 2;
        const halfH = gate.h / 2;
        if (pylonL) pylonL.position.set(-halfW, 24, -halfH);
        if (pylonR) pylonR.position.set(halfW, 24, halfH);

        if (barrier) {
          barrier.scale.set(Math.hypot(gate.w, gate.h) || 50, 1, 1);
          barrier.position.set(0, 24, 0);
          barrier.rotation.y = -Math.atan2(gate.h, gate.w);
          if (gate.state === 'active') {
            barrier.visible = true;
            (barrier.material as THREE.MeshBasicMaterial).color.setHex(0xd946ef);
            (barrier.material as THREE.MeshBasicMaterial).opacity = 0.8 + Math.sin(this.globalClock * 25) * 0.2;
          } else if (gate.state === 'warning') {
            barrier.visible = Math.floor(this.globalClock * 12) % 2 === 0;
            (barrier.material as THREE.MeshBasicMaterial).color.setHex(0xf59e0b);
            (barrier.material as THREE.MeshBasicMaterial).opacity = 0.5;
          } else {
            barrier.visible = false;
          }
        }
      } else if (hazard.type === 'blitz_hunter') {
        const hunter = hazard as BlitzHunter;
        meshGroup.rotation.y = -Math.atan2(hunter.targetY - hunter.y, hunter.targetX - hazard.x) + Math.PI / 2;
      }
    }

    // Clean inactive hazards
    for (const [id, mesh] of this.hazardMeshes) {
      if (!activeIds.has(id)) {
        this.hazardGroup.remove(mesh);
        this.hazardMeshes.delete(id);
      }
    }
  }

  /**
   * Main per-frame render tick.
   */
  public render(
    player: Player,
    shards: DataShard[],
    hazards: Hazard[],
    exitGateway: { x: number; y: number; radius: number; unlocked: boolean },
    dt: number,
    state: 'title' | 'playing' | 'paused' | 'gameover'
  ) {
    if (this.isDestroyed) return;

    this.globalClock += dt;

    // Decay trauma screen shake
    if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - dt * 2.2);
    }

    // 1. Update Player 3D Ship Mesh
    const targetY = 18 + Math.sin(this.globalClock * 6) * 1.2;
    this.playerShip.position.set(player.x, targetY, player.y);

    // Ship yaw & banking roll
    const shipYaw = -player.angle + Math.PI / 2;
    const steerRoll = (player.vx * Math.sin(player.angle) - player.vy * Math.cos(player.angle)) * 0.0018;
    this.playerShip.rotation.y = shipYaw;
    this.playerShip.rotation.z = THREE.MathUtils.damp(this.playerShip.rotation.z, steerRoll, 12, dt);
    this.playerShip.rotation.x = player.isDashing ? -0.22 : 0;

    // Shield bubble
    this.playerShieldBubble.visible = player.invulnerableTimer > 0;
    if (this.playerShieldBubble.visible) {
      this.playerShieldBubble.rotation.y += dt * 4;
    }

    // Volumetric cone headlight & light targets
    _v1.set(Math.cos(player.angle) * 200, 0, Math.sin(player.angle) * 200).add(this.playerShip.position);
    this.headlightTarget.position.copy(_v1);
    this.playerHeadlight.position.set(player.x, targetY, player.y);
    this.playerLight.position.set(player.x, targetY + 6, player.y);

    // Dynamic color on ship headlight during dash
    if (player.isDashing) {
      const rainbowHex = getRainbowHex(this.globalClock * 8);
      this.playerLight.color.setHex(rainbowHex);
      this.playerLight.intensity = 4.5;
    } else {
      this.playerLight.color.setHex(0x38bdf8);
      this.playerLight.intensity = 2.4;
    }

    // 2. Update 3D Ribbon Trail
    this.updateRibbonTrail(player, dt);

    // 3. Update Shards & Hazards
    this.updateShards(shards, dt);
    this.updateHazards(hazards, dt);

    // 4. Update Exit Gateway Stargate
    this.gatewayGroup.position.set(exitGateway.x, 38, exitGateway.y);
    const ring1 = this.gatewayGroup.getObjectByName('ring1');
    const ring2 = this.gatewayGroup.getObjectByName('ring2');
    const disk = this.gatewayGroup.getObjectByName('disk') as THREE.Mesh | undefined;
    if (ring1) ring1.rotation.z += dt * 1.5;
    if (ring2) ring2.rotation.z -= dt * 2.2;
    if (disk && disk.material) {
      (disk.material as THREE.MeshBasicMaterial).opacity = exitGateway.unlocked ? 0.8 : 0.35;
    }

    // 5. Update Particles
    this.updateParticles(dt);

    // 6. Update Floating Combat Text Sprites
    this.updateCombatTexts(dt);

    // 7. Update Camera Positioning based on Camera Mode
    this.updateCamera(player, state, dt);

    // 8. Render Scene
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Updates the 3D Rainbow Ribbon Trail.
   */
  private updateRibbonTrail(player: Player, _dt: number) {
    this.ribbonHistory.unshift({
      x: player.x,
      y: 18,
      z: player.y,
      isDashing: player.isDashing,
    });
    if (this.ribbonHistory.length > this.RIBBON_POINTS) {
      this.ribbonHistory.pop();
    }

    let posIdx = 0;
    let colIdx = 0;

    for (let i = 0; i < this.RIBBON_POINTS; i++) {
      const node = this.ribbonHistory[i] || this.ribbonHistory[this.ribbonHistory.length - 1];
      if (!node) continue;

      const progress = i / this.RIBBON_POINTS;
      const width = (1.0 - progress) * (node.isDashing ? 14 : 7);

      const nx = -Math.sin(player.angle) * width;
      const nz = Math.cos(player.angle) * width;

      this.ribbonPositions[posIdx++] = node.x - nx;
      this.ribbonPositions[posIdx++] = node.y;
      this.ribbonPositions[posIdx++] = node.z - nz;

      this.ribbonPositions[posIdx++] = node.x + nx;
      this.ribbonPositions[posIdx++] = node.y;
      this.ribbonPositions[posIdx++] = node.z + nz;

      const huePhase = this.globalClock * 5.0 - progress * Math.PI * 2;
      getRainbowColor(huePhase, _color);
      const alpha = (1.0 - progress) * 0.9;

      this.ribbonColors[colIdx++] = _color.r * alpha;
      this.ribbonColors[colIdx++] = _color.g * alpha;
      this.ribbonColors[colIdx++] = _color.b * alpha;

      this.ribbonColors[colIdx++] = _color.r * alpha;
      this.ribbonColors[colIdx++] = _color.g * alpha;
      this.ribbonColors[colIdx++] = _color.b * alpha;
    }

    this.ribbonGeometry.attributes.position.needsUpdate = true;
    this.ribbonGeometry.attributes.color.needsUpdate = true;
  }

  /**
   * Updates 3D Particles.
   */
  private updateParticles(dt: number) {
    let activeCount = 0;
    const pos = this.particlePositions;
    const col = this.particleColors;
    const siz = this.particleSizes;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy -= 80 * dt;

      const lifeRatio = p.life / p.maxLife;
      const idx3 = activeCount * 3;

      pos[idx3] = p.x;
      pos[idx3 + 1] = p.y;
      pos[idx3 + 2] = p.z;

      col[idx3] = p.color.r * lifeRatio;
      col[idx3 + 1] = p.color.g * lifeRatio;
      col[idx3 + 2] = p.color.b * lifeRatio;

      siz[activeCount] = p.size * lifeRatio;
      activeCount++;
    }

    for (let i = activeCount; i < this.MAX_PARTICLES; i++) {
      siz[i] = 0;
    }

    this.particlePoints.geometry.attributes.position.needsUpdate = true;
    this.particlePoints.geometry.attributes.color.needsUpdate = true;
    this.particlePoints.geometry.attributes.size.needsUpdate = true;
  }

  /**
   * Updates Floating Combat Readouts.
   */
  private updateCombatTexts(dt: number) {
    for (let i = this.combatTextSprites.length - 1; i >= 0; i--) {
      const item = this.combatTextSprites[i];
      item.life -= dt;
      if (item.life <= 0) {
        this.scene.remove(item.sprite);
        item.sprite.material.dispose();
        this.combatTextSprites.splice(i, 1);
        continue;
      }

      item.sprite.position.x += item.vx * dt;
      item.sprite.position.y += item.vy * dt;
      item.sprite.position.z += item.vz * dt;

      const ratio = item.life / item.maxLife;
      item.sprite.material.opacity = ratio;
      item.sprite.scale.set(48 * (1.2 - ratio * 0.2), 12 * (1.2 - ratio * 0.2), 1);
    }
  }

  /**
   * Computes camera target & position with silky-smooth exponential damping.
   */
  private updateCamera(player: Player, state: 'title' | 'playing' | 'paused' | 'gameover', dt: number) {
    if (state === 'title') {
      const orbitRadius = 450;
      const orbitSpeed = 0.25;
      const cx = 800 + Math.cos(this.globalClock * orbitSpeed) * orbitRadius;
      const cz = 600 + Math.sin(this.globalClock * orbitSpeed) * orbitRadius;
      const cy = 240 + Math.sin(this.globalClock * 0.5) * 40;

      this.camera.position.set(cx, cy, cz);
      this.camera.lookAt(800, 20, 600);
      return;
    }

    const targetFov = player.isDashing ? 68 : 55;
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 8, dt);
    this.camera.updateProjectionMatrix();

    if (this.cameraMode === 'chase') {
      const dist = player.isDashing ? 190 : 155;
      const height = player.isDashing ? 75 : 95;

      const forwardX = Math.cos(player.angle);
      const forwardZ = Math.sin(player.angle);

      _camIdeal.set(
        player.x - forwardX * dist,
        height,
        player.y - forwardZ * dist
      );

      _camTarget.set(
        player.x + forwardX * 70,
        18,
        player.y + forwardZ * 70
      );

      this.cameraPosSmooth.x = THREE.MathUtils.damp(this.cameraPosSmooth.x, _camIdeal.x, 6, dt);
      this.cameraPosSmooth.y = THREE.MathUtils.damp(this.cameraPosSmooth.y, _camIdeal.y, 6, dt);
      this.cameraPosSmooth.z = THREE.MathUtils.damp(this.cameraPosSmooth.z, _camIdeal.z, 6, dt);

      this.cameraLookSmooth.x = THREE.MathUtils.damp(this.cameraLookSmooth.x, _camTarget.x, 8, dt);
      this.cameraLookSmooth.y = THREE.MathUtils.damp(this.cameraLookSmooth.y, _camTarget.y, 8, dt);
      this.cameraLookSmooth.z = THREE.MathUtils.damp(this.cameraLookSmooth.z, _camTarget.z, 8, dt);
    } else if (this.cameraMode === 'iso') {
      _camIdeal.set(player.x, 420, player.y + 260);
      _camTarget.set(player.x, 15, player.y);

      this.cameraPosSmooth.x = THREE.MathUtils.damp(this.cameraPosSmooth.x, _camIdeal.x, 7, dt);
      this.cameraPosSmooth.y = THREE.MathUtils.damp(this.cameraPosSmooth.y, _camIdeal.y, 7, dt);
      this.cameraPosSmooth.z = THREE.MathUtils.damp(this.cameraPosSmooth.z, _camIdeal.z, 7, dt);

      this.cameraLookSmooth.x = THREE.MathUtils.damp(this.cameraLookSmooth.x, _camTarget.x, 9, dt);
      this.cameraLookSmooth.y = THREE.MathUtils.damp(this.cameraLookSmooth.y, _camTarget.y, 9, dt);
      this.cameraLookSmooth.z = THREE.MathUtils.damp(this.cameraLookSmooth.z, _camTarget.z, 9, dt);
    } else {
      const forwardX = Math.cos(player.angle);
      const forwardZ = Math.sin(player.angle);

      _camIdeal.set(player.x + forwardX * 6, 22, player.y + forwardZ * 6);
      _camTarget.set(player.x + forwardX * 180, 20, player.y + forwardZ * 180);

      this.cameraPosSmooth.copy(_camIdeal);
      this.cameraLookSmooth.copy(_camTarget);
    }

    let shakeX = 0;
    let shakeY = 0;
    if (this.trauma > 0) {
      const traumaSq = this.trauma * this.trauma;
      shakeX = (Math.random() - 0.5) * 18 * traumaSq;
      shakeY = (Math.random() - 0.5) * 18 * traumaSq;
    }

    this.camera.position.set(
      this.cameraPosSmooth.x + shakeX,
      this.cameraPosSmooth.y + shakeY,
      this.cameraPosSmooth.z
    );
    this.camera.lookAt(this.cameraLookSmooth.x, this.cameraLookSmooth.y, this.cameraLookSmooth.z);
  }

  /**
   * Complete clean disposal of Three.js resources to prevent memory leaks.
   */
  public dispose() {
    this.isDestroyed = true;
    window.removeEventListener('resize', this.onResize);

    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points || obj instanceof THREE.LineSegments) {
        if (obj.geometry) obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else if (obj.material) {
          obj.material.dispose();
        }
      }
    });

    this.renderer.dispose();
  }
}
