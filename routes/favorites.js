const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// 获取用户的收藏列表
router.get('/', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const folderId = req.query.folder_id;
        
        let favorites;
        
        if (folderId) {
            // 查询指定文件夹中的收藏
            favorites = await db.query(
                'SELECT id, name, url, description, folder_id, created_at, updated_at FROM favorites WHERE user_id = ? AND folder_id = ? ORDER BY created_at DESC',
                [userId, folderId]
            );
        } else {
            // 查询用户的所有收藏
            favorites = await db.query(
                'SELECT id, name, url, description, folder_id, created_at, updated_at FROM favorites WHERE user_id = ? ORDER BY created_at DESC',
                [userId]
            );
        }
        
        res.json(favorites);
    } catch (error) {
        console.error('获取收藏列表错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 添加收藏
router.post('/', [
    authMiddleware,
    body('name').notEmpty().withMessage('网站名称不能为空'),
    body('url').notEmpty().withMessage('网站地址不能为空')
        .custom((value) => {
            // 自定义URL验证逻辑
            try {
                const url = new URL(value);
                return ['http:', 'https:'].includes(url.protocol);
            } catch (error) {
                return false;
            }
        }).withMessage('请输入有效的网址（必须以http://或https://开头）'),
    body('folder_id').optional().custom((value) => {
        // 允许null或整数
        return value === null || value === undefined || value === '' || !isNaN(parseInt(value));
    }).withMessage('文件夹ID必须是整数'),
], async (req, res) => {
    try {
        // 添加调试日志
        console.log('接收到的URL:', req.body.url);
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.log('验证错误:', errors.array());
            return res.status(400).json({ errors: errors.array() });
        }
        
        const userId = req.user.id;
        const { name, url, description, folder_id } = req.body;
        
        // 处理folder_id，将空字符串转换为null
        const processedFolderId = folder_id === '' ? null : folder_id;
        
        // 如果指定了文件夹，检查文件夹是否存在且属于当前用户
        if (processedFolderId) {
            const existingFolder = await db.query(
                'SELECT id FROM favorite_folders WHERE id = ? AND user_id = ?',
                [processedFolderId, userId]
            );
            
            if (existingFolder.length === 0) {
                return res.status(404).json({ error: '文件夹不存在' });
            }
        }
        
        // 检查是否已存在相同的URL收藏
        const existingFavorite = await db.query(
            'SELECT id FROM favorites WHERE user_id = ? AND url = ?',
            [userId, url]
        );
        
        if (existingFavorite.length > 0) {
            return res.status(400).json({ error: '该网址已添加到收藏' });
        }
        
        // 插入新收藏
        const result = await db.query(
            'INSERT INTO favorites (user_id, folder_id, name, url, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [userId, processedFolderId, name, url, description, new Date(), new Date()]
        );
        
        // 返回新创建的收藏
        const newFavorite = await db.query(
            'SELECT id, name, url, description, folder_id, created_at, updated_at FROM favorites WHERE id = ?',
            [result.insertId]
        );
        
        res.status(201).json(newFavorite[0]);
    } catch (error) {
        console.error('添加收藏错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 删除收藏
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const favoriteId = req.params.id;
        
        // 检查收藏是否存在且属于当前用户
        const existingFavorite = await db.query(
            'SELECT id FROM favorites WHERE id = ? AND user_id = ?',
            [favoriteId, userId]
        );
        
        if (existingFavorite.length === 0) {
            return res.status(404).json({ error: '收藏不存在' });
        }
        
        // 删除收藏
        await db.query(
            'DELETE FROM favorites WHERE id = ? AND user_id = ?',
            [favoriteId, userId]
        );
        
        res.json({ message: '收藏删除成功' });
    } catch (error) {
        console.error('删除收藏错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 更新收藏
router.put('/:id', [
    authMiddleware,
    body('name').notEmpty().withMessage('网站名称不能为空'),
    body('url').notEmpty().withMessage('网站地址不能为空')
        .custom((value) => {
            // 自定义URL验证逻辑
            try {
                const url = new URL(value);
                return ['http:', 'https:'].includes(url.protocol);
            } catch (error) {
                return false;
            }
        }).withMessage('请输入有效的网址（必须以http://或https://开头）'),
    body('folder_id').optional().custom((value) => {
        // 允许null或整数
        return value === null || value === undefined || value === '' || !isNaN(parseInt(value));
    }).withMessage('文件夹ID必须是整数'),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        
        const userId = req.user.id;
        const favoriteId = req.params.id;
        const { name, url, description, folder_id } = req.body;
        
        // 检查收藏是否存在且属于当前用户
        const existingFavorite = await db.query(
            'SELECT id FROM favorites WHERE id = ? AND user_id = ?',
            [favoriteId, userId]
        );
        
        if (existingFavorite.length === 0) {
            return res.status(404).json({ error: '收藏不存在' });
        }
        
        // 处理folder_id，将空字符串转换为null
        const processedFolderId = folder_id === '' ? null : folder_id;
        
        // 如果指定了文件夹，检查文件夹是否存在且属于当前用户
        if (processedFolderId) {
            const existingFolder = await db.query(
                'SELECT id FROM favorite_folders WHERE id = ? AND user_id = ?',
                [processedFolderId, userId]
            );
            
            if (existingFolder.length === 0) {
                return res.status(404).json({ error: '文件夹不存在' });
            }
        }
        
        // 检查是否有其他相同url的收藏（如果用户修改了url）
        const duplicateFavorite = await db.query(
            'SELECT id FROM favorites WHERE user_id = ? AND url = ? AND id != ?',
            [userId, url, favoriteId]
        );
        
        if (duplicateFavorite.length > 0) {
            return res.status(400).json({ error: '该网址已添加到收藏' });
        }
        
        // 更新收藏
        await db.query(
            'UPDATE favorites SET name = ?, url = ?, description = ?, folder_id = ?, updated_at = ? WHERE id = ? AND user_id = ?',
            [name, url, description, processedFolderId, new Date(), favoriteId, userId]
        );
        
        // 返回更新后的收藏
        const updatedFavorite = await db.query(
            'SELECT id, name, url, description, folder_id, created_at, updated_at FROM favorites WHERE id = ?',
            [favoriteId]
        );
        
        res.json(updatedFavorite[0]);
    } catch (error) {
        console.error('更新收藏错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// ========== 文件夹相关API ==========

// 获取用户的文件夹列表
router.get('/folders', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        
        // 查询用户的所有文件夹
        const folders = await db.query(
            'SELECT id, name, created_at, updated_at FROM favorite_folders WHERE user_id = ? ORDER BY created_at DESC',
            [userId]
        );
        
        res.json(folders);
    } catch (error) {
        console.error('获取文件夹列表错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 创建文件夹
router.post('/folders', [
    authMiddleware,
    body('name').notEmpty().withMessage('文件夹名称不能为空'),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        
        const userId = req.user.id;
        const { name } = req.body;
        
        // 检查是否已存在同名文件夹
        const existingFolder = await db.query(
            'SELECT id FROM favorite_folders WHERE user_id = ? AND name = ?',
            [userId, name]
        );
        
        if (existingFolder.length > 0) {
            return res.status(400).json({ error: '该文件夹名称已存在' });
        }
        
        // 插入新文件夹
        const result = await db.query(
            'INSERT INTO favorite_folders (user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
            [userId, name, new Date(), new Date()]
        );
        
        // 返回新创建的文件夹
        const newFolder = await db.query(
            'SELECT id, name, created_at, updated_at FROM favorite_folders WHERE id = ?',
            [result.insertId]
        );
        
        res.status(201).json(newFolder[0]);
    } catch (error) {
        console.error('创建文件夹错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 更新文件夹
router.put('/folders/:id', [
    authMiddleware,
    body('name').notEmpty().withMessage('文件夹名称不能为空'),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        
        const userId = req.user.id;
        const folderId = req.params.id;
        const { name } = req.body;
        
        // 检查文件夹是否存在且属于当前用户
        const existingFolder = await db.query(
            'SELECT id FROM favorite_folders WHERE id = ? AND user_id = ?',
            [folderId, userId]
        );
        
        if (existingFolder.length === 0) {
            return res.status(404).json({ error: '文件夹不存在' });
        }
        
        // 检查是否有其他同名文件夹
        const duplicateFolder = await db.query(
            'SELECT id FROM favorite_folders WHERE user_id = ? AND name = ? AND id != ?',
            [userId, name, folderId]
        );
        
        if (duplicateFolder.length > 0) {
            return res.status(400).json({ error: '该文件夹名称已存在' });
        }
        
        // 更新文件夹
        await db.query(
            'UPDATE favorite_folders SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?',
            [name, new Date(), folderId, userId]
        );
        
        // 返回更新后的文件夹
        const updatedFolder = await db.query(
            'SELECT id, name, created_at, updated_at FROM favorite_folders WHERE id = ?',
            [folderId]
        );
        
        res.json(updatedFolder[0]);
    } catch (error) {
        console.error('更新文件夹错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 删除文件夹
router.delete('/folders/:id', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const folderId = req.params.id;
        
        // 检查文件夹是否存在且属于当前用户
        const existingFolder = await db.query(
            'SELECT id FROM favorite_folders WHERE id = ? AND user_id = ?',
            [folderId, userId]
        );
        
        if (existingFolder.length === 0) {
            return res.status(404).json({ error: '文件夹不存在' });
        }
        
        // 删除文件夹（关联的收藏项会自动设置folder_id为NULL）
        await db.query(
            'DELETE FROM favorite_folders WHERE id = ? AND user_id = ?',
            [folderId, userId]
        );
        
        res.json({ message: '文件夹删除成功' });
    } catch (error) {
        console.error('删除文件夹错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 获取文件夹中的收藏列表
router.get('/folders/:id/favorites', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const folderId = req.params.id;
        
        // 检查文件夹是否存在且属于当前用户
        const existingFolder = await db.query(
            'SELECT id FROM favorite_folders WHERE id = ? AND user_id = ?',
            [folderId, userId]
        );
        
        if (existingFolder.length === 0) {
            return res.status(404).json({ error: '文件夹不存在' });
        }
        
        // 查询文件夹中的所有收藏
        const favorites = await db.query(
            'SELECT id, name, url, description, created_at, updated_at FROM favorites WHERE user_id = ? AND folder_id = ? ORDER BY created_at DESC',
            [userId, folderId]
        );
        
        res.json(favorites);
    } catch (error) {
        console.error('获取文件夹收藏列表错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

module.exports = router;