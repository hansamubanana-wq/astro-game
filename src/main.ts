import './style.css'
import * as THREE from 'three'
import nipplejs from 'nipplejs'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- ゲーム状態 ---
let currentLevel = 1;
let isGameActive = false;
let coinCount = 0;
let isSpinning = false; 

// --- 演出用変数 ---
let shakeIntensity = 0; 
let hitStopTimer = 0;   
let runDustTimer = 0;   

// --- 1. シーン初期化 ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(30, 50, 30);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.camera.left = -100;
dirLight.shadow.camera.right = 100;
dirLight.shadow.camera.top = 100;
dirLight.shadow.camera.bottom = -100;
scene.add(dirLight);

const textureLoader = new THREE.TextureLoader();
const skyGeo = new THREE.SphereGeometry(500, 32, 32);
const skyMat = new THREE.MeshBasicMaterial({
  map: textureLoader.load('https://threejs.org/examples/textures/2294472375_24a3b8ef46_o.jpg'),
  side: THREE.BackSide
});
const sky = new THREE.Mesh(skyGeo, skyMat);
scene.add(sky);

const crateTexture = textureLoader.load('https://threejs.org/examples/textures/crate.gif');
crateTexture.colorSpace = THREE.SRGBColorSpace;
const stoneTexture = textureLoader.load('https://threejs.org/examples/textures/uv_grid_opengl.jpg');
stoneTexture.wrapS = THREE.RepeatWrapping;
stoneTexture.wrapT = THREE.RepeatWrapping;

// --- パーティクルシステム ---
interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
}
let particles: Particle[] = [];
const particleGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
const particleMatCoin = new THREE.MeshBasicMaterial({ color: 0xffff00 });
const particleMatExplosion = new THREE.MeshBasicMaterial({ color: 0xff4400 });
const particleMatDust = new THREE.MeshBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.6 });
const particleMatShockwave = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.8 });

function spawnParticles(pos: THREE.Vector3, count: number, type: 'coin'|'explosion'|'dust'|'shockwave') {
  let mat = particleMatCoin;
  let speed = 0.1;
  let life = 0.5;

  if (type === 'explosion') { mat = particleMatExplosion; speed = 0.3; life = 0.8; }
  else if (type === 'dust') { mat = particleMatDust; speed = 0.05; life = 0.4; }
  else if (type === 'shockwave') { mat = particleMatShockwave; speed = 0.4; life = 0.5; }

  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(particleGeo, mat.clone());
    mesh.position.copy(pos).add(new THREE.Vector3((Math.random()-0.5)*0.5, (Math.random()-0.5)*0.5, (Math.random()-0.5)*0.5));
    const velocity = new THREE.Vector3(
      (Math.random()-0.5)*speed,
      (Math.random()-0.5)*speed + (type==='dust'?0.05:0.2), 
      (Math.random()-0.5)*speed
    );
    if (type === 'shockwave') {
      // 地面を這う衝撃波
      velocity.y = 0;
      velocity.x *= 2;
      velocity.z *= 2;
    }
    scene.add(mesh);
    particles.push({ mesh, velocity, life, maxLife: life });
  }
}

function addShake(amount: number) { shakeIntensity = amount; }
function vibrate(ms: number) { if (navigator.vibrate) navigator.vibrate(ms); }

// --- オブジェクト管理 ---
interface MovingPlatform {
  mesh: THREE.Mesh;
  basePos: THREE.Vector3;
  axis: 'x' | 'y' | 'z';
  range: number;
  speed: number;
  offset: number;
}
interface Enemy {
  mesh: THREE.Group; 
  mixer: THREE.AnimationMixer; 
  type: 'patrol' | 'chaser' | 'boss'; 
  speed: number;
  dead: boolean;
  deadTimer: number; 
  velocityY: number;
  patrolAxis?: 'x' | 'z'; 
  patrolDir?: number;
  basePos: THREE.Vector3;
  // ★ボス用
  hp?: number;
  maxHp?: number;
  bossState?: 'chase' | 'prepare' | 'attack' | 'stun';
  stateTimer?: number;
}

