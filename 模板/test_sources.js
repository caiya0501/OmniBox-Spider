const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const CY_DIR = path.join(__dirname, '../CY_影视');

function extractApiUrl(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const match = content.match(/const\s+SITE_API\s*=\s*["']([^"']+)["']/);
        return match ? match[1] : null;
    } catch (e) {
        console.error(`Error reading ${filePath}: ${e}`);
        return null;
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

async function main() {
    const jsFiles = fs.readdirSync(CY_DIR).filter(f => f.endsWith('.js'));
    const results = [];

    console.log(`Found ${jsFiles.length} JS files to test\n`);

    for (const filename of jsFiles) {
        const filePath = path.join(CY_DIR, filename);
        console.log(`Testing ${filename}...`);

        const apiUrl = extractApiUrl(filePath);
        if (apiUrl) {
            console.log(`  API: ${apiUrl}`);
            const { status, statusCode } = await testApiUrl(apiUrl);
            console.log(`  Status: ${status} (${statusCode})`);
            results.push([filename, apiUrl, status, statusCode]);
        } else {
            console.log(`  No SITE_API found`);
            results.push([filename, '', 'Error', 'No SITE_API']);
        }

        console.log();
        await new Promise(r => setTimeout(r, 500));
    }

    const csvPath = path.join(__dirname, 'api_test_results_new.csv');
    const csvContent = [
        ['FileName', 'APIUrl', 'Status', 'StatusCode'],
        ...results
    ].map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');

    fs.writeFileSync(csvPath, '\ufeff' + csvContent, 'utf-8');
    console.log(`Results saved to ${csvPath}`);
    return results;
}

main();
