import './style.css'
import * as THREE from 'three'
import nipplejs from 'nipplejs'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- ゲームの状態管理 ---
let isGameActive = true; 

// --- 1. シーン ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, 10, 60);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

// --- 2. レンダラー ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// --- 3. ライト ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(20, 50, 20);
dirLight.castShadow = true;
dirLight.shadow.camera.left = -30;
dirLight.shadow.camera.right = 30;
dirLight.shadow.camera.top = 30;
dirLight.shadow.camera.bottom = -30;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
scene.add(dirLight);

// --- 4. ステージ作成 ---
const platforms: THREE.Mesh[] = [];
const goalPosition = new THREE.Vector3();

function createPlatform(x: number, y: number, z: number, w: number, h: number, d: number, color: number) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshStandardMaterial({ color: color });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y - h / 2, z); 
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  platforms.push(mesh);
}

function buildStage() {
  createPlatform(0, 0, 0, 6, 2, 6, 0x66cc66); // Start
  createPlatform(0, 0, -8, 3, 2, 6, 0xffaa00);
  createPlatform(0, 0.5, -15, 2, 2, 2, 0xffaa00);
  createPlatform(3, 1.0, -18, 2, 2, 2, 0xffaa00);
  createPlatform(0, 1.5, -22, 2, 2, 2, 0xffaa00);
  createPlatform(0, 2.0, -28, 4, 1, 4, 0x4488ff);
  createPlatform(0, 3.0, -32, 4, 1, 4, 0x4488ff);
  createPlatform(0, 4.0, -36, 4, 1, 4, 0x4488ff);
  createPlatform(0, 4.0, -45, 1.5, 1, 10, 0xff5555); // 細道
  createPlatform(0, 4.0, -55, 8, 2, 8, 0x66cc66); // Goal
  goalPosition.set(0, 5.5, -55);
}
buildStage();

const goalGeometry = new THREE.OctahedronGeometry(1, 0);
const goalMaterial = new THREE.MeshPhongMaterial({ color: 0xffd700, shininess: 100, emissive: 0xaa6600 });
const goalObj = new THREE.Mesh(goalGeometry, goalMaterial);
goalObj.position.copy(goalPosition);
goalObj.castShadow = true;
scene.add(goalObj);

const playerGeometry = new THREE.BoxGeometry(0.8, 1, 0.8);
const playerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true, visible: false });
const player = new THREE.Mesh(playerGeometry, playerMaterial);
player.position.set(0, 2, 0);
scene.add(player);

// --- 5. 3Dモデル ---
let model: THREE.Group | undefined;
let mixer: THREE.AnimationMixer | undefined;
let actions: { [key: string]: THREE.AnimationAction } = {};
let activeAction: THREE.AnimationAction | undefined;

const loader = new GLTFLoader();
loader.load('https://threejs.org/examples/models/gltf/RobotExpressive/RobotExpressive.glb', (gltf) => {
  model = gltf.scene;
  model.scale.set(0.4, 0.4, 0.4); 
  model.traverse((child) => { if ((child as THREE.Mesh).isMesh) child.castShadow = true; });
  scene.add(model);

  mixer = new THREE.AnimationMixer(model);
  const animNames = ['Idle', 'Running', 'Jump', 'Death']; 
  animNames.forEach(name => {
    const clip = THREE.AnimationClip.findByName(gltf.animations, name);
    if (clip && mixer) actions[name] = mixer.clipAction(clip);
  });

  if (actions['Idle']) {
    activeAction = actions['Idle'];
    activeAction.play();
  }
});

function fadeToAction(name: string, duration: number) {
  if (!actions[name] || activeAction === actions[name]) return;
  const previousAction = activeAction;
  activeAction = actions[name];
  if (previousAction) previousAction.fadeOut(duration);
  activeAction.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(duration).play();
}

// --- 6. UI & 入力管理 ---
const uiMessage = document.getElementById('message-container') as HTMLElement;
const messageText = document.getElementById('message-text') as HTMLElement;
const retryBtn = document.getElementById('retry-btn') as HTMLElement;

retryBtn.addEventListener('click', () => {
  resetGame();
});

const input = { x: 0, z: 0 };
const keys: { [key: string]: boolean } = { w: false, a: false, s: false, d: false };
let jumpPressed = false;

window.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;
  if (e.code === 'Space') jumpPressed = true;
});
window.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
  if (e.code === 'Space') jumpPressed = false;
});

