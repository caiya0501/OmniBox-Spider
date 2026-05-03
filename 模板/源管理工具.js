/*
=============================================
  源管理工具 - 源测试和管理
  作者：OmniBox开发
  日期：2026-05-04
  版本：1.0
=============================================

功能说明：
1. 读取CSV测试结果
2. 测试源的API可用性
3. 更新CSV文件
4. 删除失效源
5. 确保有效源有完整的排序功能
=============================================
*/

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const CY_DIR = path.join(__dirname, '../CY_影视');
const CSV_PATH = path.join(CY_DIR, 'api_test_results.csv');

// ============== 工具函数 ==============

function readCSV() {
    try {
        const content = fs.readFileSync(CSV_PATH, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());
        const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
        const data = [];
        
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.replace(/"/g, '').trim());
            const row = {};
            headers.forEach((header, index) => {
                row[header] = values[index] || '';
            });
            data.push(row);
        }
        return data;
    } catch (e) {
        console.error('读取CSV失败:', e.message);
        return [];
    }
}

function writeCSV(data) {
    try {
        const headers = ['FileName', 'APIUrl', 'Status', 'StatusCode'];
        const lines = [headers.join(',')];
        
        data.forEach(row => {
            const values = headers.map(h => `"${(row[h] || '').replace(/"/g, '""')}"`);
            lines.push(values.join(','));
        });
        
        fs.writeFileSync(CSV_PATH, '\ufeff' + lines.join('\n'), 'utf-8');
        console.log(`CSV已更新: ${CSV_PATH}`);
    } catch (e) {
        console.error('写入CSV失败:', e.message);
    }
}

function extractApiUrl(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const match = content.match(/const\s+SITE_API\s*=\s*["']([^"']+)["']/);
        return match ? match[1] : null;
    } catch (e) {
        return null;
    }
}

function hasSortCode(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const hasPriority = content.includes('MOVIE_PRIORITY');
        const hasSort = content.includes('other.sort') || content.includes('movieChildren.sort');
        return hasPriority && hasSort;
    } catch (e) {
        return false;
    }
}

function testApiUrl(apiUrl) {
    return new Promise((resolve) => {
        if (!apiUrl) {
            resolve({ status: 'Error', statusCode: 'No API URL found' });
            return;
        }

        const protocol = apiUrl.startsWith('https') ? https : http;
        const timeout = 10000;

        const req = protocol.get(apiUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout
        }, (res) => {
            if (res.statusCode === 200) {
                resolve({ status: 'Valid', statusCode: String(res.statusCode) });
            } else {
                resolve({ status: 'Error', statusCode: String(res.statusCode) });
            }
            res.resume();
        });

        req.on('error', (e) => {
            resolve({ status: 'Error', statusCode: e.message.substring(0, 100) });
        });

        req.on('timeout', () => {
            req.destroy();
            resolve({ status: 'Error', statusCode: 'Timeout' });
        });
    });
}

function addSortCodeToFile(filePath) {
    try {
        let content = fs.readFileSync(filePath, 'utf-8');
        
        // 添加MOVIE_PRIORITY常量
        if (!content.includes('MOVIE_PRIORITY')) {
            const siteApiMatch = content.match(/const\s+SITE_API\s*=\s*[^;]+;\s*(const\s+BASE_DOMAIN\s*=\s*[^;]+;)?/);
            if (siteApiMatch) {
                const insertPos = siteApiMatch.index + siteApiMatch[0].length;
                const sortConstants = `

// ============== 核心：定义需要优先排在前面的电影分类（可自行增删） ==============
const MOVIE_PRIORITY = process.env.MOVIE_PRIORITY || "动作片,惊悚片,科幻片,喜剧片,爱情片,恐怖片,悬疑片,冒险片,动画电影";
const MOVIE_PRIORITY_TYPES = MOVIE_PRIORITY.split(',');`;
                content = content.slice(0, insertPos) + sortConstants + content.slice(insertPos);
            }
        }
        
        // 添加排序逻辑 - 检查是CY_ikun.js还是普通源
        if (filePath.includes('CY_ikun.js') || filePath.includes('CY_PS_ikun.js')) {
            if (!content.includes('movieChildren.sort')) {
                const movieChildrenMatch = content.match(/const\s+movieChildren\s*=\s*[^;]+;/);
                if (movieChildrenMatch) {
                    const insertPos = movieChildrenMatch.index + movieChildrenMatch[0].length;
                    const sortCode = `
            // ============== 关键：给电影子分类排序（优先级分类靠前） ==============
            movieChildren.sort((a, b) => {
                const isAPriority = MOVIE_PRIORITY_TYPES.includes(a.type_name);
                const isBPriority = MOVIE_PRIORITY_TYPES.includes(b.type_name);
                if (isAPriority && !isBPriority) return -1;
                if (!isAPriority && isBPriority) return 1;
                return 0;
            });`;
                    content = content.slice(0, insertPos) + sortCode + content.slice(insertPos);
                }
            }
        } else {
            if (!content.includes('other.sort')) {
                const otherMatch = content.match(/const\s+other\s*=\s*top\.filter\([^)]+\);?/);
                if (otherMatch) {
                    const insertPos = otherMatch.index + otherMatch[0].length;
                    const sortCode = `
        // ============== 关键：给 other 排序（电影分类靠前，其他靠后） ==============
        other.sort((a, b) => {
            const isAMovie = MOVIE_PRIORITY_TYPES.includes(a.type_name);
            const isBMovie = MOVIE_PRIORITY_TYPES.includes(b.type_name);
            if (isAMovie && !isBMovie) return -1;
            if (!isAMovie && isBMovie) return 1;
            return 0;
        });`;
                    content = content.slice(0, insertPos) + sortCode + content.slice(insertPos);
                }
            }
        }
        
        fs.writeFileSync(filePath, content, 'utf-8');
        return true;
    } catch (e) {
        console.error(`添加排序代码失败 ${filePath}:`, e.message);
        return false;
    }
}

