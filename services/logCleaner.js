const db = require('../config/database');

async function getLogClearPeriod() {
    try {
        const result = await db.query(
            'SELECT setting_value FROM system_settings WHERE setting_key = ?',
            ['log_clear_period']
        );
        
        if (result.length > 0) {
            return parseInt(result[0].setting_value) || 0;
        }
        return 0;
    } catch (error) {
        console.error('获取日志清理周期设置失败:', error);
        return 0;
    }
}

async function cleanOldLogs() {
    try {
        const period = await getLogClearPeriod();
        
        if (period <= 0) {
            return { cleaned: 0, message: '未设置自动清理，跳过' };
        }
        
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - period);
        const cutoffDateStr = cutoffDate.toISOString().slice(0, 19).replace('T', ' ');
        
        const result = await db.query(
            'DELETE FROM system_logs WHERE created_at < ?',
            [cutoffDateStr]
        );
        
        console.log(`[日志清理] 成功清理 ${result.affectedRows} 条超过 ${period} 天的日志记录`);
        
        if (result.affectedRows > 0) {
            await db.query(
                'INSERT INTO system_logs (log_type, log_level, message, details, is_public,created_at,updated_at) VALUES (?, ?, ?, ?, ?,?,?)',
                [
                    'system',
                    'info',
                    '系统自动清理日志',
                    `系统自动清理了 ${result.affectedRows} 条超过 ${period} 天的日志记录`,
                    true,
                    new Date(),
                    new Date()
                ]
            );
        }
        
        return {
            cleaned: result.affectedRows,
            message: `成功清理 ${result.affectedRows} 条日志`
        };
    } catch (error) {
        console.error('清理日志失败:', error);
        
        await db.query(
            'INSERT INTO system_logs (log_type, log_level, message, details, is_public,created_at,updated_at) VALUES (?, ?, ?, ?, ?,?,?)',
            [
                'system',
                'error',
                '系统自动清理日志失败',
                `清理日志失败: ${error.message}`,
                true,
                new Date(),
                new Date()
            ]
        );
        
        throw error;
    }
}

function startLogCleaner() {
    console.log('[日志清理服务] 启动日志自动清理服务...');
    
    cleanOldLogs().catch(err => {
        console.error('[日志清理服务] 首次清理失败:', err);
    });
    
    const ONE_HOUR = 60 * 60 * 1000;
    const cleanInterval = setInterval(async () => {
        try {
            await cleanOldLogs();
        } catch (error) {
            console.error('[日志清理服务] 定时清理失败:', error);
        }
    }, ONE_HOUR);
    
    console.log('[日志清理服务] 已设置每小时自动清理检查');
    
    return {
        stop: () => {
            clearInterval(cleanInterval);
            console.log('[日志清理服务] 已停止');
        }
    };
}

module.exports = {
    getLogClearPeriod,
    cleanOldLogs,
    startLogCleaner
};
