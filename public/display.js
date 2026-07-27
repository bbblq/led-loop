(async () => {
  const canvas = document.getElementById('led-canvas');
  const video = document.getElementById('bg-video');
  
  // Fetch initial config from /api/config
  let config = await fetch('/api/config').then(r => r.json());
  
  // Create renderer
  const renderer = new LEDRenderer(canvas);
  renderer.updateConfig(config);
  
  // Load custom font if configured
  if (config.fontFamily) {
    // Fetch font list to find the URL
    const fonts = await fetch('/api/fonts').then(r => r.json());
    const font = fonts.find(f => f.name === config.fontFamily || f.filename === config.fontFamily);
    if (font) {
      await renderer.loadFont(config.fontFamily, font.url);
    }
  }
  
  // Setup video background if configured
  if (config.bgVideo) {
    video.src = config.bgVideo;
    video.play().catch(() => {});
    renderer.setVideoElement(video);
  }
  
  // Start rendering
  renderer.start();
  
  // Poll for config changes every 2 seconds
  let lastConfigStr = JSON.stringify(config);
  setInterval(async () => {
    try {
      const newConfig = await fetch('/api/config').then(r => r.json());
      const newStr = JSON.stringify(newConfig);
      if (newStr !== lastConfigStr) {
        lastConfigStr = newStr;
        config = newConfig;
        renderer.updateConfig(config);
        
        // Handle font change
        if (config.fontFamily) {
          const fonts = await fetch('/api/fonts').then(r => r.json());
          const font = fonts.find(f => f.name === config.fontFamily || f.filename === config.fontFamily);
          if (font) await renderer.loadFont(config.fontFamily, font.url);
        }
        
        // Handle video background change
        if (config.bgType === 'video' && config.bgVideo) {
          if (video.src !== location.origin + config.bgVideo) {
            video.src = config.bgVideo;
            video.play().catch(() => {});
            renderer.setVideoElement(video);
          }
        }
      }
    } catch (e) {
      console.warn('Config poll failed:', e);
    }
  }, 2000);
})();