// ============== 主函数 ==============

async function main() {
    console.log('=============================================');
    console.log('  源管理工具 - 开始执行');
    console.log('=============================================\n');
    
    // 1. 读取CSV
    console.log('步骤1: 读取CSV文件...');
    let csvData = readCSV();
    console.log(`  读取到 ${csvData.length} 条记录\n`);
    
    // 2. 获取当前目录的JS文件
    console.log('步骤2: 获取当前目录文件...');
    const currentFiles = fs.readdirSync(CY_DIR).filter(f => f.endsWith('.js') && f !== 'api_test_results.csv');
    console.log(`  当前目录有 ${currentFiles.length} 个JS文件\n`);
    
    // 3. 合并CSV和当前文件
    console.log('步骤3: 合并源信息...');
    const fileMap = new Map();
    
    // 添加CSV中的文件
    csvData.forEach(row => {
        if (row.FileName) {
            fileMap.set(row.FileName, {
                FileName: row.FileName,
                APIUrl: row.APIUrl,
                Status: row.Status,
                StatusCode: row.StatusCode,
                exists: currentFiles.includes(row.FileName)
            });
        }
    });
    
    // 添加当前目录中不在CSV的文件
    currentFiles.forEach(file => {
        if (!fileMap.has(file)) {
            const apiUrl = extractApiUrl(path.join(CY_DIR, file));
            fileMap.set(file, {
                FileName: file,
                APIUrl: apiUrl || '',
                Status: 'Unknown',
                StatusCode: '',
                exists: true
            });
        }
    });
    
    const allFiles = Array.from(fileMap.values());
    console.log(`  共 ${allFiles.length} 个源需要处理\n`);
    
    // 4. 测试所有存在的源
    console.log('步骤4: 测试源的可用性...');
    const testResults = [];
    
    for (const file of allFiles) {
        const filePath = path.join(CY_DIR, file.FileName);
        
        if (!file.exists) {
            console.log(`  [跳过] ${file.FileName} - 文件不存在`);
            testResults.push(file);
            continue;
        }
        
        console.log(`  [测试] ${file.FileName}...`);
        
        // 提取API URL
        const apiUrl = extractApiUrl(filePath) || file.APIUrl;
        
        // 测试API
        const { status, statusCode } = await testApiUrl(apiUrl);
        
        // 检查是否有排序代码
        const hasSort = hasSortCode(filePath);
        
        testResults.push({
            FileName: file.FileName,
            APIUrl: apiUrl,
            Status: status,
            StatusCode: statusCode,
            HasSortCode: hasSort
        });
        
        console.log(`    API: ${apiUrl || 'N/A'}`);
        console.log(`    状态: ${status} (${statusCode})`);
        console.log(`    排序代码: ${hasSort ? '✓ 有' : '✗ 无'}`);
        
        await new Promise(r => setTimeout(r, 300));
    }
    
    // 5. 更新CSV
    console.log('\n步骤5: 更新CSV文件...');
    const csvUpdateData = testResults.map(r => ({
        FileName: r.FileName,
        APIUrl: r.APIUrl,
        Status: r.Status,
        StatusCode: r.StatusCode
    }));
    writeCSV(csvUpdateData);
    
    // 6. 处理文件 - 删除失效源，给有效源添加排序代码
    console.log('\n步骤6: 处理文件...');
    let deletedCount = 0;
    let updatedCount = 0;
    
    for (const result of testResults) {
        const filePath = path.join(CY_DIR, result.FileName);
        
        if (!result.exists) {
            continue;
        }
        
        if (result.Status === 'Error') {
            // 删除失效源
            try {
                fs.unlinkSync(filePath);
                console.log(`  [删除] ${result.FileName} - 源失效`);
                deletedCount++;
            } catch (e) {
                console.log(`  [错误] 删除失败 ${result.FileName}:`, e.message);
            }
        } else if (result.Status === 'Valid' && !result.HasSortCode) {
            // 给有效源添加排序代码
            console.log(`  [更新] ${result.FileName} - 添加排序代码`);
            if (addSortCodeToFile(filePath)) {
                updatedCount++;
                console.log(`    ✓ 成功`);
            }
        }
    }
    
    // 7. 总结
    console.log('\n=============================================');
    console.log('  执行完成总结');
    console.log('=============================================');
    console.log(`  总源数: ${allFiles.length}`);
    console.log(`  有效源: ${testResults.filter(r => r.Status === 'Valid').length}`);
    console.log(`  失效源: ${testResults.filter(r => r.Status === 'Error').length}`);
    console.log(`  删除源: ${deletedCount}`);
    console.log(`  更新源: ${updatedCount}`);
    console.log('=============================================');
}

main();
