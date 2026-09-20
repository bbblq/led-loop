window.LEDRenderer = class LEDRenderer {
  constructor(canvas) {
    if (!canvas || canvas.width !== 1920 || canvas.height !== 800) {
      console.warn('LEDRenderer: canvas should be exactly 1920x800 for optimal cylindrical rendering.');
    }
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.canvasW = canvas.width;
    this.canvasH = canvas.height;

    this.DEFAULT_CONFIG = {
      text: '★ 欢迎光临 ★ Welcome ★',
      fontSize: 120,
      fontWeight: '700',
      fontFamily: '', // empty = use default 'Noto Sans SC', 'Inter'
      textColor: '#ffffff',
      textGap: 200,
      textGlow: true,
      textShadow: false,
      textOutline: false,
      outlineColor: '#000000',
      scrollSpeed: 3,
      activeWidth: 1760, // Default active perimeter (1760px)
      textVertical: 50, // percentage 0-100
      bgType: 'gradient-flow',
      bgColor1: '#0a0a2e',
      bgColor2: '#1a1a4e',
      bgSpeed: 1,
      bgVideo: '', // URL to video file
      bgImageUrl: '', // URL to background image
      showLogo: false,
      logoUrl: '',
      logoSize: 150,
      logoPosX: 880, // center point X in px
      logoPosY: 150, // center point Y in px
      logoOpacity: 100
    };

    this._config = { ...this.DEFAULT_CONFIG };
    
    // Internal state
    this.textOffsetX = 0;
    this.bgOffsetX = 0;
    this.bgTime = 0;
    this._isPlaying = false;
    this.animationId = null;
    this.lastTime = 0;
    this.videoEl = null;
    this._loopRenderMode = false;  // true during loop recording — disables stateful updates
    this._cachedEffectivePeriod = null; // cached from computeLoopFrames

    // Offscreen canvas for seamless background cylinder scrolling
    this.offscreen = document.createElement('canvas');
    this.offscreen.width = this.canvasW;
    this.offscreen.height = this.canvasH;
    this.offscreenCtx = this.offscreen.getContext('2d');

    // Particles init
    this.particles = [];
    for (let i = 0; i < 200; i++) {
      this.particles.push({
        x: Math.random() * this.canvasW,
        y: Math.random() * this.canvasH,
        size: Math.random() * 2 + 0.5,
        speedX: Math.random() * 0.5 + 0.1,
        blinkSpeed: Math.random() * 0.05 + 0.01,
        phase: Math.random() * Math.PI * 2
      });
    }

    // Matrix characters
    this.matrixChars = [];
    for (let i = 0; i < 50; i++) {
      this.matrixChars.push({
        x: Math.random() * this.canvasW,
        y: Math.random() * this.canvasH,
        speedY: Math.random() * 2 + 1,
        char: String.fromCharCode(0x30A0 + Math.random() * 95),
        phase: Math.random() * Math.PI * 2
      });
    }

    this.animate = this.animate.bind(this);
  }

  get config() {
    return this._config;
  }

  updateConfig(config) {
    const oldLogoUrl = this._config?.logoUrl;
    const oldBgImageUrl = this._config?.bgImageUrl;
    this._config = { ...this._config, ...config };
    if (config.logoUrl !== undefined && config.logoUrl !== oldLogoUrl) {
      this.loadLogo(config.logoUrl);
    }
    if (config.bgImageUrl !== undefined && config.bgImageUrl !== oldBgImageUrl) {
      this.loadBgImage(config.bgImageUrl);
    }
  }

  loadLogo(logoUrl) {
    if (!logoUrl) {
      this.logoImg = null;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.logoImg = img;
        resolve(img);
      };
      img.onerror = (err) => {
        console.warn('Failed to load logo image:', logoUrl, err);
        this.logoImg = null;
        resolve(null);
      };
      let src = logoUrl;
      if (!src.startsWith('/')) {
        src = `/uploads/logos/${encodeURIComponent(logoUrl)}`;
      } else {
        const parts = src.split('/');
        const filename = parts.pop();
        src = parts.join('/') + '/' + encodeURIComponent(decodeURIComponent(filename));
      }
      img.src = src;
    });
  }

  loadBgImage(bgImageUrl) {
    if (!bgImageUrl) {
      this.bgImg = null;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.bgImg = img;
        resolve(img);
      };
      img.onerror = (err) => {
        console.warn('Failed to load background image:', bgImageUrl, err);
        this.bgImg = null;
        resolve(null);
      };
      let src = bgImageUrl;
      if (!src.startsWith('/')) {
        src = `/uploads/bgimages/${encodeURIComponent(bgImageUrl)}`;
      } else {
        const parts = src.split('/');
        const filename = parts.pop();
        src = parts.join('/') + '/' + encodeURIComponent(decodeURIComponent(filename));
      }
      img.src = src;
    });
  }

  setVideoElement(videoEl) {
    this.videoEl = videoEl;
  }

  async loadFont(fontFamily, fontUrl) {
    if (!fontUrl) return;
    try {
      const font = new FontFace(fontFamily, `url(${fontUrl})`);
      await font.load();
      document.fonts.add(font);
      console.log(`Font ${fontFamily} loaded successfully.`);
    } catch (err) {
      console.error(`Failed to load font ${fontFamily}:`, err);
    }
  }

  start() {
    if (this._isPlaying) return;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this._isPlaying = true;
    this.lastTime = performance.now();
    this.animationId = requestAnimationFrame(this.animate);
  }

  stop() {
    this._isPlaying = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  get isPlaying() {
    return this._isPlaying;
  }

  animate(time) {
    if (!this._isPlaying) return;
    const dt = time - this.lastTime;
    this.lastTime = time;
    this.renderFrame(dt);
    this.animationId = requestAnimationFrame(this.animate);
  }

  hexToRgb(hex) {
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const bigint = parseInt(hex, 16);
    return {
      r: (bigint >> 16) & 255,
      g: (bigint >> 8) & 255,
      b: bigint & 255
    };
  }

  renderFrame(dt) {
    const ctx = this.ctx;
    const w = this.canvasW;
    const h = this.canvasH;
    const cfg = this._config;

    // Update internal timers
    this.bgTime += dt * cfg.bgSpeed;
    this.textOffsetX += cfg.scrollSpeed * (dt / 16.666); // approx 60fps base

    // Render Background in-place (ambient breathing & pulsing motion, independent of text scroll)
    ctx.save();
    this.renderBackground(ctx, w, h, this.bgTime, cfg.bgSpeed, cfg.bgColor1, cfg.bgColor2, cfg.bgType);
    ctx.restore();

    // Render Text
    ctx.save();
    this.renderText(ctx, w, h, cfg);
    ctx.restore();

    // Render Logo Watermark / Icon
    ctx.save();
    this.renderLogo(ctx, w, h, cfg);
    ctx.restore();
  }

  renderLogo(ctx, w, h, cfg) {
    if (!cfg.showLogo || !this.logoImg) return;

    const img = this.logoImg;
    if (!img.complete || img.naturalWidth === 0) return;

    const aspect = img.naturalHeight / img.naturalWidth;
    const sizeW = Math.max(20, cfg.logoSize || 150);
    const sizeH = sizeW * aspect;

    const loopW = cfg.activeWidth || w;
    const centerX = cfg.logoPosX !== undefined ? cfg.logoPosX : (loopW / 2);
    const centerY = cfg.logoPosY !== undefined ? cfg.logoPosY : (h / 2);
    const baseX = centerX - sizeW / 2;
    const posY = centerY - sizeH / 2;
    const opacity = Math.min(1, Math.max(0.05, (cfg.logoOpacity ?? 100) / 100));

    ctx.save();
    ctx.globalAlpha = opacity;

    for (let k = -1; k <= Math.ceil(w / loopW); k++) {
      const drawX = baseX + k * loopW;
      if (drawX + sizeW >= 0 && drawX <= w) {
        ctx.drawImage(img, drawX, posY, sizeW, sizeH);
      }
    }

    ctx.restore();
  }

  renderBackground(ctx, w, h, t, speed, color1, color2, type) {
    ctx.fillStyle = color1;
    ctx.fillRect(0, 0, w, h);

    const tSec = t / 1000;
    const rgb1 = this.hexToRgb(color1);
    const rgb2 = this.hexToRgb(color2);
    const cfg = this._config;
    const loopW = cfg.activeWidth || w;

    switch (type) {
      case 'gradient-flow': {
        // Horizontal periodic gradient over loopW (color1 -> color2 -> color1)
        const grad = ctx.createLinearGradient(0, 0, loopW, 0);
        grad.addColorStop(0, color1);
        grad.addColorStop(0.5, color2);
        grad.addColorStop(1, color1);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        
        // Light streaks using spatial frequency periodic over loopW
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = `rgba(${rgb2.r}, ${rgb2.g}, ${rgb2.b}, 0.35)`;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 15) {
          const normX = (x % loopW) / loopW;
          const wave = Math.sin(normX * Math.PI * 2 + tSec * 0.8);
          const y1 = h * 0.3 + wave * 80;
          if (x === 0) ctx.moveTo(x, y1);
          else ctx.lineTo(x, y1);
        }
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'particles': {
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, color1);
        grad.addColorStop(1, color2);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = '#ffffff';
        for (let p of this.particles) {
          if (!this._loopRenderMode) {
            p.x -= p.speedX * speed * 2;
            if (p.x < 0) p.x += loopW;
            if (p.x >= loopW) p.x -= loopW;
          }
          
          const alpha = (Math.sin(tSec * p.blinkSpeed * 100 + p.phase) + 1) / 2;
          ctx.globalAlpha = 0.2 + alpha * 0.8;
          
          for (let k = -1; k <= Math.ceil(w / loopW); k++) {
            const px = p.x + k * loopW;
            if (px >= -20 && px <= w + 20) {
              ctx.beginPath();
              ctx.arc(px, p.y, p.size, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
        ctx.globalAlpha = 1.0;
        break;
      }
      case 'wave': {
        ctx.fillStyle = color1;
        ctx.fillRect(0, 0, w, h);
        
        for (let i = 0; i < 4; i++) {
          const m1 = i + 1;
          const m2 = (i + 2) * 2;
          ctx.beginPath();
          ctx.moveTo(0, h);
          
          for (let x = 0; x <= w; x += 15) {
            const normX = (x % loopW) / loopW;
            const y = h * 0.5 
              + Math.sin(normX * Math.PI * 2 * m1 + tSec + i) * 80 
              + Math.cos(normX * Math.PI * 2 * m2 - tSec * 1.5) * 40;
            ctx.lineTo(x, y + i * 35 - 50);
          }
          
          ctx.lineTo(w, h);
          ctx.lineTo(0, h);
          ctx.fillStyle = `rgba(${rgb2.r}, ${rgb2.g}, ${rgb2.b}, ${0.15 + i * 0.05})`;
          ctx.fill();
        }
        break;
      }
      case 'solid': {
        // already filled with color1
        break;
      }
      case 'matrix': {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, w, h);
        
        ctx.font = '24px monospace';
        ctx.textAlign = 'center';
        for (let m of this.matrixChars) {
          if (!this._loopRenderMode) {
            m.y += m.speedY * speed * 5;
            if (m.y > h + 30) {
              m.y = -30;
              m.x = Math.random() * loopW;
              m.char = String.fromCharCode(0x30A0 + Math.random() * 95);
            }
            if (Math.random() < 0.05) {
              m.char = String.fromCharCode(0x30A0 + Math.random() * 95);
            }
          }
          const alpha = (Math.sin(tSec * 2 + m.phase) + 1) / 2;
          ctx.fillStyle = `rgba(0, 255, 0, ${0.3 + alpha * 0.7})`;
          for (let k = -1; k <= Math.ceil(w / loopW); k++) {
            const mx = m.x + k * loopW;
            if (mx >= -30 && mx <= w + 30) {
              ctx.fillText(m.char, mx, m.y);
            }
          }
        }
        break;
      }
      case 'aurora': {
        ctx.fillStyle = '#050510';
        ctx.fillRect(0, 0, w, h);
        
        const colors = [
          'rgba(75, 0, 130, 0.4)',  // indigo
          'rgba(0, 255, 128, 0.3)',  // green
          'rgba(128, 0, 128, 0.4)', // purple
          'rgba(255, 105, 180, 0.3)',// pink
          'rgba(0, 255, 255, 0.3)'   // cyan
        ];
        
        ctx.globalCompositeOperation = 'screen';
        for (let i = 0; i < 5; i++) {
          const m1 = i + 1;
          const m2 = i + 2;
          ctx.beginPath();
          ctx.moveTo(0, h);
          for (let x = 0; x <= w; x += 15) {
            const normX = (x % loopW) / loopW;
            const y = h * 0.3 
              + Math.sin(normX * Math.PI * 2 * m1 + tSec * 0.5 + i * 1.2) * 140 
              + Math.cos(normX * Math.PI * 2 * m2 - tSec * 0.3) * 90;
            ctx.lineTo(x, y + i * 20);
          }
          ctx.lineTo(w, h);
          ctx.lineTo(0, h);
          ctx.fillStyle = colors[i];
          ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'neon-pulse': {
        ctx.fillStyle = '#020205';
        ctx.fillRect(0, 0, w, h);
        
        const lines = 7;
        ctx.lineWidth = 4;
        ctx.shadowColor = color2;
        ctx.strokeStyle = color1;
        
        for (let i = 0; i < lines; i++) {
          const y = h * 0.15 + i * (h * 0.7 / lines);
          const pulse = (Math.sin(tSec * 2 + i) + 1) / 2;
          ctx.globalAlpha = 0.3 + pulse * 0.7;
          ctx.shadowBlur = 10 + pulse * 20;
          
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }
        ctx.globalAlpha = 1.0;
        ctx.shadowBlur = 0;
        break;
      }
      case 'nebula': {
        ctx.fillStyle = '#020108';
        ctx.fillRect(0, 0, w, h);
        
        ctx.globalCompositeOperation = 'screen';
        const circles = [
          { r: 400, color: 'rgba(50, 10, 80, 0.6)', phase: 0, speed: 0.2 },
          { r: 500, color: 'rgba(10, 30, 90, 0.5)', phase: 2, speed: -0.15 },
          { r: 350, color: 'rgba(80, 10, 40, 0.5)', phase: 4, speed: 0.3 },
          { r: 600, color: 'rgba(20, 50, 70, 0.4)', phase: 1, speed: -0.2 }
        ];
        
        for (let i = 0; i < circles.length; i++) {
          const c = circles[i];
          const cxBase = loopW / 2 + Math.cos(tSec * c.speed + c.phase) * (loopW * 0.3);
          const cy = h / 2 + Math.sin(tSec * c.speed + c.phase) * (h * 0.3);
          
          for (let k = -1; k <= Math.ceil(w / loopW); k++) {
            const cx = cxBase + k * loopW;
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, c.r);
            grad.addColorStop(0, c.color);
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(cx, cy, c.r, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'cyber-grid': {
        // Deep cyberpunk dark background with gradient glow
        const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
        bgGrad.addColorStop(0, '#03030c');
        bgGrad.addColorStop(0.5, color1);
        bgGrad.addColorStop(1, '#020208');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);

        ctx.lineWidth = 2;
        ctx.shadowColor = color2;
        ctx.shadowBlur = 8;
        ctx.strokeStyle = color2;

        const gridCols = 20; // 20 vertical pillars around loopW
        const colSpacing = loopW / gridCols;

        // 1. Vertical straight neon grid lines (perfect 360-degree cylinder wireframe)
        for (let x = 0; x <= w; x += colSpacing) {
          const modX = ((x % loopW) + loopW) % loopW;
          const pulse = 0.4 + 0.6 * (Math.sin(modX * Math.PI * 2 / loopW * 4 + tSec * 2) + 1) / 2;
          ctx.globalAlpha = pulse;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
          ctx.stroke();
        }
        ctx.globalAlpha = 1.0;

        // 2. Horizontal perspective moving neon rings
        const startY = h * 0.05;
        const endY = h * 0.95;
        const tMod = (Math.sin(tSec * 2) + 1) / 2;
        const lineCount = 14;
        
        ctx.shadowBlur = 12;
        for (let i = 0; i < lineCount; i++) {
          const p = (i + tMod) / lineCount;
          const y = startY + Math.pow(p, 1.8) * (endY - startY);
          const alpha = 0.2 + p * 0.8;
          
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = color2;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }

        // 3. Cyber Scanning Laser Beam (glowing white/cyan horizontal laser)
        const scanP = (Math.sin(tSec * 1.5) + 1) / 2;
        const scanY = startY + scanP * (endY - startY);
        ctx.globalAlpha = 0.9;
        ctx.shadowBlur = 20;
        ctx.shadowColor = color1;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, scanY);
        ctx.lineTo(w, scanY);
        ctx.stroke();

        ctx.globalAlpha = 1.0;
        ctx.shadowBlur = 0;
        break;
      }
      case 'flame': {
        ctx.fillStyle = '#1a0000';
        ctx.fillRect(0, 0, w, h);
        
        ctx.globalCompositeOperation = 'screen';
        const colWidth = 20;
        const cols = Math.ceil(w / colWidth);
        
        for (let i = 0; i < cols; i++) {
          const x = i * colWidth;
          const normX = (x % loopW) / loopW;
          const noise = Math.sin(normX * Math.PI * 2 * 6 + tSec * 5) + Math.sin(normX * Math.PI * 2 * 12 - tSec * 2);
          const flameH = h * 0.4 + noise * h * 0.25;
          
          const grad = ctx.createLinearGradient(0, h, 0, Math.max(0, h - flameH));
          grad.addColorStop(0, 'rgba(255, 50, 0, 0.8)');
          grad.addColorStop(0.4, 'rgba(255, 150, 0, 0.6)');
          grad.addColorStop(0.8, 'rgba(255, 255, 0, 0.2)');
          grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          
          ctx.fillStyle = grad;
          ctx.fillRect(x, h - flameH, colWidth + 1, flameH);
        }
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'golden-ribbon': {
        // 金波华章 — Deep ceremonial base with flowing golden light ribbons
        const grBase = ctx.createLinearGradient(0, 0, 0, h);
        grBase.addColorStop(0, '#0a0318');
        grBase.addColorStop(0.4, color1);
        grBase.addColorStop(0.7, '#120824');
        grBase.addColorStop(1, '#050210');
        ctx.fillStyle = grBase;
        ctx.fillRect(0, 0, w, h);

        ctx.globalCompositeOperation = 'screen';
        // 5 flowing golden light ribbon bands
        const ribbonColors = [
          'rgba(255, 215, 80, 0.25)',
          'rgba(255, 190, 60, 0.20)',
          'rgba(255, 230, 120, 0.15)',
          'rgba(220, 180, 50, 0.22)',
          'rgba(255, 200, 90, 0.18)'
        ];
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          const yBase = h * (0.15 + i * 0.15);
          for (let x = 0; x <= w; x += 10) {
            const normX = (x % loopW) / loopW;
            const y = yBase
              + Math.sin(normX * Math.PI * 2 * (i + 1) + tSec * 0.4 + i * 0.8) * 60
              + Math.sin(normX * Math.PI * 2 * (i + 3) - tSec * 0.25) * 35;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          // Close as a thick band
          for (let x = w; x >= 0; x -= 10) {
            const normX = (x % loopW) / loopW;
            const y = yBase + 40
              + Math.sin(normX * Math.PI * 2 * (i + 1) + tSec * 0.4 + i * 0.8) * 55
              + Math.cos(normX * Math.PI * 2 * (i + 2) - tSec * 0.3) * 30;
            ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.fillStyle = ribbonColors[i];
          ctx.fill();
        }

        // Floating golden orbs
        for (let i = 0; i < 6; i++) {
          const orbPhase = i * 1.05;
          const oxBase = (loopW * 0.15 + i * loopW * 0.14 + Math.sin(tSec * 0.2 + orbPhase) * loopW * 0.08) % loopW;
          const oy = h * 0.2 + Math.cos(tSec * 0.15 + orbPhase) * h * 0.25 + i * 20;
          const orbR = 80 + Math.sin(tSec * 0.3 + i) * 30;
          for (let k = -1; k <= Math.ceil(w / loopW); k++) {
            const ox = oxBase + k * loopW;
            if (ox + orbR < -100 || ox - orbR > w + 100) continue;
            const grd = ctx.createRadialGradient(ox, oy, 0, ox, oy, orbR);
            grd.addColorStop(0, 'rgba(255, 220, 100, 0.25)');
            grd.addColorStop(0.6, 'rgba(255, 180, 50, 0.08)');
            grd.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = grd;
            ctx.beginPath();
            ctx.arc(ox, oy, orbR, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'tech-horizon': {
        // 科技地平线 — Dark blue with glowing horizon, floating hexagons, data particle streams
        const thBg = ctx.createLinearGradient(0, 0, 0, h);
        thBg.addColorStop(0, '#020a1a');
        thBg.addColorStop(0.55, color1);
        thBg.addColorStop(0.6, color2);
        thBg.addColorStop(1, '#010610');
        ctx.fillStyle = thBg;
        ctx.fillRect(0, 0, w, h);

        // Glowing horizon line
        const horizonY = h * 0.58;
        ctx.globalCompositeOperation = 'screen';
        const hlGrad = ctx.createLinearGradient(0, horizonY - 80, 0, horizonY + 80);
        hlGrad.addColorStop(0, 'rgba(0,0,0,0)');
        hlGrad.addColorStop(0.45, `rgba(${rgb2.r}, ${rgb2.g}, ${rgb2.b}, 0.5)`);
        hlGrad.addColorStop(0.5, `rgba(${rgb2.r}, ${rgb2.g}, ${rgb2.b}, 0.8)`);
        hlGrad.addColorStop(0.55, `rgba(${rgb2.r}, ${rgb2.g}, ${rgb2.b}, 0.5)`);
        hlGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = hlGrad;
        ctx.fillRect(0, horizonY - 80, w, 160);

        // Perspective grid below horizon
        ctx.strokeStyle = `rgba(${rgb2.r}, ${rgb2.g}, ${rgb2.b}, 0.15)`;
        ctx.lineWidth = 1;
        for (let i = 1; i <= 10; i++) {
          const p = Math.pow(i / 10, 2);
          const ly = horizonY + p * (h - horizonY);
          ctx.globalAlpha = 0.1 + p * 0.3;
          ctx.beginPath();
          ctx.moveTo(0, ly);
          ctx.lineTo(w, ly);
          ctx.stroke();
        }
        // Vertical perspective lines
        const vanishX = w / 2;
        for (let i = 0; i < 16; i++) {
          const angle = (i / 16) * Math.PI - Math.PI / 2;
          const endX = vanishX + Math.cos(angle) * w * 1.5;
          const endY = h + 50;
          ctx.globalAlpha = 0.08;
          ctx.beginPath();
          ctx.moveTo(vanishX, horizonY);
          ctx.lineTo(endX, endY);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // Floating hexagon outlines above horizon
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 8; i++) {
          const hxBase = (loopW * 0.1 + i * loopW * 0.125 + Math.cos(tSec * 0.1 + i * 0.9) * 30) % loopW;
          const hy = h * 0.1 + i * 35 + Math.sin(tSec * 0.2 + i) * 20;
          const hr = 20 + i * 5;
          const alpha = 0.15 + (Math.sin(tSec * 0.5 + i * 1.1) + 1) / 2 * 0.35;
          ctx.strokeStyle = `rgba(${rgb2.r}, ${rgb2.g}, ${rgb2.b}, ${alpha})`;
          for (let k = -1; k <= Math.ceil(w / loopW); k++) {
            const hx = hxBase + k * loopW;
            if (hx + hr < -50 || hx - hr > w + 50) continue;
            ctx.beginPath();
            for (let s = 0; s < 6; s++) {
              const a = Math.PI / 3 * s - Math.PI / 6;
              const px = hx + Math.cos(a) * hr;
              const py = hy + Math.sin(a) * hr;
              if (s === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.stroke();
          }
        }

        // Rising data particles
        for (let i = 0; i < 30; i++) {
          const seed = i * 137.508;
          const pxBase = (seed * 7.3) % loopW;
          const rawY = ((seed * 3.7 + tSec * (30 + (i % 5) * 15)) % (h + 40)) - 20;
          const py = h - rawY;
          const alpha = 0.2 + (Math.sin(tSec * 2 + i) + 1) / 2 * 0.6;
          ctx.fillStyle = `rgba(${rgb2.r}, ${rgb2.g}, ${rgb2.b}, ${alpha})`;
          for (let k = -1; k <= Math.ceil(w / loopW); k++) {
            const px = pxBase + k * loopW;
            if (px >= -5 && px <= w + 5) {
              ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
            }
          }
        }
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'silk-flow': {
        // 丝绸流韵 — Luxurious multi-layer silk fabric flowing curves
        const sfBg = ctx.createLinearGradient(0, 0, 0, h);
        sfBg.addColorStop(0, color1);
        sfBg.addColorStop(0.5, color2);
        sfBg.addColorStop(1, color1);
        ctx.fillStyle = sfBg;
        ctx.fillRect(0, 0, w, h);

        ctx.globalCompositeOperation = 'screen';
        // 7 layers of flowing silk curves
        for (let i = 0; i < 7; i++) {
          const baseY = h * (0.1 + i * 0.12);
          const alpha = 0.06 + i * 0.015;
          ctx.beginPath();
          ctx.moveTo(0, h);
          for (let x = 0; x <= w; x += 8) {
            const normX = (x % loopW) / loopW;
            const phase1 = normX * Math.PI * 2 * (1 + i * 0.5) + tSec * (0.2 + i * 0.05);
            const phase2 = normX * Math.PI * 2 * (2 + i * 0.3) - tSec * (0.15 + i * 0.03);
            const y = baseY
              + Math.sin(phase1) * (50 + i * 15)
              + Math.sin(phase2) * (30 + i * 8)
              + Math.sin(normX * Math.PI * 2 * 0.5 + tSec * 0.1) * 20;
            ctx.lineTo(x, y);
          }
          ctx.lineTo(w, h);
          ctx.closePath();
          ctx.fillStyle = `rgba(${rgb2.r}, ${rgb2.g}, ${rgb2.b}, ${alpha})`;
          ctx.fill();
        }

        // Subtle shimmering highlights
        for (let i = 0; i < 4; i++) {
          const shimX = (loopW * 0.2 + i * loopW * 0.22 + tSec * 15) % loopW;
          const shimY = h * 0.3 + Math.sin(tSec * 0.3 + i * 1.5) * h * 0.2;
          for (let k = -1; k <= Math.ceil(w / loopW); k++) {
            const sx = shimX + k * loopW;
            if (sx < -200 || sx > w + 200) continue;
            const sg = ctx.createRadialGradient(sx, shimY, 0, sx, shimY, 150);
            sg.addColorStop(0, `rgba(255, 255, 255, ${0.04 + (Math.sin(tSec * 0.5 + i) + 1) * 0.02})`);
            sg.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = sg;
            ctx.beginPath();
            ctx.arc(sx, shimY, 150, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'mountain-mist': {
        // 山水意境 — Layered abstract mountain silhouettes with drifting clouds
        // Sky gradient
        const mmSky = ctx.createLinearGradient(0, 0, 0, h);
        mmSky.addColorStop(0, color1);
        mmSky.addColorStop(0.6, color2);
        mmSky.addColorStop(1, color1);
        ctx.fillStyle = mmSky;
        ctx.fillRect(0, 0, w, h);

        // 5 layers of mountains from back to front
        const mountainLayers = [
          { baseY: 0.42, amp: 80, freq: 1.5, alpha: 0.12, drift: 0.05 },
          { baseY: 0.50, amp: 100, freq: 2.0, alpha: 0.18, drift: 0.08 },
          { baseY: 0.58, amp: 90, freq: 2.8, alpha: 0.25, drift: 0.12 },
          { baseY: 0.66, amp: 70, freq: 3.5, alpha: 0.32, drift: 0.06 },
          { baseY: 0.75, amp: 50, freq: 4.0, alpha: 0.40, drift: 0.03 }
        ];
        for (let li = 0; li < mountainLayers.length; li++) {
          const ml = mountainLayers[li];
          ctx.beginPath();
          ctx.moveTo(0, h);
          for (let x = 0; x <= w; x += 6) {
            const normX = (x % loopW) / loopW;
            const y = h * ml.baseY
              - Math.abs(Math.sin(normX * Math.PI * 2 * ml.freq + li * 0.7)) * ml.amp
              - Math.sin(normX * Math.PI * 2 * (ml.freq * 0.5) + tSec * ml.drift) * 25
              - Math.abs(Math.sin(normX * Math.PI * 2 * (ml.freq * 2.3) + li * 2.1)) * (ml.amp * 0.3);
            ctx.lineTo(x, y);
          }
          ctx.lineTo(w, h);
          ctx.closePath();
          const mAlpha = ml.alpha + (Math.sin(tSec * 0.2 + li) + 1) * 0.02;
          ctx.fillStyle = `rgba(${rgb2.r}, ${rgb2.g}, ${rgb2.b}, ${mAlpha})`;
          ctx.fill();
        }

        // Drifting cloud/mist layers
        ctx.globalCompositeOperation = 'screen';
        for (let i = 0; i < 5; i++) {
          const cloudXBase = ((tSec * (8 + i * 3)) % loopW);
          const cloudY = h * (0.2 + i * 0.12) + Math.sin(tSec * 0.15 + i) * 20;
          const cloudW = 300 + i * 50;
          const cloudH = 40 + i * 10;
          for (let k = -1; k <= Math.ceil(w / loopW) + 1; k++) {
            const cx = cloudXBase + k * loopW;
            if (cx + cloudW < -50 || cx - cloudW > w + 50) continue;
            const cg = ctx.createRadialGradient(cx, cloudY, 0, cx, cloudY, cloudW);
            cg.addColorStop(0, `rgba(${rgb2.r}, ${rgb2.g}, ${rgb2.b}, 0.06)`);
            cg.addColorStop(0.4, `rgba(${rgb2.r}, ${rgb2.g}, ${rgb2.b}, 0.03)`);
            cg.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = cg;
            ctx.fillRect(cx - cloudW, cloudY - cloudH, cloudW * 2, cloudH * 2);
          }
        }
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'starlight-glow': {
        // 璀璨华光 — Elegant glowing orbs with faint constellation lines on deep blue
        ctx.fillStyle = '#030812';
        ctx.fillRect(0, 0, w, h);

        // Deep ambient gradient
        ctx.globalCompositeOperation = 'screen';
        const sgBase = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.6);
        sgBase.addColorStop(0, `rgba(${rgb1.r}, ${rgb1.g}, ${rgb1.b}, 0.3)`);
        sgBase.addColorStop(0.5, `rgba(${rgb2.r}, ${rgb2.g}, ${rgb2.b}, 0.15)`);
        sgBase.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = sgBase;
        ctx.fillRect(0, 0, w, h);

        // 12 glowing star orbs with slow orbital motion
        const starPoints = [];
        for (let i = 0; i < 12; i++) {
          const seed = i * 137.508;
          const sxBase = (seed * 5.7 + Math.sin(tSec * 0.08 + i * 0.5) * 40) % loopW;
          const sy = h * 0.1 + (seed * 3.3) % (h * 0.8) + Math.cos(tSec * 0.1 + i * 0.7) * 15;
          const sr = 3 + (i % 4) * 1.5;
          const brightness = 0.3 + (Math.sin(tSec * 0.4 + seed) + 1) / 2 * 0.7;
          starPoints.push({ xBase: sxBase, y: sy, r: sr, brightness });

          for (let k = -1; k <= Math.ceil(w / loopW); k++) {
            const sx = sxBase + k * loopW;
            if (sx < -100 || sx > w + 100) continue;

            // Glow halo
            const haloR = sr * 15;
            const halo = ctx.createRadialGradient(sx, sy, 0, sx, sy, haloR);
            halo.addColorStop(0, `rgba(${rgb2.r}, ${rgb2.g}, ${rgb2.b}, ${brightness * 0.15})`);
            halo.addColorStop(0.3, `rgba(${rgb2.r}, ${rgb2.g}, ${rgb2.b}, ${brightness * 0.06})`);
            halo.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = halo;
            ctx.beginPath();
            ctx.arc(sx, sy, haloR, 0, Math.PI * 2);
            ctx.fill();

            // Star core
            ctx.fillStyle = `rgba(255, 255, 255, ${brightness * 0.9})`;
            ctx.beginPath();
            ctx.arc(sx, sy, sr, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Faint constellation connecting lines between nearby stars (within same loopW tile)
        ctx.strokeStyle = `rgba(${rgb2.r}, ${rgb2.g}, ${rgb2.b}, 0.06)`;
        ctx.lineWidth = 1;
        for (let i = 0; i < starPoints.length; i++) {
          for (let j = i + 1; j < starPoints.length; j++) {
            const dx = starPoints[i].xBase - starPoints[j].xBase;
            const dy = starPoints[i].y - starPoints[j].y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < loopW * 0.25) {
              for (let k = -1; k <= Math.ceil(w / loopW); k++) {
                const x1 = starPoints[i].xBase + k * loopW;
                const x2 = starPoints[j].xBase + k * loopW;
                if (Math.max(x1, x2) < -50 || Math.min(x1, x2) > w + 50) continue;
                ctx.beginPath();
                ctx.moveTo(x1, starPoints[i].y);
                ctx.lineTo(x2, starPoints[j].y);
                ctx.stroke();
              }
            }
          }
        }
        ctx.globalCompositeOperation = 'source-over';
        break;
      }
      case 'image': {
        if (this.bgImg && this.bgImg.complete && this.bgImg.naturalWidth > 0) {
          // Draw the background image scaled to cover the canvas
          const img = this.bgImg;
          const imgAspect = img.naturalWidth / img.naturalHeight;
          const canvasAspect = w / h;
          let drawW, drawH, drawX, drawY;
          if (imgAspect > canvasAspect) {
            drawH = h;
            drawW = h * imgAspect;
            drawX = (w - drawW) / 2;
            drawY = 0;
          } else {
            drawW = w;
            drawH = w / imgAspect;
            drawX = 0;
            drawY = (h - drawH) / 2;
          }
          ctx.drawImage(img, drawX, drawY, drawW, drawH);
        } else {
          this.renderBackground(ctx, w, h, t, speed, color1, color2, 'gradient-flow');
        }
        break;
      }
      case 'video': {
        if (this.videoEl && this.videoEl.readyState >= 2) {
          ctx.drawImage(this.videoEl, 0, 0, w, h);
        } else {
          this.renderBackground(ctx, w, h, t, speed, color1, color2, 'gradient-flow');
        }
        break;
      }
      default:
        break;
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1.0;
    ctx.shadowBlur = 0;
  }

  renderText(ctx, w, h, cfg) {
    const fontFam = cfg.fontFamily || '"Noto Sans SC", "Inter", sans-serif';
    ctx.font = `${cfg.fontWeight} ${cfg.fontSize}px ${fontFam}`;
    ctx.textBaseline = 'middle';

    // Multi-line support: split by newlines
    const lines = (cfg.text || '').split('\n');
    if (lines.length === 0 || lines.every(l => l.length === 0)) return;

    // Measure max line width
    let maxTextW = 0;
    for (const line of lines) {
      const lw = ctx.measureText(line).width;
      if (lw > maxTextW) maxTextW = lw;
    }
    if (maxTextW <= 0) return;

    const lineHeight = cfg.fontSize * 1.3;
    const totalTextH = lines.length * lineHeight;
    const loopW = cfg.activeWidth || w;

    // Effective period: round UP to nearest multiple of loopW (cylinder circumference).
    // This ensures every loopW-tiled copy position below coincides with a natural copy
    // position, preventing overlapping text from misaligned tiles.
    const effectivePeriod = this._loopRenderMode && this._cachedEffectivePeriod
      ? this._cachedEffectivePeriod
      : Math.ceil(Math.max(maxTextW + cfg.textGap, loopW) / loopW) * loopW;

    // Normalize offset to [0, effectivePeriod)
    const offset = ((this.textOffsetX % effectivePeriod) + effectivePeriod) % effectivePeriod;

    // Vertical centering: center the multi-line block around textVertical
    const centerY = (cfg.textVertical / 100) * h;
    const startY = centerY - (lines.length - 1) * lineHeight / 2;
    
    // Set up text styles
    ctx.fillStyle = cfg.textColor;
    
    const hasGlow = cfg.textGlow;
    const hasShadow = cfg.textShadow && !hasGlow;
    const hasOutline = cfg.textOutline;

    if (hasGlow) {
      const rgb = this.hexToRgb(cfg.textColor);
      ctx.shadowColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.6)`;
      ctx.shadowBlur = 25;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    } else if (hasShadow) {
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetX = 3;
      ctx.shadowOffsetY = 3;
    } else {
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
    }

    const drawAt = (x) => {
      for (let i = 0; i < lines.length; i++) {
        const yPos = startY + i * lineHeight;
        if (hasOutline) {
          ctx.strokeStyle = cfg.outlineColor;
          ctx.lineWidth = Math.max(2, cfg.fontSize * 0.04);
          ctx.lineJoin = 'round';
          const tempBlur = ctx.shadowBlur;
          const tempColor = ctx.shadowColor;
          ctx.shadowBlur = 0;
          ctx.shadowColor = 'transparent';
          
          ctx.strokeText(lines[i], x, yPos);
          
          ctx.shadowBlur = tempBlur;
          ctx.shadowColor = tempColor;
        }
        ctx.fillText(lines[i], x, yPos);
      }
    };

    // Draw text copies with loopW-based cylinder tiling.
    // For each text position in the effectivePeriod sequence, also tile at
    // loopW intervals so the overlap region [loopW, canvasW) mirrors [0, canvasW-loopW).
    // This is the same tiling pattern used by backgrounds (particles, nebula, etc.)
    const tiles = Math.ceil(w / loopW) + 1;
    let k = Math.floor(-(offset + maxTextW + loopW) / effectivePeriod);
    while (true) {
      const baseX = -offset + k * effectivePeriod;
      if (baseX >= w + loopW) break;
      for (let n = 0; n < tiles; n++) {
        const x = baseX + n * loopW;
        if (x >= w) break;
        if (x + maxTextW > 0) {
          drawAt(x);
        }
      }
      k++;
    }
  }

  /**
   * Compute exact frames for a perfect seamless loop.
   *
   * The key insight: we pick totalFrames first, then ensure that
   * totalFrames * speedPerFrame == effectivePeriod EXACTLY.
   * This eliminates any rounding drift between frame count and scroll distance.
   *
   * @param {number} fps - Target framerate
   * @param {number} [compensationPx=0] - Extra pixels to add/subtract per cycle for hardware tuning
   * @returns {{ effectivePeriod, loopFrames, loopDurationMs, scrollPerFrame }}
   */
  computeLoopFrames(fps, compensationPx = 0) {
    const cfg = this._config;
    const w = this.canvasW;

    const oCtx = this.offscreenCtx;
    const fontFam = cfg.fontFamily || '"Noto Sans SC", "Inter", sans-serif';
    oCtx.font = `${cfg.fontWeight} ${cfg.fontSize}px ${fontFam}`;

    // Multi-line: measure max line width
    const lines = (cfg.text || '').split('\n');
    let textW = 0;
    for (const line of lines) {
      const lw = oCtx.measureText(line).width || 0;
      if (lw > textW) textW = lw;
    }

    const loopW = cfg.activeWidth || w;
    const rawPeriod = Math.max(textW + cfg.textGap, loopW);
    let effectivePeriod = Math.ceil(rawPeriod / loopW) * loopW;

    // Apply hardware loop compensation (user-tunable offset in pixels)
    effectivePeriod += compensationPx;
    if (effectivePeriod < loopW) effectivePeriod = loopW; // safety floor

    // Cache for use by renderLoopFrame
    this._cachedEffectivePeriod = effectivePeriod;

    const frameDurationMs = 1000 / fps;
    const speedPerFrame = cfg.scrollSpeed * (frameDurationMs / 16.666);
    if (speedPerFrame <= 0) return { loopFrames: fps * 10, loopDurationMs: 10000, effectivePeriod, scrollPerFrame: 0 };

    // Use ceil to guarantee we never undershoot the cycle
    const loopFrames = Math.max(fps, Math.ceil(effectivePeriod / speedPerFrame));

    // Recalculate the exact scroll-per-frame so that
    // loopFrames * scrollPerFrame == effectivePeriod  (EXACTLY, no rounding error)
    const scrollPerFrame = effectivePeriod / loopFrames;

    return {
      effectivePeriod,
      loopFrames,
      loopDurationMs: Math.round(loopFrames * frameDurationMs),
      scrollPerFrame
    };
  }

  /** Reset scroll offsets — call before recording so frame 0 === frame N */
  resetOffsets() {
    this.textOffsetX = 0;
    this.bgOffsetX = 0;
  }

  /**
   * Render a single frame for seamless loop export.
   *
   * All animation state is derived from phase = frameIndex/totalFrames ∈ [0,1).
   * BG_ANIM_CYCLES = 20: guarantees every frequency used in backgrounds
   * (multiples of 0.1: 0.15, 0.2, 0.3, 0.5, 0.8, 1, 1.2, 1.3, 1.5, 2, 5)
   * returns to exact starting value at phase=1 → frame N = frame 0.
   *
   * Particles and matrix chars are frozen in the tile during loop rendering;
   * the canvas scroll itself provides the apparent motion.
   */
  renderLoopFrame(frameIndex, totalFrames) {
    const ctx = this.ctx;
    const w = this.canvasW;
    const h = this.canvasH;
    const cfg = this._config;

    const phase = frameIndex / totalFrames; // [0, 1)

    // Use cached effectivePeriod (computed in computeLoopFrames)
    const effectivePeriod = this._cachedEffectivePeriod || w;

    // Position-based text offset — exact, no floating-point accumulation drift
    this.textOffsetX = phase * effectivePeriod;

    // Phase-locked background breathing animation time:
    // Completes exactly 2 organic breathing cycles (4π) over the video loop.
    // Since sin(0) === sin(4π) and cos(0) === cos(4π), frame N === frame 0 EXACTLY!
    const BG_BREATH_CYCLES = 2;
    const bgTime = phase * BG_BREATH_CYCLES * 2 * Math.PI * 1000;

    this._loopRenderMode = true;
    ctx.save();
    this.renderBackground(ctx, w, h, bgTime, cfg.bgSpeed, cfg.bgColor1, cfg.bgColor2, cfg.bgType);
    ctx.restore();
    this._loopRenderMode = false;

    // Render text (uses this.textOffsetX set above)
    ctx.save();
    this.renderText(ctx, w, h, cfg);
    ctx.restore();

    // Render Logo Watermark / Icon
    ctx.save();
    this.renderLogo(ctx, w, h, cfg);
    ctx.restore();
  }
}
