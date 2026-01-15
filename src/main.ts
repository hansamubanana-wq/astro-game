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
let shakeIntensity = 0; // 画面の揺れ
let hitStopTimer = 0;   // ヒットストップ（一瞬止まる）
let runDustTimer = 0;   // 土煙のタイミング管理

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
  life: number; // 寿命
  maxLife: number;
}
let particles: Particle[] = [];
// 共通ジオメトリ（使い回して軽量化）
const particleGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
const particleMatCoin = new THREE.MeshBasicMaterial({ color: 0xffff00 });
const particleMatExplosion = new THREE.MeshBasicMaterial({ color: 0xff4400 });
const particleMatDust = new THREE.MeshBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.6 });

function spawnParticles(pos: THREE.Vector3, count: number, type: 'coin'|'explosion'|'dust') {
  let mat = particleMatCoin;
  let speed = 0.1;
  let life = 0.5;

  if (type === 'explosion') {
    mat = particleMatExplosion;
    speed = 0.3;
    life = 0.8;
  } else if (type === 'dust') {
    mat = particleMatDust;
    speed = 0.05;
    life = 0.4;
  }

  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(particleGeo, mat.clone()); // Opacity変えるためClone
    // 位置のバラつき
    mesh.position.copy(pos).add(new THREE.Vector3(
      (Math.random() - 0.5) * 0.5,
      (Math.random() - 0.5) * 0.5,
      (Math.random() - 0.5) * 0.5
    ));
    // 飛び散る方向
    const velocity = new THREE.Vector3(
      (Math.random() - 0.5) * speed,
      (Math.random() - 0.5) * speed + (type === 'dust' ? 0.05 : 0.2), // 上に跳ねる
      (Math.random() - 0.5) * speed
    );
    
    scene.add(mesh);
    particles.push({ mesh, velocity, life, maxLife: life });
  }
}

// 画面揺らし
function addShake(amount: number) {
  shakeIntensity = amount;
}

// スマホ振動
function vibrate(ms: number) {
  if (navigator.vibrate) {
    navigator.vibrate(ms);
  }
}

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
  type: 'patrol' | 'chaser'; 
  speed: number;
  dead: boolean;
  deadTimer: number; 
  velocityY: number;
  patrolAxis?: 'x' | 'z'; 
  patrolDir?: number;
  basePos: THREE.Vector3;
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
}

