const fs = require('fs');
const path = require('path');

const CY_DIR = path.join(__dirname, '../CY_影视');

function encodeFileName(fileName) {
    const parts = fileName.split('.js');
    const namePart = parts[0];
    const encodedName = encodeURIComponent(namePart);
    return `${encodedName}.js`;
}

function getFileNameFromUrl(url) {
    const parts = url.split('/');
    const fileNamePart = parts[parts.length - 1];
    return fileNamePart;
}

const files = fs.readdirSync(CY_DIR).filter(f => f.endsWith('.js') && f !== 'api_test_results.csv');

const issues = [];

for (const fileName of files) {
    const filePath = path.join(CY_DIR, fileName);
    const content = fs.readFileSync(filePath, 'utf-8');
    
    const urlMatch = content.match(/@downloadURL\s+(.+)/);
    if (!urlMatch) {
        issues.push({ fileName, error: '无@downloadURL' });
        continue;
    }
    
    const url = urlMatch[1];
    const urlFileName = getFileNameFromUrl(url);
    const expectedEncodedName = encodeFileName(fileName);
    
    if (urlFileName !== expectedEncodedName) {
        issues.push({
            fileName,
            urlFileName,
            expected: expectedEncodedName,
            url
        });
    }
}

console.log(`共检查 ${files.length} 个文件`);
console.log(`发现 ${issues.length} 个问题`);

if (issues.length > 0) {
    console.log('\n问题列表:');
    issues.forEach(issue => {
        console.log(`\n文件: ${issue.fileName}`);
        if (issue.error) {
            console.log(`  错误: ${issue.error}`);
        } else {
            console.log(`  URL中的文件名: ${issue.urlFileName}`);
            console.log(`  期望文件名: ${issue.expected}`);
        }
    });
} else {
    console.log('\n✅ 所有文件的@downloadURL都正确！');
}
