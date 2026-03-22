const fs = require('fs');

async function searchDdgLite(query) {
    console.log("Searching...", query);
    const resp = await fetch('https://lite.duckduckgo.com/lite/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        },
        body: 'q=' + encodeURIComponent(query)
    });
    console.log('Status: ', resp.status);
    const html = await resp.text();
    fs.writeFileSync('lite.html', html);

    const results = [];
    const rows = html.split('<tr');
    
    let currentResult = null;
    
    for (const row of rows) {
        if (row.includes('class="result-snippet"')) {
            const snippetMatch = row.match(/class="result-snippet"[^>]*>([\s\S]*?)<\/td>/i);
            if (currentResult && snippetMatch) {
                currentResult.snippet = snippetMatch[1].replace(/<[^>]+>/g, '').trim();
                results.push(currentResult);
                currentResult = null;
            }
        } else if (row.includes('class="result-title"')) {
            const titleMatch = row.match(/class="result-title"[^>]*>([\s\S]*?)<\/a>/i);
            const linkMatch = row.match(/href="([^"]+)"/i);
            
            if (titleMatch && linkMatch) {
                // Ignore duckduckgo internal links
                if (!linkMatch[1].startsWith('/lite')) {
                    currentResult = {
                        title: titleMatch[1].replace(/<[^>]+>/g, '').trim(),
                        url: linkMatch[1],
                        domain: '',
                        snippet: ''
                    };
                    
                    // decode url if it's via ddg tracker
                    if (currentResult.url.includes('uddg=')) {
                        try {
                            const u = new URL('https://duckduckgo.com' + currentResult.url);
                            currentResult.url = decodeURIComponent(u.searchParams.get('uddg'));
                        } catch {}
                    }
                    try {
                        currentResult.domain = new URL(currentResult.url).hostname.replace('www.', '');
                    } catch {}
                }
            }
        }
    }
    
    console.log('Found ', results.length, ' results');
    console.log(results.slice(0, 2));
}

searchDdgLite('quantum computing latest news');
