// Compose complete, already-authorized card images. Never redraw card contents.
async function paint(options){
 var ctx=options.ctx,layout=options.layout,team=options.team,event=options.tournament,draw=options.draw,w=layout.width,h=layout.height
 var bg=ctx.createLinearGradient(0,0,w*.7,h);bg.addColorStop(0,'#07583b');bg.addColorStop(.55,'#032e23');bg.addColorStop(1,'#01271e');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h)
 if(options.heroSource){await draw(options.heroSource,0,0,w,560,'coverTop');var shade=ctx.createLinearGradient(0,0,0,580);shade.addColorStop(0,'rgba(0,27,23,.12)');shade.addColorStop(1,'#032e23');ctx.fillStyle=shade;ctx.fillRect(0,0,w,580)}
 function beam(y,wide,color){ctx.save();ctx.translate(w/2,y);ctx.rotate(-24*Math.PI/180);ctx.fillStyle=color;ctx.fillRect(-w,-wide/2,w*2,wide);ctx.restore()}
 beam(270,130,'rgba(182,227,111,.035)');for(var row=0;row<Math.ceil(options.players.length/3);row++)if(row%2)beam(440+row*(layout.cardHeight+28),320,'rgba(117,203,162,.025)')
 function line(x1,y1,x2,y2,color,width){ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.lineWidth=width||1;ctx.stroke()}
 function text(value,x,y,size,color,maxWidth,weight){ctx.font=(weight||400)+' '+size+'px sans-serif';ctx.fillStyle=color;ctx.textAlign='left';var part='',offset=0;Array.from(String(value||'')).forEach(function(char){if(ctx.measureText(part+char).width>maxWidth&&part){ctx.fillText(part,x,y+offset);offset+=size*1.3;part=''}part+=char});ctx.fillText(part,x,y+offset);return offset+size*1.3}
 if(team.logo){ctx.save();ctx.beginPath();ctx.rect(0,0,w,560);ctx.clip();ctx.globalAlpha=.18;await draw(team.logo,280,-320,1040,1040);ctx.restore()}
 if(event.logo)await draw(event.logo,60,22,66,66);text(event.name,event.logo?150:60,65,28,'#adbcaf',event.logo?990:1080);line(60,104,1140,104,'rgba(189,214,197,.13)')
 if(team.logo)await draw(team.logo,60,150,150,150)
 text(team.name,240,220,52,'#ecf3e9',890,700);text(event.divisionName,240,272,28,'#a7bdaa',890)
 ctx.font='900 68px sans-serif';ctx.fillStyle='#eef2df';ctx.textAlign='center';ctx.fillText('球队大名单',w/2,386);ctx.textAlign='left';if(options.status&&options.status!=='正式名单')text(options.status,60,432,26,'#cbeb9d',780,500)
 ctx.font='500 30px sans-serif';ctx.fillStyle='#afc8a3';ctx.textAlign='right';ctx.fillText(String(options.total)+' 名球员',1134,432);ctx.textAlign='left'
 line(60,466,1140,466,'rgba(189,214,197,.16)');line(60,466,180,466,'#cbeb9d',6)
 if(options.staff.length){line(60,layout.staffTop-25,1140,layout.staffTop-25,'rgba(189,214,197,.15)');line(63,layout.staffTop,63,layout.staffTop+30,'#cbed9b',5);text('教练与工作人员',86,layout.staffTop+25,30,'#d9e5cd',1030,600);for(var si=0;si<options.staff.length;si++){var person=options.staff[si],sx=60+(si%3)*(layout.cardWidth+28)+(layout.cardWidth-layout.staffCardWidth)/2,sy=layout.staffTop+76+Math.floor(si/3)*layout.staffRowHeight;if(person.ready)await draw(person.cardUrl,sx,sy,layout.staffCardWidth,layout.staffCardHeight);else{if(person.photoUrl)await draw(person.photoUrl,sx,sy,layout.staffCardWidth,layout.staffCardHeight*.77);else text('头像待补充',sx,sy+layout.staffCardHeight*.45,24,'#829c8a',layout.staffCardWidth);text(person.name,sx,sy+layout.staffCardHeight*.94,28,'#d4e2d4',layout.staffCardWidth,500)}text(person.role,sx,sy+layout.staffCardHeight+40,28,'#cbeb9d',layout.staffCardWidth,600)}}
 text('参赛球员',60,layout.slots.length?layout.slots[0].y-24:layout.staffTop+30,30,'#d9e5cd',1000,600)
 for(var i=0;i<options.players.length;i++){
  var player=options.players[i],slot=layout.slots[i],cw=layout.cardWidth,ch=layout.cardHeight
  if(player.ready){ctx.save();ctx.translate(slot.x+cw/2,slot.y+ch/2);ctx.rotate(slot.rotation);ctx.scale(.96,.96);try{await draw(player.cardUrl,-cw/2,-ch/2,cw,ch)}finally{ctx.restore()}}
  else{ctx.fillStyle='rgba(21,44,34,.3)';ctx.fillRect(slot.x,slot.y,cw,ch);if(player.photoUrl)await draw(player.photoUrl,slot.x+12,slot.y+16,cw-24,ch*.64);text(player.number+'号 '+player.name,slot.x+14,slot.y+ch*.8,25,'#cad8ca',cw-28);text('暂无球员卡',slot.x+14,slot.y+ch-24,23,'#92aa92',cw-28)}
 }

 var footer=h-30;text('赛小蜂足球',60,footer,23,'#688574',220);line(260,footer-8,760,footer-8,'rgba(142,175,151,.2)');ctx.font='22px sans-serif';ctx.textAlign='right';ctx.fillStyle='#688574';ctx.fillText(options.pageText,1140,footer);ctx.textAlign='left'
}
module.exports={paint:paint}
