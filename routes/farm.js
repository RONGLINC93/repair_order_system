const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

// 获取所有作物配置
router.get('/crops', async (req, res) => {
    try {
        const category = req.query.category;
        const search = req.query.search;
        
        let query = 'SELECT * FROM farm_crops WHERE 1=1';
        const params = [];
        
        if (category && category !== 'all') {
            query += ' AND category = ?';
            params.push(category);
        }
        
        if (search) {
            query += ' AND (name LIKE ? OR crop_key LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }
        
        query += ' ORDER BY category, id';
        
        const crops = await db.query(query, params);
        res.json({ success: true, data: crops });
    } catch (error) {
        console.error('获取作物配置失败:', error);
        res.status(500).json({ success: false, message: '获取作物配置失败' });
    }
});

// 获取单个作物配置
router.get('/crops/:cropKey', async (req, res) => {
    try {
        const { cropKey } = req.params;
        const crops = await db.query(
            'SELECT * FROM farm_crops WHERE crop_key = ?',
            [cropKey]
        );
        
        if (crops.length === 0) {
            return res.status(404).json({ success: false, message: '作物不存在' });
        }
        
        res.json({ success: true, data: crops[0] });
    } catch (error) {
        console.error('获取作物配置失败:', error);
        res.status(500).json({ success: false, message: '获取作物配置失败' });
    }
});

// 初始化或获取玩家农场数据
router.post('/player/init', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        
        // 检查玩家是否已有农场数据
        let players = await db.query(
            'SELECT * FROM farm_players WHERE user_id = ?',
            [userId]
        );
        
        if (players.length === 0) {
            // 创建新的玩家农场数据
            await db.query(
                `INSERT INTO farm_players (user_id, level, exp, exp_to_next_level, gold, last_check_in, next_check_in_time, created_at, updated_at) 
                 VALUES (?, 1, 0, 100, 1000, ?, ?, ?, ?)`,
                [userId, new Date(), new Date(), new Date(), new Date()]
            );
            
            players = await db.query(
                'SELECT * FROM farm_players WHERE user_id = ?',
                [userId]
            );
        }
        
        const player = players[0];
        
        // 获取玩家的地块
        const plots = await db.query(
            'SELECT * FROM farm_plots WHERE player_id = ? ORDER BY plot_index',
            [player.id]
        );
        
        // 获取玩家的仓库
        const inventory = await db.query(
            'SELECT * FROM farm_inventory WHERE player_id = ?',
            [player.id]
        );
        
        // 如果没有地块，初始化第一个地块
        if (plots.length === 0) {
            await db.query(
                `INSERT INTO farm_plots (player_id, plot_index, is_unlocked, crop_key, planted_at, stage, created_at, updated_at) 
                 VALUES (?, 0, TRUE, NULL, ?, 0, ?, ?)`,
                [player.id, new Date(), new Date(), new Date()]
            );
            
            const newPlots = await db.query(
                'SELECT * FROM farm_plots WHERE player_id = ? ORDER BY plot_index',
                [player.id]
            );
            
            res.json({
                success: true,
                data: {
                    player,
                    plots: newPlots,
                    inventory
                }
            });
        } else {
            res.json({
                success: true,
                data: {
                    player,
                    plots,
                    inventory
                }
            });
        }
    } catch (error) {
        console.error('初始化玩家农场数据失败:', error);
        res.status(500).json({ success: false, message: '初始化玩家农场数据失败' });
    }
});

// 获取玩家农场数据
router.get('/player', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const players = await db.query(
            'SELECT * FROM farm_players WHERE user_id = ?',
            [userId]
        );
        
        if (players.length === 0) {
            return res.status(404).json({ success: false, message: '玩家农场数据不存在' });
        }
        
        const player = players[0];
        
        // 获取玩家的地块
        const plots = await db.query(
            'SELECT * FROM farm_plots WHERE player_id = ? ORDER BY plot_index',
            [player.id]
        );
        
        // 获取玩家的仓库
        const inventory = await db.query(
            'SELECT * FROM farm_inventory WHERE player_id = ?',
            [player.id]
        );
        
        // 获取作物配置
        const crops = await db.query('SELECT * FROM farm_crops');
        
        res.json({
            success: true,
            data: {
                player,
                plots,
                inventory,
                crops
            }
        });
    } catch (error) {
        console.error('获取玩家农场数据失败:', error);
        res.status(500).json({ success: false, message: '获取玩家农场数据失败' });
    }
});

// 更新玩家金币
router.post('/player/gold', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const { amount, operation } = req.body;
        
        if (typeof amount !== 'number' || amount <= 0) {
            return res.status(400).json({ success: false, message: '无效的金币数量' });
        }
        
        const players = await db.query(
            'SELECT * FROM farm_players WHERE user_id = ?',
            [userId]
        );
        
        if (players.length === 0) {
            return res.status(404).json({ success: false, message: '玩家农场数据不存在' });
        }
        
        const player = players[0];
        let newGold = player.gold;
        
        if (operation === 'add') {
            newGold += amount;
        } else if (operation === 'subtract') {
            newGold -= amount;
            if (newGold < 0) {
                return res.status(400).json({ success: false, message: '金币不足' });
            }
        } else {
            return res.status(400).json({ success: false, message: '无效的操作类型' });
        }
        
        await db.query(
            'UPDATE farm_players SET gold = ?, updated_at = ? WHERE id = ?',
            [newGold, new Date(), player.id]
        );
        
        res.json({ success: true, gold: newGold, message: operation === 'add' ? `获得${amount}金币` : `消耗${amount}金币` });
    } catch (error) {
        console.error('更新玩家金币失败:', error);
        res.status(500).json({ success: false, message: '更新玩家金币失败' });
    }
});

