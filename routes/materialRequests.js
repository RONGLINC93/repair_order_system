const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authMiddleware, checkPermission } = require('../middleware/auth');
const NotificationService = require('../services/notificationService');

const router = express.Router();

// 确保上传目录存在
const uploadDir = path.join(__dirname, '../public/uploads/materials');
fs.mkdir(uploadDir, { recursive: true }).catch(console.error);

// 配置multer用于图片上传
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, 'material-' + uniqueSuffix + ext);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error('只支持 JPG、PNG、GIF、WebP 格式的图片'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
        files: 6 // 最多6张图片
    }
});

// 获取物料采购申请列表
router.get('/list', authMiddleware, async (req, res) => {
    try {
        const { status, page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;
        
        let whereConditions = [];
        let params = [];
        
        // 根据状态筛选
        if (status) {
            switch(status) {
                case 'application':
                    // 申请中：只有申请时间，没有其他状态时间
                    whereConditions.push('status_application IS NOT NULL AND status_approved IS NULL AND status_rejected IS NULL');
                    break;
                case 'approved':
                    // 已同意：有同意时间，但没有采购时间
                    whereConditions.push('status_approved IS NOT NULL AND status_purchasing IS NULL');
                    break;
                case 'purchasing':
                    // 采购中：有采购时间，但没有完成时间
                    whereConditions.push('status_purchasing IS NOT NULL AND status_completed IS NULL');
                    break;
                case 'completed':
                    // 已完成：有完成时间，但没有出库时间
                    whereConditions.push('status_completed IS NOT NULL AND status_warehouse_out IS NULL');
                    break;
                case 'warehouse_out':
                    // 已出库：有出库时间
                    whereConditions.push('status_warehouse_out IS NOT NULL');
                    break;
                case 'exclude_warehouse_out':
                    // 排除已出库和已拒绝
                    whereConditions.push('status_warehouse_out IS NULL AND status_rejected IS NULL');
                    break;
                case 'rejected':
                    // 已拒绝：有拒绝时间
                    whereConditions.push('status_rejected IS NOT NULL');
                    break;
            }
        }
        
        const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';
        
        // 查询总数
        const countQuery = `
            SELECT COUNT(*) as total 
            FROM material_requests 
            ${whereClause}
        `;
        const countResult = await db.query(countQuery, params);
        const total = countResult[0].total;
        
        // 查询列表
        const query = `
            SELECT 
                mr.*,
                u1.id as applicant_id,
                u1.full_name as applicant_name,
                u1.phone as applicant_phone,
                u2.id as purchaser_id,
                u2.full_name as purchaser_name,
                u2.phone as purchaser_phone,
                u3.id as approver_id,
                u3.full_name as approver_name,
                u3.phone as approver_phone,
                u4.id as completer_id,
                u4.full_name as completer_name,
                u4.phone as completer_phone,
                u5.id as warehouse_staff_id,
                u5.full_name as warehouse_staff_name,
                u5.phone as warehouse_staff_phone,
                u6.id as rejecter_id,
                u6.full_name as rejecter_name,
                u6.phone as rejecter_phone,
                wo.id as work_order_id,
                wo.customer_name as work_order_customer,
                wo.service_time as work_order_service_time
            FROM material_requests mr
            LEFT JOIN users u1 ON mr.applicant_id = u1.id
            LEFT JOIN users u2 ON mr.purchaser_id = u2.id
            LEFT JOIN users u3 ON mr.approver_id = u3.id
            LEFT JOIN users u4 ON mr.completer_id = u4.id
            LEFT JOIN users u5 ON mr.warehouse_staff_id = u5.id
            LEFT JOIN users u6 ON mr.rejecter_id = u6.id
            LEFT JOIN work_orders wo ON mr.work_order_id = wo.id
            ${whereClause}
            ORDER BY mr.created_at DESC
            LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
        `;
        
        const results = await db.query(query, params);
        
        // 处理图片数据
        const processedResults = results.map(item => {
            if (item.images) {
                try {
                    item.images = JSON.parse(item.images);
                } catch (error) {
                    item.images = [];
                }
            } else {
                item.images = [];
            }
            return item;
        });
        
        res.json({
            success: true,
            data: processedResults,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('获取物料采购申请列表失败:', error);
        console.error('错误详情:', error.stack);
        res.status(500).json({ success: false, message: '获取物料采购申请列表失败', error: error.message });
    }
});

// 获取单个物料采购申请详情
router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        
        const query = `
            SELECT 
                mr.*,
                u1.full_name as applicant_name,
                u1.phone as applicant_phone,
                u2.full_name as purchaser_name,
                u2.phone as purchaser_phone,
                u3.full_name as approver_name,
                u3.phone as approver_phone,
                u4.full_name as completer_name,
                u4.phone as completer_phone,
                u5.full_name as warehouse_staff_name,
                u5.phone as warehouse_staff_phone,
                u6.full_name as rejecter_name,
                u6.phone as rejecter_phone,
                wo.id as work_order_id,
                wo.customer_name as work_order_customer,
                wo.customer_phone as work_order_customer_phone,
                wo.customer_address as work_order_customer_address,
                wo.work_description as work_order_description,
                wo.service_time as work_order_service_time
            FROM material_requests mr
            LEFT JOIN users u1 ON mr.applicant_id = u1.id
            LEFT JOIN users u2 ON mr.purchaser_id = u2.id
            LEFT JOIN users u3 ON mr.approver_id = u3.id
            LEFT JOIN users u4 ON mr.completer_id = u4.id
            LEFT JOIN users u5 ON mr.warehouse_staff_id = u5.id
            LEFT JOIN users u6 ON mr.rejecter_id = u6.id
            LEFT JOIN work_orders wo ON mr.work_order_id = wo.id
            WHERE mr.id = ?
        `;
        
        const results = await db.query(query, [id]);
        
        if (results.length === 0) {
            return res.status(404).json({ success: false, message: '物料采购申请不存在' });
        }
        
        res.json({
            success: true,
            data: results[0]
        });
    } catch (error) {
        console.error('获取物料采购申请详情失败:', error);
        res.status(500).json({ success: false, message: '获取物料采购申请详情失败' });
    }
});

