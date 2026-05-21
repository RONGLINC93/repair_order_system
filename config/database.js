const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    //host: process.env.DB_HOST || '192.168.0.20',
    //host: process.env.DB_HOST || '240e:3b1:64f1:6bc0::6b',
    user: process.env.DB_USER || 'chenronglin',
    password: process.env.DB_PASSWORD || 'chenronglin',
    database: process.env.DB_NAME || 'repair_order_system',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: '+08:00' // 设置时区为东八区（北京时间）
};

// 数据库初始化函数
async function initializeDatabase() {
    console.log('正在检查数据库...');
    
    try {
        // 首先连接到MySQL服务器（不指定数据库）
        const connection = await mysql.createConnection({
            host: dbConfig.host,
            user: dbConfig.user,
            password: dbConfig.password
        });

        // 检查数据库是否存在
        const [databases] = await connection.execute(`SHOW DATABASES LIKE '${dbConfig.database}'`);
        const isNewDatabase = databases.length === 0;
        
        if (isNewDatabase) {
            console.log(`数据库 ${dbConfig.database} 不存在，正在创建...`);
            
            // 创建数据库
            await connection.execute(`CREATE DATABASE \`${dbConfig.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
            console.log('数据库创建成功');
        } else {
            console.log(`数据库 ${dbConfig.database} 已存在`);
        }
        
        // 切换到目标数据库
        await connection.changeUser({ database: dbConfig.database });
        
        // 读取并执行数据库结构文件
        const schemaPath = path.join(__dirname, '../database/schema.sql');
                
        if (fs.existsSync(schemaPath)) {
            console.log('正在导入/更新数据库结构...');
            let schema = fs.readFileSync(schemaPath, 'utf8');
                            
            // 分割SQL语句并执行
            const statements = schema
                .split(';')
                .map(stmt => {
                    // 移除单行注释
                    const lines = stmt.split('\n');
                    const cleanedLines = lines.map(line => {
                        const commentIndex = line.indexOf('--');
                        if (commentIndex !== -1) {
                            return line.substring(0, commentIndex).trim();
                        }
                        return line.trim();
                    });
                    return cleanedLines.join(' ').trim();
                })
                .filter(stmt => stmt.length > 0);

            // 检查所有创建的表是否存在
            console.log('检查所有创建的表是否存在...');
            const tableNameToCreateStatement = new Map();
            
            // 从statements数组中过滤出创建表的语句并建立表名到创建语句的映射
            statements.forEach(statement => {
                const tableMatch = statement.match(/CREATE TABLE\s+IF NOT EXISTS\s+`?([^`\s]+)`?/i) || 
                                  statement.match(/CREATE TABLE\s+`?([^`\s]+)`?/i);
                if (tableMatch) {
                    tableNameToCreateStatement.set(tableMatch[1], statement);
                }
            });
            
            // 验证每个表是否存在，如果不存在则重新创建
            for (const [tableName, createStatement] of tableNameToCreateStatement.entries()) {
                try {
                    // SHOW TABLES不支持参数化查询，使用字符串拼接
                    const [rows] = await connection.execute(`SHOW TABLES LIKE '${tableName}'`);
                    if (rows.length > 0) {
                        console.log(`✅ 表 ${tableName} 已存在`);
                    } else {
                        console.log(`❌ 表 ${tableName} 不存在，正在创建...`);
                        // 执行创建表的语句
                        await connection.execute(createStatement);
                        console.log(`✅ 表 ${tableName} 创建成功`);   
                        // 导入默认数据
                        if (tableName === 'company_info') {
                            console.log("开始导入默认公司信息");
                            // 插入默认公司信息
                            await connection.execute(`
                                INSERT INTO company_info (id,company_name, company_address,contact_phone, created_at, updated_at)
                                VALUES (1,'湛江霖科技有限公司', '广东省湛江市麻章区湖光镇铺仔圩新贸路130号', '15876377692', ?, ?)
                            `, [new Date(), new Date()]);                           
                            console.log("默认公司信息导入成功");                            
                        }
                        // 用户表
                        if (tableName === 'users') {
                            console.log("开始导入默认用户（管理员）");
                            // 插入默认用户（管理员）
                            await connection.execute(`
                                INSERT INTO users (id,username, password, full_name, account_type, permissions, created_at, updated_at)
                                VALUES (1,'admin', '$2a$10$RcsIgyLWglhQnLy29JHZA.QP4A1T7G558Za.Ipp9C5wHuAyWkNpd.', '系统管理员', 'admin', '新建|查看|承接|修改|删除|用户管理|地址管理|仓储管理', ?, ?)
                            `, [new Date(), new Date()]);                           
                            console.log("默认用户（管理员）导入成功");                            
                        }
                        // 服务地址表
                        if (tableName === 'service_addresses') {
                            console.log("开始导入默认服务地址");
                            // 插入默认服务地址
                            await connection.execute(`
                                INSERT INTO service_addresses (address, created_at, updated_at)
                                VALUES (?, ?, ?)
                            `, ['北京市朝阳区', new Date(), new Date()]);   
                            await connection.execute(`
                                INSERT INTO service_addresses (address, created_at, updated_at)
                                VALUES (?, ?, ?)
                            `, ['北京市海淀区', new Date(), new Date()]);   
                            await connection.execute(`
                                INSERT INTO service_addresses (address, created_at, updated_at)
                                VALUES (?, ?, ?)
                            `, ['上海市浦东新区', new Date(), new Date()]);   
                             console.log("默认服务地址导入成功");                            
                        }      
                        // 系统日志表
                        if (tableName === 'system_logs') {
                            console.log("开始导入默认日志");
                            // 插入默认日志
                            await connection.execute(`
                                INSERT INTO system_logs (log_type, message, created_at, updated_at)
                                VALUES (?, ?, ?, ?)
                            `, ['info', '系统初始化', new Date(), new Date()]);   
                             console.log("默认日志导入成功");                            
                        } 
                        // 系统设置表
                            if(tableName === 'system_settings') {
                                console.log("开始导入默认系统设置");
                                // 插入默认系统设置
                                await connection.execute(`
                                    INSERT INTO system_settings (setting_key, setting_value,description, created_at, updated_at)
                                    VALUES (?, ?, ?, ?, ?)
                                `, ['log_clear_period', '0', '日志自动清空周期（天），0表示不自动清空', new Date(), new Date()]);   
                                console.log("默认系统设置导入成功");                            
                            }

                        // 作物表
                        if (tableName === 'farm_crops') {
                            console.log("开始导入默认作物");
                            await connection.execute(`
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
                                ('sugarcane', '甘蔗', '🎋', '🌱|🌿|🎋', 700, 130, 320, 45, 'special')
                            `);
                            console.log("默认作物导入成功");                            
                        }

                        //农场配置表
                        if (tableName === 'farm_configs') {
                            console.log("开始导入默认农场配置");
                            await connection.execute(`
                                INSERT INTO farm_configs (config_key, config_value,description, created_at, updated_at)
                                VALUES (?, ?, ?, ?, ?)
                            `, ['total_plots', '50', '农场地块总数', new Date(), new Date()]);   
                            console.log("默认农场配置导入成功");                            
                        }
                    }
                } catch (err) {
                    console.error(`处理表格 ${tableName} 失败:`, err.message);
                }
            }
            console.log('数据库结构导入/更新成功');
        } else {
            console.warn('未找到数据库结构文件:', schemaPath);
        }
          
        await connection.end();
        console.log('数据库检查完成');
        
    } catch (error) {
        console.error('数据库初始化失败:', error);
        throw error;
    }
}

// 先创建一个不包含database的配置，用于初始连接
const baseConfig = {
    host: dbConfig.host,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: '+08:00' // 设置时区为东八区（北京时间）
};

// 创建连接池，初始不指定数据库
let pool = mysql.createPool(baseConfig);

// 数据库初始化完成后，更新连接池配置
async function updatePoolConfig() {
    pool = mysql.createPool(dbConfig);
}

module.exports = {
    // 辅助函数：将ISO格式时间戳转换为MySQL TIMESTAMP格式
    convertIsoToMysqlTimestamp(value) {
        if (typeof value === 'string' && value.includes('T') && value.includes('Z')) {
            // 转换ISO格式（如：2025-12-05T04:54:18.863Z）为MySQL格式（如：2025-12-05 04:54:18）
            return value.replace('T', ' ').replace('Z', '').split('.')[0];
        }
        return value;
    },

    async query(sql, params = []) {
        try {
            // 直接使用完整的dbConfig创建连接，确保每次都连接到正确的数据库
            const connection = await mysql.createConnection(dbConfig);
            try {
                // 确保参数是数组格式
                let sqlParams = Array.isArray(params) ? params : [params];
                let finalSql = sql;
                
                // 转换ISO格式的时间戳为MySQL TIMESTAMP格式，但仅针对真正的Date对象或ISO格式字符串
                sqlParams = sqlParams.map(param => {
                    // 只有Date对象或包含'T'和'Z'的字符串才被视为时间戳
                    if (param instanceof Date || (typeof param === 'string' && param.includes('T') && param.includes('Z'))) {
                        return this.convertIsoToMysqlTimestamp(param);
                    }
                    return param;
                });
                
                // 特殊处理包含LIMIT和OFFSET的SQL语句
                // MySQL预处理语句对LIMIT和OFFSET参数支持有限制，需要特殊处理
                if (sql.toLowerCase().includes('limit') && sql.toLowerCase().includes('offset') && sqlParams.length >= 2) {
                    const lastTwoParams = sqlParams.slice(-2);
                    const limitValue = parseInt(lastTwoParams[0]) || 10;
                    const offsetValue = parseInt(lastTwoParams[1]) || 0;
                    
                    // 将LIMIT和OFFSET直接插入SQL语句中
                    const limitMatch = sql.match(/(.*)limit\s+\?\s+offset\s+\?(.*)$/i);
                    if (limitMatch) {
                        finalSql = `${limitMatch[1]}limit ${limitValue} offset ${offsetValue}${limitMatch[2]}`;
                        sqlParams = sqlParams.slice(0, -2); // 移除最后两个参数
                    }
                }
                
                const [rows] = await connection.execute(finalSql, sqlParams);
                return rows;
            } finally {
                connection.end(); // 确保连接正确关闭
            }
        } catch (error) {
            console.error('Database query error:', error);
            throw error;
        }
    },
    
    async getConnection() {
        return await pool.getConnection();
    },
    
    // 导出初始化函数
    initializeDatabase,
    updatePoolConfig
};