// 签到
router.post('/player/checkin', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const players = await db.query(
            'SELECT * FROM farm_players WHERE user_id = ?',
            [userId]
        );
        
        if (players.length === 0) {
            return res.status(404).json({ success: false, message: '玩家农场数据不存在' });
        }
        
        const player = players[0];
        const now = new Date();
        const nextCheckInTime = player.next_check_in_time ? new Date(player.next_check_in_time) : null;
        
        if (nextCheckInTime && now < nextCheckInTime) {
            const remainingSeconds = Math.ceil((nextCheckInTime - now) / 1000);
            const minutes = Math.floor(remainingSeconds / 60);
            const seconds = remainingSeconds % 60;
            return res.status(400).json({
                success: false,
                message: `请等待 ${minutes}分${seconds}秒 后再签到`,
                remainingSeconds
            });
        }
        
        // 计算下次签到时间（当前时间+1分钟）
        const nextTime = new Date(now.getTime() + 60 * 1000);
        const newGold = player.gold + 100;
        
        // 随机获取一个作物种子
        const allCrops = await db.query('SELECT * FROM farm_crops');
        let randomCrop = null;
        
        // 随机选择一个作物并确保奖励的是种子版本
        if (allCrops.length > 0) {
            randomCrop = allCrops[Math.floor(Math.random() * allCrops.length)];
        }
        
        let rewardCrop = null;
        
        if (randomCrop) {
            // 确保奖励的是种子版本（添加_seed后缀）
            const seedCropKey = randomCrop.crop_key + '_seed';
            
            // 检查玩家是否已有该作物种子
            const existingSeed = await db.query(
                'SELECT * FROM farm_inventory WHERE player_id = ? AND crop_key = ?',
                [player.id, seedCropKey]
            );
            
            if (existingSeed.length > 0) {
                await db.query(
                    'UPDATE farm_inventory SET quantity = quantity + 1, updated_at = ? WHERE player_id = ? AND crop_key = ?',
                    [new Date(), player.id, seedCropKey]
                );
            } else {
                await db.query(
                    'INSERT INTO farm_inventory (player_id, crop_key, quantity, updated_at,created_at) VALUES (?, ?, 1, ?,?)',
                    [player.id, seedCropKey, new Date(), new Date()]
                );
            }
            
            rewardCrop = {
                crop_key: seedCropKey,
                name: randomCrop.name,
                icon: randomCrop.icon,
                quantity: 1
            };
        }
        
        // 计算连续签到天数
        let consecutiveDays = player.consecutive_check_in_days || 0;
        const lastCheckIn = player.last_check_in ? new Date(player.last_check_in) : null;
        
        if (lastCheckIn) {
            const lastDate = lastCheckIn.toDateString();
            const nowDate = now.toDateString();
            
            if (lastDate === nowDate) {
                // 同一天签到，不增加连续天数
            } else {
                const diffDays = Math.floor((now - lastCheckIn) / (1000 * 60 * 60 * 24));
                if (diffDays === 1) {
                    // 昨天签到的，今天连续签到
                    consecutiveDays++;
                } else {
                    // 中间断开了，重置为1
                    consecutiveDays = 1;
                }
            }
        } else {
            // 首次签到
            consecutiveDays = 1;
        }
        
        await db.query(
            `UPDATE farm_players SET gold = ?, last_check_in = ?, next_check_in_time = ?, consecutive_check_in_days = ?, updated_at = ? WHERE id = ?`,
            [newGold, now, nextTime, consecutiveDays, new Date(), player.id]
        );
        
        const inventory = await db.query(
            'SELECT crop_key, quantity FROM farm_inventory WHERE player_id = ?',
            [player.id]
        );
        
        res.json({
            success: true,
            gold: newGold,
            inventory: inventory,
            crop: rewardCrop,
            message: `签到成功！获得 ${rewardCrop ? rewardCrop.icon + ' ' + rewardCrop.name + '种子 x1，' : ''}100金币`,
            nextCheckInTime: nextTime.toISOString()
        });
    } catch (error) {
        console.error('签到失败:', error);
        res.status(500).json({ success: false, message: '签到失败' });
    }
});

// 购买地块
router.post('/plots/unlock', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const { plotIndex } = req.body;
        
        if (typeof plotIndex !== 'number' || plotIndex < 0) {
            return res.status(400).json({ success: false, message: '无效的地块索引' });
        }
        
        const players = await db.query(
            'SELECT * FROM farm_players WHERE user_id = ?',
            [userId]
        );
        
        if (players.length === 0) {
            return res.status(404).json({ success: false, message: '玩家农场数据不存在' });
        }
        
        const player = players[0];
        const cost = 500;
        
        if (player.gold < cost) {
            return res.status(400).json({ success: false, message: `金币不足，需要${cost}金币` });
        }
        
        // 检查地块是否存在
        const existingPlots = await db.query(
            'SELECT * FROM farm_plots WHERE player_id = ? AND plot_index = ?',
            [player.id, plotIndex]
        );
        
        if (existingPlots.length > 0 && existingPlots[0].is_unlocked) {
            return res.status(400).json({ success: false, message: '地块已解锁' });
        }
        
        // 扣除金币并解锁地块
        await db.query(
            'UPDATE farm_players SET gold = gold - ?, updated_at = ? WHERE id = ?',
            [cost, new Date(), player.id]
        );
        
        if (existingPlots.length === 0) {
            await db.query(
                `INSERT INTO farm_plots (player_id, plot_index, is_unlocked, crop_key, planted_at, stage, created_at, updated_at) 
                 VALUES (?, ?, TRUE, NULL, ?, 0, ?, ?)`,
                [player.id, plotIndex, new Date(), new Date(), new Date()]
            );
        } else {
            await db.query(
                'UPDATE farm_plots SET is_unlocked = TRUE, updated_at = ? WHERE player_id = ? AND plot_index = ?',
                [new Date(), player.id, plotIndex]
            );
        }
        
        // 获取更新后的地块信息
        const plots = await db.query(
            'SELECT * FROM farm_plots WHERE player_id = ? ORDER BY plot_index',
            [player.id]
        );
        
        res.json({
            success: true,
            message: `成功消耗${cost}金币解锁地块`,
            plots
        });
    } catch (error) {
        console.error('解锁地块失败:', error);
        res.status(500).json({ success: false, message: '解锁地块失败' });
    }
});

