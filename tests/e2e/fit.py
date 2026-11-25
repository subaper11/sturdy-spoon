"""Adaptive fit of the default layouts: free room is used on tall phones / big screens, nothing overflows, floating and short layouts untouched. Run: python3 tests/e2e/fit.py"""
import subprocess, sys, os
from pathlib import Path
from playwright.sync_api import sync_playwright
HERE = Path(__file__).parent; PORT = os.environ.get("PORT", "8766"); BASE = f"http://localhost:{PORT}"
passed = failed = 0
def ok(c, m):
    global passed, failed
    if c: passed += 1
    else: failed += 1; print("  FAIL:", m)
srv = subprocess.Popen(["node", str(HERE / "server.mjs")], env={**os.environ, "PORT": PORT}, stdout=subprocess.PIPE, text=True); srv.stdout.readline()
errors = []
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); ctx0 = br.new_context(viewport={"width": 1280, "height": 800}); ctx0.add_init_script("try{if(!sessionStorage.getItem('fd')){localStorage.setItem('scrabble.firstdraw','off');}}catch(e){}"); pg = ctx0.new_page()
        pg.on("pageerror", lambda e: errors.append(str(e))); pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        ev = lambda expr: pg.evaluate("async () => { const m = await import('/js/state.js'); const {S, app} = m; return (" + expr + ") }")
        pg.goto(BASE + "/"); pg.wait_for_selector("#coverPlay"); pg.click("#coverPlay")
        pg.wait_for_selector("#md[open]"); pg.click("#mf .btn >> nth=0"); pg.wait_for_selector("#sd[open]"); pg.click("#sf .btn >> nth=2")
        pg.wait_for_selector("#dlg[open]"); pg.click("#dF .btn >> nth=0")
        pg.wait_for_function("document.querySelectorAll('#rk0 .tile').length===7")
        def probe(w, h):
            pg.set_viewport_size({"width": w, "height": h}); pg.wait_for_timeout(500)
            return pg.evaluate("""(() => { const R = document.documentElement, els = [...document.querySelectorAll('#board,.panel,#ctrls')].map(e => e.getBoundingClientRect());
              return { fit: R.dataset.fit || '', fill: +(R.style.getPropertyValue('--fill') || 1), board: document.querySelector('#board').getBoundingClientRect().width,
                bottom: innerHeight - Math.max(...els.map(r => r.bottom)), top: Math.min(...els.map(r => r.top)), v: R.scrollHeight - innerHeight, h: R.scrollWidth - innerWidth }; })()""")
        for (w, h) in [(360, 800), (412, 915), (390, 844), (820, 1180)]:
            r = probe(w, h)
            ok(r["fit"] == "portrait" and r["fill"] > 1.2 and r["v"] <= 0 and r["h"] <= 0 and abs(r["top"] - r["bottom"]) < 6, f"{w}x{h}: portrait fit fills the screen, no scrolling, the rest is split above / below: {r}")
        r = probe(360, 640); ok(r["fit"] == "" and r["h"] <= 0, f"360x640 (does not fit even as designed): left exactly as designed: {r}")
        r = probe(1366, 768); ok(r["fit"] == "wide" and r["h"] <= 0 and r["v"] <= 0, f"1366x768: wide fit, no overflow: {r}")
        r = probe(1920, 1080); ok(r["board"] > 900 and r["fill"] > 1.2 and r["v"] <= 0 and r["h"] <= 0, f"1920x1080: the board is past the old 880 px cap and the side column grew: {r}")
        r = probe(2560, 1440); ok(r["board"] > 1200 and r["v"] <= 0 and r["h"] <= 0, f"2560x1440: the board uses the height: {r}")
        pg.evaluate("document.documentElement.dataset.layout = 'duel'"); pg.wait_for_timeout(300)
        ok(pg.evaluate("document.documentElement.dataset.fit || ''") == "", "the Duel layout is not touched")
        ok(not errors, f"no page errors: {errors[:2]}")
        br.close()
finally:
    srv.terminate()
print(f"{passed} passed, {failed} failed"); sys.exit(1 if failed else 0)
