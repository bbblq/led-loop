(() => {
  'use strict';
  
  const CANVAS_W = 1920, CANVAS_H = 800;
  let token = null;
  let renderer = null;
  
  // Elements
  const el = {
    overlay: document.getElementById('login-overlay'),
    app: document.getElementById('app-container'),
    pwdInput: document.getElementById('login-password'),
    btnLogin: document.getElementById('btn-login'),
    loginError: document.getElementById('login-error'),
    btnSave: document.getElementById('btn-save'),
    statusDot: document.getElementById('status-dot'),
    
    btnPlay: document.getElementById('btn-play'),
    btnFullscreen: document.getElementById('btn-fullscreen'),
    canvasWrapper: document.getElementById('canvas-wrapper'),
    canvas: document.getElementById('preview-canvas'),
    videoBg: document.getElementById('bg-video'),
    
    // Inputs
    inputText: document.getElementById('input-text'),
    fontSize: document.getElementById('font-size'),
    fontWeight: document.getElementById('font-weight'),
    textColor: document.getElementById('text-color'),
    textGap: document.getElementById('text-gap'),
    fontFamily: document.getElementById('font-family'),
    textGlow: document.getElementById('text-glow'),
    textShadow: document.getElementById('text-shadow'),
    textOutline: document.getElementById('text-outline'),
    outlineColor: document.getElementById('outline-color'),
    outlineColorGroup: document.getElementById('outline-color-group'),
    
    scrollSpeed: document.getElementById('scroll-speed'),
    textVertical: document.getElementById('text-vertical'),
    
    bgTypeBtns: document.querySelectorAll('.bg-type-btn'),
    bgVideoSelectGroup: document.getElementById('bg-video-select-group'),
    bgVideoSelect: document.getElementById('bg-video-select'),
    bgColor1: document.getElementById('bg-color1'),
    bgColor2: document.getElementById('bg-color2'),
    bgSpeed: document.getElementById('bg-speed'),
    
    // Uploads
    fontUploadZone: document.getElementById('font-upload-zone'),
    fontFileInput: document.getElementById('font-file-input'),
    fontList: document.getElementById('font-list'),
    
    videoUploadZone: document.getElementById('video-upload-zone'),
    videoFileInput: document.getElementById('video-file-input'),
    videoList: document.getElementById('video-list'),
    
    // Record
    btnRecord: document.getElementById('btn-record'),
    recordDuration: document.getElementById('record-duration'),
    recordFps: document.getElementById('record-fps'),
    recordProgress: document.getElementById('record-progress'),
    recordStatusText: document.getElementById('record-status-text'),
    recordPercent: document.getElementById('record-percent'),
    recordFill: document.getElementById('record-fill')
  };

  let activeBgType = 'gradient-flow';

  function initApp() {
    if (renderer) return;
    renderer = new LEDRenderer(el.canvas);
    renderer.setVideoElement(el.videoBg);
    
    setupEventListeners();
    loadFontList();
    loadVideoList();
    
    fetch('/api/config')
      .then(res => res.json())
      .then(config => {
        applyConfig(config);
        renderer.updateConfig(config);
      })
      .catch(err => console.error('Failed to load config:', err));
  }

  function setupEventListeners() {
    // Inputs sync
    [el.inputText, el.fontSize, el.fontWeight, el.textGap, 
     el.scrollSpeed, el.textVertical, el.bgSpeed].forEach(input => {
      if (input.type === 'range') {
        input.addEventListener('input', (e) => {
          e.target.nextElementSibling.textContent = e.target.value;
          syncConfig();
        });
      } else {
        input.addEventListener('input', syncConfig);
      }
    });

    [el.textColor, el.outlineColor, el.bgColor1, el.bgColor2].forEach(input => {
      input.addEventListener('input', (e) => {
        e.target.nextElementSibling.textContent = e.target.value;
        syncConfig();
      });
    });

    [el.textGlow, el.textShadow, el.textOutline].forEach(input => {
      input.addEventListener('change', () => {
        if (input.id === 'text-outline') {
          el.outlineColorGroup.style.display = input.checked ? 'block' : 'none';
        }
        syncConfig();
      });
    });

    el.bgTypeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        el.bgTypeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeBgType = btn.dataset.type;
        el.bgVideoSelectGroup.style.display = activeBgType === 'video' ? 'block' : 'none';
        syncConfig();
      });
    });

    el.fontFamily.addEventListener('change', async (e) => {
      const val = e.target.value;
      if (val) {
        await renderer.loadFont(val, `/uploads/fonts/${val}`);
      }
      syncConfig();
    });

    el.bgVideoSelect.addEventListener('change', (e) => {
      if (e.target.value) {
        el.videoBg.src = `/uploads/videos/${e.target.value}`;
      } else {
        el.videoBg.src = '';
      }
      syncConfig();
    });

    // Save
    el.btnSave.addEventListener('click', saveConfig);

    // Play/Pause
    const togglePlay = () => {
      if (!renderer) return;
      if (renderer.isPlaying) {
        renderer.stop();
        el.canvasWrapper.classList.remove('playing');
        el.btnPlay.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
      } else {
        renderer.start();
        el.canvasWrapper.classList.add('playing');
        el.btnPlay.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
      }
    };
    el.btnPlay.addEventListener('click', togglePlay);
    el.canvasWrapper.addEventListener('click', togglePlay);
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        togglePlay();
      }
    });

    el.btnFullscreen.addEventListener('click', () => {
      if (el.canvas.requestFullscreen) el.canvas.requestFullscreen();
    });

    // Upload Zones
    setupUploadZone(el.fontUploadZone, el.fontFileInput, '/api/upload/font', () => {
      showToast('字体上传成功');
      loadFontList();
    });
    setupUploadZone(el.videoUploadZone, el.videoFileInput, '/api/upload/video', () => {
      showToast('视频上传成功');
      loadVideoList();
    });

    // Record
    el.btnRecord.addEventListener('click', startRecording);
  }

  function setupUploadZone(zone, fileInput, url, onSuccess) {
    zone.addEventListener('click', () => fileInput.click());
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('dragover');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
      if (e.dataTransfer.files.length) uploadFile(e.dataTransfer.files[0], url, onSuccess);
    });
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length) uploadFile(fileInput.files[0], url, onSuccess);
      fileInput.value = '';
    });
  }

  function uploadFile(file, url, onSuccess) {
    const formData = new FormData();
    formData.append('file', file);
    fetch(url, {
      method: 'POST',
      body: formData
    })
    .then(res => res.json())
    .then(data => {
      if (data.error) showToast(data.error, 'error');
      else onSuccess();
    })
    .catch(err => showToast('上传失败', 'error'));
  }

  function collectConfig() {
    return {
      text: el.inputText.value,
      fontSize: parseInt(el.fontSize.value),
      fontWeight: el.fontWeight.value,
      textColor: el.textColor.value,
      textGap: parseInt(el.textGap.value),
      fontFamily: el.fontFamily.value,
      textGlow: el.textGlow.checked,
      textShadow: el.textShadow.checked,
      textOutline: el.textOutline.checked,
      outlineColor: el.outlineColor.value,
      scrollSpeed: parseFloat(el.scrollSpeed.value),
      textVertical: parseInt(el.textVertical.value),
      bgType: activeBgType,
      bgColor1: el.bgColor1.value,
      bgColor2: el.bgColor2.value,
      bgSpeed: parseFloat(el.bgSpeed.value),
      bgVideoUrl: el.bgVideoSelect.value
    };
  }

  function applyConfig(config) {
    if (config.text !== undefined) el.inputText.value = config.text;
    if (config.fontSize !== undefined) { el.fontSize.value = config.fontSize; el.fontSize.nextElementSibling.textContent = config.fontSize; }
    if (config.fontWeight !== undefined) el.fontWeight.value = config.fontWeight;
    if (config.textColor !== undefined) { el.textColor.value = config.textColor; el.textColor.nextElementSibling.textContent = config.textColor; }
    if (config.textGap !== undefined) { el.textGap.value = config.textGap; el.textGap.nextElementSibling.textContent = config.textGap; }
    if (config.fontFamily !== undefined) el.fontFamily.value = config.fontFamily;
    if (config.textGlow !== undefined) el.textGlow.checked = config.textGlow;
    if (config.textShadow !== undefined) el.textShadow.checked = config.textShadow;
    if (config.textOutline !== undefined) {
      el.textOutline.checked = config.textOutline;
      el.outlineColorGroup.style.display = config.textOutline ? 'block' : 'none';
    }
    if (config.outlineColor !== undefined) { el.outlineColor.value = config.outlineColor; el.outlineColor.nextElementSibling.textContent = config.outlineColor; }
    if (config.scrollSpeed !== undefined) { el.scrollSpeed.value = config.scrollSpeed; el.scrollSpeed.nextElementSibling.textContent = config.scrollSpeed; }
    if (config.textVertical !== undefined) { el.textVertical.value = config.textVertical; el.textVertical.nextElementSibling.textContent = config.textVertical; }
    if (config.bgType !== undefined) {
      activeBgType = config.bgType;
      el.bgTypeBtns.forEach(btn => {
        if (btn.dataset.type === activeBgType) btn.classList.add('active');
        else btn.classList.remove('active');
      });
      el.bgVideoSelectGroup.style.display = activeBgType === 'video' ? 'block' : 'none';
    }
    if (config.bgColor1 !== undefined) { el.bgColor1.value = config.bgColor1; el.bgColor1.nextElementSibling.textContent = config.bgColor1; }
    if (config.bgColor2 !== undefined) { el.bgColor2.value = config.bgColor2; el.bgColor2.nextElementSibling.textContent = config.bgColor2; }
    if (config.bgSpeed !== undefined) { el.bgSpeed.value = config.bgSpeed; el.bgSpeed.nextElementSibling.textContent = config.bgSpeed; }
    if (config.bgVideoUrl !== undefined) {
      el.bgVideoSelect.value = config.bgVideoUrl;
      el.videoBg.src = config.bgVideoUrl ? `/uploads/videos/${config.bgVideoUrl}` : '';
    }
  }

  function syncConfig() {
    if (renderer) renderer.updateConfig(collectConfig());
  }

  function saveConfig() {
    fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(collectConfig())
    }).then(res => res.json()).then(data => {
      if(data.success) showToast('配置已保存');
    }).catch(() => showToast('保存失败', 'error'));
  }

  function loadFontList() {
    fetch('/api/fonts')
      .then(res => res.json())
      .then(fonts => {
        el.fontList.innerHTML = '';
        el.fontFamily.innerHTML = '<option value="">默认字体</option>';
        fonts.forEach(f => {
          // List item
          const item = document.createElement('div');
          item.className = 'file-item';
          item.innerHTML = `<span class="file-name" title="${f.name}">${f.name}</span>
            <button class="delete-btn" data-name="${f.name}"><svg viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>`;
          item.querySelector('.delete-btn').addEventListener('click', () => deleteFont(f.name));
          el.fontList.appendChild(item);
          // Select option
          const opt = document.createElement('option');
          opt.value = f.name;
          opt.textContent = f.name;
          el.fontFamily.appendChild(opt);
        });
        el.fontFamily.value = renderer?.config?.fontFamily || '';
      });
  }

  function deleteFont(filename) {
    if(!confirm(`确定删除字体 ${filename}?`)) return;
    fetch(`/api/fonts/${filename}`, { method: 'DELETE' })
      .then(() => { showToast('已删除'); loadFontList(); })
      .catch(() => showToast('删除失败', 'error'));
  }

  function loadVideoList() {
    fetch('/api/videos')
      .then(res => res.json())
      .then(videos => {
        el.videoList.innerHTML = '';
        el.bgVideoSelect.innerHTML = '<option value="">(请上传视频)</option>';
        videos.forEach(v => {
          const item = document.createElement('div');
          item.className = 'file-item';
          item.innerHTML = `<span class="file-name" title="${v.name}">${v.name}</span>
            <button class="delete-btn" data-name="${v.name}"><svg viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>`;
          item.querySelector('.delete-btn').addEventListener('click', () => deleteVideo(v.name));
          el.videoList.appendChild(item);
          const opt = document.createElement('option');
          opt.value = v.name;
          opt.textContent = v.name;
          el.bgVideoSelect.appendChild(opt);
        });
        el.bgVideoSelect.value = renderer?.config?.bgVideoUrl || '';
      });
  }

  function deleteVideo(filename) {
    if(!confirm(`确定删除视频 ${filename}?`)) return;
    fetch(`/api/videos/${filename}`, { method: 'DELETE' })
      .then(() => { showToast('已删除'); loadVideoList(); })
      .catch(() => showToast('删除失败', 'error'));
  }

  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  async function startRecording() {
    if (!window.VideoEncoder || !window.Mp4Muxer) {
      showToast('浏览器不支持视频录制', 'error');
      return;
    }
    const wasPlaying = renderer.isPlaying;
    renderer.stop();
    el.btnRecord.disabled = true;
    el.btnRecord.classList.add('recording');
    el.recordProgress.classList.add('visible');
    
    const fps = parseInt(el.recordFps.value) || 30;
    const duration = parseInt(el.recordDuration.value) || 10;
    const totalFrames = fps * duration;
    const frameDurationMs = 1000 / fps;
    
    let muxer = new Mp4Muxer.Muxer({
      target: new Mp4Muxer.ArrayBufferTarget(),
      video: { codec: 'avc', width: CANVAS_W, height: CANVAS_H }
    });
    
    let encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => console.error(e)
    });
    
    encoder.configure({
      codec: 'avc1.640028',
      width: CANVAS_W,
      height: CANVAS_H,
      bitrate: 8000000,
      framerate: fps
    });
    
    for (let i = 0; i < totalFrames; i++) {
      renderer.renderFrame(frameDurationMs);
      const vf = new VideoFrame(el.canvas, { timestamp: i * 1000000 / fps });
      encoder.encode(vf, { keyFrame: i % fps === 0 });
      vf.close();
      
      if (i % 5 === 0) {
        const pct = Math.round((i / totalFrames) * 100);
        el.recordPercent.textContent = pct + '%';
        el.recordFill.style.width = pct + '%';
        await new Promise(r => setTimeout(r, 0));
      }
    }
    
    await encoder.flush();
    muxer.finalize();
    const { buffer } = muxer.target;
    
    const blob = new Blob([buffer], { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `led-loop-${Date.now()}.mp4`;
    a.click();
    URL.revokeObjectURL(url);
    
    el.btnRecord.disabled = false;
    el.btnRecord.classList.remove('recording');
    el.recordProgress.classList.remove('visible');
    el.recordPercent.textContent = '100%';
    el.recordFill.style.width = '100%';
    showToast('录制完成');
    
    if (wasPlaying) renderer.start();
  }

  // Auth
  el.btnLogin.addEventListener('click', doLogin);
  el.pwdInput.addEventListener('keydown', e => { if(e.key === 'Enter') doLogin(); });

  function doLogin() {
    const pwd = el.pwdInput.value;
    fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd })
    }).then(res => res.json()).then(data => {
      if(data.success) {
        el.overlay.classList.add('hidden');
        el.app.classList.add('visible');
        initApp();
      } else {
        el.loginError.textContent = '密码错误';
        el.pwdInput.value = '';
        el.overlay.style.animation = 'shake 0.5s';
        setTimeout(() => el.overlay.style.animation = '', 500);
      }
    });
  }

  fetch('/api/auth-check')
    .then(res => res.json())
    .then(data => {
      if (data && data.authenticated === true) {
        el.overlay.classList.add('hidden');
        el.app.classList.add('visible');
        initApp();
      } else {
        el.overlay.classList.remove('hidden');
        el.app.classList.remove('visible');
      }
    })
    .catch(() => {
      el.overlay.classList.remove('hidden');
      el.app.classList.remove('visible');
    });
  
  // Shake animation css injection
  const style = document.createElement('style');
  style.innerHTML = `@keyframes shake { 0%, 100% {transform: translateX(0);} 25% {transform: translateX(-10px);} 75% {transform: translateX(10px);} }`;
  document.head.appendChild(style);

})();
