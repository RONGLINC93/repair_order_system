const db = require('../config/database');

class LogService {
    static async createLog(logData) {
        try {
            const {
                log_type,
                log_level = 'info',
                message,
                details = null,
                user_id = null,
                is_public = true,
                related_id = null,
                related_type = null,
                ip_address = null,
                user_agent = null
            } = logData;

            if (!log_type || !message) {
                console.warn('日志记录失败: 缺少必要参数');
                return null;
            }

            const validTypes = ['auth', 'work_order', 'system', 'api', 'error', 'database', 'security', 'custom'];
            const validLevels = ['info', 'warning', 'error', 'debug'];

            if (!validTypes.includes(log_type)) {
                console.warn(`日志类型无效: ${log_type}`);
                return null;
            }

            if (!validLevels.includes(log_level)) {
                log_level = 'info';
            }

            const result = await db.query(
                `INSERT INTO system_logs 
                (log_type, log_level, message, details, user_id, is_public, related_id, related_type, ip_address, user_agent, created_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    log_type,
                    log_level,
                    message,
                    details,
                    user_id,
                    is_public ? 1 : 0,
                    related_id,
                    related_type,
                    ip_address,
                    user_agent,
                    new Date()
                ]
            );

            return result.insertId;
        } catch (error) {
            console.error('创建日志错误:', error);
            return null;
        }
    }

    static async logAuth(userId, username, action, success, ipAddress, userAgent, details = null) {
        return await this.createLog({
            log_type: 'auth',
            log_level: success ? 'info' : 'warning',
            message: `用户 ${username} ${action}`,
            details: details || (success ? '登录成功' : '登录失败'),
            user_id: userId,
            is_public: true,
            related_id: userId,
            related_type: 'users',
            ip_address: ipAddress,
            user_agent: userAgent
        });
    }

    static async logWorkOrder(userId, action, workOrderId, details = null) {
        return await this.createLog({
            log_type: 'work_order',
            log_level: 'info',
            message: `工单 ${workOrderId}: ${action}`,
            details: details,
            user_id: userId,
            is_public: true,
            related_id: workOrderId,
            related_type: 'work_order',
            ip_address: null,
            user_agent: null
        });
    }

    static async logSystem(action, details = null, logLevel = 'info') {
        return await this.createLog({
            log_type: 'system',
            log_level: logLevel,
            message: `系统: ${action}`,
            details: details,
            user_id: null,
            is_public: true,
            ip_address: null,
            user_agent: null
        });
    }

    static async logApi(userId, method, path, statusCode, duration, ipAddress, userAgent) {
        const logLevel = statusCode >= 400 ? 'warning' : 'info';
        const logType = statusCode >= 500 ? 'error' : 'api';
        
        return await this.createLog({
            log_type: logType,
            log_level: logLevel,
            message: `API调用: ${method} ${path}`,
            details: `状态码: ${statusCode}, 耗时: ${duration}ms`,
            user_id: userId,
            is_public: true,
            ip_address: ipAddress,
            user_agent: userAgent
        });
    }

    static async logError(userId, error, context = null, ipAddress = null) {
        const errorMessage = error.message || error.toString();
        const errorStack = error.stack || '';
        
        return await this.createLog({
            log_type: 'error',
            log_level: 'error',
            message: `错误: ${errorMessage}`,
            details: context ? `上下文: ${JSON.stringify(context)}\n\n堆栈: ${errorStack}` : errorStack,
            user_id: userId,
            is_public: true,
            ip_address: ipAddress,
            user_agent: null
        });
    }

    static async logDatabase(userId, operation, tableName, recordId, details = null) {
        return await this.createLog({
            log_type: 'database',
            log_level: 'info',
            message: `数据库操作: ${operation} - ${tableName}`,
            details: details || `记录ID: ${recordId}`,
            user_id: userId,
            is_public: true,
            related_id: recordId,
            related_type: tableName
        });
    }

    static async logSecurity(userId, action, ipAddress, userAgent, details = null) {
        return await this.createLog({
            log_type: 'security',
            log_level: 'warning',
            message: `安全事件: ${action}`,
            details: details,
            user_id: userId,
            is_public: true,
            ip_address: ipAddress,
            user_agent: userAgent
        });
    }

    static async logCustom(userId, message, details = null, logLevel = 'info') {
        return await this.createLog({
            log_type: 'custom',
            log_level: logLevel,
            message: message,
            details: details,
            user_id: userId,
            is_public: true
        });
    }

    static async getRecentLogs(limit = 50) {
        try {
            return await db.query(
                'SELECT * FROM system_logs ORDER BY created_at DESC LIMIT ?',
                [limit]
            );
        } catch (error) {
            console.error('获取最近日志错误:', error);
            return [];
        }
    }

    static async getLogsByUser(userId, limit = 50) {
        try {
            return await db.query(
                'SELECT * FROM system_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
                [userId, limit]
            );
        } catch (error) {
            console.error('获取用户日志错误:', error);
            return [];
        }
    }

    static async getErrorLogs(limit = 100) {
        try {
            return await db.query(
                'SELECT * FROM system_logs WHERE log_level = ? ORDER BY created_at DESC LIMIT ?',
                ['error', limit]
            );
        } catch (error) {
            console.error('获取错误日志错误:', error);
            return [];
        }
    }

    static async clearOldLogs(daysToKeep = 30) {
        try {
            const result = await db.query(
                'DELETE FROM system_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)',
                [daysToKeep]
            );
            console.log(`已清理 ${result.affectedRows} 条旧日志`);
            return result.affectedRows;
        } catch (error) {
            console.error('清理旧日志错误:', error);
            return 0;
        }
    }
}

module.exports = LogService;