// ジャンプボタン制御
const jumpBtn = document.getElementById('jump-btn');
if (jumpBtn) {
  // ★重要修正：stopPropagation()を入れることで、
  // ボタンを押したタッチが「ジョイスティック」や「画面」に伝わるのを防ぎます
  jumpBtn.addEventListener('touchstart', (e) => {
    e.preventDefault(); 
    e.stopPropagation(); // ◀ これが「勝手に右に動く」を防ぐ鍵です
    jumpPressed = true;
  }, { passive: false });

  jumpBtn.addEventListener('touchend', (e) => {
    e.preventDefault();
    e.stopPropagation();
    jumpPressed = false;
  }, { passive: false });

  jumpBtn.addEventListener('mousedown', () => jumpPressed = true);
  jumpBtn.addEventListener('mouseup', () => jumpPressed = false);
}

// ジョイスティック設定（固定モード）
const joystickManager = nipplejs.create({
  // ★修正：左半分のエリアに限定して生成
  zone: document.getElementById('joystick-zone') as HTMLElement,
  mode: 'static',
  position: { left: '50%', top: '80%' }, // 左エリアの中での位置（中央下あたり）
  color: 'white',
  size: 100
});

joystickManager.on('move', (_evt, data) => {
  if (data && data.vector) {
    input.x = data.vector.x;
    input.z = -data.vector.y;
  }
});
joystickManager.on('end', () => { 
  input.x = 0; 
  input.z = 0; 
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- 7. ゲームロジック ---
const speed = 0.15;
const gravity = 0.015;
const jumpPower = 0.4;
let velocityY = 0;
let isGrounded = true;

function getGroundHeight(x: number, z: number): number {
  let groundY = -999; 
  for (const platform of platforms) {
    const width = platform.geometry.parameters.width;
    const depth = platform.geometry.parameters.depth;
    const height = platform.geometry.parameters.height;
    const topY = platform.position.y + height / 2;

    const minX = platform.position.x - width / 2;
    const maxX = platform.position.x + width / 2;
    const minZ = platform.position.z - depth / 2;
    const maxZ = platform.position.z + depth / 2;

    if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) {
      if (topY > groundY) groundY = topY;
    }
  }
  return groundY;
}

function resetGame() {
  player.position.set(0, 2, 0); 
  velocityY = 0;
  input.x = 0;
  input.z = 0;
  isGameActive = true;
  uiMessage.style.display = 'none';
  if (model) fadeToAction('Idle', 0.1);
}

function gameClear() {
  isGameActive = false;
  messageText.innerText = "GAME CLEAR!!";
  messageText.style.color = "#FFD700";
  uiMessage.style.display = 'flex';
  if (model) fadeToAction('Jump', 0.1);
}

function gameOver() {
  resetGame();
}

function updatePlayer() {
  if (!isGameActive) return;

  goalObj.rotation.y += 0.02;
  goalObj.rotation.x += 0.01;

  let moveX = 0;
  let moveZ = 0;
  if (keys['w']) moveZ -= 1;
  if (keys['s']) moveZ += 1;
  if (keys['a']) moveX -= 1;
  if (keys['d']) moveX += 1;

  if (moveX !== 0 || moveZ !== 0) {
    const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
    input.x = moveX / len;
    input.z = moveZ / len;
  } else if (!joystickManager.get(0)) {
    // 
  }

  const isMoving = input.x !== 0 || input.z !== 0;

  if (isMoving) {
    player.position.x += input.x * speed;
    player.position.z += input.z * speed;
    player.rotation.y = Math.atan2(input.x, input.z);
  }

  const groundHeight = getGroundHeight(player.position.x, player.position.z);
  const playerBottom = player.position.y - 0.5;

  if (playerBottom <= groundHeight + 0.1 && velocityY <= 0 && groundHeight > -100) {
    player.position.y = groundHeight + 0.5;
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

  if (player.position.y < -10) {
    gameOver();
  }

  const distToGoal = player.position.distanceTo(goalPosition);
  if (distToGoal < 1.5) {
    gameClear();
  }

  if (model) {
    model.position.copy(player.position);
    model.position.y -= 0.5; 
    const targetRot = new THREE.Quaternion().setFromEuler(player.rotation);
    model.quaternion.slerp(targetRot, 0.2);

    if (isGrounded) {
      if (isMoving) fadeToAction('Running', 0.2);
      else fadeToAction('Idle', 0.2);
    } else {
      fadeToAction('Jump', 0.1);
    }
  }
}

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  if (mixer) mixer.update(delta);
  updatePlayer();

  const cameraOffset = new THREE.Vector3(0, 5, 8);
  const targetPos = player.position.clone().add(cameraOffset);
  camera.position.lerp(targetPos, 0.1);
  camera.lookAt(player.position);

  renderer.render(scene, camera);
}

const clock = new THREE.Clock();
animate();