// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 BiamOS Contributors
// ─── Injected DOM Scripts ───────────────────────────────────
// Pure functions that build JS strings for webview.executeJavaScript().
// No React dependencies — these are DOM-level operations.

// ─── Click at Coordinates ───────────────────────────────────
// Includes: z-index overlay check, hover injection, full click sequence.

export function buildClickAtScript(x: number, y: number): string {
    const rx = Math.round(x);
    const ry = Math.round(y);
    return `
    (function() {
        const x = ${rx}, y = ${ry};
        const el = document.elementFromPoint(x, y);
        if (!el) return JSON.stringify({ success: false, error: 'No element at (' + x + ', ' + y + ')' });

        el.scrollIntoView({ block: 'nearest' });
        const topEl = document.elementFromPoint(x, y);
        if (topEl && topEl !== el && !el.contains(topEl) && !topEl.contains(el)) {
            const blocker = topEl.tagName.toLowerCase() + (topEl.className ? '.' + String(topEl.className).split(' ')[0] : '');
            return JSON.stringify({ success: false, error: 'Element blocked by overlay: ' + blocker + ' at (' + x + ', ' + y + ')' });
        }
        const clickTarget = topEl || el;

        const hoverOpts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };
        clickTarget.dispatchEvent(new MouseEvent('mousemove', hoverOpts));
        clickTarget.dispatchEvent(new MouseEvent('mouseenter', { ...hoverOpts, bubbles: false }));
        clickTarget.dispatchEvent(new MouseEvent('mouseover', hoverOpts));

        const opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };
        clickTarget.dispatchEvent(new MouseEvent('mousedown', opts));
        clickTarget.dispatchEvent(new MouseEvent('mouseup', opts));
        clickTarget.dispatchEvent(new MouseEvent('click', opts));
        return JSON.stringify({ success: true, x: x, y: y, tag: clickTarget.tagName.toLowerCase() });
    })()`;
}

// ─── Focus + Detect (for native typing) ─────────────────────
// Finds the editable element at x,y. Walks up/down DOM tree.
// Returns: { success, isContentEditable, tag }

export function buildFocusScript(x: number, y: number): string {
    const rx = Math.round(x);
    const ry = Math.round(y);
    const parts: string[] = [];
    parts.push('(function(){try{');
    parts.push('var el=document.elementFromPoint(' + rx + ',' + ry + ');');
    parts.push('if(!el)return JSON.stringify({success:false,error:"No element at coordinates"});');
    parts.push('function isEd(e){return e.tagName==="INPUT"||e.tagName==="TEXTAREA"||e.isContentEditable;}');
    parts.push('if(!isEd(el)){');
    parts.push('var p=el.closest("input,textarea,[contenteditable=true],[contenteditable=plaintext-only],[role=textbox]");');
    parts.push('if(p){el=p;}else{');
    parts.push('var c=el.querySelector("input,textarea,[contenteditable=true],[contenteditable=plaintext-only],[role=textbox]");');
    parts.push('if(c){el=c;}else{');
    // Global fallback: nearest visible contenteditable in viewport
    parts.push('var allCE=document.querySelectorAll("[contenteditable=true],[contenteditable=plaintext-only],[role=textbox]");');
    parts.push('var best=null,bestDist=Infinity;');
    parts.push('for(var i=0;i<allCE.length;i++){');
    parts.push('var r=allCE[i].getBoundingClientRect();');
    parts.push('if(r.width>0&&r.height>0&&r.top>=0&&r.bottom<=window.innerHeight){');
    parts.push('var dx=(' + rx + ')-(r.x+r.width/2),dy=(' + ry + ')-(r.y+r.height/2);');
    parts.push('var dist=Math.sqrt(dx*dx+dy*dy);');
    parts.push('if(dist<bestDist){bestDist=dist;best=allCE[i];}');
    parts.push('}');
    parts.push('}');
    parts.push('if(best){el=best;}');
    parts.push('}}');
    parts.push('}');
    parts.push('if(!isEd(el))return JSON.stringify({success:false,error:"No editable element found"});');
    parts.push('el.focus();');
    parts.push('var isCE=el.isContentEditable&&el.tagName!=="INPUT"&&el.tagName!=="TEXTAREA";');
    // NOTE: Clearing is handled natively via Ctrl+A → Delete in the type_text handler.
    parts.push('return JSON.stringify({success:true,isContentEditable:isCE,tag:el.tagName.toLowerCase()});');
    parts.push('}catch(e){return JSON.stringify({success:false,error:e.message});}})()');
    return parts.join('');
}

// ─── Scroll ─────────────────────────────────────────────────

export function buildScrollScript(direction: "up" | "down", amount: number): string {
    const pixels = direction === "down" ? amount : -amount;
    return `
    (function() {
        window.scrollBy({ top: ${pixels}, behavior: 'smooth' });
        return JSON.stringify({ success: true });
    })()`;
}

// ─── GenUI Data-URI Builder ─────────────────────────────────
// Injects a bridge script into LLM-generated HTML so that
// onclick="triggerAgent('...')" sends intents back to BiamOS.

export function buildGenUIDataUri(html: string): string {
    const bridge = `<script>
        window.biam = {
            prefillCommand: function(command) {
                console.log('BIAM_PREFILL:' + command);
            }
        };
        document.addEventListener('click', function(e) {
            const a = e.target.closest('a[href]');
            if (a && a.href && !a.href.startsWith('javascript:') && !a.href.startsWith('data:')) {
                e.preventDefault();
                e.stopPropagation();
                console.log('BIAM_NAVIGATE:' + a.href);
            }
        }, true);
    </script>`;
    const finalHtml = html.includes('</body>')
        ? html.replace('</body>', bridge + '</body>')
        : html + bridge;
    return 'data:text/html;charset=utf-8;base64,' + btoa(unescape(encodeURIComponent(finalHtml)));
}
