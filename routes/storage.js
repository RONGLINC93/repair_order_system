const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// 生成唯一文件名/文件夹名的辅助函数
function generateUniqueFilename(directory, originalFilename) {
    const ext = path.extname(originalFilename);
    const name = path.basename(originalFilename, ext);
    let counter = 1;
    let newFilename = `${name}_副本${ext}`;
    
    // 检查文件/文件夹是否存在，如果存在则增加数字
    while (fs.existsSync(path.join(directory, newFilename))) {
        newFilename = `${name}_副本${counter}${ext}`;
        counter++;
    }
    
    return newFilename;
}

// 配置文件上传
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // 在destination函数中，req.body可能还没有被完全解析
        // 所以我们需要从req中获取directory参数的其他方式
        let directory = '';
        
        // 尝试从req.body获取
        if (req.body && req.body.directory) {
            directory = req.body.directory;
        }
        // 尝试从req.query获取（作为备用方案）
        else if (req.query && req.query.directory) {
            directory = req.query.directory;
        }
        
        const isPublic = req.body && req.body.storageType === 'public';
        const userId = req.user.id;
        const basePath = isPublic 
            ? path.join(__dirname, '..', 'public', 'uploads', 'box', 'all')
            : path.join(__dirname, '..', 'public', 'uploads', 'box', userId.toString());
        const uploadPath = path.join(basePath, directory);
        
        // 确保上传目录存在
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        
        // 添加调试信息
        console.log('上传目录:', directory);
        console.log('完整上传路径:', uploadPath);
        
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        // 如果是覆盖操作，使用要覆盖的文件名，否则使用原始文件名
        let filename = req.body.overwrite === 'true' && req.body.filename 
            ? req.body.filename 
            : file.originalname;
        
        // 确保文件名使用UTF-8编码，防止中文乱码
        // 将文件名转换为Buffer再转回UTF-8字符串
        if (typeof filename === 'string') {
            try {
                // 尝试解码可能被错误编码的文件名
                filename = Buffer.from(filename, 'latin1').toString('utf8');
            } catch (error) {
                // 如果解码失败，使用原始文件名
                console.warn('文件名解码失败，使用原始文件名:', filename);
            }
        }
        
        cb(null, filename);
    }
});

const fileUpload = multer({
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB限制
    }
});

// 上传文件
router.post('/upload', authMiddleware, fileUpload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: '请选择要上传的文件' });
        }
        
        // 覆盖逻辑已经在multer的filename配置中处理
        
        const isPublic = req.body.storageType === 'public';
        const userId = req.user.id;
        const directory = req.body.directory || '';
        const relativePath = directory ? `${directory}/${req.file.filename}` : req.file.filename;
        const fileUrl = isPublic 
            ? `/uploads/box/all/${relativePath}`
            : `/uploads/box/${userId}/${relativePath}`;
        
        res.json({
            success: true,
            message: '文件上传成功',
            file: {
                filename: req.file.filename,
                path: fileUrl,
                size: req.file.size,
                uploadTime: new Date().toISOString(),
                storageType: isPublic ? 'public' : 'private'
            }
        });
    } catch (error) {
        console.error('文件上传错误:', error.message || error.toString());
        if (error.stack) console.error('错误堆栈:', error.stack.substring(0, 500));
        res.status(500).json({ error: '文件上传失败: ' + error.message });
    }
});

// 获取文件列表
router.get('/files', authMiddleware, (req, res) => {
    try {
        const storageType = req.query.storageType || 'private';
        const userId = req.user.id;
        const directory = req.query.directory || '';
        
        // 构建基础路径
        const basePath = storageType === 'public'
            ? path.join(__dirname, '..', 'public', 'uploads', 'box', 'all')
            : path.join(__dirname, '..', 'public', 'uploads', 'box', userId.toString());
        
        // 构建完整路径
        const filesPath = path.join(basePath, directory);

        // 确保目录存在
        if (!fs.existsSync(filesPath)) {
            fs.mkdirSync(filesPath, { recursive: true });
        }

        // 读取目录下的文件和文件夹
        fs.readdir(filesPath, { withFileTypes: true }, (err, entries) => {
            if (err) {
                console.error('读取文件列表错误:', err.message || err.toString());
                if (err.stack) console.error('错误堆栈:', err.stack.substring(0, 500));
                return res.status(500).json({ error: '读取文件列表失败' });
            }

            // 分离文件和文件夹
            const fileList = [];
            const folderList = [];

            entries.forEach(entry => {
                if (entry.isFile()) {
                    // 处理文件
                    const filePath = path.join(filesPath, entry.name);
                    const stats = fs.statSync(filePath);
                    
                    // 构建相对路径
                    const relativePath = directory ? `${directory}/${entry.name}` : entry.name;
                    
                    fileList.push({
                        filename: entry.name,
                        path: storageType === 'public'
                            ? `/uploads/box/all/${relativePath}`
                            : `/uploads/box/${userId}/${relativePath}`,
                        size: stats.size,
                        uploadTime: stats.birthtime,
                        storageType: storageType,
                        type: 'file'
                    });
                } else if (entry.isDirectory()) {
                    // 处理文件夹
                    const folderPath = path.join(filesPath, entry.name);
                    const stats = fs.statSync(folderPath);
                    
                    // 构建相对路径
                    const relativePath = directory ? `${directory}/${entry.name}` : entry.name;
                    
                    folderList.push({
                        filename: entry.name,
                        path: storageType === 'public'
                            ? `/uploads/box/all/${relativePath}`
                            : `/uploads/box/${userId}/${relativePath}`,
                        createTime: stats.birthtime,
                        storageType: storageType,
                        type: 'folder'
                    });
                }
            });

            res.json({
                success: true,
                files: fileList,
                folders: folderList,
                storageType: storageType,
                currentDirectory: directory
            });
        });
    } catch (error) {
        console.error('获取文件列表错误:', error.message || error.toString());
        if (error.stack) console.error('错误堆栈:', error.stack.substring(0, 500));
        res.status(500).json({ error: '获取文件列表失败' });
    }
});

