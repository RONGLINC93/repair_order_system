const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// 配置文件上传
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = path.join(__dirname, '..', 'public', 'uploads', 'chat');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'chat-' + req.user.id + '-' + uniqueSuffix + ext);
    }
});

const fileFilter = (req, file, cb) => {
    // 允许图片和常见文件类型
    if (file.mimetype.startsWith('image/') || 
        file.mimetype.includes('application/') || 
        file.mimetype.includes('text/')) {
        cb(null, true);
    } else {
        cb(new Error('不支持的文件类型'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB限制
    }
});

// 获取所有用户列表（用于好友列表）
router.get('/users', authMiddleware, async (req, res) => {
    try {
        const currentUserId = req.user.id;
        
        // 获取所有其他用户
        const users = await db.query(`
            SELECT u.id, u.username, u.full_name, u.phone, u.email, u.account_type,
                   COALESCE(uns.avatar, '/images/default-avatar.png') as avatar
            FROM users u
            LEFT JOIN user_notification_settings uns ON u.id = uns.user_id
            WHERE u.id != ?
            ORDER BY u.full_name ASC
        `, [currentUserId]);

        // 获取每个用户的未读消息数
        for (let user of users) {
            const unreadCount = await db.query(`
                SELECT COUNT(*) as count
                FROM chat_messages
                WHERE sender_id = ? AND receiver_id = ? AND is_read = FALSE
            `, [user.id, currentUserId]);
            
            user.unreadCount = unreadCount[0].count;
            user.avatar = user.avatar || '/images/default-avatar.png';
        }

        res.json(users);
    } catch (error) {
        console.error('获取用户列表错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 获取与特定用户的聊天记录
router.get('/messages/:userId', authMiddleware, async (req, res) => {
    try {
        const currentUserId = req.user.id;
        const otherUserId = parseInt(req.params.userId);
        
        // 分页参数
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        // 获取聊天记录
        const messages = await db.query(`
            SELECT cm.id, cm.sender_id, cm.receiver_id, cm.content, 
                   cm.message_type, cm.file_url, cm.is_read, cm.created_at, cm.updated_at,
                   u1.full_name as sender_name, u1.account_type as sender_account_type,
                   u2.full_name as receiver_name,
                   COALESCE(uns.avatar, '/images/default-avatar.png') as sender_avatar
            FROM chat_messages cm
            LEFT JOIN users u1 ON cm.sender_id = u1.id
            LEFT JOIN users u2 ON cm.receiver_id = u2.id
            LEFT JOIN user_notification_settings uns ON cm.sender_id = uns.user_id
            WHERE (cm.sender_id = ? AND cm.receiver_id = ?) 
               OR (cm.sender_id = ? AND cm.receiver_id = ?)
            ORDER BY cm.created_at DESC
            LIMIT ${limit} OFFSET ${offset}
        `, [currentUserId, otherUserId, otherUserId, currentUserId]);

        // 标记消息为已读
        await db.query(`
            UPDATE chat_messages 
            SET is_read = TRUE 
            WHERE sender_id = ? AND receiver_id = ? AND is_read = FALSE
        `, [otherUserId, currentUserId]);

        // 更新会话未读数
        await updateConversationUnreadCount(currentUserId, otherUserId);

        res.json({
            messages: messages.reverse(), // 按时间正序返回
            hasMore: messages.length === limit,
            page: page
        });
    } catch (error) {
        console.error('获取聊天记录错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 发送文本消息
router.post('/messages/:userId', authMiddleware, async (req, res) => {
    try {
        const currentUserId = req.user.id;
        const receiverId = parseInt(req.params.userId);
        const { content } = req.body;

        if (!content || content.trim() === '') {
            return res.status(400).json({ error: '消息内容不能为空' });
        }

        // 检查接收者是否存在
        const receiver = await db.query('SELECT id FROM users WHERE id = ?', [receiverId]);
        if (receiver.length === 0) {
            return res.status(404).json({ error: '接收者不存在' });
        }
        
        const result = await db.query(`
            INSERT INTO chat_messages (sender_id, receiver_id, content, message_type, created_at, updated_at)
            VALUES (?, ?, ?, 'text', ?, ?)
        `, [currentUserId, receiverId, content,new Date(),new Date()]);

        const messageId = result.insertId;

        // 更新或创建会话记录
        await updateConversation(currentUserId, receiverId, messageId);

        // 发送实时通知
        if (global.pushNotificationToUser) {
            global.pushNotificationToUser(receiverId, {
                type: 'new_message',
                title: '新消息',
                content: content.length > 50 ? content.substring(0, 50) + '...' : content,
                senderId: currentUserId,
                senderName: req.user.full_name || req.user.username,
                related_id: currentUserId // 这里使用senderId作为related_id，以便点击时跳转到正确的聊天界面
            });
        }

        res.status(201).json({
            message: '消息发送成功',
            messageId: messageId
        });
    } catch (error) {
        console.error('发送消息错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 发送文件消息
router.post('/messages/:userId/file', authMiddleware, upload.single('file'), async (req, res) => {
    try {
        const currentUserId = req.user.id;
        const receiverId = parseInt(req.params.userId);

        if (!req.file) {
            return res.status(400).json({ error: '请选择要发送的文件' });
        }

        // 检查接收者是否存在
        const receiver = await db.query('SELECT id FROM users WHERE id = ?', [receiverId]);
        if (receiver.length === 0) {
            return res.status(404).json({ error: '接收者不存在' });
        }

        const fileType = req.file.mimetype.startsWith('image/') ? 'image' : 'file';
        const fileUrl = '/uploads/chat/' + req.file.filename;

        const result = await db.query(`
            INSERT INTO chat_messages (sender_id, receiver_id, content, message_type, file_url, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [currentUserId, receiverId, `发送了一个${fileType === 'image' ? '图片' : '文件'}`, fileType, fileUrl,new Date(),new Date()]);

        const messageId = result.insertId;

        // 更新会话记录
        await updateConversation(currentUserId, receiverId, messageId);

        // 发送实时通知
        if (global.pushNotificationToUser) {
            global.pushNotificationToUser(receiverId, {
                type: 'new_message',
                title: '新消息',
                content: `发送了一个${fileType === 'image' ? '图片' : '文件'}`,
                senderId: currentUserId,
                senderName: req.user.full_name || req.user.username,
                related_id: currentUserId // 这里使用senderId作为related_id，以便点击时跳转到正确的聊天界面
            });
        }

        res.status(201).json({
            message: '文件发送成功',
            messageId: messageId,
            fileUrl: fileUrl
        });
    } catch (error) {
        console.error('发送文件错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 获取会话列表
router.get('/conversations', authMiddleware, async (req, res) => {
    try {
        const currentUserId = req.user.id;

        // 获取所有有消息记录的用户
        const conversations = await db.query(`
            SELECT DISTINCT
                CASE WHEN cm.sender_id = ? THEN cm.receiver_id ELSE cm.sender_id END as other_user_id,
                u.full_name, u.username, u.account_type,
                COALESCE(uns.avatar, '/images/default-avatar.png') as avatar,
                MAX(cm.created_at) as last_message_time,
                (SELECT COUNT(*) FROM chat_messages 
                 WHERE sender_id = CASE WHEN cm.sender_id = ? THEN cm.receiver_id ELSE cm.sender_id END 
                 AND receiver_id = ? AND is_read = FALSE) as unread_count,
                (SELECT content FROM chat_messages 
                 WHERE (sender_id = ? AND receiver_id = CASE WHEN cm.sender_id = ? THEN cm.receiver_id ELSE cm.sender_id END) 
                    OR (sender_id = CASE WHEN cm.sender_id = ? THEN cm.receiver_id ELSE cm.sender_id END AND receiver_id = ?)
                 ORDER BY created_at DESC LIMIT 1) as last_message
            FROM chat_messages cm
            JOIN users u ON CASE WHEN cm.sender_id = ? THEN cm.receiver_id ELSE cm.sender_id END = u.id
            LEFT JOIN user_notification_settings uns ON u.id = uns.user_id
            WHERE (cm.sender_id = ? OR cm.receiver_id = ?)
            GROUP BY other_user_id
            ORDER BY last_message_time DESC
        `, [currentUserId, currentUserId, currentUserId, currentUserId, currentUserId, currentUserId, currentUserId, currentUserId, currentUserId, currentUserId]);

        res.json(conversations);
    } catch (error) {
        console.error('获取会话列表错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 标记消息为已读
router.put('/messages/:messageId/read', authMiddleware, async (req, res) => {
    try {
        const messageId = parseInt(req.params.messageId);
        const currentUserId = req.user.id;

        // 检查消息是否存在且是发给当前用户的
        const message = await db.query(
            'SELECT id FROM chat_messages WHERE id = ? AND receiver_id = ?',
            [messageId, currentUserId]
        );

        if (message.length === 0) {
            return res.status(404).json({ error: '消息不存在' });
        }

        // 标记为已读
        await db.query(
            'UPDATE chat_messages SET is_read = TRUE, updated_at = ? WHERE id = ?',
            [new Date(), messageId]
        );

        res.json({ message: '消息已标记为已读' });
    } catch (error) {
        console.error('标记消息已读错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 获取未读消息总数
router.get('/unread-count', authMiddleware, async (req, res) => {
    try {
        const currentUserId = req.user.id;

        const result = await db.query(
            'SELECT COUNT(*) as count FROM chat_messages WHERE receiver_id = ? AND is_read = FALSE',
            [currentUserId]
        );

        res.json({ unreadCount: result[0].count });
    } catch (error) {
        console.error('获取未读消息数错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 删除消息
router.delete('/messages/:messageId', authMiddleware, async (req, res) => {
    try {
        const messageId = parseInt(req.params.messageId);
        const currentUserId = req.user.id;

        // 检查消息是否存在且是当前用户发送的
        const message = await db.query(
            'SELECT id, file_url FROM chat_messages WHERE id = ? AND sender_id = ?',
            [messageId, currentUserId]
        );

        if (message.length === 0) {
            return res.status(404).json({ error: '消息不存在' });
        }

        // 如果是文件消息，删除文件
        if (message[0].file_url) {
            const filePath = path.join(__dirname, '..', 'public', message[0].file_url);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        // 删除消息
        await db.query('DELETE FROM chat_messages WHERE id = ?', [messageId]);

        res.json({ message: '消息删除成功' });
    } catch (error) {
        console.error('删除消息错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 批量删除与特定用户的聊天记录
router.delete('/messages/user/:userId', authMiddleware, async (req, res) => {
    try {
        const otherUserId = parseInt(req.params.userId);
        const currentUserId = req.user.id;

        // 获取需要删除的消息（包括发送和接收的）
        const messagesToDelete = await db.query(
            'SELECT id, file_url FROM chat_messages WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)',
            [currentUserId, otherUserId, otherUserId, currentUserId]
        );

        // 遍历删除文件消息的文件
        for (const message of messagesToDelete) {
            if (message.file_url) {
                const filePath = path.join(__dirname, '..', 'public', message.file_url);
                if (fs.existsSync(filePath)) {
                    try {
                        fs.unlinkSync(filePath);
                    } catch (fileError) {
                        console.error('删除文件失败:', fileError);
                        // 继续删除其他文件，不中断操作
                    }
                }
            }
        }

        // 批量删除消息记录
        await db.query(
            'DELETE FROM chat_messages WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)',
            [currentUserId, otherUserId, otherUserId, currentUserId]
        );

        // 更新会话的未读计数
        await updateConversationUnreadCount(currentUserId, otherUserId);
        await updateConversationUnreadCount(otherUserId, currentUserId);

        res.json({ message: '聊天记录删除成功', deletedCount: messagesToDelete.length });
    } catch (error) {
        console.error('删除聊天记录错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 更新会话记录的辅助函数
async function updateConversation(user1Id, user2Id, messageId) {
    try {
        // 检查会话是否存在
        const existing = await db.query(`
            SELECT id, user1_id, user2_id FROM chat_conversations 
            WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)
        `, [user1Id, user2Id, user2Id, user1Id]);

        if (existing.length > 0) {
            // 更新现有会话
            const conv = existing[0];
            const isUser1Sender = conv.user1_id === user1Id;
            
            await db.query(`
                UPDATE chat_conversations 
                SET last_message_id = ?, last_message_time = ?,
                    user1_unread_count = CASE WHEN ? THEN 0 ELSE user1_unread_count + 1 END,
                    user2_unread_count = CASE WHEN ? THEN 0 ELSE user2_unread_count + 1 END,
                    updated_at = ?
                WHERE id = ?
            `, [messageId, new Date(), isUser1Sender, !isUser1Sender, new Date(), conv.id]);
        } else {
            // 创建新会话
            await db.query(`
                INSERT INTO chat_conversations (user1_id, user2_id, last_message_id, user2_unread_count, last_message_time, created_at, updated_at)
                VALUES (?, ?, ?, 1, ?, ?, ?)
            `, [user1Id, user2Id, messageId, new Date(), new Date(), new Date()]);
        }
    } catch (error) {
        console.error('更新会话记录错误:', error);
    }
}

// 更新未读消息数的辅助函数
async function updateConversationUnreadCount(userId, otherUserId) {
    try {
        const unreadCount = await db.query(`
            SELECT COUNT(*) as count FROM chat_messages 
            WHERE sender_id = ? AND receiver_id = ? AND is_read = FALSE
        `, [otherUserId, userId]);

        // 获取会话记录
        const conversation = await db.query(`
            SELECT id, user1_id, user2_id FROM chat_conversations 
            WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)
        `, [userId, otherUserId, otherUserId, userId]);

        if (conversation.length > 0) {
            const conv = conversation[0];
            const isUser1Sender = conv.user1_id === userId;
            
            await db.query(`
                UPDATE chat_conversations 
                SET ${isUser1Sender ? 'user1_unread_count' : 'user2_unread_count'} = ?,
                    updated_at = ?
                WHERE id = ?
            `, [unreadCount[0].count, new Date(), conv.id]);
        }
    } catch (error) {
        console.error('更新未读消息数错误:', error);
    }
}

module.exports = router;