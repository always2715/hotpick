const STOP = new Set([
  '속보','단독','종합','뉴스','영상','포토','오늘','내일','어제','공식','발표','관련','논란','화제','최신','기자','전문','전체','추가','확인','현재','대한','통해','위한','에서','으로','한다','했다','있다','된다','이번','해당','그리고','하지만','또한','까지','부터','에게','대한민국','한국'
]);
const GENERIC_SINGLE = new Set(['수소','날씨','여행','영화','드라마','주식','정부','사건','사고','경기','선수','배우','가수','기업','학교','병원','정책','결과','순위','공장','분리수거']);
const CLICKBAIT = /속보|단독|충격|결국|왜\s|무슨\s*일|총정리|나노\s*분석|떡밥|대박|실화|레전드|반응|리뷰|리액션|게임\s*플레이|시뮬레이션/i;
const OFFICIAL_SUFFIX = /(^|\.)go\.kr$|(^|\.)gov\.kr$/i;

export function normalizeText(value='') {
  return String(value || '').toLowerCase().replace(/<[^>]*>/g,' ').replace(/[^0-9a-zㄱ-힣\s]/gi,' ').replace(/\s+/g,' ').trim();
}

export function tokens(value='') {
  const rows=normalizeText(value).split(' ').filter(Boolean);
  return rows.filter(token => !STOP.has(token) && (token.length > 1 || (/^[가-힣]$/.test(token) && rows.length > 1)));
}

function unique(values=[]) { return [...new Set(values.filter(Boolean))]; }
function clamp(value,min,max){ return Math.max(min,Math.min(max,value)); }
function domain(value='') { try { return new URL(value).hostname.toLowerCase().replace(/^www\./,''); } catch { return ''; } }
function hoursSince(value){const time=new Date(value||0).getTime();return Number.isFinite(time)&&time>0?Math.max(0,(Date.now()-time)/3600000):999;}

export function tokenSimilarity(a='',b='') {
  const left=new Set(tokens(a)),right=new Set(tokens(b));
  if(!left.size||!right.size)return 0;
  let common=0;left.forEach(token=>{if(right.has(token)||[...right].some(v=>v.includes(token)||token.includes(v)))common++;});
  return common/(left.size+right.size-common);
}

function titleSignature(value='') {
  return tokens(value).filter(token => !/^\d+$/.test(token)).slice(0,12).sort().join('|');
}

function isOfficialDomain(value='') {
  const d=String(value||'').toLowerCase();
  return OFFICIAL_SUFFIX.test(d) || [
    'korea.kr','fsc.go.kr','fss.or.kr','kisa.or.kr','bok.or.kr','kostat.go.kr','kdca.go.kr','police.go.kr','scourt.go.kr',
    'olympics.com','fifa.com','the-afc.com','kfa.or.kr','kovo.co.kr','koreabaseball.com'
  ].some(item=>d===item||d.endsWith(`.${item}`));
}

function relatedToKeyword(keyword,title){
  const kt=tokens(keyword),tt=tokens(title);
  if(!kt.length||!tt.length)return 0;
  let common=0;
  kt.forEach(token=>{if(tt.some(other=>other===token||other.includes(token)||token.includes(other)))common++;});
  return common/kt.length;
}

export function clusterEventArticles(keyword='', articles=[], relatedNews=[]) {
  const combined=[...(Array.isArray(articles)?articles:[]),...(Array.isArray(relatedNews)?relatedNews:[])];
  const seen=new Set();
  const rows=combined.map((item,index)=>({
    id:item.id||`A${index+1}`,
    title:String(item.title||'').trim(),link:item.link||'',source:item.source||'',publishedAt:item.publishedAt||null,
    domain:domain(item.link||'')||String(item.domain||item.source||'').toLowerCase(),provider:item.provider||'',
  })).filter(item=>item.title).filter(item=>{const key=normalizeText(item.title);if(!key||seen.has(key))return false;seen.add(key);return true;});

  const clusters=[];
  for(const row of rows){
    const rel=relatedToKeyword(keyword,row.title);
    if(rel<=0 && tokens(keyword).length>1) continue;
    let best=null,bestScore=0;
    for(const cluster of clusters){
      const representative=cluster.rows[0]?.title||'';
      const score=Math.max(tokenSimilarity(row.title,representative),...cluster.rows.slice(0,4).map(other=>tokenSimilarity(row.title,other.title)));
      if(score>bestScore){best=cluster;bestScore=score;}
    }
    if(best&&bestScore>=0.34){best.rows.push(row);best.similarities.push(bestScore);}
    else clusters.push({rows:[row],similarities:[1]});
  }

  const scored=clusters.map(cluster=>{
    const domains=unique(cluster.rows.map(row=>row.domain));
    const newestHours=Math.min(...cluster.rows.map(row=>hoursSince(row.publishedAt)));
    const avgSimilarity=cluster.similarities.reduce((sum,value)=>sum+value,0)/Math.max(1,cluster.similarities.length);
    const keywordRelevance=cluster.rows.reduce((sum,row)=>sum+relatedToKeyword(keyword,row.title),0)/Math.max(1,cluster.rows.length);
    const score=cluster.rows.length*5+domains.length*4+avgSimilarity*8+keywordRelevance*8+clamp(8-newestHours/2,0,8);
    return {...cluster,domains,newestHours,avgSimilarity,keywordRelevance,score};
  }).sort((a,b)=>b.score-a.score);
  const dominant=scored[0]||{rows:[],domains:[],newestHours:999,avgSimilarity:0,keywordRelevance:0,score:0};
  const totalRows=scored.reduce((sum,cluster)=>sum+cluster.rows.length,0);
  const dominance=totalRows?dominant.rows.length/totalRows:0;
  const coherence=Math.round(clamp((dominance*0.55+dominant.avgSimilarity*0.25+dominant.keywordRelevance*0.2)*100,0,100));
  return {clusters:scored,dominant,totalRows,coherence,ambiguous:scored.length>1&&dominance<0.55};
}