// 下载文件
router.get('/download/:filename', authMiddleware, (req, res) => {
    try {
        const { filename } = req.params;
        const storageType = req.query.storageType || 'private';
        const userId = req.user.id;
        const directory = req.query.directory || '';
        
        // 解码URL编码的文件名
        const decodedFilename = decodeURIComponent(filename);
        
        console.log('下载请求:', {
            originalFilename: filename,
            decodedFilename: decodedFilename,
            storageType: storageType,
            userId: userId,
            directory: directory
        });
        
        // 构建基础路径
        const basePath = storageType === 'public'
            ? path.join(__dirname, '..', 'public', 'uploads', 'box', 'all')
            : path.join(__dirname, '..', 'public', 'uploads', 'box', userId.toString());
        
        // 构建完整文件路径
        const filePath = path.join(basePath, directory, decodedFilename);

        console.log('完整文件路径:', filePath);

        // 检查文件是否存在
        if (!fs.existsSync(filePath)) {
            console.log('文件不存在:', filePath);
            return res.status(404).json({ error: '文件不存在' });
        }

        // 获取文件统计信息
        const stats = fs.statSync(filePath);
        console.log('文件信息:', {
            size: stats.size,
            isFile: stats.isFile(),
            lastModified: stats.mtime
        });

        // 设置下载响应头
        // 使用RFC 5987标准格式编码文件名，确保中文文件名正确显示
        const encodedFilenameForHeader = encodeURIComponent(decodedFilename);
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedFilenameForHeader}`);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Length', stats.size);
        
        // 发送文件
        const fileStream = fs.createReadStream(filePath);
        
        // 处理流错误
        fileStream.on('error', (streamError) => {
            console.error('文件流错误:', streamError);
            if (!res.headersSent) {
                res.status(500).json({ error: '文件读取失败' });
            }
        });
        
        fileStream.on('end', () => {
            console.log('文件下载完成:', decodedFilename);
        });
        
        fileStream.pipe(res);
        
    } catch (error) {
        console.error('下载文件错误:', error.message || error.toString());
        if (error.stack) console.error('错误堆栈:', error.stack.substring(0, 500));
        if (!res.headersSent) {
            res.status(500).json({ error: '下载文件失败: ' + error.message });
        }
    }
});

// 下载文件夹（ZIP压缩）
router.get('/download-folder/:foldername', authMiddleware, (req, res) => {
    try {
        const { foldername } = req.params;
        const storageType = req.query.storageType || 'private';
        const userId = req.user.id;
        const directory = req.query.directory || '';
        
        // 解码URL编码的文件夹名
        const decodedFoldername = decodeURIComponent(foldername);
        
        // 构建基础路径
        const basePath = storageType === 'public'
            ? path.join(__dirname, '..', 'public', 'uploads', 'box', 'all')
            : path.join(__dirname, '..', 'public', 'uploads', 'box', userId.toString());
        
        // 构建完整文件夹路径
        const folderPath = path.join(basePath, directory, decodedFoldername);
        
        // 检查文件夹是否存在
        if (!fs.existsSync(folderPath)) {
            return res.status(404).json({ error: '文件夹不存在' });
        }
        
        // 检查是否是文件夹
        const stats = fs.statSync(folderPath);
        if (!stats.isDirectory()) {
            return res.status(400).json({ error: '不是文件夹' });
        }
        
        // 设置响应头
        const zipFilename = `${decodedFoldername}.zip`;
        const encodedZipFilename = encodeURIComponent(zipFilename);
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedZipFilename}`);
        res.setHeader('Content-Type', 'application/zip');
        
        // 创建ZIP压缩流
        const archive = archiver('zip', {
            zlib: { level: 9 } // 最高压缩级别
        });
        
        // 当压缩完成时结束响应
        archive.on('end', () => {
            console.log(`文件夹 ${decodedFoldername} 压缩完成，总大小: ${archive.pointer()} bytes`);
        });
        
        // 处理压缩错误
        archive.on('error', (err) => {
            console.error('压缩错误:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: '压缩文件夹失败: ' + err.message });
            }
        });
        
        // 将压缩流连接到响应
        archive.pipe(res);
        
        // 添加文件夹到压缩包（包括所有子文件和子文件夹）
        archive.directory(folderPath, decodedFoldername);
        
        // 完成压缩
        archive.finalize();
        
    } catch (error) {
        console.error('下载文件夹错误:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: '下载文件夹失败: ' + error.message });
        }
    }
});

// 删除文件
router.delete('/files/:filename', authMiddleware, (req, res) => {
    try {
        const { filename } = req.params;
        const storageType = req.query.storageType || 'private';
        const userId = req.user.id;
        const directory = req.query.directory || '';
        
        // 构建基础路径
        const basePath = storageType === 'public'
            ? path.join(__dirname, '..', 'public', 'uploads', 'box', 'all')
            : path.join(__dirname, '..', 'public', 'uploads', 'box', userId.toString());
        
        // 构建完整目录路径
        const filesDir = path.join(basePath, directory);

        // 检查目录是否存在
        if (!fs.existsSync(filesDir)) {
            return res.status(404).json({ error: '文件不存在' });
        }

        // 构建完整文件路径
        const filePath = path.join(filesDir, filename);

        // 检查文件是否存在
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: '文件不存在' });
        }

        // 删除文件
        fs.unlinkSync(filePath);

        res.json({ success: true, message: '文件删除成功' });
    } catch (error) {
        console.error('删除文件错误:', error.message || error.toString());
        if (error.stack) console.error('错误堆栈:', error.stack.substring(0, 500));
        res.status(500).json({ error: '删除文件失败' });
    }
});

