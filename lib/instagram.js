import { sanitizePublicText, containsPublicResearchWindow } from './publicCopy.js';

export const STELLATE_PROMO_CARD = {
  type: 'promo',
  headline: '지금 뜨는 이야기를\n한눈에',
  body: '지금 주목받는 이야기를\nSTELLATE에서 확인하세요',
  claimIds: [],
};

const clean = value => sanitizePublicText(String(value || '').replace(/\s+/g, ' ').trim());
const GENERIC_CARD_PATTERNS = [
  '최신 기사에서 확인된','최신 기사에서 주요','주요 내용을 살펴보세요','핵심 내용을 살펴보세요',
  '상세 내용은','정리했습니다','확인할 수 있습니다','지금 주목받는 이야기를','최신 흐름의 핵심',
  '화제가 되고 있습니다','관심이 집중되고 있습니다','귀추가 주목됩니다'
];

function normalize(value=''){return clean(value).toLowerCase().replace(/[^가-힣a-z0-9]/g,'');}
function ngrams(value,size=3){const text=normalize(value),set=new Set();for(let i=0;i<=text.length-size;i++)set.add(text.slice(i,i+size));return set;}
function similarity(a,b){const x=ngrams(a),y=ngrams(b);if(!x.size||!y.size)return 0;let c=0;x.forEach(v=>{if(y.has(v))c++});return c/(x.size+y.size-c);}
function isGenericCardText(value=''){const text=clean(value);return !text||GENERIC_CARD_PATTERNS.some(pattern=>text.includes(pattern));}