// 种植作物
router.post('/plots/plant', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const { plotIndex, cropKey } = req.body;
        
        if (typeof plotIndex !== 'number' || plotIndex < 0) {
            return res.status(400).json({ success: false, message: '无效的地块索引' });
        }
        
        if (!cropKey) {
            return res.status(400).json({ success: false, message: '请选择要种植的作物' });
        }
        
        // 检查是否为种子（带有_seed后缀）
        const isSeed = cropKey.endsWith('_seed');
        if (!isSeed) {
            return res.status(400).json({ success: false, message: '只能种植种子！' });
        }
        // 获取原始作物key（去掉_seed后缀）
        const originalCropKey = cropKey.slice(0, -5);
        
        const players = await db.query(
            'SELECT * FROM farm_players WHERE user_id = ?',
            [userId]
        );
        
        if (players.length === 0) {
            return res.status(404).json({ success: false, message: '玩家农场数据不存在' });
        }
        
        const player = players[0];
        
        // 检查作物配置（使用原始作物key）
        const crops = await db.query(
            'SELECT * FROM farm_crops WHERE crop_key = ?',
            [originalCropKey]
        );
        
        if (crops.length === 0) {
            return res.status(400).json({ success: false, message: '作物不存在' });
        }
        
        const crop = crops[0];
        
        // 检查地块是否存在且已解锁
        const plots = await db.query(
            'SELECT * FROM farm_plots WHERE player_id = ? AND plot_index = ?',
            [player.id, plotIndex]
        );
        
        if (plots.length === 0) {
            return res.status(404).json({ success: false, message: '地块不存在' });
        }
        
        const plot = plots[0];
        
        if (!plot.is_unlocked) {
            return res.status(400).json({ success: false, message: '地块未解锁' });
        }
        
        if (plot.crop_key) {
            return res.status(400).json({ success: false, message: '地块已有作物，请先收获' });
        }

        // 检查仓库中是否有种子
        const inventory = await db.query(
            'SELECT * FROM farm_inventory WHERE player_id = ? AND crop_key = ?',
            [player.id, cropKey]
        );

        if (inventory.length === 0) {
            return res.status(400).json({ success: false, message: `仓库中没有${crop.name}种子，请先购买` });
        }

        const seedItem = inventory[0];

        if (seedItem.quantity <= 0) {
            return res.status(400).json({ success: false, message: `仓库中${crop.name}种子数量不足` });
        }

        // 扣除种子
        if (seedItem.quantity === 1) {
            await db.query(
                'DELETE FROM farm_inventory WHERE id = ?',
                [seedItem.id]
            );
        } else {
            await db.query(
                'UPDATE farm_inventory SET quantity = quantity - 1, updated_at = ? WHERE id = ?',
                [new Date(), seedItem.id]
            );
        }

        // 种植作物（使用原始作物key，不使用种子标识）
        await db.query(
            `UPDATE farm_plots SET crop_key = ?, planted_at = ?, updated_at = ? WHERE player_id = ? AND plot_index = ?`,
            [originalCropKey, new Date(), new Date(), player.id, plotIndex]
        );

        // 获取更新后的仓库信息
        const updatedInventory = await db.query(
            'SELECT * FROM farm_inventory WHERE player_id = ?',
            [player.id]
        );

        // 获取更新后的地块信息
        const updatedPlots = await db.query(
            'SELECT * FROM farm_plots WHERE player_id = ? AND plot_index = ?',
            [player.id, plotIndex]
        );

        // 检查并更新首次种植成就
        if (!player.first_plant_at) {
            await db.query(
                'UPDATE farm_players SET plants_count = plants_count + 1, first_plant_at = ?, updated_at = ? WHERE id = ?',
                [new Date(), new Date(), player.id]
            );
        } else {
            await db.query(
                'UPDATE farm_players SET plants_count = plants_count + 1, updated_at = ? WHERE id = ?',
                [new Date(), player.id]
            );
        }

        // 获取更新后的玩家数据
        const updatedPlayers = await db.query(
            'SELECT * FROM farm_players WHERE id = ?',
            [player.id]
        );
        const updatedPlayer = updatedPlayers[0];

        res.json({
            success: true,
            message: `成功种植${crop.name}`,
            player: updatedPlayer,
            plot: updatedPlots[0],
            inventory: updatedInventory
        });
    } catch (error) {
        console.error('种植作物失败:', error);
        res.status(500).json({ success: false, message: '种植作物失败' });
    }
});

