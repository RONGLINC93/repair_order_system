const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');
const { authMiddleware } = require('../middleware/auth');
const db = require('../config/database');

const router = express.Router();

const BACKUP_DIR = path.join(__dirname, '../backups');

if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

router.post('/create', authMiddleware, async (req, res) => {
    const user = req.user;
    
    if (user.account_type !== 'admin' && user.accountType !== 'admin') {
        return res.status(403).json({ error: '只有管理员可以执行备份操作' });
    }

    let connection = null;
    try {
        const now = new Date();
        const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
        const filename = `backup_${timestamp}.sql`;
        const filepath = path.join(BACKUP_DIR, filename);

        const dbConfig = {
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'repair_order_system'
        };

        console.log('开始备份数据库...');

        connection = await mysql.createConnection(dbConfig);
        const [tables] = await connection.execute('SHOW TABLES');
        const tableNames = tables.map(t => Object.values(t)[0]);

        const localTime = now.toLocaleString('zh-CN', { hour12: false });
        let sqlContent = `-- 维修工单系统数据库备份\n`;
        sqlContent += `-- 备份时间: ${localTime}\n`;
        sqlContent += `-- 数据库: ${dbConfig.database}\n\n`;
        sqlContent += `SET FOREIGN_KEY_CHECKS = 0;\n\n`;

        for (const tableName of tableNames) {
            console.log(`备份表: ${tableName}`);
            
            const [createResult] = await connection.execute(`SHOW CREATE TABLE \`${tableName}\``);
            const createTableSQL = createResult[0]['Create Table'] || createResult[0]['Create View'];
            sqlContent += `-- 表结构: ${tableName}\n`;
            sqlContent += `DROP TABLE IF EXISTS \`${tableName}\`;\n`;
            sqlContent += `${createTableSQL};\n\n`;

            const [rows] = await connection.execute(`SELECT * FROM \`${tableName}\``);
            if (rows.length > 0) {
                const columns = Object.keys(rows[0]);
                sqlContent += `-- 表数据: ${tableName} (${rows.length} 条记录)\n`;
                
                for (const row of rows) {
                    const values = columns.map(col => {
                        const value = row[col];
                        if (value === null) {
                            return 'NULL';
                        } else if (typeof value === 'number') {
                            return value;
                        } else if (value instanceof Date) {
                            return `'${value.toISOString().slice(0, 19).replace('T', ' ')}'`;
                        } else {
                            return `'${String(value).replace(/'/g, "''").replace(/\\/g, '\\\\').replace(/\n/g, '\\n')}'`;
                        }
                    });
                    sqlContent += `INSERT INTO \`${tableName}\` (\`${columns.join('`, `')}\`) VALUES (${values.join(', ')});\n`;
                }
                sqlContent += '\n';
            }
        }

        sqlContent += `SET FOREIGN_KEY_CHECKS = 1;\n`;

        fs.writeFileSync(filepath, sqlContent, 'utf8');

        const stats = fs.statSync(filepath);
        const fileSizeInBytes = stats.size;
        const fileSizeMB = (fileSizeInBytes / (1024 * 1024)).toFixed(2);

        console.log(`备份成功: ${filename} (${fileSizeMB}MB)`);

        await db.query(
            `INSERT INTO system_logs (log_type, log_level, message, user_id, is_public, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            ['database', 'info', `数据库备份成功，文件: ${filename} (${fileSizeMB}MB)`, user.id, true, new Date(), new Date()]
        );

        res.json({
            success: true,
            message: '备份成功',
            filename,
            filepath: `/backups/${filename}`,
            size: fileSizeInBytes,
            sizeText: `${fileSizeMB} MB`,
            createdAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('备份错误:', error);
        
        await db.query(
            `INSERT INTO system_logs (log_type, log_level, message, user_id, is_public, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            ['database', 'error', `数据库备份失败: ${error.message}`, user.id, true, new Date(), new Date()]
        ).catch(logError => console.error('写入日志失败:', logError));

        res.status(500).json({ error: '备份失败', message: error.message });
    } finally {
        if (connection) {
            try {
                await connection.end();
            } catch (e) {
                // 忽略关闭连接的错误
            }
        }
    }
});

router.get('/list', authMiddleware, async (req, res) => {
    const user = req.user;
    
    if (user.account_type !== 'admin' && user.accountType !== 'admin') {
        return res.status(403).json({ error: '只有管理员可以查看备份列表' });
    }

    try {
        if (!fs.existsSync(BACKUP_DIR)) {
            return res.json({ backups: [] });
        }

        const files = fs.readdirSync(BACKUP_DIR);
        const backups = [];

        for (const file of files) {
            if (file.endsWith('.sql')) {
                const filepath = path.join(BACKUP_DIR, file);
                const stats = fs.statSync(filepath);
                backups.push({
                    filename: file,
                    filepath: `/backups/${file}`,
                    size: stats.size,
                    sizeText: formatFileSize(stats.size),
                    createdAt: stats.birthtime,
                    modifiedAt: stats.mtime
                });
            }
        }

        backups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.json({ backups });
    } catch (error) {
        console.error('获取备份列表错误:', error);
        res.status(500).json({ error: '获取备份列表失败', message: error.message });
    }
});

router.get('/download/:filename', authMiddleware, async (req, res) => {
    const user = req.user;
    
    if (user.account_type !== 'admin' && user.accountType !== 'admin') {
        return res.status(403).json({ error: '只有管理员可以下载备份文件' });
    }

    try {
        const { filename } = req.params;
        const safeFilename = path.basename(filename);
        const filepath = path.join(BACKUP_DIR, safeFilename);

        if (!fs.existsSync(filepath)) {
            return res.status(404).json({ error: '备份文件不存在' });
        }

        res.download(filepath, safeFilename);
    } catch (error) {
        console.error('下载备份错误:', error);
        res.status(500).json({ error: '下载备份失败', message: error.message });
    }
});

router.delete('/:filename', authMiddleware, async (req, res) => {
    const user = req.user;
    
    if (user.account_type !== 'admin' && user.accountType !== 'admin') {
        return res.status(403).json({ error: '只有管理员可以删除备份文件' });
    }

    try {
        const { filename } = req.params;
        const safeFilename = path.basename(filename);
        const filepath = path.join(BACKUP_DIR, safeFilename);

        if (!fs.existsSync(filepath)) {
            return res.status(404).json({ error: '备份文件不存在' });
        }

        fs.unlinkSync(filepath);

        await db.query(
            `INSERT INTO system_logs (log_type, log_level, message, user_id, is_public, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            ['database', 'info', `删除备份文件: ${safeFilename}`, user.id, true, new Date(), new Date()]
        );

        res.json({ success: true, message: '删除成功' });
    } catch (error) {
        console.error('删除备份错误:', error);
        res.status(500).json({ error: '删除备份失败', message: error.message });
    }
});

router.post('/restore/:filename', authMiddleware, async (req, res) => {
    const user = req.user;
    
    if (user.account_type !== 'admin' && user.accountType !== 'admin') {
        return res.status(403).json({ error: '只有管理员可以执行还原操作' });
    }

    let connection = null;
    try {
        const { filename } = req.params;
        const safeFilename = path.basename(filename);
        const filepath = path.join(BACKUP_DIR, safeFilename);

        if (!fs.existsSync(filepath)) {
            return res.status(404).json({ error: '备份文件不存在' });
        }

        console.log(`开始还原数据库: ${safeFilename}`);

        const sqlContent = fs.readFileSync(filepath, 'utf8');

        const dbConfig = {
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'repair_order_system',
            multipleStatements: true
        };

        connection = await mysql.createConnection(dbConfig);

        await connection.query('SET FOREIGN_KEY_CHECKS = 0');

        const statements = sqlContent.split(/;\s*\n/).filter(s => s.trim() && !s.trim().startsWith('--'));

        let completed = 0;
        const total = statements.length;

        for (const statement of statements) {
            const trimmedStmt = statement.trim();
            if (trimmedStmt && !trimmedStmt.startsWith('SET FOREIGN_KEY_CHECKS')) {
                try {
                    await connection.query(trimmedStmt);
                } catch (stmtError) {
                    console.warn('执行语句警告:', stmtError.message);
                }
            }
            completed++;
            if (completed % 50 === 0) {
                console.log(`还原进度: ${completed}/${total}`);
            }
        }

        await connection.query('SET FOREIGN_KEY_CHECKS = 1');

        await db.query(
            `INSERT INTO system_logs (log_type, log_level, message, user_id, is_public, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            ['database', 'warning', `数据库还原成功，还原文件: ${safeFilename}`, user.id, true, new Date(), new Date()]
        );

        console.log(`还原成功: ${safeFilename}`);

        res.json({
            success: true,
            message: '还原成功',
            filename: safeFilename,
            restoredAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('还原错误:', error);
        
        if (user && user.id) {
            await db.query(
                `INSERT INTO system_logs (log_type, log_level, message, user_id, is_public, created_at, updated_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                ['database', 'error', `数据库还原失败: ${error.message}`, user.id, true, new Date(), new Date()]
            ).catch(logError => console.error('写入日志失败:', logError));
        }

        res.status(500).json({ error: '还原失败', message: error.message });
    } finally {
        if (connection) {
            try {
                await connection.end();
            } catch (e) {
            }
        }
    }
});

router.get('/stats', authMiddleware, async (req, res) => {
    try {
        if (!fs.existsSync(BACKUP_DIR)) {
            return res.json({
                totalBackups: 0,
                totalSize: 0,
                latestBackup: null
            });
        }

        const files = fs.readdirSync(BACKUP_DIR);
        const sqlFiles = files.filter(f => f.endsWith('.sql'));
        
        let totalSize = 0;
        let latestDate = null;

        for (const file of sqlFiles) {
            const filepath = path.join(BACKUP_DIR, file);
            const stats = fs.statSync(filepath);
            totalSize += stats.size;
            if (!latestDate || stats.birthtime > latestDate) {
                latestDate = stats.birthtime;
            }
        }

        res.json({
            totalBackups: sqlFiles.length,
            totalSize,
            totalSizeText: formatFileSize(totalSize),
            latestBackup: latestDate ? new Date(latestDate).toISOString() : null
        });
    } catch (error) {
        console.error('获取备份统计错误:', error);
        res.status(500).json({ error: '获取备份统计失败', message: error.message });
    }
});

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = router;
