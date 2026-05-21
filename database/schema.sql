-- 维修工单系统数据库设计
-- 创建数据库
CREATE DATABASE IF NOT EXISTS repair_order_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL COMMENT '账号',
    password VARCHAR(255) NOT NULL COMMENT '密码(加密)',
    full_name VARCHAR(100) COMMENT '姓名',
    phone VARCHAR(20) COMMENT '手机号',
    email VARCHAR(100) COMMENT '邮箱',
    address TEXT COMMENT '住址',
    transport_type VARCHAR(50) COMMENT '交通方式',
    account_type ENUM('admin', 'engineer', 'customer_service', 'user', 'warehouse_manager') DEFAULT 'user' COMMENT '账号类型：管理员、工程师、客服、普通用户、仓储管理',
    permissions TEXT COMMENT '权限，用|分割，如：新建|查看|承接|修改|删除|地址管理|用户管理|仓储管理',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
);

-- 服务地址表
CREATE TABLE IF NOT EXISTS service_addresses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    address VARCHAR(255) NOT NULL COMMENT '地址',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 工单表
CREATE TABLE IF NOT EXISTS work_orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '工单创建时间，格式：2025-11-21T16:01',
    creator_id INT COMMENT '创建人ID',
    creator_name VARCHAR(100) COMMENT '创建人姓名',
    creator_position VARCHAR(50) COMMENT '创建人职位',
    service_time TIMESTAMP NULL COMMENT '工单服务时间，格式：2025-11-24',
    work_type ENUM('repair', 'delivery', 'other') DEFAULT 'repair' COMMENT '工单类型：维修、送货、其他',
    work_description TEXT COMMENT '工单说明',
    customer_name VARCHAR(100) COMMENT '客户姓名',
    customer_phone VARCHAR(20) COMMENT '客户电话',
    customer_address TEXT COMMENT '客户地址',
    notes TEXT COMMENT '备注',
    engineer_id INT COMMENT '服务工程师ID',
    engineer_name VARCHAR(100) COMMENT '服务工程师姓名',
    service_status TEXT COMMENT '服务状态进度，JSON数组格式保存状态变更记录，如：["等待服务T2025-11-23T14:11:23","派单成功T2025-11-23T15:30:00"]',
    images TEXT COMMENT '图片，用|分割，如：["/uploads/work-order-images/work-order-1764649966291-600197527.jpg","/uploads/work-order-images/work-order-1764649966368-887177650.jpg"]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (creator_id) REFERENCES users(id),
    FOREIGN KEY (engineer_id) REFERENCES users(id)
);

-- 消息提醒表
CREATE TABLE IF NOT EXISTS notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sender_id INT COMMENT '发送消息的用户ID,系统ID:0或空',
    user_id INT COMMENT '接收消息的用户ID',
    receiver_id INT COMMENT '接收方ID，用于双向聊天',
    title VARCHAR(200) COMMENT '消息标题',
    content TEXT COMMENT '消息内容',
    type ENUM('permission_change', 'account_type_change', 'new_order', 'return_order', 'modify_order', 'delete_order', 'status_change', 'status_update', 'material_request', 'material_status_update', 'system', 'user') COMMENT '消息类型：权限改变、账号类型改变、新工单、退回工单、修改工单、删除工单、状态改变、状态更新、物料采购申请、物料状态更新、系统消息、用户消息',
    related_id INT COMMENT '相关ID，如工单ID',
    is_read BOOLEAN DEFAULT FALSE COMMENT '是否已读',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 聊天功能相关表结构（添加到现有schema中）
-- 聊天消息表
CREATE TABLE IF NOT EXISTS chat_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sender_id INT NOT NULL COMMENT '发送者ID',
    receiver_id INT NOT NULL COMMENT '接收者ID',
    content TEXT NOT NULL COMMENT '消息内容',
    message_type ENUM('text', 'image', 'file') DEFAULT 'text' COMMENT '消息类型：文本、图片、文件',
    file_url VARCHAR(500) COMMENT '文件URL（图片或文件消息）',
    is_read BOOLEAN DEFAULT FALSE COMMENT '是否已读',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_chat_sender_receiver (sender_id, receiver_id),
    INDEX idx_chat_created_at (created_at),
    INDEX idx_chat_is_read (is_read)
);

