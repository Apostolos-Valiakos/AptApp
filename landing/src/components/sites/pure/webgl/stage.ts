import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

import { StonesScene } from "./stones-scene";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The WebGL canvas behind the page; it draws the hero scene (the massage stones). */
export class Stage {
  readonly stones = new StonesScene();
  private renderer: THREE.WebGLRenderer;
  private height = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.stones.setEnvironment(pmrem.fromScene(new RoomEnvironment(), 0.04).texture);
    pmrem.dispose();
  }

  resize(width: number, height: number) {
    this.height = height;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(width, height, false);
  }

  render(rect: Rect, dt: number) {
    this.stones.update(dt, rect.width / Math.max(rect.height, 1));
    const y = this.height - rect.y - rect.height;
    this.renderer.setViewport(rect.x, y, rect.width, rect.height);
    this.renderer.setScissor(rect.x, y, rect.width, rect.height);
    this.renderer.setScissorTest(true);
    this.renderer.render(this.stones.scene, this.stones.camera);
  }

  dispose() {
    this.renderer.dispose();
  }
}
