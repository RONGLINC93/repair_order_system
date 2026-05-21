const express = require('express');
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const { cleanOldLogs } = require('../services/logCleaner');

const router = express.Router();

router.get('/log-clear-period', authMiddleware, async (req, res) => {
    try {
        const isAdmin = req.user.account_type === 'admin' || req.user.accountType === 'admin';
        
        if (!isAdmin) {
            return res.status(403).json({ error: '权限不足，仅管理员可查看此设置' });
        }
        
        const result = await db.query(
            'SELECT setting_value FROM system_settings WHERE setting_key = ?',
            ['log_clear_period']
        );
        
        const period = result.length > 0 ? parseInt(result[0].setting_value) || 0 : 0;
        
        res.json({ period });
    } catch (error) {
        console.error('获取日志清理周期设置错误:', error);
        res.status(500).json({ error: '服务器错误', message: error.message });
    }
});

router.put('/log-clear-period', authMiddleware, async (req, res) => {
    try {
        const isAdmin = req.user.account_type === 'admin' || req.user.accountType === 'admin';
        
        if (!isAdmin) {
            return res.status(403).json({ error: '权限不足，仅管理员可修改此设置' });
        }
        
        const { period } = req.body;
        
        if (period === undefined || period === null || isNaN(parseInt(period))) {
            return res.status(400).json({ error: '请提供有效的周期值' });
        }
        
        const periodValue = parseInt(period);
        const validValues = [0, 1, 7, 14, 30, 60, 90, 180, 365];
        
        if (!validValues.includes(periodValue)) {
            return res.status(400).json({ error: '无效的周期值，允许的值：0, 1, 7, 14, 30, 60, 90, 180, 365' });
        }
        
        const checkResult = await db.query(
            'SELECT id FROM system_settings WHERE setting_key = ?',
            ['log_clear_period']
        );
        
        if (checkResult.length > 0) {
            await db.query(
                'UPDATE system_settings SET setting_value = ?, updated_at = ? WHERE setting_key = ?',
                [periodValue.toString(), new Date(), 'log_clear_period']
            );
        } else {
            await db.query(
                'INSERT INTO system_settings (setting_key, setting_value, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
                ['log_clear_period', periodValue.toString(), '日志自动清空周期（天），0表示不自动清空', new Date(), new Date()]
            );
        }
        
        res.json({ 
            message: '设置保存成功',
            period: periodValue
        });
    } catch (error) {
        console.error('保存日志清理周期设置错误:', error);
        res.status(500).json({ error: '服务器错误', message: error.message });
    }
});

router.get('/all', authMiddleware, async (req, res) => {
    try {
        const isAdmin = req.user.account_type === 'admin' || req.user.accountType === 'admin';
        
        if (!isAdmin) {
            return res.status(403).json({ error: '权限不足，仅管理员可查看所有设置' });
        }
        
        const result = await db.query('SELECT setting_key, setting_value, description FROM system_settings');
        
        const settings = {};
        result.forEach(row => {
            settings[row.setting_key] = {
                value: row.setting_value,
                description: row.description
            };
        });
        
        res.json({ settings });
    } catch (error) {
        console.error('获取所有设置错误:', error);
        res.status(500).json({ error: '服务器错误', message: error.message });
    }
});

router.post('/clean-logs', authMiddleware, async (req, res) => {
    try {
        const isAdmin = req.user.account_type === 'admin' || req.user.accountType === 'admin';
        
        if (!isAdmin) {
            return res.status(403).json({ error: '权限不足，仅管理员可执行此操作' });
        }
        
        const result = await cleanOldLogs();
        
        res.json({
            message: '日志清理完成',
            ...result
        });
    } catch (error) {
        console.error('手动清理日志错误:', error);
        res.status(500).json({ error: '服务器错误', message: error.message });
    }
});

router.post('/clear-all-logs', authMiddleware, async (req, res) => {
    try {
        const isAdmin = req.user.account_type === 'admin' || req.user.accountType === 'admin';
        
        if (!isAdmin) {
            return res.status(403).json({ error: '权限不足，仅管理员可执行此操作' });
        }
        
        const result = await db.query('DELETE FROM system_logs');
        
        const deletedCount = result.affectedRows || 0;
        
        await db.query(
            'INSERT INTO system_logs (log_type, log_level, message, details, is_public) VALUES (?, ?, ?, ?, ?)',
            [
                'system',
                'info',
                '清空所有日志',
                `管理员清空了所有日志记录，共 ${deletedCount} 条`,
                true
            ]
        );
        
        res.json({
            message: '所有日志已清空',
            deletedCount
        });
    } catch (error) {
        console.error('清空所有日志错误:', error);
        res.status(500).json({ error: '服务器错误', message: error.message });
    }
});

module.exports = router;
