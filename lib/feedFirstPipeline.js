import { sanitizePublicText } from './publicCopy.js';
import { accurateFacts, isGenericFactText } from './contentAccuracy.js';

function clean(value='') {
  return sanitizePublicText(String(value||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim());
}

function paragraphText(value='') {
  return typeof value==='string'?value:(value?.text||'');
}

function sentences(value='') {
  return clean(paragraphText(value)).split(/(?<=[.!?다요])\s+/).map(clean).filter(Boolean);
}

function trimSentence(value='', max=160) {
  const text=clean(value);
  if(text.length<=max)return text;
  const rows=sentences(text);let out='';
  for(const row of rows){const next=`${out} ${row}`.trim();if(next.length>max)break;out=next;}
  return (out||text).slice(0,max).trim();
}

export function parseFeedSections(blog='') {
  const result=[];let current={heading:'',paragraphs:[]};
  for(const raw of String(blog||'').split('\n')){
    const line=clean(raw.replace(/^[-*]\s+/,''));
    if(!line)continue;
    if(line.startsWith('## ')){
      if(current.heading||current.paragraphs.length)result.push(current);
      current={heading:clean(line.replace(/^##\s+/,'')),paragraphs:[]};
    }else current.paragraphs.push(line);
  }
  if(current.heading||current.paragraphs.length)result.push(current);
  return result;
}


function topicParticle(value='') {
  const text=clean(value);
  const ch=text.charCodeAt(text.length-1);
  if(ch>=0xAC00&&ch<=0xD7A3)return ((ch-0xAC00)%28)?'은':'는';
  return '는';
}

function inferEntityLabel(profileText='', keyword='') {
  const text=clean(`${profileText} ${keyword}`);
  const labels=['가수','배우','방송인','코미디언','선수','감독','작가','기업','회사','브랜드','제품','스마트폰','자동차','드라마','영화','작품','프로그램','게임','서비스','정책','지역','장소'];
  for(const label of labels){
    if(new RegExp(`${label}(?:입니다|이다|로|으로|을|를|의|\\s|[.,])`).test(text))return label;
  }
  if(/시즌|드라마|영화|웹툰|앨범|콘서트|공연/.test(text))return '작품';
  if(/갤럭시|아이폰|스마트폰|자동차|모델|제품/.test(text))return '제품';
  if(/주식회사|그룹|전자|은행|플랫폼/.test(text))return '기업';
  return '주제';
}

function compactPoint(value='', max=80) {
  let text=trimSentence(value,max+18)
    .replace(/^이번 이슈의 핵심은\s*/,'')
    .replace(/(?:함께\s*)?확인할 수 있습니다[.!?]*$/,'확인 가능')
    .replace(/구체화됐다는 점입니다[.!?]*$/,'구체화')
    .replace(/(?:했습니다|하였습니다|됐습니다|되었습니다|입니다|있습니다|합니다|예정입니다|확인됐습니다)[.!?]*$/,'')
    .replace(/[.!?]+$/,'')
    .trim();
  if(text.length>max)text=text.slice(0,max).trim();
  return text;
}

function safeHeading(value='', fallback='') {
  const heading=clean(value).replace(/최근\s*36\s*시간|36\s*시간\s*(?:이내|내|동안)?/gi,'').replace(/\s+/g,' ').trim();
  if(!heading||heading.length<4||heading.length>32)return fallback;
  if(/^(?:키워드\s*기본정보|기본\s*정보|이슈\s*사항|최근\s*이슈사항|주요\s*동향)$/i.test(heading))return fallback;
  return heading;
}

export function naturalFeedHeading(kind, supplied='', {keyword='', eventTitle='', profileText=''}={}) {
  if(kind==='basic'){
    const key=clean(keyword).slice(0,24);
    const label=inferEntityLabel(profileText,key);
    return safeHeading(supplied,`${key}${topicParticle(key)} 어떤 ${label}인가`.trim());
  }
  if(kind==='issues'){
    const event=clean(eventTitle).slice(0,18);
    return safeHeading(supplied,event||'현재 확인된 주요 내용');
  }
  if(kind==='context')return safeHeading(supplied,'핵심 맥락과 확인 포인트');
  if(kind==='impact')return safeHeading(supplied,'이용자가 알아둘 점');
  if(kind==='insight')return 'STELLATE 인사이트';
  return safeHeading(supplied,'현재 확인된 내용');
}

function uniqueRows(rows=[]) {
  const out=[];const seen=new Set();
  for(const row of rows.map(clean).filter(Boolean)){
    const key=row.toLowerCase().replace(/[^0-9a-z가-힣]/g,'').slice(0,60);
    if(!key||seen.has(key))continue;seen.add(key);out.push(row);
  }
  return out;
}

export function buildFeedSummaryCard({keyword='', feedTitle='', blog='', sections=[], factLedger={}}={}) {
  const parsed=Array.isArray(sections)&&sections.length?sections:parseFeedSections(blog);
  const intro=parsed.find(section=>!section.heading)?.paragraphs||[];
  const structured=parsed.filter(section=>section.heading);
  const basicSection=structured.find(section=>/어떤|무엇|기본|배경|알아보기/i.test(section.heading))||structured[0]||{};
  const issueSection=structured.find(section=>/지금|현재|이슈|변화|공개|확정|발표|일정|핵심/i.test(section.heading))||structured[1]||{};
  const contextSections=structured.filter(section=>section!==basicSection&&section!==issueSection&&!/STELLATE\s*인사이트/i.test(section.heading));
  const insightSection=structured.find(section=>/STELLATE\s*인사이트/i.test(section.heading))||{};

  const basicSentences=uniqueRows((basicSection.paragraphs||[]).flatMap(sentences)).filter(row=>!isGenericFactText(row));
  const issueSentences=uniqueRows((issueSection.paragraphs||[]).flatMap(sentences)).filter(row=>!isGenericFactText(row));
  const contextSentences=uniqueRows(contextSections.flatMap(section=>(section.paragraphs||[]).flatMap(sentences))).filter(row=>!isGenericFactText(row));
  const insightSentences=uniqueRows((insightSection.paragraphs||[]).flatMap(sentences)).filter(row=>!isGenericFactText(row));
  const ledgerFacts=accurateFacts(factLedger,{scope:'issue',limit:8,allowSingleTrusted:true}).map(row=>clean(row.text||row.claim)).filter(Boolean);
  const profileLedgerFacts=accurateFacts(factLedger,{scope:'profile',limit:4,allowSingleTrusted:true}).map(row=>clean(row.text||row.claim)).filter(Boolean);

  const eventRows=uniqueRows([...issueSentences,...ledgerFacts,...contextSentences]).slice(0,3);
  const backgroundRows=uniqueRows([...contextSentences,...basicSentences,...profileLedgerFacts,...insightSentences])
    .filter(row=>!eventRows.some(event=>clean(event)===clean(row)))
    .slice(0,3);
  const summaryRows=eventRows.length?eventRows:uniqueRows([...intro,...basicSentences,...profileLedgerFacts]).slice(0,2);
  const summary=trimSentence(summaryRows.slice(0,2).join(' '),260);
  const why=trimSentence(backgroundRows.slice(0,2).join(' '),260);

  const pointCandidates=uniqueRows([
    ...eventRows,
    ...contextSentences,
    ...ledgerFacts,
    ...insightSentences,
    ...basicSentences,
  ]).map(row=>compactPoint(row,92)).filter(Boolean);
  const points=uniqueRows(pointCandidates).slice(0,5);
  for(const fallback of [summary,why,...profileLedgerFacts]){
    if(points.length>=3)break;
    const point=compactPoint(fallback,92);
    if(point&&!points.includes(point))points.push(point);
  }

  const lead=summary||trimSentence(basicSentences[0]||profileLedgerFacts[0]||'',220);
  const context=why||trimSentence(insightSentences[0]||contextSentences[0]||'',220);
  return {
    previewLabel:'요약 정보',
    infoLine:`${clean(keyword)}에 대한 정보`,
    summaryLabel:'요약 정보',
    pointsLabel:'주요 내용',
    ctaLabel:'상세 정보 피드 보기',
    feedTitle:clean(feedTitle),
    detailTitle:clean(feedTitle),
    lead,
    context,
    summary:lead,
    why:context,
    summaryParagraphs:[lead,context].filter(Boolean),
    listSummary:trimSentence([lead,context].filter(Boolean).join(' '),100),
    points:points.slice(0,5),
    source:'feed_summary_v5_editorial',
    accuracyMode:'fact_ledger_and_validated_feed_only',
  };
}

export function feedHeadlineFromTitle(keyword='', title='', fallback='관련 관심 증가') {
  const key=clean(keyword);let value=clean(title);
  if(key){
    const escaped=key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    value=value.replace(new RegExp(`^${escaped}\\s*[·*＊|｜:,-]?\\s*`,'i'),'').trim();
  }
  return (value||clean(fallback)).replace(/[.!?]+$/,'').slice(0,24).trim();
}

export function fullFeedTitle(keyword='', headline='') {
  const key=clean(keyword);const event=feedHeadlineFromTitle(key,headline,'관련 관심 증가');
  return key&&event?`${key} · ${event}`:(key||event);
}
