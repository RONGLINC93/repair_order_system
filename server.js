const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');

// 存储活跃的SSE连接
const activeConnections = new Map();
// 确保正确加载.env文件，即使从不同目录启动
const dotenv = require('dotenv');
const fs = require('fs');

// 尝试加载.env文件的不同路径
if (fs.existsSync('.env')) {
    dotenv.config();
} else if (fs.existsSync(path.join(__dirname, '.env'))) {
    dotenv.config({ path: path.join(__dirname, '.env') });
}

// 确保JWT_SECRET总是有值
if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'fallback_jwt_secret_key_for_emergency_use_only';
}

const db = require('./config/database');
const { startLogCleaner } = require('./services/logCleaner');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const workOrderRoutes = require('./routes/workOrders');
const notificationRoutes = require('./routes/notifications');
const addressRoutes = require('./routes/addresses');
const chatRoutes = require('./routes/chat');
const companyInfoRoutes = require('./routes/company-info');
const materialRequestRoutes = require('./routes/materialRequests');
const noteRoutes = require('./routes/notes');
const storageRoutes = require('./routes/storage');
const logRoutes = require('./routes/logs');
const backupRoutes = require('./routes/backup');
const settingsRoutes = require('./routes/settings');
const versionsRoutes = require('./routes/versions');
const { router: farmRoutes, loadLotteryConfig } = require('./routes/farm');
const favoriteRoutes = require('./routes/favorites');
const { apiLogger, errorLogger } = require('./middleware/logMiddleware');

const app = express();
const PORT = process.env.PORT || 80;  

// 配置文件上传
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = path.join(__dirname, 'public', 'uploads', 'avatars');
        // 确保上传目录存在
        const fs = require('fs');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'avatar-' + req.user.id + '-' + uniqueSuffix + ext);
    }
});

const fileFilter = (req, file, cb) => {
    // 只允许图片文件
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('只允许上传图片文件'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB限制
    }
});

// 中间件
app.use(cors());
// 配置Express正确处理UTF-8编码
app.use(express.json({ charset: 'utf-8' }));
app.use(express.urlencoded({ extended: true, charset: 'utf-8' }));

// 日志中间件（在API路由之前注册，自动记录所有API请求）
app.use(apiLogger);

// API路由
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/work-orders', workOrderRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/company-info', companyInfoRoutes);
app.use('/api/material-requests', materialRequestRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/storage', storageRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/versions', versionsRoutes);
app.use('/api/farm', farmRoutes);
app.use('/api/favorites', favoriteRoutes);

// 错误处理中间件
app.use(errorLogger);

