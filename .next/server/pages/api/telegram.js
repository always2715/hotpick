"use strict";(()=>{var e={};e.id=548,e.ids=[548],e.modules={145:e=>{e.exports=require("next/dist/compiled/next-server/pages-api.runtime.prod.js")},6249:(e,t)=>{Object.defineProperty(t,"l",{enumerable:!0,get:function(){return function e(t,r){return r in t?t[r]:"then"in t&&"function"==typeof t.then?t.then(t=>e(t,r)):"function"==typeof t&&"default"===r?t:void 0}}})},4966:(e,t,r)=>{r.r(t),r.d(t,{config:()=>d,default:()=>u,routeModule:()=>l});var s={};r.r(s),r.d(s,{default:()=>i});var n=r(1802),o=r(7153),a=r(6249);async function i(e,t){if("POST"!==e.method)return t.status(405).json({error:"Method not allowed"});if(e.headers.authorization!==`Bearer ${process.env.CRON_SECRET}`)return t.status(401).json({error:"Unauthorized"});let{keyword:r,summary:s,rank:n,slug:o,type:a}=e.body,i=process.env.TELEGRAM_BOT_TOKEN,u=process.env.TELEGRAM_CHANNEL_ID;if(!i||!u)return t.status(400).json({error:"Telegram not configured"});try{let d="";if("top10"===a){let{trends:t}=e.body;d=`📊 *실시간 검색순위 TOP 10*

`,(t||[]).slice(0,10).forEach((e,t)=>{d+=`${0===t?"\uD83D\uDD25":t<3?"⭐":"\xb7"} ${t+1}위 ${e.topTitle||e.displayTitle||e.keyword}
`}),d+=`
🔗 [전체 TOP 30 보기](https://stellate.co.kr)`}else d=`${n<=3?"\uD83D\uDD25":"\uD83D\uDCC8"} *${n}위 진입*

*${r}*

${s||""}

🔗 [자세히 보기](https://stellate.co.kr/${o})

#실시간트렌드 #STELLATE`;let l=await fetch(`https://api.telegram.org/bot${i}/sendMessage`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({chat_id:u,text:d,parse_mode:"Markdown",disable_web_page_preview:!1})}),c=await l.json();if(c.ok)return t.status(200).json({success:!0,messageId:c.result.message_id});return t.status(500).json({success:!1,error:c})}catch(e){return t.status(500).json({success:!1,error:e.message})}}let u=(0,a.l)(s,"default"),d=(0,a.l)(s,"config"),l=new n.PagesAPIRouteModule({definition:{kind:o.x.PAGES_API,page:"/api/telegram",pathname:"/api/telegram",bundlePath:"",filename:""},userland:s})},7153:(e,t)=>{var r;Object.defineProperty(t,"x",{enumerable:!0,get:function(){return r}}),function(e){e.PAGES="PAGES",e.PAGES_API="PAGES_API",e.APP_PAGE="APP_PAGE",e.APP_ROUTE="APP_ROUTE"}(r||(r={}))},1802:(e,t,r)=>{e.exports=r(145)}};var t=require("../../webpack-api-runtime.js");t.C(e);var r=t(t.s=4966);module.exports=r})();