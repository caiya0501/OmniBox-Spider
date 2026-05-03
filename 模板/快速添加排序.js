/*
=============================================
  快速添加电影优先级排序脚本使用说明
  作者：OmniBox开发
  日期：2026-05-04
=============================================

一、使用方法
  1. 打开需要修改的 JS 文件
  2. 找到 SITE_API 和 BASE_DOMAIN 定义的位置
  3. 在其后粘贴代码片段1
  4. 找到 buildCategoryList 函数
  5. 在 const other = top.filter(...) 之后粘贴代码片段2
  6. 保存文件完成

二、代码片段
=============================================
*/

/*
=============================================
  代码片段1：添加电影优先级常量
  粘贴位置：SITE_API 和 BASE_DOMAIN 定义之后
=============================================
*/

// ============== 核心：定义需要优先排在前面的电影分类（可自行增删） ==============
const MOVIE_PRIORITY = process.env.MOVIE_PRIORITY || "动作片,惊悚片,科幻片,喜剧片,爱情片,恐怖片,悬疑片,冒险片,动画电影";
const MOVIE_PRIORITY_TYPES = MOVIE_PRIORITY.split(',');

/*
=============================================
  代码片段2：添加电影分类排序逻辑
  粘贴位置：buildCategoryList 函数中，const other = top.filter(...) 之后
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
  代码片段3：CY_ikun.js 专用排序逻辑
  粘贴位置：buildCategoryList 函数中，获取 movieChildren 之后
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