export function countIndependentSources(rows=[]) {
  const groups=[];
  for(const row of rows){
    const d=row.domain||domain(row.link||'')||row.source||'';
    const title=row.title||'';
    let duplicate=false;
    for(const group of groups){
      const leftSignature=titleSignature(title),rightSignature=titleSignature(group.title);
      if(group.domain===d || tokenSimilarity(title,group.title)>=0.76 || (leftSignature&&rightSignature&&leftSignature===rightSignature)){
        duplicate=true;group.domains.add(d);break;
      }
    }
    if(!duplicate)groups.push({title,domain:d,domains:new Set([d]),publishedAt:row.publishedAt});
  }
  return {count:groups.length,groups,domains:unique(rows.map(row=>row.domain||domain(row.link||'')||row.source||''))};
}

export function scoreSearchSignal({trafficValue=0,googleRank=50,datalab=null}={}){
  const trafficScore=clamp((Math.log10(Math.max(500,Number(trafficValue)||500))-2.69)*7.5,0,15);
  const rankScore=clamp(10-(Number(googleRank||50)-1)*0.25,0,10);
  const google=Math.round(clamp(trafficScore+rankScore,0,18));
  const growth=Number(datalab?.growth||0),latest=Number(datalab?.latest||0);
  const naver=Math.round(clamp(Math.max(0,growth)*5+Math.min(1,latest/100)*7,0,12));
  return {score:Math.round(clamp(google+naver,0,25)),google,naver,growth,latest};
}

export function scoreNewsVelocity(rows=[]){
  const h6=rows.filter(row=>hoursSince(row.publishedAt)<=6).length;
  const h12=rows.filter(row=>hoursSince(row.publishedAt)<=12).length;
  const h24=rows.filter(row=>hoursSince(row.publishedAt)<=24).length;
  const h36=rows.filter(row=>hoursSince(row.publishedAt)<=36).length;
  return {score:Math.round(clamp(h6*4+h12*1.5+h24*0.4+h36*0.2,0,20)),h6,h12,h24,h36};
}

export function scoreFreshness(rows=[]){
  const newest=Math.min(...rows.map(row=>hoursSince(row.publishedAt)),999);
  return {score:Math.round(clamp(10-newest/2.4,0,10)),newestHours:Number(newest.toFixed(2))};
}

