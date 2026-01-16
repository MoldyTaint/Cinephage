import 'dotenv/config';
import { getCamoufoxManager } from '../src/lib/server/captcha';

async function main() {
    const manager = getCamoufoxManager();
    await manager.waitForAvailabilityCheck();
    
    if (!manager.browserAvailable()) {
        console.error('Browser not available');
        process.exit(1);
    }
    
    console.log('Fetching 1337x trending movies...\n');
    
    const managed = await manager.createBrowser({ headless: true });
    
    try {
        await managed.page.goto('https://1337x.to/trending/d/movies/', {
            timeout: 60000,
            waitUntil: 'networkidle'
        });
        
        // Just wait for the page to settle
        await managed.page.waitForTimeout(3000);
        
        const content = await managed.page.content();
        
        // Extract movie titles
        const regex = /<a href="\/torrent\/\d+\/[^"]+">([^<]+)<\/a>/g;
        const movies: string[] = [];
        let match;
        
        while ((match = regex.exec(content)) !== null) {
            const title = match[1].trim();
            if (title && !movies.includes(title) && title.length > 5) {
                movies.push(title);
            }
        }
        
        console.log('Trending movies on 1337x today:\n');
        movies.slice(0, 10).forEach((m, i) => {
            console.log(`  ${i + 1}. ${m}`);
        });
        
    } finally {
        await manager.closeBrowser(managed);
    }
}

main().catch(console.error);