// 创建文件夹
router.post('/folders', authMiddleware, (req, res) => {
    try {
        const { folderName, storageType, directory = '' } = req.body;
        const userId = req.user.id;
        
        if (!folderName) {
            return res.status(400).json({ error: '文件夹名称不能为空' });
        }
        
        // 检查文件夹名称是否包含非法字符
        if (/[<>"/\|?*]/.test(folderName)) {
            return res.status(400).json({ error: '文件夹名称包含非法字符' });
        }
        
        // 构建基础路径
        const basePath = storageType === 'public'
            ? path.join(__dirname, '..', 'public', 'uploads', 'box', 'all')
            : path.join(__dirname, '..', 'public', 'uploads', 'box', userId.toString());
            
        // 构建完整父目录路径
        const filesDir = path.join(basePath, directory);
            
        // 确保上传目录存在
        if (!fs.existsSync(filesDir)) {
            fs.mkdirSync(filesDir, { recursive: true });
        }
        
        // 构建新文件夹路径
        const folderPath = path.join(filesDir, folderName);
        
        // 检查文件夹是否已存在
        if (fs.existsSync(folderPath)) {
            return res.status(400).json({ error: '文件夹已存在' });
        }
        
        // 创建文件夹
        fs.mkdirSync(folderPath);
        
        const stats = fs.statSync(folderPath);
        
        // 构建相对路径
        const relativePath = directory ? `${directory}/${folderName}` : folderName;
        
        res.json({
            success: true,
            message: '文件夹创建成功',
            folder: {
                filename: folderName,
                path: storageType === 'public'
                    ? `/uploads/box/all/${relativePath}`
                    : `/uploads/box/${userId}/${relativePath}`,
                createTime: stats.birthtime,
                storageType: storageType,
                type: 'folder'
            }
        });
    } catch (error) {
        console.error('创建文件夹错误:', error.message || error.toString());
        if (error.stack) console.error('错误堆栈:', error.stack.substring(0, 500));
        res.status(500).json({ error: '创建文件夹失败' });
    }
});

// 传统的递归删除文件夹方法
function deleteFolderRecursive(folderPath) {
    if (fs.existsSync(folderPath)) {
        fs.readdirSync(folderPath).forEach(function (file) {
            const curPath = path.join(folderPath, file);
            if (fs.lstatSync(curPath).isDirectory()) {
                // 递归删除子文件夹
                deleteFolderRecursive(curPath);
            } else {
                // 删除文件
                fs.unlinkSync(curPath);
            }
        });
        // 删除空文件夹
        fs.rmdirSync(folderPath);
        return true;
    }
    return false;
}

// 删除文件夹
router.delete('/folders/:folderName', authMiddleware, (req, res) => {
    try {
        const { folderName } = req.params;
        const storageType = req.query.storageType || 'private';
        const directory = req.query.directory || '';
        const userId = req.user.id;
        
        // 构建基础路径
        const basePath = storageType === 'public'
            ? path.join(__dirname, '..', 'public', 'uploads', 'box', 'all')
            : path.join(__dirname, '..', 'public', 'uploads', 'box', userId.toString());
        
        // 构建完整父目录路径
        const filesDir = path.join(basePath, directory);

        // 检查目录是否存在
        if (!fs.existsSync(filesDir)) {
            return res.status(404).json({ error: '文件夹不存在' });
        }

        const folderPath = path.join(filesDir, folderName);

        // 检查文件夹是否存在且是目录
        let isDirectory = false;
        try {
            if (fs.existsSync(folderPath)) {
                const stats = fs.lstatSync(folderPath);
                isDirectory = stats.isDirectory();
            }
        } catch (lstatError) {
            console.error('检查文件夹类型错误:', lstatError);
            // 如果lstat失败，可能是权限问题或文件已被删除
            return res.status(500).json({ error: '无法访问文件夹信息' });
        }

        if (!fs.existsSync(folderPath) || !isDirectory) {
            return res.status(404).json({ error: '文件夹不存在' });
        }

        // 删除文件夹及其内容，优先使用传统递归方法
        try {
            deleteFolderRecursive(folderPath);
            
            // 验证删除是否成功
            if (fs.existsSync(folderPath)) {
                // 如果传统方法失败，尝试使用fs.rmSync作为备用
                fs.rmSync(folderPath, { recursive: true, force: true });
                
                // 再次验证
                if (fs.existsSync(folderPath)) {
                    return res.status(500).json({ error: '删除文件夹失败' });
                }
            }
        } catch (deleteError) {
            console.error('删除文件夹错误:', deleteError);
            // 根据错误类型返回不同的错误信息
            if (deleteError.code === 'ENOENT') {
                return res.status(404).json({ error: '文件夹不存在' });
            } else if (deleteError.code === 'EACCES') {
                return res.status(403).json({ error: '没有权限删除文件夹' });
            }
            return res.status(500).json({ error: '删除文件夹失败' });
        }

        res.json({ success: true, message: '文件夹删除成功' });
    } catch (error) {
        console.error('删除文件夹错误:', error.message || error.toString());
        if (error.stack) console.error('错误堆栈:', error.stack.substring(0, 500));
        res.status(500).json({ error: '删除文件夹失败' });
    }
});

// 递归获取所有文件夹的辅助函数
function getAllFolders(basePath, relativePath = '', storageType = 'private', userId = null) {
    const folderList = [];
    
    try {
        const currentPath = path.join(basePath, relativePath);
        
        if (!fs.existsSync(currentPath)) {
            return folderList;
        }
        
        const entries = fs.readdirSync(currentPath, { withFileTypes: true });
        
        entries.forEach(entry => {
            if (entry.isDirectory()) {
                const folderRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
                const folderFullPath = path.join(currentPath, entry.name);
                const stats = fs.statSync(folderFullPath);
                
                folderList.push({
                    filename: entry.name,
                    relativePath: folderRelativePath,
                    path: storageType === 'public'
                        ? `/uploads/box/all/${folderRelativePath}`
                        : `/uploads/box/${userId}/${folderRelativePath}`,
                    createTime: stats.birthtime,
                    storageType: storageType,
                    type: 'folder',
                    level: relativePath ? relativePath.split('/').length : 0
                });
                
                // 递归获取子文件夹
                const subFolders = getAllFolders(basePath, folderRelativePath, storageType, userId);
                folderList.push(...subFolders);
            }
        });
    } catch (error) {
        console.error('获取文件夹错误:', error.message || error.toString());
        if (error.stack) {
            console.error('错误堆栈:', error.stack.substring(0, 500)); // 只输出前500个字符
        }
    }
    
    return folderList;
}

// 获取文件夹列表（用于移动和复制功能）
router.get('/folders', authMiddleware, (req, res) => {
    try {
        const storageType = req.query.storageType || 'private';
        const userId = req.user.id;
        
        // 构建基础路径
        const basePath = storageType === 'public'
            ? path.join(__dirname, '..', 'public', 'uploads', 'box', 'all')
            : path.join(__dirname, '..', 'public', 'uploads', 'box', userId.toString());
        
        // 确保基础目录存在
        if (!fs.existsSync(basePath)) {
            fs.mkdirSync(basePath, { recursive: true });
        }

        // 获取所有文件夹
        const allFolders = getAllFolders(basePath, '', storageType, userId);

        res.json({
            success: true,
            folders: allFolders,
            storageType: storageType,
            currentDirectory: ''
        });
    } catch (error) {
        console.error('获取文件夹列表错误:', error.message || error.toString());
        if (error.stack) console.error('错误堆栈:', error.stack.substring(0, 500));
        res.status(500).json({ error: '获取文件夹列表失败' });
    }
});

// 移动文件或文件夹
router.post('/move', authMiddleware, async (req, res) => {
    try {
        let { filename, sourcePath, targetPath, sourceStorageType, targetStorageType, overwrite = false, createCopy = false, itemType = 'file' } = req.body;
        const userId = req.user.id;
        
        if (!filename) {
            return res.status(400).json({ error: '文件名不能为空' });
        }
        
        // 向后兼容：如果没有指定sourceStorageType和targetStorageType，使用storageType
        const actualSourceStorageType = sourceStorageType || req.body.storageType || 'private';
        const actualTargetStorageType = targetStorageType || req.body.storageType || actualSourceStorageType;
        
        // 构建源基础路径
        const sourceBasePath = actualSourceStorageType === 'public'
            ? path.join(__dirname, '..', 'public', 'uploads', 'box', 'all')
            : path.join(__dirname, '..', 'public', 'uploads', 'box', userId.toString());
        
        // 构建目标基础路径
        const targetBasePath = actualTargetStorageType === 'public'
            ? path.join(__dirname, '..', 'public', 'uploads', 'box', 'all')
            : path.join(__dirname, '..', 'public', 'uploads', 'box', userId.toString());
        
        // 构建源完整路径
        const sourcePathFull = path.join(sourceBasePath, sourcePath, filename);
        
        // 构建目标文件夹完整路径
        const targetDirPath = path.join(targetBasePath, targetPath);
        
        // 检查源是否存在
        if (!fs.existsSync(sourcePathFull)) {
            return res.status(404).json({ error: `源${itemType === 'folder' ? '文件夹' : '文件'}不存在` });
        }
        
        // 检查实际源类型并修正itemType
        const sourceStats = fs.statSync(sourcePathFull);
        if (sourceStats.isDirectory() && itemType === 'file') {
            console.warn('检测到类型不匹配：源是目录但itemType为file，自动修正为folder', { source: sourcePathFull, originalItemType: itemType });
            itemType = 'folder';
        } else if (sourceStats.isFile() && itemType === 'folder') {
            console.warn('检测到类型不匹配：源是文件但itemType为folder，自动修正为file', { source: sourcePathFull, originalItemType: itemType });
            itemType = 'file';
        }
        
        // 确保目标目录存在
        if (!fs.existsSync(targetDirPath)) {
            fs.mkdirSync(targetDirPath, { recursive: true });
        }
        
        // 构建目标完整路径
        let targetPathFull = path.join(targetDirPath, filename);
        let actualFilename = filename;
        
        // 检查目标位置是否已存在同名项目
        if (fs.existsSync(targetPathFull)) {
            if (createCopy) {
                // 创建副本，生成唯一名称
                actualFilename = generateUniqueFilename(targetDirPath, filename);
                targetPathFull = path.join(targetDirPath, actualFilename);
            } else if (!overwrite) {
                return res.status(400).json({ 
                    error: `目标位置已存在同名${itemType === 'folder' ? '文件夹' : '文件'}`,
                    fileExists: true 
                });
            } else {
                // 如果允许覆盖，先删除目标
                if (itemType === 'folder') {
                    deleteFolderRecursive(targetPathFull);
                } else {
                    fs.unlinkSync(targetPathFull);
                }
            }
        }
        
        // 执行移动或复制操作
        if (itemType === 'folder') {
            // 处理文件夹 - 使用改进的稳定方法
            try {
                console.log('开始文件夹操作:', {
                    action: createCopy ? '复制' : '移动',
                    source: sourcePathFull,
                    target: targetPathFull,
                    sameStorage: sourceBasePath === targetBasePath
                });
                
                if (sourceBasePath === targetBasePath && !createCopy) {
                    // 相同存储类型，直接移动文件夹
                    try {
                        // 方法1：尝试直接重命名
                        fs.renameSync(sourcePathFull, targetPathFull);
                        console.log('文件夹直接重命名成功');
                    } catch (renameError) {
                        console.warn('直接重命名失败，尝试复制删除方法:', renameError.message);
                        
                        // 方法2：复制后删除（作为重命名失败的备用）
                        await copyDirectoryImproved(sourcePathFull, targetPathFull);
                        // 验证复制成功后再删除源文件夹
                        if (fs.existsSync(targetPathFull) && fs.existsSync(sourcePathFull)) {
                            deleteFolderRecursive(sourcePathFull);
                            // 验证删除是否成功
                            if (fs.existsSync(sourcePathFull)) {
                                // 如果传统方法失败，尝试使用fs.rmSync作为备用
                                try {
                                    fs.rmSync(sourcePathFull, { recursive: true, force: true });
                                } catch (rmError) {
                                    console.warn('fs.rmSync删除失败，但移动操作已部分完成:', rmError.message);
                                }
                            }
                        }
                        console.log('文件夹复制删除移动成功');
                    }
                } else {
                    // 不同存储类型或创建副本，需要复制整个文件夹
                    await copyDirectoryImproved(sourcePathFull, targetPathFull);
                    if (!createCopy) {
                        // 只有在移动操作时才删除源文件夹
                        deleteFolderRecursive(sourcePathFull);
                        // 验证删除是否成功
                        if (fs.existsSync(sourcePathFull)) {
                            // 如果传统方法失败，尝试使用fs.rmSync作为备用
                            fs.rmSync(sourcePathFull, { recursive: true, force: true });
                        }
                    }
                    console.log('文件夹复制操作成功');
                }
                
                // 验证最终结果
                if (!fs.existsSync(targetPathFull)) {
                    throw new Error('文件夹操作失败：目标文件夹创建失败');
                }
                
            } catch (folderError) {
                console.error('文件夹操作失败:', folderError);
                
                // 提供友好的错误信息
                if (folderError.code === 'EPERM' || folderError.code === 'EACCES') {
                    throw new Error(`文件夹${createCopy ? '复制' : '移动'}失败：文件夹可能被其他程序占用或权限不足。\n请关闭可能使用该文件夹的程序后重试。\n\n源路径: ${sourcePathFull}\n目标路径: ${targetPathFull}`);
                }
                
                throw new Error(`文件夹${createCopy ? '复制' : '移动'}失败: ${folderError.message}`);
            }
        } else {
            // 处理文件
            if (sourceBasePath === targetBasePath && !createCopy) {
                // 相同存储类型，直接移动文件
                fs.renameSync(sourcePathFull, targetPathFull);
            } else {
                // 不同存储类型或创建副本，需要先复制再删除源文件
                fs.copyFileSync(sourcePathFull, targetPathFull);
                if (!createCopy) {
                    fs.unlinkSync(sourcePathFull);
                }
            }
        }
        
        const location = actualTargetStorageType !== actualSourceStorageType ? `到${actualTargetStorageType === 'public' ? '公共' : '私人'}网盘` : '';
        const actionText = itemType === 'folder' ? '文件夹' : '文件';
        
        res.json({
            success: true,
            message: (createCopy ? `${actionText}副本创建` : `${actionText}移动`) + `${location}成功`,
            item: {
                filename: actualFilename,
                sourcePath: sourcePath,
                targetPath: targetPath,
                sourceStorageType: actualSourceStorageType,
                targetStorageType: actualTargetStorageType,
                itemType: itemType,
                overwritten: overwrite,
                createCopy: createCopy
            }
        });
    } catch (error) {
        console.error('移动错误:', error.message || error.toString());
        if (error.stack) console.error('错误堆栈:', error.stack.substring(0, 500));
        res.status(500).json({ error: '移动失败: ' + error.message });
    }
});

// 改进的文件夹复制函数 - 参考删除文件夹的稳定实现
async function copyDirectoryImproved(src, dest) {
    const tempDir = path.join(path.dirname(dest), '.temp_copy_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9));
    
    try {
        console.log('开始改进的文件夹复制:', { source: src, target: dest, tempDir });
        
        // 验证源文件夹存在
        if (!fs.existsSync(src)) {
            throw new Error('源文件夹不存在');
        }
        
        const sourceStats = fs.statSync(src);
        if (!sourceStats.isDirectory()) {
            throw new Error('源路径不是文件夹');
        }
        
        // 如果目标已存在且需要覆盖，先删除
        if (fs.existsSync(dest)) {
            console.log('目标文件夹已存在，准备删除:', dest);
            try {
                deleteFolderRecursive(dest);
                // 验证删除是否成功
                if (fs.existsSync(dest)) {
                    fs.rmSync(dest, { recursive: true, force: true });
                }
            } catch (deleteError) {
                console.warn('删除目标文件夹失败，尝试强制删除:', deleteError.message);
                try {
                    // 使用更强制的方式删除
                    fs.rmSync(dest, { recursive: true, force: true });
                } catch (forceDeleteError) {
                    console.error('强制删除目标文件夹失败:', forceDeleteError.message);
                    // 不抛出错误，继续尝试复制
                }
            }
        }
        
        // 方法1：直接复制到目标位置
        try {
            console.log('尝试直接复制到目标位置');
            await performDirectoryCopy(src, dest);
            
            // 验证复制结果
            if (fs.existsSync(dest) && fs.statSync(dest).isDirectory()) {
                const destFiles = fs.readdirSync(dest);
                const sourceFiles = fs.readdirSync(src);
                if (destFiles.length === sourceFiles.length) {
                    console.log('直接复制验证成功');
                    return;
                } else {
                    console.warn('直接复制后文件数量不匹配，源:', sourceFiles.length, '目标:', destFiles.length);
                }
            }
        } catch (directError) {
            console.warn('直接复制失败，尝试临时目录方法:', directError.message);
        }
        
        // 方法2：使用临时目录作为中转（更稳定的方法）
        try {
            console.log('使用临时目录方法进行复制');
            
            // 清理可能存在的临时目录
            if (fs.existsSync(tempDir)) {
                deleteFolderRecursive(tempDir);
                if (fs.existsSync(tempDir)) {
                    fs.rmSync(tempDir, { recursive: true, force: true });
                }
            }
            
            // 先复制到临时目录
            await performDirectoryCopy(src, tempDir);
            console.log('复制到临时目录成功');
            
            // 验证临时目录复制结果
            if (!fs.existsSync(tempDir)) {
                throw new Error('复制到临时目录失败');
            }
            
            // 确保目标父目录存在
            const destParentDir = path.dirname(dest);
            if (!fs.existsSync(destParentDir)) {
                fs.mkdirSync(destParentDir, { recursive: true });
            }
            
            // 从临时目录移动到最终目标
            fs.renameSync(tempDir, dest);
            console.log('从临时目录移动到目标成功');
            
        } catch (tempError) {
            console.error('临时目录方法失败:', tempError.message);
            
            // 清理临时目录（如果存在）
            if (fs.existsSync(tempDir)) {
                try {
                    deleteFolderRecursive(tempDir);
                    if (fs.existsSync(tempDir)) {
                        fs.rmSync(tempDir, { recursive: true, force: true });
                    }
                } catch (cleanupError) {
                    console.warn('清理临时目录失败:', cleanupError.message);
                }
            }
            
            throw tempError;
        }
        
        // 最终验证
        if (!fs.existsSync(dest)) {
            throw new Error('文件夹复制失败：目标文件夹未创建');
        }
        
        const destStats = fs.statSync(dest);
        if (!destStats.isDirectory()) {
            throw new Error('文件夹复制失败：目标不是有效目录');
        }
        
        console.log('文件夹复制最终验证成功');
        
    } catch (error) {
        console.error('改进的文件夹复制完全失败:', {
            source: src,
            target: dest,
            error: error.message,
            code: error.code
        });
        
        // 提供友好的错误信息
        if (error.code === 'EPERM' || error.code === 'EACCES') {
            throw new Error(`文件夹复制失败：文件可能被其他程序占用或权限不足。\n请关闭可能使用该文件夹的程序后重试。\n\n源路径: ${src}\n目标路径: ${dest}`);
        }
        
        throw error;
    }
}

// 执行实际的目录复制操作
async function performDirectoryCopy(src, dest) {
    // 确保目标目录存在
    try {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }
    } catch (mkdirError) {
        console.error('创建目标目录失败:', mkdirError.message);
        throw new Error(`创建目标目录失败: ${mkdirError.message}`);
    }
    
    // 获取源目录内容
    let entries;
    try {
        entries = fs.readdirSync(src, { withFileTypes: true });
    } catch (readdirError) {
        console.error('读取源目录内容失败:', readdirError.message);
        throw new Error(`读取源目录内容失败: ${readdirError.message}`);
    }
    
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        
        if (entry.isDirectory()) {
            // 递归复制子目录
            try {
                await performDirectoryCopy(srcPath, destPath);
            } catch (subdirError) {
                console.error(`复制子目录失败: ${srcPath} -> ${destPath}`, subdirError.message);
                throw new Error(`复制子目录失败: ${srcPath} -> ${destPath}`);
            }
        } else {
            // 复制文件 - 使用多种方法确保成功
            try {
                await copyFileWithRetry(srcPath, destPath);
            } catch (fileCopyError) {
                console.error(`复制文件失败: ${srcPath} -> ${destPath}`, fileCopyError.message);
                throw new Error(`复制文件失败: ${srcPath} -> ${destPath}`);
            }
        }
    }
}

