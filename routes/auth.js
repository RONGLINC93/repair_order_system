const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const { authLogger } = require('../middleware/logMiddleware');

const router = express.Router();

// 用户注册
router.post('/register', [
    body('username').notEmpty().withMessage('用户名不能为空'),
    body('password').isLength({ min: 6 }).withMessage('密码至少6位'),
    body('confirmPassword').custom((value, { req }) => {
        if (value !== req.body.password) {
            throw new Error('两次密码不一致');
        }
        return true;
    }),
    body('fullName').notEmpty().withMessage('姓名不能为空'),
    body('phone').optional({ nullable: true }).isMobilePhone('zh-CN').withMessage('手机号格式不正确')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { username, password, fullName, phone, email } = req.body;

        // 添加调试信息
        console.log('=== 注册调试信息 ===');
        console.log('接收到的用户名:', username);
        console.log('接收到的密码:', password);
        console.log('密码长度:', password ? password.length : 0);
        console.log('密码类型:', typeof password);

        // 检查用户名是否已存在
        const existingUser = await db.query(
            'SELECT id FROM users WHERE username = ?',
            [username]
        );

        if (existingUser.length > 0) {
            console.log('用户名已存在:', username);
            return res.status(400).json({ error: '用户名已存在' });
        }

        // 加密密码
        // 清洗密码：去除前后空格
        const cleanPassword = String(password).trim();
        console.log('注册 - 清洗后密码:', cleanPassword);
        console.log('注册 - 清洗后长度:', cleanPassword.length);

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(cleanPassword, salt);
        console.log('生成的密码哈希:', hashedPassword);
        console.log('哈希长度:', hashedPassword.length);

        // 验证哈希长度
        if (hashedPassword.length !== 60) {
            console.error('❌ 警告：密码哈希长度异常！预期: 60, 实际:', hashedPassword.length);
            throw new Error('密码加密失败，请重试');
        }

        // 创建用户
        const result = await db.query(
            `INSERT INTO users (username, password, full_name, phone, email, account_type, permissions, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, 'user', '查看', ? ,?)`,
            [username, hashedPassword, fullName, phone, email,new Date(),new Date()]
        );

        res.status(201).json({ message: '注册成功', userId: result.insertId });
    } catch (error) {
        console.error('注册错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 用户登录
router.post('/login', [
    body('username').notEmpty().withMessage('用户名不能为空'),
    body('password').notEmpty().withMessage('密码不能为空')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { username, password } = req.body;

        // 添加调试信息
        console.log('=== 登录调试信息 ===');
        console.log('接收到的用户名:', username);
        console.log('接收到的密码:', password);
        console.log('密码长度:', password ? password.length : 0);
        console.log('密码类型:', typeof password);

        // 查找用户
        const users = await db.query(
            'SELECT id, username, password, full_name, phone, email, account_type, permissions FROM users WHERE username = ?',
            [username]
        );

        if (users.length === 0) {
            console.log('用户不存在:', username);
            await authLogger.loginFailed(req, username, '用户不存在');
            return res.status(400).json({ error: '用户名或密码错误' });
        }

        const user = users[0];
        console.log('找到用户:', user.username);
        console.log('数据库中的密码哈希:', user.password);
        console.log('哈希长度:', user.password ? user.password.length : 0);

        // 验证密码
        try {
            const isMatch = await bcrypt.compare(password, user.password);
            console.log('bcrypt.compare结果:', isMatch);
            
            if (!isMatch) {
                console.log('密码验证失败');
                await authLogger.loginFailed(req, username, '密码错误');
                return res.status(400).json({ error: '用户名或密码错误' });
            }
            console.log('密码验证成功');
        } catch (bcryptError) {
            console.error('bcrypt验证错误:', bcryptError);
            return res.status(500).json({ error: '密码验证错误' });
        }

        // 生成JWT token      
        const token = jwt.sign(
            { 
                id: user.id, 
                username: user.username,
                accountType: user.account_type,
                account_type: user.account_type,
                permissions: user.permissions
            },
            // 添加fallback机制，确保即使环境变量未加载也能工作
            process.env.JWT_SECRET || 'fallback_jwt_secret_key_for_emergency_use_only',
            { expiresIn: '30d' }
        );

        await authLogger.loginSuccess(req, user, token);

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                fullName: user.full_name,
                phone: user.phone,
                email: user.email,
                accountType: user.account_type,
                account_type: user.account_type,
                permissions: user.permissions
            }
        });
    } catch (error) {
        console.error('登录错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 获取当前用户信息
router.get('/me', authMiddleware, async (req, res) => {
    try {
        const users = await db.query(
            'SELECT id, username, full_name, phone, email, address, transport_type, account_type, permissions FROM users WHERE id = ?',
            [req.user.id]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: '用户不存在' });
        }

        const user = users[0];
        res.json({
            id: user.id,
            username: user.username,
            fullName: user.full_name,
            phone: user.phone,
            email: user.email,
            address: user.address,
            transportType: user.transport_type,
            accountType: user.account_type,
            permissions: user.permissions
        });
    } catch (error) {
        console.error('获取用户信息错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

module.exports = router;