// 收获作物
router.post('/plots/harvest', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const { plotIndex } = req.body;
        
        if (typeof plotIndex !== 'number' || plotIndex < 0) {
            return res.status(400).json({ success: false, message: '无效的地块索引' });
        }
        
        const players = await db.query(
            'SELECT * FROM farm_players WHERE user_id = ?',
            [userId]
        );
        
        if (players.length === 0) {
            return res.status(404).json({ success: false, message: '玩家农场数据不存在' });
        }
        
        const player = players[0];
        
        // 检查地块
        const plots = await db.query(
            'SELECT * FROM farm_plots WHERE player_id = ? AND plot_index = ?',
            [player.id, plotIndex]
        );
        
        if (plots.length === 0) {
            return res.status(404).json({ success: false, message: '地块不存在' });
        }
        
        const plot = plots[0];
        
        if (!plot.crop_key) {
            return res.status(400).json({ success: false, message: '地块没有作物' });
        }
        
        // 获取作物配置
        const crops = await db.query(
            'SELECT * FROM farm_crops WHERE crop_key = ?',
            [plot.crop_key]
        );
        
        if (crops.length === 0) {
            return res.status(400).json({ success: false, message: '作物配置不存在' });
        }
        
        const crop = crops[0];
        
        // 检查作物是否成熟 - 使用服务器时间计算
        const plantedAt = new Date(plot.planted_at);
        const now = new Date();
        const elapsedMs = now - plantedAt;
        const elapsedSeconds = Math.floor(elapsedMs / 1000);
        
        console.log(`[Backend] 作物: ${crop.name}, 种植时间: ${plot.planted_at}, 经过秒数: ${elapsedSeconds}, 生长时间: ${crop.growth_time}秒`);
        
        if (elapsedSeconds < crop.growth_time) {
            const remainingSeconds = Math.ceil(crop.growth_time - elapsedSeconds);
            return res.status(400).json({
                success: false,
                message: `作物还未成熟，还需${remainingSeconds}秒`,
                remainingSeconds
            });
        }
        
        // 检查玩家仓库中是否已有该作物
        const existingCrop = await db.query(
            'SELECT * FROM farm_inventory WHERE player_id = ? AND crop_key = ?',
            [player.id, plot.crop_key]
        );
        
        // 将收割的作物添加到仓库
        if (existingCrop.length > 0) {
            // 已有该作物，增加数量
            await db.query(
                'UPDATE farm_inventory SET quantity = quantity + 1, updated_at = ? WHERE player_id = ? AND crop_key = ?',
                [new Date(), player.id, plot.crop_key]
            );
        } else {
            // 没有该作物，创建新记录
            await db.query(
                'INSERT INTO farm_inventory (player_id, crop_key, quantity, updated_at, created_at) VALUES (?, ?, 1, ?, ?)',
                [player.id, plot.crop_key, new Date(), new Date()]
            );
        }
        
        // 更新玩家经验、收获次数，不增加金币（收割只存入仓库，卖出才获得金币）
        await db.query(
            `UPDATE farm_players SET exp = exp + ?, harvest_count = harvest_count + 1, updated_at = ? WHERE id = ?`,
            [crop.exp, new Date(), player.id]
        );
        
        // 清空地块
        await db.query(
            `UPDATE farm_plots SET crop_key = NULL, planted_at = ?, stage = 0, updated_at = ? 
             WHERE player_id = ? AND plot_index = ?`,
            [new Date(), new Date(), player.id, plotIndex]
        );
        
        // 检查是否升级
        let newLevel = player.level;
        let newExpToNext = player.exp_to_next_level;
        let upgradeMessage = '';
        
        if (player.exp + crop.exp >= player.exp_to_next_level) {
            newLevel++;
            newExpToNext = Math.floor(player.exp_to_next_level * 1.5);
            upgradeMessage = `恭喜升级到${newLevel}级！`;
            
            await db.query(
                'UPDATE farm_players SET level = ?, exp_to_next_level = ?, updated_at = ? WHERE id = ?',
                [newLevel, newExpToNext, new Date(), player.id]
            );
        }
        
        res.json({
            success: true,
            message: `收获${crop.name}，获得${crop.exp}经验${upgradeMessage ? '。' + upgradeMessage : ''}`,
            reward: {
                exp: crop.exp
            },
            levelUp: upgradeMessage !== ''
        });
    } catch (error) {
        console.error('收获作物失败:', error);
        res.status(500).json({ success: false, message: '收获作物失败' });
    }
});

// 铲除作物
router.post('/plots/remove', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const { plotIndex } = req.body;
        
        if (typeof plotIndex !== 'number' || plotIndex < 0) {
            return res.status(400).json({ success: false, message: '无效的地块索引' });
        }
        
        const players = await db.query(
            'SELECT * FROM farm_players WHERE user_id = ?',
            [userId]
        );
        
        if (players.length === 0) {
            return res.status(404).json({ success: false, message: '玩家农场数据不存在' });
        }
        
        const player = players[0];
        
        const plots = await db.query(
            'SELECT * FROM farm_plots WHERE player_id = ? AND plot_index = ?',
            [player.id, plotIndex]
        );
        
        if (plots.length === 0) {
            return res.status(404).json({ success: false, message: '地块不存在' });
        }
        
        const plot = plots[0];
        
        if (!plot.crop_key) {
            return res.status(400).json({ success: false, message: '地块没有作物' });
        }
        
        await db.query(
            `UPDATE farm_plots SET crop_key = NULL, planted_at = ?, stage = 0, updated_at = ? 
             WHERE player_id = ? AND plot_index = ?`,
            [new Date(), new Date(), player.id, plotIndex]
        );
        
        res.json({ success: true, message: '作物已铲除' });
    } catch (error) {
        console.error('铲除作物失败:', error);
        res.status(500).json({ success: false, message: '铲除作物失败' });
    }
});

// 获取地块状态
router.get('/plots/:plotIndex', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const { plotIndex } = req.params;
        
        const players = await db.query(
            'SELECT * FROM farm_players WHERE user_id = ?',
            [userId]
        );
        
        if (players.length === 0) {
            return res.status(404).json({ success: false, message: '玩家农场数据不存在' });
        }
        
        const player = players[0];
        
        const plots = await db.query(
            'SELECT * FROM farm_plots WHERE player_id = ? AND plot_index = ?',
            [player.id, plotIndex]
        );
        
        if (plots.length === 0) {
            return res.json({ success: true, plot: null });
        }
        
        const plot = plots[0];
        
        // 计算作物生长状态
        if (plot.crop_key) {
            const crops = await db.query(
                'SELECT * FROM farm_crops WHERE crop_key = ?',
                [plot.crop_key]
            );
            
            if (crops.length > 0) {
                const crop = crops[0];
                const plantedAt = new Date(plot.planted_at);
                const now = new Date();
                const elapsedSeconds = Math.floor((now - plantedAt) / 1000);
                const progress = Math.min(elapsedSeconds / crop.growth_time, 1);
                const stages = crop.stages.split('|');
                const currentStage = Math.min(
                    Math.floor(progress * stages.length),
                    stages.length - 1
                );
                
                plot.cropInfo = {
                    ...crop,
                    stages,
                    currentStage,
                    currentIcon: stages[currentStage],
                    progress: Math.floor(progress * 100),
                    remainingSeconds: Math.max(0, Math.ceil(crop.growth_time - elapsedSeconds)),
                    isMature: elapsedSeconds >= crop.growth_time
                };
            }
        }
        
        res.json({ success: true, plot });
    } catch (error) {
        console.error('获取地块状态失败:', error);
        res.status(500).json({ success: false, message: '获取地块状态失败' });
    }
});

// 获取仓库
router.get('/inventory', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const players = await db.query(
            'SELECT * FROM farm_players WHERE user_id = ?',
            [userId]
        );
        
        if (players.length === 0) {
            return res.status(404).json({ success: false, message: '玩家农场数据不存在' });
        }
        
        const player = players[0];
        
        const inventory = await db.query(
            'SELECT * FROM farm_inventory WHERE player_id = ?',
            [player.id]
        );
        
        // 获取作物信息
        const crops = await db.query('SELECT * FROM farm_crops');
        const cropMap = {};
        crops.forEach(c => {
            cropMap[c.crop_key] = c;
        });
        
        // 添加作物信息到仓库物品
        const inventoryWithInfo = inventory.map(item => ({
            ...item,
            cropInfo: cropMap[item.crop_key] || null
        }));
        
        res.json({ success: true, data: inventoryWithInfo });
    } catch (error) {
        console.error('获取仓库失败:', error);
        res.status(500).json({ success: false, message: '获取仓库失败' });
    }
});

