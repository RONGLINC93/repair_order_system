const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).json({ error: '访问被拒绝，需要token' });
    }
    
    try {
        // 使用与server.js一致的fallback机制
        const jwtSecret = process.env.JWT_SECRET || 'fallback_jwt_secret_key_for_emergency_use_only';
        const decoded = jwt.verify(token, jwtSecret);
        
        // 确保req.user同时包含full_name/fullName和account_type/accountType，以兼容不同的大小写使用
        req.user = {
            ...decoded,
            // 确保用户名相关字段都可用，优先使用已有的值
            full_name: decoded.full_name || decoded.fullName || '',
            fullName: decoded.fullName || decoded.full_name || '',
            // 确保账号类型相关字段都可用，优先使用已有的值
            account_type: decoded.account_type || decoded.accountType || '',
            accountType: decoded.accountType || decoded.account_type || ''
        };
        
        next();
    } catch (error) {
        console.error('JWT验证错误:', error);
        res.status(401).json({ error: '无效的token' });
    }
};

const checkPermission = (permission) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: '未登录' });
        }
        
        const user = req.user;
        let permissions = [];
        
        // 处理权限字段
        if (user.permissions) {
            if (typeof user.permissions === 'string') {
                permissions = user.permissions.split('|').map(p => p.trim()).filter(p => p);
            } else if (Array.isArray(user.permissions)) {
                permissions = user.permissions;
            }
        }
        
        // 管理员拥有所有权限（支持两种字段名）
        const isAdmin = user.account_type === 'admin' || user.accountType === 'admin';
                
        if (isAdmin || permissions.includes(permission)) {
            next();
        } else {
            console.log('权限不足，拒绝访问');
            res.status(403).json({ error: '权限不足' });
        }
    };
};

module.exports = { authMiddleware, checkPermission };