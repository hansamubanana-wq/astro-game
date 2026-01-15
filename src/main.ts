import './style.css'
import * as THREE from 'three'
import nipplejs from 'nipplejs'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- ゲーム状態 ---
let currentLevel = 1;
let isGameActive = false;
let coinCount = 0;
let isSpinning = false; 

// --- 1. シーン初期化 ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(20, 50, 20);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.camera.left = -50;
dirLight.shadow.camera.right = 50;
dirLight.shadow.camera.top = 50;
dirLight.shadow.camera.bottom = -50;
scene.add(dirLight);

const textureLoader = new THREE.TextureLoader();
// 空
const skyGeo = new THREE.SphereGeometry(500, 32, 32);
const skyMat = new THREE.MeshBasicMaterial({
  map: textureLoader.load('https://threejs.org/examples/textures/2294472375_24a3b8ef46_o.jpg'),
  side: THREE.BackSide
});
const sky = new THREE.Mesh(skyGeo, skyMat);
scene.add(sky);

const crateTexture = textureLoader.load('https://threejs.org/examples/textures/crate.gif');
crateTexture.colorSpace = THREE.SRGBColorSpace;

// --- オブジェクト管理 ---
interface MovingPlatform {
  mesh: THREE.Mesh;
  basePos: THREE.Vector3;
  axis: 'x' | 'y' | 'z';
  range: number;
  speed: number;
  offset: number;
}
let movingPlatforms: MovingPlatform[] = [];
let staticPlatforms: THREE.Mesh[] = [];
let enemies: { mesh: THREE.Mesh, basePos: THREE.Vector3, axis: 'x'|'z', range: number, speed: number, offset: number, dead: boolean }[] = [];
let coins: THREE.Mesh[] = [];
let goalObj: THREE.Mesh | undefined;
let goalPosition = new THREE.Vector3();

// --- ユーティリティ ---
function clearStage() {
  staticPlatforms.forEach(p => scene.remove(p));
  movingPlatforms.forEach(p => scene.remove(p.mesh));
  enemies.forEach(e => scene.remove(e.mesh));
  coins.forEach(c => scene.remove(c));
  if (goalObj) scene.remove(goalObj);
  
  staticPlatforms = [];
  movingPlatforms = [];
  enemies = [];
  coins = [];
}

function createPlatform(x: number, y: number, z: number, w: number, h: number, d: number) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshStandardMaterial({ map: crateTexture, roughness: 0.8 });
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
  movingPlatforms.push({
    mesh,
    basePos: new THREE.Vector3(x, y - h/2, z),
    axis, range, speed, offset: 0
  });
}

function createEnemy(x: number, y: number, z: number, axis: 'x'|'z', range: number, speed: number) {
  const geo = new THREE.IcosahedronGeometry(0.4, 0); 
  const mat = new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.3, emissive: 0x330000 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  scene.add(mesh);
  enemies.push({ mesh, basePos: new THREE.Vector3(x, y, z), axis, range, speed, offset: Math.random() * 6, dead: false });
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
  
  if (level === 1) {
    showStory("【STAGE 1: 訓練場】<br>攻撃ボタンでスピンアタックだ！<br>敵をぶっ飛ばしてコインを集めろ！");
    createPlatform(0, 0, 0, 6, 2, 6);
    createMovingPlatform(0, 0, -10, 4, 1, 4, 'z', 3, 1.5);
    createCoin(0, 1.5, -10);
    createPlatform(0, 0, -20, 6, 2, 6);
    createEnemy(0, 1.4, -20, 'x', 2, 2); 
    createMovingPlatform(6, 1, -25, 3, 1, 3, 'x', 2, 2);
    createCoin(6, 2.5, -25);
    createPlatform(0, 2, -35, 6, 2, 6);
    createGoal(0, 3.5, -35);
  
  } else if (level === 2) {
    showStory("【STAGE 2: スカイリフト】<br>上下に動く床があるぞ。<br>乗り継いで高いところへ行け！");
    createPlatform(0, 0, 0, 6, 2, 6);
    createMovingPlatform(0, 2, -8, 3, 0.5, 3, 'y', 2, 1);
    createCoin(0, 5, -8);
    createPlatform(0, 4, -16, 4, 1, 4);
    createEnemy(0, 4.9, -16, 'z', 1.5, 3);
    createMovingPlatform(0, 4, -24, 3, 0.5, 3, 'x', 3, 2);
    createPlatform(0, 4, -32, 6, 2, 6);
    createEnemy(-2, 5.4, -32, 'z', 2, 4);
    createEnemy(2, 5.4, -32, 'z', 2, 4);
    createCoin(0, 6, -32);
    createGoal(0, 5.5, -32); 
  
  } else if (level === 3) {
    showStory("【FINAL: デス・コースター】<br>高速で動く床の連続だ。<br>落ちたら終わりの最終試練！");
    createPlatform(0, 0, 0, 6, 2, 6);
    createMovingPlatform(0, 0, -10, 2, 0.5, 4, 'z', 4, 3);
    createMovingPlatform(0, 0, -20, 2, 0.5, 4, 'x', 4, 3);
    createCoin(0, 1.5, -15);
    createPlatform(0, 0, -30, 4, 1, 4);
    createEnemy(0, 0.9, -30, 'x', 1.5, 5); 
    createMovingPlatform(0, 2, -40, 2, 0.5, 8, 'y', 3, 2); 
    createCoin(0, 6, -40);
    createPlatform(0, 5, -50, 8, 2, 8);
    createEnemy(-3, 6.4, -50, 'z', 3, 4);
    createEnemy(3, 6.4, -50, 'z', 3, 4);
    createEnemy(0, 6.4, -47, 'x', 3, 4);
    createGoal(0, 6.5, -55);
  } else {
    showStory(`【ALL CLEAR】<br>全クリおめでとう！<br>獲得コイン: ${coinCount}枚`);
    isGameActive = false;
    goalObj = undefined;
  }
}

