# 农场游戏核心逻辑梳理报告

## 1. 商店显示作物种子

### 实现方式
- **函数**：`generateShopList()` (行2061)
- **关键代码**：
  ```javascript
  <h4>${cropData.name} 种子</h4>
  ```
  - 自动在作物名称后添加"种子"字样
  - 显示作物图标、生长时间和经验值
  - 提供购买按钮

## 2. 购买种子后加入仓库

### 实现流程
1. **点击购买**：调用 `buySeed(cropKey)` (行3289)
2. **后端处理**：调用 `FarmAPI.buySeed()` 完成购买
3. **数据同步**：通过 `refreshGameData()` 更新本地数据
4. **仓库显示**：
   - `generateInventoryList()` (行2454) 显示仓库物品
   - **关键代码**：
     ```javascript
     const isSeed = item.crop_key.endsWith('_seed');
     const originalCropKey = isSeed ? item.crop_key.slice(0, -5) : item.crop_key;
     <div class="inventory-name">${crop.name}${isSeed ? ' 种子' : ''}</div>
     ```
   - 自动识别种子并添加"种子"后缀

## 3. 种植种子

### 实现流程
1. **点击地块**：调用 `openCropModal(plotIndex)` (行3075)
2. **选择种子**：显示可种植的种子列表
3. **种植验证**：
   ```javascript
   if (!cropType.endsWith('_seed')) {
       showToast('只能种植种子！');
       return;
   }
   ```
4. **后端处理**：调用 `FarmAPI.plantCrop()` 完成种植
5. **更新界面**：重新生成农场网格，显示新种植的作物

## 4. 收割作物

### 单地块收割
- **函数**：`harvestCrop()` (行3344)
- **流程**：
  1. 检查地块是否有成熟作物
  2. 调用 `FarmAPI.harvestCrop()` 后端处理
  3. 调用 `refreshGameData()` 同步最新数据
  4. 更新农场网格和仓库列表

### 一键收割
- **函数**：`quickHarvestBtn` 事件监听器 (行2310)
- **流程**：
  1. 自动检测所有成熟作物
  2. 逐个调用 `FarmAPI.harvestCrop()` 收割
  3. 调用 `refreshGameData()` 同步数据
  4. 显示收割结果和经验获取信息

## 5. 经验值获取

### 实现方式
- **后端处理**：经验值计算和添加由后端完成
- **前端同步**：
  ```javascript
  async function refreshGameData() {
      const data = await FarmAPI.getPlayerData();
      gameData.player = data.player;
      // 更新经验进度条
      const progressPercent = (gameData.player.exp / gameData.player.exp_to_next_level) * 100;
      document.getElementById('levelProgress').style.width = `${progressPercent}%`;
      document.getElementById('levelProgressText').textContent = `${gameData.player.exp} / ${gameData.player.exp_to_next_level}`;
  }
  ```

## 6. 关键优化点

### 1. 仓库列表重复生成问题解决
- **原问题**：1秒间隔的游戏循环导致频繁调用 `generateInventoryList()`
- **解决方案**：
  - 将 `generateFarmGrid()` 间隔改为5秒
  - 分离 `checkCheckInStatus()` 函数，避免不必要的UI更新

### 2. 收割数据一致性保证
- **原问题**：本地更新仓库数据可能导致与后端数据不一致
- **解决方案**：
  - 移除本地仓库数据更新逻辑
  - 完全依赖 `refreshGameData()` 从后端同步数据

### 3. 种子和成熟作物的清晰区分
- 通过 `_seed` 后缀标识种子
- 种植时强制验证种子类型
- 仓库显示时自动添加/移除"种子"字样

## 7. 测试要点

1. **商店功能**：
   - 验证种子显示带有"种子"后缀
   - 购买后种子正确加入仓库

2. **种植功能**：
   - 只能种植带有"种子"标识的物品
   - 种植后地块显示正确的作物

3. **收割功能**：
   - 成熟作物可正常收割
   - 收割后作物存入仓库（无"种子"后缀）
   - 经验值正确增加

4. **仓库功能**：
   - 种子显示"种子"后缀
   - 成熟作物无"种子"后缀
   - 不会频繁重复生成列表

## 结论

当前实现已经完全符合用户要求的核心游戏逻辑：
- ✅ 商店显示作物种子
- ✅ 购买后种子加入仓库并显示"种子"字样
- ✅ 点击地块种植带有种子的作物
- ✅ 收割作物存入仓库（不带种子字样）并获得经验

所有之前的问题（仓库列表重复生成、收割后作物不显示）已经得到解决，代码结构清晰，数据同步可靠。