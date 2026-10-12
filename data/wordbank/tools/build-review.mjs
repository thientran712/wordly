// Sinh trang duyệt kho từ pilot: mục từ + cờ đối chiếu (DeepL, CMUdict, người rà soát).
// Chủ dự án chấm Đạt / Cần sửa / Sai + ghi chú, xuất JSON gửi lại.
// Dùng: node build-review.mjs <wordbank dir> <out.html>
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const [dir, outPath] = process.argv.slice(2);
const en = JSON.parse(readFileSync(`${dir}/en-pilot.json`, "utf8"));
const vi = JSON.parse(readFileSync(`${dir}/vi-pilot.json`, "utf8"));
const cross = JSON.parse(readFileSync(`${dir}/crosscheck.json`, "utf8"));
const review = existsSync(`${dir}/review.json`) ? JSON.parse(readFileSync(`${dir}/review.json`, "utf8")) : [];

const key = (lang, h) => `${lang}:${h}`;
const crossBy = Object.fromEntries(cross.map((c) => [key(c.lang, c.headword), c]));
const reviewBy = Object.fromEntries(review.map((r) => [key(r.lang, r.headword), r]));
const items = [
  ...en.map((e) => ({ lang: "EN", ...e })),
  ...vi.map((e) => ({ lang: "VI", ...e })),
].map((e) => ({ ...e, cross: crossBy[key(e.lang, e.headword)] || null, review: reviewBy[key(e.lang, e.headword)] || null }));

const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Duyệt kho từ</title>
<style>
:root{--bg:#fafaf9;--fg:#1c1917;--mute:#78716c;--card:#fff;--line:#e7e5e4;--good:#16a34a;--warn:#ca8a04;--bad:#dc2626;--chip:#f5f5f4;--accent:#2563eb}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#1c1917;--fg:#f5f5f4;--mute:#a8a29e;--card:#292524;--line:#44403c;--chip:#3a3532}}
:root[data-theme="dark"]{--bg:#1c1917;--fg:#f5f5f4;--mute:#a8a29e;--card:#292524;--line:#44403c;--chip:#3a3532}
*{box-sizing:border-box}body{background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,-apple-system,sans-serif;margin:0;padding:16px;max-width:900px;margin-inline:auto}
h1{font-size:21px;margin:0 0 4px}.sub{color:var(--mute);margin:0 0 12px}
#bar{position:sticky;top:0;background:var(--bg);padding:8px 0;display:flex;gap:8px;flex-wrap:wrap;align-items:center;z-index:2;border-bottom:1px solid var(--line)}
#bar button,#bar select{padding:6px 10px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--fg);cursor:pointer;font:inherit;font-size:14px}
.stats{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0}.stat{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px 12px;font-size:13px}.stat b{font-size:18px;display:block}
.item{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px;margin:12px 0}
.head{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}.hw{font-size:19px;font-weight:700}.tag{font-size:12px;color:var(--mute);background:var(--chip);border-radius:6px;padding:1px 7px}
.sense{border-top:1px dashed var(--line);margin-top:8px;padding-top:8px}.pos{font-style:italic;color:var(--accent);margin-right:6px}
.ipa{font-family:ui-monospace,Menlo,monospace;font-size:13px;color:var(--mute);margin-right:8px}.mean{font-weight:600}
.ex{color:var(--mute);font-size:14px;margin-top:2px}.def{font-size:14px}.note{font-size:13px;background:var(--chip);border-radius:8px;padding:6px 8px;margin-top:8px}
.flags{display:flex;flex-direction:column;gap:4px;margin-top:10px;font-size:13px}.flag{border-left:3px solid var(--line);padding-left:8px}
.flag.ok{border-color:var(--good)}.flag.warn{border-color:var(--warn)}.flag.bad{border-color:var(--bad)}
.judge{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;align-items:center}.judge button{border:1px solid var(--line);background:none;color:var(--fg);border-radius:8px;padding:4px 10px;cursor:pointer;font:inherit;font-size:13px}
.judge button.on[data-v="ok"]{background:var(--good);color:#fff;border-color:var(--good)}.judge button.on[data-v="fix"]{background:var(--warn);color:#fff;border-color:var(--warn)}.judge button.on[data-v="bad"]{background:var(--bad);color:#fff;border-color:var(--bad)}
textarea{width:100%;margin-top:6px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--fg);font:inherit;font-size:13px;padding:6px;min-height:34px}
.hidden{display:none}
</style></head><body>
<h1>Duyệt kho từ — bản thử 100 mục</h1>
<p class="sub">80 mục Anh→Việt + 20 mục Việt→Anh, do Claude sinh. Mỗi mục kèm cờ đối chiếu: DeepL (nghĩa), CMUdict (phiên âm Mỹ), Wiktionary (tham khảo), và nhận xét của một agent rà soát độc lập. Chấm từng mục rồi bấm "Xuất kết quả".</p>
<div id="bar"><select id="filter"><option value="all">Tất cả</option><option value="flag">Chỉ mục có cờ</option><option value="error">Rà soát: lỗi</option><option value="minor">Rà soát: nhỏ</option><option value="todo">Chưa chấm</option></select>
<span id="prog"></span><button id="export">Xuất kết quả</button></div>
<div class="stats" id="stats"></div><div id="list"></div>
<script>
const ITEMS=${JSON.stringify(items)};
const KEY="wordly-wordbank-pilot";let S={};try{S=JSON.parse(localStorage.getItem(KEY)||"{}")}catch{}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(S))}catch{}};
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const id=it=>it.lang+":"+it.headword;
function flagsOf(it){const f=[];const c=it.cross,r=it.review;
 if(r)f.push({cls:r.verdict==="ok"?"ok":r.verdict==="minor"?"warn":"bad",txt:"Rà soát: "+({ok:"ổn",minor:"cần chỉnh nhỏ",error:"LỖI"}[r.verdict]||r.verdict)+(r.issues?.length?" — "+r.issues.join(" · "):"")});
 if(c){f.push({cls:c.deeplAgrees?"ok":"warn",txt:"DeepL: “"+c.deepl+"”"+(c.deeplAgrees?" (khớp)":" (khác bản Claude)")});
  for(const s of c.ipa||[])if(s.status==="mismatch")f.push({cls:"warn",txt:"Phiên âm Mỹ ("+s.pos+") "+s.ipa_us+" ≠ CMUdict: "+s.cmu.join(" ; ")});
  if((c.ipa||[]).length&&c.ipa.every(s=>s.status==="match"))f.push({cls:"ok",txt:"Phiên âm Mỹ khớp CMUdict"});
  if(c.wiktionary?.length)f.push({cls:"",txt:"Wiktionary: "+c.wiktionary.join(" · ")});}
 return f}
