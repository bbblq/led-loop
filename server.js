const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

// 确保目录存在
const dataDir = path.join(__dirname, 'data');
const fontsDir = path.join(__dirname, 'uploads', 'fonts');
const videosDir = path.join(__dirname, 'uploads', 'videos');

[dataDir, fontsDir, videosDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Config file path
const configFile = path.join(dataDir, 'config.json');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: 'led-loop-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 1 day
}));

// 鉴权中间件
const requireAuth = (req, res, next) => {
  if (req.session.authenticated === true) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

// 静态文件路由
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 页面路由
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'display.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

const defaultPresets = [
  {
    id: "preset-1",
    name: "预设 1 (欢迎模式)",
    config: {
      text: "★ 欢迎光临 ★ Welcome ★",
      fontSize: 120,
      fontWeight: "700",
      fontFamily: "",
      textColor: "#ffffff",
      textGap: 200,
      textGlow: true,
      textShadow: false,
      textOutline: false,
      outlineColor: "#000000",
      scrollSpeed: 3,
      activeWidth: 1920,
      textVertical: 50,
      bgType: "gradient-flow",
      bgColor1: "#0a0a2e",
      bgColor2: "#1a1a4e",
      bgSpeed: 1,
      bgVideo: ""
    }
  },
  {
    id: "preset-2",
    name: "预设 2 (特惠活动)",
    config: {
      text: "🔥 精彩活动进行中 ★ 全场特惠 🔥",
      fontSize: 130,
      fontWeight: "900",
      fontFamily: "",
      textColor: "#ffe600",
      textGap: 180,
      textGlow: true,
      textShadow: true,
      textOutline: true,
      outlineColor: "#ff0000",
      scrollSpeed: 4,
      textVertical: 50,
      bgType: "neon-pulse",
      bgColor1: "#240046",
      bgColor2: "#7b2cbf",
      bgSpeed: 1.5,
      bgVideo: ""
    }
  }
];

// 读取完整配置 (包含 presets 和 activePresetId)
const readRawConfig = () => {
  try {
    if (fs.existsSync(configFile)) {
      const data = fs.readFileSync(configFile, 'utf8');
      const parsed = JSON.parse(data);
      
      // 旧配置兼容迁移
      if (!parsed.presets || !Array.isArray(parsed.presets)) {
        const legacyConfig = { ...defaultPresets[0].config, ...parsed };
        delete legacyConfig.password;
        delete legacyConfig.presets;
        delete legacyConfig.activePresetId;

        const migratedData = {
          activePresetId: "preset-1",
          presets: [
            { id: "preset-1", name: "预设 1 (欢迎模式)", config: legacyConfig },
            defaultPresets[1]
          ],
          password: parsed.password || "admin"
        };
        saveRawConfig(migratedData);
        return migratedData;
      }
      return parsed;
    }
  } catch (error) {
    console.error('Error reading config file:', error);
  }
  
  const initial = {
    activePresetId: "preset-1",
    presets: defaultPresets,
    password: "admin"
  };
  saveRawConfig(initial);
  return initial;
};

// 保存完整配置
const saveRawConfig = (rawConfig) => {
  try {
    fs.writeFileSync(configFile, JSON.stringify(rawConfig, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error writing config file:', error);
    return false;
  }
};

// --- API 路由 ---

// 登录鉴权
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  const raw = readRawConfig();
  const targetPassword = String(raw.password || 'admin').trim();
  const inputPassword = password ? String(password).trim() : '';

  if (inputPassword === targetPassword) {
    req.session.authenticated = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

// 检查鉴权状态
app.get('/api/auth-check', (req, res) => {
  res.json({ authenticated: req.session.authenticated === true });
});

// 获取当前激活的配置 (展示页和播放器使用)
app.get('/api/config', (req, res) => {
  const raw = readRawConfig();
  const activePreset = raw.presets.find(p => p.id === raw.activePresetId) || raw.presets[0];
  res.json({
    ...activePreset.config,
    activePresetId: activePreset.id,
    activePresetName: activePreset.name
  });
});

// 更新当前激活配置
app.post('/api/config', requireAuth, (req, res) => {
  const raw = readRawConfig();
  const activeIndex = raw.presets.findIndex(p => p.id === raw.activePresetId);
  const targetIndex = activeIndex >= 0 ? activeIndex : 0;
  
  const updatedConfig = { ...raw.presets[targetIndex].config, ...req.body };
  delete updatedConfig.password;
  delete updatedConfig.activePresetId;
  delete updatedConfig.activePresetName;

  raw.presets[targetIndex].config = updatedConfig;
  
  if (saveRawConfig(raw)) {
    res.json({ success: true, activePresetId: raw.presets[targetIndex].id });
  } else {
    res.status(500).json({ error: 'Failed to save configuration' });
  }
});

// --- 预设场景管理 API ---

// 获取所有预设场景列表
app.get('/api/presets', (req, res) => {
  const raw = readRawConfig();
  res.json({
    activePresetId: raw.activePresetId,
    presets: raw.presets
  });
});

// 切换激活预设场景
app.post('/api/presets/activate', requireAuth, (req, res) => {
  const { id } = req.body;
  const raw = readRawConfig();
  const target = raw.presets.find(p => p.id === id);
  if (!target) {
    return res.status(404).json({ error: 'Preset not found' });
  }
  raw.activePresetId = id;
  if (saveRawConfig(raw)) {
    res.json({ success: true, activePreset: target });
  } else {
    res.status(500).json({ error: 'Failed to activate preset' });
  }
});

// 新增或更新预设场景
app.post('/api/presets/save', requireAuth, (req, res) => {
  const { id, name, config } = req.body;
  const raw = readRawConfig();
  
  if (id) {
    // 更新现有预设
    const preset = raw.presets.find(p => p.id === id);
    if (preset) {
      if (name) preset.name = name;
      if (config) preset.config = { ...preset.config, ...config };
      raw.activePresetId = id;
    }
  } else {
    // 新增预设场景
    const newId = 'preset-' + Date.now();
    const newPreset = {
      id: newId,
      name: name || `自定义场景 ${raw.presets.length + 1}`,
      config: config || { ...raw.presets[0].config }
    };
    raw.presets.push(newPreset);
    raw.activePresetId = newId;
  }

  if (saveRawConfig(raw)) {
    res.json({ success: true, activePresetId: raw.activePresetId, presets: raw.presets });
  } else {
    res.status(500).json({ error: 'Failed to save preset' });
  }
});

// 重命名预设场景
app.post('/api/presets/rename', requireAuth, (req, res) => {
  const { id, name } = req.body;
  if (!id || !name) {
    return res.status(400).json({ error: 'Missing id or name' });
  }
  const raw = readRawConfig();
  const preset = raw.presets.find(p => p.id === id);
  if (!preset) {
    return res.status(404).json({ error: 'Preset not found' });
  }
  preset.name = name.trim();
  if (saveRawConfig(raw)) {
    res.json({ success: true, presets: raw.presets });
  } else {
    res.status(500).json({ error: 'Failed to rename preset' });
  }
});

// 删除预设场景
app.delete('/api/presets/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const raw = readRawConfig();
  
  if (raw.presets.length <= 1) {
    return res.status(400).json({ error: '无法删除唯一的预设场景' });
  }

  raw.presets = raw.presets.filter(p => p.id !== id);
  if (raw.activePresetId === id) {
    raw.activePresetId = raw.presets[0].id;
  }

  if (saveRawConfig(raw)) {
    res.json({ success: true, activePresetId: raw.activePresetId, presets: raw.presets });
  } else {
    res.status(500).json({ error: 'Failed to delete preset' });
  }
});

// --- 文件上传配置 ---

// 字体上传配置
const fontStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, fontsDir);
  },
  filename: (req, file, cb) => {
    // 保持原始文件名，替换空格
    cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '-'));
  }
});