function parseBlogSections(blog=''){
  const sections=[];
  let current={heading:'',paragraphs:[]};
  for(const raw of String(blog||'').split('\n')){
    const line=clean(raw.replace(/^[-*]\s+/,''));
    if(!line)continue;
    if(line.startsWith('## ')){
      if(current.heading||current.paragraphs.length)sections.push(current);
      current={heading:clean(line.replace(/^##\s+/,'')),paragraphs:[]};
    }else current.paragraphs.push(line);
  }
  if(current.heading||current.paragraphs.length)sections.push(current);
  return sections;
}

function findSection(sections,pattern){return sections.find(section=>pattern.test(section.heading))||{heading:'',paragraphs:[]};}
function splitCardText(value='',max=170){
  const text=clean(value);
  if(text.length<=max)return text;
  const sentences=text.split(/(?<=[.!?다요])\s+/).filter(Boolean);
  let out='';
  for(const sentence of sentences){if((`${out} ${sentence}`).trim().length>max)break;out=`${out} ${sentence}`.trim();}
  return (out||text).slice(0,max).trim();
}
function claimIdsForText(content={},text=''){
  const normalized=normalize(text);
  const ids=[];
  for(const row of Array.isArray(content.claimMap)?content.claimMap:[]){
    const rowText=normalize(row?.text||'');
    if(!rowText||!normalized)continue;
    if(normalized.includes(rowText.slice(0,Math.min(18,rowText.length)))||rowText.includes(normalized.slice(0,Math.min(18,normalized.length)))){
      for(const id of Array.isArray(row?.claimIds)?row.claimIds:[])if(!ids.includes(id))ids.push(id);
    }
  }
  if(!ids.length){
    const facts=Array.isArray(content.factLedger?.facts)?content.factLedger.facts:[];
    const scored=facts.map(fact=>({id:fact?.id||'',score:similarity(text,fact?.text||'')})).filter(row=>row.id).sort((a,b)=>b.score-a.score);
    if(scored[0]?.score>=0.12)ids.push(scored[0].id);
  }
  return ids;
}
function sourceNames(content={}){
  return [...new Set((content.sourceItems||[]).map(item=>clean(item?.source)).filter(Boolean))].slice(0,3);
}
function uniqueRows(rows=[]){
  const out=[];
  for(const row of rows.map(clean).filter(text=>text.length>=12&&!isGenericCardText(text))){
    if(out.some(existing=>similarity(existing,row)>0.45))continue;
    out.push(row);
  }
  return out;
}

export function ensurePromoCard(cards=[],content={}){
  const title=clean(content.instagramTitle||content.feedTitle||content.card?.feedTitle||content.topTitle||content.displayTitle||content.keyword||'지금 뜨는 이야기');
  const keyword=clean(content.topKeyword||content.keyword||'이 주제');
  const summary=clean(content.card?.summary||content.summary||content.card?.why||`${keyword}에 대한 핵심 정보를 정리했습니다.`);
  const sections=parseBlogSections(content.blog||'').filter(section=>section.heading||section.paragraphs.length);
  const sourceList=sourceNames(content);
  const fallbackFactIds=(Array.isArray(content.factLedger?.facts)?content.factLedger.facts:[]).map(fact=>fact?.id).filter(Boolean);
  const basic=findSection(sections,/알아보기|어떤|기본|소개|정보/i);
  const issue=findSection(sections,/이슈|변화|발표|공개|확인|주요|일정|결과/i);
  const insight=findSection(sections,/STELLATE\s*인사이트|인사이트/i);

  const claimIds=(text,index=0)=>{
    const ids=claimIdsForText(content,text);
    return ids.length?ids:(fallbackFactIds.length?[fallbackFactIds[Math.min(index,fallbackFactIds.length-1)]]:[]);
  };
  const bodyCards=[{
    type:'cover',headline:title,body:splitCardText(summary,150),claimIds:claimIds(summary,0),
  }];

  const basicRows=uniqueRows(basic.paragraphs||[]);
  const basicBody=splitCardText(basicRows.join(' ')||summary,180);
  bodyCards.push({
    type:'feed_section',headline:clean(basic.heading)||`${keyword}은 어떤 주제인가`,body:basicBody,claimIds:claimIds(basicBody,0),
  });

  const issueRows=uniqueRows(issue.paragraphs||[]);
  const issueChunks=[];
  if(issueRows.join(' ').length>205&&issueRows.length>1){
    const midpoint=Math.ceil(issueRows.length/2);
    issueChunks.push(issueRows.slice(0,midpoint).join(' '),issueRows.slice(midpoint).join(' '));
  }else issueChunks.push(issueRows.join(' ')||clean(content.card?.points?.join(' '))||summary);
  issueChunks.slice(0,2).forEach((chunk,index)=>{
    const body=splitCardText(chunk,180);
    bodyCards.push({
      type:'issue',
      headline:issueChunks.length>1?`${clean(issue.heading)||'현재 확인된 주요 내용'} ${index+1}`:(clean(issue.heading)||'현재 확인된 주요 내용'),
      body,claimIds:claimIds(body,index+1),
    });
  });

  const insightRows=uniqueRows(insight.paragraphs||[]);
  const insightBody=splitCardText(insightRows.join(' ')||clean(content.card?.why)||summary,180);
  bodyCards.push({type:'insight',headline:'STELLATE 인사이트',body:insightBody,claimIds:claimIds(insightBody,3)});

  const normalized=bodyCards.slice(0,5).map((card,index)=>({
    ...card,page:index+1,headline:clean(card.headline).slice(0,56),body:clean(card.body).slice(0,180),
    sourceNames:index===bodyCards.slice(0,5).length-1?sourceList:undefined,
    photoCredit:(content.imageMeta?.photographerName||content.imageMeta?.photographer)?`Photo: ${content.imageMeta.photographerName||content.imageMeta.photographer} / Unsplash`:null,
  }));
  return [...normalized,{...STELLATE_PROMO_CARD,page:normalized.length+1}];
}

export function validateInstagramCards(cards=[],content={}){
  const info=(Array.isArray(cards)?cards:[]).filter(card=>card?.type!=='promo');
  const reasons=[];
  if(info.length<4||info.length>5)reasons.push('정보 카드는 피드 분량에 따라 4~5장이어야 합니다.');
  if(cards.at(-1)?.type!=='promo')reasons.push('홍보 카드가 마지막에 없습니다.');
  if(info[0]?.type!=='cover')reasons.push('첫 정보 카드는 표지여야 합니다.');
  if(info.slice(1).length<3)reasons.push('표지 다음에 피드 내용 카드가 3장 이상 필요합니다.');
  for(const card of info){
    if(clean(card.body).length<20)reasons.push('카드 본문이 너무 짧습니다.');
    if(isGenericCardText(card.body))reasons.push('상투적인 카드 문구가 포함됐습니다.');
    if(containsPublicResearchWindow(`${card.headline||''} ${card.body||''}`))reasons.push('공개 카드에 조사 시간 범위 표현이 포함됐습니다.');
  }
  let duplicatePairs=0,totalPairs=0;
  const comparable=info.filter(card=>card.type!=='cover');
  for(let i=0;i<comparable.length;i++)for(let j=i+1;j<comparable.length;j++){totalPairs++;if(similarity(comparable[i].body,comparable[j].body)>0.5)duplicatePairs++;}
  const duplicateRatio=totalPairs?duplicatePairs/totalPairs:0;
  if(duplicateRatio>0.25)reasons.push('카드 간 내용 중복률이 높습니다.');
  const facts=new Set((content.factLedger?.facts||[]).map(f=>f.id));
  const factual=info.filter(card=>card.type!=='cover');
  if(facts.size&&factual.some(card=>!(card.claimIds||[]).some(id=>facts.has(id))))reasons.push('피드 내용 카드에 연결된 Fact ID가 없습니다.');
  const uniqueClaims=new Set(factual.flatMap(card=>(card.claimIds||[]).filter(id=>facts.has(id))));
  return {passed:reasons.length===0,reasons:[...new Set(reasons)],duplicateRatio:Number(duplicateRatio.toFixed(3)),uniqueClaimCount:uniqueClaims.size};
}

export function buildInstagramCaption(content={}){
  const title=clean(content.instagramTitle||content.feedTitle||content.topTitle||content.card?.feedTitle||content.displayTitle||content.keyword||'지금 뜨는 이야기');
  const cards=ensurePromoCard(content.instagramCards||[],content).filter(card=>card.type!=='promo'&&card.type!=='cover');
  const sources=sourceNames(content);
  const tags=[content.categoryLabel,content.topKeyword||content.keyword,'STELLATE','오늘의이슈','팩트정리','트렌드인사이트']
    .filter(Boolean).map(v=>`#${String(v).replace(/\s+/g,'')}`).filter((v,i,a)=>a.indexOf(v)===i).slice(0,8);
  return sanitizePublicText([
    `오늘의 이슈 | ${title}`,'',
    ...cards.map(card=>`— ${card.headline}: ${card.body}`),
    '',sources.length?`출처: ${sources.join(' · ')}`:'출처와 원문 링크는 STELLATE 상세페이지에서 확인하세요.',
    '원문 표현을 옮기지 않고 확인된 사실을 기준으로 재구성했습니다.',
    'https://stellate.co.kr','',tags.join(' '),
  ].filter(Boolean).join('\n').trim());
}