let movingPlatforms: MovingPlatform[] = [];
let staticPlatforms: THREE.Mesh[] = [];
let enemies: Enemy[] = [];
let coins: THREE.Mesh[] = [];
let goalObj: THREE.Mesh | undefined;
let goalPosition = new THREE.Vector3();

let enemyResource: any = null;

// --- 作成関数 ---
function clearStage() {
  staticPlatforms.forEach(p => scene.remove(p));
  movingPlatforms.forEach(p => scene.remove(p.mesh));
  enemies.forEach(e => scene.remove(e.mesh));
  coins.forEach(c => scene.remove(c));
  particles.forEach(p => scene.remove(p.mesh));
  if (goalObj) scene.remove(goalObj);
  
  staticPlatforms = [];
  movingPlatforms = [];
  enemies = [];
  coins = [];
  particles = [];
  
  // ボスUI隠す
  document.getElementById('boss-hud')!.style.display = 'none';
}

function createPlatform(x: number, y: number, z: number, w: number, h: number, d: number, type: 'wood'|'stone' = 'wood') {
  const geo = new THREE.BoxGeometry(w, h, d);
  let mat;
  if (type === 'wood') mat = new THREE.MeshStandardMaterial({ map: crateTexture, roughness: 0.8 });
  else mat = new THREE.MeshStandardMaterial({ map: stoneTexture, roughness: 0.5, color: 0x888888 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y - h / 2, z); 
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  staticPlatforms.push(mesh);
}

function createMovingPlatform(x: number, y: number, z: number, w: number, h: number, d: number, axis: 'x'|'y'|'z', range: number, speed: number) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshStandardMaterial({ map: crateTexture, color: 0xffffaa, roughness: 0.8 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y - h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  movingPlatforms.push({ mesh, basePos: new THREE.Vector3(x, y - h/2, z), axis, range, speed, offset: 0 });
}

function spawnEnemy(x: number, y: number, z: number, type: 'patrol'|'chaser'|'boss', axis: 'x'|'z'|undefined, speed: number) {
  if (!enemyResource) return;
  const enemyMesh = enemyResource.scene.clone();
  enemyMesh.position.set(x, y, z);
  
  // サイズと影
  if (type === 'boss') {
    enemyMesh.scale.set(1.2, 1.2, 1.2); // 3倍 (元の0.4 * 3 = 1.2)
  } else {
    enemyMesh.scale.set(0.4, 0.4, 0.4); 
  }
  
  enemyMesh.traverse((child: any) => { if (child.isMesh) child.castShadow = true; });
  scene.add(enemyMesh);

  const mixer = new THREE.AnimationMixer(enemyMesh);
  let actionName = 'Walking';
  if (type === 'chaser') actionName = 'Running';
  if (type === 'boss') actionName = 'Walking'; // ボスは歩いて迫る

  const clip = THREE.AnimationClip.findByName(enemyResource.animations, actionName);
  if (clip) mixer.clipAction(clip).play();

  enemies.push({ 
    mesh: enemyMesh, mixer: mixer, type: type, speed: speed, 
    dead: false, deadTimer: 0, velocityY: 0, 
    patrolAxis: axis, patrolDir: 1, basePos: new THREE.Vector3(x, y, z),
    // ボス初期化
    hp: 3, maxHp: 3, bossState: 'chase', stateTimer: 0
  });

  if (type === 'boss') {
    updateBossUI(3, 3);
    document.getElementById('boss-hud')!.style.display = 'block';
  }
}

function createPatrolEnemy(x: number, y: number, z: number, axis: 'x'|'z', speed: number) { spawnEnemy(x, y, z, 'patrol', axis, speed); }
function createChaserEnemy(x: number, y: number, z: number, speed: number) { spawnEnemy(x, y, z, 'chaser', undefined, speed); }
function createBoss(x: number, y: number, z: number) { spawnEnemy(x, y, z, 'boss', undefined, 1.5); }

function createCoin(x: number, y: number, z: number) {
  const geo = new THREE.CylinderGeometry(0.3, 0.3, 0.05, 16);
  const mat = new THREE.MeshPhongMaterial({ color: 0xffd700, shininess: 100, emissive: 0xaa8800 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.rotation.z = Math.PI / 2; 
  mesh.castShadow = true;
  scene.add(mesh);
  coins.push(mesh);
}

function createGoal(x: number, y: number, z: number) {
  const geo = new THREE.OctahedronGeometry(1, 0);
  const mat = new THREE.MeshPhongMaterial({ color: 0x00ffff, shininess: 100, emissive: 0x0044aa });
  goalObj = new THREE.Mesh(geo, mat);
  goalObj.position.set(x, y, z);
  goalObj.castShadow = true;
  scene.add(goalObj);
  goalPosition.set(x, y, z);
}

function updateBossUI(hp: number, max: number) {
  const fill = document.getElementById('boss-hp-fill');
  if (fill) fill.style.width = `${(hp / max) * 100}%`;
}

// --- ステージデータ ---
function loadLevel(level: number) {
  clearStage();
  player.position.set(0, 2, 0);
  player.rotation.set(0, 0, 0);
  velocityY = 0;
  
  if (!enemyResource) { setTimeout(() => loadLevel(level), 500); return; }

  if (level === 1) {
    showStory("【WORLD 1: はじまりの広場】<br>まずは基本のおさらいだ。<br>スピンで敵を倒して進め！");
    createPlatform(0, 0, 0, 10, 2, 10, 'stone');
    createPlatform(0, 0, -15, 8, 2, 8, 'wood');
    createChaserEnemy(0, 1.5, -15, 2.0); 
    createPlatform(12, 1, 0, 6, 2, 6, 'wood');
    createCoin(12, 2.5, 0); createCoin(14, 2.5, 0); createCoin(10, 2.5, 0);
    createMovingPlatform(6, 0.5, 0, 3, 0.5, 3, 'x', 2, 1);
    createPlatform(-12, 1, -5, 6, 2, 10, 'stone');
    createPatrolEnemy(-12, 2.4, -5, 'z', 2.0);
    createCoin(-12, 2.5, -9);
    createMovingPlatform(0, 2, -25, 4, 0.5, 4, 'z', 3, 1.5);
    createPlatform(0, 3, -35, 8, 2, 8, 'stone');
    createGoal(0, 4.5, -35);
  
  } else if (level === 2) {
    showStory("【WORLD 2: スカイ・アスレチック】<br>落ちたら即死の危険地帯。<br>慎重に進め！");
    createPlatform(0, 0, 0, 6, 2, 6, 'stone');
    createPlatform(8, 1, -8, 5, 1, 5, 'wood');
    createChaserEnemy(8, 1.5, -8, 3.5); createCoin(8, 2.5, -8);
    createPlatform(-8, 1, -8, 5, 1, 5, 'wood');
    createPatrolEnemy(-8, 1.9, -8, 'x', 2.0); createCoin(-8, 2.5, -8);
    createPlatform(0, 2, -16, 10, 1, 6, 'stone');
    createChaserEnemy(-3, 2.5, -16, 2.0);
    createChaserEnemy(3, 2.5, -16, 2.0); 
    createMovingPlatform(0, 2, -24, 3, 0.5, 3, 'y', 3, 1); 
    createPlatform(0, 6, -32, 12, 2, 12, 'stone'); 
    createPatrolEnemy(0, 7.4, -32, 'x', 3.0);
    createPatrolEnemy(0, 7.4, -32, 'z', 3.0); 
    createCoin(0, 8, -32); createCoin(4, 8, -32); createCoin(-4, 8, -32);
    createGoal(0, 7.5, -40); 
  
  } else if (level === 3) {
    showStory("【FINAL BOSS: 巨大ロボット】<br>ボスが現れた！<br>ジャンプ衝撃波を避けて、隙を見て攻撃だ！");
    createPlatform(0, 0, 0, 10, 2, 10, 'stone');
    createPlatform(0, 0, -15, 20, 2, 20, 'stone'); // ボスエリア
    createBoss(0, 1.5, -15);
    createGoal(0, 1.5, -30); // ボス裏にゴール
    
    // 回復コイン
    createCoin(-5, 1.5, -15);
    createCoin(5, 1.5, -15);
  } else {
    showStory(`【ALL CLEAR】<br>世界は救われた！<br>獲得コイン: ${coinCount}枚`);
    isGameActive = false;
    goalObj = undefined;
  }
}

// --- プレイヤー ---
const playerGeometry = new THREE.BoxGeometry(0.5, 1, 0.5); 
const playerMaterial = new THREE.MeshBasicMaterial({ visible: false });
const player = new THREE.Mesh(playerGeometry, playerMaterial);
scene.add(player);

const spinEffectGeo = new THREE.CylinderGeometry(1, 0.1, 1.5, 16, 2, true);
const spinEffectMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
const spinMesh = new THREE.Mesh(spinEffectGeo, spinEffectMat);
scene.add(spinMesh);

let model: THREE.Group | undefined;
let mixer: THREE.AnimationMixer | undefined;
let actions: { [key: string]: THREE.AnimationAction } = {};
let activeAction: THREE.AnimationAction | undefined;

const loader = new GLTFLoader();
loader.load('https://threejs.org/examples/models/gltf/Soldier.glb', (gltf) => {
  model = gltf.scene;
  model.scale.set(1.5, 1.5, 1.5); 
  model.traverse((child) => { if ((child as THREE.Mesh).isMesh) child.castShadow = true; });
  scene.add(model);
  mixer = new THREE.AnimationMixer(model);
  ['Idle', 'Run', 'Walk'].forEach(name => {
    const clip = THREE.AnimationClip.findByName(gltf.animations, name);
    if (clip && mixer) actions[name] = mixer.clipAction(clip);
  });
  if (actions['Idle']) { activeAction = actions['Idle']; activeAction.play(); }

  loader.load('https://threejs.org/examples/models/gltf/RobotExpressive/RobotExpressive.glb', (robotGltf) => {
    enemyResource = robotGltf; 
    loadLevel(currentLevel);
  });
});

function fadeToAction(name: string, duration: number) {
  if (!actions[name]) { if (name === 'Jump') name = 'Run'; else if (name === 'Spin') name = 'Run'; else return; }
  if (activeAction === actions[name]) return;
  const previousAction = activeAction;
  activeAction = actions[name];
  if (previousAction) previousAction.fadeOut(duration);
  activeAction.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(duration).play();
}

function playEnemyAction(enemy: Enemy, actionName: string, duration: number = 0.2) {
  const clip = THREE.AnimationClip.findByName(enemyResource.animations, actionName);
  if (clip) {
    const action = enemy.mixer.clipAction(clip);
    action.reset().fadeIn(duration).play();
    // 他のアクションを止める簡易処理は省略（重ねがけ許容）
  }
}

// --- UI ---
const storyBox = document.getElementById('story-box') as HTMLElement;
const storyText = document.getElementById('story-text') as HTMLElement;
const nextBtn = document.getElementById('next-btn') as HTMLElement;
const messageContainer = document.getElementById('message-container') as HTMLElement;
const bigMessage = document.getElementById('big-message') as HTMLElement;
const retryBtn = document.getElementById('retry-btn') as HTMLElement;
const coinCounter = document.getElementById('coin-counter') as HTMLElement;

function showStory(text: string) { isGameActive = false; storyBox.style.display = 'flex'; storyText.innerHTML = text; }
function updateCoinDisplay() { coinCounter.innerText = `🪙 ${coinCount}`; }

nextBtn.addEventListener('click', () => { storyBox.style.display = 'none'; isGameActive = true; });
retryBtn.addEventListener('click', () => {
  messageContainer.style.display = 'none';
  if (retryBtn.innerText === "RETRY") loadLevel(currentLevel);
  else { currentLevel++; loadLevel(currentLevel); }
});

const input = { x: 0, z: 0 };
const keys: { [key: string]: boolean } = { w: false, a: false, s: false, d: false };
let jumpPressed = false;

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') jumpPressed = true;
  if (e.code === 'KeyK') attack(true);
  keys[e.key.toLowerCase()] = true;
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') jumpPressed = false;
  if (e.code === 'KeyK') attack(false);
  keys[e.key.toLowerCase()] = false;
});

function attack(pressed: boolean) {
  if (pressed && !isSpinning) {
    isSpinning = true;
    spinEffectMat.opacity = 0.6;
    addShake(0.2); 
    vibrate(30);   
    setTimeout(() => { isSpinning = false; spinEffectMat.opacity = 0.0; }, 500);
  }
}

const jumpBtn = document.getElementById('jump-btn');
if (jumpBtn) {
  jumpBtn.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); jumpPressed = true; }, { passive: false });
  jumpBtn.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); jumpPressed = false; }, { passive: false });
  jumpBtn.addEventListener('mousedown', () => jumpPressed = true);
  jumpBtn.addEventListener('mouseup', () => jumpPressed = false);
}
const attackBtn = document.getElementById('attack-btn');
if (attackBtn) {
  attackBtn.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); attack(true); }, { passive: false });
  attackBtn.addEventListener('mousedown', () => attack(true));
}

