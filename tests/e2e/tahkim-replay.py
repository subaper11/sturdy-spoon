"""Press-and-hold Tahkim and the replay of a finished game, in a real browser (local play). Run: python3 tests/e2e/tahkim-replay.py"""
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
        def move(cells):
            for (r, c) in cells:
                pg.locator(".panel.on .slot .tile").first.click(); pg.click(f"#board > .sq:nth-child({r * 15 + c + 1})")
            pg.click("#bSubmit"); pg.wait_for_timeout(450)
        move([(7, 7), (7, 8)])
        ok(ev("S.hist[0].tl.length") == 2 and ev("S.hist[0].tl[0].l.length") >= 1, "the history entry records the tiles as placed (letters + positions)")
        ok(pg.locator("#bJudge").is_hidden() and pg.locator("html[data-tkq]").count() == 1 and pg.locator("#board .sq.tkq").count() == 2, "no Tahkim button; the opponent's word is marked as challengeable")
        box = pg.locator("#board .sq.tkq").first.bounding_box()
        pg.mouse.move(box["x"] + 6, box["y"] + 6); pg.mouse.down(); pg.wait_for_timeout(300)
        ok(pg.locator(".tkRing").count() == 1, "holding the word fills a ring")
        pg.mouse.up(); pg.wait_for_timeout(200)
        ok(pg.locator(".tkRing").count() == 0 and pg.locator("#jd[open]").count() == 0, "releasing early cancels (no Tahkim)")
        pg.mouse.move(box["x"] + 6, box["y"] + 6); pg.mouse.down(); pg.wait_for_timeout(900); pg.mouse.up()
        pg.wait_for_selector("#jd[open]"); ok(True, "holding long enough opens Tahkim")
        pg.click('#jB [data-a="no"]'); pg.wait_for_timeout(400)
        ok(pg.locator(".tkStamp.void").count() == 1 and ev("S.hist[0].st") == "void", "the verdict lands as a stamp on the word")
        pg.wait_for_timeout(2400)
        move([(7, 7), (7, 8)]); move([(6, 7), (6, 8)]); move([(8, 7), (8, 8)])
        pg.evaluate("async () => { const g = await import('/js/game.js'); g.endGame('time'); }"); pg.wait_for_selector("#dlg.result[open]")
        ok(pg.locator("#bReplay").is_visible() and pg.locator(".resReplay").count() == 1, "finished game: replay button in the result and in the tools")
        pg.click(".resReplay"); pg.wait_for_selector("#rpOv.on")
        steps = int(pg.evaluate("document.querySelector('.rpRange').max"))
        ok(steps >= 5 and not pg.evaluate("document.querySelector('#dlg').open"), f"replay opens ({steps} steps), the result dialog closed without starting a new game")
        pg.evaluate("(() => { const r = document.querySelector('.rpRange'); r.value = r.max; r.dispatchEvent(new Event('input')); })()")
        nums = pg.evaluate("[...document.querySelectorAll('.rpNum')].map(x => +x.textContent)"); fin = ev("app.lastResult.rows.map(r => r.score)")
        ok(nums == fin, f"the last step shows the settled scores: {nums} vs {fin}")
        pg.evaluate("(() => { const r = document.querySelector('.rpRange'); r.value = 1; r.dispatchEvent(new Event('input')); })()")
        ok(pg.locator("#rpBoard .tile").count() == 2 and pg.locator(".rpChip").is_visible(), "step 1: the first word is on the board with its chip")
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
        ok(pg.locator("#rpOv").count() == 0 and pg.locator("#bReplay").is_visible(), "Esc closes the replay; the tools button still reopens it")
        ok(not errors, f"no page errors: {errors[:2]}")
        br.close()
finally:
    srv.terminate()
print(f"{passed} passed, {failed} failed"); sys.exit(1 if failed else 0)
