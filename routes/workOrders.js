const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authMiddleware, checkPermission } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const NotificationService = require('../services/notificationService');

const router = express.Router();

// 配置multer存储工单图片
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = path.join(__dirname, '..', 'public', 'uploads', 'work-order-images');
        // 确保目录存在
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        // 生成唯一文件名：时间戳-随机数.扩展名
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'work-order-' + uniqueSuffix + ext);
    }
});

// 文件过滤器，只允许图片文件
const fileFilter = function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('只允许上传图片文件'), false);
    }
};

// 配置multer，限制最多5张图片，每张最大5MB
const uploadWorkOrderImages = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        files: 5,
        fileSize: 5 * 1024 * 1024 // 5MB per file
    }
});

// 通用通知创建和实时推送函数
// 旧的通知函数已被NotificationService替代，这里保留以便向后兼容
// 建议使用 NotificationService.createNotification 替代
async function createAndPushNotification(userId, title, content, type, relatedId = null) {
    // 使用NotificationService创建通知，内部已处理时区问题
    return await NotificationService.createNotification(userId, type, title, content, relatedId);
}

// 账号类型映射，将英文转换为中文
function getChineseAccountType(accountType) {
    const typeMap = {
        'admin': '管理员',
        'user': '普通用户',
        'engineer': '工程师',
        'customer_service': '客服'
    };
    return typeMap[accountType] || accountType;
}

// 格式化日期为东八区时间的MySQL格式字符串
function formatDate(dateString) {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}



// 获取台历数据 - 按创建时间组织工单
router.get('/calendar-data', authMiddleware, checkPermission('查看'), async (req, res) => {
    try {
        const { year, month } = req.query;
        const targetYear = parseInt(year) || new Date().getFullYear();
        const targetMonth = parseInt(month) || (new Date().getMonth() + 1);
        
        // 获取指定月份的所有工单
        const startDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
        
        // 正确处理月份边界（12月后应该是下一年的1月）
        let endYear = targetYear;
        let endMonth = targetMonth + 1;
        if (endMonth > 12) {
            endYear = targetYear + 1;
            endMonth = 1;
        }
        const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;
        
        const sql = `
            SELECT wo.*, u1.full_name as creator_full_name, u2.full_name as engineer_full_name 
            FROM work_orders wo 
            LEFT JOIN users u1 ON wo.creator_id = u1.id 
            LEFT JOIN users u2 ON wo.engineer_id = u2.id 
            WHERE wo.create_time >= ? AND wo.create_time < ?
            ORDER BY wo.create_time ASC
        `;
        
        const workOrders = await db.query(sql, [startDate, endDate]);
        
        // 按日期分组工单数据
        const groupedOrders = {};
        workOrders.forEach(order => {
            const createDate = new Date(order.create_time);
            const dateKey = `${createDate.getFullYear()}-${String(createDate.getMonth() + 1).padStart(2, '0')}-${String(createDate.getDate()).padStart(2, '0')}`;
            
            if (!groupedOrders[dateKey]) {
                groupedOrders[dateKey] = [];
            }
            
            // 处理工单数据，提取当前状态
            let currentStatus = '等待服务';
            let statusHistory = [];
            
            if (order.service_status) {
                try {
                    let statuses = [];
                    if (Array.isArray(order.service_status)) {
                        statuses = order.service_status;
                    } else if (typeof order.service_status === 'string') {
                        try {
                            statuses = JSON.parse(order.service_status);
                            if (!Array.isArray(statuses)) {
                                statuses = [];
                            }
                        } catch (e) {
                            statuses = [order.service_status];
                        }
                    }
                    
                    if (statuses.length > 0) {
                        const lastStatus = statuses[statuses.length - 1];
                        if (typeof lastStatus === 'string') {
                            let statusText = lastStatus.split('T')[0];
                            if (statusText.includes('-工程师:') || statusText.includes('-原工程师:')) {
                                const parts = statusText.split(/-(工程师|原工程师):/);
                                statusText = parts[0];
                            }
                            currentStatus = statusText;
                        }
                        statusHistory = statuses;
                    }
                } catch (e) {
                    console.error('状态处理失败:', e);
                    statusHistory = [];
                }
            }
            
            const formattedOrder = {
                id: order.id,
                work_type: order.work_type || 'repair',
                work_description: order.work_description || '',
                customer_name: order.customer_name || '',
                customer_phone: order.customer_phone || '',
                customer_address: order.customer_address || '',
                service_time: order.service_time,
                create_time: order.create_time,
                engineer_name: order.engineer_full_name || order.engineer_name || '',
                status: currentStatus,
                status_history: statusHistory,
                creator_name: order.creator_full_name || order.creator_name || '',
                notes: order.notes || ''
            };
            
            groupedOrders[dateKey].push(formattedOrder);
        });
        
        res.json({
            success: true,
            data: groupedOrders,
            year: targetYear,
            month: targetMonth
        });
    } catch (error) {
        console.error('获取台历数据失败:', error);
        res.status(500).json({ 
            success: false, 
            error: '获取台历数据失败',
            message: error.message 
        });
    }
});