const fontUpload = multer({
  storage: fontStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.ttf', '.otf', '.woff', '.woff2'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid font file type'));
    }
  }
});

// 视频上传配置
const videoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, videosDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '-'));
  }
});

const videoUpload = multer({
  storage: videoStorage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.mp4', '.webm'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid video file type'));
    }
  }
});

// 错误处理中间件
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    res.status(400).json({ success: false, error: err.message });
  } else if (err) {
    res.status(400).json({ success: false, error: err.message });
  } else {
    next();
  }
};

// 字体相关路由
app.post('/api/upload/font', requireAuth, (req, res, next) => {
  fontUpload.single('font')(req, res, (err) => {
    if (err) return handleMulterError(err, req, res, next);
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
    
    res.json({
      success: true,
      name: req.file.originalname,
      filename: req.file.filename,
      url: `/uploads/fonts/${req.file.filename}`
    });
  });
});

app.get('/api/fonts', (req, res) => {
  try {
    const files = fs.readdirSync(fontsDir);
    const fonts = files
      .filter(file => file !== '.gitkeep')
      .map(file => ({
        name: file.split('-').slice(1).join('-') || file, // 简单还原原名
        filename: file,
        url: `/uploads/fonts/${file}`
      }));
    res.json(fonts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read fonts directory' });
  }
});

app.delete('/api/fonts/:filename', requireAuth, (req, res) => {
  try {
    const filePath = path.join(fontsDir, req.params.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'File not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// 视频相关路由
app.post('/api/upload/video', requireAuth, (req, res, next) => {
  videoUpload.single('video')(req, res, (err) => {
    if (err) return handleMulterError(err, req, res, next);
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
    
    res.json({
      success: true,
      name: req.file.originalname,
      filename: req.file.filename,
      url: `/uploads/videos/${req.file.filename}`
    });
  });
});

app.get('/api/videos', (req, res) => {
  try {
    const files = fs.readdirSync(videosDir);
    const videos = files
      .filter(file => file !== '.gitkeep')
      .map(file => ({
        name: file.split('-').slice(1).join('-') || file,
        filename: file,
        url: `/uploads/videos/${file}`
      }));
    res.json(videos);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read videos directory' });
  }
});

app.delete('/api/videos/:filename', requireAuth, (req, res) => {
  try {
    const filePath = path.join(videosDir, req.params.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'File not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