app.use((error, req, res, next) => {
    res.status(500).json({ 
        error: '服务器错误',
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
});

// SSE实时通知路由
app.get('/api/notifications/stream', (req, res) => {
    const userId = req.query.userId;
    if (!userId) {
        return res.status(400).json({ error: '需要用户ID' });
    }

    // 设置SSE头
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // 连接ID
    const connectionId = `${userId}_${Date.now()}`;
    
    // 存储连接（确保userId为相同类型）
    activeConnections.set(connectionId, {
        userId: parseInt(userId), // 转换为数字类型
        response: res,
        connectionId: connectionId, // 添加connectionId到连接对象中
        timestamp: new Date()
    });

    // 发送连接确认
    res.write(`data: ${JSON.stringify({ type: 'connected', connectionId })}\n\n`);

    // 心跳检测
    const heartbeat = setInterval(() => {
        if (activeConnections.has(connectionId)) {
            res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`);
        } else {
            clearInterval(heartbeat);
        }
    }, 30000); // 每30秒发送一次心跳

    // 处理客户端断开连接
    req.on('close', () => {
        clearInterval(heartbeat);
        activeConnections.delete(connectionId);
    });
});

// 通知推送函数
const pushNotificationToUser = (userId, notification) => {
    const connections = Array.from(activeConnections.values()).filter(conn => conn.userId === userId);
    
    connections.forEach(conn => {
        try {
            const message = JSON.stringify({ 
                type: 'notification', 
                data: notification 
            });
            conn.response.write(`data: ${message}\n\n`);
        } catch (error) {
            // 清理无效连接
            activeConnections.delete(conn.connectionId);
        }
    });
};

// 广播通知给所有连接的用户
const broadcastNotification = (notification) => {
    activeConnections.forEach((conn, connectionId) => {
        try {
            conn.response.write(`data: ${JSON.stringify({ 
                type: 'notification', 
                data: notification 
            })}\n\n`);
        } catch (error) {
            activeConnections.delete(connectionId);
        }
    });
};

// 将推送函数导出给其他模块使用
global.pushNotificationToUser = pushNotificationToUser;
global.broadcastNotification = broadcastNotification;

// 测试设备检测API
app.get('/test-device', (req, res) => {
    const userAgent = req.headers['user-agent'] || '';
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    
    res.json({
        userAgent: userAgent,
        isMobile: isMobile,
        deviceType: isMobile ? '移动端' : '桌面端'
    });
});

// 设备检测中间件
const detectDevice = (req, res, next) => {
    const userAgent = req.headers['user-agent'] || '';
    req.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    next();
};

// 前端路由处理 - 处理所有HTML页面请求
app.get('*.html', detectDevice, (req, res) => {
    const userAgent = req.headers['user-agent'] || '';    
    let requestedFile = req.url;
    // 去掉查询参数，只保留路径部分用于页面类型判断
    const pathOnly = requestedFile.split('?')[0];
    
    // 登录页面不进行设备检测重定向，避免循环
    if (pathOnly === '/login.html') {
        const filePath = path.join(__dirname, 'public', 'login.html');
        return res.sendFile(filePath);
    }
    
    if (requestedFile === '/') {
        requestedFile = '/mobile-index.html';
    } else {
        // 检查请求的是移动端页面还是桌面端页面
        const isMobilePage = pathOnly.startsWith('/mobile-');
        const isDesktopPage = !isMobilePage && pathOnly.endsWith('.html');
        
        // 如果设备类型与请求的页面类型不匹配，跳转到对应类型的页面
        if (req.isMobile && isDesktopPage) {
            // 移动端请求桌面端页面，重定向到移动端对应页面
            requestedFile = requestedFile.replace(/^(\/)([^?]+)(\?|$)/, '$1mobile-$2$3');
        } else if (!req.isMobile && isMobilePage) {
            // 桌面端请求移动端页面，重定向到桌面端对应页面
            requestedFile = requestedFile.replace('/mobile-', '/');
        }
    }
    
    // 确保文件存在，否则返回404
    const filePath = path.join(__dirname, 'public', pathOnly);
    fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
            const notFoundPath = path.join(__dirname, 'public', 'mobile-404.html');
            return res.status(404).sendFile(notFoundPath);
        }
        
        res.sendFile(filePath);
    });
});

// 根路径处理
app.get('/', detectDevice, (req, res) => {
    const indexFile = 'mobile-index.html';
    res.sendFile(path.join(__dirname, 'public', indexFile));
});

// 静态文件服务（放在最后，确保HTML页面请求先经过路由处理）
app.use(express.static(path.join(__dirname, 'public')));

// 备份文件目录
app.use('/backups', express.static(path.join(__dirname, 'backups')));

// 版本文件目录
app.use('/version', express.static(path.join(__dirname, 'version')));

// 404页面处理 - 所有未匹配的路由都返回404页面
app.use((req, res) => {
    const filePath = path.join(__dirname, 'public', 'mobile-404.html');
    res.status(404).sendFile(filePath);
});

// 启动服务器
async function startServer() {
    try {
        // 初始化数据库
        await db.initializeDatabase();
        
        // 更新连接池配置，使用正确的数据库名称
        await db.updatePoolConfig();
        
        // 加载抽奖配置
        await loadLotteryConfig();
        
        // 启动日志自动清理服务
        startLogCleaner();
        
        // 启动HTTP服务器
        app.listen(PORT, () => {
            console.log(`服务器运行在 http://localhost:${PORT}`);
        });
        
    } catch (error) {
        console.error('服务器启动失败:', error);
        process.exit(1);
    }
}

startServer();