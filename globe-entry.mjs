import {geoOrthographic,geoPath,geoGraticule10,geoDistance} from 'd3-geo';
import {feature} from 'topojson-client';
import atlas from 'world-atlas/countries-110m.json';

const countries=feature(atlas,atlas.objects.countries);
const sphere={type:'Sphere'};
const graticule=geoGraticule10();
const ease=t=>1-Math.pow(1-t,3);
const longitude=(a,b)=>a+((((b-a)+540)%360)-180);

class VeyralGlobe{
  constructor(canvas,onPick,onHover){
    this.canvas=canvas;this.context=canvas.getContext('2d');this.onPick=onPick;this.onHover=onHover;
    this.points=[];this.screenPoints=[];this.rotation=[-12,-14];this.zoom=1;this.idle=true;this.selectedKey=null;this.motion=null;this.lastTime=0;
    this.projection=geoOrthographic().clipAngle(90).precision(.7);
    this.path=geoPath(this.projection,this.context);
    new ResizeObserver(()=>this.resize()).observe(canvas);
    canvas.addEventListener('pointermove',event=>this.pointer(event));
    canvas.addEventListener('pointerleave',()=>{canvas.style.cursor='default';this.onHover(null);});
    canvas.addEventListener('click',event=>{const hit=this.hit(event);if(hit)this.onPick(hit.item);});
    this.resize();requestAnimationFrame(time=>this.frame(time));
  }
  resize(){
    const rect=this.canvas.getBoundingClientRect(),ratio=Math.min(devicePixelRatio||1,2);
    this.width=rect.width;this.height=rect.height;
    this.canvas.width=Math.max(1,Math.round(rect.width*ratio));this.canvas.height=Math.max(1,Math.round(rect.height*ratio));
    this.context.setTransform(ratio,0,0,ratio,0,0);
  }
  setPoints(points){this.points=points;}
  select(item){
    if(!item||!Number.isFinite(item.longitude)||!Number.isFinite(item.latitude))return;
    this.idle=false;this.selectedKey=`${item.type}://${item.address}`;
    this.motion={start:performance.now(),duration:1150,from:[...this.rotation],to:[-item.longitude,-item.latitude],fromZoom:this.zoom,toZoom:1.46};
  }
  hit(event){
    const rect=this.canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;
    return this.screenPoints.findLast(point=>Math.hypot(point.x-x,point.y-y)<12);
  }
  pointer(event){const hit=this.hit(event);this.canvas.style.cursor=hit?'pointer':'default';this.onHover(hit?.item||null);}
  frame(time){
    if(time-(this.lastDraw||0)<32){requestAnimationFrame(next=>this.frame(next));return;}this.lastDraw=time;
    const elapsed=Math.min(60,time-(this.lastTime||time));this.lastTime=time;
    if(this.motion){
      const t=Math.min(1,(time-this.motion.start)/this.motion.duration),k=ease(t);
      this.rotation=[longitude(this.motion.from[0],this.motion.to[0])*k+this.motion.from[0]*(1-k),this.motion.from[1]+(this.motion.to[1]-this.motion.from[1])*k];
      this.zoom=this.motion.fromZoom+(this.motion.toZoom-this.motion.fromZoom)*k;
      if(t>=1){this.rotation=[...this.motion.to];this.zoom=this.motion.toZoom;this.motion=null;}
    }else if(this.idle)this.rotation[0]=(this.rotation[0]+elapsed*.015)%360;
    this.draw();requestAnimationFrame(next=>this.frame(next));
  }
  draw(){
    const ctx=this.context,w=this.width,h=this.height;if(!w||!h)return;
    ctx.clearRect(0,0,w,h);
    const radius=Math.max(1,Math.min(w*.43,h*.46)*this.zoom);
    this.projection.translate([w/2,h/2]).scale(radius).rotate(this.rotation);
    const halo=ctx.createRadialGradient(w/2,h/2,radius*.35,w/2,h/2,radius*1.2);
    halo.addColorStop(0,'#403b8020');halo.addColorStop(.7,'#5149bd18');halo.addColorStop(1,'#5149bd00');
    ctx.fillStyle=halo;ctx.beginPath();ctx.arc(w/2,h/2,radius*1.2,0,Math.PI*2);ctx.fill();
    ctx.beginPath();this.path(sphere);ctx.fillStyle='#151a29';ctx.fill();ctx.strokeStyle='#46427d';ctx.lineWidth=1;ctx.stroke();
    ctx.beginPath();this.path(graticule);ctx.strokeStyle='#7773a020';ctx.lineWidth=.7;ctx.stroke();
    ctx.beginPath();this.path(countries);ctx.fillStyle='#292d3d';ctx.fill();ctx.strokeStyle='#55596b';ctx.lineWidth=.55;ctx.stroke();
    this.screenPoints=[];
    const center=[-this.rotation[0],-this.rotation[1]];
    for(const point of this.points){
      const item=point.item;
      if(geoDistance([item.longitude,item.latitude],center)>Math.PI/2-.015)continue;
      const xy=this.projection([item.longitude,item.latitude]);if(!xy)continue;
      const active=this.selectedKey===`${item.type}://${item.address}`,r=active?6:4;
      const color=point.quality==='fast'?'#55d5a6':point.quality==='medium'?'#8179f6':'#e7a368';
      ctx.beginPath();ctx.arc(xy[0],xy[1],r+5,0,Math.PI*2);ctx.fillStyle=color+'24';ctx.fill();
      ctx.beginPath();ctx.arc(xy[0],xy[1],r,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();
      ctx.lineWidth=1.5;ctx.strokeStyle='#10131e';ctx.stroke();
      if(active){ctx.beginPath();ctx.arc(xy[0],xy[1],r+9,0,Math.PI*2);ctx.strokeStyle=color+'88';ctx.stroke();}
      this.screenPoints.push({x:xy[0],y:xy[1],item});
    }
  }
}
window.VeyralGlobe=VeyralGlobe;