// 通知工具函数：当工单在特定状态被操作时通知相关人员
async function notifyRelevantUsers(orderId, operation, operatorId, operatorName) {
    console.log(`notifyRelevantUsers 调用: orderId=${orderId}, operation=${operation}, operatorId=${operatorId}, operatorName=${operatorName}`);
    try {
        // 如果operatorName为空，尝试从数据库获取用户真实姓名和账号类型
        let actualOperatorName = operatorName;
        let operatorAccountType = '';
        if (operatorId) {
            console.log(`尝试从数据库获取用户${operatorId}的姓名和账号类型`);
            const userInfo = await db.query('SELECT full_name, account_type FROM users WHERE id = ?', [operatorId]);
            if (userInfo.length > 0) {
                if (!actualOperatorName && userInfo[0].full_name) {
                    actualOperatorName = userInfo[0].full_name;
                    console.log(`从数据库获取到用户姓名: ${actualOperatorName}`);
                }
                if (userInfo[0].account_type) {
                    operatorAccountType = getChineseAccountType(userInfo[0].account_type);
                    console.log(`从数据库获取到用户账号类型: ${userInfo[0].account_type}，转换为中文: ${operatorAccountType}`);
                }
            }
        }
        
        // 获取工单详细信息
        const order = await db.query(`
            SELECT wo.*, u1.full_name as creator_full_name, u2.full_name as engineer_full_name,
                   u1.id as creator_id, u2.id as engineer_id
            FROM work_orders wo 
            LEFT JOIN users u1 ON wo.creator_id = u1.id 
            LEFT JOIN users u2 ON wo.engineer_id = u2.id 
            WHERE wo.id = ?
        `, [orderId]);

        if (order.length === 0) return;

        const workOrder = order[0];
        
        // 解析当前状态
        let currentStatus = '等待服务';
        if (workOrder.service_status) {
            try {
                let statuses = [];
                
                // 全面处理各种可能的数据类型
                if (Array.isArray(workOrder.service_status)) {
                    // 如果已经是数组，直接使用
                    statuses = workOrder.service_status;
                } else if (typeof workOrder.service_status === 'string') {
                    // 如果是字符串，尝试解析为JSON数组
                    try {
                        statuses = JSON.parse(workOrder.service_status);
                        if (!Array.isArray(statuses)) {
                            statuses = [];
                        }
                    } catch (e) {
                        // 如果解析失败，将整个字符串作为单个状态
                        statuses = [workOrder.service_status];
                    }
                } else if (typeof workOrder.service_status === 'object' && workOrder.service_status !== null) {
                    // 如果是对象但不是数组，尝试转换为数组
                    statuses = Object.values(workOrder.service_status);
                } else {
                    // 其他情况，直接转换为字符串数组
                    statuses = [String(workOrder.service_status)];
                }
                
                if (statuses.length > 0) {
                    const lastStatus = statuses[statuses.length - 1];
                    if (typeof lastStatus === 'string') {
                        let statusText = lastStatus.split('T')[0];
                        if (statusText.includes('-工程师:') || statusText.includes('-原工程师:')) {
                            const parts = statusText.split(/-(工程师|原工程师):/);
                            statusText = parts[0];
                        }
                        currentStatus = statusText;
                    }
                }
            } catch (e) {
                console.error('状态解析失败:', e);
            }
        }



        // 准备通知内容
        const notifications = [];
        const operationText = {
            '修改': '修改了',
            '删除': '删除了',
            '退回': '退回了',
            '状态变更': '将状态变更'
        };

        // 通知创建人（如果创建人不是操作者）
        if (workOrder.creator_id && workOrder.creator_id !== operatorId) {
            notifications.push({
                user_id: workOrder.creator_id,
                title: '工单操作通知',
                content: `您的工单（工单ID: ${orderId}），被${actualOperatorName || '某用户'}${operatorAccountType ? '(' + operatorAccountType + ')' : ''}${operationText[operation]}，当前状态：${currentStatus}`,
                type: 'status_change',
                related_id: orderId
            });
        }

        // 通知服务工程师（如果工程师不是操作者）
        if (workOrder.engineer_id && workOrder.engineer_id !== operatorId) {
            notifications.push({
                user_id: workOrder.engineer_id,
                title: '工单操作通知',
                content: `您负责的工单（工单ID: ${orderId}），被${actualOperatorName || '某用户'}${operatorAccountType ? '(' + operatorAccountType + ')' : ''}${operationText[operation]}，当前状态：${currentStatus}`,
                type: 'status_change',
                related_id: orderId
            });
        }

        // 使用NotificationService批量创建通知
        if (notifications.length > 0) {
            const batchNotifications = notifications.map(notification => ({
                userId: notification.user_id,
                type: notification.type,
                title: notification.title,
                content: notification.content,
                relatedId: notification.related_id
            }));
            
            // NotificationService内部已处理时区问题
            await NotificationService.createBatchNotifications(batchNotifications);
        }
    } catch (error) {
        console.error('通知相关用户失败:', error);
    }
}

