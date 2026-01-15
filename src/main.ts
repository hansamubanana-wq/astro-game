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

// --- オブジェクト管理 ---
interface MovingPlatform {
  mesh: THREE.Mesh;
  basePos: THREE.Vector3;
  axis: 'x' | 'y' | 'z';
  range: number;
  speed: number;
  offset: number;
}
// ★敵にも物理演算（重力）を追加
interface Enemy {
  mesh: THREE.Mesh;
  type: 'patrol' | 'chaser'; 
  basePos: THREE.Vector3;
  axis?: 'x' | 'z'; 
  range?: number;   
  speed: number;
  offset?: number;
  dead: boolean;
  velocityY: number; // 敵も重力を持つ
}

let movingPlatforms: MovingPlatform[] = [];
let staticPlatforms: THREE.Mesh[] = [];
let enemies: Enemy[] = [];
let coins: THREE.Mesh[] = [];
let goalObj: THREE.Mesh | undefined;
let goalPosition = new THREE.Vector3();

// --- 作成関数群 ---
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

function createPatrolEnemy(x: number, y: number, z: number, axis: 'x'|'z', range: number, speed: number) {
  const geo = new THREE.IcosahedronGeometry(0.4, 0); 
  const mat = new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.3, emissive: 0x330000 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  scene.add(mesh);
  enemies.push({ mesh, type: 'patrol', basePos: new THREE.Vector3(x, y, z), axis, range, speed, offset: Math.random() * 6, dead: false, velocityY: 0 });
}

function createChaserEnemy(x: number, y: number, z: number, speed: number) {
  const geo = new THREE.ConeGeometry(0.3, 0.6, 8); 
  const mat = new THREE.MeshStandardMaterial({ color: 0xaa00ff, roughness: 0.3, emissive: 0x220044 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y + 0.3, z);
  mesh.castShadow = true;
  scene.add(mesh);
  enemies.push({ mesh, type: 'chaser', basePos: new THREE.Vector3(x, y, z), speed, dead: false, velocityY: 0 });
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
    showStory("【WORLD 1: はじまりの広場】<br>コイン判定を強化したぞ。<br>ジャンプして飛び越えても取れるはずだ！");
    createPlatform(0, 0, 0, 10, 2, 10, 'stone');
    createPlatform(0, 0, -15, 8, 2, 8, 'wood');
    createChaserEnemy(0, 1.5, -15, 2.0); 
    createPlatform(12, 1, 0, 6, 2, 6, 'wood');
    createCoin(12, 2.5, 0);
    createCoin(14, 2.5, 0);
    createCoin(10, 2.5, 0);
    createMovingPlatform(6, 0.5, 0, 3, 0.5, 3, 'x', 2, 1);
    createPlatform(-12, 1, -5, 6, 2, 10, 'stone');
    createPatrolEnemy(-12, 2.4, -5, 'z', 3, 2);
    createCoin(-12, 2.5, -9);
    createMovingPlatform(0, 2, -25, 4, 0.5, 4, 'z', 3, 1.5);
    createPlatform(0, 3, -35, 8, 2, 8, 'stone');
    createGoal(0, 4.5, -35);
  
  } else if (level === 2) {
    showStory("【WORLD 2: スカイ・アスレチック】<br>敵を穴に落とすことができる。<br>スピンで弾き飛ばせ！");
    createPlatform(0, 0, 0, 6, 2, 6, 'stone');
    createPlatform(8, 1, -8, 5, 1, 5, 'wood');
    createChaserEnemy(8, 1.5, -8, 2.5); 
    createCoin(8, 2.5, -8);
    createPlatform(-8, 1, -8, 5, 1, 5, 'wood');
    createPatrolEnemy(-8, 1.9, -8, 'x', 2, 2);
    createCoin(-8, 2.5, -8);
    createPlatform(0, 2, -16, 10, 1, 6, 'stone');
    createChaserEnemy(-3, 2.5, -16, 2.0);
    createChaserEnemy(3, 2.5, -16, 2.0); 
    createMovingPlatform(0, 2, -24, 3, 0.5, 3, 'y', 3, 1); 
    createPlatform(0, 6, -32, 12, 2, 12, 'stone'); 
    createPatrolEnemy(0, 7.4, -32, 'x', 4, 3);
    createPatrolEnemy(0, 7.4, -32, 'z', 4, 3); 
    createCoin(0, 8, -32);
    createCoin(4, 8, -32);
    createCoin(-4, 8, -32);
    createGoal(0, 7.5, -40); 
  
  } else if (level === 3) {
    showStory("【FINAL WORLD: 追跡者の巣窟】<br>このゲームの集大成だ。<br>すべてのテクニックを駆使せよ！");
    createPlatform(0, 0, 0, 8, 2, 8, 'stone');
    createPlatform(0, 1, -10, 4, 1, 4, 'wood');
    createChaserEnemy(0, 1.5, -10, 3.0); 
    createPlatform(8, 2, -10, 4, 1, 4, 'wood');
    createPlatform(8, 3, -20, 4, 1, 4, 'wood');
    createChaserEnemy(8, 3.5, -20, 3.5);
    createPlatform(0, 4, -20, 4, 1, 4, 'wood');
    createPlatform(0, 5, -35, 15, 2, 15, 'stone');
    createChaserEnemy(-5, 6.5, -35, 2.5);
    createChaserEnemy(5, 6.5, -35, 2.5);
    createChaserEnemy(0, 6.5, -40, 2.5);
    createPatrolEnemy(0, 6.4, -35, 'x', 6, 5); 
    createCoin(0, 7, -35);
    createCoin(3, 7, -35);
    createCoin(-3, 7, -35);
    createGoal(0, 6.5, -42);
  } else {
    showStory(`【ALL CLEAR】<br>ワールド完全制覇！<br>獲得コイン: ${coinCount}枚<br>君は伝説のソルジャーだ！`);
    isGameActive = false;
    goalObj = undefined;
  }
}

