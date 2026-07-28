/**
 * CylinderPreview — real-time 3D LED cylinder visualiser
 * Uses Three.js r128 (global THREE namespace).
 * The LED canvas is used as a live CanvasTexture that updates every frame.
 */
window.CylinderPreview = class CylinderPreview {
  constructor(container, ledCanvas) {
    this.container = container;
    this.ledCanvas = ledCanvas;
    this._animId = null;

    // Scale: 1 Three.js unit ≈ 5 LED pixels for comfortable camera distances
    this.S = 5;
    const S = this.S;
    this.cylRadius  = 1920 / (2 * Math.PI) / S; // ≈ 61  units
    this.cylHeight  = 800 / S;                   // = 160 units

    this._init();
  }

  _init() {
    const W = this.container.clientWidth;
    const H = this.container.clientHeight;

    /* ── Scene ── */
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x02020f);
    this.scene.fog = new THREE.FogExp2(0x02020f, 0.004);

    /* ── Camera ── */
    this.camera = new THREE.PerspectiveCamera(45, W / H, 0.5, 5000);
    this.camera.position.set(0, 20, 180);

    /* ── WebGL Renderer ── */
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(W, H);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.4;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    /* ── LED Canvas Texture ── */
    this.texture = new THREE.CanvasTexture(this.ledCanvas);
    this.texture.wrapS   = THREE.ClampToEdgeWrapping;
    this.texture.wrapT   = THREE.ClampToEdgeWrapping;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;

    /* ── Cylinder (outer surface, viewed from outside) ── */
    const geoOuter = new THREE.CylinderGeometry(
      this.cylRadius, this.cylRadius, this.cylHeight,
      256, 1, true   // open-ended, 256 segments for smooth silhouette
    );
    const matOuter = new THREE.MeshStandardMaterial({
      map:               this.texture,
      emissiveMap:       this.texture,
      emissive:          new THREE.Color(0xffffff),
      emissiveIntensity: 1.5,
      side:              THREE.FrontSide,
      roughness:         0.05,
      metalness:         0.0,
      transparent:       false,
    });
    this.cylinder = new THREE.Mesh(geoOuter, matOuter);
    this.scene.add(this.cylinder);

    /* ── Caps (dark metallic) ── */
    const capGeo = new THREE.CircleGeometry(this.cylRadius, 256);
    const capMat = new THREE.MeshStandardMaterial({
      color:    0x0a0a1a,
      metalness: 0.85,
      roughness: 0.25,
    });
    const top    = new THREE.Mesh(capGeo, capMat);
    top.rotation.x = -Math.PI / 2;
    top.position.y = this.cylHeight / 2;
    this.scene.add(top);

    const bot = new THREE.Mesh(capGeo, capMat.clone());
    bot.rotation.x = Math.PI / 2;
    bot.position.y = -this.cylHeight / 2;
    this.scene.add(bot);

    /* ── Glow halo (additive semi-transparent ring slightly larger) ── */
    const haloGeo = new THREE.CylinderGeometry(
      this.cylRadius + 0.8, this.cylRadius + 0.8, this.cylHeight,
      256, 1, true
    );
    const haloMat = new THREE.MeshBasicMaterial({
      map:         this.texture,
      side:        THREE.BackSide,
      transparent: true,
      opacity:     0.07,
      blending:    THREE.AdditiveBlending,
      depthWrite:  false,
    });
    this.scene.add(new THREE.Mesh(haloGeo, haloMat));

    /* ── Floor (reflective dark plane) ── */
    const floorGeo  = new THREE.PlaneGeometry(3000, 3000);
    const floorMat  = new THREE.MeshStandardMaterial({
      color:     0x050515,
      metalness: 0.6,
      roughness: 0.7,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y  = -this.cylHeight / 2 - 0.2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    /* ── Stars ── */
    this._addStars();

    /* ── Lights ── */
    const ambient = new THREE.AmbientLight(0x1a1a3a, 1.5);
    this.scene.add(ambient);

    const rim = new THREE.DirectionalLight(0x4466ff, 0.8);
    rim.position.set(-200, 300, -200);
    this.scene.add(rim);

    const fill = new THREE.PointLight(0x886699, 0.6, 600);
    fill.position.set(150, 80, 250);
    this.scene.add(fill);

    /* ── OrbitControls ── */
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping   = true;
    this.controls.dampingFactor   = 0.06;
    this.controls.minDistance     = 80;
    this.controls.maxDistance     = 500;
    this.controls.maxPolarAngle   = Math.PI * 0.75;
    this.controls.autoRotate      = true;
    this.controls.autoRotateSpeed = 0.4;
    this.controls.target.set(0, 0, 0);
    this.controls.update();

    /* ── Resize handler ── */
    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);

    /* ── Start loop ── */
    this._loop = this._loop.bind(this);
    this._loop();
  }

  _addStars() {
    const count     = 2500;
    const positions = new Float32Array(count * 3);
    const sizes     = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const r     = 1200 + Math.random() * 800;
      positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      sizes[i]             = 0.5 + Math.random() * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color:       0xffffff,
      size:        1.2,
      transparent: true,
      opacity:     0.55,
      sizeAttenuation: true,
    });
    this.scene.add(new THREE.Points(geo, mat));
  }

  _loop() {
    this._animId = requestAnimationFrame(this._loop);
    this.texture.needsUpdate = true;   // pull latest frame from LED canvas
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  _onResize() {
    if (!this.container.parentElement) return;
    const W = this.container.clientWidth;
    const H = this.container.clientHeight;
    this.camera.aspect = W / H;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(W, H);
  }

  /** Toggle auto-rotation; returns new state */
  toggleAutoRotate() {
    this.controls.autoRotate = !this.controls.autoRotate;
    return this.controls.autoRotate;
  }

  /** Reset camera to default position */
  resetCamera() {
    this.camera.position.set(0, 20, 180);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  destroy() {
    cancelAnimationFrame(this._animId);
    window.removeEventListener('resize', this._onResize);
    this.controls.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
};
