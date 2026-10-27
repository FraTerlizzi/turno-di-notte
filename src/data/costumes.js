/* ===== Costumi dei pazienti: cambiano solo l'aspetto, mai il caso clinico ===== */
export const SKINS=[
 {name:'Creatura ricucita',base:'#9fb889',hair:'#1d1f1a',gown:'#3c3f52',legs:'#2b2d36',extra(c,hw,hh){c.fillStyle='#4a5a3f';c.fillRect(-hw+3,-hh+10,hw*2-6,1);for(let x=-hw+5;x<hw-3;x+=3)c.fillRect(x,-hh+9,1,3);
   c.fillStyle='#bdd3a8';c.fillRect(3,2,hw-5,8);c.fillStyle='#4a5a3f';c.fillRect(3,2,1,8);c.fillRect(3,9,hw-5,1);for(let y=3;y<10;y+=2)c.fillRect(2,y,3,1)}},
 {name:'Vampiro',base:'#ece6ef',hair:'#121014',gown:'#1c0d16',legs:'#141018',extra(c,hw,hh){c.fillStyle='#121014';c.beginPath();c.moveTo(-6,-hh+8);c.lineTo(0,-hh+15);c.lineTo(6,-hh+8);c.fill();
   c.fillStyle='#ffffff';c.fillRect(-4,12,2,3);c.fillRect(2,12,2,3);c.fillStyle='#8a1022';c.fillRect(-hw-4,hh-2,5,6);c.fillRect(hw-1,hh-2,5,6)}},
 {name:'Mummia',base:'#d8cfb2',hair:null,gown:'#cfc4a2',legs:'#c9bd99',extra(c,hw,hh){for(let y=-hh+1,i=0;y<hh;y+=4,i++){if(y>-6&&y<1)continue;c.fillStyle=i%2?'#e8e0c6':'#b9ad8a';c.fillRect(-hw,y,hw*2,2)}c.fillStyle='#e8e0c6';c.fillRect(hw-2,4,8,3)}},
 {name:'Lupo mannaro',base:'#b48a5f',hair:'#5b3b22',gown:'#4b5a3a',legs:'#3b3226',extra(c,hw,hh){c.fillStyle='#5b3b22';[[-1,1]].forEach(()=>{});c.beginPath();c.moveTo(-hw,-hh+4);c.lineTo(-hw+3,-hh-8);c.lineTo(-hw+8,-hh+2);c.fill();c.beginPath();c.moveTo(hw,-hh+4);c.lineTo(hw-3,-hh-8);c.lineTo(hw-8,-hh+2);c.fill();
   c.fillStyle='#7a5434';c.beginPath();c.moveTo(-hw-2,0);c.lineTo(-hw+3,4);c.lineTo(-hw-2,8);c.fill();c.beginPath();c.moveTo(hw+2,0);c.lineTo(hw-3,4);c.lineTo(hw+2,8);c.fill();
   c.fillStyle='#2a1a10';c.fillRect(-3,3,6,4);c.fillStyle='#ffffff';c.fillRect(-4,12,2,2);c.fillRect(2,12,2,2)}},
 {name:'Zombie',base:'#9db69a',hair:'#3b3a2c',gown:'#6e6a58',legs:'#3a3a30',extra(c,hw,hh){c.fillStyle='rgba(70,40,80,.55)';c.fillRect(-9,1,6,2);c.fillRect(3,1,6,2);c.fillStyle='#8a2a2a';c.fillRect(5,5,7,1);c.fillRect(7,4,1,3);c.fillRect(10,4,1,3);c.fillStyle='#9db69a';c.fillRect(-6,-hh+3,5,4)}},
 {name:'Fantasma',base:'#e6eeff',hair:null,gown:'#f2f5ff',legs:'#e6eeff',extra(c,hw,hh,open){c.fillStyle='rgba(255,255,255,.55)';for(let k=-hw-2;k<hw+2;k+=5){c.beginPath();c.arc(k+2,hh,3,0,7);c.fill()}
   c.fillStyle='#1a1530';if(open){c.beginPath();c.ellipse(-5,-1,3,4,0,0,7);c.fill();c.beginPath();c.ellipse(5,-1,3,4,0,0,7);c.fill()}}},
 {name:'Alieno grigio',base:'#aab4bc',hair:null,gown:'#2f3b4a',legs:'#26303c',extra(c,hw,hh,open){c.fillStyle='#0d0f14';if(open){c.save();c.translate(-6,-1);c.rotate(-.5);c.beginPath();c.ellipse(0,0,5,3,0,0,7);c.fill();c.restore();c.save();c.translate(6,-1);c.rotate(.5);c.beginPath();c.ellipse(0,0,5,3,0,0,7);c.fill();c.restore()}else{c.fillRect(-10,0,8,1);c.fillRect(2,0,8,1)}}},
 {name:'Robot',base:'#a3adbb',hair:null,gown:'#3d4656',legs:'#2e3542',extra(c,hw,hh,open){c.fillStyle='#6b7584';c.fillRect(-hw+2,-hh+8,hw*2-4,1);c.fillRect(-hw+2,hh-4,hw*2-4,1);[[-hw+3,-hh+5],[hw-4,-hh+5],[-hw+3,hh-6],[hw-4,hh-6]].forEach(([x,y])=>c.fillRect(x,y,2,2));
   c.fillStyle='#6b7584';c.fillRect(-1,-hh-8,2,8);c.fillStyle='#ff4d5e';c.fillRect(-2,-hh-11,4,4);c.fillStyle=open?'#5ee0f0':'#25323c';c.fillRect(-9,-3,6,3);c.fillRect(3,-3,6,3)}},
 {name:'Strega',base:'#a7cc8f',hair:'#2e2238',gown:'#3a2a4f',legs:'#241a33',extra(c,hw,hh){c.fillStyle='#2b1f3d';c.beginPath();c.moveTo(-hw-4,-hh+2);c.lineTo(0,-hh-22);c.lineTo(hw+4,-hh+2);c.fill();c.fillStyle='#7a4fb0';c.fillRect(-hw-2,-hh-1,hw*2+4,3);c.fillStyle='#4f7a3a';c.fillRect(2,5,2,2)}},
 {name:'Pirata',base:'#d9a27a',hair:'#3a2414',gown:'#e9e2d0',legs:'#3a2e22',extra(c,hw,hh,open){c.fillStyle='#c23a2e';c.fillRect(-hw,-hh,hw*2,8);c.fillStyle='#ffffff';[[-8,-hh+3],[0,-hh+2],[8,-hh+4]].forEach(([x,y])=>c.fillRect(x,y,2,2));
   c.fillStyle='#111111';c.fillRect(-10,-4,7,6);c.fillRect(-hw,-5,hw*2,1);c.fillStyle='rgba(40,25,15,.5)';for(let k=-8;k<=8;k+=3)c.fillRect(k,14,1,1)}},
 {name:'Clown',base:'#f3eeee',hair:'#ff6a2c',gown:'#5aa0e6',legs:'#e94a5a',extra(c,hw,hh){c.fillStyle='#ff6a2c';c.beginPath();c.arc(-hw-3,-2,6,0,7);c.fill();c.beginPath();c.arc(hw+3,-2,6,0,7);c.fill();
   c.fillStyle='#3a6fd8';c.fillRect(-8,-7,3,2);c.fillRect(5,-7,3,2);c.fillRect(-8,2,3,2);c.fillRect(5,2,3,2);c.fillStyle='#e8243c';c.beginPath();c.arc(0,5,3,0,7);c.fill();c.fillRect(-9,10,2,2);c.fillRect(7,10,2,2)}},
 {name:'Babbo Natale',base:'#e8b08a',hair:'#f2f2f2',gown:'#c8302f',legs:'#c8302f',extra(c,hw,hh){c.fillStyle='#f4f4f4';c.beginPath();c.moveTo(-hw,6);c.lineTo(hw,6);c.lineTo(hw-2,hh+6);c.lineTo(0,hh+10);c.lineTo(-hw+2,hh+6);c.fill();
   c.fillStyle='#c8302f';c.beginPath();c.moveTo(-hw,-hh+3);c.lineTo(0,-hh-16);c.lineTo(hw,-hh+3);c.fill();c.fillStyle='#f4f4f4';c.fillRect(-hw-1,-hh+1,hw*2+2,4);c.beginPath();c.arc(0,-hh-17,3,0,7);c.fill()}}
];

export const GOWN=['#4f86c6','#8a6fd1','#3fa38d','#c97a4a','#5b8fd6','#c96a8a','#6c9a4c','#4a9ac9','#b88a3c','#7a6fd1','#d07a9a','#5a7fd8'];
export const HAIR=['#2b1d14','#9a9a9a','#cfcfcf','#3a2a1a','#1a1a1a','#c8c8c8','#bdbdbd','#5a3a22','#e0e0e0','#a0a0a0','#2a1a10','#d8d8d8'];