// 添加到仓库
router.post('/inventory/add', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const { cropKey, quantity } = req.body;
        
        if (!cropKey || typeof quantity !== 'number' || quantity <= 0) {
            return res.status(400).json({ success: false, message: '无效的参数' });
        }
        
        const players = await db.query(
            'SELECT * FROM farm_players WHERE user_id = ?',
            [userId]
        );
        
        if (players.length === 0) {
            return res.status(404).json({ success: false, message: '玩家农场数据不存在' });
        }
        
        const player = players[0];
        
        // 检查是否已有该作物
        const existing = await db.query(
            'SELECT * FROM farm_inventory WHERE player_id = ? AND crop_key = ?',
            [player.id, cropKey]
        );
        
        if (existing.length > 0) {
            await db.query(
                'UPDATE farm_inventory SET quantity = quantity + ?, updated_at = ? WHERE id = ?',
                [quantity, new Date(), existing[0].id]
            );
        } else {
            await db.query(
                'INSERT INTO farm_inventory (player_id, crop_key, quantity,created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
                [player.id, cropKey, quantity, new Date(), new Date()] 
            );
        }
        
        res.json({ success: true, message: `获得${quantity}个物品` });
    } catch (error) {
        console.error('添加到仓库失败:', error);
        res.status(500).json({ success: false, message: '添加到仓库失败' });
    }
});

// 从仓库移除
router.post('/inventory/remove', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const { cropKey, quantity } = req.body;
        
        if (!cropKey || typeof quantity !== 'number' || quantity <= 0) {
            return res.status(400).json({ success: false, message: '无效的参数' });
        }
        
        const players = await db.query(
            'SELECT * FROM farm_players WHERE user_id = ?',
            [userId]
        );
        
        if (players.length === 0) {
            return res.status(404).json({ success: false, message: '玩家农场数据不存在' });
        }
        
        const player = players[0];
        
        const existing = await db.query(
            'SELECT * FROM farm_inventory WHERE player_id = ? AND crop_key = ?',
            [player.id, cropKey]
        );
        
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: '仓库中没有该物品' });
        }
        
        const currentQty = existing[0].quantity;
        
        if (currentQty < quantity) {
            return res.status(400).json({ success: false, message: `仓库中只有${currentQty}个该物品` });
        }
        
        if (currentQty === quantity) {
            await db.query(
                'DELETE FROM farm_inventory WHERE id = ?',
                [existing[0].id]
            );
        } else {
            await db.query(
                'UPDATE farm_inventory SET quantity = quantity - ?, updated_at = ? WHERE id = ?',
                [quantity, new Date(), existing[0].id]
            );
        }
        
        res.json({ success: true, message: `消耗${quantity}个物品` });
    } catch (error) {
        console.error('从仓库移除失败:', error);
        res.status(500).json({ success: false, message: '从仓库移除失败' });
    }
});

// 出售物品
router.post('/inventory/sell', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const { cropKey, quantity } = req.body;
        
        if (!cropKey || typeof quantity !== 'number' || quantity <= 0) {
            return res.status(400).json({ success: false, message: '无效的参数' });
        }
        
        // 获取玩家数据
        const players = await db.query(
            'SELECT * FROM farm_players WHERE user_id = ?',
            [userId]
        );
        
        if (players.length === 0) {
            return res.status(404).json({ success: false, message: '玩家农场数据不存在' });
        }
        
        const player = players[0];
        
        // 获取物品信息
        let itemCropKey = cropKey;
        let isSeed = false;
        
        // 如果是种子，去掉_seed后缀获取原始作物key
        if (cropKey.endsWith('_seed')) {
            isSeed = true;
            itemCropKey = cropKey.slice(0, -5);
        }
        
        // 获取作物配置
        const crops = await db.query(
            'SELECT * FROM farm_crops WHERE crop_key = ?',
            [itemCropKey]
        );
        
        if (crops.length === 0) {
            return res.status(404).json({ success: false, message: '作物配置不存在' });
        }
        
        const crop = crops[0];
        
        // 计算出售价格（种子的价格是作物的一半，作物价格是原价的一倍）
        const price = isSeed ? Math.floor(crop.price / 2) : crop.price * 2;
        const totalPrice = price * quantity;
        
        // 检查仓库中是否有足够的物品
        const existing = await db.query(
            'SELECT * FROM farm_inventory WHERE player_id = ? AND crop_key = ?',
            [player.id, cropKey]
        );
        
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: '仓库中没有该物品' });
        }
        
        const currentQty = existing[0].quantity;
        
        if (currentQty < quantity) {
            return res.status(400).json({ success: false, message: `仓库中只有${currentQty}个该物品` });
        }
        
        // 更新用户金币
        await db.query(
            'UPDATE farm_players SET gold = gold + ?, updated_at = ? WHERE id = ?',
            [totalPrice, new Date(), player.id]
        );
        
        // 更新仓库
        if (currentQty === quantity) {
            await db.query(
                'DELETE FROM farm_inventory WHERE id = ?',
                [existing[0].id]
            );
        } else {
            await db.query(
                'UPDATE farm_inventory SET quantity = quantity - ?, updated_at = ? WHERE id = ?',
                [quantity, new Date(), existing[0].id]
            );
        }
        
        // 获取更新后的数据
        const updatedPlayers = await db.query(
            'SELECT * FROM farm_players WHERE user_id = ?',
            [userId]
        );
        
        const updatedInventory = await db.query(
            'SELECT * FROM farm_inventory WHERE player_id = ?',
            [updatedPlayers[0].id]
        );
        
        res.json({
            success: true,
            message: `成功出售${quantity}个${crop.name}`,
            player: updatedPlayers[0],
            inventory: updatedInventory
        });
    } catch (error) {
        console.error('出售物品失败:', error);
        res.status(500).json({ success: false, message: '出售物品失败' });
    }
});