-- 聊天会话表（用于会话列表）
CREATE TABLE IF NOT EXISTS chat_conversations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user1_id INT NOT NULL COMMENT '用户1 ID',
    user2_id INT NOT NULL COMMENT '用户2 ID',
    last_message_id INT COMMENT '最后一条消息ID',
    last_message_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '最后一条消息时间',
    user1_unread_count INT DEFAULT 0 COMMENT '用户1未读消息数',
    user2_unread_count INT DEFAULT 0 COMMENT '用户2未读消息数',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user1_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (user2_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (last_message_id) REFERENCES chat_messages(id) ON DELETE SET NULL
);

-- 用户通知设置表
CREATE TABLE IF NOT EXISTS user_notification_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL COMMENT '用户ID，与users表关联',
    avatar VARCHAR(255) COMMENT '用户头像路径',
    notification_types TEXT COMMENT '推送通知类型，用|分割，如：permission_change|account_type_change|new_order|return_order|modify_order|delete_order|status_change|status_update|material_request|material_status_update|system|user',
    sound_enabled BOOLEAN DEFAULT TRUE COMMENT '是否启用通知声音提醒',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_id (user_id)
);

-- 公司信息表
 CREATE TABLE IF NOT EXISTS company_info (
    id INT PRIMARY KEY AUTO_INCREMENT,
    company_name VARCHAR(255) NOT NULL DEFAULT '',
    company_address VARCHAR(500) NOT NULL DEFAULT '',
    contact_phone VARCHAR(50) NOT NULL DEFAULT '',
    logo_path VARCHAR(500) DEFAULT NULL,
    favicon_path VARCHAR(500) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);


-- 物料采购申请表
CREATE TABLE IF NOT EXISTS material_requests (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '物料采购申请订单ID',
    material_name VARCHAR(200) NOT NULL COMMENT '物料名',
    images TEXT COMMENT '物料图片JSON数组，存储图片路径' ,
    quantity DECIMAL(10,2) NOT NULL COMMENT '数量',
    status_application TIMESTAMP NULL COMMENT '申请中（日期时间）',
    applicant_id INT NOT NULL COMMENT '申请人ID',
    status_approved TIMESTAMP NULL COMMENT '同意采购（日期时间）',    
    purchaser_id INT COMMENT '采购人ID',
    approver_id INT NULL COMMENT '同意采购的批示人ID',
    status_purchasing TIMESTAMP NULL COMMENT '采购中（日期时间）',
    status_completed TIMESTAMP NULL COMMENT '采购完成（日期时间）',
    completer_id INT NULL COMMENT '采购完成的批示人ID',
    status_warehouse_out TIMESTAMP NULL COMMENT '出库（日期时间）',
    warehouse_staff_id INT NULL COMMENT '出库的批示人ID',
    status_rejected TIMESTAMP NULL COMMENT '拒绝采购（日期时间）',
    rejecter_id INT NULL COMMENT '拒绝采购的批示人ID',
    work_order_id INT NULL COMMENT '关联的工单ID，也可空，空则为备货',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_material_requests_applicant_id (applicant_id),
    INDEX idx_material_requests_status_application (status_application),
    INDEX idx_material_requests_work_order_id (work_order_id),
    INDEX idx_material_requests_status_approved (status_approved),
    INDEX idx_material_requests_purchaser_id (purchaser_id),
    INDEX idx_material_requests_approver_id (approver_id),
    INDEX idx_material_requests_status_purchasing (status_purchasing),
    INDEX idx_material_requests_status_completed (status_completed),
    INDEX idx_material_requests_completer_id (completer_id),
    INDEX idx_material_requests_status_warehouse_out (status_warehouse_out),
    INDEX idx_material_requests_warehouse_staff_id (warehouse_staff_id),
    INDEX idx_material_requests_status_rejected (status_rejected),
    INDEX idx_material_requests_rejecter_id (rejecter_id)
);
-- 便签表
CREATE TABLE IF NOT EXISTS notes (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '便签ID',
    user_id INT NOT NULL COMMENT '用户ID',
    title VARCHAR(200) NOT NULL COMMENT '便签标题',
    content TEXT NOT NULL COMMENT '便签内容',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    color VARCHAR(20) NOT NULL DEFAULT 'none' COMMENT '便签颜色,none',
    is_pinned BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否置顶',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_notes_user_id (user_id),
    INDEX idx_notes_is_pinned (is_pinned),
    INDEX idx_notes_created_at (created_at),
    INDEX idx_notes_updated_at (updated_at),
    INDEX idx_notes_color (color),
    INDEX idx_notes_title (title(20)),
    INDEX idx_notes_content (content(20))
);

