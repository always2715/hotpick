"use strict";(()=>{var e={};e.id=469,e.ids=[469],e.modules={145:e=>{e.exports=require("next/dist/compiled/next-server/pages-api.runtime.prod.js")},4770:e=>{e.exports=require("crypto")},6249:(e,t)=>{Object.defineProperty(t,"l",{enumerable:!0,get:function(){return function e(t,o){return o in t?t[o]:"then"in t&&"function"==typeof t.then?t.then(t=>e(t,o)):"function"==typeof t&&"default"===o?t:void 0}}})},4843:(e,t,o)=>{o.r(t),o.d(t,{config:()=>c,default:()=>u,routeModule:()=>d});var n={};o.r(n),o.d(n,{default:()=>i});var r=o(1802),s=o(7153),a=o(6249);async function i(e,t){if("POST"!==e.method)return t.status(405).json({error:"Method not allowed"});if(e.headers.authorization!==`Bearer ${process.env.CRON_SECRET}`)return t.status(401).json({error:"Unauthorized"});let{keyword:n,summary:r,rank:s,slug:a}=e.body;if(!n)return t.status(400).json({error:"keyword required"});let i=process.env.TWITTER_API_KEY,u=process.env.TWITTER_API_SECRET,c=process.env.TWITTER_ACCESS_TOKEN,d=process.env.TWITTER_ACCESS_TOKEN_SECRET;if(!i||!u||!c||!d)return t.status(400).json({error:"Twitter API keys not configured"});try{let e=s<=3?`🔥 실시간 ${s}위 진입

${n}

${r||""}

자세히 보기 👇
stellate.co.kr/${a}

#${n.replace(/ /g,"")} #실시간트렌드 #STELLATE`:`📈 검색순위 ${s}위

${n}

${r||""}

stellate.co.kr/${a}

#실시간트렌드 #STELLATE`,p=function(e,t,n,r,s){let a=Math.floor(Date.now()/1e3).toString(),i={oauth_consumer_key:e,oauth_nonce:Math.random().toString(36).substring(2),oauth_signature_method:"HMAC-SHA1",oauth_timestamp:a,oauth_token:n,oauth_version:"1.0"},u=Object.keys(i).sort().map(e=>`${encodeURIComponent(e)}=${encodeURIComponent(i[e])}`).join("&"),c=`POST&${encodeURIComponent("https://api.twitter.com/2/tweets")}&${encodeURIComponent(u)}`,d=`${encodeURIComponent(t)}&${encodeURIComponent(r)}`,p=o(4770).createHmac("sha1",d).update(c).digest("base64");return i.oauth_signature=p,"OAuth "+Object.keys(i).sort().map(e=>`${encodeURIComponent(e)}="${encodeURIComponent(i[e])}"`).join(", ")}(i,u,c,d,0),l=await fetch("https://api.twitter.com/2/tweets",{method:"POST",headers:{"Content-Type":"application/json",Authorization:p},body:JSON.stringify({text:e})}),m=await l.json();if(m.data?.id)return t.status(200).json({success:!0,tweetId:m.data.id});return t.status(500).json({success:!1,error:m})}catch(e){return t.status(500).json({success:!1,error:e.message})}}let u=(0,a.l)(n,"default"),c=(0,a.l)(n,"config"),d=new r.PagesAPIRouteModule({definition:{kind:s.x.PAGES_API,page:"/api/twitter",pathname:"/api/twitter",bundlePath:"",filename:""},userland:n})},7153:(e,t)=>{var o;Object.defineProperty(t,"x",{enumerable:!0,get:function(){return o}}),function(e){e.PAGES="PAGES",e.PAGES_API="PAGES_API",e.APP_PAGE="APP_PAGE",e.APP_ROUTE="APP_ROUTE"}(o||(o={}))},1802:(e,t,o)=>{e.exports=o(145)}};var t=require("../../webpack-api-runtime.js");t.C(e);var o=t(t.s=4843);module.exports=o})();