// 购买种子
router.post('/shop/buy', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const { cropKey, quantity = 1 } = req.body;
        
        if (!cropKey || typeof quantity !== 'number' || quantity <= 0) {
            return res.status(400).json({ success: false, message: '无效的参数' });
        }
        
        const players = await db.query(
            'SELECT * FROM farm_players WHERE user_id = ?',
            [userId]
        );
        
        if (players.length === 0) {
            return res.status(404).json({ success: false, message: '玩家农场数据不存在' });
        }
        
        const player = players[0];
        
        // 获取作物信息
        const crops = await db.query(
            'SELECT * FROM farm_crops WHERE crop_key = ?',
            [cropKey]
        );
        
        if (crops.length === 0) {
            return res.status(404).json({ success: false, message: '作物不存在' });
        }
        
        const crop = crops[0];
        const totalPrice = crop.price * quantity;
        
        // 检查金币是否足够
        if (player.gold < totalPrice) {
            return res.status(400).json({ success: false, message: `金币不足，需要${totalPrice}金币` });
        }
        
        // 扣除金币并添加到仓库
        await db.query(
            'UPDATE farm_players SET gold = gold - ?, updated_at = ? WHERE id = ?',
            [totalPrice, new Date(), player.id]
        );
        
        // 为种子添加特殊标识，使用_seed后缀
        const seedCropKey = cropKey + '_seed';
        
        // 检查仓库中是否已有该种子
        const existing = await db.query(
            'SELECT * FROM farm_inventory WHERE player_id = ? AND crop_key = ?',
            [player.id, seedCropKey]
        );
        
        if (existing.length > 0) {
            await db.query(
                'UPDATE farm_inventory SET quantity = quantity + ?, updated_at = ? WHERE id = ?',
                [quantity, new Date(), existing[0].id]
            );
        } else {
            await db.query(
                'INSERT INTO farm_inventory (player_id, crop_key, quantity,created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
                [player.id, seedCropKey, quantity, new Date(), new Date()]  
            );
        }
        
        // 获取更新后的数据
        const updatedPlayers = await db.query(
            'SELECT * FROM farm_players WHERE user_id = ?',
            [userId]
        );
        const updatedInventory = await db.query(
            'SELECT * FROM farm_inventory WHERE player_id = ?',
            [updatedPlayers[0].id]
        );
        
        res.json({
            success: true,
            message: `成功购买${quantity}个${crop.name}种子`,
            player: updatedPlayers[0],
            inventory: updatedInventory
        });
    } catch (error) {
        console.error('购买种子失败:', error);
        res.status(500).json({ success: false, message: '购买种子失败' });
    }
});

// 获取农场配置
router.get('/config', authMiddleware, async (req, res) => {
    try {
        const configs = await db.query('SELECT * FROM farm_configs');
        const configMap = {};
        configs.forEach(config => {
            configMap[config.config_key] = config.config_value;
        });
        res.json({ success: true, data: configMap });
    } catch (error) {
        console.error('获取农场配置失败:', error);
        res.status(500).json({ success: false, message: '获取农场配置失败' });
    }
});

// 更新农场配置
router.post('/config', authMiddleware, async (req, res) => {
    try {
        const { config_key, config_value } = req.body;
        
        if (!config_key || config_value === undefined) {
            return res.status(400).json({ success: false, message: '缺少必要参数' });
        }
        
        const result = await db.query(
            'UPDATE farm_configs SET config_value = ? WHERE config_key = ?',
            [config_value, config_key]
        );
        
        if (result.affectedRows === 0) {
            // 如果没有更新到记录，尝试插入新记录
            await db.query(
                'INSERT INTO farm_configs (config_key, config_value, description) VALUES (?, ?, ?)',
                [config_key, config_value, '']
            );
        }
        
        res.json({ success: true, message: '配置更新成功' });
    } catch (error) {
        console.error('更新农场配置失败:', error);
        res.status(500).json({ success: false, message: '更新农场配置失败' });
    }
});

// 批量更新农场配置
router.post('/config/batch', authMiddleware, async (req, res) => {
    try {
        const configs = req.body;
        
        if (!Array.isArray(configs)) {
            return res.status(400).json({ success: false, message: '配置必须是数组格式' });
        }
        
        for (const config of configs) {
            const { config_key, config_value } = config;
            
            if (!config_key || config_value === undefined) {
                continue;
            }
            
            const result = await db.query(
                'UPDATE farm_configs SET config_value = ? WHERE config_key = ?',
                [config_value, config_key]
            );
            
            if (result.affectedRows === 0) {
                // 如果没有更新到记录，尝试插入新记录
                await db.query(
                    'INSERT INTO farm_configs (config_key, config_value, description) VALUES (?, ?, ?)',
                    [config_key, config_value, '']
                );
            }
        }
        
        res.json({ success: true, message: '配置批量更新成功' });
    } catch (error) {
        console.error('批量更新农场配置失败:', error);
        res.status(500).json({ success: false, message: '批量更新农场配置失败' });
    }
});

// 获取所有用户（好友列表）
router.get('/users', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const search = req.query.search || '';
        
        let query = `
            SELECT u.id, u.username, u.full_name, u.account_type, u.created_at,
                   fp.level, fp.exp, fp.gold
            FROM users u
            LEFT JOIN farm_players fp ON u.id = fp.user_id
        `;
        const params = [];
        
        if (search) {
            query += ' WHERE u.username LIKE ? OR u.full_name LIKE ?';
            params.push(`%${search}%`, `%${search}%`);
        }
        
        query += ' ORDER BY u.created_at DESC';
        
        const users = await db.query(query, params);
        
        res.json({
            success: true,
            data: users.map(user => ({
                id: user.id,
                username: user.username,
                full_name: user.full_name || user.username,
                account_type: user.account_type,
                level: user.level || 1,
                exp: user.exp || 0,
                gold: user.gold || 0,
                is_friend: true
            }))
        });
    } catch (error) {
        console.error('获取用户列表失败:', error);
        res.status(500).json({ success: false, message: '获取用户列表失败' });
    }
});

