import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

let scene, camera, renderer, character, clock;
let isAnimating = false;
window.isAsh = false;
let cherryTexture;
const particles = [];
let lastParticleTime = 0;

// --- [CONFIGURACIÓN DEL COMPAÑERO] ---
// Modifica estos valores para ajustar el comportamiento de la carga 3D.
const ORBIT_RADIUS = 2.2;            // Radio de la circunferencia (distancia al centro)
const ORBIT_SPEED = 2.0;             // Velocidad de movimiento
const MODEL_SCALE_MULTIPLIER = 1.8;  // Tamaño del modelo GLTF
const ROTATION_DIRECTION = -1;       // -1 para Derecha a Izquierda, 1 para Izquierda a Derecha

function init() {
    console.log("Loading3D: Initializing...");
    const container = document.getElementById('loading-3d-container');
    if (!container) {
        console.warn("Loading3D: Container not found!");
        return;
    }

    scene = new THREE.Scene();

    // Camera setup
    const aspect = window.innerWidth / window.innerHeight;
    camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    camera.position.set(0, 1, 8);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.8);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.2);
    directionalLight.position.set(5, 10, 7);
    scene.add(directionalLight);

    clock = new THREE.Clock();

    loadSpiritModel();

    window.addEventListener('resize', onWindowResize);
    animate();
}

function loadSpiritModel() {
    if (character) {
        scene.remove(character);
        character = null;
    }

    const loader = new GLTFLoader();

    // Configuración de decodificadores para modelos comprimidos (Blender)
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
    loader.setDRACOLoader(dracoLoader);
    loader.setMeshoptDecoder(MeshoptDecoder);

    const textureLoader = new THREE.TextureLoader();

    // REMOVED ash.png fallback as requested
    const modelUrl = (window.currentSpirit && window.currentSpirit.gltf_url) || null;
    const textureUrl = (window.currentSpirit && window.currentSpirit.texture_url) || null;

    // Detect Ash Blossom for special effects
    window.isAsh = !!(modelUrl && modelUrl.toLowerCase().includes('ash.gltf'));
    console.log("Loading3D: isAsh =", window.isAsh);

    if (modelUrl) {
        if (modelUrl.toLowerCase().endsWith('.png') || modelUrl.toLowerCase().endsWith('.webp')) {
            textureLoader.load(modelUrl, (texture) => {
                const material = new THREE.SpriteMaterial({ map: texture });
                character = new THREE.Sprite(material);
                character.scale.set(2.5, 2.5, 1);
                scene.add(character);
                console.log(`Loading3D: Sprite ${modelUrl} loaded successfully`);
            });
        } else {
            loader.load(modelUrl, (gltf) => {
                console.log(`Loading3D: ${modelUrl} loaded successfully`);
                character = gltf.scene;

                // Ensure internal textures are rendered correctly with sRGB
                character.traverse((child) => {
                    if (child.isMesh && child.material) {
                        const materials = Array.isArray(child.material) ? child.material : [child.material];
                        materials.forEach(mat => {
                            if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
                            mat.needsUpdate = true;
                        });
                    }
                });

                const box = new THREE.Box3().setFromObject(character);
                const size = box.getSize(new THREE.Vector3());
                const maxDim = Math.max(size.x, size.y, size.z);

                // Usamos el multiplicador dinámico o el configurado al inicio del archivo
                const multiplier = (window.currentSpirit && window.currentSpirit.scale) ? window.currentSpirit.scale : MODEL_SCALE_MULTIPLIER;
                const scale = multiplier / maxDim;
                character.scale.set(scale, scale, scale);

                const center = box.getCenter(new THREE.Vector3());
                character.position.y = -center.y * scale;

                scene.add(character);
            }, undefined, (error) => {
                console.warn(`Error loading model ${modelUrl}:`, error);
            });
        }
    }

    // Load Particle Texture
    let particleAsset = (window.currentSpirit && window.currentSpirit.particle_asset) || 'cerezo.png';
    if (window.isAsh) particleAsset = 'cerezo.png'; // Force cerezo.png for Ash

    textureLoader.load(particleAsset, (texture) => {
        cherryTexture = texture;
    });
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function spawnParticle(pos) {
    if (!cherryTexture) return;

    const material = new THREE.SpriteMaterial({
        map: cherryTexture,
        transparent: true,
        opacity: 0.8
    });
    const p = new THREE.Sprite(material);

    p.position.copy(pos);

    // Use database configuration
    let movementType = (window.currentSpirit && window.currentSpirit.particle_movement_type) || 'falling';

    // Special handling for Ash Blossom displacement
    if (window.isAsh) {
        movementType = 'trail';
    }

    if (movementType === 'trail') {
        // Trail particles: spawn with offset to look like they come from the character
        const animType = (window.currentSpirit && window.currentSpirit.animation_type) || 'orbit';

        if (animType === 'float' && character) {
            // Spawn "behind" the character's rotation
            const angle = -character.rotation.y + Math.PI + (Math.random() - 0.5) * 0.8;
            const radius = 0.4 + Math.random() * 0.6;
            p.position.x += Math.sin(angle) * radius;
            p.position.z += Math.cos(angle) * radius;
            p.position.y += (Math.random() - 0.5) * 1.2;
        } else {
            // Orbit trail: shift particles slightly away from movement direction
            p.position.x += (Math.random() - 0.5) * 0.5;
            p.position.y += (Math.random() - 0.5) * 0.5;
            p.position.z += (Math.random() - 0.5) * 0.5;
        }

        // Displacement trail (particles move slowly or stay mostly in place)
        // For Ash, we ensure NO falling velocity (y=0)
        p.userData.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.01,
            window.isAsh ? (Math.random() - 0.5) * 0.005 : (Math.random() - 0.5) * 0.01,
            (Math.random() - 0.5) * 0.01
        );
        p.userData.movementType = 'trail';
    } else {
        // Default falling particles
        p.position.x += (Math.random() - 0.5) * 0.5;
        p.position.y += (Math.random() - 0.5) * 0.5;
        p.position.z += (Math.random() - 0.5) * 0.5;

        p.userData.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.02,
            -0.01 - Math.random() * 0.02, // Falling
            (Math.random() - 0.5) * 0.02
        );
        p.userData.movementType = 'falling';
    }

    const s = 0.2 + Math.random() * 0.3;
    p.scale.set(s, s, 1);

    p.userData.life = 1.0;
    p.userData.spawnTime = clock.getElapsedTime();

    scene.add(p);
    particles.push(p);
}

