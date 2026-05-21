const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// 获取当前用户的所有便签
router.get('/', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const notes = await db.query(
            'SELECT * FROM notes WHERE user_id = ? ORDER BY is_pinned DESC, updated_at DESC',
            [userId]
        );
        res.json({ success: true, data: notes });
    } catch (error) {
        console.error('获取便签失败:', error);
        res.status(500).json({ success: false, message: '获取便签失败' });
    }
});

// 获取单个便签
router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const noteId = req.params.id;
        const userId = req.user.id;
        
        const notes = await db.query(
            'SELECT * FROM notes WHERE id = ? AND user_id = ?',
            [noteId, userId]
        );
        
        if (notes.length === 0) {
            return res.status(404).json({ success: false, message: '便签不存在' });
        }
        
        res.json({ success: true, data: notes[0] });
    } catch (error) {
        console.error('获取便签失败:', error);
        res.status(500).json({ success: false, message: '获取便签失败' });
    }
});

// 创建便签（支持颜色和置顶）
router.post('/', [
    authMiddleware,
    body('title').notEmpty().withMessage('标题不能为空'),
    body('content').notEmpty().withMessage('内容不能为空')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        
        const { title, content, color, is_pinned } = req.body;
        const userId = req.user.id;
        
        // 使用execute方法获取insertId
        const result = await db.query(
            'INSERT INTO notes (user_id, title, content, color, is_pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [userId, title, content, color || 'yellow', is_pinned || false, new Date(), new Date()]
        );
        
        // 由于db.query不返回insertId，我们需要手动获取新创建的便签
        const newNotes = await db.query(
            'SELECT * FROM notes WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
            [userId]
        );
        
        if (newNotes.length === 0) {
            throw new Error('创建便签后无法获取新便签');
        }
        
        res.status(201).json({ success: true, data: newNotes[0], message: '便签创建成功' });
    } catch (error) {
        console.error('创建便签失败:', error);
        res.status(500).json({ success: false, message: '创建便签失败' });
    }
});

// 更新便签（支持颜色、置顶等字段）
router.put('/:id', [
    authMiddleware,
    body('title').optional().notEmpty().withMessage('标题不能为空'),
    body('content').optional().notEmpty().withMessage('内容不能为空')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        
        const noteId = req.params.id;
        const { title, content, color, is_pinned } = req.body;
        const userId = req.user.id;
        
        // 检查便签是否存在且属于当前用户
        const existingNotes = await db.query(
            'SELECT * FROM notes WHERE id = ? AND user_id = ?',
            [noteId, userId]
        );
        
        if (existingNotes.length === 0) {
            return res.status(404).json({ success: false, message: '便签不存在或无权修改' });
        }
        
        // 构建更新字段
        const updateFields = [];
        const updateValues = [];
        
        if (title !== undefined) {
            updateFields.push('title = ?');
            updateValues.push(title);
        }
        
        if (content !== undefined) {
            updateFields.push('content = ?');
            updateValues.push(content);
        }
        
        if (color !== undefined) {
            updateFields.push('color = ?');
            updateValues.push(color);
        }
        
        if (is_pinned !== undefined) {
            updateFields.push('is_pinned = ?');
            updateValues.push(is_pinned);
        }
        
        // 如果没有要更新的字段，直接返回当前便签
        if (updateFields.length === 0) {
            return res.json({ success: true, data: existingNotes[0] });
        }
        
        // 添加更新时间和条件参数
        updateFields.push('updated_at = ?');
        updateValues.push(new Date());
        updateValues.push(noteId);
        updateValues.push(userId);
        
        await db.query(
            `UPDATE notes SET ${updateFields.join(', ')} WHERE id = ? AND user_id = ?`,
            updateValues
        );
        
        const updatedNotes = await db.query(
            'SELECT * FROM notes WHERE id = ?',
            [noteId]
        );
        
        res.json({ success: true, data: updatedNotes[0], message: '便签更新成功' });
    } catch (error) {
        console.error('更新便签失败:', error);
        res.status(500).json({ success: false, message: '更新便签失败' });
    }
});

// 切换便签置顶状态
router.put('/:id/pin', authMiddleware, async (req, res) => {
    try {
        const noteId = req.params.id;
        const userId = req.user.id;
        
        // 检查便签是否存在且属于当前用户
        const existingNotes = await db.query(
            'SELECT * FROM notes WHERE id = ? AND user_id = ?',
            [noteId, userId]
        );
        
        if (existingNotes.length === 0) {
            return res.status(404).json({ success: false, message: '便签不存在或无权修改' });
        }
        
        const currentNote = existingNotes[0];
        const newPinState = !currentNote.is_pinned;
        
        // 更新置顶状态
        await db.query(
            'UPDATE notes SET is_pinned = ?, updated_at = ? WHERE id = ? AND user_id = ?',
            [newPinState, new Date(), noteId, userId]
        );
        
        // 获取更新后的便签
        const updatedNotes = await db.query(
            'SELECT * FROM notes WHERE id = ?',
            [noteId]
        );
        
        res.json({ 
            success: true, 
            data: updatedNotes[0], 
            is_pinned: newPinState,
            message: newPinState ? '便签已置顶' : '便签已取消置顶' 
        });
    } catch (error) {
        console.error('切换便签置顶状态失败:', error);
        res.status(500).json({ success: false, message: '操作失败' });
    }
});

// 删除便签
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const noteId = req.params.id;
        const userId = req.user.id;
        
        // 检查便签是否存在且属于当前用户
        const existingNotes = await db.query(
            'SELECT * FROM notes WHERE id = ? AND user_id = ?',
            [noteId, userId]
        );
        
        if (existingNotes.length === 0) {
            return res.status(404).json({ success: false, message: '便签不存在或无权删除' });
        }
        
        await db.query(
            'DELETE FROM notes WHERE id = ? AND user_id = ?',
            [noteId, userId]
        );
        
        res.json({ success: true, message: '便签删除成功' });
    } catch (error) {
        console.error('删除便签失败:', error);
        res.status(500).json({ success: false, message: '删除便签失败' });
    }
});

module.exports = router;