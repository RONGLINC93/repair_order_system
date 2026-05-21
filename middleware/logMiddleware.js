const LogService = require('../services/logService');

const apiLogger = (req, res, next) => {
    const startTime = Date.now();
    const originalSend = res.send;

    let responseBody = '';
    res.send = function(body) {
        responseBody = body;
        return originalSend.call(this, body);
    };

    res.on('finish', async () => {
        const duration = Date.now() - startTime;
        const statusCode = res.statusCode;
        
        const userId = req.user?.id || null;
        const ipAddress = req.ip || req.connection?.remoteAddress;
        const userAgent = req.get('User-Agent');

        await LogService.logApi(
            userId,
            req.method,
            req.originalUrl || req.path,
            statusCode,
            duration,
            ipAddress,
            userAgent
        );
    });

    next();
};

const errorLogger = (error, req, res, next) => {
    const ipAddress = req.ip || req.connection?.remoteAddress;
    const userId = req.user?.id || null;

    LogService.logError(
        userId,
        error,
        {
            method: req.method,
            path: req.originalUrl || req.path,
            body: req.body ? JSON.stringify(req.body).substring(0, 500) : null,
            query: req.query ? JSON.stringify(req.query) : null
        },
        ipAddress
    ).then(() => {
        console.error('请求处理错误:', error.message);
    }).catch(err => {
        console.error('日志记录错误:', err);
    });

    next(error);
};

const authLogger = {
    async loginSuccess(req, user, token) {
        await LogService.logAuth(
            user.id,
            user.username,
            '登录成功',
            true,
            req.ip || req.connection?.remoteAddress,
            req.get('User-Agent'),
            `Token生成成功`
        );
    },

    async loginFailed(req, username, reason) {
        await LogService.logAuth(
            null,
            username,
            '登录失败',
            false,
            req.ip || req.connection?.remoteAddress,
            req.get('User-Agent'),
            `失败原因: ${reason}`
        );
    },

    async logout(req, user) {
        await LogService.logAuth(
            user.id,
            user.username,
            '退出登录',
            true,
            req.ip || req.connection?.remoteAddress,
            req.get('User-Agent'),
            '用户主动退出'
        );
    },

    async tokenExpired(req, userId) {
        await LogService.logAuth(
            userId,
            '未知用户',
            'Token过期',
            false,
            req.ip || req.connection?.remoteAddress,
            req.get('User-Agent'),
            'Token已过期，需要重新登录'
        );
    }
};

module.exports = {
    apiLogger,
    errorLogger,
    authLogger,
    LogService
};
