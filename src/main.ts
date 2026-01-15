import './style.css'
import * as THREE from 'three'

// 1. シーンの作成（3D空間そのもの）
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB); // 空のような水色背景

// 2. カメラの作成（視点）
// PerspectiveCamera(視野角, 画面のアスペクト比, 近くの見える限界, 遠くの見える限界)
const camera = new THREE.PerspectiveCamera(
  75, 
  window.innerWidth / window.innerHeight, 
  0.1, 
  1000
);
// カメラを少し手前と上に引く
camera.position.z = 5;
camera.position.y = 2;
camera.lookAt(0, 0, 0); // 原点（0,0,0）を見る

// 3. レンダラーの作成（描画機能）
const renderer = new THREE.WebGLRenderer({ antialias: true }); // ジャギーを軽減
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// 4. 物体の作成（テスト用の緑色の箱）
// 形状（ジオメトリ）
const geometry = new THREE.BoxGeometry(1, 1, 1);
// 素材（マテリアル）
const material = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
// メッシュ化（形状＋素材）
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);

// 5. ライトの作成（今回はBasicMaterialなので光の影響を受けないが、未来のために置いておく）
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

// 6. 画面リサイズ対応
// ブラウザのサイズが変わったときにカメラと描画領域を合わせる
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// 7. アニメーションループ（ゲームの心臓部）
// 1秒間に約60回実行される
function animate() {
  requestAnimationFrame(animate);

  // 箱を回転させる
  cube.rotation.x += 0.01;
  cube.rotation.y += 0.01;

  // 描画実行
  renderer.render(scene, camera);
}

// ループ開始
animate();