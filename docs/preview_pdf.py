import asyncio
from playwright.async_api import async_playwright

async def preview():
    html_path = r"D:\InHouse\CastraCR\docs\piloto.html"

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 900, "height": 1200})
        await page.goto(f"file:///{html_path.replace(chr(92), '/')}")
        await page.wait_for_timeout(1500)

        # Screenshot top section
        await page.screenshot(path=r"D:\InHouse\CastraCR\docs\preview_top.png", clip={"x":0,"y":0,"width":900,"height":1100})
        await browser.close()
        print("Preview guardado.")

asyncio.run(preview())
