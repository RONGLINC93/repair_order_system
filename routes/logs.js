const express = require('express');
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const type = req.query.type || '';
        const level = req.query.log_level || '';
        const keyword = req.query.keyword || '';
        const startDate = req.query.startDate || '';
        const endDate = req.query.endDate || '';
        const userId = req.user.id;
        const isAdmin = req.user.account_type === 'admin' || req.user.accountType === 'admin';

        let countSql = 'SELECT COUNT(*) as total FROM system_logs WHERE 1=1';
        let sql = 'SELECT * FROM system_logs WHERE 1=1';

        if (!isAdmin) {
            countSql += ' AND (user_id = ? OR is_public = true)';
            sql += ' AND (user_id = ? OR is_public = true)';
        }

        if (type) {
            const typeParam = `%${type}%`;
            countSql += ' AND log_type LIKE ?';
            sql += ' AND log_type LIKE ?';
        }

        if (level) {
            const validLevels = ['info', 'warning', 'error', 'debug', 'success'];
            if (!validLevels.includes(level)) {
                level = '';
            } else {
                countSql += ' AND log_level = ?';
                sql += ' AND log_level = ?';
            }
        }

        if (keyword) {
            const keywordParam = `%${keyword}%`;
            countSql += ' AND (message LIKE ? OR details LIKE ?)';
            sql += ' AND (message LIKE ? OR details LIKE ?)';
        }

        if (startDate) {
            countSql += ' AND created_at >= ?';
            sql += ' AND created_at >= ?';
        }

        if (endDate) {
            const endDateTime = `${endDate} 23:59:59`;
            countSql += ' AND created_at <= ?';
            sql += ' AND created_at <= ?';
        }

        let countParams = [];
        let params = [];

        if (!isAdmin) {
            countParams.push(userId);
            params.push(userId);
        }

        if (type) countParams.push(`%${type}%`);
        if (type) params.push(`%${type}%`);

        if (level) countParams.push(level);
        if (level) params.push(level);

        if (keyword) {
            countParams.push(`%${keyword}%`, `%${keyword}%`);
            params.push(`%${keyword}%`, `%${keyword}%`);
        }

        if (startDate) countParams.push(startDate);
        if (startDate) params.push(startDate);

        if (endDate) {
            countParams.push(`${endDate} 23:59:59`);
            params.push(`${endDate} 23:59:59`);
        }

        const countResult = await db.query(countSql, countParams);
        const total = countResult[0]?.total || 0;
        const totalPages = Math.ceil(total / limit) || 1;
        const offset = (Math.max(1, page) - 1) * limit;

        sql += ` ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;

        const logs = await db.query(sql, params);

        const levelCountResult = await db.query(
            `SELECT log_level, COUNT(*) as count FROM system_logs GROUP BY log_level`
        );

        const levelCounts = {};
        levelCountResult.forEach(row => {
            levelCounts[row.log_level] = row.count;
        });

        res.json({
            logs,
            total,
            totalPages,
            page: Math.max(1, page),
            limit,
            levelCounts
        });
    } catch (error) {
        console.error('获取系统日志错误:', error);
        res.status(500).json({ error: '服务器错误', message: error.message });
    }
});

router.get('/stats', authMiddleware, async (req, res) => {
    try {
        const isAdmin = req.user.account_type === 'admin' || req.user.accountType === 'admin';
        let sql = 'SELECT log_level, COUNT(*) as count FROM system_logs';
        
        if (!isAdmin) {
            sql += ' WHERE user_id = ? OR is_public = true';
        }
        
        sql += ' GROUP BY log_level';
        
        const params = isAdmin ? [] : [req.user.id];
        const result = await db.query(sql, params);
        
        const stats = {
            total: 0,
            info: 0,
            warning: 0,
            error: 0,
            debug: 0
        };
        
        result.forEach(row => {
            stats[row.log_level] = row.count;
            stats.total += row.count;
        });
        
        const recentLogs = await db.query(
            `SELECT * FROM system_logs ORDER BY created_at DESC LIMIT 5 ${isAdmin ? '' : `WHERE user_id = ${req.user.id} OR is_public = true`}`
        );
        
        res.json({ stats, recentLogs });
    } catch (error) {
        console.error('获取日志统计错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const isAdmin = req.user.account_type === 'admin' || req.user.accountType === 'admin';
        
        let sql = 'SELECT * FROM system_logs WHERE id = ?';
        const params = [id];
        
        if (!isAdmin) {
            sql += ' AND (user_id = ? OR is_public = true)';
            params.push(req.user.id);
        }
        
        const logs = await db.query(sql, params);
        
        if (logs.length === 0) {
            return res.status(404).json({ error: '日志不存在' });
        }
        
        res.json(logs[0]);
    } catch (error) {
        console.error('获取日志详情错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

router.post('/', authMiddleware, async (req, res) => {
    try {
        const isAdmin = req.user.account_type === 'admin' || req.user.accountType === 'admin';
        
        if (!isAdmin) {
            return res.status(403).json({ error: '权限不足' });
        }
        
        const { log_type, log_level, message, details, user_id, is_public, ip_address, user_agent } = req.body;
        
        if (!log_type || !log_level || !message) {
            return res.status(400).json({ error: '缺少必要参数' });
        }
        
        const result = await db.query(
            `INSERT INTO system_logs 
            (log_type, log_level, message, details, user_id, is_public, ip_address, user_agent, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                log_type,
                log_level,
                message,
                details || null,
                user_id || req.user.id,
                is_public !== undefined ? is_public : true,
                ip_address || req.ip,
                user_agent || req.get('User-Agent'),
                new Date(),
                new Date()
            ]
        );
        
        res.status(201).json({
            id: result.insertId,
            message: '日志创建成功'
        });
    } catch (error) {
        console.error('创建系统日志错误:', error);
        res.status(500).json({ error: '服务器错误', message: error.message });
    }
});