-- 系统日志表
CREATE TABLE IF NOT EXISTS system_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    log_type VARCHAR(50) NOT NULL COMMENT '日志类型：auth登录认证、work_order工单操作、system系统操作、api接口调用、error错误日志、database数据库操作、security安全相关、custom自定义',
    log_level ENUM('info', 'warning', 'error', 'debug') NOT NULL COMMENT '日志级别：info信息、warning警告、error错误、debug调试',
    message TEXT NOT NULL COMMENT '日志消息',
    details TEXT COMMENT '详细日志内容',
    user_id INT COMMENT '操作用户ID',
    ip_address VARCHAR(45) COMMENT 'IP地址',
    user_agent VARCHAR(500) COMMENT '用户代理信息',
    is_public BOOLEAN DEFAULT TRUE COMMENT '是否公开（所有用户可见）',
    related_id INT COMMENT '关联的业务ID（如工单ID）',
    related_type VARCHAR(50) COMMENT '关联业务类型（如work_order）',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_logs_log_type (log_type),
    INDEX idx_logs_log_level (log_level),
    INDEX idx_logs_user_id (user_id),
    INDEX idx_logs_created_at (created_at),
    INDEX idx_logs_is_public (is_public),
    INDEX idx_logs_related (related_id, related_type),
    INDEX idx_logs_ip_address (ip_address)
);

-- 系统设置表
CREATE TABLE IF NOT EXISTS system_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    setting_key VARCHAR(100) NOT NULL UNIQUE COMMENT '设置键名，如：log_clear_period',
    setting_value TEXT COMMENT '设置值',
    description VARCHAR(255) COMMENT '设置说明',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_settings_key (setting_key)
);

-- 插入默认系统设置
INSERT IGNORE INTO system_settings (setting_key, setting_value, description) VALUES
('log_clear_period', '0', '日志自动清空周期（天），0表示不自动清空');

-- 收藏文件夹表
CREATE TABLE IF NOT EXISTS favorite_folders (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '文件夹ID',
    user_id INT NOT NULL COMMENT '用户ID，与users表关联',
    name VARCHAR(200) NOT NULL COMMENT '文件夹名称',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_folder_name (user_id, name),
    INDEX idx_favorite_folders_user_id (user_id),
    INDEX idx_favorite_folders_name (name)
);

-- 网址收藏表
CREATE TABLE IF NOT EXISTS favorites (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '收藏ID',
    user_id INT NOT NULL COMMENT '用户ID，与users表关联',
    folder_id INT NULL COMMENT '文件夹ID，与favorite_folders表关联',
    name VARCHAR(200) NOT NULL COMMENT '网站名称',
    url VARCHAR(500) NOT NULL COMMENT '网站地址',
    description TEXT COMMENT '网站描述',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (folder_id) REFERENCES favorite_folders(id) ON DELETE SET NULL,
    UNIQUE KEY unique_user_url (user_id, url(191)),
    INDEX idx_favorites_user_id (user_id),
    INDEX idx_favorites_folder_id (folder_id),
    INDEX idx_favorites_name (name),
    INDEX idx_favorites_url (url(191))
);

