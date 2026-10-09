// Soradi Schuler (neu): MOVA scenes, contact form and section helpers.
(()=>{
const root=document.getElementById('ss-webgl-m2m');
const q=s=>root.querySelector(s),all=s=>[...root.querySelectorAll(s)];
const scroller=root.ssScroller,track=q('.method-track'),stage=q('.method-stage');
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp=x=>Math.max(0,Math.min(1,x)),ease=x=>{x=clamp(x);return x*x*(3-2*x)};
let manualPeople=false,ticking=false;
function relativeTop(el){return el.getBoundingClientRect().top-scroller.getBoundingClientRect().top+scroller.scrollTop}
function go(el,offset=0){scroller.scrollTo({top:relativeTop(el)+offset,behavior:reduced?'auto':'smooth'})}
const stops=[.03,.25,.65,.93];
all('[data-step]').forEach(b=>b.addEventListener('click',()=>go(track,stops[Number(b.dataset.step)]*(track.offsetHeight-stage.offsetHeight))));
q('.method-next').addEventListener('click',()=>go(q('.few-section')));q('.people-toggle').addEventListener('click',()=>{const rows=all('.people-list li');const allOn=rows.every(r=>r.classList.contains('is-person'));manualPeople=!allOn;if(allOn)rows.forEach(r=>r.classList.remove('is-person'));if(manualPeople)rows.forEach(r=>r.classList.add('is-person'));});q('.hero-cta').addEventListener('click',()=>go(q('.contact-section')));q('.together-cta').addEventListener('click',()=>go(q('.contact-section')));
q('.jump-opening').addEventListener('click',()=>go(track,.25*(track.offsetHeight-stage.offsetHeight))); 
function draw(){ticking=false;const t=clamp((scroller.scrollTop-relativeTop(track))/(track.offsetHeight-stage.offsetHeight));
 const open=ease((t-.38)/.10),connect=ease((t-.50)/.09),activate=ease((t-.75)/.10);
 const weights=[1-ease((t-.185)/.04),ease((t-.225)/.04)*(1-ease((t-.5)/.035)),ease((t-.535)/.035)*(1-ease((t-.74)/.03)),ease((t-.77)/.04)];
 const scenes=all('.method-scene');const active=weights.indexOf(Math.max(...weights));
 scenes.forEach((s,i)=>{s.style.opacity=weights[i];s.style.pointerEvents=active===i?'auto':'none';s.inert=active!==i;s.setAttribute('aria-hidden',String(active!==i));});
 const hr=q('.opening-hands').getBoundingClientRect(),sr=stage.getBoundingClientRect(),tipY=hr.height?(hr.top-sr.top+hr.height*.455)/sr.height*100:43;q('.method-wash').style.clipPath='circle('+(open*145)+'% at 50% '+tipY+'%)';
 q('.method-wash').style.opacity=1-activate;
 q('.shutter-left').style.transform='translateX('+(-open*101)+'%)';q('.shutter-right').style.transform='translateX('+(open*101)+'%)';
 q('.opening-before').style.opacity=1-ease((t-.365)/.035);q('.opening-before').style.transform='translateY('+(-open*16)+'px)';
 const approach=t<.34?ease((t-.245)/.095)*.88:.88+ease((t-.34)/.04)*.12;
 q('.hand-left').style.transform='translateX('+(-12+17.08*approach)+'%)';
 q('.hand-right').style.transform='translateX('+(12-17.66*approach)+'%)';
 q('.opening-hands').style.opacity=(.17+open*.035)*(1-ease((t-.49)/.07));
 q('.opening-after').style.opacity=ease((t-.405)/.055);
 q('.opening-after').style.transform='scale('+(0.88+open*.12)+')';
 q('.method-orbit').style.opacity=(1-ease((t-.17)/.08))*.85;
 q('.orbit-ring').style.transform='rotateY('+(-45+t*200)+'deg) rotateX('+(18-t*70)+'deg)';
 q('.orbit-core').style.transform='scale('+(1+ease(t/.22)*2)+')';
 const light=t>.42&&t<.80; q('.method-heading').style.color=light?'#eeece4':'#1c1d20';q('.method-nav').style.color=light?'#eeece4':'#1c1d20';
 all('[data-step]').forEach((b,i)=>b.setAttribute('aria-current',String(active===i)));
 q('.scene-connection h2').style.transform='translateY('+((1-connect)*35)+'px)';
 q('.scene-activation h2').style.transform='translateY('+((1-activate)*35)+'px)';
 // V: the list turns into people, one row after another (or all at once with the button).
 const rows=all('.people-list li');rows.forEach((r,i)=>{const on=manualPeople||t>.56+i*.022;if(r.classList.contains('is-person')!==on)r.classList.toggle('is-person',on)});
 const tg=q('.people-toggle'),allOn=rows.every(r=>r.classList.contains('is-person'));tg.textContent=allOn?'Kontakte sehen':'Menschen sehen';tg.setAttribute('aria-pressed',String(allOn));




}
function request(){if(!ticking){ticking=true;requestAnimationFrame(draw)}}
scroller.addEventListener('scroll',request,{passive:true});new ResizeObserver(request).observe(stage);request();
const observer=new IntersectionObserver(es=>es.forEach(e=>e.target.classList.toggle('in-view',e.isIntersecting)),{threshold:.15});observer.observe(q('.few-section'));observer.observe(q('.mova-intro'));
q('.brief-open').addEventListener('click',()=>{const f=q('.brief-form');f.hidden=!f.hidden;q('.brief-open').setAttribute('aria-expanded',String(!f.hidden));if(!f.hidden){go(f,-25);f.querySelector('input').focus({preventScroll:true})}});
const briefForm=q('.brief-form'),briefStatus=q('.brief-status'),briefTxt=q('.brief-txt'),briefSend=q('.brief-send');
function briefText(d){return['SORADI SCHULER | ERSTES BRIEFING','','Name: '+d.name,'E-Mail: '+d.email,'Unternehmen: '+d.company,'Website: '+(d.website||'Nicht angegeben'),'','Wen möchten Sie erreichen?',d.people,'','Was soll daraus entstehen?',d.goal,'','Art der Zusammenarbeit: '+d.scope].join('\n')}
function briefData(){const f=new FormData(briefForm),o={};['name','email','company','website','people','goal','scope','websiteConfirmation'].forEach(k=>o[k]=String(f.get(k)||'').trim());return o}
briefTxt.addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([briefText(briefData())],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='soradi-schuler-briefing.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});
briefForm.addEventListener('submit',async e=>{e.preventDefault();if(!briefForm.checkValidity()){briefForm.reportValidity();return}
 const d=briefData();briefSend.disabled=true;briefStatus.textContent='Wird gesendet …';
 try{const r=await fetch('/api/public/market-mapping',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});const j=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(j.error||'Die Anfrage konnte nicht gesendet werden.');
  briefStatus.textContent='Danke. Ihre Anfrage ist angekommen. Wir melden uns persönlich bei Ihnen.';briefForm.querySelectorAll('input,textarea,select').forEach(x=>x.disabled=true);briefTxt.hidden=true}
 catch(err){briefStatus.textContent=(err&&err.message?err.message:'Die Anfrage konnte nicht gesendet werden.')+' Sie können das Briefing auch als Text herunterladen.';briefTxt.hidden=false;briefSend.disabled=false}});
all('button,summary').forEach(e=>e.classList.add('cursor-interaction'));

})();

