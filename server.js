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

// 读取配置
const readConfig = () => {
  try {
    if (fs.existsSync(configFile)) {
      const data = fs.readFileSync(configFile, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error reading config file:', error);
  }
  return {}; // 默认空对象
};

// 保存配置
const saveConfig = (config) => {
  try {
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf8');
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
  const config = readConfig();
  
  if (password === config.password) {
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

// 获取配置
app.get('/api/config', (req, res) => {
  const config = readConfig();
  // 过滤掉密码字段
  const { password, ...safeConfig } = config;
  res.json(safeConfig);
});

// 更新配置
app.post('/api/config', requireAuth, (req, res) => {
  const currentConfig = readConfig();
  const newConfigData = req.body;
  
  // 防止意外覆盖密码
  const password = newConfigData.password || currentConfig.password;
  
  const mergedConfig = { ...currentConfig, ...newConfigData, password };
  
  if (saveConfig(mergedConfig)) {
    res.json({ success: true });
  } else {
    res.status(500).json({ error: 'Failed to save configuration' });
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
