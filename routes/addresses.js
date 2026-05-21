const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authMiddleware, checkPermission } = require('../middleware/auth');

const router = express.Router();

// 获取单个服务地址
router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        const addresses = await db.query('SELECT * FROM service_addresses WHERE id = ?', [id]);
        
        if (addresses.length === 0) {
            return res.status(404).json({ error: '服务地址不存在' });
        }

        res.json(addresses[0]);
    } catch (error) {
        console.error('获取服务地址详情错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 获取所有服务地址 - 允许所有登录用户查看
router.get('/', authMiddleware, async (req, res) => {
    try {
        const { search, page = 1, limit = 10 } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const offset = (pageNum - 1) * limitNum;
        
        // 查询条件
        let whereClause = 'WHERE 1=1';
        let params = [];
        
        if (search) {
            whereClause += ' AND address LIKE ?';
            params.push(`%${search}%`);
        }
        
        // 查询总记录数
        const countSql = `SELECT COUNT(*) as totalCount FROM service_addresses ${whereClause}`;
        const countResult = await db.query(countSql, [...params]);
        const totalCount = countResult[0]?.totalCount || 0;
        
        // 查询分页数据
        let sql = `SELECT * FROM service_addresses ${whereClause} ORDER BY created_at DESC LIMIT ${parseInt(limitNum)} OFFSET ${parseInt(offset)}`;
        const addresses = await db.query(sql, params);
        
        // 返回包含分页信息的数据
        res.json({
            addresses,
            totalCount,
            currentPage: pageNum,
            pageSize: limitNum,
            totalPages: Math.ceil(totalCount / limitNum)
        });
    } catch (error) {
        console.error('获取服务地址列表错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 添加服务地址
router.post('/', [
    authMiddleware,
    checkPermission('地址管理'),
    body('address').notEmpty().withMessage('地址不能为空')
], async (req, res) => {
    try {
        console.log('收到添加地址请求:', req.body);
        
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.log('请求验证错误:', errors.array());
            return res.status(400).json({ errors: errors.array() });
        }

        const { address, created_at, updated_at } = req.body;
        console.log('解析请求参数:', { address, created_at, updated_at });

        // 检查地址是否已存在
        const existingAddress = await db.query(
            'SELECT id FROM service_addresses WHERE address = ?',
            [address]
        );
        console.log('地址存在检查结果:', existingAddress);

        if (existingAddress.length > 0) {
            return res.status(400).json({ error: '地址已存在' });
        }

        // 使用前端提供的ISO格式时间戳，MySQL会自动解析为TIMESTAMP类型
        const result = await db.query(
            'INSERT INTO service_addresses (address, created_at, updated_at) VALUES (?, ?, ?)',
            [address, created_at, updated_at]
        );
        console.log('数据库插入结果:', result);

        res.status(201).json({ message: '服务地址添加成功', addressId: result.insertId });
    } catch (error) {
        console.error('添加服务地址错误:', error);
        console.error('错误详情:', error.stack);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 更新服务地址
router.put('/:id', [
    authMiddleware,
    checkPermission('地址管理'),
    body('address').notEmpty().withMessage('地址不能为空')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;
        const { address, updated_at } = req.body;

        // 检查地址是否存在
        const existingAddress = await db.query(
            'SELECT id FROM service_addresses WHERE id = ?',
            [id]
        );

        if (existingAddress.length === 0) {
            return res.status(404).json({ error: '服务地址不存在' });
        }

        // 检查新地址是否已被使用
        const addressCheck = await db.query(
            'SELECT id FROM service_addresses WHERE address = ? AND id != ?',
            [address, id]
        );
        if (addressCheck.length > 0) {
            return res.status(400).json({ error: '地址已存在' });
        }

        // 使用前端提供的ISO格式 updated_at 时间戳，MySQL会自动解析为TIMESTAMP类型
        await db.query(
            'UPDATE service_addresses SET address = ?, updated_at = ? WHERE id = ?',
            [address, updated_at, id]
        );

        res.json({ message: '服务地址更新成功' });
    } catch (error) {
        console.error('更新服务地址错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 删除服务地址
router.delete('/:id', authMiddleware, checkPermission('地址管理'), async (req, res) => {
    try {
        const { id } = req.params;

        // 检查地址是否存在
        const existingAddress = await db.query(
            'SELECT id FROM service_addresses WHERE id = ?',
            [id]
        );

        if (existingAddress.length === 0) {
            return res.status(404).json({ error: '服务地址不存在' });
        }

        await db.query('DELETE FROM service_addresses WHERE id = ?', [id]);
        res.json({ message: '服务地址删除成功' });
    } catch (error) {
        console.error('删除服务地址错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

module.exports = router;