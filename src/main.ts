import './style.css'
import * as THREE from 'three'

// --- 1. シーンのセットアップ ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);

// カメラ設定（初期位置は後で上書きされますが、一旦定義）
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

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
dirLight.shadow.mapSize.width = 2048; // 影をきれいに
dirLight.shadow.mapSize.height = 2048;
scene.add(dirLight);

// --- 4. オブジェクトの作成 ---
// 地面（少し広くします：20 -> 40）
const floorGeometry = new THREE.PlaneGeometry(40, 40);
const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x808080, side: THREE.DoubleSide });
const floor = new THREE.Mesh(floorGeometry, floorMaterial);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// グリッドヘルパー（地面のマス目）を表示して、移動してる感覚を分かりやすくする
// GridHelper(サイズ, 分割数)
const gridHelper = new THREE.GridHelper(40, 40);
scene.add(gridHelper);

// プレイヤー
const playerGeometry = new THREE.BoxGeometry(1, 1, 1);
const playerMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
const player = new THREE.Mesh(playerGeometry, playerMaterial);
player.position.y = 0.5;
player.castShadow = true;
scene.add(player);

// --- 5. 入力管理 ---
const keys: { [key: string]: boolean } = {
  w: false, a: false, s: false, d: false
};

window.addEventListener('keydown', (e) => keys[e.key.toLowerCase()] = true);
window.addEventListener('keyup', (e) => keys[e.key.toLowerCase()] = false);

// --- 6. 画面リサイズ対応 ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- 7. ゲームロジック ---
const speed = 0.1;
// カメラとプレイヤーの距離（後ろに5、上に3 離れる）
const cameraOffset = new THREE.Vector3(0, 3, 5);

function updatePlayer() {
  if (keys['w']) player.position.z -= speed;
  if (keys['s']) player.position.z += speed;
  if (keys['a']) player.position.x -= speed;
  if (keys['d']) player.position.x += speed;
}

function updateCamera() {
  // 1. カメラの「理想の位置」を計算
  // プレイヤーの位置 + オフセット
  const targetPosition = player.position.clone().add(cameraOffset);
  
  // 2. 現在のカメラ位置から、理想の位置へ「少しだけ」移動させる（滑らかさの演出）
  // lerp(目標, 0.1) -> 距離の10%だけ近づく
  camera.position.lerp(targetPosition, 0.1);

  // 3. カメラは常にプレイヤーを見る
  camera.lookAt(player.position);
}

function animate() {
  requestAnimationFrame(animate);
  
  updatePlayer(); // プレイヤー移動
  updateCamera(); // カメラ追従
  
  renderer.render(scene, camera);
}

animate();