router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const isAdmin = req.user.account_type === 'admin' || req.user.accountType === 'admin';
        
        if (!isAdmin) {
            return res.status(403).json({ error: '权限不足' });
        }
        
        const result = await db.query('DELETE FROM system_logs WHERE id = ?', [id]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: '日志不存在' });
        }
        
        res.json({ message: '日志删除成功' });
    } catch (error) {
        console.error('删除系统日志错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

router.get('/type/:type', authMiddleware, async (req, res) => {
    try {
        const { type } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const isAdmin = req.user.account_type === 'admin' || req.user.accountType === 'admin';

        let countSql = 'SELECT COUNT(*) as total FROM system_logs WHERE log_type = ?';
        let sql = 'SELECT * FROM system_logs WHERE log_type = ?';

        if (!isAdmin) {
            countSql += ' AND (user_id = ? OR is_public = true)';
            sql += ' AND (user_id = ? OR is_public = true)';
        }

        const countParams = [type];
        const params = [type];

        if (!isAdmin) {
            countParams.push(req.user.id);
            params.push(req.user.id);
        }

        const countResult = await db.query(countSql, countParams);
        const total = countResult[0]?.total || 0;
        const totalPages = Math.ceil(total / limit) || 1;
        const offset = (Math.max(1, page) - 1) * limit;

        sql += ` ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;

        const logs = await db.query(sql, params);

        res.json({
            logs,
            total,
            totalPages,
            page: Math.max(1, page),
            limit,
            logType: type
        });
    } catch (error) {
        console.error('按类型获取日志错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

router.get('/level/:level', authMiddleware, async (req, res) => {
    try {
        const { level } = req.params;
        const validLevels = ['info', 'warning', 'error', 'debug'];
        
        if (!validLevels.includes(level)) {
            return res.status(400).json({ error: '无效的日志级别' });
        }
        
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const isAdmin = req.user.account_type === 'admin' || req.user.accountType === 'admin';

        let countSql = 'SELECT COUNT(*) as total FROM system_logs WHERE log_level = ?';
        let sql = 'SELECT * FROM system_logs WHERE log_level = ?';

        if (!isAdmin) {
            countSql += ' AND (user_id = ? OR is_public = true)';
            sql += ' AND (user_id = ? OR is_public = true)';
        }

        const countParams = [level];
        const params = [level];

        if (!isAdmin) {
            countParams.push(req.user.id);
            params.push(req.user.id);
        }

        const countResult = await db.query(countSql, countParams);
        const total = countResult[0]?.total || 0;
        const totalPages = Math.ceil(total / limit) || 1;
        const offset = (Math.max(1, page) - 1) * limit;

        sql += ` ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;

        const logs = await db.query(sql, params);

        res.json({
            logs,
            total,
            totalPages,
            page: Math.max(1, page),
            limit,
            logLevel: level
        });
    } catch (error) {
        console.error('按级别获取日志错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});


module.exports = router;