// --- プレイヤー & モデル ---
const playerGeometry = new THREE.BoxGeometry(0.5, 1, 0.5); 
const playerMaterial = new THREE.MeshBasicMaterial({ visible: false });
const player = new THREE.Mesh(playerGeometry, playerMaterial);
scene.add(player);

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
  loadLevel(currentLevel);
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

// --- UI制御 ---
const storyBox = document.getElementById('story-box') as HTMLElement;
const storyText = document.getElementById('story-text') as HTMLElement;
const nextBtn = document.getElementById('next-btn') as HTMLElement;
const messageContainer = document.getElementById('message-container') as HTMLElement;
const bigMessage = document.getElementById('big-message') as HTMLElement;
const retryBtn = document.getElementById('retry-btn') as HTMLElement;
const coinCounter = document.getElementById('coin-counter') as HTMLElement;

function showStory(text: string) {
  isGameActive = false;
  storyBox.style.display = 'flex';
  storyText.innerHTML = text;
}
function updateCoinDisplay() {
  coinCounter.innerText = `🪙 ${coinCount}`;
}

nextBtn.addEventListener('click', () => {
  storyBox.style.display = 'none';
  isGameActive = true;
});

retryBtn.addEventListener('click', () => {
  messageContainer.style.display = 'none';
  if (retryBtn.innerText === "RETRY") {
    loadLevel(currentLevel);
  } else {
    currentLevel++;
    loadLevel(currentLevel);
  }
});

// --- 入力 ---
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
    setTimeout(() => { isSpinning = false; }, 500);
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

const joystickManager = nipplejs.create({
  zone: document.getElementById('joystick-zone') as HTMLElement,
  mode: 'static',
  position: { left: '50%', top: '80%' },
  color: 'white',
  size: 100
});
joystickManager.on('move', (_evt, data) => { if (data && data.vector) { input.x = data.vector.x; input.z = -data.vector.y; }});
joystickManager.on('end', () => { input.x = 0; input.z = 0; });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- ゲームループ ---
const speed = 0.15;
const gravity = 0.015;
const jumpPower = 0.4;
let velocityY = 0;
let isGrounded = true;