function createPlatform(x: number, y: number, z: number, w: number, h: number, d: number, type: 'wood'|'stone' = 'wood') {
  const geo = new THREE.BoxGeometry(w, h, d);
  let mat;
  if (type === 'wood') {
    mat = new THREE.MeshStandardMaterial({ map: crateTexture, roughness: 0.8 });
  } else {
    mat = new THREE.MeshStandardMaterial({ map: stoneTexture, roughness: 0.5, color: 0x888888 });
  }
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

function spawnEnemy(x: number, y: number, z: number, type: 'patrol'|'chaser', axis: 'x'|'z'|undefined, speed: number) {
  if (!enemyResource) return;
  const enemyMesh = enemyResource.scene.clone();
  enemyMesh.position.set(x, y, z);
  enemyMesh.scale.set(0.4, 0.4, 0.4); 
  enemyMesh.traverse((child: any) => { if (child.isMesh) child.castShadow = true; });
  scene.add(enemyMesh);

  const mixer = new THREE.AnimationMixer(enemyMesh);
  let actionName = type === 'patrol' ? 'Walking' : 'Running'; 
  const clip = THREE.AnimationClip.findByName(enemyResource.animations, actionName);
  if (clip) mixer.clipAction(clip).play();

  enemies.push({ 
    mesh: enemyMesh, mixer: mixer, type: type, speed: speed, 
    dead: false, deadTimer: 0, velocityY: 0, 
    patrolAxis: axis, patrolDir: 1, basePos: new THREE.Vector3(x, y, z)
  });
}

function createPatrolEnemy(x: number, y: number, z: number, axis: 'x'|'z', speed: number) {
  spawnEnemy(x, y, z, 'patrol', axis, speed);
}
function createChaserEnemy(x: number, y: number, z: number, speed: number) {
  spawnEnemy(x, y, z, 'chaser', undefined, speed);
}

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

// --- ステージデータ ---
function loadLevel(level: number) {
  clearStage();
  player.position.set(0, 2, 0);
  player.rotation.set(0, 0, 0);
  velocityY = 0;
  
  if (!enemyResource) { setTimeout(() => loadLevel(level), 500); return; }

  if (level === 1) {
    showStory("【WORLD 1: はじまりの広場】<br>攻撃時の「振動」と「爆発」を感じろ！<br>走ると土煙もあがるぞ！");
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
    showStory("【WORLD 2: スカイ・アスレチック】<br>攻撃を当てると一瞬止まる「ヒットストップ」<br>これが気持ちよさの秘訣だ！");
    createPlatform(0, 0, 0, 6, 2, 6, 'stone');
    createPlatform(8, 1, -8, 5, 1, 5, 'wood');
    createChaserEnemy(8, 1.5, -8, 3.5); 
    createCoin(8, 2.5, -8);
    createPlatform(-8, 1, -8, 5, 1, 5, 'wood');
    createPatrolEnemy(-8, 1.9, -8, 'x', 2.0);
    createCoin(-8, 2.5, -8);
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
    showStory("【FINAL WORLD: メカニカル・ウォーズ】<br>ド派手に暴れまわれ！<br>君のスマホが震えまくる！");
    createPlatform(0, 0, 0, 8, 2, 8, 'stone');
    createPlatform(0, 1, -10, 4, 1, 4, 'wood');
    createChaserEnemy(0, 1.5, -10, 3.0); 
    createPlatform(8, 2, -10, 4, 1, 4, 'wood');
    createPlatform(8, 3, -20, 4, 1, 4, 'wood');
    createChaserEnemy(8, 3.5, -20, 4.0);
    createPlatform(0, 4, -20, 4, 1, 4, 'wood');
    createPlatform(0, 5, -35, 15, 2, 15, 'stone');
    createChaserEnemy(-5, 6.5, -35, 3.0);
    createChaserEnemy(5, 6.5, -35, 3.0);
    createChaserEnemy(0, 6.5, -40, 3.0);
    createPatrolEnemy(0, 6.4, -35, 'x', 5.0); 
    createCoin(0, 7, -35); createCoin(3, 7, -35); createCoin(-3, 7, -35);
    createGoal(0, 6.5, -42);
  } else {
    showStory(`【ALL CLEAR】<br>全クリ達成！<br>獲得コイン: ${coinCount}枚<br>この爽快感、忘れるな！`);
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
const spinEffectMat = new THREE.MeshBasicMaterial({ 
  color: 0x00ffff, transparent: true, opacity: 0.0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending 
});
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
  if (actions['Idle']) {
    activeAction = actions['Idle'];
    activeAction.play();
  }

  loader.load('https://threejs.org/examples/models/gltf/RobotExpressive/RobotExpressive.glb', (robotGltf) => {
    enemyResource = robotGltf; 
    loadLevel(currentLevel);
  });
});

function fadeToAction(name: string, duration: number) {
  if (!actions[name]) {
    if (name === 'Jump') name = 'Run'; 
    else if (name === 'Spin') name = 'Run'; 
    else return;
  }
  if (activeAction === actions[name]) return;
  const previousAction = activeAction;
  activeAction = actions[name];
  if (previousAction) previousAction.fadeOut(duration);
  activeAction.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(duration).play();
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
    addShake(0.2); // 攻撃時にも少し揺らす
    vibrate(30);   // 攻撃時に軽く振動
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

  // ★ヒットストップ処理（時間が止まる）
  if (hitStopTimer > 0) {
    hitStopTimer -= delta;
    return; // 動きを更新しない
  }

  const timeScale = delta * 60; 

  // ★画面シェイク処理
  if (shakeIntensity > 0) {
    camera.position.x += (Math.random() - 0.5) * shakeIntensity;
    camera.position.y += (Math.random() - 0.5) * shakeIntensity;
    camera.position.z += (Math.random() - 0.5) * shakeIntensity;
    shakeIntensity *= 0.9; // 減衰
    if (shakeIntensity < 0.01) shakeIntensity = 0;
  }

  // パーティクル更新
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= delta;
    if (p.life <= 0) {
      scene.remove(p.mesh);
      particles.splice(i, 1);
      continue;
    }
    p.mesh.position.add(p.velocity.clone().multiplyScalar(timeScale));
    p.mesh.rotation.x += 0.1;
    p.mesh.rotation.y += 0.1;
    // フェードアウト
    (p.mesh.material as THREE.Material).opacity = p.life / p.maxLife;
  }

  if (goalObj) { goalObj.rotation.y += 0.02 * timeScale; goalObj.rotation.x += 0.01 * timeScale; }

  // コイン取得演出
  for (let i = coins.length - 1; i >= 0; i--) {
    const c = coins[i];
    c.rotation.y += 0.05 * timeScale;
    const dx = player.position.x - c.position.x;
    const dz = player.position.z - c.position.z;
    if (Math.sqrt(dx*dx + dz*dz) < 1.5 && Math.abs(player.position.y - c.position.y) < 2.0) {
      spawnParticles(c.position, 8, 'coin'); // ★パーティクル発生
      vibrate(50); // ★振動
      scene.remove(c);
      coins.splice(i, 1);
      coinCount++;
      updateCoinDisplay();
    }
  }

  movingPlatforms.forEach(mp => {
    const move = Math.sin(time * mp.speed + mp.offset) * mp.range;
    if (mp.axis === 'x') mp.mesh.position.x = mp.basePos.x + move;
    else if (mp.axis === 'y') mp.mesh.position.y = mp.basePos.y + move;
    else mp.mesh.position.z = mp.basePos.z + move;
  });

  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    if (enemy.mixer) enemy.mixer.update(delta);

    if (enemy.dead) {
      enemy.deadTimer += delta;
      const clip = THREE.AnimationClip.findByName(enemyResource.animations, 'Death');
      if (clip) {
        const action = enemy.mixer.clipAction(clip);
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.play();
      }
      if (enemy.deadTimer > 1.5) { scene.remove(enemy.mesh); enemies.splice(i, 1); }
      continue;
    }

    let enemyGrounded = false;
    let groundY = -999;
    
    for (const p of staticPlatforms) {
      if (checkOnPlatform(enemy.mesh, p)) {
        const top = p.position.y + p.geometry.parameters.height/2;
        if (top > groundY) groundY = top;
      }
    }
    for (const mp of movingPlatforms) {
      if (checkOnPlatform(enemy.mesh, mp.mesh)) {
        const top = mp.mesh.position.y + mp.mesh.geometry.parameters.height/2;
        if (top > groundY) groundY = top;
      }
    }

    const enemyOffset = 0;
    
    if (enemy.mesh.position.y <= groundY + 0.1 && enemy.velocityY <= 0 && groundY > -100) {
      enemy.mesh.position.y = groundY;
      enemy.velocityY = 0;
      enemyGrounded = true;
    } else {
      enemyGrounded = false;
      enemy.velocityY -= gravity * timeScale;
      enemy.mesh.position.y += enemy.velocityY * timeScale;
    }

    if (enemyGrounded) {
      if (enemy.type === 'patrol') {
        const moveDist = enemy.speed * 0.03 * timeScale;
        const dir = enemy.patrolDir || 1;
        let nextX = enemy.mesh.position.x;
        let nextZ = enemy.mesh.position.z;
        if (enemy.patrolAxis === 'x') nextX += moveDist * dir;
        else nextZ += moveDist * dir;

        if (isSafePosition(nextX, nextZ)) {
          enemy.mesh.position.x = nextX;
          enemy.mesh.position.z = nextZ;
          enemy.mesh.lookAt(new THREE.Vector3(nextX, enemy.mesh.position.y, nextZ));
        } else {
          enemy.patrolDir = dir * -1;
        }

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
      }
    }

    const dx = player.position.x - enemy.mesh.position.x;
    const dz = player.position.z - enemy.mesh.position.z;
    const hDist = Math.sqrt(dx*dx + dz*dz);
    const vDist = Math.abs(player.position.y - enemy.mesh.position.y);
    
    if (hDist < 1.0 && vDist < 1.5) {
      if (isSpinning) {
        enemy.dead = true;
        // ★ヒット演出
        spawnParticles(enemy.mesh.position.clone().add(new THREE.Vector3(0, 1, 0)), 15, 'explosion');
        addShake(0.5); // 強烈なシェイク
        vibrate(100);  // 強烈な振動
        hitStopTimer = 0.1; // 0.1秒時を止める（ヒットストップ）
      } else {
        addShake(0.8); // 死亡時もシェイク
        vibrate(500);
        gameOver();
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
    
    // ★走ると土煙
    if (isGrounded) {
      runDustTimer += delta;
      if (runDustTimer > 0.2) { // 0.2秒ごとに発生
        spawnParticles(player.position.clone().add(new THREE.Vector3(0, -0.4, 0)), 1, 'dust');
        runDustTimer = 0;
      }
    }
  }
  
  let groundY = -999;
  let onMovingPlatform: MovingPlatform | null = null;
  for (const p of staticPlatforms) {
    if (checkOnPlatform(player, p)) {
      const top = p.position.y + p.geometry.parameters.height/2;
      if (top > groundY) groundY = top;
    }
  }
  for (const mp of movingPlatforms) {
    if (checkOnPlatform(player, mp.mesh)) {
      const top = mp.mesh.position.y + mp.mesh.geometry.parameters.height/2;
      if (top > groundY) { groundY = top; onMovingPlatform = mp; }
    }
  }

  const pBottom = player.position.y - 0.5;
  if (pBottom <= groundY + 0.1 && velocityY <= 0 && groundY > -100) {
    player.position.y = groundY + 0.5;
    velocityY = 0;
    isGrounded = true;
    if (onMovingPlatform) {
      const velocity = Math.cos(time * onMovingPlatform.speed + onMovingPlatform.offset) * onMovingPlatform.range * onMovingPlatform.speed * delta;
      if (onMovingPlatform.axis === 'x') player.position.x += velocity;
      else if (onMovingPlatform.axis === 'z') player.position.z += velocity;
    }
  } else {
    isGrounded = false;
  }

  if (jumpPressed && isGrounded) {
    velocityY = jumpPower;
    isGrounded = false;
    spawnParticles(player.position.clone().add(new THREE.Vector3(0, -0.4, 0)), 3, 'dust'); // ジャンプ時も土煙
    fadeToAction('Jump', 0.1);
  }

  if (!isGrounded) {
    velocityY -= gravity * timeScale;
    player.position.y += velocityY * timeScale;
  }

  if (player.position.y < -10) gameOver();
  if (goalObj && player.position.distanceTo(goalPosition) < 1.5) gameClear();

  if (isSpinning) {
    spinMesh.position.copy(player.position);
    spinMesh.rotation.y += 0.5 * timeScale;
  } else {
    spinMesh.position.copy(player.position);
  }

  if (model) {
    model.position.copy(player.position);
    model.position.y -= 0.5;
    const q = new THREE.Quaternion().setFromEuler(player.rotation);
    model.quaternion.slerp(q, 0.2 * timeScale); 
    
    // ★カメラを少し揺らして追従
    const shakeX = (Math.random()-0.5) * shakeIntensity;
    const shakeY = (Math.random()-0.5) * shakeIntensity;
    
    // カメラ追従処理（ここに入れないと揺れが上書きされる）
    const camOffset = new THREE.Vector3(0, 5, 8);
    const target = player.position.clone().add(camOffset);
    camera.position.lerp(target, 0.1);
    camera.position.x += shakeX;
    camera.position.y += shakeY;
    camera.lookAt(player.position);

    if (isSpinning) model.rotation.y += 20 * delta;
    if (isGrounded) {
      if (isMoving) { fadeToAction('Run', 0.2); if (activeAction) activeAction.setEffectiveTimeScale(0.7); }
      else fadeToAction('Idle', 0.2);
    } else fadeToAction('Jump', 0.1);
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