export function evaluateTrendCandidate({keyword='',trafficValue=0,googleRank=50,articles=[],relatedNews=[],datalab=null,previousRank=null,categoryConfidence=0,communitySignal=0,youtubeSupport=0}={}){
  const event=clusterEventArticles(keyword,articles,relatedNews);
  const rows=event.dominant.rows||[];
  const independence=countIndependentSources(rows);
  const search=scoreSearchSignal({trafficValue,googleRank,datalab});
  const velocity=scoreNewsVelocity(rows);
  const freshness=scoreFreshness(rows);
  const coherenceScore=Math.round(event.coherence*0.15);
  const sourceScore=Math.round(clamp(independence.count*7,0,20));
  const officialCount=independence.domains.filter(isOfficialDomain).length;
  const officialScore=officialCount?5:0;
  const persistenceScore=previousRank?previousRank<=10?5:previousRank<=20?3:1:0;
  const youtubeBonus=clamp(Number(youtubeSupport||0),0,3); // 진단용이며 TOP 순위에는 반영하지 않습니다.
  const onlineReactionScore=Math.round(clamp(Number(communitySignal||0),0,10));
  const base=Math.round(search.score+velocity.score+coherenceScore+sourceScore+freshness.score+officialScore+persistenceScore+onlineReactionScore);
  const keywordTokens=tokens(keyword);
  const genericSingle=keywordTokens.length===1&&(GENERIC_SINGLE.has(keywordTokens[0])||keywordTokens[0].length<=2);
  const clickbait=CLICKBAIT.test(keyword);
  const penalties=[];
  let penalty=0;
  if(genericSingle){penalty+=15;penalties.push('단일 일반명사 검색어');}
  if(event.ambiguous){penalty+=20;penalties.push('하나의 지배적 사건으로 묶이지 않음');}
  if(event.coherence<55){penalty+=15;penalties.push('사건 클러스터 일관성 낮음');}
  if(clickbait){penalty+=20;penalties.push('낚시성·영상형 문구');}
  if(categoryConfidence&&categoryConfidence<0.4){penalty+=15;penalties.push('카테고리 확신도 매우 낮음');}
  else if(categoryConfidence&&categoryConfidence<0.5){penalty+=7;penalties.push('카테고리 확신도 낮음');}
  const score=Math.round(clamp(base-penalty,0,100));

  const conditionA=officialCount>=1&&independence.count>=1;
  const conditionB=independence.count>=2&&event.coherence>=70;
  const conditionC=search.score>=18&&independence.count>=3&&freshness.newestHours<=6&&event.coherence>=60;
  const hardReasons=[];
  if(!rows.length)hardReasons.push('최근 36시간 동일 사건 기사 없음');
  if(!(conditionA||conditionB||conditionC))hardReasons.push('공식 1개 또는 독립 출처 2개 기준 미충족');
  if(event.coherence<55)hardReasons.push('사건 일관성 55점 미만');
  if(genericSingle&&event.coherence<75)hardReasons.push('모호한 일반명사 사건 미해결');
  if(freshness.newestHours>36)hardReasons.push('최근 36시간 신규 보도 없음');
  if(clickbait&&independence.count<2)hardReasons.push('영상·리뷰성 후보이며 독립 출처 부족');

  let grade=score>=85?'A':score>=75?'B':score>=65?'C':'D';
  const eligible=hardReasons.length===0&&grade!=='D';
  if(!eligible&&grade!=='D')grade='C';
  const mainVisible=eligible&&(grade==='A'||grade==='B');
  const contentTier=mainVisible?(grade==='A'?'full':'standard'):'none';
  return {
    score,grade,eligible,mainVisible,contentTier,
    components:{search:search.score,newsVelocity:velocity.score,eventCoherence:coherenceScore,sourceDiversity:sourceScore,freshness:freshness.score,official:officialScore,persistence:persistenceScore,onlineReaction:onlineReactionScore,youtubeSupportDiagnostic:youtubeBonus},
    search,velocity,freshness,eventCoherence:event.coherence,independentSources:independence.count,sourceDomains:independence.domains,officialSources:officialCount,
    dominantArticles:rows,hardReasons,penalties,clusterCount:event.clusters.length,dominantShare:event.totalRows?Number((rows.length/event.totalRows).toFixed(3)):0,
  };
}

export function articleSignatureSet(rows=[]){
  const set=new Set();
  for(const row of (Array.isArray(rows)?rows:[])){
    const d=row.domain||domain(row.link||'')||String(row.source||'').toLowerCase();
    const sig=titleSignature(row.title||'');
    if(!sig)continue;
    set.add(d?`${d}|${sig}`:`t|${sig}`);
  }
  return [...set];
}

export function compareTrendSets(previous=[],next=[]){
  const prev=new Map(previous.map(item=>[item.eventKey||item.trendKey||item.slug,item]));
  const now=new Map(next.map(item=>[item.eventKey||item.trendKey||item.slug,item]));
  const entered=[],dropped=[],moved=[];
  next.forEach(item=>{const key=item.eventKey||item.trendKey||item.slug;const old=prev.get(key);if(!old)entered.push({slug:item.slug,title:item.displayTitle,rank:item.rank});else if(Number(old.rank)!==Number(item.rank))moved.push({slug:item.slug,title:item.displayTitle,from:old.rank,to:item.rank});});
  previous.forEach(item=>{const key=item.eventKey||item.trendKey||item.slug;if(!now.has(key))dropped.push({slug:item.slug,title:item.displayTitle,rank:item.rank});});
  return {entered,dropped,moved,previousCount:previous.length,nextCount:next.length};
}
