const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authMiddleware, checkPermission } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const NotificationService = require('../services/notificationService');

const router = express.Router();

// 获取工程师列表（用于工单分配） - 临时移除认证要求
router.get('/engineers', async (req, res) => {
    try {
        const { search } = req.query;
        let sql = 'SELECT id, username, full_name, phone FROM users WHERE account_type = ?';
        let params = ['engineer'];

        if (search) {
            sql += ' AND (username LIKE ? OR full_name LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }

        sql += ' ORDER BY full_name ASC';

        const dbEngineers = await db.query(sql, params);
        
        // 转换字段名以匹配前端期望的格式
        const engineers = dbEngineers.map(engineer => ({
            id: engineer.id,
            username: engineer.username,
            fullName: engineer.full_name,
            phone: engineer.phone
        }));
        
        res.json(engineers);
    } catch (error) {
        console.error('获取工程师列表错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 获取工程师列表（需要认证的版本）
router.get('/engineers-auth', authMiddleware, async (req, res) => {
    try {
        const { search } = req.query;
        let sql = 'SELECT id, username, full_name, phone FROM users WHERE account_type = ?';
        let params = ['engineer'];

        if (search) {
            sql += ' AND (username LIKE ? OR full_name LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }

        sql += ' ORDER BY full_name ASC';

        const dbEngineers = await db.query(sql, params);
        
        // 转换字段名以匹配前端期望的格式
        const engineers = dbEngineers.map(engineer => ({
            id: engineer.id,
            username: engineer.username,
            fullName: engineer.full_name,
            phone: engineer.phone
        }));
        
        res.json(engineers);
    } catch (error) {
        console.error('获取工程师列表错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 获取所有用户（管理员）
router.get('/', authMiddleware, checkPermission('用户管理'), async (req, res) => {
    try {
        const { search, accountType, permissions } = req.query;
        let sql = 'SELECT id, username, full_name, phone, email, account_type, permissions, address, transport_type FROM users WHERE 1=1';
        let params = [];

        if (search) {
            sql += ' AND (username LIKE ? OR full_name LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }

        if (accountType) {
            sql += ' AND account_type = ?';
            params.push(accountType);
        }

        if (permissions) {
            sql += ' AND permissions LIKE ?';
            params.push(`%${permissions}%`);
        }

        sql += ' ORDER BY created_at DESC';

        const dbUsers = await db.query(sql, params);
        
        // 转换字段名以匹配前端期望的格式
        const users = dbUsers.map(user => ({
            id: user.id,
            username: user.username,
            fullName: user.full_name,
            phone: user.phone,
            email: user.email,
            accountType: user.account_type,
            account_type: user.account_type, // 保留以兼容
            permissions: user.permissions,
            address: user.address,
            transportType: user.transport_type,
            created_at: user.created_at
        }));
        
        console.log('返回用户列表:', users.length, '个用户');
        res.json(users);
    } catch (error) {
        console.error('获取用户列表错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 添加用户（管理员）
router.post('/', [
    authMiddleware,
    checkPermission('用户管理'),
    body('username').notEmpty().withMessage('用户名不能为空'),
    body('password').isLength({ min: 6 }).withMessage('密码至少6位'),
    body('fullName').notEmpty().withMessage('姓名不能为空')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { username, password, fullName, phone, email, accountType, permissions, address, transportType } = req.body;

        // 检查用户名是否已存在
        const existingUser = await db.query(
            'SELECT id FROM users WHERE username = ?',
            [username]
        );

        if (existingUser.length > 0) {
            return res.status(400).json({ error: '用户名已存在' });
        }

        // 加密密码
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 处理权限数组
        const permissionsStr = Array.isArray(permissions) ? permissions.join('|') : permissions || '';
        
        const result = await db.query(
            `INSERT INTO users (username, password, full_name, phone, email, account_type, permissions, address, transport_type, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [username, hashedPassword, fullName, phone, email, accountType, permissionsStr, address, transportType, new Date(), new Date()]
        );
        
        console.log('创建用户成功:', { username, accountType, permissions: permissionsStr });

        res.status(201).json({ message: '用户创建成功', userId: result.insertId });
    } catch (error) {
        console.error('创建用户错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 更新用户（管理员）
router.put('/:id', [
    authMiddleware,
    checkPermission('用户管理'),
    body('username').optional().notEmpty().withMessage('用户名不能为空'),
    body('fullName').optional().notEmpty().withMessage('姓名不能为空')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;
        const { username, fullName, phone, email, accountType, permissions, address, transportType, password } = req.body;

        // 获取旧用户信息用于比较变化
        const oldUser = await db.query(
            'SELECT * FROM users WHERE id = ?',
            [id]
        );

        if (oldUser.length === 0) {
            return res.status(404).json({ error: '用户不存在' });
        }

        const oldUserData = oldUser[0];

        // 如果提供了 username，检查用户名是否已被使用
        if (username && username !== oldUserData.username) {
            const nameCheck = await db.query(
                'SELECT id FROM users WHERE username = ? AND id != ?',
                [username, id]
            );
            if (nameCheck.length > 0) {
                return res.status(400).json({ error: '用户名已存在' });
            }
        }

        // 处理权限数组
        const permissionsStr = permissions 
            ? (Array.isArray(permissions) ? permissions.join('|') : permissions) 
            : oldUserData.permissions || '';

        // 动态构建更新字段和参数
        const updates = [];
        const params = [];

        if (username !== undefined) {
            updates.push('username = ?');
            params.push(username);
        }
        if (fullName !== undefined) {
            updates.push('full_name = ?');
            params.push(fullName);
        }
        if (phone !== undefined) {
            updates.push('phone = ?');
            params.push(phone);
        }
        if (email !== undefined) {
            updates.push('email = ?');
            params.push(email);
        }
        if (accountType !== undefined) {
            updates.push('account_type = ?');
            params.push(accountType);
        }
        if (permissions !== undefined) {
            updates.push('permissions = ?');
            params.push(permissionsStr);
        }
        if (address !== undefined) {
            updates.push('address = ?');
            params.push(address);
        }
        if (transportType !== undefined) {
            updates.push('transport_type = ?');
            params.push(transportType);
        }
        if (password !== undefined) {
            console.log('=== 密码更新调试 ===');
            console.log('原始密码:', password);
            console.log('密码类型:', typeof password);
            console.log('密码长度:', password ? password.length : 0);

            // 清洗密码：去除前后空格
            const cleanPassword = String(password).trim();
            console.log('清洗后密码:', cleanPassword);
            console.log('清洗后长度:', cleanPassword.length);

            // 验证密码长度
            if (cleanPassword.length < 6) {
                throw new Error('密码至少需要6位');
            }

            // 生成哈希
            const salt = await bcrypt.genSalt(10);
            console.log('Salt:', salt);
            console.log('Salt 长度:', salt.length);
            const hashedPassword = await bcrypt.hash(cleanPassword, salt);
            console.log('哈希结果:', hashedPassword);
            console.log('哈希长度:', hashedPassword.length);

            // 验证哈希长度
            if (hashedPassword.length !== 60) {
                console.error('❌ 警告：密码哈希长度异常！预期: 60, 实际:', hashedPassword.length);
                // 如果哈希长度不对，重新生成
                const newSalt = await bcrypt.genSalt(10);
                const newHashedPassword = await bcrypt.hash(cleanPassword, newSalt);
                console.log('重新生成的哈希:', newHashedPassword);
                console.log('重新生成的哈希长度:', newHashedPassword.length);

                if (newHashedPassword.length === 60) {
                    updates.push('password = ?');
                    params.push(newHashedPassword);
                } else {
                    throw new Error('密码哈希生成失败，请联系管理员');
                }
            } else {
                updates.push('password = ?');
                params.push(hashedPassword);
            }
        }

        updates.push('updated_at = ?');
        params.push(new Date());
        params.push(id);

        if (updates.length > 1) {
            const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
            await db.query(sql, params);

            // 发送权限变化通知（如果权限有变化）
            if (permissions !== undefined) {
                const oldPermissions = oldUserData.permissions || '';
                if (oldPermissions !== permissionsStr) {
                    await NotificationService.createPermissionChangeNotification(
                        parseInt(id),
                        permissionsStr,
                        oldPermissions
                    );
                }
            }

            // 发送账号类型变化通知（如果账号类型有变化）
            if (accountType !== undefined && oldUserData.account_type !== accountType) {
                await NotificationService.createAccountTypeChangeNotification(
                    parseInt(id),
                    accountType,
                    oldUserData.account_type
                );
            }

            res.json({ message: '用户更新成功' });
        } else {
            res.json({ message: '无需更新' });
        }
    } catch (error) {
        console.error('更新用户错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 删除头像
router.delete('/avatar', authMiddleware, async (req, res) => {
    try {
        console.log('删除头像请求开始...');
        
        // 检查req.user是否存在
        if (!req.user || !req.user.id) {
            console.error('[删除头像] 无效的用户信息，req.user:', req.user);
            return res.status(401).json({ error: '无效的用户信息' });
        }
        
        // 获取当前用户ID（authMiddleware已经验证了token，用户ID应该是有效的）
        const userId = req.user.id;
        console.log(`[删除头像] 用户ID: ${userId}, 用户名: ${req.user.username || req.user.full_name}`);
        
        // 确保用户通知设置存在
        const ensureSettingsQuery = `INSERT IGNORE INTO user_notification_settings (user_id, notification_types, sound_enabled) VALUES (?, 'permission_change|account_type_change|new_order|return_order|modify_order|delete_order|status_change', TRUE)`;
        await db.query(ensureSettingsQuery, [userId]);
        
        // 查询用户的头像路径
        const avatarQuery = `SELECT avatar FROM user_notification_settings WHERE user_id = ?`;
        console.log(`[删除头像] 执行查询: ${avatarQuery}, 参数: [${userId}]`);
        const settings = await db.query(avatarQuery, [userId]);
        
        let oldAvatarPath = null;
        if (settings.length > 0) {
            oldAvatarPath = settings[0].avatar;
        }
        console.log(`[删除头像] 当前头像路径: ${oldAvatarPath}`);
        
        // 如果有头像路径，尝试删除文件
        if (oldAvatarPath) {
            // 移除开头的斜杠，确保路径正确
            const relativePath = oldAvatarPath.startsWith('/') ? oldAvatarPath.slice(1) : oldAvatarPath;
            
            // 构建完整的文件系统路径
            const fullPath = path.join(__dirname, '..', 'public', relativePath);
            console.log(`[删除头像] 尝试删除文件: ${fullPath}`);
            
            // 检查文件是否存在并删除
            try {
                if (fs.existsSync(fullPath)) {
                    fs.unlinkSync(fullPath);
                    console.log(`[删除头像] 头像文件删除成功: ${fullPath}`);
                } else {
                    console.log(`[删除头像] 文件不存在: ${fullPath}`);
                }
            } catch (fileError) {
                console.error(`[删除头像] 文件删除错误: ${fileError.message}`);
                // 即使文件删除失败，也要更新数据库
            }
        }

        // 更新数据库，将头像路径设置为NULL
        const updateQuery = `UPDATE user_notification_settings SET avatar = NULL WHERE user_id = ?`;
        console.log(`[删除头像] 执行更新: ${updateQuery}, 参数: [${userId}]`);
        await db.query(updateQuery, [userId]);
        console.log(`[删除头像] 数据库已更新，用户ID: ${userId}`);

        console.log(`[删除头像] 头像删除流程完成，用户ID: ${userId}`);
        return res.json({ success: true, message: '头像删除成功' });
    } catch (error) {
        console.error(`[删除头像] 错误: ${error.message}`);
        console.error(`[删除头像] 错误堆栈: ${error.stack}`);
        console.error(`[删除头像] 用户信息:`, req.user);
        return res.status(500).json({ error: '服务器错误' });
    }
});

// 删除用户（管理员）
router.delete('/:id', authMiddleware, checkPermission('用户管理'), async (req, res) => {
    try {
        const { id } = req.params;

        // 检查用户是否存在
        const existingUser = await db.query(
            'SELECT id FROM users WHERE id = ?',
            [id]
        );

        if (existingUser.length === 0) {
            return res.status(404).json({ error: '用户不存在' });
        }

        // 防止删除自己
        if (parseInt(id) === req.user.id) {
            return res.status(400).json({ error: '不能删除自己' });
        }

        await db.query('DELETE FROM users WHERE id = ?', [id]);
        res.json({ message: '用户删除成功' });
    } catch (error) {
        console.error('删除用户错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 获取单个用户信息
router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        
        // 只能获取自己的信息，管理员可以获取所有用户信息
        if (parseInt(id) !== req.user.id && req.user.account_type !== 'admin') {
            return res.status(403).json({ error: '只能查看自己的信息' });
        }

        const users = await db.query(
            'SELECT id, username, full_name, phone, email, account_type, permissions, address, transport_type FROM users WHERE id = ?',
            [id]
        );
        
        if (users.length === 0) {
            return res.status(404).json({ error: '用户不存在' });
        }
        
        const user = users[0];
        // 返回前端期望的字段名格式
        res.json({
            id: user.id,
            username: user.username,
            fullName: user.full_name,
            phone: user.phone,
            email: user.email,
            accountType: user.account_type,
            permissions: user.permissions,
            address: user.address,
            transportType: user.transport_type
        });
    } catch (error) {
        console.error('获取用户信息错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 用户更新自己的信息
router.put('/profile/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { fullName, phone, email, address, transportType } = req.body;

        // 只能修改自己的信息
        if (parseInt(id) !== req.user.id) {
            return res.status(403).json({ error: '只能修改自己的信息' });
        }

        await db.query(
            'UPDATE users SET full_name = ?, phone = ?, email = ?, address = ?, transport_type = ?, updated_at = ? WHERE id = ?',
            [fullName, phone, email, address, transportType, new Date(), id]
        );

        // 获取更新后的用户信息
        const users = await db.query(
            'SELECT id, username, full_name, phone, email, account_type, permissions, address, transport_type FROM users WHERE id = ?',
            [id]
        );
        
        if (users.length === 0) {
            return res.status(404).json({ error: '用户不存在' });
        }
        
        const updatedUser = users[0];
        // 返回前端期望的字段名格式
        res.json({
            id: updatedUser.id,
            username: updatedUser.username,
            fullName: updatedUser.full_name,
            phone: updatedUser.phone,
            email: updatedUser.email,
            accountType: updatedUser.account_type,
            permissions: updatedUser.permissions,
            address: updatedUser.address,
            transportType: updatedUser.transport_type
        });
    } catch (error) {
        console.error('更新个人信息错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 修改密码
router.put('/password/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { currentPassword, newPassword, confirmPassword } = req.body;

        // 只能修改自己的密码
        if (parseInt(id) !== req.user.id) {
            return res.status(403).json({ error: '只能修改自己的密码' });
        }

        // 验证密码
        if (!currentPassword) {
            return res.status(400).json({ error: '当前密码不能为空' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ error: '新密码至少需要6位' });
        }
        if (newPassword !== confirmPassword) {
            return res.status(400).json({ error: '两次输入的新密码不一致' });
        }

        // 获取当前用户密码
        const users = await db.query('SELECT password FROM users WHERE id = ?', [id]);
        if (users.length === 0) {
            return res.status(404).json({ error: '用户不存在' });
        }

        // 验证当前密码
        const isMatch = await bcrypt.compare(currentPassword, users[0].password);
        if (!isMatch) {
            return res.status(400).json({ error: '当前密码错误' });
        }

        // 加密新密码
        console.log('=== 修改密码调试 ===');
        console.log('新密码:', newPassword);
        console.log('新密码类型:', typeof newPassword);
        console.log('新密码长度:', newPassword.length);

        // 清洗密码：去除前后空格
        const cleanNewPassword = String(newPassword).trim();
        console.log('清洗后新密码:', cleanNewPassword);
        console.log('清洗后长度:', cleanNewPassword.length);

        const salt = await bcrypt.genSalt(10);
        console.log('Salt:', salt);
        console.log('Salt 长度:', salt.length);
        const hashedPassword = await bcrypt.hash(cleanNewPassword, salt);
        console.log('哈希结果:', hashedPassword);
        console.log('哈希长度:', hashedPassword.length);

        // 验证哈希长度
        if (hashedPassword.length !== 60) {
            console.error('❌ 警告：密码哈希长度异常！预期: 60, 实际:', hashedPassword.length);
            throw new Error('密码加密失败，请重试');
        }

        await db.query('UPDATE users SET password = ?, updated_at = ? WHERE id = ?', [hashedPassword, new Date(), id]);

        res.json({ message: '密码修改成功' });
    } catch (error) {
        console.error('修改密码错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 配置头像上传
const avatarStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = path.join(__dirname, '..', 'public', 'uploads', 'avatars');
        // 确保上传目录存在
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

const avatarFilter = (req, file, cb) => {
    // 只允许图片文件
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('只允许上传图片文件'), false);
    }
};

const uploadAvatar = multer({
    storage: avatarStorage,
    fileFilter: avatarFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB限制
    }
});

// 上传头像
router.post('/avatar', authMiddleware, uploadAvatar.single('avatar'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: '请选择要上传的头像文件' });
        }

        const userId = req.user.id;
        const avatarPath = '/uploads/avatars/' + req.file.filename;

        // 检查用户是否已有通知设置记录
        const existingSettings = await db.query(
            'SELECT id FROM user_notification_settings WHERE user_id = ?',
            [userId]
        );

        if (existingSettings.length > 0) {
            // 更新现有记录
            await db.query(
                'UPDATE user_notification_settings SET avatar = ?, updated_at = ? WHERE user_id = ?',
                [avatarPath, new Date(), userId]
            );
        } else {
            // 创建新记录
            await db.query(
                'INSERT INTO user_notification_settings (user_id, avatar, notification_types, sound_enabled) VALUES (?, ?, ?, ?)',
                [userId, avatarPath, 'permission_change|account_type_change|new_order|return_order|modify_order|delete_order|status_change', true]
            );
        }

        res.json({
            message: '头像上传成功',
            avatarPath: avatarPath
        });
    } catch (error) {
        console.error('上传头像错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 获取用户头像
router.get('/:id/avatar', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        
        // 只能获取自己的头像，管理员可以获取所有用户头像
        if (parseInt(id) !== req.user.id && req.user.account_type !== 'admin') {
            return res.status(403).json({ error: '只能查看自己的头像' });
        }

        const settings = await db.query(
            'SELECT avatar FROM user_notification_settings WHERE user_id = ?',
            [id]
        );

        if (settings.length === 0) {
            return res.json({ avatarPath: null });
        }

        res.json({ avatarPath: settings[0].avatar });
    } catch (error) {
        console.error('获取用户头像错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 获取用户通知设置
router.get('/notification-settings/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        
        // 只能获取自己的通知设置，管理员可以获取所有用户通知设置
        if (parseInt(id) !== req.user.id && req.user.account_type !== 'admin') {
            return res.status(403).json({ error: '只能查看自己的通知设置' });
        }

        // 确保用户通知设置存在
        await db.query(
            'INSERT IGNORE INTO user_notification_settings (user_id, notification_types, sound_enabled) VALUES (?, ?, ?)',
            [id, 'permission_change|account_type_change|new_order|return_order|modify_order|delete_order|status_change', true]
        );

        const settings = await db.query(
            'SELECT notification_types, sound_enabled FROM user_notification_settings WHERE user_id = ?',
            [id]
        );

        if (settings.length === 0) {
            return res.json({
                notification_types: 'permission_change|account_type_change|new_order|return_order|modify_order|delete_order|status_change',
                sound_enabled: true
            });
        }

        res.json({
            notification_types: settings[0].notification_types,
            sound_enabled: !!settings[0].sound_enabled
        });
    } catch (error) {
        console.error('获取通知设置错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 更新用户通知设置
router.put('/notification-settings/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { notification_types, sound_enabled } = req.body;
        
        // 只能更新自己的通知设置，管理员可以更新所有用户通知设置
        if (parseInt(id) !== req.user.id && req.user.account_type !== 'admin') {
            return res.status(403).json({ error: '只能修改自己的通知设置' });
        }

        // 确保用户通知设置存在
        await db.query(
            'INSERT IGNORE INTO user_notification_settings (user_id, notification_types, sound_enabled) VALUES (?, ?, ?)',
            [id, 'permission_change|account_type_change|new_order|return_order|modify_order|delete_order|status_change', true]
        );

        // 更新通知设置
        await db.query(
            'UPDATE user_notification_settings SET notification_types = ?, sound_enabled = ?, updated_at = ? WHERE user_id = ?',
            [notification_types || '', sound_enabled !== false, new Date(), id]
        );

        res.json({ message: '通知设置更新成功' });
    } catch (error) {
        console.error('更新通知设置错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});


module.exports = router;