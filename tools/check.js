/* 배포 전 점검. 실제 브라우저로 끝까지 풀어 보고 수치를 잰다.
     node tools/check.js
   - 다섯 문항 2단 응답 전 구간 (뒤로가기 포함)
   - 가로 넘침 (모바일 390 / 데스크톱 900)
   - 본문 글자 대비 WCAG AA 4.5:1
   - 응답 0건 / 120건 / 341건에서의 표시
   - 공유 카드 생성
   Supabase 는 건드리지 않는다. 브라우저 저장소만 쓴다. */
const {chromium} = require('playwright');
const path = require('path'), fs = require('fs'), http = require('http');

/* file:// 로 열면 같은 폴더의 이미지를 그린 캔버스가 '오염'돼 카드를 내보낼 수
   없다. 실제 배포는 http 라서 생기지 않는 문제이므로, 검사도 http 로 띄운다. */
const ROOT = path.resolve(__dirname, '..');
const MIME = {'.html':'text/html','.jpg':'image/jpeg','.png':'image/png',
              '.txt':'text/plain','.xml':'application/xml','.json':'application/json'};
function serve(){
  return new Promise(res=>{
    const srv = http.createServer((req,rep)=>{
      const rel = decodeURIComponent(req.url.split('?')[0]);
      const file = path.join(ROOT, rel === '/' ? 'index.html' : rel);
      if(!file.startsWith(ROOT) || !fs.existsSync(file)){ rep.writeHead(404); return rep.end(); }
      rep.writeHead(200, {'Content-Type': MIME[path.extname(file)] || 'application/octet-stream'});
      fs.createReadStream(file).pipe(rep);
    });
    srv.listen(0, '127.0.0.1', ()=>res(srv));
  });
}
let FILE;

const lin = c => { c/=255; return c<=.03928 ? c/12.92 : Math.pow((c+.055)/1.055, 2.4); };
const lum = ([r,g,b]) => .2126*lin(r) + .7152*lin(g) + .0722*lin(b);
const rgb = s => (s.match(/\d+(\.\d+)?/g) || ['0','0','0']).slice(0,3).map(Number);

async function run(browser, label, width, seed){
  const page = await browser.newPage({viewport:{width, height:860}, deviceScaleFactor:2});
  const bad = [];
  page.on('pageerror', e => bad.push(`${label}: JS 오류 ${e.message}`));

  await page.goto(FILE);
  await page.evaluate(() => { SUPABASE.url=''; SUPABASE.key=''; });   // 실제 DB 차단
  if (seed) {
    await page.evaluate(n => {
      const sizes=[2,2,2,3,3], rows=[]; let s=42;
      const rnd=()=>{ s=(s*1103515245+12345)&0x7fffffff; return s/0x7fffffff; };
      for(let i=0;i<n;i++) rows.push({
        path: sizes.map(k=>`${Math.floor(rnd()*k)}${Math.floor(rnd()*4)}`).join('-'),
        hcq:60, type:'x'});
      localStorage.setItem('conscience_v1', JSON.stringify(rows));
    }, seed);
  }
  await page.reload();
  await page.evaluate(() => { SUPABASE.url=''; SUPABASE.key=''; });
  await page.waitForSelector('.opt', {timeout:8000});

  for (let i=0; i<10; i++){
    const opts = await page.$$('.opt');
    await opts[i % opts.length].click();
    if (i === 3) {                                   // 뒤로가기도 한 번 건드린다
      await page.click('#back');
      await page.waitForSelector('.opt');
      (await page.$$('.opt'))[0].click();
    }
    await page.waitForTimeout(70);
  }
  await page.waitForSelector('.ko', {timeout:8000});

  const r = await page.evaluate(() => ({
    type: document.querySelector('.ko')?.textContent,
    axes: [...document.querySelectorAll('.ax .v')].map(e => e.textContent),
    rare: document.querySelector('.rare-line .big')?.textContent.replace(/\s+/g,' ') || null,
    wait: document.querySelector('.waiting')?.textContent.replace(/\s+/g,' ') || null,
    overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
    canvas: document.querySelector('#cv')?.clientHeight || 0,
  }));
  if (r.overflow > 0) bad.push(`${label}: 가로로 ${r.overflow}px 넘친다`);
  if (r.canvas < 100) bad.push(`${label}: 좌표 그림 높이가 ${r.canvas}px`);

  const texts = await page.evaluate(() => {
    const bgOf = el => {
      for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
        const c = getComputedStyle(n).backgroundColor;
        if (c && c !== 'rgba(0, 0, 0, 0)' && !/,\s*0\)$/.test(c)) return c;
      }
      return getComputedStyle(document.body).backgroundColor;
    };
    return [...document.querySelectorAll('.wrap *')].flatMap(el => {
      if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return [];
      const st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden' || +st.opacity === 0) return [];
      return [{fg: st.color, bg: bgOf(el), px: parseFloat(st.fontSize),
               weight: st.fontWeight, text: el.textContent.trim().slice(0,24),
               sel: el.className || el.tagName.toLowerCase()}];
    });
  });
  texts.forEach(t => {
    const a = lum(rgb(t.fg)), b = lum(rgb(t.bg));
    const ratio = (Math.max(a,b) + .05) / (Math.min(a,b) + .05);
    const large = t.px >= 24 || (t.px >= 18.66 && +t.weight >= 700);
    const need = large ? 3 : 4.5;
    if (ratio < need) bad.push(`${label}: 대비 ${ratio.toFixed(2)} (${need} 필요) · ${t.px}px "${t.text}"`);
  });

  const cardBytes = await page.evaluate(async () => (await makeCard(S.last)).size);

  console.log(`\n■ ${label}`);
  console.log(`  유형 ${r.type} · 따뜻함 ${r.axes[0]} · 희귀함 ${r.axes[1]}`);
  console.log(`  ${r.rare || r.wait}`);
  console.log(`  넘침 ${r.overflow}px · 좌표 ${r.canvas}px · 글자 ${texts.length}개 검사 · 카드 ${cardBytes.toLocaleString()} bytes`);
  await page.close();
  return bad;
}

(async () => {
  const srv = await serve();
  FILE = 'http://127.0.0.1:' + srv.address().port + '/';
  const browser = await chromium.launch();
  const bad = [];
  bad.push(...await run(browser, '모바일 390 · 응답 0건',   390, 0));
  bad.push(...await run(browser, '모바일 390 · 응답 120건', 390, 120));
  bad.push(...await run(browser, '데스크톱 900 · 응답 341건', 900, 341));
  await browser.close();
  srv.close();
  console.log('\n' + (bad.length
    ? '✗ 문제 ' + bad.length + '건\n' + bad.map(x => '  - ' + x).join('\n')
    : '✓ 전부 통과'));
  process.exit(bad.length ? 1 : 0);
})();
