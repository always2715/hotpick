import { cleanText, canonicalizeUrl } from './contentPolicy.js';

const QUERY_STOP_WORDS = new Set([
  '속보','단독','종합','영상','포토','기자','기자수첩','사설','칼럼','취재수첩','인터뷰',
  '오늘','어제','내일','이번','최근','관련','대한','통해','위한','공개','발표','확인','전망','뉴스',
]);

function normalized(value='') {
  return cleanText(value).toLowerCase().replace(/[^0-9a-z가-힣]/g,'');
}

function unique(values=[]) {
  return [...new Set((Array.isArray(values)?values:[]).map(cleanText).filter(Boolean))];
}

function compactTitleHint(value='', topicTitle='') {
  const topic=cleanText(topicTitle);
  let text=cleanText(value)
    .replace(/^\s*[\[【](?:속보|단독|종합|영상|포토|전문|인터뷰)[^\]】]*[\]】]\s*/i,' ')
    .replace(/^(?:기자수첩|사설|칼럼|취재수첩|인터뷰)\s*/,' ')
    .replace(/\s+[-–—|｜]\s+[^-–—|｜]{2,30}$/,' ')
    .replace(/[“”"'‘’()[\]{}<>]/g,' ')
    .replace(/…+|\.{2,}/g,' ')
    .replace(/\s+/g,' ')
    .trim();
  if(!text)return '';
  const topicTokens=new Set(topic.toLowerCase().split(/\s+/).filter(Boolean));
  const tokens=(text.match(/[0-9A-Za-z가-힣+._%-]{2,}/g)||[])
    .filter(token=>!QUERY_STOP_WORDS.has(token.toLowerCase()))
    .filter(token=>!topicTokens.has(token.toLowerCase()));
  const eventTokens=tokens.filter(token=>/(?:승인|출시|도입|개편|변경|인상|인하|급등|급락|상승|하락|합의|결정|발표|공개|시행|선거|개표|충돌|사고|수사|판결|복귀|출연|경기|승리|패배|실적|투자|매각|인수|합병|지원|규제|정책|서비스|요금|일정|예매|신청|판매)$/.test(token));
  const seed=(eventTokens.length
    ? tokens.slice(Math.max(0,tokens.indexOf(eventTokens[0])-3),tokens.indexOf(eventTokens[0])+2)
    : tokens.slice(0,7))
    .filter(Boolean)
    .slice(0,7);
  if(!seed.length)return '';
  return cleanText(`${topic} ${seed.join(' ')}`).slice(0,90);
}

export function buildResearchEventQueries(topicTitle='', sourceTitleHints=[], researchTopicHint='', limit=5) {
  const topic=cleanText(topicTitle);
  const rows=[];
  const push=value=>{const text=cleanText(value);if(text&&!rows.includes(text))rows.push(text);};
  for(const title of unique(sourceTitleHints))push(compactTitleHint(title,topic));
  if(researchTopicHint)push(cleanText(`${topic} ${researchTopicHint}`).slice(0,90));
  return rows.filter(row=>row&&row!==topic).slice(0,Math.max(1,Number(limit||5)));
}

export function mergeEvidenceItems(primary=[], secondary=[], limit=24) {
  const map=new Map();
  for(const row of [...(Array.isArray(primary)?primary:[]),...(Array.isArray(secondary)?secondary:[])]){
    if(!row)continue;
    const url=canonicalizeUrl(row?.canonicalUrl||row?.link||row?.url||'');
    const key=url||normalized(`${row?.source||row?.domain||''}|${row?.title||''}`);
    if(!key)continue;
    const candidate={...row,link:url||row?.link||row?.url||'',canonicalUrl:url||row?.canonicalUrl||row?.link||row?.url||''};
    const existing=map.get(key);
    if(!existing){map.set(key,candidate);continue;}
    const existingLength=cleanText(existing?.description||existing?.summary||'').length;
    const candidateLength=cleanText(candidate?.description||candidate?.summary||'').length;
    map.set(key,candidateLength>existingLength?{...existing,...candidate}:{...candidate,...existing});
  }
  return [...map.values()].slice(0,Math.max(1,Number(limit||24)));
}

export function mergeResearchLedgers(primary={}, secondary={}, topicTitle='') {
  const ledgers=[primary||{},secondary||{}];
  const sources=[];
  const sourceKeyToId=new Map();
  const sourceIdMaps=[];

  for(const ledger of ledgers){
    const idMap=new Map();
    for(const source of Array.isArray(ledger?.sources)?ledger.sources:[]){
      const url=canonicalizeUrl(source?.url||source?.link||source?.canonicalUrl||'');
      const key=url||normalized(`${source?.domain||''}|${source?.title||source?.source||''}`);
      if(!key)continue;
      let newId=sourceKeyToId.get(key);
      if(!newId){
        newId=`S${sources.length+1}`;
        sourceKeyToId.set(key,newId);
        sources.push({...source,id:newId,url:url||source?.url||source?.link||'',link:url||source?.link||source?.url||'',canonicalUrl:url||source?.canonicalUrl||source?.url||source?.link||''});
      }
      if(source?.id)idMap.set(String(source.id),newId);
    }
    sourceIdMaps.push(idMap);
  }

  const facts=[];
  const factMaps=[];
  const findExisting=text=>{
    const key=normalized(text);
    if(!key)return null;
    return facts.find(row=>{
      const other=normalized(row.text||row.claim||'');
      return key===other||(Math.min(key.length,other.length)>=24&&(key.includes(other)||other.includes(key)));
    })||null;
  };

  ledgers.forEach((ledger,ledgerIndex)=>{
    const factMap=new Map();
    for(const fact of Array.isArray(ledger?.facts)?ledger.facts:[]){
      const text=cleanText(fact?.text||fact?.claim||'');
      if(!text)continue;
      const mappedSources=(Array.isArray(fact?.sourceIds)?fact.sourceIds:[])
        .map(id=>sourceIdMaps[ledgerIndex].get(String(id)))
        .filter(Boolean);
      let existing=findExisting(text);
      if(!existing){
        existing={...fact,id:`F${facts.length+1}`,text,sourceIds:[...new Set(mappedSources)]};
        facts.push(existing);
      }else{
        existing.sourceIds=[...new Set([...(existing.sourceIds||[]),...mappedSources])];
        if(text.length>cleanText(existing.text||'').length)existing.text=text;
        existing.values=[...new Map([...(existing.values||[]),...(fact.values||[])].map(value=>[JSON.stringify(value),value])).values()].slice(0,12);
        existing.confidence=Math.max(Number(existing.confidence||0),Number(fact.confidence||0));
      }
      if(fact?.id)factMap.set(String(fact.id),existing.id);
    }
    factMaps.push(factMap);
  });

  const sourceMap=new Map(sources.map(source=>[String(source.id),source]));
  for(const fact of facts){
    const linked=(fact.sourceIds||[]).map(id=>sourceMap.get(String(id))).filter(Boolean);
    const domains=new Set(linked.map(row=>String(row?.domain||'').toLowerCase()).filter(Boolean));
    const types=new Set([String(fact?.sourceType||''),...linked.map(row=>String(row?.sourceType||''))].filter(Boolean));
    const official=types.has('official')||types.has('authorized');
    fact.status=official||domains.size>=2?'confirmed':String(fact.status||'single_source');
    fact.verificationLevel=official?'official':domains.size>=2?'multi_source':types.has('trusted_news')?'trusted_single':'single_source';
    fact.sourceDomains=[...domains];
  }

  const conflicts=[];
  ledgers.forEach((ledger,ledgerIndex)=>{
    for(const conflict of Array.isArray(ledger?.conflicts)?ledger.conflicts:[]){
      const factIds=[...new Set((Array.isArray(conflict?.factIds)?conflict.factIds:[]).map(id=>factMaps[ledgerIndex].get(String(id))).filter(Boolean))];
      if(factIds.length>1)conflicts.push({...conflict,factIds});
    }
  });

  return {
    version:Math.max(4,...ledgers.map(row=>Number(row?.version||0))),
    topicTitle:cleanText(topicTitle||primary?.topicTitle||secondary?.topicTitle||''),
    sources,
    facts,
    confirmedFacts:facts.filter(fact=>fact.status==='confirmed').map(fact=>fact.id),
    uncertainties:unique(ledgers.flatMap(row=>Array.isArray(row?.uncertainties)?row.uncertainties:[])),
    conflicts,
    mergedResearchAttempts:ledgers.filter(row=>Array.isArray(row?.facts)&&row.facts.length).length,
  };
}