// 获取工单列表
router.get('/', authMiddleware, checkPermission('查看'), async (req, res) => {
    try {
        // 最简单的实现，避免参数数组问题
        const { page = 1, limit = 10, sortBy = 'create_time', sortOrder = 'DESC', status, search, customerPhone } = req.query;
        const pageNum = parseInt(page) || 1;
        const pageSize = parseInt(limit) || 10;
        const offset = (pageNum - 1) * pageSize;

        // 先获取所有工单，然后在Node.js中进行状态筛选
        // 构建SQL查询和参数
        let sql = `
            SELECT wo.*, u1.full_name as creator_full_name, u2.full_name as engineer_full_name 
            FROM work_orders wo 
            LEFT JOIN users u1 ON wo.creator_id = u1.id 
            LEFT JOIN users u2 ON wo.engineer_id = u2.id 
        `;
        let countSql = 'SELECT COUNT(*) as total_count FROM work_orders wo';
        let queryParams = [];
        
        // 添加搜索条件和客户电话筛选
        let whereClause = '';
        if (search || customerPhone) {
            whereClause = ' WHERE ';
            const conditions = [];
            
            if (search) {
                conditions.push('(wo.customer_name LIKE ? OR wo.customer_phone LIKE ? OR wo.work_description LIKE ? OR wo.id LIKE ?)');
                const searchPattern = `%${search}%`;
                queryParams.push(searchPattern, searchPattern, searchPattern, searchPattern);
            }
            
            if (customerPhone) {
                if (conditions.length > 0) {
                    conditions.push('AND ');
                }
                conditions.push('wo.customer_phone = ?');
                queryParams.push(customerPhone);
            }
            
            whereClause += conditions.join(' ');
            sql += whereClause;
            countSql += whereClause;
        }
        
        // 添加排序
        sql += ` ORDER BY wo.${sortBy} ${sortOrder}`;

        // 获取总数
        const countResult = await db.query(countSql, queryParams);
        const total = countResult[0]?.total_count || 0;

        // 获取所有工单数据
        const allWorkOrders = await db.query(sql, queryParams);

        // 处理服务状态并进行筛选
        const formattedOrders = allWorkOrders.map(order => {
            let currentStatus = '等待服务';
            let statusHistory = [];
            
            if (order.service_status) {
                try {
                    // 确保statusHistory始终是一个数组
                    let statuses = [];
                    if (Array.isArray(order.service_status)) {
                        statuses = order.service_status;
                    } else if (typeof order.service_status === 'string') {
                        // 尝试解析JSON字符串
                        try {
                            statuses = JSON.parse(order.service_status);
                            // 确保解析后的值是数组
                            if (!Array.isArray(statuses)) {
                                statuses = [];
                            }
                        } catch (e) {
                            // 如果JSON解析失败，尝试其他格式
                            console.error('JSON解析失败:', order.service_status, e);
                            // 直接使用字符串作为单个状态
                            statuses = [order.service_status];
                        }
                    }
                    
                    if (statuses.length > 0) {
                        // 状态格式： "等待服务T2025-11-25T..." 或 "派单成功"
                        const lastStatus = statuses[statuses.length - 1];
                        if (typeof lastStatus === 'string') {
                            let statusText = lastStatus.split('T')[0];
                            // 如果状态包含工程师信息，只提取状态部分
                            if (statusText.includes('-工程师:') || statusText.includes('-原工程师:')) {
                                // 处理两种格式：-工程师: 和 -原工程师:
                                const parts = statusText.split(/-(工程师|原工程师):/);
                                statusText = parts[0];
                            }
                            currentStatus = statusText;
                        }
                        statusHistory = statuses;
                    }
                } catch (e) {
                    // 捕获所有错误，确保函数不会中断
                    console.error('状态处理失败:', e);
                    // 即使出错也要保持statusHistory为数组
                    statusHistory = [];
                }
            }

            // 安全地返回格式化后的工单，确保所有字段都有效
            return {
                ...order,
                currentStatus,
                statusHistory: Array.isArray(statusHistory) ? statusHistory : []
            };
        });

        // 应用状态筛选
        let filteredOrders = formattedOrders;
        if (status) {
            if (status === '未完成') {
                // 未完成包括：等待服务、派单成功、服务中
                filteredOrders = filteredOrders.filter(order => 
                    ['等待服务', '派单成功', '服务中'].includes(order.currentStatus)
                );
            } else {
                // 普通单个状态筛选
                filteredOrders = filteredOrders.filter(order => order.currentStatus === status);
            }
        }

        // 应用分页
        const paginatedOrders = filteredOrders.slice(offset, offset + pageSize);
        const filteredTotal = filteredOrders.length;
        const filteredTotalPages = Math.ceil(filteredTotal / pageSize);

        res.json({
            workOrders: paginatedOrders,
            total: filteredTotal,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: filteredTotalPages
        });
    } catch (error) {
        console.error('获取工单列表错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 获取我的工单
router.get('/my', authMiddleware, (req, res, next) => {
    // 允许管理员、有查看权限的用户或工程师访问
    const user = req.user;
    const isAdmin = user.account_type === 'admin' || user.accountType === 'admin';
    const permissions = user.permissions ? user.permissions.split('|') : [];
    const isEngineer = user.account_type === 'engineer' || user.accountType === 'engineer';
    
    if (isAdmin || permissions.includes('查看') || isEngineer) {
        next();
    } else {
        res.status(403).json({ error: '权限不足' });
    }
}, async (req, res) => {
    try {
        // 完整处理所有查询参数
        const { page = 1, limit = 10, sortBy = 'create_time', sortOrder = 'DESC', status, search } = req.query;
        const pageNum = parseInt(page) || 1;
        const pageSize = parseInt(limit) || 10;
        const userId = req.user.id;
        

        // 先获取所有属于该工程师的工单
        let sql = `
            SELECT wo.*, u1.full_name as creator_full_name, u2.full_name as engineer_full_name 
            FROM work_orders wo 
            LEFT JOIN users u1 ON wo.creator_id = u1.id 
            LEFT JOIN users u2 ON wo.engineer_id = u2.id 
            WHERE wo.engineer_id = ?
            ORDER BY wo.${sortBy} ${sortOrder}
        `;
        

        const allWorkOrders = await db.query(sql, [userId]);

        // 处理服务状态并进行筛选
        const formattedOrders = allWorkOrders.map(order => {
            let currentStatus = '等待服务';
            let statusHistory = [];
            
            if (order.service_status) {
                try {
                    // 确保statusHistory始终是一个数组
                    let statuses = [];
                    if (Array.isArray(order.service_status)) {
                        statuses = order.service_status;
                    } else if (typeof order.service_status === 'string') {
                        // 尝试解析JSON字符串
                        try {
                            statuses = JSON.parse(order.service_status);
                            // 确保解析后的值是数组
                            if (!Array.isArray(statuses)) {
                                statuses = [];
                            }
                        } catch (e) {
                            // 如果JSON解析失败，尝试其他格式
                            console.error('JSON解析失败:', order.service_status, e);
                            // 直接使用字符串作为单个状态
                            statuses = [order.service_status];
                        }
                    }
                    
                    if (statuses.length > 0) {
                        // 状态格式： "等待服务T2025-11-25T..." 或 "派单成功-工程师:张三T..."
                        const lastStatus = statuses[statuses.length - 1];
                        if (typeof lastStatus === 'string') {
                            let statusText = lastStatus.split('T')[0];
                            // 如果状态包含工程师信息，只提取状态部分
                            if (statusText.includes('-工程师:') || statusText.includes('-原工程师:')) {
                                // 处理两种格式：-工程师: 和 -原工程师:
                                const parts = statusText.split(/-(工程师|原工程师):/);
                                statusText = parts[0];
                            }
                            currentStatus = statusText;
                        }
                        statusHistory = statuses;
                    }
                } catch (e) {
                    // 捕获所有错误，确保函数不会中断
                    console.error('状态处理失败:', e);
                    // 即使出错也要保持statusHistory为数组
                    statusHistory = [];
                }
            }

            // 安全地返回格式化后的工单，确保所有字段都有效
            return {
                ...order,
                currentStatus,
                statusHistory: Array.isArray(statusHistory) ? statusHistory : []
            };
        });

        // 应用状态筛选
        let filteredOrders = formattedOrders;
        if (status) {
            console.log('应用状态筛选:', status);
            if (status === '未完成') {
                // 未完成包括：等待服务、派单成功、服务中
                filteredOrders = filteredOrders.filter(order => 
                    ['等待服务', '派单成功', '服务中'].includes(order.currentStatus)
                );
            } else {
                // 普通单个状态筛选
                filteredOrders = filteredOrders.filter(order => order.currentStatus === status);
            }
        }
        
        // 应用搜索筛选
        if (search) {
            console.log('应用搜索筛选:', search);
            const searchLower = search.toLowerCase();
            filteredOrders = filteredOrders.filter(order => {
                return (
                    (order.title && order.title.toLowerCase().includes(searchLower)) ||
                    (order.content && order.content.toLowerCase().includes(searchLower)) ||
                    (order.customer_name && order.customer_name.toLowerCase().includes(searchLower)) ||
                    (order.customer_phone && order.customer_phone.includes(search)) ||
                    (order.id && order.id.toString().includes(search))
                );
            });
        }
        
        // 应用分页
        const offset = (pageNum - 1) * pageSize;
        const paginatedOrders = filteredOrders.slice(offset, offset + pageSize);
        const filteredTotal = filteredOrders.length;
        const filteredTotalPages = Math.ceil(filteredTotal / pageSize);
        
        console.log('筛选后工单数量:', filteredTotal, '分页后:', paginatedOrders.length);
        
        // 返回结果
        res.json({
            workOrders: paginatedOrders,
            total: filteredTotal,
            page: pageNum,
            limit: pageSize,
            totalPages: filteredTotalPages
        });
    } catch (error) {
        console.error('获取我的工单错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 获取工单详情
router.get('/:id', authMiddleware, checkPermission('查看'), async (req, res) => {
    try {
        const { id } = req.params;
        const orderId = parseInt(id); // 确保ID是数字

        // 检查orderId是否有效
        if (!orderId || isNaN(orderId)) {
            return res.status(400).json({ error: '无效的工单ID' });
        }

        const workOrders = await db.query(`
            SELECT wo.*, u1.full_name as creator_full_name, u1.account_type as creator_position,
                   u2.full_name as engineer_full_name
            FROM work_orders wo 
            LEFT JOIN users u1 ON wo.creator_id = u1.id 
            LEFT JOIN users u2 ON wo.engineer_id = u2.id 
            WHERE wo.id = ?
        `, [orderId]);

        if (workOrders.length === 0) {
            return res.status(404).json({ error: '工单不存在' });
        }

        const order = workOrders[0];
        
        // 处理服务状态
        let statusHistory = [];
        let currentStatus = '等待服务';
        
        if (order.service_status) {
            try {
                // 确保statusHistory始终是一个数组
                let statuses = [];
                if (Array.isArray(order.service_status)) {
                    statuses = order.service_status;
                } else if (typeof order.service_status === 'string') {
                    // 尝试解析JSON字符串
                    try {
                        statuses = JSON.parse(order.service_status);
                        // 确保解析后的值是数组
                        if (!Array.isArray(statuses)) {
                            statuses = [];
                        }
                    } catch (e) {
                        // 如果JSON解析失败，尝试其他格式
                        console.error('JSON解析失败:', order.service_status, e);
                        // 直接使用字符串作为单个状态
                        statuses = [order.service_status];
                    }
                }
                
                if (statuses.length > 0) {
                    // 状态格式： "等待服务T2025-11-25T..." 或 "派单成功-工程师:张三T..."
                    const lastStatus = statuses[statuses.length - 1];
                    if (typeof lastStatus === 'string') {
                        let statusText = lastStatus.split('T')[0];
                        // 如果状态包含工程师信息，只提取状态部分
                        if (statusText.includes('-工程师:') || statusText.includes('-原工程师:')) {
                            // 处理两种格式：-工程师: 和 -原工程师:
                            const parts = statusText.split(/-(工程师|原工程师):/);
                            statusText = parts[0];
                        }
                        currentStatus = statusText;
                    }
                    statusHistory = statuses;
                }
            } catch (e) {
                // 捕获所有错误，确保函数不会中断
                console.error('状态处理失败:', e);
                // 即使出错也要保持statusHistory为数组
                statusHistory = [];
            }
        }

        // 处理图片附件
        let images = [];
        if (order.images) {
            try {
                // 如果images是JSON字符串，解析为数组
                if (typeof order.images === 'string') {
                    images = JSON.parse(order.images);
                } else if (Array.isArray(order.images)) {
                    images = order.images;
                }
                // 确保images是数组
                if (!Array.isArray(images)) {
                    images = [];
                }
            } catch (e) {
                console.error('图片数据解析失败:', e);
                images = [];
            }
        }

        // 查询与工单关联的物料信息
        let materials = [];
        try {
            const materialRequests = await db.query(
                `SELECT * FROM material_requests WHERE work_order_id = ? ORDER BY created_at DESC`,
                [orderId]
            );
            
            materials = materialRequests.map(request => ({
                id: request.id,
                name: request.material_name,
                images: request.images ? JSON.parse(request.images) : [],
                quantity: request.quantity,
                status: request.status_rejected ? '已拒绝' :
                       request.status_warehouse_out ? '已出库' :
                       request.status_completed ? '采购完成' :
                       request.status_purchasing ? '采购中' :
                       request.status_approved ? '已批准' :
                       request.status_application ? '申请中' : '未知状态',
                created_at: request.created_at,
                applicant_id: request.applicant_id,
                status_application: request.status_application,
                status_approved: request.status_approved,
                status_purchasing: request.status_purchasing,
                status_completed: request.status_completed,
                status_warehouse_out: request.status_warehouse_out,
                status_rejected: request.status_rejected
            }));
        } catch (e) {
            console.error('查询物料信息失败:', e);
            materials = [];
        }

        res.json({
            ...order,
            currentStatus,
            statusHistory,
            images,
            materials
        });
    } catch (error) {
        console.error('获取工单详情错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 创建工单
router.post('/', [
    authMiddleware,
    checkPermission('新建'),
    uploadWorkOrderImages.array('images', 5), // 处理最多5张图片上传
    body('workType').isIn(['repair', 'delivery', 'other']).withMessage('工单类型无效')
    // 移除客户姓名和电话的必填验证，允许留空
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { serviceTime, workType, workDescription, customerName, customerPhone, customerAddress, notes } = req.body;
        
        // 处理上传的图片文件
        const uploadedImages = req.files || [];
        const imagePaths = uploadedImages.map(file => `/uploads/work-order-images/${file.filename}`);

        // 获取用户信息
        const userInfo = await db.query(
            'SELECT full_name, account_type FROM users WHERE id = ?',
            [req.user.id]
        );

        if (userInfo.length === 0) {
            return res.status(404).json({ error: '用户不存在' });
        }

        const user = userInfo[0];

        // 创建工单
        const createTime =new Date();
        const result = await db.query(
            `INSERT INTO work_orders 
             (create_time, creator_id, creator_name, creator_position, service_time, work_type, work_description, 
              customer_name, customer_phone, customer_address, notes, images, service_status, updated_at,created_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                createTime, // 显式设置创建时间为当前时间
                req.user.id,
                user.full_name,
                user.account_type,
                serviceTime || null,
                workType,
                workDescription || null,
                customerName,
                customerPhone,
                customerAddress || null,
                notes || null,
                JSON.stringify(imagePaths), // 存储图片路径数组
                // 使用本地时间格式，避免时区转换问题
                (function() {
                    const localTimeStr = formatDate(new Date());
                    return JSON.stringify([`等待服务T${localTimeStr}`]);
                })(),
                new Date(),
                createTime,
            ]
        );

        // 创建通知给所有拥有承接权限的用户（使用新的通知服务）
        const usersWithPermission = await db.query(
            `SELECT id FROM users WHERE permissions LIKE '%承接%' AND id != ?`,
            [req.user.id]
        );

        // 准备批量通知
        const notifications = usersWithPermission.map(user => ({
            userId: user.id,
            type: 'new_order',
            title: '新工单提醒',
            content: `有新的工单可以承接：${customerName || '未知客户'}（工单ID: ${result.insertId}）`,
            relatedId: result.insertId
        }));

        // 批量创建通知
        await NotificationService.createBatchNotifications(notifications);

        res.status(201).json({ 
            message: '工单创建成功', 
            workOrderId: result.insertId,
            uploadedImages: imagePaths // 返回上传的图片路径
        });
    } catch (error) {
        console.error('创建工单错误:', error);
        
        // 如果有上传的文件但创建失败，删除已上传的文件
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => {
                try {
                    const filePath = path.join(__dirname, '..', 'public', 'uploads', 'work-order-images', file.filename);
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                        console.log(`清理失败上传的文件: ${filePath}`);
                    }
                } catch (deleteError) {
                    console.error(`删除文件失败: ${deleteError.message}`);
                }
            });
        }
        
        // 处理multer错误
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: '图片文件大小不能超过5MB' });
        } else if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({ error: '最多只能上传5张图片' });
        } else if (error.message === '只允许上传图片文件') {
            return res.status(400).json({ error: '只允许上传图片文件' });
        }
        
        res.status(500).json({ error: '服务器错误' });
    }
});

// 更新工单
router.put('/:id', [
    authMiddleware,
    checkPermission('修改'),
    uploadWorkOrderImages.array('images', 5) // 处理最多5张图片上传
    // 移除客户姓名和电话的必填验证，允许留空
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;
        const user = req.user;
        const { serviceTime, workType, workDescription, customerName, customerPhone, customerAddress, notes, deleted_images } = req.body;

        // 检查工单是否存在并获取完整信息
        const existingOrder = await db.query('SELECT id, service_status, engineer_id, images FROM work_orders WHERE id = ?', [id]);
        if (existingOrder.length === 0) {
            return res.status(404).json({ error: '工单不存在' });
        }

        const order = existingOrder[0];
        
        // 处理图片相关逻辑
        let existingImages = [];
        try {
            existingImages = order.images ? JSON.parse(order.images) : [];
        } catch (e) {
            existingImages = [];
        }
        
        // 处理要删除的图片
        let deleteImagesArray = [];
        try {
            deleteImagesArray = deleted_images ? JSON.parse(deleted_images) : [];
        } catch (e) {
            deleteImagesArray = [];
        }
        
        // 过滤掉要删除的图片
        const updatedImages = existingImages.filter(img => !deleteImagesArray.includes(img));
        
        // 处理新上传的图片
        const uploadedFiles = req.files || [];
        const newImagePaths = uploadedFiles.map(file => `/uploads/work-order-images/${file.filename}`);
        
        // 合并现有的图片和新上传的图片
        const finalImages = [...updatedImages, ...newImagePaths];
        
        // 权限检查：对于"服务中"状态的工单，只有管理员或对应工程师可以修改
        let currentStatus = '等待服务';
        if (order.service_status) {
            try {
                let statuses = [];
                if (typeof order.service_status === 'string') {
                    try {
                        statuses = JSON.parse(order.service_status);
                        if (!Array.isArray(statuses)) {
                            statuses = [];
                        }
                    } catch (e) {
                        statuses = [order.service_status];
                    }
                }
                
                if (statuses.length > 0) {
                    const lastStatus = statuses[statuses.length - 1];
                    if (typeof lastStatus === 'string') {
                        let statusText = lastStatus.split('T')[0];
                        if (statusText.includes('-工程师:') || statusText.includes('-原工程师:')) {
                            // 处理两种格式：-工程师: 和 -原工程师:
                            const parts = statusText.split(/-(工程师|原工程师):/);
                            statusText = parts[0];
                        }
                        currentStatus = statusText;
                    }
                }
            } catch (e) {
                console.error('状态解析失败:', e);
            }
        }
        
        const isAdmin = user.account_type === 'admin' || user.accountType === 'admin';
        const isEngineer = user.account_type === 'engineer' || user.accountType === 'engineer';
        const isCustomerService = user.account_type === 'customer_service' || user.accountType === 'customer_service';
        
        // 获取工单创建者信息
        const orderCreator = await db.query('SELECT creator_id FROM work_orders WHERE id = ?', [id]);
        const isCreator = orderCreator.length > 0 && orderCreator[0].creator_id === user.id;
        
        // 权限检查：
        // 1. 管理员可以修改所有工单（除了已完成的工单）
        // 2. 工程师可以修改：自己创建的工单 或 分配给自己的工单（除了已完成的工单）
        // 3. 客服如果有修改权限，可以修改所有工单（除了已完成的工单）
        // 4. 已完成的工单不允许修改
        
        // 检查是否为已完成状态
        if (currentStatus === '完成') {
            return res.status(403).json({ error: '已完成的工单不允许修改' });
        }
        
        // 获取用户权限列表
        let permissions = [];
        if (user.permissions) {
            if (typeof user.permissions === 'string') {
                permissions = user.permissions.split('|').map(p => p.trim()).filter(p => p);
            } else if (Array.isArray(user.permissions)) {
                permissions = user.permissions;
            }
        }
        
        // 检查修改权限
        const canEdit = isAdmin || 
            (isEngineer && (isCreator || order.engineer_id === user.id)) ||
            (isCustomerService && permissions.includes('修改')) ||
            (isCreator && permissions.includes('修改'));
        
        if (!canEdit) {
            return res.status(403).json({ error: '权限不足，无法修改此工单' });
        }

        // 根据serviceTime是否有值构建不同的更新语句
        if (serviceTime) {
            await db.query(
                `UPDATE work_orders 
                 SET service_time = ?, work_type = ?, work_description = ?, 
                     customer_name = ?, customer_phone = ?, customer_address = ?, notes = ?, images = ?, updated_at = ?
                 WHERE id = ?`,
                [serviceTime, workType, workDescription, customerName, customerPhone, customerAddress, notes, JSON.stringify(finalImages), new Date(), id]
            );
        } else {
            await db.query(
                `UPDATE work_orders 
                 SET work_type = ?, work_description = ?, 
                     customer_name = ?, customer_phone = ?, customer_address = ?, notes = ?, images = ?
                 WHERE id = ?`,
                [workType, workDescription, customerName, customerPhone, customerAddress, notes, JSON.stringify(finalImages), id]
            );
        }

        // 通知相关用户（在派单成功或服务中状态下被非工程师本人修改时通知相关用户）
        await notifyRelevantUsers(id, '修改', user.id, user.full_name || user.fullName);

        res.json({ message: '工单更新成功', images: finalImages });
    } catch (error) {
        console.error('更新工单错误:', error);
        console.error('请求体:', req.body);
        console.error('错误信息:', error.message);
        console.error('错误堆栈:', error.stack);
        
        // 如果有上传的文件但更新失败，删除已上传的文件
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => {
                try {
                    const filePath = path.join(__dirname, '..', 'public', 'uploads', 'work-order-images', file.filename);
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                        console.log(`清理失败上传的文件: ${filePath}`);
                    }
                } catch (deleteError) {
                    console.error(`删除文件失败: ${deleteError.message}`);
                }
            });
        }
        
        // 处理multer错误
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: '图片文件大小不能超过5MB' });
        } else if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({ error: '最多只能上传5张图片' });
        } else if (error.message === '只允许上传图片文件') {
            return res.status(400).json({ error: '只允许上传图片文件' });
        }
        
        res.status(500).json({ error: '服务器错误', details: error.message });
    }
});

// 承接工单（工程师自己承接）
router.post('/:id/assign', authMiddleware, checkPermission('承接'), async (req, res) => {
    try {
        const { id } = req.params;

        // 检查工单是否存在，获取完整信息包括creator_id
        const existingOrder = await db.query(
            'SELECT id, creator_id, service_status, engineer_id FROM work_orders WHERE id = ?',
            [id]
        );

        if (existingOrder.length === 0) {
            return res.status(404).json({ error: '工单不存在' });
        }

        const order = existingOrder[0];

        // 检查工单是否已被承接
        if (order.engineer_id) {
            return res.status(400).json({ error: '工单已被承接' });
        }

        // 获取工程师姓名
        const users = await db.query(
            'SELECT full_name FROM users WHERE id = ?',
            [req.user.id]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: '工程师信息不存在' });
        }
        // 使用本地时间格式，避免时区转换问题    
        const now = new Date();
        const localTimeStr = formatDate(now);
        // 更新工单承接信息和服务状态
        let statusHistory = ['等待服务'];
        if (order.service_status) {
            try {
                statusHistory = JSON.parse(order.service_status);
                // 在派单成功状态中添加工程师信息   
                statusHistory.push(`派单成功-工程师:${users[0].full_name}T${localTimeStr}`);
            } catch (e) {              
                statusHistory = ['等待服务', `派单成功-工程师:${users[0].full_name}T${localTimeStr}`];
            }
        } else {            
            statusHistory.push(`派单成功-工程师:${users[0].full_name}T${localTimeStr}`);
        }

        await db.query(
            `UPDATE work_orders 
             SET engineer_id = ?, engineer_name = ?, service_status = ?, updated_at = ?
             WHERE id = ?`,
            [req.user.id, users[0].full_name, JSON.stringify(statusHistory), now, id]
        );

        // 创建通知给创建人
        try {
            await createAndPushNotification(
                order.creator_id,
                '工单状态更新',
                `您的工单（工单ID: ${id}），已被承接。`,
                'status_change',
                id
            );
        } catch (error) {
            console.error(`为创建人 ${order.creator_id} 创建承接通知失败:`, error);
        }

        res.json({ message: '工单承接成功' });
    } catch (error) {
        console.error('承接工单错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 管理员分配工程师（可分配给任意工程师）
router.post('/:id/admin-assign', authMiddleware, checkPermission('修改'), async (req, res) => {
    try {
        const { id } = req.params;
        const { engineer_id } = req.body;

        // 验证必要参数
        if (!engineer_id) {
            return res.status(400).json({ error: '工程师ID不能为空' });
        }

        // 检查工单是否存在
        const existingOrder = await db.query(
            'SELECT id, creator_id, service_status, engineer_id FROM work_orders WHERE id = ?',
            [id]
        );

        if (existingOrder.length === 0) {
            return res.status(404).json({ error: '工单不存在' });
        }

        const order = existingOrder[0];
        
        // 权限检查：对于"服务中"状态的工单，不能重新分配
        let currentStatus = '等待服务';
        if (order.service_status) {
            try {
                let statuses = [];
                if (typeof order.service_status === 'string') {
                    try {
                        statuses = JSON.parse(order.service_status);
                        if (!Array.isArray(statuses)) {
                            statuses = [];
                        }
                    } catch (e) {
                        statuses = [order.service_status];
                    }
                }
                
                if (statuses.length > 0) {
                    const lastStatus = statuses[statuses.length - 1];
                    if (typeof lastStatus === 'string') {
                        let statusText = lastStatus.split('T')[0];
                        if (statusText.includes('-工程师:') || statusText.includes('-原工程师:')) {
                            // 处理两种格式：-工程师: 和 -原工程师:
                            const parts = statusText.split(/-(工程师|原工程师):/);
                            statusText = parts[0];
                        }
                        currentStatus = statusText;
                    }
                }
            } catch (e) {
                console.error('状态解析失败:', e);
            }
        }
        
        if (currentStatus === '服务中') {
            return res.status(400).json({ error: '服务中的工单不能重新分配' });
        }

        // 获取工程师信息
        const engineer = await db.query(
            'SELECT id, full_name FROM users WHERE id = ?',
            [engineer_id]
        );

        if (engineer.length === 0) {
            return res.status(404).json({ error: '工程师不存在' });
        }

        // 更新状态历史
        let statusHistory = [];
        if (order.service_status) {
            try {
                statusHistory = JSON.parse(order.service_status);
            } catch (e) {
                statusHistory = [];
            }
        }
        // 使用本地时间格式，避免时区转换问题
        const now = new Date();
        const localTimeStr = formatDate(now);
        statusHistory.push(`派单成功-工程师:${engineer[0].full_name}T${localTimeStr}`);

        // 更新工单
        await db.query(
            `UPDATE work_orders 
             SET engineer_id = ?, engineer_name = ?, service_status = ?, updated_at = ?
             WHERE id = ?`,
            [engineer_id, engineer[0].full_name, JSON.stringify(statusHistory), new Date(), id]
        );

        // 创建通知给工单创建人
        try {
            // 通过createAndPushNotification创建通知，内部已处理时区问题
            await createAndPushNotification(
                order.creator_id,
                '工单状态更新',
                `您的工单（工单ID: ${id}），已被分配给工程师${engineer[0].full_name}。`,
                'status_change',
                id
            );
        } catch (error) {
            console.error(`为创建人 ${order.creator_id} 创建分配通知失败:`, error);
        }

        // 创建通知给被分配的工程师
        try {
            // 通过createAndPushNotification创建通知，内部已处理时区问题
            await createAndPushNotification(
                engineer_id,
                '新工单分配',
                `有新工单（工单ID: ${id}），分配给了您，请及时处理。`,
                'status_change',
                id
            );
        } catch (error) {
            console.error(`为工程师 ${engineer_id} 创建分配通知失败:`, error);
        }

        res.json({ message: '工程师分配成功' });
    } catch (error) {
        console.error('管理员分配工程师错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 更新服务状态（支持管理员和工程师操作）
router.put('/:id/status', authMiddleware, checkPermission('修改'), async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const validStatuses = ['等待服务', '派单成功', '服务中', '完成'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: '无效的服务状态' });
        }

        // 检查工单是否存在
        const existingOrder = await db.query(
            'SELECT id, creator_id, service_status, engineer_id, engineer_name FROM work_orders WHERE id = ?',
            [id]
        );

        if (existingOrder.length === 0) {
            return res.status(404).json({ error: '工单不存在' });
        }

        const order = existingOrder[0];
        const user = req.user;
        
        // 权限检查
        const isAdmin = user.account_type === 'admin' || user.accountType === 'admin';
        const isEngineer = user.account_type === 'engineer' || user.accountType === 'engineer';
        const isCustomerService = user.account_type === 'customer_service' || user.accountType === 'customer_service';
        const isAssignedEngineer = isEngineer && order.engineer_id === user.id;
        const isCreator = order.creator_id === user.id;
        
        // 检查操作权限：
        // 1. 管理员始终可以进行状态操作
        // 2. 工程师只能操作分配给自己的工单
        // 3. 工单创建者可以操作自己创建的工单
        // 4. 客服如果有修改权限，可以进行状态操作
        // 注意：由于已经通过了 checkPermission('修改') 中间件，说明用户有修改权限
        const canOperateStatus = isAdmin || 
            isAssignedEngineer ||
            isCreator ||
            isCustomerService;
            
        if (!canOperateStatus) {
            return res.status(403).json({ error: '权限不足，无法进行状态操作' });
        }

        // 工程师名称（优先使用数据库中保存的工程师名称）
        let engineerDisplay = order.engineer_name || '';

        // 更新服务状态历史
        let statusHistory = [];
        if (order.service_status) {
            try {
                statusHistory = JSON.parse(order.service_status);
            } catch (e) {
                statusHistory = [];
            }
        }
        
        // 在状态历史中添加工程师信息（如果存在）
        const statusWithEngineer = engineerDisplay ? `${status}-工程师:${engineerDisplay}` : status;
        // 使用本地时间格式，避免时区转换问题
        const now = new Date();
        const localTimeStr = formatDate(now);
        statusHistory.push(`${statusWithEngineer}T${localTimeStr}`);

        await db.query(
            'UPDATE work_orders SET service_status = ?, updated_at = ? WHERE id = ?',
            [JSON.stringify(statusHistory), new Date(), id]
        );

        // 通知相关用户（状态变更通知创建人和工程师，排除操作者本人）
        await notifyRelevantUsers(id, '状态变更', user.id, user.full_name || user.fullName);

        res.json({ message: '服务状态更新成功' });
    } catch (error) {
        console.error('更新服务状态错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 管理员批量操作工单状态（扩展功能，方便管理员批量处理）
router.put('/batch/status', authMiddleware, checkPermission('修改'), async (req, res) => {
    try {
        const { ids, status } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: '请提供有效的工单ID列表' });
        }

        const validStatuses = ['等待服务', '派单成功', '服务中', '完成'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: '无效的服务状态' });
        }

        // 批量更新工单状态
        const results = [];
        for (const id of ids) {
            try {
                // 检查工单是否存在
                const existingOrder = await db.query(
                    'SELECT id, creator_id, service_status, engineer_id, engineer_name FROM work_orders WHERE id = ?',
                    [id]
                );

                if (existingOrder.length === 0) {
                    results.push({ id, success: false, error: '工单不存在' });
                    continue;
                }

                const order = existingOrder[0];
                
                // 工程师名称
                let engineerDisplay = order.engineer_name || '';

                // 更新状态历史
                let statusHistory = [];
                if (order.service_status) {
                    try {
                        statusHistory = JSON.parse(order.service_status);
                    } catch (e) {
                        statusHistory = [];
                    }
                }
                
                const statusWithEngineer = engineerDisplay ? `${status}-工程师:${engineerDisplay}` : status;
                // 使用本地时间格式，避免时区转换问题
                const now = new Date();
                const localTimeStr = formatDate(now);
                statusHistory.push(`${statusWithEngineer}T${localTimeStr}`);

                await db.query(
                    'UPDATE work_orders SET service_status = ? WHERE id = ?',
                    [JSON.stringify(statusHistory), id]
                );

                // 通知相关用户（状态变更通知创建人和工程师，排除操作者本人）
                await notifyRelevantUsers(id, '状态变更', req.user.id, req.user.full_name || req.user.fullName);

                results.push({ id, success: true });
            } catch (err) {
                results.push({ id, success: false, error: '处理失败' });
            }
        }

        res.json({ message: '批量更新完成', results });
    } catch (error) {
        console.error('批量更新服务状态错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 退回工单
router.put('/:id/reject', authMiddleware, checkPermission('修改'), async (req, res) => {
    try {
        const { id } = req.params;
        const { rejectReason } = req.body;
        
        // 验证退回原因
        if (!rejectReason || !rejectReason.trim()) {
            return res.status(400).json({ error: '退回原因不能为空' });
        }
        
        if (rejectReason.trim().length < 5) {
            return res.status(400).json({ error: '退回原因至少需要5个字符' });
        }

        // 检查工单是否存在
        const existingOrder = await db.query(
            'SELECT id, creator_id FROM work_orders WHERE id = ?',
            [id]
        );

        if (existingOrder.length === 0) {
            return res.status(404).json({ error: '工单不存在' });
        }

        const order = existingOrder[0];
        const user = req.user;
        
        // 权限检查
        const isAdmin = user.account_type === 'admin' || user.accountType === 'admin';
        const isEngineer = user.account_type === 'engineer' || user.accountType === 'engineer';
        const isCustomerService = user.account_type === 'customer_service' || user.accountType === 'customer_service';
        const isCreator = order.creator_id === user.id;
        
        // 检查操作权限：
        // 1. 管理员始终可以进行状态操作
        // 2. 工程师只能操作分配给自己的工单（需要查询工程师分配信息）
        // 3. 工单创建者可以操作自己创建的工单
        // 4. 客服如果有修改权限，可以进行状态操作
        // 注意：由于已经通过了 checkPermission('修改') 中间件，说明用户有修改权限
        let canOperateStatus = isAdmin || isCreator || isCustomerService;
        
        // 如果是工程师，检查是否分配了此工单
        if (isEngineer) {
            const engineerAssignment = await db.query(
                'SELECT engineer_id FROM work_orders WHERE id = ?',
                [id]
            );
            if (engineerAssignment.length > 0 && engineerAssignment[0].engineer_id === user.id) {
                canOperateStatus = true;
            }
        }
        
        if (!canOperateStatus) {
            return res.status(403).json({ error: '权限不足，无法进行退回操作' });
        }

        // 获取当前工单的状态历史、工程师信息和备注
        const currentOrder = await db.query(
            'SELECT service_status, engineer_name, notes FROM work_orders WHERE id = ?',
            [id]
        );
        
        let statusHistory = [];
        if (currentOrder[0].service_status) {
            // 如果存在历史记录，解析并保留
            try {
                statusHistory = JSON.parse(currentOrder[0].service_status);
                // 确保是数组
                if (!Array.isArray(statusHistory)) {
                    statusHistory = [];
                }
            } catch (e) {
                statusHistory = [];
            }
        }
        
        // 添加新的状态记录，保留历史，并包含退回的工程师信息、退回原因和操作者ID
        const engineerName = currentOrder[0].engineer_name || '';
        // 构建退回状态记录，包含工程师信息和退回原因
        let statusWithEngineer = engineerName ? `等待服务-原工程师:${engineerName}` : '等待服务';
        
        // 如果有退回原因，添加到状态记录中
        if (rejectReason && rejectReason.trim()) {
            statusWithEngineer += `-退回原因:${rejectReason.trim()}`;
        }
        
        // 添加操作者ID到状态记录中
        statusWithEngineer += `-操作者ID:${user.id}`;
        
        // 使用本地时间格式，避免时区转换问题
        const now = new Date();
        const localTimeStr = formatDate(now);
        statusHistory.push(statusWithEngineer + 'T' + localTimeStr);

        // 构建新的备注内容，添加退回原因
        const currentNotes = currentOrder[0].notes || '';
        const newNotes = currentNotes.trim() 
            ? `${currentNotes.trim()}\n\n退回原因: ${rejectReason.trim()}\n` + localTimeStr
            : `退回原因: ${rejectReason.trim()}\n` + localTimeStr;

        // 更新工单信息，包含备注
        await db.query(
            `UPDATE work_orders 
             SET service_status = ?, engineer_id = NULL, engineer_name = NULL, notes = ?, updated_at = ?
             WHERE id = ?`,
            [JSON.stringify(statusHistory), newNotes, new Date(), id]
        );
        
  
        // 通知相关用户（在派单成功或服务中状态下被非工程师本人退回），包含退回原因
        // 注意：通知调用必须在数据库更新之后，这样才能获取到最新的状态信息
        const userName = user.full_name || user.fullName;
        const reasonText = rejectReason && rejectReason.trim() 
            ? `，退回原因: ${rejectReason.trim()}` 
            : '';
        await notifyRelevantUsers(id, `退回`, user.id, userName);

        // 获取工单的客户名称信息
        const orderDetails = await db.query(
            'SELECT customer_name FROM work_orders WHERE id = ?',
            [id]
        );
        const customerName = orderDetails.length > 0 ? orderDetails[0].customer_name || '客户' : '客户';

        // 创建通知给创建人，包含退回原因
        try {
            // 使用专门的退回工单通知方法
            await NotificationService.createReturnOrderNotification(
                order.creator_id,
                id,
                customerName,
                rejectReason && rejectReason.trim() || '无具体原因'
            );
        } catch (error) {
            console.error(`为创建人 ${order.creator_id} 创建退回通知失败:`, error);
        }

        // 通知所有拥有承接权限的用户有新的工单可以承接
        const usersWithPermission = await db.query(
            `SELECT id FROM users WHERE permissions LIKE '%承接%' AND id != ?`,
            [req.user.id]
        );

        for (const userWithPermission of usersWithPermission) {
            try {
                await createAndPushNotification(
                    userWithPermission.id,
                    'new_order',
                    '新工单可承接',
                    `有工单被退回，现在可以承接，工单ID: ${id}`,
                    id
                );
            } catch (error) {
                console.error(`为用户 ${userWithPermission.id} 创建退回可承接通知失败:`, error);
            }
        }

        res.json({ message: '工单退回成功' });
    } catch (error) {
        console.error('退回工单错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 删除工单
router.delete('/:id', authMiddleware, checkPermission('删除'), async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;

        // 检查工单是否存在并获取完整信息
        const existingOrder = await db.query('SELECT id, service_status, engineer_id FROM work_orders WHERE id = ?', [id]);
        if (existingOrder.length === 0) {
            return res.status(404).json({ error: '工单不存在' });
        }

        const order = existingOrder[0];
        
        // 权限检查：对于"服务中"状态的工单，只有管理员或对应工程师可以删除
        let currentStatus = '等待服务';
        if (order.service_status) {
            try {
                let statuses = [];
                if (typeof order.service_status === 'string') {
                    try {
                        statuses = JSON.parse(order.service_status);
                        if (!Array.isArray(statuses)) {
                            statuses = [];
                        }
                    } catch (e) {
                        statuses = [order.service_status];
                    }
                }
                
                if (statuses.length > 0) {
                    const lastStatus = statuses[statuses.length - 1];
                    if (typeof lastStatus === 'string') {
                        let statusText = lastStatus.split('T')[0];
                        if (statusText.includes('-工程师:')) {
                            statusText = statusText.split('-工程师:')[0];
                        }
                        currentStatus = statusText;
                    }
                }
            } catch (e) {
                console.error('状态解析失败:', e);
            }
        }
        
        const isAdmin = user.account_type === 'admin' || user.accountType === 'admin';
        const isEngineer = user.account_type === 'engineer' || user.accountType === 'engineer';
        const isCustomerService = user.account_type === 'customer_service' || user.accountType === 'customer_service';
        
        // 获取工单创建者信息
        const orderCreator = await db.query('SELECT creator_id FROM work_orders WHERE id = ?', [id]);
        const isCreator = orderCreator.length > 0 && orderCreator[0].creator_id === user.id;
        
        // 权限检查：
        // 1. 管理员可以删除所有工单（除了已完成的工单）
        // 2. 工程师可以删除：自己创建的工单 或 分配给自己的工单（除了已完成的工单）
        // 3. 客服如果有删除权限，可以删除所有工单（除了已完成的工单）
        // 4. 已完成的工单不允许删除
        
        // 检查是否为已完成状态
        if (currentStatus === '完成') {
            return res.status(403).json({ error: '已完成的工单不允许删除' });
        }
        
        // 统一权限检查逻辑：
        // 已完成的工单不允许删除
        if (currentStatus === '完成') {
            return res.status(403).json({ error: '已完成的工单不允许删除' });
        }
        
        // 获取用户权限列表
        let permissions = [];
        if (user.permissions) {
            if (typeof user.permissions === 'string') {
                permissions = user.permissions.split('|').map(p => p.trim()).filter(p => p);
            } else if (Array.isArray(user.permissions)) {
                permissions = user.permissions;
            }
        }
        
        // 检查删除权限
        const canDelete = isAdmin || 
            (isEngineer && (isCreator || order.engineer_id === user.id)) ||
            (isCustomerService && permissions.includes('删除')) ||
            isCreator;
        
        if (!canDelete) {
            return res.status(403).json({ error: '权限不足，无法删除此工单' });
        }

        // 添加调试日志跟踪user信息
        console.log('工单删除时用户信息:', {
            userId: user.id,
            full_name: user.full_name,
            fullName: user.fullName,
            account_type: user.account_type,
            accountType: user.accountType
        });
        // 通知相关用户（在派单成功或服务中状态下被非工程师本人删除）
        await notifyRelevantUsers(id, '删除', user.id, user.full_name || user.fullName);

        // 获取前端发送的删除数据
        const { deleted_at, pending_material_ids } = req.body;
        
        // 获取数据库连接
        const connection = await db.getConnection();
        
        try {
            // 开始事务 - 使用query方法而不是execute方法
            await connection.query('START TRANSACTION');
            
            // 先删除所有与该工单相关的物料申请，解决外键约束问题
            await connection.execute('DELETE FROM material_requests WHERE work_order_id = ?', [id]);
            
            // 然后删除工单
            await connection.execute('DELETE FROM work_orders WHERE id = ?', [id]);
            
            // 提交事务 - 使用query方法而不是execute方法
            await connection.query('COMMIT');
            
            res.json({ message: '工单删除成功' });
        } catch (error) {
            // 回滚事务 - 使用query方法而不是execute方法
            await connection.query('ROLLBACK');
            console.error('删除工单及物料申请时出错:', error);
            throw error;
        } finally {
            // 释放连接
            connection.release();
        }
    } catch (error) {
        console.error('删除工单错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});



// 获取最近工单（首页用）
router.get('/recent/list', authMiddleware, checkPermission('查看'), async (req, res) => {
    try {
        const workOrders = await db.query(`
            SELECT wo.*, u1.full_name as creator_full_name, u2.full_name as engineer_full_name 
            FROM work_orders wo 
            LEFT JOIN users u1 ON wo.creator_id = u1.id 
            LEFT JOIN users u2 ON wo.engineer_id = u2.id 
            ORDER BY wo.create_time DESC 
            LIMIT 10
        `);

        const formattedOrders = workOrders.map(order => {
            let currentStatus = '等待服务';
            
            if (order.service_status) {
                try {
                    const statuses = JSON.parse(order.service_status);
                    if (statuses.length > 0) {
                        currentStatus = statuses[statuses.length - 1].split('T')[0];
                    }
                } catch (e) {
                    // 如果解析失败，保持原样
                }
            }

            return {
                ...order,
                currentStatus
            };
        });

        res.json(formattedOrders);
    } catch (error) {
        console.error('获取最近工单错误:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

module.exports = router;