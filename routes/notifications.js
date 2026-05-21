const express = require('express');
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const NotificationService = require('../services/notificationService');

const router = express.Router();

// 创建通知（用于测试）
router.post('/', authMiddleware, async (req, res) => {
    try {
        console.log('收到POST请求，用户:', req.user);
        console.log('请求体:', req.body);
        
        const { recipient_type, recipient_id, recipient_ids, title, content, type, related_id } = req.body;
        
        // 简单验证
        if (!title || !content) {
            return res.status(400).json({ error: '缺少必要参数' });
        }
        
        // 权限检查：只有管理员或有用户管理权限的用户可以发送通知
        const isAdmin = req.user.account_type === 'admin' || req.user.accountType === 'admin';
        const hasUserManagement = req.user.permissions && req.user.permissions.includes('用户管理');
        
        console.log('权限检查:', {
            userId: req.user.id,
            isAdmin,
            hasUserManagement
        });
        
        if (!isAdmin && !hasUserManagement) {
            return res.status(403).json({ error: '权限不足' });
        }
        
        // 处理不同的接收者类型
        if (recipient_type === 'all') {
            // 发送给所有人
            // 获取所有用户ID
            const users = await db.query('SELECT id FROM users');
            
            // 准备批量通知数据
            const notifications = users.map(user => ({
                userId: user.id,
                type: type || 'system',
                title: title,
                content: content,
                relatedId: related_id
            }));
            
            // 使用批量创建方法
            const results = await NotificationService.createBatchNotifications(notifications);
            
            // 为管理员创建一条通知记录，记录发送的批量通知
            await NotificationService.createNotification(
                req.user.id, // 管理员ID作为接收者
                'system', // 系统类型
                '批量系统通知发送记录', // 标题
                `发送给：所有人\n接收用户数：${results.length}/${users.length}\n标题：${title}\n内容：${content}`, // 内容
                null // 没有相关ID
            );
            
            res.status(201).json({ 
                id: Date.now().toString(), // 为批量通知生成一个临时ID
                message: '通知已发送给所有用户',
                success_count: results.length,
                total_users: users.length
            });
        } else {
            // 发送给指定用户（单个或多个）
            let user_ids = [];
            
            // 检查是否有多个用户ID
            if (recipient_ids && Array.isArray(recipient_ids) && recipient_ids.length > 0) {
                user_ids = recipient_ids;
            } else if (recipient_id) {
                // 保持向后兼容，支持单个用户ID
                user_ids = [recipient_id];
            } else {
                return res.status(400).json({ error: '缺少必要参数' });
            }
            
            // 验证用户ID是否有效
            user_ids = user_ids.filter(id => id && !isNaN(id));
            if (user_ids.length === 0) {
                return res.status(400).json({ error: '没有有效的用户ID' });
            }
            
            if (user_ids.length === 1) {
                // 单个用户，使用原有的创建单个通知的逻辑
                const user_id = user_ids[0];
                
                // 使用通知服务创建通知（会自动根据用户设置过滤）
                const insertedNotification = await NotificationService.createNotification(
                    user_id, 
                    type || 'system', 
                    title, 
                    content, 
                    related_id
                );
                
                console.log('通知创建结果:', insertedNotification);
                
                if (insertedNotification) {
                    // 构建完整的响应对象
                    const responseNotification = {
                        id: insertedNotification.id,
                        user_id: insertedNotification.user_id,
                        title: insertedNotification.title,
                        content: insertedNotification.content,
                        type: insertedNotification.type,
                        related_id: insertedNotification.related_id,
                        is_read: false,
                        created_at: insertedNotification.created_at,
                        play_sound: insertedNotification.play_sound || false
                    };
                    
                    // 为管理员创建一条通知记录，记录发送的单个通知
                    await NotificationService.createNotification(
                        req.user.id, // 管理员ID作为接收者
                        'system', // 系统类型
                        '系统通知发送记录', // 标题
                        `发送给：指定用户\n用户ID：${user_id}\n标题：${title}\n内容：${content}`, // 内容
                        null // 没有相关ID
                    );
                    
                    res.status(201).json(responseNotification);
                } else {
                    // 如果通知被用户设置过滤掉了，返回相应信息
                    
                    // 为管理员创建一条通知记录，记录发送的单个通知（即使被过滤）
                    await NotificationService.createNotification(
                        req.user.id, // 管理员ID作为接收者
                        'system', // 系统类型
                        '系统通知发送记录（已过滤）', // 标题
                        `发送给：指定用户\n用户ID：${user_id}\n标题：${title}\n内容：${content}\n状态：已被用户通知设置过滤`, // 内容
                        null // 没有相关ID
                    );
                    
                    res.status(200).json({ 
                        id: Date.now().toString(), // 为过滤的通知生成一个临时ID
                        message: '通知已根据用户设置过滤，未创建',
                        filtered: true
                    });
                }
            } else {
                // 多个用户，使用批量创建通知的方法
                
                // 准备批量通知数据
                const notifications = user_ids.map(user_id => ({
                    userId: user_id,
                    type: type || 'system',
                    title: title,
                    content: content,
                    relatedId: related_id
                }));
                
                // 使用批量创建方法
                const results = await NotificationService.createBatchNotifications(notifications);
                
                // 为管理员创建一条通知记录，记录发送的批量通知
                await NotificationService.createNotification(
                    req.user.id, // 管理员ID作为接收者
                    'system', // 系统类型
                    '批量系统通知发送记录', // 标题
                    `发送给：指定用户\n接收用户数：${results.length}/${user_ids.length}\n标题：${title}\n内容：${content}`, // 内容
                    null // 没有相关ID
                );
                
                res.status(201).json({ 
                    id: Date.now().toString(), // 为批量通知生成一个临时ID
                    message: '通知已发送给指定用户',
                    success_count: results.length,
                    total_users: user_ids.length
                });
            }
        }
    } catch (error) {
        console.error('创建通知错误:', error);
        res.status(500).json({ 
            error: '服务器错误',
            message: error.message 
        });
    }
});