// 使用多种方法复制文件，确保成功
async function copyFileWithRetry(src, dest) {
    // 检查源路径是否为文件
    try {
        const sourceStats = fs.statSync(src);
        if (sourceStats.isDirectory()) {
            console.warn(`源路径是目录而不是文件，跳过复制: ${src}`);
            return;
        }
    } catch (statError) {
        console.error('获取源路径状态失败:', statError.message);
        throw new Error(`获取源路径状态失败: ${statError.message}`);
    }
    
    // 确保目标目录存在
    const destDir = path.dirname(dest);
    try {
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }
    } catch (mkdirError) {
        console.error('创建文件目标目录失败:', mkdirError.message);
        throw new Error(`创建文件目标目录失败: ${mkdirError.message}`);
    }
    
    // 方法1：流式复制（对大文件友好）
    try {
        await new Promise((resolve, reject) => {
            const readStream = fs.createReadStream(src);
            const writeStream = fs.createWriteStream(dest);
            
            // 为readStream添加错误处理
            readStream.on('error', (err) => {
                console.error('读取文件流错误:', err.message);
                reject(err);
            });
            
            // 为writeStream添加错误处理
            writeStream.on('error', (err) => {
                console.error('写入文件流错误:', err.message);
                reject(err);
            });
            
            readStream.pipe(writeStream)
                .on('finish', resolve);
        });
        console.log('流式复制成功:', src, '->', dest);
        return;
    } catch (streamError) {
        console.warn('流式复制失败，尝试原生复制:', streamError.message);
    }
    
    // 方法2：原生copyFileSync
    try {
        fs.copyFileSync(src, dest);
        console.log('原生复制成功:', src, '->', dest);
        return;
    } catch (nativeError) {
        console.warn('原生复制失败，尝试读写方式:', nativeError.message);
    }
    
    // 方法3：读写方式（最后备用）
    try {
        const data = fs.readFileSync(src);
        fs.writeFileSync(dest, data);
        console.log('读写复制成功:', src, '->', dest);
    } catch (readWriteError) {
        console.error('所有复制方法都失败:', {
            source: src,
            target: dest,
            error: readWriteError.message,
            code: readWriteError.code
        });
        throw readWriteError;
    }
}