// ★ deltaを受け取るように変更
function update(time: number, delta: number) {
  if (!isGameActive) return;

  // ★ フレームレート補正値 (60FPSを基準とする)
  // deltaが0.016(60fps)なら1倍、0.008(120fps)なら0.5倍にする
  const timeScale = delta * 60; 

  if (goalObj) {
    goalObj.rotation.y += 0.02 * timeScale;
    goalObj.rotation.x += 0.01 * timeScale;
  }

  for (let i = coins.length - 1; i >= 0; i--) {
    const c = coins[i];
    c.rotation.y += 0.05 * timeScale;
    if (player.position.distanceTo(c.position) < 1.0) {
      scene.remove(c);
      coins.splice(i, 1);
      coinCount++;
      updateCoinDisplay();
    }
  }

  // 動く床
  movingPlatforms.forEach(mp => {
    const move = Math.sin(time * mp.speed + mp.offset) * mp.range;
    if (mp.axis === 'x') mp.mesh.position.x = mp.basePos.x + move;
    else if (mp.axis === 'y') mp.mesh.position.y = mp.basePos.y + move;
    else mp.mesh.position.z = mp.basePos.z + move;
  });

  // 敵
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    if (enemy.dead) continue;

    const move = Math.sin(time * enemy.speed + enemy.offset) * enemy.range;
    if (enemy.axis === 'x') enemy.mesh.position.x = enemy.basePos.x + move;
    else enemy.mesh.position.z = enemy.basePos.z + move;
    
    enemy.mesh.rotation.x += 0.05 * timeScale;
    enemy.mesh.rotation.y += 0.05 * timeScale;

    const dist = player.position.distanceTo(enemy.mesh.position);
    if (dist < 1.0) {
      if (isSpinning) {
        enemy.dead = true;
        scene.remove(enemy.mesh);
        velocityY = 0.2;
      } else {
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
    // ★移動速度にtimeScaleを掛ける
    player.position.x += input.x * speed * timeScale;
    player.position.z += input.z * speed * timeScale;
    player.rotation.y = Math.atan2(input.x, input.z) + Math.PI;
  }
  
  // 接地判定
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
      if (top > groundY) {
        groundY = top;
        onMovingPlatform = mp;
      }
    }
  }

  const pBottom = player.position.y - 0.5;
  if (pBottom <= groundY + 0.1 && velocityY <= 0 && groundY > -100) {
    player.position.y = groundY + 0.5;
    velocityY = 0;
    isGrounded = true;
    
    if (onMovingPlatform) {
      // 床の移動速度 × delta (秒)
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
    fadeToAction('Jump', 0.1);
  }

  if (!isGrounded) {
    // ★ 重力と速度加算にもtimeScaleを掛ける
    velocityY -= gravity * timeScale;
    player.position.y += velocityY * timeScale;
  }

  if (player.position.y < -10) gameOver();
  if (goalObj && player.position.distanceTo(goalPosition) < 1.5) gameClear();

  if (model) {
    model.position.copy(player.position);
    model.position.y -= 0.5;
    const q = new THREE.Quaternion().setFromEuler(player.rotation);
    model.quaternion.slerp(q, 0.2 * timeScale); // 回転補間もスケール
    
    if (isSpinning) {
      model.rotation.y += 20 * delta;
    }

    if (isGrounded) {
      if (isMoving) {
        fadeToAction('Run', 0.2);
        if (activeAction) activeAction.setEffectiveTimeScale(0.7);
      } else {
        fadeToAction('Idle', 0.2);
      }
    } else {
      fadeToAction('Jump', 0.1);
    }
  }
}

function checkOnPlatform(player: THREE.Mesh, platform: THREE.Mesh): boolean {
  const w = platform.geometry.parameters.width;
  const d = platform.geometry.parameters.depth;
  return (
    player.position.x >= platform.position.x - w/2 &&
    player.position.x <= platform.position.x + w/2 &&
    player.position.z >= platform.position.z - d/2 &&
    player.position.z <= platform.position.z + d/2
  );
}

function gameClear() {
  isGameActive = false;
  bigMessage.innerText = "STAGE CLEAR!";
  retryBtn.innerText = "NEXT STAGE";
  messageContainer.style.display = 'flex';
}

function gameOver() {
  isGameActive = false;
  bigMessage.innerText = "GAME OVER";
  retryBtn.innerText = "RETRY";
  messageContainer.style.display = 'flex';
}

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  
  // ★ ここでdelta（1フレームにかかった時間）を取得
  const delta = clock.getDelta(); 
  const time = clock.getElapsedTime();

  if (mixer) mixer.update(delta);
  
  // ★ deltaをupdate関数に渡す
  update(time, delta);
  
  const camOffset = new THREE.Vector3(0, 5, 8);
  const target = player.position.clone().add(camOffset);
  camera.position.lerp(target, 0.1);
  camera.lookAt(player.position);
  renderer.render(scene, camera);
}
animate();