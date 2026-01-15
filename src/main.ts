import './style.css'
import * as THREE from 'three'
import nipplejs from 'nipplejs'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- ゲーム状態 ---
let currentLevel = 1;
let isGameActive = false;

// --- 1. シーン初期化 ---
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
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

// 背景
const skyGeo = new THREE.SphereGeometry(500, 32, 32);
const skyMat = new THREE.MeshBasicMaterial({
  map: textureLoader.load('https://threejs.org/examples/textures/2294472375_24a3b8ef46_o.jpg'),
  side: THREE.BackSide
});
const sky = new THREE.Mesh(skyGeo, skyMat);
scene.add(sky);

// --- オブジェクト管理 ---
let platforms: THREE.Mesh[] = [];
let enemies: { mesh: THREE.Mesh, basePos: THREE.Vector3, axis: 'x'|'z', range: number, speed: number, offset: number }[] = [];
let goalObj: THREE.Mesh | undefined;
let goalPosition = new THREE.Vector3();

const crateTexture = textureLoader.load('https://threejs.org/examples/textures/crate.gif');
crateTexture.colorSpace = THREE.SRGBColorSpace;

function clearStage() {
  platforms.forEach(p => scene.remove(p));
  enemies.forEach(e => scene.remove(e.mesh));
  if (goalObj) scene.remove(goalObj);
  platforms = [];
  enemies = [];
}

function createPlatform(x: number, y: number, z: number, w: number, h: number, d: number) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshStandardMaterial({ 
    map: crateTexture, 
    roughness: 0.8,    
    metalness: 0.1     
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y - h / 2, z); 
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  platforms.push(mesh);
}

function createEnemy(x: number, y: number, z: number, axis: 'x'|'z', range: number, speed: number) {
  const geo = new THREE.IcosahedronGeometry(0.4, 0); 
  const mat = new THREE.MeshStandardMaterial({ color: 0xff0000, roughness: 0.3, metalness: 0.7, emissive: 0x330000 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  scene.add(mesh);
  enemies.push({ mesh, basePos: new THREE.Vector3(x, y, z), axis, range, speed, offset: Math.random() * 6 });
}

function createGoal(x: number, y: number, z: number) {
  const geo = new THREE.OctahedronGeometry(1, 0);
  const mat = new THREE.MeshPhongMaterial({ color: 0xffd700, shininess: 100, emissive: 0xaa6600 });
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
    showStory("【STAGE 1: 訓練場】<br>兵士よ、訓練開始だ。<br>この体でアスレチックを走破せよ！");
    createPlatform(0, 0, 0, 6, 2, 6);
    createPlatform(0, 0, -10, 4, 2, 10);
    createPlatform(0, 1, -20, 3, 1, 3);
    createPlatform(0, 2, -25, 3, 1, 3);
    createPlatform(0, 3, -35, 6, 2, 6);
    createGoal(0, 4.5, -35);
  
  } else if (level === 2) {
    showStory("【STAGE 2: 敵基地潜入】<br>赤いドローンを回避せよ。<br>人間離れした動きで突破するんだ。");
    createPlatform(0, 0, 0, 6, 2, 6);
    createPlatform(0, 0, -10, 3, 1, 8);
    createEnemy(0, 1.0, -10, 'z', 3, 2);
    createPlatform(0, 0, -20, 8, 1, 3);
    createEnemy(-2, 1.0, -20, 'x', 2, 3);
    createEnemy(2, 1.0, -20, 'x', 2, 3);
    createPlatform(0, 1, -30, 2, 1, 10);
    createEnemy(0, 1.9, -30, 'z', 4, 4);
    createPlatform(0, 1, -45, 6, 2, 6);
    createGoal(0, 2.5, -45);
  
  } else if (level === 3) {
    showStory("【FINAL STAGE: 天空の決戦】<br>これが最後の任務だ。<br>必ず生きて帰還せよ！");
    createPlatform(0, 0, 0, 6, 2, 6);
    createPlatform(0, 0, -12, 2, 1, 2);
    createPlatform(3, 1, -15, 2, 1, 2);
    createPlatform(-3, 2, -18, 2, 1, 2);
    createPlatform(0, 3, -25, 10, 1, 4);
    createEnemy(-4, 3.9, -25, 'x', 4, 5);
    createEnemy(4, 3.9, -25, 'x', 4, 5);
    createPlatform(0, 4, -35, 1.5, 1, 8);
    createEnemy(0, 4.9, -35, 'z', 3, 6);
    createPlatform(0, 5, -50, 8, 2, 8);
    createGoal(0, 6.5, -50);
  } else {
    showStory("【MISSION COMPLETE】<br>任務完了！<br>素晴らしい働きだった！");
    isGameActive = false;
    goalObj = undefined;
  }
}

// --- プレイヤー & モデル ---
const playerGeometry = new THREE.BoxGeometry(0.8, 1, 0.8);
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
    else if (name === 'Death') name = 'Idle';
    else return;
  }
  
  if (activeAction === actions[name]) return;
  
  const previousAction = activeAction;
  activeAction = actions[name];
  if (previousAction) previousAction.fadeOut(duration);
  
  activeAction
    .reset()
    .setEffectiveTimeScale(1.0)
    .setEffectiveWeight(1)
    .fadeIn(duration)
    .play();
}

