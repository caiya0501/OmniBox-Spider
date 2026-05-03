/*
=============================================
  电影分类优先级排序 - 修改模板
  作者：OmniBox开发
  日期：2026-05-04
  版本：1.0
=============================================

一、功能说明
  针对影视分类不是电影而是动作片、惊悚片、科幻片等的情况，
  将动作片、惊悚片、科幻片等属于电影的分类优先排在前面。

二、修改步骤
  步骤1：添加电影优先级常量（在 SITE_API/BASE_DOMAIN 定义之后）
  步骤2：添加电影分类排序逻辑（在 buildCategoryList 函数中）

三、代码修改位置
  位置A：SITE_API/BASE_DOMAIN 定义之后
  位置B：buildCategoryList 函数中，const other = top.filter(...) 之后

四、优先级分类列表
  默认：动作片,惊悚片,科幻片,喜剧片,爱情片,恐怖片,悬疑片,冒险片,动画电影
  可通过环境变量 MOVIE_PRIORITY 自定义，格式：逗号分隔的分类名称
=============================================
*/

/*
=============================================
  【修改代码1】 - 添加电影优先级常量
  位置：在 SITE_API 和 BASE_DOMAIN 定义之后
=============================================
*/

// ============== 核心：定义需要优先排在前面的电影分类（可自行增删） ==============
const MOVIE_PRIORITY = process.env.MOVIE_PRIORITY || "动作片,惊悚片,科幻片,喜剧片,爱情片,恐怖片,悬疑片,冒险片,动画电影";
const MOVIE_PRIORITY_TYPES = MOVIE_PRIORITY.split(',');

/*
=============================================
  【修改代码2】 - 添加电影分类排序逻辑
  位置：在 buildCategoryList 函数中，const other = top.filter(...) 之后
=============================================
*/

// ============== 关键：给 other 排序（电影分类靠前，其他靠后） ==============
other.sort((a, b) => {
    const isAMovie = MOVIE_PRIORITY_TYPES.includes(a.type_name);
    const isBMovie = MOVIE_PRIORITY_TYPES.includes(b.type_name);
    if (isAMovie && !isBMovie) return -1;
    if (!isAMovie && isBMovie) return 1;
    return 0;
});

/*
=============================================
  【特殊情况】 - 对于 CY_ikun.js 这种电影分类平铺的情况
  位置：在 buildCategoryList 函数中，获取 movieChildren 之后
=============================================
*/

// ============== 关键：给电影子分类排序（优先级分类靠前） ==============
movieChildren.sort((a, b) => {
    const isAPriority = MOVIE_PRIORITY_TYPES.includes(a.type_name);
    const isBPriority = MOVIE_PRIORITY_TYPES.includes(b.type_name);
    if (isAPriority && !isBPriority) return -1;
    if (!isAPriority && isBPriority) return 1;
    return 0;
});

/*
=============================================
  五、使用示例
  1. 复制此模板
  2. 找到目标 JS 文件
  3. 按照修改步骤添加对应代码
  4. 保存文件即可
=============================================
*/

/*
=============================================
  六、快速检查清单
  □ 是否添加了 MOVIE_PRIORITY 常量？
  □ 是否添加了 MOVIE_PRIORITY_TYPES 常量？
  □ 是否在 buildCategoryList 函数中找到了 const other = ...？
  □ 是否在 other 之后添加了排序逻辑？
  □ 对于 CY_ikun.js 这种平铺电影分类的，是否给 movieChildren 添加了排序？
=============================================
*/
