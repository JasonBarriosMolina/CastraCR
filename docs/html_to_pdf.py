import asyncio
from playwright.async_api import async_playwright
import os

async def html_to_pdf():
    html_path = r"D:\InHouse\CastraCR\docs\piloto.html"
    pdf_path  = r"D:\InHouse\CastraCR\docs\piloto.pdf"

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1200, "height": 900})

        # Load local HTML file
        await page.goto(f"file:///{html_path.replace(chr(92), '/')}")

        # Wait for fonts/images to settle
        await page.wait_for_timeout(2000)

        await page.pdf(
            path=pdf_path,
            format="A4",
            print_background=True,   # keep gradients, colors, backgrounds
            margin={
                "top": "0",
                "bottom": "0",
                "left": "0",
                "right": "0",
            },
            prefer_css_page_size=False,
        )

        await browser.close()
        size_kb = os.path.getsize(pdf_path) // 1024
        print(f"PDF generado: {pdf_path} ({size_kb} KB)")

asyncio.run(html_to_pdf())