// --- UI制御 ---
const storyBox = document.getElementById('story-box') as HTMLElement;
const storyText = document.getElementById('story-text') as HTMLElement;
const nextBtn = document.getElementById('next-btn') as HTMLElement;
const messageContainer = document.getElementById('message-container') as HTMLElement;
const bigMessage = document.getElementById('big-message') as HTMLElement;
const retryBtn = document.getElementById('retry-btn') as HTMLElement;

function showStory(text: string) {
  isGameActive = false;
  storyBox.style.display = 'flex';
  storyText.innerHTML = text;
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
  keys[e.key.toLowerCase()] = true;
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') jumpPressed = false;
  keys[e.key.toLowerCase()] = false;
});

const jumpBtn = document.getElementById('jump-btn');
if (jumpBtn) {
  jumpBtn.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); jumpPressed = true; }, { passive: false });
  jumpBtn.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); jumpPressed = false; }, { passive: false });
  jumpBtn.addEventListener('mousedown', () => jumpPressed = true);
  jumpBtn.addEventListener('mouseup', () => jumpPressed = false);
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

function update(time: number) {
  if (!isGameActive) return;

  if (goalObj) {
    goalObj.rotation.y += 0.02;
    goalObj.rotation.x += 0.01;
  }

  for (const enemy of enemies) {
    const move = Math.sin(time * enemy.speed + enemy.offset) * enemy.range;
    if (enemy.axis === 'x') enemy.mesh.position.x = enemy.basePos.x + move;
    else enemy.mesh.position.z = enemy.basePos.z + move;
    enemy.mesh.rotation.x += 0.05;
    enemy.mesh.rotation.y += 0.05;

    if (player.position.distanceTo(enemy.mesh.position) < 0.8) {
      gameOver();
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
    player.position.x += input.x * speed;
    player.position.z += input.z * speed;
    // ★ここが修正ポイント：Math.PIを足して180度回転させる
    player.rotation.y = Math.atan2(input.x, input.z) + Math.PI;
  }

  let groundY = -999;
  for (const p of platforms) {
    const w = p.geometry.parameters.width;
    const d = p.geometry.parameters.depth;
    const h = p.geometry.parameters.height;
    const top = p.position.y + h/2;
    if (player.position.x >= p.position.x - w/2 && player.position.x <= p.position.x + w/2 &&
        player.position.z >= p.position.z - d/2 && player.position.z <= p.position.z + d/2) {
      if (top > groundY) groundY = top;
    }
  }

  const pBottom = player.position.y - 0.5;
  if (pBottom <= groundY + 0.1 && velocityY <= 0 && groundY > -100) {
    player.position.y = groundY + 0.5;
    velocityY = 0;
    isGrounded = true;
  } else {
    isGrounded = false;
  }

  if (jumpPressed && isGrounded) {
    velocityY = jumpPower;
    isGrounded = false;
    fadeToAction('Jump', 0.1);
  }

  if (!isGrounded) {
    velocityY -= gravity;
    player.position.y += velocityY;
  }

  if (player.position.y < -10) gameOver();

  if (goalObj && player.position.distanceTo(goalPosition) < 1.5) {
    gameClear();
  }

  if (model) {
    model.position.copy(player.position);
    model.position.y -= 0.5;
    const q = new THREE.Quaternion().setFromEuler(player.rotation);
    model.quaternion.slerp(q, 0.2);
    
    if (isGrounded) {
      if (isMoving) {
        fadeToAction('Run', 0.2);
        // 足が速すぎるのを防ぐため速度調整（0.7倍）
        if (activeAction) activeAction.setEffectiveTimeScale(0.7);
      } else {
        fadeToAction('Idle', 0.2);
      }
    } else {
      fadeToAction('Jump', 0.1);
    }
  }
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
  update(time);
  
  const camOffset = new THREE.Vector3(0, 5, 8);
  const target = player.position.clone().add(camOffset);
  camera.position.lerp(target, 0.1);
  camera.lookAt(player.position);
  renderer.render(scene, camera);
}
animate();