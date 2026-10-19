// Run with: npx electron scripts/prepare-readme-media.cjs (requires ffmpeg).
// Uses an isolated example save; never captures the desktop or personal windows.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'docs/images');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'comtriever-readme-'));
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', path.join(temporary, 'profile'));
fs.mkdirSync(app.getPath('userData'), { recursive: true });
const now = Date.now();
fs.writeFileSync(path.join(app.getPath('userData'), 'state.json'), JSON.stringify({
  launchAtLogin: false, wanderEnabled: false,
  progress: { xp: 139, firstMet: now - 3 * 86400000, fullness: 82, fedAt: now,
    counts: { pet: 12, snack: 4, ball: 8, reminder: 3 } },
}));
process.env.COMTRIEVER_TEST_MODE = '1';
delete process.env.COMTRIEVER_TEST_SURFACES;
require(path.join(root, 'src/main'));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) { if (await fn()) return; await delay(40); }
  throw new Error('Timed out: ' + label);
}
const base = pathToFileURL(path.join(root, 'src/')).href;
const documentHTML = (css, body, script = '') => `<!doctype html><html lang="ko"><head><meta charset="UTF-8"><base href="${base}"><style>
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}body{font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",sans-serif;color:#344739;-webkit-font-smoothing:antialiased} ${css}
</style></head><body>${body}${script}</body></html>`;
const hero = documentHTML(`
body{background:#f5f5ed}.hero{height:560px;position:relative;overflow:hidden}.copy{position:absolute;left:64px;top:55px;width:600px}.brand{font-size:29px;font-weight:760;letter-spacing:-1px}.brand span{color:#ba8860}.eyebrow{font-size:11px;letter-spacing:2.2px;color:#7f8a77;margin-top:12px}.title{font-size:57px;line-height:1.22;font-weight:720;letter-spacing:-2.8px;margin:43px 0 22px}.subtitle{font-size:20px;color:#7c8874;letter-spacing:-.5px}.tags{display:flex;gap:9px;margin-top:44px}.tags span{border:1px solid #d9dfd2;border-radius:30px;padding:9px 16px;font-size:12px;color:#67795f;background:#fafbf5}.halo{position:absolute;left:670px;top:96px;width:370px;height:370px;border-radius:50%;background:#e8eddd}.dog{position:absolute;left:676px;top:84px;width:370px;height:370px;object-fit:contain;z-index:2;image-rendering:pixelated}.window{position:absolute;left:650px;top:420px;width:404px;height:112px;border:1px solid #dce1d3;background:#fffefa;border-radius:16px;box-shadow:0 12px 30px #3447390b}.bar{height:36px;border-bottom:1px solid #eceee5;display:flex;align-items:center;gap:6px;padding:0 15px}.dot{width:7px;height:7px;border-radius:50%;background:#d7ddcf}.bar span{margin-left:13px;color:#9ca591;font-size:10px}.lines{padding:16px 20px}.line{height:5px;background:#edf0e7;width:65%;border-radius:4px;margin:0 0 10px}.line:last-child{width:43%}.spark{position:absolute;color:#afbc98;font-size:27px;left:1045px;top:180px}.note{position:absolute;top:53px;left:728px;transform:rotate(3deg);padding:10px 17px;border-radius:12px;background:#fffefa;border:1px solid #e4e8db;font-size:14px;color:#728365}
`, `<div class="hero"><div class="copy"><div class="brand">comtriever<span>.</span></div><div class="eyebrow">A LITTLE FRIEND ON YOUR DESKTOP</div><h1 class="title">컴퓨터 속<br>나만의 리트리버</h1><div class="subtitle">당신과 함께하는 친구</div><div class="tags"><span>macOS</span><span>Apple Silicon + Intel</span></div></div><div class="halo"></div><div class="note">오늘도 네 곁에 있을게</div><div class="spark">✧</div><div class="window"><div class="bar"><i class="dot"></i><i class="dot"></i><i class="dot"></i><span>작업 중인 창</span></div><div class="lines"><div class="line"></div><div class="line"></div></div></div><img class="dog" src="assets/retriever/retriever-idle-1.png" alt="리트리버"></div>`);
const scene = documentHTML(`
body{background:#f4f6ef}.heading{position:absolute;top:31px;left:42px;font-size:22px;font-weight:650;letter-spacing:-.7px}.hint{position:absolute;right:42px;top:38px;color:#89947c;font-size:12px}.window{position:absolute;left:85px;top:226px;width:790px;height:110px;background:#fff;border:1px solid #dfe4d5;border-radius:15px;box-shadow:0 8px 24px #3447390b}.bar{height:35px;border-bottom:1px solid #edf0e7;display:flex;align-items:center;gap:6px;padding:0 14px}.dot{height:7px;width:7px;border-radius:50%;background:#d9dfd0}.bar span{font-size:10px;color:#9aa58e;margin-left:12px}.line{height:5px;width:38%;background:#eef1e8;border-radius:4px;margin:16px 24px 0}.line:last-child{width:24%;margin-top:10px}#dog{position:absolute;top:61px;left:180px;width:180px;height:180px;z-index:2}#facing,#spriteMotion,#sprite{display:block;width:100%;height:100%;transform-origin:50% 88%}#sprite{background-size:contain;background-repeat:no-repeat;image-rendering:pixelated}
`, `<div class="heading">창 위에서도, 곁에.</div><div class="hint">잠깐의 산책, 그리고 작은 쉼</div><div class="window"><div class="bar"><i class="dot"></i><i class="dot"></i><i class="dot"></i><span>작업 중인 창</span></div><div class="line"></div><div class="line"></div></div><div id="dog"><span id="facing"><span id="spriteMotion"><span id="sprite"></span></span></span></div>`, `<script>window.comtriever={setActivity(){}};</script><script src="pet-animation.js"></script><script>
window.ready=(async()=>{const manifest=await fetch('assets/retriever/manifest.json').then(r=>r.json());const sprite=document.querySelector('#sprite');const animator=new PetAnimator(sprite,manifest);await animator.ready;
window.renderFrame=t=>{let name='idle',x=180,elapsed=t,left=false;if(t>=.7&&t<3.1){name='walk';elapsed=t-.7;x=180+320*elapsed/2.4}else if(t>=3.1&&t<4.6){name='tailWag';elapsed=t-3.1;x=500}else if(t>=4.6&&t<7){name='walk';elapsed=t-4.6;x=500-320*elapsed/2.4;left=true}const a=manifest.animations[name];const frame=Math.floor(elapsed*a.fps)%a.frames.length;sprite.style.backgroundImage='url("'+a.frames[frame]+'")';sprite.style.transform='translateY('+((.91-(a.groundY??.91))*100)+'%)';animator.rate=1;animator.drawMotion(name,elapsed*1000,1/15);document.querySelector('#dog').style.left=x+'px';document.querySelector('#facing').style.transform=left?'scaleX(-1)':'none';};window.renderFrame(0);})();</script>`);