// 获取用户通知列表
router.get('/', authMiddleware, async (req, res) => {
    try {
        // 确保参数类型正确且有效
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const unreadOnly = req.query.unreadOnly === 'true';
        const readOnly = req.query.readOnly === 'true';
        const userId = req.user.id;
        
        // 直接在SQL中使用参数值，避免参数数组问题
        // 先获取总数
        let countSql = `SELECT COUNT(*) as total_count FROM notifications WHERE user_id = ${userId}`;
        if (unreadOnly) {
            countSql += ' AND is_read = false';
        } else if (readOnly) {
            countSql += ' AND is_read = true';
        }
        const countResult = await db.query(countSql);
        const total = countResult[0]?.total_count || 0;
        const totalPages = Math.ceil(total / limit) || 1;

        // 获取通知列表
        // 计算偏移量并确保为正数
        const safePage = Math.max(1, page);
        const safeLimit = Math.max(1, Math.min(100, limit)); // 限制最大页面大小
        const offset = (safePage - 1) * safeLimit;
        
        let sql = `
            SELECT n.*, w.customer_name, mr.work_order_id 
            FROM notifications n 
            LEFT JOIN work_orders w ON n.related_id = w.id 
            LEFT JOIN material_requests mr ON (n.type LIKE '%material%' AND n.related_id = mr.id) 
            WHERE n.user_id = ${userId}
        `;
        
        if (unreadOnly) {
            sql += ' AND n.is_read = false';
        } else if (readOnly) {
            sql += ' AND n.is_read = true';
        }
        
        // 直接在SQL中使用计算好的值
        sql += ` ORDER BY n.created_at DESC LIMIT ${safeLimit} OFFSET ${offset}`;
        
        const notifications = await db.query(sql);

        // 获取未读数量
        const unreadCountResult = await db.query(
            `SELECT COUNT(*) as count FROM notifications WHERE user_id = ${userId} AND is_read = false`
        );

        res.json({
            notifications,
            total: total,
            totalPages: totalPages,
            unreadCount: unreadCountResult[0]?.count || 0,
            page: safePage,
            limit: safeLimit
        });
    } catch (error) {
        console.error('获取通知列表错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 标记所有通知为已读 - 必须放在 /:id/read 之前
router.put('/all/read', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        
        // 直接更新所有未读通知为已读，无需预先检查
        const updateResult = await db.query(
            'UPDATE notifications SET is_read = true WHERE user_id = ? AND is_read = false',
            [userId]
        );
        
        // 检查是否有记录被更新
        const affectedRows = updateResult.affectedRows || 0;
        
        if (affectedRows === 0) {
            return res.json({ message: '没有未读通知需要标记' });
        }
        
        // 更新成功
        return res.json({ message: '所有通知已标记为已读' });
    } catch (error) {
        console.error('标记所有通知已读错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 标记通知为已读
router.put('/:id/read', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        // 检查通知是否存在且属于当前用户
        const notification = await db.query(
            'SELECT id FROM notifications WHERE id = ? AND user_id = ?',
            [id, req.user.id]
        );

        if (notification.length === 0) {
            return res.status(404).json({ error: '通知不存在' });
        }

        await db.query(
            'UPDATE notifications SET is_read = true WHERE id = ?',
            [id]
        );

        res.json({ message: '通知已标记为已读' });
    } catch (error) {
        console.error('标记通知已读错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 删除通知
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        // 检查通知是否存在且属于当前用户
        const notification = await db.query(
            'SELECT id FROM notifications WHERE id = ? AND user_id = ?',
            [id, req.user.id]
        );

        if (notification.length === 0) {
            return res.status(404).json({ error: '通知不存在' });
        }

        await db.query(
            'DELETE FROM notifications WHERE id = ?',
            [id]
        );

        res.json({ message: '通知删除成功' });
    } catch (error) {
        console.error('删除通知错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 批量删除通知 - 使用POST而不是DELETE以避免请求体兼容性问题
router.post('/batch/delete', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const { ids } = req.body;
        
        // 验证参数
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: '缺少有效的通知ID数组' });
        }
        
        // 确保只删除属于当前用户的通知
        // 使用参数化查询来防止SQL注入
        const placeholders = ids.map(() => '?').join(',');
        await db.query(
            `DELETE FROM notifications WHERE user_id = ? AND id IN (${placeholders})`,
            [userId, ...ids]
        );
        
        res.json({ message: `成功删除 ${ids.length} 条通知` });
    } catch (error) {
        console.error('批量删除通知错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 删除所有已读通知
router.delete('/all/read', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;

        // 执行删除操作
        await db.query(
            'DELETE FROM notifications WHERE user_id = ? AND is_read = true',
            [userId]
        );

        res.json({ message: '所有已读通知已删除' });
    } catch (error) {
        console.error('删除所有已读通知错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 获取未读通知数量
router.get('/unread/count', authMiddleware, async (req, res) => {
    try {
        const result = await db.query(
            'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = false',
            [req.user.id]
        );

        res.json({ unreadCount: result[0].count });
    } catch (error) {
        console.error('获取未读通知数量错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 获取最新的未读通知
router.get('/latest', authMiddleware, async (req, res) => {
    try {
        const notification = await db.query(
            `SELECT n.*, w.customer_name 
             FROM notifications n 
             LEFT JOIN work_orders w ON n.related_id = w.id 
             WHERE n.user_id = ? 
             ORDER BY n.created_at DESC 
             LIMIT 1`,
            [req.user.id]
        );

        if (notification.length === 0) {
            return res.json({ notification: null });
        }

        res.json({ notification: notification[0] });
    } catch (error) {
        console.error('获取最新通知错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 获取最新通知（用于轮询）
router.get('/new', authMiddleware, async (req, res) => {
    try {
        // 获取前端传递的最新通知ID或时间戳参数
        const lastId = req.query.lastId || 0;
        const sinceTime = req.query.sinceTime;
        
        // 构建查询条件
        let conditions = `n.user_id = ${req.user.id}`;
        
        // 如果有lastId参数，获取ID大于lastId的通知
        if (lastId && !isNaN(lastId)) {
            conditions += ` AND n.id > ${parseInt(lastId)}`;
        }
        // 如果有sinceTime参数，获取时间戳之后的通知
        else if (sinceTime) {
            try {
                const sinceDate = new Date(sinceTime);
                if (!isNaN(sinceDate.getTime())) {
                    conditions += ` AND n.created_at > '${sinceDate.toISOString().slice(0, 19).replace('T', ' ')}'`;
                }
            } catch (e) {
                console.error('时间格式转换错误:', e);
            }
        }
        // 默认获取未读通知
        else {
            conditions += ' AND n.is_read = false';
        }
        
        // 执行查询，获取最新的通知
        const newNotifications = await db.query(
            `SELECT n.*, w.customer_name 
             FROM notifications n 
             LEFT JOIN work_orders w ON n.related_id = w.id 
             WHERE ${conditions}
             ORDER BY n.created_at DESC`
        );

        res.json({
            notifications: newNotifications,
            count: newNotifications.length
        });
    } catch (error) {
        console.error('获取新通知错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

module.exports = router;