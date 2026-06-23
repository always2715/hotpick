import { cleanText, canonicalizeUrl } from './contentPolicy.js';

const GENERIC_FACT_PATTERNS = [
  /^해당 주제 관련 /,
  /관련 (?:확인 사실|발표|결정|사건 발생|일정|수치 변화|공개 입장|정정|상태 변화)이 확인됐습니다/,
  /(?:수치 변화|상태 변화|현재 상황|공식 발표|관련 소식|확인된 사실)(?:가|이)? 확인됐습니다/,
  /관심이 (?:늘고|증가하고|집중되고)/,
  /구체적인 상승 배경은 아직/,
];

const UNSUPPORTED_INFERENCE = /(?:때문에|따라서|영향을 미칠|영향이 예상|전망(?:입니다|됩니다|된다)|가능성이 (?:있습니다|있다)|것으로 보입니다|주목할 필요|관심이 커졌|긍정적|부정적|호재|악재)/;

function normalized(value='') {
  return cleanText(value).toLowerCase().replace(/[^0-9a-z가-힣]/g,'');
}

function tokens(value='') {
  return new Set((cleanText(value).toLowerCase().match(/[0-9a-z가-힣]{2,}/g)||[])
    .filter(token=>!['관련','대한','이번','해당','통해','위해','현재','사실','내용','확인','정리','입니다','했습니다','됩니다'].includes(token)));
}

function numericTokens(value='') {
  return (String(value||'').match(/(?:20\d{2}[.-]\d{1,2}[.-]\d{1,2}|\d+(?:[.,]\d+)?\s*(?:%p|퍼센트포인트|%|조원|억원|만원|원|만명|천명|명|건|회|배|개|일|개월|년|시|분)?)/g)||[])
    .map(row=>row.replace(/\s+/g,'').replace(/,/g,'')).filter(Boolean);
}

export function isGenericFactText(value='') {
  const text=cleanText(value);
  if(!text||text.length<12)return true;
  return GENERIC_FACT_PATTERNS.some(pattern=>pattern.test(text));
}

function sourceMap(ledger={}) {
  return new Map((Array.isArray(ledger.sources)?ledger.sources:[]).map(source=>[String(source.id||''),source]));
}

function factSourceDomains(fact={},ledger={}) {
  const map=sourceMap(ledger);
  return [...new Set((Array.isArray(fact.sourceIds)?fact.sourceIds:[])
    .map(id=>map.get(String(id)))
    .map(source=>String(source?.domain||'').trim().toLowerCase())
    .filter(Boolean))];
}

function factSourceTypes(fact={},ledger={}) {
  const map=sourceMap(ledger);
  return [...new Set([
    String(fact.sourceType||''),
    ...(Array.isArray(fact.sourceIds)?fact.sourceIds:[]).map(id=>String(map.get(String(id))?.sourceType||'')),
  ].filter(Boolean))];
}

function factPriority(fact={},ledger={}) {
  const domains=factSourceDomains(fact,ledger).length;
  const types=factSourceTypes(fact,ledger);
  const type=types.includes('official')?'official':types.includes('authorized')?'authorized':types.includes('trusted_news')?'trusted_news':types[0]||'';
  const confirmed=fact.status==='confirmed';
  return (confirmed?100:0)+(type==='official'?50:type==='authorized'?42:type==='trusted_news'?30:15)+(domains*12)+Math.round(Number(fact.confidence||0)*10);
}


export function sanitizeFactLedgerForPublication(ledger={}) {
  const facts=Array.isArray(ledger?.facts)?ledger.facts:[];
  const removedIds=new Set(facts
    .filter(fact=>isGenericFactText(fact?.text||fact?.claim||''))
    .map(fact=>String(fact?.id||''))
    .filter(Boolean));
  const concreteFacts=facts.filter(fact=>!isGenericFactText(fact?.text||fact?.claim||''));
  const confirmedFacts=(Array.isArray(ledger?.confirmedFacts)?ledger.confirmedFacts:[])
    .filter(fact=>!isGenericFactText(fact?.text||fact?.claim||''))
    .filter(fact=>!removedIds.has(String(fact?.id||'')));
  const conflicts=(Array.isArray(ledger?.conflicts)?ledger.conflicts:[])
    .map(conflict=>({...conflict,factIds:(Array.isArray(conflict?.factIds)?conflict.factIds:[]).filter(id=>!removedIds.has(String(id))) }))
    .filter(conflict=>(conflict.factIds||[]).length>1);
  return {
    ...ledger,
    facts:concreteFacts,
    confirmedFacts,
    conflicts,
    genericFactsRemoved:removedIds.size,
  };
}

