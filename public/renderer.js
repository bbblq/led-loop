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
      textVertical: 50, // percentage 0-100
      bgType: 'gradient-flow',
      bgColor1: '#0a0a2e',
      bgColor2: '#1a1a4e',
      bgSpeed: 1,
      bgVideo: '' // URL to video file
    };

    this._config = { ...this.DEFAULT_CONFIG };
    
    // Internal state
    this.textOffsetX = 0;
    this.bgTime = 0;
    this._isPlaying = false;
    this.animationId = null;
    this.lastTime = 0;
    this.videoEl = null;

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
    this._config = { ...this._config, ...config };
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

    // Render Background
    ctx.save();
    this.renderBackground(ctx, w, h, this.bgTime, cfg.bgSpeed, cfg.bgColor1, cfg.bgColor2, cfg.bgType);
    ctx.restore();

    // Render Text
    ctx.save();
    this.renderText(ctx, w, h, cfg);
    ctx.restore();
  }

  renderBackground(ctx, w, h, t, speed, color1, color2, type) {
    ctx.fillStyle = color1;
    ctx.fillRect(0, 0, w, h);

    const tSec = t / 1000;
    const rgb1 = this.hexToRgb(color1);
    const rgb2 = this.hexToRgb(color2);

    switch (type) {
      case 'gradient-flow': {
        const x1 = w/2 + Math.cos(tSec) * w/2;
        const y1 = h/2 + Math.sin(tSec * 0.8) * h/2;
        const x2 = w/2 + Math.cos(tSec * 1.2 + Math.PI) * w/2;
        const y2 = h/2 + Math.sin(tSec * 1.1 + Math.PI) * h/2;
        
        const grad = ctx.createLinearGradient(x1, y1, x2, y2);
        grad.addColorStop(0, color1);
        grad.addColorStop(1, color2);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        
        // light streaks
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = `rgba(${rgb2.r}, ${rgb2.g}, ${rgb2.b}, 0.3)`;
        ctx.beginPath();
        ctx.moveTo(0, h * 0.2 + Math.sin(tSec) * 100);
        ctx.lineTo(w, h * 0.8 + Math.cos(tSec * 1.3) * 100);
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.fill();
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
          p.x -= p.speedX * speed * 2;
          if (p.x < 0) p.x += w;
          
          const alpha = (Math.sin(tSec * p.blinkSpeed * 100 + p.phase) + 1) / 2;
          ctx.globalAlpha = 0.2 + alpha * 0.8;
          
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1.0;
        break;
      }
      case 'wave': {
        ctx.fillStyle = color1;
        ctx.fillRect(0, 0, w, h);
        
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.moveTo(0, h);
          
          for (let x = 0; x <= w; x += 20) {
            const y = h * 0.5 + Math.sin(x * 0.005 + tSec + i) * 100 + Math.sin(x * 0.01 - tSec * 1.5) * 50;
            ctx.lineTo(x, y + i * 40 - 60);
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
          m.y += m.speedY * speed * 5;
          if (m.y > h + 30) {
            m.y = -30;
            m.x = Math.random() * w;
            m.char = String.fromCharCode(0x30A0 + Math.random() * 95);
          }
          if (Math.random() < 0.05) {
            m.char = String.fromCharCode(0x30A0 + Math.random() * 95);
          }
          const alpha = (Math.sin(tSec * 2 + m.phase) + 1) / 2;
          ctx.fillStyle = `rgba(0, 255, 0, ${0.3 + alpha * 0.7})`;
          ctx.fillText(m.char, m.x, m.y);
        }
        break;
      }
      case 'aurora': {
        ctx.fillStyle = '#050510';
        ctx.fillRect(0, 0, w, h);
        
        const colors = [
          'rgba(75, 0, 130, 0.4)', // indigo
          'rgba(0, 255, 128, 0.3)', // green
          'rgba(128, 0, 128, 0.4)', // purple
          'rgba(255, 105, 180, 0.3)', // pink
          'rgba(0, 255, 255, 0.3)' // cyan
        ];
        
        ctx.globalCompositeOperation = 'screen';
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.moveTo(0, h);
          for (let x = 0; x <= w; x += 30) {
            const y = h * 0.3 + Math.sin(x * 0.002 + tSec * 0.5 + i * 1.2) * 150 + Math.cos(x * 0.005 - tSec * 0.3) * 100;
            ctx.lineTo(x, y + i * 20);
          }
          ctx.lineTo(w, h);
          ctx.lineTo(0, h);
          ctx.fillStyle = colors[i];
          ctx.fill();
        }
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
          const cx = w/2 + Math.cos(tSec * c.speed + c.phase) * (w * 0.3);
          const cy = h/2 + Math.sin(tSec * c.speed + c.phase) * (h * 0.3);
          
          const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, c.r);
          grad.addColorStop(0, c.color);
          grad.addColorStop(1, 'rgba(0,0,0,0)');
          
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(cx, cy, c.r, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'cyber-grid': {
        ctx.fillStyle = '#050510';
        ctx.fillRect(0, 0, w, h);
        
        ctx.strokeStyle = color2;
        ctx.lineWidth = 2;
        ctx.shadowColor = color2;
        ctx.shadowBlur = 5;
        
        const vanishingY = h * 0.2;
        const startY = h * 0.4;
        
        // Vertical lines
        for (let i = -10; i <= 10; i++) {
          ctx.beginPath();
          ctx.moveTo(w/2 + i * 20, vanishingY);
          ctx.lineTo(w/2 + i * 200, h);
          ctx.stroke();
        }
        
        // Horizontal lines (perspective)
        const tMod = (tSec * 2) % 1;
        for (let i = 0; i < 15; i++) {
          const p = (i + tMod) / 15; // 0 to 1
          const y = startY + Math.pow(p, 2) * (h - startY);
          if (y > startY) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
          }
        }
        
        // Scanning line
        const scanY = startY + ((Math.sin(tSec) + 1) / 2) * (h - startY);
        ctx.shadowBlur = 20;
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(0, scanY);
        ctx.lineTo(w, scanY);
        ctx.stroke();
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
          const noise = Math.sin(i * 0.5 + tSec * 5) + Math.sin(i * 0.1 - tSec * 2);
          const flameH = h * 0.4 + noise * h * 0.3;
          
          const grad = ctx.createLinearGradient(0, h, 0, h - flameH);
          grad.addColorStop(0, 'rgba(255, 50, 0, 0.8)');
          grad.addColorStop(0.4, 'rgba(255, 150, 0, 0.6)');
          grad.addColorStop(0.8, 'rgba(255, 255, 0, 0.2)');
          grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          
          ctx.fillStyle = grad;
          ctx.fillRect(x, h - flameH, colWidth + 1, flameH);
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
    
    const textW = ctx.measureText(cfg.text).width;
    if (textW <= 0) return;

    // Effective period around the cylinder: at least w (1920px) to prevent overlapping
    const effectivePeriod = Math.max(textW + cfg.textGap, w);
    
    // Normalize offset to [0, effectivePeriod)
    const offset = ((this.textOffsetX % effectivePeriod) + effectivePeriod) % effectivePeriod;
    const yPos = (cfg.textVertical / 100) * h;
    
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
      if (hasOutline) {
        ctx.strokeStyle = cfg.outlineColor;
        ctx.lineWidth = Math.max(2, cfg.fontSize * 0.04);
        ctx.lineJoin = 'round';
        const tempBlur = ctx.shadowBlur;
        const tempColor = ctx.shadowColor;
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
        
        ctx.strokeText(cfg.text, x, yPos);
        
        ctx.shadowBlur = tempBlur;
        ctx.shadowColor = tempColor;
      }
      ctx.fillText(cfg.text, x, yPos);
    };

    // Draw all text copies that intersect the screen range [0, w]
    let k = Math.floor(- (offset + textW) / effectivePeriod);
    while (true) {
      const x = -offset + k * effectivePeriod;
      if (x >= w) break;
      if (x + textW > 0) {
        drawAt(x);
      }
      k++;
    }
  }
}
