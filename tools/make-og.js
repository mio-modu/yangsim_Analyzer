/* 링크 미리보기 이미지(og.jpg, 1200x630)를 다시 그린다.
     node tools/make-og.js
   tools/og-template.html 을 띄워 찍은 뒤 JPEG 로 저장한다. 글꼴은 구글폰트를
   받아 쓰므로 네트워크가 필요하다. */
const {chromium} = require('playwright');
const fs = require('fs'), path = require('path');

(async () => {
  const b64 = fs.readFileSync(path.join(__dirname,'..','assets','bg.jpg')).toString('base64');
  const html = fs.readFileSync(path.join(__dirname,'og-template.html'),'utf8')
                 .replace('__BG__', b64);
  const tmp = path.join(__dirname, '.og-build.html');
  fs.writeFileSync(tmp, html);

  const browser = await chromium.launch();
  const page = await browser.newPage({viewport:{width:1200,height:630}, deviceScaleFactor:1});
  await page.goto('file://' + tmp);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(900);
  const png = path.join(__dirname, '.og-build.png');
  await page.screenshot({path: png});
  await browser.close();
  fs.unlinkSync(tmp);

  console.log('찍었다:', png);
  console.log('JPEG 로 바꾸려면:');
  console.log("  python3 -c \"from PIL import Image; Image.open('tools/.og-build.png').convert('RGB').save('og.jpg','JPEG',quality=84,optimize=True,progressive=True)\"");
})();