-- 插入一些测试日志数据
INSERT IGNORE INTO system_logs (log_type, log_level, message, details, user_id, is_public) VALUES
('system', 'info', '系统启动完成', '维修工单系统已成功启动，版本号：1.0.0', NULL, TRUE),
('auth', 'info', '用户登录成功', '用户 admin 登录系统', 1, TRUE),
('work_order', 'info', '工单创建成功', '创建新工单，工单编号：WO-2024-001', 1, TRUE),
('api', 'info', 'API接口调用', '调用接口：GET /api/work-orders，耗时：45ms', 1, TRUE),
('system', 'warning', '内存使用率偏高', '当前内存使用率：78%，请关注服务器性能', NULL, TRUE),
('error', 'error', '文件上传失败', '上传文件大小超过限制，最大允许5MB', 2, TRUE),
('database', 'info', '数据库连接成功', '成功连接到MySQL数据库', NULL, TRUE),
('security', 'warning', '异常登录尝试', '检测到来自IP 192.168.1.100 的异常登录尝试，密码错误3次', NULL, TRUE);


-- 为现有用户创建默认通知设置
INSERT IGNORE INTO user_notification_settings (user_id, notification_types, sound_enabled)
SELECT id, 'permission_change|account_type_change|new_order|return_order|modify_order|delete_order|status_change|material_request|material_status_update', TRUE 
FROM users;

-- 创建默认公司信息
INSERT IGNORE INTO company_info (company_name, company_address, contact_phone,created_at,updated_at) VALUES 
('湛江霖科技有限公司', '广东省湛江市麻章区湖光镇铺仔圩新贸路130号', '15876377692','2025-11-21T16:01','2025-11-21T16:01');

-- 创建默认管理员账号（使用加密密码）
INSERT IGNORE INTO users (username, password, full_name, account_type, permissions) VALUES 
('admin', '$2a$10$RcsIgyLWglhQnLy29JHZA.QP4A1T7G558Za.Ipp9C5wHuAyWkNpd.', '系统管理员', 'admin', '新建|查看|承接|修改|删除|用户管理|地址管理|仓储管理');

-- 创建默认服务地址
INSERT IGNORE INTO service_addresses (address) VALUES 
('北京市朝阳区'),
('北京市海淀区'),
('北京市西城区'),
('北京市东城区'),
('北京市丰台区'),
('北京市石景山区'),
('北京市通州区'),
('北京市昌平区');

-- 创建索引
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_account_type ON users(account_type);
CREATE INDEX idx_work_orders_creator ON work_orders(creator_id);
CREATE INDEX idx_work_orders_engineer ON work_orders(engineer_id);
CREATE INDEX idx_work_orders_status ON work_orders(service_status(50));
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(is_read);
CREATE INDEX idx_user_notification_settings_user ON user_notification_settings(user_id);



-- 通知类型枚举说明：
-- permission_change: 权限变化
-- account_type_change: 账号类型变化  
-- new_order: 新工单提醒
-- return_order: 退回工单
-- modify_order: 修改工单
-- delete_order: 删除工单
-- status_update: 状态更新
-- material_request: 物料采购申请
-- material_status_update: 物料状态更新

-- ============================================
-- 农场游戏数据表
-- ============================================

