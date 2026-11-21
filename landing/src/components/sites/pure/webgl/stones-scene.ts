import * as THREE from "three";

const PALETTE = [
  { color: 0x1d1a19, count: 9, roughness: 0.34, clearcoat: 0.55 }, // basalt
  { color: 0xd8c6b0, count: 6, roughness: 0.75, clearcoat: 0 }, // sand
  { color: 0x9d8878, count: 4, roughness: 0.6, clearcoat: 0.1 }, // taupe
  { color: 0xf3ece2, count: 3, roughness: 0.85, clearcoat: 0 }, // chalk
];

interface Body {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  quaternion: THREE.Quaternion;
  spin: THREE.Vector3;
  scale: THREE.Vector3;
  radius: number;
  mesh: THREE.InstancedMesh;
  index: number;
}

/** A smooth, slightly irregular pebble: a sphere pushed around by low-frequency waves. */
function createPebbleGeometry() {
  const geometry = new THREE.SphereGeometry(1, 56, 36);
  const position = geometry.getAttribute("position");
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i);
    const wobble =
      1 +
      0.07 * Math.sin(v.x * 2.1 + 0.4) * Math.cos(v.z * 1.7) +
      0.05 * Math.sin(v.y * 2.6 + v.x * 1.3 + 1.2);
    v.multiplyScalar(wobble);
    position.setXYZ(i, v.x, v.y, v.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * The hero visual: massage stones drawn towards the centre, bumping into each
 * other and nudged aside by the pointer.
 */
export class StonesScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 2, 0.1, 100);
  private bodies: Body[] = [];
  private pointer = new THREE.Vector3(99, 99, 0);
  private pointerTarget = new THREE.Vector3(99, 99, 0);
  private raycaster = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private dummy = new THREE.Object3D();
  private tmp = new THREE.Vector3();
  private axis = new THREE.Vector3();
  private dq = new THREE.Quaternion();

  constructor() {
    this.scene.background = new THREE.Color(0xe7d9c8);
    this.camera.position.set(0, 0, 10);

    const key = new THREE.DirectionalLight(0xfff1dc, 2.4);
    key.position.set(-4, 7, 9);
    const rim = new THREE.DirectionalLight(0xffc98a, 0.9);
    rim.position.set(6, -3, 4);
    this.scene.add(key, rim, new THREE.HemisphereLight(0xfff6ea, 0x8a6f5a, 0.9));

    const geometry = createPebbleGeometry();
    for (const entry of PALETTE) {
      const material = new THREE.MeshPhysicalMaterial({
        color: entry.color,
        roughness: entry.roughness,
        clearcoat: entry.clearcoat,
        clearcoatRoughness: 0.35,
      });
      const mesh = new THREE.InstancedMesh(geometry, material, entry.count);
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      for (let i = 0; i < entry.count; i++) {
        const size = 0.7 + Math.random() * 0.65;
        const angle = Math.random() * Math.PI * 2;
        const distance = 9 + Math.random() * 6;
        this.bodies.push({
          position: new THREE.Vector3(Math.cos(angle) * distance, Math.sin(angle) * distance * 0.6, (Math.random() - 0.5) * 3),
          velocity: new THREE.Vector3(),
          quaternion: new THREE.Quaternion().setFromEuler(
            new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
          ),
          spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.6),
          // Flattened like a river stone.
          scale: new THREE.Vector3(size, size * (0.5 + Math.random() * 0.15), size * (0.72 + Math.random() * 0.2)),
          radius: size * 0.82,
          mesh,
          index: i,
        });
      }
    }
  }

  setEnvironment(texture: THREE.Texture) {
    this.scene.environment = texture;
    this.scene.environmentIntensity = 0.45;
  }

  /** Pointer position in normalised device coordinates of the hero rectangle. */
  setPointer(x: number, y: number, inside: boolean) {
    if (!inside) {
      this.pointerTarget.set(99, 99, 0);
      return;
    }
    this.raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);
    this.raycaster.ray.intersectPlane(this.plane, this.pointerTarget);
  }

  update(dt: number, aspect: number) {
    this.camera.aspect = aspect;
    // Keep the cluster a similar size in tall (mobile) frames.
    this.camera.position.z = aspect < 1 ? (10 / Math.max(aspect, 0.55)) * 0.62 : 10;
    this.camera.updateProjectionMatrix();

    if (this.pointerTarget.x > 50 || this.pointer.x > 50) this.pointer.copy(this.pointerTarget);
    else this.pointer.lerp(this.pointerTarget, 1 - Math.exp(-dt * 14));

    const step = Math.min(dt, 1 / 30);
    const bodies = this.bodies;
    for (const body of bodies) {
      // Pull towards the centre, wider than it is tall and shallow in depth.
      this.tmp.copy(body.position).multiplyScalar(-1.5);
      this.tmp.x *= 0.55;
      this.tmp.z *= 3;
      body.velocity.addScaledVector(this.tmp, step);

      this.tmp.copy(body.position).sub(this.pointer);
      this.tmp.z = 0;
      const distance = this.tmp.length();
      const reach = 2.4;
      if (distance < reach && distance > 1e-4) {
        const push = ((reach - distance) / reach) * 70;
        body.velocity.addScaledVector(this.tmp.normalize(), push * step);
        body.spin.x += this.tmp.y * push * step * 0.2;
        body.spin.y -= this.tmp.x * push * step * 0.2;
      }
    }

    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i];
        const b = bodies[j];
        this.tmp.copy(b.position).sub(a.position);
        const distance = this.tmp.length();
        const overlap = a.radius + b.radius - distance;
        if (overlap > 0 && distance > 1e-4) {
          this.tmp.multiplyScalar(1 / distance);
          a.position.addScaledVector(this.tmp, -overlap * 0.5);
          b.position.addScaledVector(this.tmp, overlap * 0.5);
          const relative = b.velocity.dot(this.tmp) - a.velocity.dot(this.tmp);
          if (relative < 0) {
            a.velocity.addScaledVector(this.tmp, relative * 0.5);
            b.velocity.addScaledVector(this.tmp, -relative * 0.5);
          }
          this.axis.crossVectors(this.tmp, a.velocity).multiplyScalar(0.015);
          a.spin.add(this.axis);
          b.spin.sub(this.axis);
        }
      }
    }

    const damping = Math.exp(-step * 2.4);
    const spinDamping = Math.exp(-step * 0.7);
    for (const body of bodies) {
      body.velocity.multiplyScalar(damping);
      body.position.addScaledVector(body.velocity, step);
      body.spin.multiplyScalar(spinDamping);
      const speed = body.spin.length();
      if (speed > 1e-5) {
        this.axis.copy(body.spin).multiplyScalar(1 / speed);
        this.dq.setFromAxisAngle(this.axis, Math.min(speed, 5) * step);
        body.quaternion.premultiply(this.dq);
      }
      this.dummy.position.copy(body.position);
      this.dummy.quaternion.copy(body.quaternion);
      this.dummy.scale.copy(body.scale);
      this.dummy.updateMatrix();
      body.mesh.setMatrixAt(body.index, this.dummy.matrix);
      body.mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
