const express = require('express');
const fs = require('fs').promises;
const path = require('path');

const router = express.Router();

// 获取版本文件列表
router.get('/', async (req, res) => {
    try {
        const versionDir = path.join(__dirname, '..', 'version');
        
        // 检查version目录是否存在
        try {
            await fs.access(versionDir);
        } catch (error) {
            console.log('版本目录不存在，返回空列表');
            return res.json([]);
        }

        // 读取目录内容
        const files = await fs.readdir(versionDir);
        
        // 过滤出rar文件
        const rarFiles = files.filter(file => file.toLowerCase().endsWith('.rar'));
        
        // 获取文件信息
        const versions = [];
        
        for (const file of rarFiles) {
            const filePath = path.join(versionDir, file);
            const stats = await fs.stat(filePath);
            
            // 解析版本信息
            const versionInfo = parseVersionFromFilename(file);
            
            versions.push({
                name: file,
                version: versionInfo.version,
                build: versionInfo.build,
                date: versionInfo.date,
                size: formatFileSize(stats.size),
                sizeBytes: stats.size,
                downloadUrl: `/version/${file}`,
                mtime: stats.mtime
            });
        }

        // 按修改时间倒序排列（最新的在前）
        versions.sort((a, b) => new Date(b.mtime) - new Date(a.mtime));

        res.json(versions);
        
    } catch (error) {
        console.error('获取版本列表失败:', error);
        res.status(500).json({ 
            error: '获取版本列表失败',
            message: error.message 
        });
    }
});

// 解析文件名获取版本信息
function parseVersionFromFilename(filename) {
    // 移除文件扩展名
    const nameWithoutExt = filename.replace(/\.rar$/i, '');
    
    // 尝试不同的文件名模式
    let version = '未知版本';
    let build = 'Build 未知';
    let date = '未知日期';
    
    // 模式1: 维修工单系统_v1.0.0_build2024.01.rar
    let match = nameWithoutExt.match(/维修工单系统[_\s]*v(\d+\.\d+\.\d+)[_\s]*build(\d{4}\.\d{2})/i);
    if (match) {
        version = `v${match[1]}`;
        build = `Build ${match[2]}`;
        
        // 从build信息中提取日期
        const buildDate = match[2];
        if (buildDate.length === 7) { // YYYY.MM格式
            const year = buildDate.substring(0, 4);
            const month = buildDate.substring(5, 7);
            date = `${year}年${parseInt(month)}月`;
        }
        return { version, build, date };
    }
    
    // 模式2: 包含日期信息 维修工单系统202601012147优化工作台历.rar
    match = nameWithoutExt.match(/维修工单系统(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/);
    if (match) {
        const year = match[1];
        const month = match[2];
        const day = match[3];
        const hour = match[4];
        const minute = match[5];
        
        version = 'v1.0.0'; // 默认版本
        build = `Build ${year}.${month}`;
        date = `${year}年${parseInt(month)}月${parseInt(day)}日`;
        return { version, build, date };
    }
    
    // 模式3: 包含日期和描述 维修工单系统202601012147优化工作台历.rar
    match = nameWithoutExt.match(/维修工单系统(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(.+)/);
    if (match) {
        const year = match[1];
        const month = match[2];
        const day = match[3];
        const hour = match[4];
        const minute = match[5];
        const description = match[6];
        
        version = 'v1.0.0'; // 默认版本
        build = `Build ${year}.${month}`;
        date = `${year}年${parseInt(month)}月${parseInt(day)}日`;
        return { version, build, date };
    }
    
    // 模式4: 其他模式，提取任何类似版本号的信息
    match = nameWithoutExt.match(/v(\d+\.\d+\.\d+)/i);
    if (match) {
        version = `v${match[1]}`;
    }
    
    match = nameWithoutExt.match(/build(\d{4}\.\d{2})/i);
    if (match) {
        build = `Build ${match[1]}`;
        
        const buildDate = match[1];
        if (buildDate.length === 7) {
            const year = buildDate.substring(0, 4);
            const month = buildDate.substring(5, 7);
            date = `${year}年${parseInt(month)}月`;
        }
    }
    
    return { version, build, date };
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

module.exports = router;