-- 作物配置表
CREATE TABLE IF NOT EXISTS farm_crops (
    id INT AUTO_INCREMENT PRIMARY KEY,
    crop_key VARCHAR(50) NOT NULL UNIQUE COMMENT '作物标识符，如wheat、corn',
    name VARCHAR(50) NOT NULL COMMENT '作物名称',
    icon VARCHAR(10) NOT NULL COMMENT '作物图标',
    stages VARCHAR(100) NOT NULL COMMENT '生长阶段图标，用|分割',
    growth_time INT NOT NULL COMMENT '生长时间（秒）',
    price INT NOT NULL DEFAULT 0 COMMENT '购买价格',
    sell_price INT NOT NULL DEFAULT 0 COMMENT '出售价格',
    exp INT NOT NULL DEFAULT 0 COMMENT '获得经验值',
    category VARCHAR(20) NOT NULL COMMENT '分类：grain谷物、vegetable蔬菜、fruit水果、flower花卉、special特殊',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_crops_key (crop_key),
    INDEX idx_crops_category (category)
);

-- 玩家农场数据表
CREATE TABLE IF NOT EXISTS farm_players (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE COMMENT '玩家用户ID',
    level INT NOT NULL DEFAULT 1 COMMENT '等级',
    exp INT NOT NULL DEFAULT 0 COMMENT '当前经验值',
    exp_to_next_level INT NOT NULL DEFAULT 100 COMMENT '下一级所需经验值',
    gold INT NOT NULL DEFAULT 1000 COMMENT '金币数量',
    last_check_in TIMESTAMP NULL COMMENT '上次签到时间',
    next_check_in_time TIMESTAMP NULL COMMENT '下次可签到时间',
    plants_count INT NOT NULL DEFAULT 0 COMMENT '种植作物次数',
    first_plant_at TIMESTAMP NULL COMMENT '首次种植时间',
    harvest_count INT NOT NULL DEFAULT 0 COMMENT '收获作物次数',
    harvest_10_at TIMESTAMP NULL COMMENT '收获10个作物成就时间',
    harvest_50_at TIMESTAMP NULL COMMENT '收获50个作物成就时间',
    harvest_100_at TIMESTAMP NULL COMMENT '收获100个作物成就时间',
    total_gold INT NOT NULL DEFAULT 0 COMMENT '累计获得金币',
    gold_1000_at TIMESTAMP NULL COMMENT '获得1000金币成就时间',
    gold_5000_at TIMESTAMP NULL COMMENT '获得5000金币成就时间',
    level_5_at TIMESTAMP NULL COMMENT '达到5级成就时间',
    level_10_at TIMESTAMP NULL COMMENT '达到10级成就时间',
    consecutive_check_in_days INT NOT NULL DEFAULT 0 COMMENT '连续签到天数',
    check_in_7_at TIMESTAMP NULL COMMENT '连续签到7天成就时间',
    claimed_achievement_gold INT NOT NULL DEFAULT 0 COMMENT '已领取的成就奖励金币',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_farm_players_user (user_id)
);

-- 玩家仓库表
CREATE TABLE IF NOT EXISTS farm_inventory (
    id INT AUTO_INCREMENT PRIMARY KEY,
    player_id INT NOT NULL COMMENT '玩家ID',
    crop_key VARCHAR(50) NOT NULL COMMENT '作物标识符',
    quantity INT NOT NULL DEFAULT 0 COMMENT '数量',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (player_id) REFERENCES farm_players(id) ON DELETE CASCADE,
    UNIQUE KEY unique_player_crop (player_id, crop_key),
    INDEX idx_inventory_player (player_id),
    INDEX idx_inventory_crop (crop_key)
);

-- 农场配置表
CREATE TABLE IF NOT EXISTS farm_configs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    config_key VARCHAR(100) NOT NULL UNIQUE COMMENT '配置键名，如：total_plots',
    config_value TEXT NOT NULL COMMENT '配置值',
    description VARCHAR(255) COMMENT '配置说明',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_config_key (config_key)
);

-- 玩家地块表
CREATE TABLE IF NOT EXISTS farm_plots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    player_id INT NOT NULL COMMENT '玩家ID',
    plot_index INT NOT NULL COMMENT '地块索引（0开始）',
    is_unlocked BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否已解锁',
    crop_key VARCHAR(50) NULL COMMENT '种植的作物标识符',
    planted_at TIMESTAMP NULL COMMENT '种植时间',
    stage INT NOT NULL DEFAULT 0 COMMENT '生长阶段',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (player_id) REFERENCES farm_players(id) ON DELETE CASCADE,
    UNIQUE KEY unique_player_plot (player_id, plot_index),
    INDEX idx_plots_player (player_id),
    INDEX idx_plots_unlocked (is_unlocked)
);

