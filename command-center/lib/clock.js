/* City clocks and approximate NOAA solar elevation for Hamburg. No geolocation or APIs. */
(function(root){
  'use strict';
  const CITIES=[
    {id:'hamburg',name:'Hamburg',zone:'Europe/Berlin'},
    {id:'washington',name:'Washington, D.C.',zone:'America/New_York'},
    {id:'capecod',name:'Cape Cod',zone:'America/New_York'},
    {id:'london',name:'UK · London',zone:'Europe/London'},
    {id:'sydney',name:'Australien · Sydney',zone:'Australia/Sydney'}
  ];
  function parts(date,zone){
    const items=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date);
    return Object.fromEntries(items.filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  }
  function cityTime(date,zone){
    const p=parts(date,zone);
    return {time:p.hour+':'+p.minute+':'+p.second,day:p.year+'-'+p.month+'-'+p.day,hour:Number(p.hour)};
  }
  function solarElevation(date,lat=53.5511,lon=9.9937){
    const y=date.getUTCFullYear(),start=Date.UTC(y,0,1),days=(Date.UTC(y,date.getUTCMonth(),date.getUTCDate())-start)/86400000+1;
    const minutes=date.getUTCHours()*60+date.getUTCMinutes()+date.getUTCSeconds()/60;
    const gamma=2*Math.PI/365*(days-1+(minutes/60-12)/24);
    const eq=229.18*(.000075+.001868*Math.cos(gamma)-.032077*Math.sin(gamma)-.014615*Math.cos(2*gamma)-.040849*Math.sin(2*gamma));
    const dec=.006918-.399912*Math.cos(gamma)+.070257*Math.sin(gamma)-.006758*Math.cos(2*gamma)+.000907*Math.sin(2*gamma)-.002697*Math.cos(3*gamma)+.00148*Math.sin(3*gamma);
    const ha=(minutes+eq+4*lon)/4-180;
    const rad=Math.PI/180;
    const cosZen=Math.sin(lat*rad)*Math.sin(dec)+Math.cos(lat*rad)*Math.cos(dec)*Math.cos(ha*rad);
    return Math.asin(Math.min(1,Math.max(-1,cosZen)))/rad;
  }
  function greeting(date){const h=cityTime(date,'Europe/Berlin').hour;return h>=5&&h<11?'Guten Morgen':h>=11&&h<18?'Guten Tag':'Guten Abend'}
  function sunMood(date){const altitude=solarElevation(date);return {altitude,icon:altitude>=0?'☀':'☾',label:altitude>=0?'Sonne':'Nacht',visible:altitude>=-1}}
  const API={CITIES,cityTime,solarElevation,greeting,sunMood};
  root.CenterClock=API;if(typeof module!=='undefined'&&module.exports)module.exports=API;
})(typeof window!=='undefined'?window:globalThis);
