const db = require('../config/database');

class NotificationService {
    /**
     * 创建通知（根据用户设置过滤）
     * @param {number} userId - 接收通知的用户ID
     * @param {string} type - 通知类型
     * @param {string} title - 通知标题
     * @param {string} content - 通知内容
     * @param {number} relatedId - 相关ID（如工单ID）
     * @returns {Promise<Object|null>} 返回创建的通知对象或null（如果用户禁用了该类型通知）
     */
    static async createNotification(userId, type, title, content, relatedId = null) {
        try {
            // 参数验证
            if (!userId) {
                console.error('创建通知失败：用户ID不能为空');
                return null;
            }
            
            // 处理可能为undefined的参数
            const safeType = type || 'system';
            const safeTitle = title || '系统通知';
            const safeContent = content || '';
            const safeRelatedId = relatedId || null;
            
            // 获取用户的通知设置
            const settings = await this.getUserNotificationSettings(userId);
            
            // 检查用户是否启用了此类型的通知
            // 特殊处理：系统通知必须发送，忽略用户设置
            if (safeType !== 'system' && !this.isNotificationEnabled(settings, safeType)) {
                console.log(`用户 ${userId} 禁用了 ${safeType} 类型通知，跳过创建`);
                return null;
            }

            // 创建通知记录，使用MySQL默认的CURRENT_TIMESTAMP作为created_at
            const result = await db.query(
                'INSERT INTO notifications (user_id, title, content, type, related_id,created_at) VALUES (?, ?, ?, ?, ?, ?)',
                [userId, safeTitle, safeContent, safeType, safeRelatedId,new Date()]
            );

            if (result && result.insertId) {
                // 创建通知对象
                const notification = {
                    id: result.insertId,
                    user_id: userId,
                    title: safeTitle,
                    content: safeContent,
                    type: safeType,
                    related_id: safeRelatedId,
                    is_read: false
                };

                // 检查是否启用声音提醒
                if (settings.sound_enabled) {
                    notification.play_sound = true;
                }

                // 实时推送通知
                if (global.pushNotificationToUser) {
                    global.pushNotificationToUser(userId, notification);
                    console.log(`✅ 已推送通知到用户 ${userId}: ${title}`);
                } else {
                    console.log(`⚠️ 全局推送函数不存在，通知仅存储到数据库`);
                }

                return notification;
            } else {
                throw new Error('数据库插入失败，未返回有效的insertId');
            }
        } catch (error) {
            console.error('创建通知错误:', error);
            throw error;
        }
    }

    /**
     * 批量创建通知
     * @param {Array} notifications - 通知数组，每个元素包含 {userId, type, title, content, relatedId}
     * @returns {Promise<Array>} 返回创建成功的通知数组
     */
    static async createBatchNotifications(notifications) {
        // 验证参数
        if (!Array.isArray(notifications)) {
            console.error('批量创建通知失败：通知数组参数无效');
            return [];
        }
        
        const results = [];
        
        for (const notification of notifications) {
            try {
                // 确保notification对象存在
                if (!notification) {
                    console.error('批量创建通知失败：通知对象无效');
                    continue;
                }
                
                const result = await this.createNotification(
                    notification.userId,
                    notification.type,
                    notification.title,
                    notification.content,
                    notification.relatedId
                );
                
                if (result) {
                    results.push(result);
                }
            } catch (error) {
                console.error(`批量创建通知失败 - 用户: ${notification?.userId || '未知'}, 类型: ${notification?.type || '未知'}:`, error);
            }
        }
        
        return results;
    }

    /**
     * 获取用户的通知设置
     * @param {number} userId - 用户ID
     * @returns {Promise<Object>} 用户通知设置
     */
    static async getUserNotificationSettings(userId) {
        try {
            // 确保用户通知设置存在
            await db.query(
                'INSERT IGNORE INTO user_notification_settings (user_id, notification_types, sound_enabled,created_at,updated_at) VALUES (?, ?, ?,?,?)',
                [userId, 'permission_change|account_type_change|new_order|return_order|modify_order|delete_order|status_change|material_request|material_status_update', true,new Date(),new Date()]
            );

            const settings = await db.query(
                'SELECT notification_types, sound_enabled FROM user_notification_settings WHERE user_id = ?',
                [userId]
            );

            if (settings.length === 0) {
                // 返回默认设置
            return {
                notification_types: 'permission_change|account_type_change|new_order|return_order|modify_order|delete_order|status_change|material_request|material_status_update',
                sound_enabled: true
            };
            }

            return {
                notification_types: settings[0].notification_types || '',
                sound_enabled: !!settings[0].sound_enabled
            };
        } catch (error) {
            console.error('获取用户通知设置错误:', error);
            // 返回默认设置
            return {
                notification_types: 'permission_change|account_type_change|new_order|return_order|modify_order|delete_order|status_change|material_request|material_status_update',
                sound_enabled: true
            };
        }
    }