const joystickManager = nipplejs.create({ zone: document.getElementById('joystick-zone') as HTMLElement, mode: 'static', position: { left: '50%', top: '80%' }, color: 'white', size: 100 });
joystickManager.on('move', (_evt, data) => { if (data && data.vector) { input.x = data.vector.x; input.z = -data.vector.y; }});
joystickManager.on('end', () => { input.x = 0; input.z = 0; });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function isSafePosition(x: number, z: number): boolean {
  for (const p of staticPlatforms) {
    const w = p.geometry.parameters.width;
    const d = p.geometry.parameters.depth;
    if (x >= p.position.x - w/2 && x <= p.position.x + w/2 && z >= p.position.z - d/2 && z <= p.position.z + d/2) return true;
  }
  for (const mp of movingPlatforms) {
    const w = mp.mesh.geometry.parameters.width;
    const d = mp.mesh.geometry.parameters.depth;
    if (x >= mp.mesh.position.x - w/2 && x <= mp.mesh.position.x + w/2 && z >= mp.mesh.position.z - d/2 && z <= mp.mesh.position.z + d/2) return true;
  }
  return false;
}

// --- ゲームループ ---
const speed = 0.15;
const gravity = 0.015;
const jumpPower = 0.4;
let velocityY = 0;
let isGrounded = true;

