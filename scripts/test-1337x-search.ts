/**
 * Test 1337x search functionality through Cloudflare bypass
 */

import 'dotenv/config';
import { getCaptchaSolver } from '../src/lib/server/captcha';

const SEARCH_URL = 'https://1337x.to/search/linux/1/';

async function main() {
    console.log('Testing 1337x search through Cloudflare bypass...\n');
    
    const solver = getCaptchaSolver();
    solver.start();
    
    // Wait for ready
    while (solver.status !== 'ready' && solver.status !== 'error') {
        await new Promise(r => setTimeout(r, 100));
    }
    
    if (solver.status === 'error') {
        console.error('Solver failed to initialize');
        process.exit(1);
    }
    
    console.log('Searching for "linux" (legal/open source content)...\n');
    
    const result = await solver.fetch({
        url: SEARCH_URL,
        timeout: 60
    });
    
    if (!result.success) {
        console.error('Fetch failed:', result.error);
        await solver.stop();
        process.exit(1);
    }
    
    console.log(`Status: ${result.status}`);
    console.log(`Body length: ${result.body.length} bytes`);
    console.log(`Time: ${result.timeMs}ms\n`);
    
    // Parse some results to show it works
    const titleMatches = result.body.match(/<a href="\/torrent\/[^"]+">([^<]+)<\/a>/g);
    
    if (titleMatches && titleMatches.length > 0) {
        console.log('Search results found:');
        titleMatches.slice(0, 5).forEach((match, i) => {
            const title = match.replace(/<[^>]+>/g, '').trim();
            console.log(`  ${i + 1}. ${title}`);
        });
        console.log('\nCloudflare bypass and search working correctly!');
    } else {
        console.log('No results found or parsing issue');
    }
    
    await solver.stop();
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
