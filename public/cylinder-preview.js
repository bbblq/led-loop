/**
 * CylinderPreview — real-time 3D LED cylinder visualiser
 * Uses Three.js r128 (global THREE namespace).
 * Displays a completely static physical LED cylinder; text and background scroll on its texture.
 */
window.CylinderPreview = class CylinderPreview {
  constructor(container, ledCanvas) {
    this.container = container;
    this.ledCanvas = ledCanvas;
    this._animId = null;

    // Scale: 1 Three.js unit ≈ 5 LED pixels
    this.S = 5;
    const S = this.S;
    this.activeWidth = 1728;
    this.cylRadius  = this.activeWidth / (2 * Math.PI) / S; // radius for active perimeter
    this.cylHeight  = 800 / S;                               // = 160 units

    this._init();
  }

  setActiveWidth(activeWidth = 1728) {
    this.activeWidth = activeWidth;
    if (this.texture) {
      this.texture.repeat.set(activeWidth / 1920, 1);
    }
    const newRadius = activeWidth / (2 * Math.PI) / this.S;
    if (Math.abs(newRadius - this.cylRadius) > 0.1 && this.cylinder) {
      this.cylRadius = newRadius;
      this.cylinder.geometry.dispose();
      this.cylinder.geometry = new THREE.CylinderGeometry(newRadius, newRadius, this.cylHeight, 256, 1, true);
    }
  }

  _init() {
    const W = this.container.clientWidth;
    const H = this.container.clientHeight;

    /* ── Scene ── */
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x02020f);

    /* ── Camera (Fixed static viewpoint) ── */
    this.camera = new THREE.PerspectiveCamera(45, W / H, 0.5, 5000);
    this.camera.position.set(0, 0, 210);

    /* ── WebGL Renderer (NoToneMapping for 1:1 exact canvas color matching) ── */
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(W, H);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.container.appendChild(this.renderer.domElement);

    /* ── LED Canvas Texture ── */
    this.texture = new THREE.CanvasTexture(this.ledCanvas);
    this.texture.wrapS   = THREE.ClampToEdgeWrapping;
    this.texture.wrapT   = THREE.ClampToEdgeWrapping;
    this.texture.repeat.set(this.activeWidth / 1920, 1);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;

    /* ── Cylinder Mesh ── */
    const geoOuter = new THREE.CylinderGeometry(
      this.cylRadius, this.cylRadius, this.cylHeight,
      256, 1, true
    );
    const matOuter = new THREE.MeshBasicMaterial({
      map:  this.texture,
      side: THREE.FrontSide,
    });
    this.cylinder = new THREE.Mesh(geoOuter, matOuter);
    this.scene.add(this.cylinder);

    /* ── Caps (dark metallic) ── */
    const capGeo = new THREE.CircleGeometry(this.cylRadius, 256);
    const capMat = new THREE.MeshBasicMaterial({
      color: 0x0c0c1e,
    });
    const top = new THREE.Mesh(capGeo, capMat);
    top.rotation.x = -Math.PI / 2;
    top.position.y = this.cylHeight / 2;
    this.scene.add(top);

    const bot = new THREE.Mesh(capGeo, capMat);
    bot.rotation.x = Math.PI / 2;
    bot.position.y = -this.cylHeight / 2;
    this.scene.add(bot);

    /* ── Background Stars ── */
    this._addStars();

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
    this.texture.needsUpdate = true;
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

  destroy() {
    cancelAnimationFrame(this._animId);
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
};
