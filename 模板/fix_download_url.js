const fs = require('fs');
const path = require('path');
const url = require('url');

const CY_DIR = path.join(__dirname, '../CY_影视');

function encodePath(filePath) {
    return filePath.split(/[/\\]/).map(part => {
        return encodeURIComponent(part);
    }).join('/');
}

function extractDownloadUrl(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const match = content.match(/@downloadURL\s+(.+)/);
        return match ? match[1].trim() : null;
    } catch (e) {
        return null;
    }
}

function getExpectedDownloadUrl(fileName) {
    const encodedFileName = encodePath(fileName);
    return `https://raw.githubusercontent.com/caiya0501/OmniBox-Spider/refs/heads/main/CY_%E5%BD%B1%E8%A7%86/${encodedFileName}`;
}

function checkAndFixFile(filePath, fileName) {
    const currentUrl = extractDownloadUrl(filePath);
    if (!currentUrl) {
        console.log(`  [无@downloadURL] ${fileName}`);
        return false;
    }

    const expectedUrl = getExpectedDownloadUrl(fileName);
    const currentParsed = url.parse(currentUrl);
    const expectedParsed = url.parse(expectedUrl);

    if (currentParsed.path !== expectedParsed.path) {
        console.log(`  [需要修复] ${fileName}`);
        console.log(`    当前: ${currentParsed.path}`);
        console.log(`    期望: ${expectedParsed.path}`);

        // 修复文件
        try {
            let content = fs.readFileSync(filePath, 'utf-8');
            content = content.replace(/@downloadURL\s+.+/, `@downloadURL ${expectedUrl}`);
            fs.writeFileSync(filePath, content, 'utf-8');
            console.log(`    ✓ 已修复`);
            return true;
        } catch (e) {
            console.log(`    ✗ 修复失败: ${e.message}`);
            return false;
        }
    } else {
        console.log(`  [正确] ${fileName}`);
        return false;
    }
}

function main() {
    console.log('开始检查 @downloadURL...\n');

    const jsFiles = fs.readdirSync(CY_DIR).filter(f => f.endsWith('.js') && f !== 'api_test_results.csv');
    let fixedCount = 0;

    for (const fileName of jsFiles) {
        const filePath = path.join(CY_DIR, fileName);
        if (checkAndFixFile(filePath, fileName)) {
            fixedCount++;
        }
    }

    console.log(`\n检查完成，共修复 ${fixedCount} 个文件`);
}

main();