export function accurateFacts(ledger={}, {scope='all',limit=12,allowSingleTrusted=true}={}) {
  const conflicts=new Set((Array.isArray(ledger.conflicts)?ledger.conflicts:[]).flatMap(row=>row?.factIds||[]));
  const rows=(Array.isArray(ledger.facts)?ledger.facts:[])
    .filter(fact=>fact?.id&&cleanText(fact.text||fact.claim))
    .filter(fact=>scope==='all'||(scope==='profile'?String(fact.scope||'issue')==='profile':String(fact.scope||'issue')!=='profile'))
    .filter(fact=>!conflicts.has(fact.id))
    .filter(fact=>!isGenericFactText(fact.text||fact.claim))
    .filter(fact=>{
      const domains=factSourceDomains(fact,ledger).length;
      const sourceTypes=factSourceTypes(fact,ledger);
      if(fact.status==='confirmed'||sourceTypes.some(type=>['official','authorized'].includes(type))||domains>=2)return true;
      return allowSingleTrusted&&sourceTypes.some(type=>['trusted_news','independent'].includes(type))&&domains>=1;
    })
    .sort((a,b)=>factPriority(b,ledger)-factPriority(a,ledger));
  const out=[];
  for(const row of rows){
    const key=normalized(row.text||row.claim);
    if(!key||out.some(existing=>{
      const other=normalized(existing.text||existing.claim);
      return key===other||(Math.min(key.length,other.length)>=18&&(key.includes(other)||other.includes(key)));
    }))continue;
    out.push(row);
    if(out.length>=limit)break;
  }
  return out;
}

export function ledgerAccuracyReport(ledger={}) {
  const facts=accurateFacts(ledger,{scope:'all',limit:50,allowSingleTrusted:true});
  const issueFacts=accurateFacts(ledger,{scope:'issue',limit:50,allowSingleTrusted:true});
  const profileFacts=accurateFacts(ledger,{scope:'profile',limit:50,allowSingleTrusted:true});
  const sources=(Array.isArray(ledger.sources)?ledger.sources:[]).filter(source=>canonicalizeUrl(source?.url||source?.link||''));
  return {
    passed:facts.length>0&&sources.length>0,
    factCount:facts.length,
    issueFactCount:issueFacts.length,
    profileFactCount:profileFacts.length,
    sourceCount:sources.length,
    reasons:[...(facts.length?[]:['구체적인 확인 사실이 없습니다.']),...(sources.length?[]:['연결된 출처 URL이 없습니다.'])],
  };
}

function linkedFactTexts(claimIds=[],factMap=new Map()) {
  return (Array.isArray(claimIds)?claimIds:[]).map(id=>factMap.get(String(id))).filter(Boolean).map(fact=>cleanText(fact.text||fact.claim));
}

function semanticSupported(text='',factTexts=[]) {
  const left=tokens(text);
  if(!left.size||!factTexts.length)return false;
  return factTexts.some(factText=>{
    const right=tokens(factText);
    let common=0;
    left.forEach(token=>{if(right.has(token)||[...right].some(value=>value.includes(token)||token.includes(value)))common+=1;});
    const required=Math.max(1,Math.min(4,Math.ceil(left.size*0.28)));
    return common>=required;
  });
}

function numericSupported(text='',factTexts=[]) {
  const output=numericTokens(text);
  if(!output.length)return true;
  const allowed=new Set(factTexts.flatMap(numericTokens));
  return output.every(value=>allowed.has(value));
}

export function validateGeneratedPackageAccuracy(pkg={},ledger={}) {
  const facts=accurateFacts(ledger,{scope:'all',limit:50,allowSingleTrusted:true});
  const factMap=new Map(facts.map(fact=>[String(fact.id),fact]));
  const rows=[];
  for(const section of Array.isArray(pkg.sections)?pkg.sections:[]){
    for(const paragraph of Array.isArray(section?.paragraphs)?section.paragraphs:[]){
      rows.push({kind:'body',text:cleanText(paragraph?.text||paragraph),claimIds:paragraph?.claimIds||[]});
    }
  }
  if(pkg.intro)rows.push({kind:'intro',text:cleanText(pkg.intro?.text||pkg.intro),claimIds:pkg.intro?.claimIds||[]});
  for(const row of Array.isArray(pkg.qa)?pkg.qa:[])rows.push({kind:'qa',text:cleanText(row?.a),claimIds:row?.claimIds||[]});
  for(const row of Array.isArray(pkg.instagramCards)?pkg.instagramCards:[])rows.push({kind:'instagram',text:cleanText(row?.body),claimIds:row?.claimIds||[]});
  const checked=rows.filter(row=>row.text.length>=12);
  const problems=[];
  for(const row of checked){
    const linked=linkedFactTexts(row.claimIds,factMap);
    if(!linked.length){problems.push(`${row.kind}:유효한 Fact ID 없음`);continue;}
    if(!semanticSupported(row.text,linked))problems.push(`${row.kind}:연결 사실과 의미 불일치`);
    if(!numericSupported(row.text,linked))problems.push(`${row.kind}:근거에 없는 수치·날짜`);
    if(UNSUPPORTED_INFERENCE.test(row.text)&&!linked.some(text=>UNSUPPORTED_INFERENCE.test(text)))problems.push(`${row.kind}:근거 없는 해석·전망`);
  }
  return {
    passed:checked.length>0&&problems.length===0,
    checked:checked.length,
    problems:[...new Set(problems)].slice(0,12),
  };
}

export function sourceLabelForFact(fact={},ledger={}) {
  const map=sourceMap(ledger);
  const rows=(Array.isArray(fact.sourceIds)?fact.sourceIds:[]).map(id=>map.get(String(id))).filter(Boolean);
  return cleanText(rows[0]?.source||rows[0]?.publisher||rows[0]?.domain||'확인 자료');
}
