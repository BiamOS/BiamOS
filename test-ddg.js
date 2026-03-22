const fs = require('fs');
async function searchDdg(query) {
    const searchUrl = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query);
    const resp = await fetch(searchUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9',
        },
    });
    console.log('Status: ', resp.status);
    const html = await resp.text();
    console.log('Length: ', html.length);
    fs.writeFileSync('ddg-output.html', html);
    const blocks = html.split(/class="result__title"/i);
    console.log('Blocks: ', blocks.length);
}
searchDdg('quantum computing');