// 移除了copyDirectory函数，直接使用copyDirectoryImproved函数



// 复制文件或文件夹
router.post('/copy', authMiddleware, async (req, res) => {
    try {
        const { filename, sourcePath, targetPath, sourceStorageType, targetStorageType, overwrite = false, createCopy = false, itemType: originalItemType = 'file' } = req.body;
        let itemType = originalItemType; // 创建可变变量
        const userId = req.user.id;
        
        if (!filename) {
            return res.status(400).json({ error: '文件名不能为空' });
        }
        
        // 向后兼容：如果没有指定sourceStorageType和targetStorageType，使用storageType
        const actualSourceStorageType = sourceStorageType || req.body.storageType || 'private';
        const actualTargetStorageType = targetStorageType || req.body.storageType || actualSourceStorageType;
        
        // 构建源基础路径
        const sourceBasePath = actualSourceStorageType === 'public'
            ? path.join(__dirname, '..', 'public', 'uploads', 'box', 'all')
            : path.join(__dirname, '..', 'public', 'uploads', 'box', userId.toString());
        
        // 构建目标基础路径
        const targetBasePath = actualTargetStorageType === 'public'
            ? path.join(__dirname, '..', 'public', 'uploads', 'box', 'all')
            : path.join(__dirname, '..', 'public', 'uploads', 'box', userId.toString());
        
        // 构建源完整路径
        const sourcePathFull = path.join(sourceBasePath, sourcePath, filename);
        
        // 构建目标文件夹完整路径
        const targetDirPath = path.join(targetBasePath, targetPath);
        
        // 检查源是否存在
        if (!fs.existsSync(sourcePathFull)) {
            return res.status(404).json({ error: `源${itemType === 'folder' ? '文件夹' : '文件'}不存在` });
        }
        
        // 检查实际源类型并修正itemType
        const sourceStats = fs.statSync(sourcePathFull);
        if (sourceStats.isDirectory() && itemType === 'file') {
            console.warn('检测到类型不匹配：源是目录但itemType为file，自动修正为folder', { source: sourcePathFull, originalItemType: itemType });
            itemType = 'folder';
        }
        
        // 确保目标目录存在
        if (!fs.existsSync(targetDirPath)) {
            fs.mkdirSync(targetDirPath, { recursive: true });
        }
        
        // 构建目标完整路径
        let targetPathFull = path.join(targetDirPath, filename);
        let actualFilename = filename;
        
        // 检查目标位置是否已存在同名项目
        if (fs.existsSync(targetPathFull)) {
            if (createCopy) {
                // 创建副本，生成唯一名称
                actualFilename = generateUniqueFilename(targetDirPath, filename);
                targetPathFull = path.join(targetDirPath, actualFilename);
            } else if (!overwrite) {
                return res.status(400).json({ 
                    error: `目标位置已存在同名${itemType === 'folder' ? '文件夹' : '文件'}`,
                    fileExists: true 
                });
            } else {
                // 如果允许覆盖，先删除目标
                if (itemType === 'folder') {
                    deleteFolderRecursive(targetPathFull);
                } else {
                    fs.unlinkSync(targetPathFull);
                }
            }
        }
        
        // 执行复制操作
        if (itemType === 'folder') {
            // 对于文件夹复制，改进错误处理和重试机制
            try {
                console.log('开始复制文件夹:', {
                    source: sourcePathFull,
                    target: targetPathFull,
                    itemType: itemType
                });
                
                // 直接使用copyDirectoryImproved函数进行文件夹复制
                await copyDirectoryImproved(sourcePathFull, targetPathFull);
                console.log('文件夹复制成功');
            } catch (copyError) {
                console.error('文件夹复制完全失败:', copyError.message || copyError.toString());
                if (copyError.stack) console.error('错误堆栈:', copyError.stack.substring(0, 500));
                throw copyError;
            }
        } else {
            // 复制文件 - 使用改进的复制逻辑
            try {
                console.log('开始复制文件:', {
                    source: sourcePathFull,
                    target: targetPathFull,
                    itemType: itemType
                });
                
                // 检查源文件是否可访问且确实是文件
                const sourceStats = fs.statSync(sourcePathFull);
                if (sourceStats.isDirectory()) {
                    console.error('错误：尝试将目录当作文件复制', { source: sourcePathFull });
                    throw new Error('无法复制：源路径是目录而不是文件');
                }
                
                // 确保目标目录存在
                const targetDir = path.dirname(targetPathFull);
                if (!fs.existsSync(targetDir)) {
                    fs.mkdirSync(targetDir, { recursive: true });
                }
                
                // 如果目标文件存在，确保目标文件没有被锁定
                if (fs.existsSync(targetPathFull)) {
                    try {
                        const targetStats = fs.statSync(targetPathFull);
                        // 尝试检查目标文件是否可写
                        fs.accessSync(targetPathFull, fs.constants.W_OK);
                    } catch (accessError) {
                        // 如果目标文件不可写，可能是被占用或权限问题
                        console.error('目标文件访问错误:', targetPathFull, accessError);
                        throw new Error(`目标文件被占用或权限不足: ${targetPathFull}`);
                    }
                }
                
                // 方法1：尝试流式复制（对大文件更友好）
                try {
                    await new Promise((resolve, reject) => {
                        const readStream = fs.createReadStream(sourcePathFull);
                        const writeStream = fs.createWriteStream(targetPathFull);
                        
                        readStream.pipe(writeStream)
                            .on('finish', () => {
                                console.log('文件流式复制成功');
                                resolve();
                            })
                            .on('error', reject);
                    });
                } catch (streamError) {
                    console.warn('流式复制失败，尝试原生复制:', streamError.message);
                    
                    // 方法2：使用原生copyFileSync
                    try {
                        fs.copyFileSync(sourcePathFull, targetPathFull);
                        console.log('文件原生复制成功');
                    } catch (nativeError) {
                        console.warn('原生复制失败，尝试读写方式:', nativeError.message);
                        
                        // 方法3：读写方式复制（最后备用）
                        const data = fs.readFileSync(sourcePathFull);
                        fs.writeFileSync(targetPathFull, data);
                        console.log('文件读写复制成功');
                    }
                }
                
            } catch (copyError) {
                console.error('文件复制完全失败:', {
                    source: sourcePathFull,
                    target: targetPathFull,
                    error: copyError.message,
                    code: copyError.code
                });
                
                // 如果是权限错误，提供更友好的错误信息
                if (copyError.code === 'EPERM' || copyError.code === 'EACCES') {
                    throw new Error(`复制失败：文件可能被其他程序占用或权限不足。请关闭可能使用该文件的程序后重试。\n源路径: ${sourcePathFull}\n目标路径: ${targetPathFull}`);
                }
                
                throw copyError;
            }
        }
        
        // 获取新项目的信息
        const stats = fs.statSync(targetPathFull);
        const location = actualTargetStorageType !== actualSourceStorageType ? `到${actualTargetStorageType === 'public' ? '公共' : '私人'}网盘` : '';
        const actionText = itemType === 'folder' ? '文件夹' : '文件';
        
        const responseData = {
            success: true,
            message: (createCopy ? `${actionText}副本创建` : `${actionText}复制`) + `${location}成功`,
            item: {
                filename: actualFilename,
                path: actualTargetStorageType === 'public'
                    ? `/uploads/box/all/${targetPath ? `${targetPath}/${actualFilename}` : actualFilename}`
                    : `/uploads/box/${userId}/${targetPath ? `${targetPath}/${actualFilename}` : actualFilename}`,
                storageType: actualTargetStorageType,
                itemType: itemType,
                sourcePath: sourcePath,
                targetPath: targetPath,
                sourceStorageType: actualSourceStorageType,
                targetStorageType: actualTargetStorageType,
                overwritten: overwrite
            }
        };
        
        // 如果是文件，添加文件大小和创建时间信息
        if (itemType === 'file') {
            responseData.item.size = stats.size;
            responseData.item.uploadTime = stats.birthtime;
        }
        
        res.json(responseData);
    } catch (error) {
        console.error('复制错误:', error.message || error.toString());
        if (error.stack) console.error('错误堆栈:', error.stack.substring(0, 500));
        res.status(500).json({ error: '复制失败: ' + error.message });
    }
});

