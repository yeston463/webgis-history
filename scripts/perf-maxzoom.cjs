// perf-maxzoom.cjs — 对照探针：细节层 GeoJSON 切片密度（source maxzoom 14 vs 16）对帧时的影响
// 结论（2026-11-06 实测，深圳/广州/成都）：差异在噪声范围内且无一致方向，出厂配置维持 maxzoom 14。
// 用法：node scripts/perf-maxzoom.cjs   （需先启动 node server/server.cjs；本脚本会临时重建细节层）
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:8000';
function stats(t){const a=t.filter(x=>x>0&&x<5000).sort((x,y)=>x-y);if(!a.length)return{median:0,fps:0};const q=p=>a[Math.floor(a.length*p)];return{median:+q(.5).toFixed(1),fps:+(1000/q(.5)).toFixed(1)};}

(async()=>{
const b=await chromium.launch({args:['--no-sandbox']});
const ctx=await b.newContext({viewport:{width:1600,height:1000}});
const page=await ctx.newPage();
page.on('pageerror',()=>{});
await page.goto(`${BASE}/pages/analysis.html?city=shenzhen`,{waitUntil:'load',timeout:40000});
await page.evaluate(()=>document.getElementById('lab-builtup-3d').scrollIntoView({block:'center'}));
await page.waitForFunction(()=>{const x=window.__bu3D;return!!(x&&x.map&&x.map.getLayer('bu3d-city')&&x.map.isStyleLoaded());},{timeout:120000});
await page.waitForTimeout(2500);

async function run(city, mz, dz){
  await page.evaluate(async ({city,mz,dz})=>{
    const B=window.__bu3D, m=B.map;
    if(B.state.city!==city){await B.setCity(city);await new Promise(r=>setTimeout(r,2500));}
    m.setLayerZoomRange('bu3d-city',0,24); m.setLayerZoomRange('bu3d-city-ov',30,30);
    if(m.getSource('bu3d-src').maxzoom!==mz){
      const fc=B.data[city];
      m.removeLayer('bu3d-city'); m.removeSource('bu3d-src');
      m.addSource('bu3d-src',{type:'geojson',data:fc,maxzoom:mz});
      m.addLayer({id:'bu3d-city',type:'fill-extrusion',source:'bu3d-src',minzoom:0,
        paint:{'fill-extrusion-color':['match',['get','era'],1990,'#0f6e7c',2000,'#d0471f',2014,'#9a6a10',2024,'#6b4fa1','#8a8f87'],
        'fill-extrusion-height':['get','h'],'fill-extrusion-opacity':.95},filter:['<=',['get','era'],2024]});
    }
    m.jumpTo({zoom:dz,pitch:56});
    await new Promise(r=>setTimeout(r,2200));
  },{city,mz,dz});
  const inView=await page.evaluate(()=>{
    const m=window.__bu3D.map, c=m.getCanvasContainer(), W=c.clientWidth, H=c.clientHeight;
    const fc=window.__bu3D.data[window.__bu3D.state.city];
    let n=0;
    for(const f of fc.features){
      let vis=false;
      const walk=(a)=>{ if(typeof a[0]==='number'){const p=m.project(a); if(p.x>=-16&&p.x<=W+16&&p.y>=-16&&p.y<=H+16)vis=true;} else a.forEach(walk); };
      walk(f.geometry.coordinates);
      if(vis)n++;
    }
    return n;
  });
  const times=await page.evaluate(()=>new Promise(res=>{
    const m=window.__bu3D.map,out=[];let last=performance.now();
    const on=()=>{const t=performance.now();out.push(t-last);last=t;};
    m.on('render',on);let br=m.getBearing();
    const ti=setInterval(()=>{br=(br+2.5)%360;m.setBearing(br);},40);
    setTimeout(()=>{clearInterval(ti);m.off('render',on);res(out);},5000);
  }));
  const s=stats(times);
  console.log(`${city.padEnd(9)} mz=${String(mz).padEnd(3)} z=${dz.toFixed(2)} 同屏=${String(inView).padStart(6)}  帧时=${String(s.median).padStart(6)}ms  ${String(s.fps).padStart(5)}fps`);
  return {city,mz,dz:+dz.toFixed(2),inView,...s};
}
const rows=[];
for(const city of ['shenzhen','guangzhou','chengdu']){
  const cam=await page.evaluate(async(c)=>{const B=window.__bu3D;if(B.state.city!==c){await B.setCity(c);await new Promise(r=>setTimeout(r,2500));}return +B.map.getZoom().toFixed(2);},city);
  for(const mz of [14,16]) for(const d of [0,1.4,2.2]) rows.push(await run(city,mz,+(cam+d).toFixed(2)));
}
require('fs').writeFileSync('test-results/perf-maxzoom.json',JSON.stringify(rows,null,2));
await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