// --- プレイヤー & エフェクト ---
const playerGeometry = new THREE.BoxGeometry(0.5, 1, 0.5); 
const playerMaterial = new THREE.MeshBasicMaterial({ visible: false });
const player = new THREE.Mesh(playerGeometry, playerMaterial);
scene.add(player);

// ★スピン攻撃のエフェクト（青い竜巻）
const spinEffectGeo = new THREE.CylinderGeometry(1, 0.1, 1.5, 16, 2, true);
const spinEffectMat = new THREE.MeshBasicMaterial({ 
  color: 0x00ffff, 
  transparent: true, 
  opacity: 0.0, // 最初は見えない
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending 
});
const spinMesh = new THREE.Mesh(spinEffectGeo, spinEffectMat);
// プレイヤーに追従させるため子要素にするのではなく、座標同期させる（モデル構造の都合）
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
    // エフェクト表示
    spinEffectMat.opacity = 0.6;
    setTimeout(() => { 
      isSpinning = false;
      spinEffectMat.opacity = 0.0; // 非表示
    }, 500);
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

function update(time: number, delta: number) {
  if (!isGameActive) return;

  const timeScale = delta * 60; 

  if (goalObj) {
    goalObj.rotation.y += 0.02 * timeScale;
    goalObj.rotation.x += 0.01 * timeScale;
  }

  // ★コイン判定の強化：円柱判定に変更
  for (let i = coins.length - 1; i >= 0; i--) {
    const c = coins[i];
    c.rotation.y += 0.05 * timeScale;
    
    // 水平距離を計算
    const dx = player.position.x - c.position.x;
    const dz = player.position.z - c.position.z;
    const hDist = Math.sqrt(dx*dx + dz*dz);
    
    // 垂直距離を計算
    const dy = Math.abs(player.position.y - c.position.y);

    // 水平1.5m以内 かつ 垂直2.0m以内 なら取得（かなり広め）
    if (hDist < 1.5 && dy < 2.0) {
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

  // ★敵の処理：重力と接地判定を追加
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    if (enemy.dead) {
      // 弾き飛ばされ中の処理
      enemy.velocityY -= gravity * timeScale;
      enemy.mesh.position.y += enemy.velocityY * timeScale;
      // 奈落まで落ちたら削除
      if (enemy.mesh.position.y < -20) {
        scene.remove(enemy.mesh);
        enemies.splice(i, 1);
      }
      continue;
    }

    // 地面にいるか判定
    let enemyGrounded = false;
    let groundY = -999;
    
    // 敵は静止床だけ判定（軽量化のため）
    for (const p of staticPlatforms) {
      if (checkOnPlatform(enemy.mesh, p)) {
        const top = p.position.y + p.geometry.parameters.height/2;
        if (top > groundY) groundY = top;
      }
    }
    
    // 接地処理
    const eBottom = enemy.mesh.position.y; // 敵の原点は中心なので修正が必要だが、Cone/Icoで中心が異なる。
    // create系関数でy位置調整済みなので、ここでは単純に足元=position.y - height/2 程度とみなして計算
    // 簡易的に position.y そのものをチェック（埋まり防止）
    
    // Cone: height 0.6, origin center? No, standard geometry origin is center. 
    // createChaserで y+0.3 してるので、中心は浮いてる。足元は position.y - 0.3
    // Ico: radius 0.4. 足元 position.y - 0.4
    
    const offset = enemy.type === 'chaser' ? 0.3 : 0.4;
    
    if (enemy.mesh.position.y - offset <= groundY + 0.1 && enemy.velocityY <= 0 && groundY > -100) {
      enemy.mesh.position.y = groundY + offset;
      enemy.velocityY = 0;
      enemyGrounded = true;
    } else {
      enemyGrounded = false;
    }

    // 重力
    if (!enemyGrounded) {
      enemy.velocityY -= gravity * timeScale;
      enemy.mesh.position.y += enemy.velocityY * timeScale;
    }

    // AI移動（接地している時だけ動ける）
    if (enemyGrounded) {
      if (enemy.type === 'patrol') {
        const move = Math.sin(time * enemy.speed + (enemy.offset || 0)) * (enemy.range || 0);
        const oldPos = enemy.mesh.position.clone();
        if (enemy.axis === 'x') enemy.mesh.position.x = enemy.basePos.x + move;
        else enemy.mesh.position.z = enemy.basePos.z + move;
        enemy.mesh.rotation.y += 0.05 * timeScale;
        
        // 穴チェック：移動先が穴なら戻す（落ちないようにするなら）
        // 今回は「プレイヤーが突き落とせる」ようにしたいので、穴チェックせずそのまま落とす！
      } else if (enemy.type === 'chaser') {
        const dist = player.position.distanceTo(enemy.mesh.position);
        if (dist < 15 && dist > 0.5) {
          const direction = new THREE.Vector3().subVectors(player.position, enemy.mesh.position).normalize();
          // Y軸成分は消す（空を飛ばないように）
          direction.y = 0; 
          direction.normalize();
          
          enemy.mesh.position.add(direction.multiplyScalar(enemy.speed * 0.03 * timeScale));
          enemy.mesh.lookAt(new THREE.Vector3(player.position.x, enemy.mesh.position.y, player.position.z));
        }
      }
    }

    // 衝突判定
    // 敵の高さを考慮した距離判定
    const dx = player.position.x - enemy.mesh.position.x;
    const dz = player.position.z - enemy.mesh.position.z;
    const hDist = Math.sqrt(dx*dx + dz*dz);
    
    if (hDist < 1.0 && Math.abs(player.position.y - enemy.mesh.position.y) < 1.5) {
      if (isSpinning) {
        // 敵を倒す（ぶっ飛ばす）
        enemy.dead = true;
        enemy.velocityY = 0.5; // 上に跳ね上がる
        // プレイヤーの反対側へ吹き飛ばす
        const blowDir = new THREE.Vector3().subVectors(enemy.mesh.position, player.position).normalize();
        
        // 吹き飛びアニメーション用ループを作るのは大変なので、毎フレーム position.add する簡易物理へ移行
        // ここでは初速を与える（が、enemy構造体にvelocityXがないので、
        // 簡易的に「死んだらその場で落下」にするか、
        // あるいは一瞬で遠くへ飛ばす）
        
        // 今回は「上に跳ねて、そのまま重力で落ちていく」処理にする（deadフラグで制御中）
        
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
    player.position.x += input.x * speed * timeScale;
    player.position.z += input.z * speed * timeScale;
    player.rotation.y = Math.atan2(input.x, input.z) + Math.PI;
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
    velocityY -= gravity * timeScale;
    player.position.y += velocityY * timeScale;
  }

  if (player.position.y < -10) gameOver();
  if (goalObj && player.position.distanceTo(goalPosition) < 1.5) gameClear();

  // スピンエフェクト同期
  if (isSpinning) {
    spinMesh.position.copy(player.position);
    spinMesh.rotation.y += 0.5 * timeScale;
  } else {
    // 隠すために遠くへ飛ばすか、opacity 0にする（実装済み）
    spinMesh.position.copy(player.position); // 位置だけ合わせとく
  }

  if (model) {
    model.position.copy(player.position);
    model.position.y -= 0.5;
    const q = new THREE.Quaternion().setFromEuler(player.rotation);
    model.quaternion.slerp(q, 0.2 * timeScale); 
    
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

function checkOnPlatform(obj: THREE.Mesh, platform: THREE.Mesh): boolean {
  const w = platform.geometry.parameters.width;
  const d = platform.geometry.parameters.depth;
  return (
    obj.position.x >= platform.position.x - w/2 &&
    obj.position.x <= platform.position.x + w/2 &&
    obj.position.z >= platform.position.z - d/2 &&
    obj.position.z <= platform.position.z + d/2
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
  const delta = clock.getDelta(); 
  const time = clock.getElapsedTime();
  if (mixer) mixer.update(delta);
  update(time, delta);
  
  const camOffset = new THREE.Vector3(0, 5, 8);
  const target = player.position.clone().add(camOffset);
  camera.position.lerp(target, 0.1);
  camera.lookAt(player.position);
  renderer.render(scene, camera);
}
animate();