    /**
     * 检查用户是否启用了特定类型的通知
     * @param {Object} settings - 用户通知设置
     * @param {string} type - 通知类型
     * @returns {boolean}
     */
    static isNotificationEnabled(settings, type) {
        if (!settings) {
            return true; // 默认启用
        }
        
        // 如果notification_types为空或null，表示禁用所有通知
        if (!settings.notification_types || settings.notification_types.trim() === '') {
            return false; // 明确设置为空，禁用所有通知
        }
        
        const enabledTypes = settings.notification_types.split('|').filter(t => t.trim());
        return enabledTypes.includes(type);
    }

    // 便捷方法：创建权限变化通知
    static async createPermissionChangeNotification(userId, newPermissions, oldPermissions = null) {
        const title = '权限变化通知';
        const content = oldPermissions 
            ? `您的权限已从 "${oldPermissions}" 更改为 "${newPermissions}"`
            : `您的权限已设置为 "${newPermissions}"`;
        
        return await this.createNotification(userId, 'permission_change', title, content);
    }

    // 便捷方法：创建账号类型变化通知
    static async createAccountTypeChangeNotification(userId, newAccountType, oldAccountType = null) {
        const title = '账号类型变化通知';
        const content = oldAccountType
            ? `您的账号类型已从 "${this.getAccountTypeText(oldAccountType)}" 更改为 "${this.getAccountTypeText(newAccountType)}"`
            : `您的账号类型已设置为 "${this.getAccountTypeText(newAccountType)}"`;
        
        return await this.createNotification(userId, 'account_type_change', title, content);
    }

    // 便捷方法：创建新工单通知
    static async createNewOrderNotification(userId, orderId, customerName, workType) {
        const title = '新工单提醒';
        const content = `您有新的${this.getWorkTypeText(workType)}工单：${customerName}（工单ID: ${orderId}）`;
        
        return await this.createNotification(userId, 'new_order', title, content, orderId);
    }

    // 便捷方法：创建工单退回通知
    static async createReturnOrderNotification(userId, orderId, customerName, reason) {
        const title = '工单退回通知';
        const content = `工单ID： ${orderId}（${customerName}）已被退回：${reason}`;
        
        return await this.createNotification(userId, 'return_order', title, content, orderId);
    }

    // 便捷方法：创建工单修改通知
    static async createModifyOrderNotification(userId, orderId, customerName, changedFields) {
        const title = '工单修改通知';
        const content = `工单ID: ${orderId}（${customerName}）信息已修改：${changedFields}`;
        
        return await this.createNotification(userId, 'modify_order', title, content, orderId);
    }

    // 便捷方法：创建工单删除通知
    static async createDeleteOrderNotification(userId, orderId, customerName) {
        const title = '工单删除通知';
        const content = `工单ID: ${orderId}（${customerName}）已被删除`;
        
        return await this.createNotification(userId, 'delete_order', title, content, orderId);
    }

    // 便捷方法：创建状态更新通知
    static async createStatusUpdateNotification(userId, orderId, customerName, oldStatus, newStatus) {
        const title = '状态更新通知';
        const content = `工单ID: ${orderId}（${customerName}）状态已从 "${oldStatus}" 更新为 "${newStatus}"`;
        
        return await this.createNotification(userId, 'status_change', title, content, orderId);
    }

    // 辅助方法：获取账号类型文本
    static getAccountTypeText(accountType) {
        const typeMap = {
            'admin': '管理员',
            'engineer': '工程师',
            'customer_service': '客服',
            'user': '普通用户'
        };
        return typeMap[accountType] || accountType;
    }

    // 辅助方法：获取工单类型文本
    static getWorkTypeText(workType) {
        const typeMap = {
            'repair': '维修',
            'delivery': '送货',
            'other': '其他'
        };
        return typeMap[workType] || workType;
    }
}

module.exports = NotificationService;