// 重命名文件或文件夹
router.post('/rename', authMiddleware, async (req, res) => {
    try {
        const { oldName, newName, storageType, directory, itemType = 'file' } = req.body;
        const userId = req.user.id;
        
        if (!oldName || !newName) {
            return res.status(400).json({ error: '旧名称和新名称不能为空' });
        }
        
        // 验证新名称
        if (!isValidName(newName)) {
            return res.status(400).json({ error: '新名称包含非法字符' });
        }
        
        // 构建基础路径
        const basePath = storageType === 'public'
            ? path.join(__dirname, '..', 'public', 'uploads', 'box', 'all')
            : path.join(__dirname, '..', 'public', 'uploads', 'box', userId.toString());
        
        // 构建完整的源路径和目标路径
        const sourcePath = path.join(basePath, directory, oldName);
        const targetPath = path.join(basePath, directory, newName);
        
        // 检查源是否存在
        if (!fs.existsSync(sourcePath)) {
            return res.status(404).json({ error: `源${itemType === 'folder' ? '文件夹' : '文件'}不存在` });
        }
        
        // 检查源类型是否匹配
        const sourceStats = fs.statSync(sourcePath);
        const isSourceFolder = sourceStats.isDirectory();
        if (isSourceFolder && itemType !== 'folder') {
            return res.status(400).json({ error: '源是文件夹但类型参数为file' });
        }
        if (!isSourceFolder && itemType !== 'file') {
            return res.status(400).json({ error: '源是文件但类型参数为folder' });
        }
        
        // 检查目标是否已存在
        if (fs.existsSync(targetPath)) {
            const error = new Error(`目标${isSourceFolder ? '文件夹' : '文件'} "${newName}" 已存在`);
            error.name = 'FileExistsError';
            error.fileExists = true;
            throw error;
        }
        
        // 执行重命名操作
        try {
            fs.renameSync(sourcePath, targetPath);
            console.log('重命名成功:', sourcePath, '->', targetPath);
        } catch (renameError) {
            console.error('重命名失败:', renameError);
            throw new Error(`重命名失败: ${renameError.message}`);
        }
        
        // 获取新项目的信息
        const newStats = fs.statSync(targetPath);
        const itemText = itemType === 'folder' ? '文件夹' : '文件';
        
        const responseData = {
            success: true,
            message: `${itemText}重命名成功`,
            item: {
                filename: newName,
                path: storageType === 'public'
                    ? `/uploads/box/all/${directory ? `${directory}/${newName}` : newName}`
                    : `/uploads/box/${userId}/${directory ? `${directory}/${newName}` : newName}`,
                storageType: storageType,
                itemType: itemType,
                directory: directory,
                oldName: oldName,
                newName: newName
            }
        };
        
        // 如果是文件，添加文件信息
        if (itemType === 'file') {
            responseData.item.size = newStats.size;
            responseData.item.uploadTime = newStats.birthtime;
            responseData.item.modifyTime = newStats.mtime;
        } else {
            // 如果是文件夹，添加创建时间
            responseData.item.createTime = newStats.birthtime;
        }
        
        res.json(responseData);
        
    } catch (error) {
        console.error('重命名错误:', error.message);
        
        // 如果是文件已存在错误，返回特殊错误信息
        if (error.name === 'FileExistsError' && error.fileExists) {
            return res.status(400).json({ 
                error: error.message,
                fileExists: true 
            });
        }
        
        res.status(500).json({ error: '重命名失败: ' + error.message });
    }
});

// 验证名称是否有效的函数
function isValidName(name) {
    // 检查是否为空
    if (!name || name.trim() === '') {
        return false;
    }
    
    // 检查长度
    if (name.length > 255) {
        return false;
    }
    
    // 检查是否包含非法字符
    const invalidChars = /[<>:"/\\|?*\x00-\x1f]/;
    if (invalidChars.test(name)) {
        return false;
    }
    
    // 检查是否以点开头或结尾
    if (name.startsWith('.') || name.endsWith('.')) {
        return false;
    }
    
    // 检查是否包含保留名称（Windows系统）
    const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
    if (reservedNames.includes(name.toUpperCase())) {
        return false;
    }
    
    return true;
}

module.exports = router;