function update(time: number, delta: number) {
  if (!isGameActive) return;
  if (hitStopTimer > 0) { hitStopTimer -= delta; return; }

  const timeScale = delta * 60; 

  if (shakeIntensity > 0) {
    camera.position.x += (Math.random() - 0.5) * shakeIntensity;
    camera.position.y += (Math.random() - 0.5) * shakeIntensity;
    camera.position.z += (Math.random() - 0.5) * shakeIntensity;
    shakeIntensity *= 0.9;
    if (shakeIntensity < 0.01) shakeIntensity = 0;
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= delta;
    if (p.life <= 0) { scene.remove(p.mesh); particles.splice(i, 1); continue; }
    p.mesh.position.add(p.velocity.clone().multiplyScalar(timeScale));
    p.mesh.rotation.x += 0.1; p.mesh.rotation.y += 0.1;
    (p.mesh.material as THREE.Material).opacity = p.life / p.maxLife;
  }

  if (goalObj) { goalObj.rotation.y += 0.02 * timeScale; goalObj.rotation.x += 0.01 * timeScale; }

  for (let i = coins.length - 1; i >= 0; i--) {
    const c = coins[i];
    c.rotation.y += 0.05 * timeScale;
    const dx = player.position.x - c.position.x;
    const dz = player.position.z - c.position.z;
    if (Math.sqrt(dx*dx + dz*dz) < 1.5 && Math.abs(player.position.y - c.position.y) < 2.0) {
      spawnParticles(c.position, 8, 'coin'); vibrate(50);
      scene.remove(c); coins.splice(i, 1); coinCount++; updateCoinDisplay();
    }
  }

  movingPlatforms.forEach(mp => {
    const move = Math.sin(time * mp.speed + mp.offset) * mp.range;
    if (mp.axis === 'x') mp.mesh.position.x = mp.basePos.x + move;
    else if (mp.axis === 'y') mp.mesh.position.y = mp.basePos.y + move;
    else mp.mesh.position.z = mp.basePos.z + move;
  });

  // --- 敵の処理（ボスロジック含む） ---
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    if (enemy.mixer) enemy.mixer.update(delta);

    if (enemy.dead) {
      enemy.deadTimer += delta;
      const clip = THREE.AnimationClip.findByName(enemyResource.animations, 'Death');
      if (clip) { const action = enemy.mixer.clipAction(clip); action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play(); }
      if (enemy.deadTimer > 1.5) { scene.remove(enemy.mesh); enemies.splice(i, 1); }
      continue;
    }

    // 地面判定
    let enemyGrounded = false;
    let groundY = -999;
    for (const p of staticPlatforms) {
      if (checkOnPlatform(enemy.mesh, p)) { const top = p.position.y + p.geometry.parameters.height/2; if (top > groundY) groundY = top; }
    }
    for (const mp of movingPlatforms) {
      if (checkOnPlatform(enemy.mesh, mp.mesh)) { const top = mp.mesh.position.y + mp.mesh.geometry.parameters.height/2; if (top > groundY) groundY = top; }
    }

    if (enemy.mesh.position.y <= groundY + 0.1 && enemy.velocityY <= 0 && groundY > -100) {
      enemy.mesh.position.y = groundY; enemy.velocityY = 0; enemyGrounded = true;
    } else {
      enemyGrounded = false; enemy.velocityY -= gravity * timeScale; enemy.mesh.position.y += enemy.velocityY * timeScale;
    }

    // AI
    if (enemyGrounded) {
      if (enemy.type === 'patrol') {
        const moveDist = enemy.speed * 0.03 * timeScale;
        const dir = enemy.patrolDir || 1;
        let nextX = enemy.mesh.position.x; let nextZ = enemy.mesh.position.z;
        if (enemy.patrolAxis === 'x') nextX += moveDist * dir; else nextZ += moveDist * dir;
        if (isSafePosition(nextX, nextZ)) {
          enemy.mesh.position.x = nextX; enemy.mesh.position.z = nextZ;
          enemy.mesh.lookAt(new THREE.Vector3(nextX, enemy.mesh.position.y, nextZ));
        } else enemy.patrolDir = dir * -1;
      
      } else if (enemy.type === 'chaser') {
        const dist = player.position.distanceTo(enemy.mesh.position);
        if (dist < 15 && dist > 0.5) {
          const direction = new THREE.Vector3().subVectors(player.position, enemy.mesh.position).normalize();
          direction.y = 0; direction.normalize();
          const moveStep = direction.multiplyScalar(enemy.speed * 0.03 * timeScale);
          const nextPos = enemy.mesh.position.clone().add(moveStep);
          if (isSafePosition(nextPos.x, nextPos.z)) enemy.mesh.position.add(moveStep);
          enemy.mesh.lookAt(new THREE.Vector3(player.position.x, enemy.mesh.position.y, player.position.z));
        }

      } else if (enemy.type === 'boss') {
        // ★ボスAI
        if (!enemy.stateTimer) enemy.stateTimer = 0;
        enemy.stateTimer += delta;
        const dist = player.position.distanceTo(enemy.mesh.position);

        if (enemy.bossState === 'chase') {
          // ゆっくり近づく
          if (dist > 3) {
            const direction = new THREE.Vector3().subVectors(player.position, enemy.mesh.position).normalize();
            direction.y = 0; direction.normalize();
            enemy.mesh.position.add(direction.multiplyScalar(enemy.speed * 0.02 * timeScale)); // 遅め
            enemy.mesh.lookAt(new THREE.Vector3(player.position.x, enemy.mesh.position.y, player.position.z));
            // 歩行アニメ
            // playEnemyAction(enemy, 'Walking'); // 常に再生されてるのでOK
          }
          if (enemy.stateTimer > 4) { // 4秒ごとに攻撃準備
            enemy.bossState = 'prepare';
            enemy.stateTimer = 0;
            // ジャンプモーション
            playEnemyAction(enemy, 'Jump', 0.1);
            enemy.velocityY = 0.6; // ジャンプ
            enemyGrounded = false;
          }

        } else if (enemy.bossState === 'prepare') {
          // 空中
          if (enemyGrounded && enemy.stateTimer > 0.5) {
             // 着地！攻撃！
             enemy.bossState = 'attack';
             enemy.stateTimer = 0;
             spawnParticles(enemy.mesh.position, 20, 'shockwave');
             addShake(1.0);
             vibrate(200);

             // プレイヤーが接地してたらダメージ
             if (isGrounded) {
               gameOver();
             }
          }
        } else if (enemy.bossState === 'attack') {
          // 攻撃後の隙
          if (enemy.stateTimer > 1.0) {
            enemy.bossState = 'stun'; // 疲れる
            enemy.stateTimer = 0;
            playEnemyAction(enemy, 'Idle', 0.2); // 棒立ち
          }
        } else if (enemy.bossState === 'stun') {
          // 攻撃チャンス
          if (enemy.stateTimer > 3.0) {
            enemy.bossState = 'chase';
            enemy.stateTimer = 0;
            playEnemyAction(enemy, 'Walking', 0.2);
          }
        }
      }
    }

    // 衝突判定
    const dx = player.position.x - enemy.mesh.position.x;
    const dz = player.position.z - enemy.mesh.position.z;
    const hDist = Math.sqrt(dx*dx + dz*dz);
    const vDist = Math.abs(player.position.y - enemy.mesh.position.y);
    
    // ボスの当たり判定はデカい
    const hitRadius = enemy.type === 'boss' ? 2.5 : 1.0;

    if (hDist < hitRadius && vDist < 2.5) {
      if (isSpinning) {
        if (enemy.type === 'boss') {
          if (enemy.bossState === 'stun') {
            // ボスにダメージ
            if (!enemy.dead) { // 無敵時間代わりにdeadフラグを一瞬使う手もあるが、今回はヒットストップでごまかす
               enemy.hp = (enemy.hp || 0) - 1;
               updateBossUI(enemy.hp, enemy.maxHp || 3);
               spawnParticles(enemy.mesh.position.clone().add(new THREE.Vector3(0,2,0)), 15, 'explosion');
               addShake(0.5); hitStopTimer = 0.2;
               // 吹き飛びアニメ（No）
               playEnemyAction(enemy, 'No', 0.1);
               // 即座に復帰
               enemy.bossState = 'chase'; enemy.stateTimer = -2; // 少し無敵

               if (enemy.hp <= 0) {
                 enemy.dead = true;
               }
            }
          }
        } else {
          // 雑魚は即死
          enemy.dead = true;
          spawnParticles(enemy.mesh.position.clone().add(new THREE.Vector3(0,1,0)), 15, 'explosion');
          addShake(0.5); vibrate(100); hitStopTimer = 0.1;
        }
      } else {
        // プレイヤーがダメージ
        if (enemy.type === 'boss') {
          // ボスに触れるだけで死ぬのは理不尽なので、attack中のみ判定...したいが、今回は接触=死とする
          // ただしstun中は安全
          if (enemy.bossState !== 'stun') {
             addShake(0.8); vibrate(500); gameOver();
          }
        } else {
          addShake(0.8); vibrate(500); gameOver();
        }
      }
    }
  }

  let moveX = 0, moveZ = 0;
  if (keys['w']) moveZ -= 1; if (keys['s']) moveZ += 1;
  if (keys['a']) moveX -= 1; if (keys['d']) moveX += 1;
  if (moveX || moveZ) {
    const len = Math.sqrt(moveX**2 + moveZ**2);
    input.x = moveX/len; input.z = moveZ/len;
  } else if (!joystickManager.get(0)) { /* nop */ }

  const isMoving = input.x !== 0 || input.z !== 0;
  if (isMoving) {
    player.position.x += input.x * speed * timeScale;
    player.position.z += input.z * speed * timeScale;
    player.rotation.y = Math.atan2(input.x, input.z) + Math.PI;
    if (isGrounded) {
      runDustTimer += delta;
      if (runDustTimer > 0.2) { spawnParticles(player.position.clone().add(new THREE.Vector3(0, -0.4, 0)), 1, 'dust'); runDustTimer = 0; }
    }
  }
  
  let groundY = -999;
  let onMovingPlatform: MovingPlatform | null = null;
  for (const p of staticPlatforms) { if (checkOnPlatform(player, p)) { const top = p.position.y + p.geometry.parameters.height/2; if (top > groundY) groundY = top; } }
  for (const mp of movingPlatforms) { if (checkOnPlatform(player, mp.mesh)) { const top = mp.mesh.position.y + mp.mesh.geometry.parameters.height/2; if (top > groundY) { groundY = top; onMovingPlatform = mp; } } }

  const pBottom = player.position.y - 0.5;
  if (pBottom <= groundY + 0.1 && velocityY <= 0 && groundY > -100) {
    player.position.y = groundY + 0.5; velocityY = 0; isGrounded = true;
    if (onMovingPlatform) {
      const velocity = Math.cos(time * onMovingPlatform.speed + onMovingPlatform.offset) * onMovingPlatform.range * onMovingPlatform.speed * delta;
      if (onMovingPlatform.axis === 'x') player.position.x += velocity; else if (onMovingPlatform.axis === 'z') player.position.z += velocity;
    }
  } else isGrounded = false;

  if (jumpPressed && isGrounded) { velocityY = jumpPower; isGrounded = false; spawnParticles(player.position.clone().add(new THREE.Vector3(0, -0.4, 0)), 3, 'dust'); fadeToAction('Jump', 0.1); }
  if (!isGrounded) { velocityY -= gravity * timeScale; player.position.y += velocityY * timeScale; }
  if (player.position.y < -10) gameOver();
  if (goalObj && player.position.distanceTo(goalPosition) < 1.5) gameClear();

  if (isSpinning) { spinMesh.position.copy(player.position); spinMesh.rotation.y += 0.5 * timeScale; } else spinMesh.position.copy(player.position);

  if (model) {
    model.position.copy(player.position); model.position.y -= 0.5;
    const q = new THREE.Quaternion().setFromEuler(player.rotation);
    model.quaternion.slerp(q, 0.2 * timeScale); 
    const shakeX = (Math.random()-0.5) * shakeIntensity;
    const shakeY = (Math.random()-0.5) * shakeIntensity;
    const camOffset = new THREE.Vector3(0, 5, 8);
    const target = player.position.clone().add(camOffset);
    camera.position.lerp(target, 0.1);
    camera.position.x += shakeX; camera.position.y += shakeY;
    camera.lookAt(player.position);
    if (isSpinning) model.rotation.y += 20 * delta;
    if (isGrounded) { if (isMoving) { fadeToAction('Run', 0.2); if (activeAction) activeAction.setEffectiveTimeScale(0.7); } else fadeToAction('Idle', 0.2); } else fadeToAction('Jump', 0.1);
  }
}

function checkOnPlatform(obj: THREE.Mesh | THREE.Group, platform: THREE.Mesh): boolean {
  const w = platform.geometry.parameters.width;
  const d = platform.geometry.parameters.depth;
  return (obj.position.x >= platform.position.x - w/2 && obj.position.x <= platform.position.x + w/2 && obj.position.z >= platform.position.z - d/2 && obj.position.z <= platform.position.z + d/2);
}
function gameClear() { isGameActive = false; bigMessage.innerText = "STAGE CLEAR!"; retryBtn.innerText = "NEXT STAGE"; messageContainer.style.display = 'flex'; }
function gameOver() { isGameActive = false; bigMessage.innerText = "GAME OVER"; retryBtn.innerText = "RETRY"; messageContainer.style.display = 'flex'; }

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta(); 
  const time = clock.getElapsedTime();
  if (mixer) mixer.update(delta);
  update(time, delta);
  renderer.render(scene, camera);
}
animate();