-- 插入默认农场配置
INSERT IGNORE INTO farm_configs (config_key, config_value, description) VALUES
('total_plots', '50', '农场地块总数');

-- 插入作物配置数据
INSERT IGNORE INTO farm_crops (crop_key, name, icon, stages, growth_time, price, sell_price, exp, category) VALUES
('wheat', '小麦', '🌾', '🌱|🌿|🌾', 60, 50, 100, 10, 'grain'),
('corn', '玉米', '🌽', '🌱|🌿|🌽', 120, 80, 180, 20, 'grain'),
('rice', '水稻', '🌾', '🌱|🌿|🌾', 180, 100, 250, 30, 'grain'),
('soybean', '大豆', '🫘', '🌱|🌿|🫘', 200, 65, 140, 20, 'grain'),
('sorghum', '高粱', '🌾', '🌱|🌿|🌾', 150, 90, 200, 28, 'grain'),
('carrot', '胡萝卜', '🥕', '🌱|🌿|🥕', 240, 60, 130, 15, 'vegetable'),
('potato', '土豆', '🥔', '🌱|🌿|🥔', 360, 70, 150, 18, 'vegetable'),
('tomato', '番茄', '🍅', '🌱|🌿|🍅', 480, 90, 200, 25, 'vegetable'),
('eggplant', '茄子', '🍆', '🌱|🌿|🍆', 600, 110, 280, 35, 'vegetable'),
('pepper', '辣椒', '🌶️', '🌱|🌿|🌶️', 720, 120, 320, 40, 'vegetable'),
('cabbage', '白菜', '🥬', '🌱|🌿|🥬', 400, 85, 200, 28, 'vegetable'),
('cucumber', '黄瓜', '🥒', '🌱|🌿|🥒', 350, 75, 170, 24, 'vegetable'),
('watermelon', '西瓜', '🍉', '🌱|🌿|🍉', 1200, 200, 500, 60, 'fruit'),
('strawberry', '草莓', '🍓', '🌱|🌿|🍓', 900, 150, 380, 50, 'fruit'),
('grape', '葡萄', '🍇', '🌱|🌿|🍇', 1500, 250, 600, 80, 'fruit'),
('pineapple', '菠萝', '🍍', '🌱|🌿|🍍', 1800, 300, 800, 100, 'fruit'),
('mango', '芒果', '🥭', '🌱|🌿|🥭', 1600, 280, 700, 90, 'fruit'),
('cherry', '樱桃', '🍒', '🌱|🌿|🍒', 1400, 260, 650, 85, 'fruit'),
('peach', '桃子', '🍑', '🌱|🌿|🍑', 1300, 240, 580, 75, 'fruit'),
('apple', '苹果', '🍎', '🌱|🌿|🍎', 1100, 220, 520, 70, 'fruit'),
('sunflower', '向日葵', '🌻', '🌱|🌿|🌻', 300, 80, 180, 22, 'flower'),
('rose', '玫瑰', '🌹', '🌱|🌿|🌹', 600, 150, 400, 55, 'flower'),
('tulip', '郁金香', '🌷', '🌱|🌿|🌷', 450, 120, 300, 42, 'flower'),
('orchid', '兰花', '🌸', '🌱|🌿|🌸', 550, 180, 450, 60, 'flower'),
('bamboo', '竹子', '🎋', '🌱|🎋|🎋', 2000, 350, 900, 120, 'special'),
('cotton', '棉花', '☁️', '🌱|🌿|☁️', 800, 140, 350, 48, 'special'),
('sugarcane', '甘蔗', '🎋', '🌱|🌿|🎋', 700, 130, 320, 45, 'special');

