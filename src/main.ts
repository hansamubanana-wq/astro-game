import './style.css'
import * as THREE from 'three'

// --- 1. シーンとカメラのセットアップ ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 10);
camera.lookAt(0, 0, 0);

// --- 2. レンダラーのセットアップ ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// --- 3. ライトの作成 ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(10, 20, 10);
dirLight.castShadow = true;
scene.add(dirLight);

// --- 4. オブジェクトの作成 ---
// 地面
const floorGeometry = new THREE.PlaneGeometry(20, 20);
const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x808080, side: THREE.DoubleSide });
const floor = new THREE.Mesh(floorGeometry, floorMaterial);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// プレイヤー
const playerGeometry = new THREE.BoxGeometry(1, 1, 1);
const playerMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
const player = new THREE.Mesh(playerGeometry, playerMaterial);
player.position.y = 0.5;
player.castShadow = true;
scene.add(player);

// --- 5. 入力管理（ここが追加部分） ---
// どのキーが押されているかを記録する箱
const keys: { [key: string]: boolean } = {
  w: false,
  a: false,
  s: false,
  d: false
};

// キーを押したとき
window.addEventListener('keydown', (event) => {
  const keyName = event.key.toLowerCase();
  if (keys.hasOwnProperty(keyName)) {
    keys[keyName] = true;
  }
});

// キーを離したとき
window.addEventListener('keyup', (event) => {
  const keyName = event.key.toLowerCase();
  if (keys.hasOwnProperty(keyName)) {
    keys[keyName] = false;
  }
});

// --- 6. 画面リサイズ対応 ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- 7. ゲームロジック ---
const speed = 0.1; // プレイヤーの移動速度

function update() {
  // WASDで移動処理
  // Z軸が「手前・奥」、X軸が「左右」
  if (keys['w']) player.position.z -= speed; // 奥へ
  if (keys['s']) player.position.z += speed; // 手前へ
  if (keys['a']) player.position.x -= speed; // 左へ
  if (keys['d']) player.position.x += speed; // 右へ
}

function animate() {
  requestAnimationFrame(animate);
  
  update(); // 移動処理を実行
  
  renderer.render(scene, camera);
}

animate();