// 获取玩家成就状态
router.get('/achievements', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const player = await db.query(
            'SELECT * FROM farm_players WHERE user_id = ?',
            [userId]
        );
        
        if (player.length === 0) {
            return res.status(404).json({ success: false, message: '玩家数据不存在' });
        }
        
        const playerData = player[0];
        
        const achievements = [
            {
                id: 'first_plant',
                name: '初次播种',
                desc: '种植你的第一个作物',
                icon: '🌱',
                category: 'farm',
                target: 1,
                reward: 50,
                progress: playerData.plants_count > 0 ? 1 : 0,
                completed: playerData.plants_count >= 1,
                completed_at: playerData.first_plant_at,
                claimed: !!playerData.first_plant_at
            },
            {
                id: 'harvest_10',
                name: '丰收的喜悦',
                desc: '收获10个作物',
                icon: '🌾',
                category: 'harvest',
                target: 10,
                reward: 100,
                progress: playerData.harvest_count || 0,
                completed: (playerData.harvest_count || 0) >= 10,
                completed_at: playerData.harvest_10_at,
                claimed: !!playerData.harvest_10_at
            },
            {
                id: 'harvest_50',
                name: '丰收季节',
                desc: '收获50个作物',
                icon: '🌻',
                category: 'harvest',
                target: 50,
                reward: 200,
                progress: playerData.harvest_count || 0,
                completed: (playerData.harvest_count || 0) >= 50,
                completed_at: playerData.harvest_50_at,
                claimed: !!playerData.harvest_50_at
            },
            {
                id: 'harvest_100',
                name: '农场大师',
                desc: '收获100个作物',
                icon: '🏆',
                category: 'harvest',
                target: 100,
                reward: 500,
                progress: playerData.harvest_count || 0,
                completed: (playerData.harvest_count || 0) >= 100,
                completed_at: playerData.harvest_100_at,
                claimed: !!playerData.harvest_100_at
            },
            {
                id: 'gold_1000',
                name: '小有资产',
                desc: '累计获得1000金币',
                icon: '💰',
                category: 'farm',
                target: 1000,
                reward: 100,
                progress: playerData.total_gold || 0,
                completed: (playerData.total_gold || 0) >= 1000,
                completed_at: playerData.gold_1000_at,
                claimed: !!playerData.gold_1000_at
            },
            {
                id: 'gold_5000',
                name: '富有农民',
                desc: '累计获得5000金币',
                icon: '💎',
                category: 'farm',
                target: 5000,
                reward: 300,
                progress: playerData.total_gold || 0,
                completed: (playerData.total_gold || 0) >= 5000,
                completed_at: playerData.gold_5000_at,
                claimed: !!playerData.gold_5000_at
            },
            {
                id: 'level_5',
                name: '新晋农夫',
                desc: '达到5级',
                icon: '⭐',
                category: 'farm',
                target: 5,
                reward: 150,
                progress: playerData.level || 1,
                completed: (playerData.level || 1) >= 5,
                completed_at: playerData.level_5_at,
                claimed: !!playerData.level_5_at
            },
            {
                id: 'level_10',
                name: '资深农夫',
                desc: '达到10级',
                icon: '🌟',
                category: 'farm',
                target: 10,
                reward: 300,
                progress: playerData.level || 1,
                completed: (playerData.level || 1) >= 10,
                completed_at: playerData.level_10_at,
                claimed: !!playerData.level_10_at
            },
            {
                id: 'check_in_7',
                name: '坚持不懈',
                desc: '连续签到7天',
                icon: '📅',
                category: 'special',
                target: 7,
                reward: 200,
                progress: playerData.consecutive_check_in_days || 0,
                completed: (playerData.consecutive_check_in_days || 0) >= 7,
                completed_at: playerData.check_in_7_at,
                claimed: !!playerData.check_in_7_at
            },
            {
                id: 'all_users',
                name: '社交达人',
                desc: '查看所有用户',
                icon: '👥',
                category: 'social',
                target: 1,
                reward: 100,
                progress: 1,
                completed: true,
                completed_at: playerData.created_at,
                claimed: true
            }
        ];
        
        res.json({
            success: true,
            data: achievements
        });
    } catch (error) {
        console.error('获取成就列表失败:', error);
        res.status(500).json({ success: false, message: '获取成就列表失败' });
    }
});

// 领取成就奖励
router.post('/achievements/claim', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const { achievementId } = req.body;
        
        if (!achievementId) {
            return res.status(400).json({ success: false, message: '成就ID不能为空' });
        }
        
        const achievementMap = {
            'first_plant': { field: 'first_plant_at', reward: 50, condition: 'plants_count >= 1' },
            'harvest_10': { field: 'harvest_10_at', reward: 100, condition: 'harvest_count >= 10' },
            'harvest_50': { field: 'harvest_50_at', reward: 200, condition: 'harvest_count >= 50' },
            'harvest_100': { field: 'harvest_100_at', reward: 500, condition: 'harvest_count >= 100' },
            'gold_1000': { field: 'gold_1000_at', reward: 100, condition: 'total_gold >= 1000' },
            'gold_5000': { field: 'gold_5000_at', reward: 300, condition: 'total_gold >= 5000' },
            'level_5': { field: 'level_5_at', reward: 150, condition: 'level >= 5' },
            'level_10': { field: 'level_10_at', reward: 300, condition: 'level >= 10' },
            'check_in_7': { field: 'check_in_7_at', reward: 200, condition: 'consecutive_check_in_days >= 7' },
            'all_users': { field: null, reward: 100, condition: '1=1' }
        };
        
        const achievement = achievementMap[achievementId];
        if (!achievement) {
            return res.status(400).json({ success: false, message: '无效的成就ID' });
        }
        
        const player = await db.query(
            'SELECT * FROM farm_players WHERE user_id = ?',
            [userId]
        );
        
        if (player.length === 0) {
            return res.status(404).json({ success: false, message: '玩家数据不存在' });
        }
        
        const playerData = player[0];
        
        if (playerData[achievement.field]) {
            return res.status(400).json({ success: false, message: '该成就已领取奖励' });
        }
        
        if (achievement.field) {
            const conditionMet = eval(achievement.condition.replace(/plants_count|harvest_count|total_gold|level|consecutive_check_in_days/g, 
                (match) => playerData[match] || 0));
            
            if (!conditionMet) {
                return res.status(400).json({ success: false, message: '未满足成就领取条件' });
            }
            
            await db.query(
                `UPDATE farm_players SET gold = gold + ?, ${achievement.field} = ?, updated_at = ? WHERE user_id = ?`,
                [achievement.reward, new Date(), new Date(), userId]
            );
        }
        
        res.json({
            success: true,
            message: `成功领取成就奖励 ${achievement.reward} 金币`,
            reward: achievement.reward
        });
    } catch (error) {
        console.error('领取成就奖励失败:', error);
        res.status(500).json({ success: false, message: '领取成就奖励失败' });
    }
});

