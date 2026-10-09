// Soradi Schuler (neu): address world, person and M2M stage.
(()=>{
const root=document.getElementById('ss-webgl-m2m');if(!root)return;
const q=s=>root.querySelector(s),qa=s=>Array.from(root.querySelectorAll(s));
const sw=root.querySelector('.scroll-window'),swTop=()=>sw.getBoundingClientRect().top+window.scrollY;
// The page scrolls normally; this adapter gives the scripts the scroll position relative to the story.
root.ssScroller={get scrollTop(){return window.scrollY-swTop()},scrollTo(o){window.scrollTo({top:o.top+swTop(),behavior:o.behavior})},getBoundingClientRect(){return{top:0,left:0,right:innerWidth,bottom:innerHeight,width:innerWidth,height:innerHeight}},addEventListener(t,f,o){(t==='scroll'?window:document).addEventListener(t,f,o)},get clientWidth(){return sw.clientWidth}};
const scroller=root.ssScroller,track=q('.scroll-track'),stage=q('.stage'),reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x)},lerp=(a,b,t)=>a+(b-a)*t;
const exampleNames=['anna','marc','lea','noah','lina','luca','sara','nico','mara','jan'];
const addresses=Array.from({length:20},(_,i)=>i%2===0?exampleNames[i/2]+'@example.com':'+41 00 000 00 '+String(i+1).padStart(2,'0'));
const floats=[];for(let i=0;i<0;i++){const e=document.createElement('span');e.className='datum';e.textContent=addresses[i%20];q('.data-cloud').append(e);floats.push({e,x:((i*43+7)%110)-5,y:((i*29+9)%100),depth:(i%4)/3})}
let width=960,height=660,p=0,targetP=0,px=0,py=0,frame=0,previousChapter=-1;let sound=true,audio;


function travel(pos){scroller.scrollTo({top:pos*(track.offsetHeight-stage.clientHeight),behavior:reduced?'auto':'smooth'})}
qa('[data-pos]').forEach(b=>b.addEventListener('click',()=>travel(Number(b.dataset.pos))));q('.next-moment').addEventListener('click',()=>{if(targetP<.72)travel(targetP<.25?.44:.94);else scroller.scrollTo({top:track.offsetHeight,behavior:reduced?'auto':'smooth'})});
function resize(){width=stage.clientWidth||960;height=stage.clientHeight||660;request()}
function draw(){const reveal=smooth((p-.08)/.3),paper=smooth((p-.58)/.23),hero=1-smooth((p-.12)/.17),human=smooth((p-.25)/.1)*(1-smooth((p-.54)/.1)),m2m=smooth((p-.65)/.12),connect=smooth((p-.65)/.27);
const mob=width<650;q('.blue-world').style.clipPath=mob?'ellipse('+(17+reveal*97)+'% '+(30+reveal*96)+'% at '+(97-reveal*47)+'% '+(40+reveal*10)+'%)':'ellipse('+(21+reveal*97)+'% '+(37+reveal*91)+'% at '+(74-reveal*24)+'% 50%)';q('.blue-world img').style.transform=mob?'translate('+px*10+'px,'+py*8+'px) scale('+(1.25-reveal*.22)+')':'translate(calc('+((1-reveal)*16.5)+'% + '+px*10+'px),calc('+((1-reveal)*17)+'% + '+py*8+'px)) scale('+(1.25-reveal*.22)+')';q('.paper-world').style.clipPath='circle('+(paper*85)+'% at 50% 50%)';
q('.hero').style.opacity=hero;q('.hero').style.transform='translateY('+(-p*140)+'px) scale('+(1-p*.2)+')';q('.hero').setAttribute('aria-hidden',String(hero<.1));q('.person').style.opacity=human;q('.person').style.transform='translateY('+((1-smooth((p-.25)/.1))*80-smooth((p-.54)/.1)*65)+'px)';q('.person').setAttribute('aria-hidden',String(human<.1));q('.m2m').style.opacity=m2m;q('.m2m').setAttribute('aria-hidden',String(m2m<.1));q('.m-left').style.transform='translateX('+(-(1-connect)*width*.25)+'px)';q('.m-right').style.transform='translateX('+((1-connect)*width*.25)+'px)';q('.m2m-meaning').style.opacity=smooth((p-.8)/.12);q('.m2m-sub').style.opacity=smooth((p-.84)/.1);q('.m2m-sub').style.transform='translateY('+((1-smooth((p-.84)/.1))*20)+'px)';
const cloudOut=smooth((p-.05)/.23);floats.forEach(({e,x,y,depth},i)=>{e.style.left=x+'%';e.style.top=y+'%';const central=width<650?(y>22&&y<82):(x<60&&y>14&&y<88)||(x>=60&&y>20&&y<82);const baseOpacity=central?0:.34;e.style.opacity=(1-cloudOut)*baseOpacity;e.style.transform='translate3d('+((x-50)*cloudOut*width*.018+px*(depth+1)*12)+'px,'+((y-50)*cloudOut*height*.014+py*(depth+1)*10)+'px,0) scale('+(1+cloudOut*depth*.7)+')';});
const isBlue=p>.26&&p<.68;q('.stage-footer').style.color=isBlue?'#eeece4':'#1c1d20';q('.progress-track').style.background=isBlue?'#eeece4':'#143cf0';q('.progress-track').style.transform='scaleX('+p+')';const chapter=p<.27?0:p<.66?1:2;if(chapter!==previousChapter){qa('.chapters button').forEach((b,i)=>b.setAttribute('aria-current',String(i===chapter)));q('.next-label').textContent=['Scrollen. Den Menschen sehen.','Weiter zu M2M.','Weiter zu MOVA.'][chapter];previousChapter=chapter}}
let lastA=0;function animate(now){frame=0;const dt=Math.min(64,now-(lastA||now));lastA=now;p=reduced?targetP:lerp(p,targetP,1-Math.exp(-dt/70));if(Math.abs(p-targetP)<.0002)p=targetP;draw();if(Math.abs(p-targetP)>.0002)request();else lastA=0}
function request(){if(!frame)frame=requestAnimationFrame(animate)}
scroller.addEventListener('scroll',()=>{targetP=clamp(scroller.scrollTop/Math.max(1,track.offsetHeight-stage.clientHeight));request()},{passive:true});
stage.addEventListener('pointermove',e=>{if(reduced)return;const r=stage.getBoundingClientRect();px=(e.clientX-r.left)/r.width-.5;py=(e.clientY-r.top)/r.height-.5;request()});stage.addEventListener('pointerleave',()=>{px=0;py=0;request()});
new ResizeObserver(resize).observe(stage);resize();
})();