function updateParticles() {
    const time = clock.getElapsedTime();

    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.userData.life -= 0.01;

        // Apply movement
        if (p.userData.movementType === 'trail' && character) {
            const animType = (window.currentSpirit && window.currentSpirit.animation_type) || 'orbit';

            if (animType === 'orbit') {
                // For orbit: Particles lag slightly but generally stay where spawned to create a trail
                p.position.add(p.userData.velocity);
            } else if (animType === 'float') {
                // For float (rotating in place): Rotate particles around the character to simulate a spin trail
                const rotSpeed = 0.015;
                const cos = Math.cos(rotSpeed);
                const sin = Math.sin(rotSpeed);
                const x = p.position.x;
                const z = p.position.z;
                p.position.x = x * cos - z * sin;
                p.position.z = x * sin + z * cos;
                p.position.add(p.userData.velocity);
            }
        } else {
            p.position.add(p.userData.velocity);
        }

        p.material.opacity = p.userData.life * 0.8;
        const s = p.userData.life * 0.4;
        p.scale.set(s, s, 1);

        if (p.userData.life <= 0) {
            p.material.dispose();
            scene.remove(p);
            particles.splice(i, 1);
        }
    }
}

function animate() {
    requestAnimationFrame(animate);

    if (isAnimating) {
        const time = clock.getElapsedTime();
        const animType = (window.currentSpirit && window.currentSpirit.animation_type) || 'orbit';

        if (character) {
            if (animType === 'float') {
                character.position.x = 0;
                character.position.z = 0;
                character.position.y = Math.sin(time * 2) * 0.4;
                character.rotation.y += 0.01;
            } else if (animType === 'float-static') {
                character.position.x = 0;
                character.position.z = 0;
                character.position.y = Math.sin(time * 2) * 0.4;
                // No rotación en su propio eje
            } else {
                // Cálculo de posición orbital usando constantes configurables
                const x = ROTATION_DIRECTION * Math.sin(time * ORBIT_SPEED) * ORBIT_RADIUS;
                const z = Math.cos(time * ORBIT_SPEED) * ORBIT_RADIUS;

                character.position.x = x;
                character.position.z = z;

                // Oscilación vertical suave (arriba y abajo)
                character.position.y = Math.sin(time * 3) * 0.2;
            }

            // Generación de partículas
            const spawnInterval = window.isAsh ? 0.03 : 0.05;
            const pMovement = (window.currentSpirit && window.currentSpirit.particle_movement_type) || 'falling';

            if (time - lastParticleTime > spawnInterval && pMovement !== 'none') {
                // Si es Ash (o requiere estela), generamos partículas en la posición previa del orbit
                if (window.isAsh) {
                    const trailDelay = 0.15; // Retraso de la estela para que se vea por detrás
                    const trailTime = time - trailDelay;
                    const trailX = ROTATION_DIRECTION * Math.sin(trailTime * ORBIT_SPEED) * ORBIT_RADIUS;
                    const trailZ = Math.cos(trailTime * ORBIT_SPEED) * ORBIT_RADIUS;
                    const trailPos = new THREE.Vector3(trailX, character.position.y, trailZ);
                    spawnParticle(trailPos);
                } else {
                    spawnParticle(character.position.clone());
                }
                lastParticleTime = time;
            }
        }

        updateParticles();
        renderer.render(scene, camera);
    }
}

function updateLoadingScreen(active, message = null) {
    const screen = document.getElementById('loading-screen');
    const text = screen ? screen.querySelector('.loading-message') : null;

    if (screen) {
        if (active) screen.classList.add('active');
        else screen.classList.remove('active');
    }
    if (text && message) {
        text.textContent = message;
    }
}

window.addEventListener('show-loading', (e) => {
    isAnimating = true;
    updateLoadingScreen(true, e.detail ? e.detail.message : null);

    const newSpiritId = window.currentSpirit ? window.currentSpirit.id : null;
    if (scene) {
        if (window.lastLoadedSpiritId !== newSpiritId) {
            loadSpiritModel();
            window.lastLoadedSpiritId = newSpiritId;
        }
    } else {
        init();
        window.lastLoadedSpiritId = newSpiritId;
    }
});

window.addEventListener('hide-loading', () => {
    // EDIT HERE: Adjust this value to change how long the loading screen stays (in milliseconds)
    const LOADING_DELAY = 3000;

    setTimeout(() => {
        updateLoadingScreen(false);

        setTimeout(() => {
            if (!isAnimating) return;
            isAnimating = false;
            if (scene) {
                particles.forEach(p => {
                    if (p.material) p.material.dispose();
                    scene.remove(p);
                });
                particles.length = 0;
            }
        }, 600);
    }, LOADING_DELAY);
});

if (window.isLoading) {
    isAnimating = true;
    updateLoadingScreen(true, window.loadingMessage);
    if (!scene) {
        init();
    }
}
