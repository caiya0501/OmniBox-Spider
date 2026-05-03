# 电影分类优先级排序 - 模板和工具

## 概述
本文件夹包含用于快速给影视源添加电影分类优先级排序功能的模板和工具。

## 文件说明

### 1. 模板.js
详细的修改模板，包含：
- 完整的功能说明
- 详细的修改步骤
- 代码示例
- 检查清单

### 2. 快速添加排序.js
快速使用的代码片段，包含3个代码片段：
- 代码片段1：添加电影优先级常量
- 代码片段2：添加电影分类排序逻辑（普通源）
- 代码片段3：CY_ikun.js 专用排序逻辑

### 3. test_sources.js
API测试脚本，用于测试影视源的可用性。

### 4. 源管理工具.ps1 ⭐ 推荐
**这是主要的源管理工具！** 一键完成以下功能：
- 读取CSV测试结果
- 测试所有源的API可用性
- 更新CSV文件
- 自动删除失效源
- 自动给有效源添加排序代码

### 5. 源管理工具.js
Node.js版本的源管理工具（功能同PowerShell版本）

## 使用方法

### 方法0：使用源管理工具.ps1 ⭐ 超级推荐（一键完成）
这是最简单的方法，一个脚本完成所有工作！

1. 在PowerShell中进入模板目录
2. 运行：`powershell -ExecutionPolicy Bypass -File 源管理工具.ps1`
3. 脚本会自动：
   - 读取CSV中的源信息
   - 测试所有源的API可用性
   - 更新CSV文件
   - 删除失效源
   - 给有效源添加排序代码

### 方法1：使用快速添加排序.js
1. 打开 `快速添加排序.js`
2. 复制对应代码片段
3. 粘贴到目标 JS 文件的正确位置

### 方法2：使用模板.js
1. 打开 `模板.js`
2. 按照详细步骤操作
3. 使用检查清单确认修改完整

## 修改步骤总结

### 步骤1：添加电影优先级常量
找到 `SITE_API` 和 `BASE_DOMAIN` 定义位置，在其后添加：
```javascript
// ============== 核心：定义需要优先排在前面的电影分类（可自行增删） ==============
const MOVIE_PRIORITY = process.env.MOVIE_PRIORITY || "动作片,惊悚片,科幻片,喜剧片,爱情片,恐怖片,悬疑片,冒险片,动画电影";
const MOVIE_PRIORITY_TYPES = MOVIE_PRIORITY.split(',');
```

### 步骤2：添加排序逻辑
在 `buildCategoryList` 函数中，找到 `const other = top.filter(...)` 这一行，在其后添加：
```javascript
// ============== 关键：给 other 排序（电影分类靠前，其他靠后） ==============
other.sort((a, b) => {
    const isAMovie = MOVIE_PRIORITY_TYPES.includes(a.type_name);
    const isBMovie = MOVIE_PRIORITY_TYPES.includes(b.type_name);
    if (isAMovie && !isBMovie) return -1;
    if (!isAMovie && isBMovie) return 1;
    return 0;
});
```

## 优先级分类说明
默认优先级分类：
- 动作片
- 惊悚片
- 科幻片
- 喜剧片
- 爱情片
- 恐怖片
- 悬疑片
- 冒险片
- 动画电影

## 自定义优先级
可以通过环境变量 `MOVIE_PRIORITY` 自定义优先级，格式为逗号分隔的分类名称：
```
MOVIE_PRIORITY="动作片,科幻片,喜剧片"
```

## 测试源
使用 `test_sources.js` 测试影视源的可用性：
```
node test_sources.js
```
测试结果会保存为 `api_test_results_new.csv`

## 检查清单
修改完成后请确认：
- [ ] 是否添加了 MOVIE_PRIORITY 常量？
- [ ] 是否添加了 MOVIE_PRIORITY_TYPES 常量？
- [ ] 是否在 buildCategoryList 函数中找到了 const other = ...？
- [ ] 是否在 other 之后添加了排序逻辑？
- [ ] 对于 CY_ikun.js 这种平铺电影分类的，是否给 movieChildren 添加了排序？

## 注意事项
1. 确保代码粘贴在正确位置
2. 保存文件后可以先测试一下
3. 如果有语法错误，请检查是否有遗漏的分号或括号
