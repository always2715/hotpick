import { cleanText, canonicalizeUrl, domainFromUrl } from './contentPolicy.js';

const NOTICE='온라인 반응은 공개된 일부 게시물을 취합한 참고 정보이며, 전체 이용자 또는 전체 여론을 의미하지 않습니다.';
const INSUFFICIENT='의미 있게 취합할 수 있는 온라인 반응이 충분하지 않습니다.';
const ONLINE_TYPES=new Set(['blog','cafe','social','community','forum','review','comment']);
const ONLINE_DOMAINS=[
  'blog.naver.com','m.blog.naver.com','cafe.naver.com','x.com','twitter.com','facebook.com','instagram.com',
  'threads.net','reddit.com','dcinside.com','theqoo.net','fmkorea.com','instiz.net','ruliweb.com','clien.net',
  'mlbpark.donga.com','pann.nate.com','82cook.com','quora.com',
];
const OFFICIAL_SOCIAL_HINT=/(?:official|공식|newsroom|press|notice)/i;

export function isOnlineReactionSource(item={}) {
  const type=String(item.type||'').toLowerCase();
  const domain=domainFromUrl(item.link||item.url||'');
  if(item.official===true||item.sourceType==='official')return false;
  if(item.verifiedOfficialAccount===true||OFFICIAL_SOCIAL_HINT.test(String(item.accountType||'')))return false;
  return ONLINE_TYPES.has(type)||ONLINE_DOMAINS.some(value=>domain===value||domain.endsWith(`.${value}`));
}

function recentWithin36Hours(value) {
  const time=new Date(value||0).getTime();
  if(!Number.isFinite(time)||time<=0)return false;
  const age=Date.now()-time;
  return age>=0&&age<=36*60*60*1000;
}

function normalizeTemporaryItem(item={}) {
  const text=cleanText(item.originalText||item.description||item.snippet||item.title||'').slice(0,500);
  return {
    temporary:true,
    text,
    url:canonicalizeUrl(item.link||item.url||''),
    publishedAt:item.publishedAt||null,
  };
}

function classifyReaction(text='') {
  const value=cleanText(text);
  if(/기대|좋다|환영|편리|개선|긍정|반갑/.test(value))return 'positive';
  if(/우려|걱정|불안|오류|문제|불편|아쉽|비판|부정/.test(value))return 'concern';
  if(/궁금|언제|왜|어떻게|문의|확인 필요/.test(value))return 'question';
  return 'neutral';
}


export function buildOnlineReactionRankingSignal(items=[]) {
  const normalized=(Array.isArray(items)?items:[])
    .filter(isOnlineReactionSource)
    .filter(item=>recentWithin36Hours(item.publishedAt))
    .map(normalizeTemporaryItem)
    .filter(item=>item.text.length>=8);
  const seen=new Set();
  const unique=normalized.filter(item=>{
    const key=item.text.toLowerCase().replace(/\s+/g,' ').slice(0,160);
    if(!key||seen.has(key))return false;
    seen.add(key);return true;
  });
  const providers=new Set((Array.isArray(items)?items:[])
    .filter(isOnlineReactionSource)
    .filter(item=>recentWithin36Hours(item.publishedAt))
    .map(item=>String(item.type||item.provider||'online').toLowerCase()));
  const count=unique.length;
  let volumeScore=0;
  if(count>=3)volumeScore=2;
  if(count>=6)volumeScore=4;
  if(count>=12)volumeScore=6;
  if(count>=20)volumeScore=8;
  const diversityBonus=providers.size>=2?2:providers.size===1?1:0;
  return {
    score:Math.max(0,Math.min(10,volumeScore+diversityBonus)),
    recentCount:count,
    sourceTypeCount:providers.size,
    windowHours:36,
    rankingOnly:true,
  };
}

export function buildOnlineReactionPromptInput(items=[]) {
  const normalized=(Array.isArray(items)?items:[])
    .filter(isOnlineReactionSource)
    .filter(item=>recentWithin36Hours(item.publishedAt))
    .map(item=>({
      ...normalizeTemporaryItem(item),
      type:String(item.type||item.provider||'online').toLowerCase(),
    }))
    .filter(item=>item.text.length>=8);
  const seen=new Set();
  return normalized.filter(item=>{
    const key=item.text.toLowerCase().replace(/\s+/g,' ').slice(0,160);
    if(!key||seen.has(key))return false;
    seen.add(key);return true;
  }).slice(0,12).map((item,index)=>`O${index+1} | ${item.type} | ${item.publishedAt||''} | ${item.text}`).join('\n');
}

export function buildOnlineReactionSummary(items=[]) {
  const normalized=(Array.isArray(items)?items:[])
    .filter(isOnlineReactionSource)
    .filter(item=>recentWithin36Hours(item.publishedAt))
    .map(normalizeTemporaryItem)
    .filter(item=>item.text.length>=8);
  const seen=new Set();
  const unique=normalized.filter(item=>{const key=item.text.toLowerCase().replace(/\s+/g,' ').slice(0,160);if(seen.has(key))return false;seen.add(key);return true;});
  if(unique.length<3)return {summary:INSUFFICIENT,notice:NOTICE};
  const counts={positive:0,concern:0,question:0,neutral:0};
  unique.forEach(item=>{counts[classifyReaction(item.text)]++;});
  const parts=[];
  if(counts.positive)parts.push('변화에 대한 기대와 긍정적인 평가');
  if(counts.concern)parts.push('실제 적용 과정의 오류·불편에 대한 우려');
  if(counts.question)parts.push('추가 일정과 구체적인 적용 방식에 대한 질문');
  if(!parts.length)parts.push('서로 다른 의견과 확인 요청');
  const summary=`온라인에서는 ${parts.join(', ')}이 함께 확인됩니다. 아직 한 방향의 반응으로 단정하기보다는 공식적인 추가 안내를 기다리는 흐름으로 보는 것이 적절합니다.`;
  return {summary,notice:NOTICE};
}

export function splitOnlineReactionInputs(items=[]) {
  const online=[];
  const factual=[];
  for(const item of Array.isArray(items)?items:[]){
    if(isOnlineReactionSource(item))online.push(item);else factual.push(item);
  }
  return {online,factual};
}

export function onlineReactionInputPolicy() {
  return {
    temporary:true,useForFactLedger:false,useForRecentTrends:false,useForNewsSummary:false,
    useForStellateInsight:false,useForRanking:true,useForQualityGrade:false,useForCacheRefresh:false,
    includeInSources:false,displayRawContent:false,rankingWeightMax:10,publicDisplay:'summary_only',displaySummary:true,
  };
}