let preview;
const deadline = setTimeout(() => { console.error('README render timed out:', temporary); app.exit(1); }, 120000);
app.whenReady().then(async () => {
  try {
    let settings;
    await until(() => {
      settings=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/settings.html'));
      return settings;
    }, 'settings window');
    await until(() => settings.webContents.executeJavaScript('typeof latestState!=="undefined" && !!latestState').catch(()=>false), 'settings loaded');
    for(const w of BrowserWindow.getAllWindows()) { w.setIgnoreMouseEvents(true); w.hide(); }
    settings.webContents.setBackgroundThrottling(false);
    settings.setContentSize(480, 920);
    await settings.webContents.executeJavaScript('document.fonts.ready; Promise.all([...document.images].map(i=>i.decode().catch(()=>{})))');
    await delay(200);
    const shot = await settings.webContents.capturePage();
    fs.writeFileSync(path.join(output,'settings.png'), shot.resize({width:960}).toPNG());
    console.log('Captured real settings UI with example data.');
    preview=new BrowserWindow({width:1120,height:560,show:false,frame:false,webPreferences:{offscreen:true,backgroundThrottling:false}});
    preview.webContents.setFrameRate(30);
    const heroPath=path.join(temporary,'hero.html');fs.writeFileSync(heroPath,hero);
    await preview.loadFile(heroPath);
    await preview.webContents.executeJavaScript('Promise.all([...document.images].map(i=>i.decode())).then(()=>document.fonts.ready)');
    await delay(100);
    fs.writeFileSync(path.join(output,'hero.png'),(await preview.webContents.capturePage()).resize({width:1120}).toPNG());
    preview.setContentSize(960,320);
    const scenePath=path.join(temporary,'scene.html');fs.writeFileSync(scenePath,scene);
    await preview.loadFile(scenePath);
    await preview.webContents.executeJavaScript('window.ready');
    const frames=path.join(temporary,'frames');fs.mkdirSync(frames);
    for(let i=0;i<120;i++) {
      await preview.webContents.executeJavaScript(`window.renderFrame(${i/15})`);
      await delay(40);
      fs.writeFileSync(path.join(frames,`frame-${String(i).padStart(3,'0')}.png`),(await preview.webContents.capturePage()).resize({width:960}).toPNG());
    }
    execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-framerate','15','-i',path.join(frames,'frame-%03d.png'),'-filter_complex','[0:v]split[a][b];[a]palettegen=max_colors=192:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle','-loop','0',path.join(output,'companion.gif')]);
    console.log('Rendered hero and 8-second character animation:',output);
    clearTimeout(deadline);
    app.exit(0);
  } catch(error) { console.error(error);clearTimeout(deadline);app.exit(1); }
});