const hasFlag=it=>{const c=it.cross,r=it.review;return (r&&r.verdict!=="ok")||(c&&(!c.deeplAgrees||(c.ipa||[]).some(s=>s.status==="mismatch")))};
const list=document.getElementById("list");
ITEMS.forEach(it=>{const d=document.createElement("div");d.className="item";d.dataset.id=id(it);
 const senses=it.senses.map(s=>'<div class="sense"><span class="pos">'+esc(s.pos)+'</span>'+(s.ipa_us?'<span class="ipa">US '+esc(s.ipa_us)+'</span><span class="ipa">UK '+esc(s.ipa_uk)+'</span>':'')+(s.cefr?'<span class="tag">'+esc(s.cefr)+'</span>':'')+
  '<div class="mean">'+esc((s.vi||s.en).join(", "))+'</div><div class="def">'+esc(s.def_en||s.def_vi)+'</div>'+
  '<div class="ex">'+esc(it.lang==="EN"?s.example_en:s.example_vi)+'<br>→ '+esc(it.lang==="EN"?s.example_vi:s.example_en)+'</div></div>').join("");
 d.innerHTML='<div class="head"><span class="hw">'+esc(it.headword)+'</span><span class="tag">'+(it.lang==="EN"?"Anh → Việt":"Việt → Anh")+'</span><span class="tag">'+esc(it.type)+'</span>'+(it.forms?.length?'<span class="tag">dạng: '+esc(it.forms.join(", "))+'</span>':'')+'</div>'+senses+
  (it.note_vi?'<div class="note">💡 '+esc(it.note_vi)+'</div>':'')+
  '<div class="flags">'+flagsOf(it).map(f=>'<div class="flag '+f.cls+'">'+esc(f.txt)+'</div>').join("")+'</div>'+
  '<div class="judge"><button data-v="ok">Đạt</button><button data-v="fix">Cần sửa</button><button data-v="bad">Sai</button></div><textarea placeholder="Ghi chú (sửa thế nào)…"></textarea>';
 const st=S[id(it)]||{};d.querySelectorAll(".judge button").forEach(b=>{if(st.v===b.dataset.v)b.classList.add("on");b.onclick=()=>{S[id(it)]={...S[id(it)],v:b.dataset.v};save();d.querySelectorAll(".judge button").forEach(x=>x.classList.toggle("on",x===b));refresh()}});
 const ta=d.querySelector("textarea");ta.value=st.note||"";ta.oninput=()=>{S[id(it)]={...S[id(it)],note:ta.value};save()};
 list.appendChild(d)});
function refresh(){const f=document.getElementById("filter").value;
 ITEMS.forEach(it=>{const el=list.querySelector('[data-id="'+CSS.escape(id(it))+'"]');const v=S[id(it)]?.v;
  const show=f==="all"||(f==="flag"&&hasFlag(it))||(f==="error"&&it.review?.verdict==="error")||(f==="minor"&&it.review?.verdict==="minor")||(f==="todo"&&!v);el.classList.toggle("hidden",!show)});
 const n=ITEMS.filter(it=>S[id(it)]?.v).length;document.getElementById("prog").textContent="Đã chấm "+n+"/"+ITEMS.length;
 const rv=v=>ITEMS.filter(it=>it.review?.verdict===v).length;const mine=v=>ITEMS.filter(it=>S[id(it)]?.v===v).length;
 document.getElementById("stats").innerHTML=[["Mục",ITEMS.length],["Có cờ",ITEMS.filter(hasFlag).length],["Rà soát: lỗi",rv("error")],["Rà soát: nhỏ",rv("minor")],["Anh chấm Đạt",mine("ok")],["Cần sửa",mine("fix")],["Sai",mine("bad")]].map(([k,v])=>'<div class="stat"><b>'+v+'</b>'+k+'</div>').join("")}
document.getElementById("filter").onchange=refresh;refresh();
document.getElementById("export").onclick=()=>{const out=ITEMS.filter(it=>S[id(it)]).map(it=>({lang:it.lang,headword:it.headword,...S[id(it)]}));
 const blob=new Blob([JSON.stringify(out,null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="wordbank-pilot-review.json";a.click()};
</script></body></html>`;
writeFileSync(outPath, html);
console.log("→", outPath, items.length, "mục,", review.length, "nhận xét rà soát");
