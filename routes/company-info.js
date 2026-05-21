const express = require('express');
const router = express.Router();
const db = require('../config/database');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
// const sharp = require('sharp'); // 暂时注释掉，使用简单转换

// 配置文件上传
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB限制
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|ico|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('只允许上传图片文件 (JPEG, JPG, PNG, GIF, ICO, WEBP)'));
        }
    }
});

// 获取公司信息
router.get('/', async (req, res) => {
    try {
        const query = 'SELECT * FROM company_info ORDER BY id DESC LIMIT 1';
        const [companyInfo] = await db.query(query);
        
        if (!companyInfo) {
            // 如果没有数据，返回默认值
            return res.json({
                success: true,
                data: {
                    id: null,
                    company_name: '',
                    company_address: '',
                    contact_phone: '',
                    logo_path: null,
                    favicon_path: null
                }
            });
        }
        
        res.json({
            success: true,
            data: companyInfo
        });
    } catch (error) {
        console.error('Error fetching company info:', error);
        res.status(500).json({
            success: false,
            message: '获取公司信息失败'
        });
    }
});

// 更新公司信息
router.put('/', async (req, res) => {
    try {
        const { company_name, company_address, contact_phone } = req.body;
        
        if (!company_name || !company_address || !contact_phone) {
            return res.status(400).json({
                success: false,
                message: '请填写完整的公司信息'
            });
        }
        
        // 检查是否已有数据
        const checkQuery = 'SELECT id FROM company_info ORDER BY id DESC LIMIT 1';
        const [existing] = await db.query(checkQuery);
        
        let query, params;
        
        if (existing) {
            // 更新现有数据
            query = `
                UPDATE company_info 
                SET company_name = ?, company_address = ?, contact_phone = ?, updated_at = ?
                WHERE id = ?
            `;
            params = [company_name, company_address, contact_phone, new Date(), existing.id];
        } else {
            // 插入新数据
            query = `
                INSERT INTO company_info (company_name, company_address, contact_phone, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
            `;
            params = [company_name, company_address, contact_phone, new Date(), new Date()];
        }
        
        await db.query(query, params);
        
        res.json({
            success: true,
            message: '公司信息更新成功'
        });
    } catch (error) {
        console.error('Error updating company info:', error);
        res.status(500).json({
            success: false,
            message: '更新公司信息失败'
        });
    }
});

// 上传公司LOGO
router.post('/upload-logo', upload.single('logo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: '请选择要上传的LOGO文件'
            });
        }
        
        // 创建uploads目录（如果不存在）
        const uploadsDir = path.join(__dirname, '../public/uploads/company');
        try {
            await fs.access(uploadsDir);
        } catch {
            await fs.mkdir(uploadsDir, { recursive: true });
        }
        
        // 生成文件名
        const timestamp = Date.now();
        const originalName = req.file.originalname;
        const ext = path.extname(originalName);
        const filename = `logo_${timestamp}${ext}`;
        
        // 保存原始LOGO
        const logoPath = path.join(uploadsDir, filename);
        await fs.writeFile(logoPath, req.file.buffer);
        
        // 生成favicon.ico (简单版本，直接复制原始文件)
        const faviconFilename = `favicon_${timestamp}.ico`;
        const faviconPath = path.join(uploadsDir, faviconFilename);
        
        try {
            // 简单的favicon生成：直接复制原始文件
            await fs.writeFile(faviconPath, req.file.buffer);
            console.log('Favicon generated using simple copy method');
        } catch (error) {
            console.error('Error generating favicon:', error);
            // 如果复制失败，使用默认favicon
            const defaultFavicon = path.join(__dirname, '../public/favicon.ico');
            try {
                await fs.copyFile(defaultFavicon, faviconPath);
            } catch (copyError) {
                console.error('Error copying default favicon:', copyError);
            }
        }
        
        // 复制favicon到根目录
        const publicDir = path.join(__dirname, '../public');
        const rootFaviconPath = path.join(publicDir, 'favicon.ico');
        try {
            await fs.copyFile(faviconPath, rootFaviconPath);
        } catch (error) {
            console.error('Error copying favicon to root:', error);
        }
        
        // 更新数据库中的logo路径
        // 先获取最新的公司信息ID
        const [companyInfo] = await db.query('SELECT id FROM company_info ORDER BY id DESC LIMIT 1');
        
        if (companyInfo) {
            const updateQuery = `
                UPDATE company_info 
                SET logo_path = ?, favicon_path = ?
                WHERE id = ?
            `;
            
            await db.query(updateQuery, [
                `/uploads/company/${filename}`,
                `/uploads/company/${faviconFilename}`,
                companyInfo.id
            ]);
        } else {
            // 如果没有记录，插入一条新记录
            const insertQuery = `
                INSERT INTO company_info (logo_path, favicon_path, created_at, updated_at)
                VALUES (?, ?, ?, ?)
            `;
            
            await db.query(insertQuery, [
                `/uploads/company/${filename}`,
                `/uploads/company/${faviconFilename}`,
                new Date(),
                new Date()
            ]);
        }
        
        res.json({
            success: true,
            message: 'LOGO上传成功',
            data: {
                logo_path: `/uploads/company/${filename}`,
                favicon_path: `/uploads/company/${faviconFilename}`
            }
        });
    } catch (error) {
        console.error('Error uploading logo:', error);
        res.status(500).json({
            success: false,
            message: 'LOGO上传失败'
        });
    }
});

// 删除LOGO
router.delete('/logo', async (req, res) => {
    try {
        // 获取当前logo信息
        const getQuery = 'SELECT logo_path, favicon_path FROM company_info ORDER BY id DESC LIMIT 1';
        const [companyInfo] = await db.query(getQuery);
        
        if (companyInfo && companyInfo.logo_path) {
            // 删除文件
            const publicDir = path.join(__dirname, '../public');
            const logoFile = path.join(publicDir, companyInfo.logo_path);
            const faviconFile = path.join(publicDir, companyInfo.favicon_path);
            
            try {
                await fs.unlink(logoFile);
            } catch (error) {
                console.error('Error deleting logo file:', error);
            }
            
            try {
                await fs.unlink(faviconFile);
            } catch (error) {
                console.error('Error deleting favicon file:', error);
            }
            
            // 删除根目录的favicon
            const rootFavicon = path.join(publicDir, 'favicon.ico');
            try {
                await fs.unlink(rootFavicon);
            } catch (error) {
                console.error('Error deleting root favicon:', error);
            }
        }
        
        // 更新数据库
        const updateQuery = 'UPDATE company_info SET logo_path = NULL, favicon_path = NULL';
        await db.query(updateQuery);
        
        res.json({
            success: true,
            message: 'LOGO删除成功'
        });
    } catch (error) {
        console.error('Error deleting logo:', error);
        res.status(500).json({
            success: false,
            message: 'LOGO删除失败'
        });
    }
});

module.exports = router;