// 抽奖配置
let lotteryConfig = {
    cost: 100,
    prizes: []
};

// 从数据库加载抽奖配置
async function loadLotteryConfig() {
    try {
        const crops = await db.query(
            'SELECT crop_key, name, icon, category FROM farm_crops ORDER BY category, id'
        );
        
        const seedPrizes = crops
            .filter(crop => crop.category !== 'special')
            .map((crop, index) => {
                let maxAmount = 3;
                if (crop.category === 'vegetable') maxAmount = 2;
                if (crop.category === 'fruit' || crop.category === 'flower') maxAmount = 1;
                
                let weight = 20;
                if (crop.category === 'vegetable') weight = 15;
                if (crop.category === 'fruit' || crop.category === 'flower') weight = 10;
                
                return {
                    type: 'seed',
                    cropKey: crop.crop_key,
                    name: crop.name,
                    icon: crop.icon,
                    minAmount: 1,
                    maxAmount: maxAmount,
                    weight: Math.max(weight - index * 0.5, 2)
                };
            });
        
        lotteryConfig.prizes = [
            { type: 'gold', name: '金币', minAmount: 50, maxAmount: 200, weight: 30 },
            ...seedPrizes,
            { type: 'none', name: '未中奖', weight: 20 }
        ];
        
        console.log('抽奖配置已加载:', lotteryConfig.prizes.length, '个奖品');
    } catch (error) {
        console.error('加载抽奖配置失败:', error);
    }
}

// 获取抽奖配置
router.get('/lottery/config', async (req, res) => {
    res.json({
        success: true,
        data: {
            cost: lotteryConfig.cost,
            prizes: lotteryConfig.prizes.map(p => ({
                type: p.type,
                name: p.name,
                icon: p.icon,
                weight: p.weight
            }))
        }
    });
});

// 获取抽奖状态
router.get('/lottery/status', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const players = await db.query(
            'SELECT gold FROM farm_players WHERE user_id = ?',
            [userId]
        );
        
        if (players.length === 0) {
            return res.status(404).json({ success: false, message: '玩家数据不存在' });
        }
        
        res.json({
            success: true,
            data: {
                remaining: 99999,
                cost: lotteryConfig.cost,
                canDraw: players[0].gold >= lotteryConfig.cost
            }
        });
    } catch (error) {
        console.error('获取抽奖状态失败:', error);
        res.status(500).json({ success: false, message: '获取抽奖状态失败' });
    }
});

// 抽奖
router.post('/lottery/draw', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const cost = lotteryConfig.cost;
        
        const players = await db.query(
            'SELECT * FROM farm_players WHERE user_id = ?',
            [userId]
        );
        
        if (players.length === 0) {
            return res.status(404).json({ success: false, message: '玩家数据不存在' });
        }
        
        const player = players[0];
        
        if (player.gold < cost) {
            return res.status(400).json({ success: false, message: '金币不足' });
        }
        
        const totalWeight = lotteryConfig.prizes.reduce((sum, prize) => sum + prize.weight, 0);
        let random = Math.random() * totalWeight;
        let selectedPrize = null;
        
        for (const prize of lotteryConfig.prizes) {
            random -= prize.weight;
            if (random <= 0) {
                selectedPrize = prize;
                break;
            }
        }
        
        if (!selectedPrize) {
            selectedPrize = lotteryConfig.prizes[lotteryConfig.prizes.length - 1];
        }
        
        let reward = {
            type: selectedPrize.type,
            icon: selectedPrize.icon || '',
            name: selectedPrize.name
        };
        
        if (selectedPrize.type === 'gold') {
            reward.amount = Math.floor(Math.random() * (selectedPrize.maxAmount - selectedPrize.minAmount + 1)) + selectedPrize.minAmount;
            reward.cropKey = null;
            
            await db.query(
                'UPDATE farm_players SET gold = gold - ? + ?, updated_at = ? WHERE id = ?',
                [cost, reward.amount, new Date(), player.id]
            );
        } else if (selectedPrize.type === 'seed') {
            const amount = Math.floor(Math.random() * (selectedPrize.maxAmount - selectedPrize.minAmount + 1)) + selectedPrize.minAmount;
            reward.amount = amount;
            reward.cropKey = selectedPrize.cropKey;
            
            const seedCropKey = selectedPrize.cropKey + '_seed';
            
            const existingSeed = await db.query(
                'SELECT * FROM farm_inventory WHERE player_id = ? AND crop_key = ?',
                [player.id, seedCropKey]
            );
            
            if (existingSeed.length > 0) {
                await db.query(
                    'UPDATE farm_inventory SET quantity = quantity + ?, updated_at = ? WHERE player_id = ? AND crop_key = ?',
                    [amount, new Date(), player.id, seedCropKey]
                );
            } else {
                await db.query(
                    'INSERT INTO farm_inventory (player_id, crop_key, quantity, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
                    [player.id, seedCropKey, amount, new Date(), new Date()]
                );
            }
            
            await db.query(
                'UPDATE farm_players SET gold = gold - ?, updated_at = ? WHERE id = ?',
                [cost, new Date(), player.id]
            );
        } else {
            reward.amount = 0;
            reward.cropKey = null;
            
            await db.query(
                'UPDATE farm_players SET gold = gold - ?, updated_at = ? WHERE id = ?',
                [cost, new Date(), player.id]
            );
        }
        
        const updatedPlayers = await db.query(
            'SELECT gold FROM farm_players WHERE id = ?',
            [player.id]
        );
        
        res.json({
            success: true,
            reward: reward,
            currentGold: updatedPlayers[0].gold
        });
    } catch (error) {
        console.error('抽奖失败:', error);
        res.status(500).json({ success: false, message: '抽奖失败' });
    }
});

module.exports = { router, loadLotteryConfig };