// 创建物料采购申请（支持图片上传）
router.post('/create', upload.array('images', 6), [
    authMiddleware,
    body('material_name').notEmpty().withMessage('物料名称不能为空'),
    body('quantity').isNumeric().withMessage('数量必须是数字').custom((value) => {
        const num = parseFloat(value);
        if (isNaN(num) || num <= 0) {
            throw new Error('数量必须是大于0的数字');
        }
        return true;
    }),
    body('work_order_id').optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage('工单ID必须是正整数')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.log('物料申请验证错误:', errors.array());
            return res.status(400).json({ success: false, message: '输入验证失败', errors: errors.array() });
        }
        
        const { material_name, quantity, work_order_id } = req.body;
        const applicant_id = req.user.id;
        
        // 处理上传的图片
        let images = [];
        if (req.files && req.files.length > 0) {
            images = req.files.map(file => `/uploads/materials/${file.filename}`);
        }
        
        const insertQuery = `
            INSERT INTO material_requests 
            (material_name, images, quantity, applicant_id, work_order_id,status_application,created_at,updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const result = await db.query(insertQuery, [
            material_name,
            images.length > 0 ? JSON.stringify(images) : null,
            quantity,
            applicant_id,
            work_order_id || null,
            new Date(),
            new Date(),
            new Date()
        ]);
        
        // 发送通知给管理员和具有仓储管理权限的用户
        // 1. 获取管理员
        const admins = await db.query('SELECT id FROM users WHERE account_type = ?', ['admin']);
        
        // 2. 获取具有仓储管理权限的用户
        const warehouseManagers = await db.query('SELECT id FROM users WHERE permissions LIKE ?', ['%仓储管理%']);
        
        // 3. 合并用户列表，确保没有重复
        const uniqueUsers = new Map();
        [...admins, ...warehouseManagers].forEach(user => {
            if (user.id !== req.user.id) { // 不通知申请人自己
                uniqueUsers.set(user.id, user);
            }
        });
        
        // 4. 发送通知给所有相关用户
        for (const [userId, user] of uniqueUsers.entries()) {
            await NotificationService.createNotification(
                userId,
                'material_request',
                '新的物料采购申请',
                `${req.user.full_name} 提交了物料 "${material_name}" 的采购申请`,
                result.insertId
            );
        }
        
        res.json({
            success: true,
            message: '物料采购申请提交成功',
            data: { id: result.insertId }
        });
    } catch (error) {
        console.error('创建物料采购申请失败:', error);
        res.status(500).json({ success: false, message: '创建物料采购申请失败' });
    }
});

// 更新物料采购申请状态
router.put('/:id/status', [
    authMiddleware,
    checkPermission('仓储管理'),
    body('status').isIn(['approved', 'purchasing', 'completed', 'warehouse_out', 'rejected']).withMessage('无效的状态'),
    body('purchaser_id').optional().isInt().withMessage('采购人ID必须是整数')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.log('物料申请验证错误:', errors.array());
            return res.status(400).json({ success: false, message: '输入验证失败', errors: errors.array() });
        }
        
        const { id } = req.params;
        const { status } = req.body;
        
        // 检查申请是否存在
        const existingResult = await db.query('SELECT * FROM material_requests WHERE id = ?', [id]);
        if (existingResult.length === 0) {
            return res.status(404).json({ success: false, message: '物料采购申请不存在' });
        }
        
        const materialRequest = existingResult[0];
        
        // 构建更新SQL
        let updateFields = [];
        let params = [];
        
        switch(status) {
            case 'approved':
                updateFields.push('status_approved = ?');
                updateFields.push('approver_id = ?');
                params.push(new Date());
                params.push(req.user.id); // 当前登录用户作为同意采购的批示人
                break;
            case 'purchasing':
                if (!materialRequest.status_approved) {
                    return res.status(400).json({ success: false, message: '请先同意采购再进行采购中操作' });
                }
                updateFields.push('status_purchasing = ?');
                updateFields.push('purchaser_id = ?');
                params.push(new Date());
                params.push(req.user.id); // 当前登录用户作为采购中采购人
                break;
            case 'completed':
                if (!materialRequest.status_purchasing) {
                    return res.status(400).json({ success: false, message: '请先开始采购再进行采购完成操作' });
                }
                updateFields.push('status_completed = ?');
                updateFields.push('completer_id = ?');
                params.push(new Date());
                params.push(req.user.id); // 当前登录用户作为采购完成的批示人
                break;
            case 'warehouse_out':
                if (!materialRequest.status_completed) {
                    return res.status(400).json({ success: false, message: '请先完成采购再进行出库操作' });
                }
                updateFields.push('status_warehouse_out = ?');
                updateFields.push('warehouse_staff_id = ?');
                params.push(new Date());
                params.push(req.user.id); // 当前登录用户作为出库的批示人
                break;
            case 'rejected':
                // 只有在申请中状态才能拒绝
                if (materialRequest.status_approved || materialRequest.status_purchasing || materialRequest.status_completed || materialRequest.status_warehouse_out) {
                    return res.status(400).json({ success: false, message: '只有申请中的采购申请才能被拒绝' });
                }
                updateFields.push('status_rejected = ?');
                updateFields.push('rejecter_id = ?');
                params.push(new Date());
                params.push(req.user.id); // 当前登录用户作为拒绝采购的批示人
                break;
        }
        
        if (updateFields.length === 0) {
            return res.status(400).json({ success: false, message: '无效的状态更新' });
        }
        
        updateFields.push('updated_at = ?');
        params.push(new Date());
        params.push(id);
        
        const updateQuery = `UPDATE material_requests SET ${updateFields.join(', ')} WHERE id = ?`;
        console.log('执行的SQL查询:', updateQuery);
        console.log('查询参数:', params);
        await db.query(updateQuery, params);
        console.log('状态更新成功');
        
        // 发送状态更新通知
        const statusText = {
            'approved': '已同意采购',
            'purchasing': '采购中',
            'completed': '采购完成',
            'warehouse_out': '已出库',
            'rejected': '已拒绝采购'
        };
        
        // 需要通知的用户ID集合
        const userIdsToNotify = new Set();
        
        // 添加物料申请人
        userIdsToNotify.add(materialRequest.applicant_id);
        
        // 如果有关联工单，添加工单的服务工程师
        if (materialRequest.work_order_id) {
            const workOrderResult = await db.query('SELECT engineer_id FROM work_orders WHERE id = ?', [materialRequest.work_order_id]);
            if (workOrderResult.length > 0 && workOrderResult[0].engineer_id) {
                userIdsToNotify.add(workOrderResult[0].engineer_id);
            }
        }
        
        // 发送通知给所有需要通知的用户
        for (const userId of userIdsToNotify) {
            await NotificationService.createNotification(
                userId,
                'material_status_update',
                '物料采购申请状态更新',
                `物料 "${materialRequest.material_name}" 采购申请状态已更新为：${statusText[status]}`,
                parseInt(id)
            );
        }
        
        res.json({
            success: true,
            message: '状态更新成功'
        });
    } catch (error) {
        console.error('更新物料采购申请状态失败:', error);
        res.status(500).json({ success: false, message: '更新物料采购申请状态失败' });
    }
});

// 删除物料采购申请
// 关联工单
router.put('/:id/associate-work-order', [
    authMiddleware,
    checkPermission('修改'),
    body('work_order_id').isInt({ min: 1 }).withMessage('工单ID必须是正整数')
], async (req, res) => {
    try {
        const { id } = req.params;
        const { work_order_id } = req.body;
        
        // 检查物料申请是否存在
        const materialResult = await db.query('SELECT * FROM material_requests WHERE id = ?', [id]);
        if (materialResult.length === 0) {
            return res.status(404).json({ success: false, message: '物料申请不存在' });
        }
        
        // 检查工单是否存在
        const workOrderResult = await db.query('SELECT * FROM work_orders WHERE id = ?', [work_order_id]);
        if (workOrderResult.length === 0) {
            return res.status(404).json({ success: false, message: '工单不存在' });
        }
        
        // 更新物料申请的工单关联
        await db.query('UPDATE material_requests SET work_order_id = ? WHERE id = ?', [work_order_id, id]);
        
        // 获取物料名称用于通知
        const materialName = materialResult[0].material_name;
        const workOrderId = work_order_id;
        
        // 发送通知
        // 需要通知的用户ID集合
        const userIdsToNotify = new Set();
        
        // 添加物料申请人
        userIdsToNotify.add(materialResult[0].applicant_id);
        
        // 添加工单的服务工程师
        if (workOrderResult[0].engineer_id) {
            userIdsToNotify.add(workOrderResult[0].engineer_id);
        }
        
        // 发送通知给所有需要通知的用户
        for (const userId of userIdsToNotify) {
            await NotificationService.createNotification(
                userId,
                'material_work_order_associate',
                '物料采购申请关联工单',
                `物料 "${materialName}" 采购申请已关联到工单 #${workOrderId}`,
                parseInt(id)
            );
        }
        
        res.json({ success: true, message: '工单关联成功' });
    } catch (error) {
        console.error('关联工单失败:', error);
        res.status(500).json({ success: false, message: '关联工单失败' });
    }
});

// 删除物料采购申请
router.delete('/:id', [
    authMiddleware,
    checkPermission('删除')
], async (req, res) => {
    try {
        const { id } = req.params;
        
        // 检查申请是否存在以及是否有权限删除
        const existingResult = await db.query('SELECT * FROM material_requests WHERE id = ?', [id]);
        if (existingResult.length === 0) {
            return res.status(404).json({ success: false, message: '物料采购申请不存在' });
        }
        
        const materialRequest = existingResult[0];
        
        // 检查是否是工单分配的服务工程师
        let isAssignedEngineer = false;
        if (materialRequest.work_order_id && req.user.account_type === 'engineer') {
            const workOrderResult = await db.query('SELECT engineer_id FROM work_orders WHERE id = ?', [materialRequest.work_order_id]);
            if (workOrderResult.length > 0 && workOrderResult[0].engineer_id === req.user.id) {
                isAssignedEngineer = true;
            }
        }
        
        // 只有申请人、管理员或工单分配的服务工程师可以删除，且只能在申请中状态删除
        if (materialRequest.applicant_id !== req.user.id && req.user.account_type !== 'admin' && !isAssignedEngineer) {
            return res.status(403).json({ success: false, message: '没有权限删除此申请' });
        }
        
        if (materialRequest.status_approved) {
            return res.status(400).json({ success: false, message: '已同意的采购申请不能删除' });
        }
        
        // 检查关联的工单状态（如果有）
        if (materialRequest.work_order_id) {
            try {
                const workOrderResult = await db.query('SELECT status FROM work_orders WHERE id = ?', [materialRequest.work_order_id]);
                console.log('工单查询结果:', workOrderResult);
                // 检查结果格式
                if (Array.isArray(workOrderResult) && workOrderResult.length > 0 && workOrderResult[0]) {
                    // 根据不同的数据库驱动返回格式处理
                    const orderStatus = workOrderResult[0].status || (Array.isArray(workOrderResult[0]) && workOrderResult[0][0]?.status);
                    console.log('工单状态:', orderStatus);
                    if (orderStatus === '已完成' || orderStatus === '等待服务') {
                        return res.status(400).json({ success: false, message: '工单状态不允许删除物料申请' });
                    }
                }
            } catch (error) {
                console.error('检查工单状态时出错:', error);
                // 工单状态检查错误不应该阻止物料删除，只记录日志
            }
        }
        
        // 删除相关图片文件
        if (materialRequest.images) {
            try {
                const images = JSON.parse(materialRequest.images);
                for (const imagePath of images) {
                    const fullImagePath = path.join(__dirname, '../public', imagePath);
                    try {
                        await fs.unlink(fullImagePath);
                        console.log(`删除图片文件成功: ${fullImagePath}`);
                    } catch (error) {
                        console.error(`删除图片文件失败: ${fullImagePath}`, error);
                        // 继续删除其他图片，不中断流程
                    }
                }
            } catch (parseError) {
                console.error('解析图片路径失败:', parseError);
            }
        }
        
        // 删除数据库记录
        await db.query('DELETE FROM material_requests WHERE id = ?', [id]);
        
        // 发送删除通知
        // 需要通知的用户ID集合
        const userIdsToNotify = new Set();
        
        // 添加物料申请人
        userIdsToNotify.add(materialRequest.applicant_id);
        
        // 如果有关联工单，添加工单的服务工程师
        if (materialRequest.work_order_id) {
            const workOrderResult = await db.query('SELECT engineer_id FROM work_orders WHERE id = ?', [materialRequest.work_order_id]);
            if (workOrderResult.length > 0 && workOrderResult[0].engineer_id) {
                userIdsToNotify.add(workOrderResult[0].engineer_id);
            }
        }
        
        // 发送通知给所有需要通知的用户
        for (const userId of userIdsToNotify) {
            await NotificationService.createNotification(
                userId,
                'material_status_update',
                '物料采购申请已删除',
                `物料 "${materialRequest.material_name}" 采购申请已被删除`,
                parseInt(id)
            );
        }
        
        res.json({
            success: true,
            message: '删除成功'
        });
    } catch (error) {
        console.error('删除物料采购申请失败:', error);
        res.status(500).json({ success: false, message: '删除物料采购申请失败' });
    }
});

module.exports = router;