import { cleanText } from './contentPolicy.js';
import { derivePostResearchTitle } from './editorialTitle.js';
import { sanitizePublicText } from './publicCopy.js';
import { accurateFacts, sourceLabelForFact } from './contentAccuracy.js';

function hasFinalConsonant(value='') {
  const text=String(value||'').trim();
  const code=text.charCodeAt(text.length-1);
  return code>=0xac00&&code<=0xd7a3 ? (code-0xac00)%28!==0 : false;
}
function particle(value,withFinal,withoutFinal){return hasFinalConsonant(value)?withFinal:withoutFinal;}

function normalizedFact(value='') {
  return cleanText(value).toLowerCase().replace(/[^0-9a-z가-힣]/g,'');
}
function factSimilarity(a='',b='') {
  const left=normalizedFact(a),right=normalizedFact(b);
  if(!left||!right)return 0;
  if(left===right)return 1;
  const shorter=left.length<=right.length?left:right;
  const longer=left.length>right.length?left:right;
  if(shorter.length>=12&&longer.includes(shorter))return shorter.length/longer.length;
  const tokens=value=>new Set(cleanText(value).toLowerCase().match(/[가-힣a-z0-9]{2,}/g)||[]);
  const l=tokens(a),r=tokens(b);if(!l.size||!r.size)return 0;
  let common=0;l.forEach(token=>{if(r.has(token))common+=1;});
  return common/Math.max(1,l.size+r.size-common);
}
function distinctFacts(rows=[],limit=8) {
  const selected=[];
  const sorted=[...rows].sort((a,b)=>{
    const aSentence=/[다요]\.?$|습니다\.?$/.test(cleanText(a?.text||''))?1:0;
    const bSentence=/[다요]\.?$|습니다\.?$/.test(cleanText(b?.text||''))?1:0;
    if(aSentence!==bSentence)return bSentence-aSentence;
    const aConfirmed=a?.status==='confirmed'?1:0,bConfirmed=b?.status==='confirmed'?1:0;
    if(aConfirmed!==bConfirmed)return bConfirmed-aConfirmed;
    return cleanText(b?.text||'').length-cleanText(a?.text||'').length;
  });
  for(const row of sorted){
    if(selected.some(existing=>factSimilarity(existing.text,row.text)>=0.72))continue;
    selected.push(row);if(selected.length>=limit)break;
  }
  return selected;
}

function politeFactSentence(fact={}, topicTitle='', shortTitle='') {
  let text=cleanText(fact.text||'')
    .replace(/[“”"'‘’]/g,'')
    .replace(/\s+/g,' ')
    .trim();
  if(!text) return `${topicTitle}의 ${shortTitle||'핵심 내용'}가 확인됐습니다.`;
  text=text
    .replace(/하였다\.?$/,'했습니다.')
    .replace(/했다\.?$/,'했습니다.')
    .replace(/밝혔다\.?$/,'밝혔습니다.')
    .replace(/발표했다\.?$/,'발표했습니다.')
    .replace(/공개했다\.?$/,'공개했습니다.')
    .replace(/확정했다\.?$/,'확정했습니다.')
    .replace(/결정했다\.?$/,'결정했습니다.')
    .replace(/발생했다\.?$/,'발생했습니다.')
    .replace(/복구됐다\.?$/,'복구됐습니다.')
    .replace(/중단됐다\.?$/,'중단됐습니다.')
    .replace(/공개되지 않았다\.?$/,'공개되지 않았습니다.')
    .replace(/공개하지 않았다\.?$/,'공개하지 않았습니다.')
    .replace(/예정이다\.?$/,'예정입니다.')
    .replace(/계획이다\.?$/,'계획입니다.')
    .replace(/시작된다\.?$/,'시작됩니다.')
    .replace(/진행된다\.?$/,'진행됩니다.')
    .replace(/적용된다\.?$/,'적용됩니다.')
    .replace(/변경된다\.?$/,'변경됩니다.')
    .replace(/확정된다\.?$/,'확정됩니다.')
    .replace(/공개된다\.?$/,'공개됩니다.')
    .replace(/출시된다\.?$/,'출시됩니다.')
    .replace(/예정됐다\.?$/,'예정됐습니다.')
    .replace(/계획됐다\.?$/,'계획됐습니다.')
    .replace(/있다\.?$/,'있습니다.')
    .replace(/없다\.?$/,'없습니다.')
    .replace(/(가수|배우|방송인|선수|감독|기업|회사|브랜드|제품|서비스|프로그램|그룹|팀|기관|도시|지역)다\.?$/,'$1입니다.')
    .replace(/이다\.?$/,'입니다.');
  if(!/[.!?]$/.test(text)){
    if(/(?:발표|공개|확정|결정|출시|개최|변경|시행|복귀|합류|출연|방송|수상|오픈|판매|제공|예정|계획)$/.test(text)) text+=' 관련 내용이 확인됐습니다.';
    else text+='.';
  }
  return text.slice(0,220);
}

function inferEntityRole(topicTitle='',rows=[]) {
  const joined=rows.map(row=>cleanText(row?.text||'')).join(' ');
  const escaped=String(topicTitle||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const before=joined.match(new RegExp(`(가수|배우|방송인|선수|감독|기업|회사|브랜드|제품|서비스|프로그램|그룹|팀|기관|도시|지역)\\s*${escaped}`));
  if(before?.[1])return before[1];
  const after=joined.match(new RegExp(`${escaped}[^.]{0,30}(가수|배우|방송인|선수|감독|기업|회사|브랜드|제품|서비스|프로그램|그룹|팀|기관|도시|지역)`));
  return after?.[1]||'';
}

function naturalBasicHeading(topicTitle='',role='') {
  const topicParticle=particle(topicTitle,'은','는');
  if(['가수','배우','방송인','선수','감독'].includes(role))return `${topicTitle}${topicParticle} 어떤 ${role}인가`;
  if(['제품','서비스','프로그램','브랜드'].includes(role))return `${topicTitle}${topicParticle} 무엇인가`;
  if(['기업','회사','기관'].includes(role))return `${topicTitle}${topicParticle} 어떤 곳인가`;
  if(['그룹','팀'].includes(role))return `${topicTitle}${topicParticle} 어떤 팀인가`;
  if(['도시','지역'].includes(role))return `${topicTitle}${topicParticle} 어떤 지역인가`;
  return `${topicTitle}${topicParticle} 무엇인가`;
}

function editorialContextHeading(rows=[]) {
  const joined=rows.map(row=>cleanText(row?.editorialText||row?.text||'')).join(' ');
  if(/예매|예약|신청|접수|판매|출시|공개|방송|경기|공연|행사|일정|예정|계획|\d{1,2}월|\d{1,2}일/.test(joined))return '일정과 이용자가 확인할 내용';
  if(/\d|원|명|건|회|%|퍼센트|포인트|위|배/.test(joined))return '수치로 보는 핵심 내용';
  if(/변경|적용|대상|영향|혜택|제한|조건|기준/.test(joined))return '달라지는 점과 확인 기준';
  return '사건을 이해하는 핵심 맥락';
}

function qaQuestion(topicTitle='',role='',index=0) {
  const subjectParticle=particle(topicTitle,'과','와');
  if(index===0&&role)return `${topicTitle}${particle(topicTitle,'은','는')} 어떤 ${role}인가요?`;
  if(index===0)return `${topicTitle}${particle(topicTitle,'은','는')} 어떤 대상인가요?`;
  if(index===1)return `${topicTitle}${subjectParticle} 관련해 지금 확인된 핵심은 무엇인가요?`;
  return '일정이나 이용 조건 중 확인할 내용은 무엇인가요?';
}


function renderPackage(pkg={}) {
  const chunks=[]; const claimMap=[];
  for(const section of pkg.sections||[]){
    if(!section?.heading)continue;
    chunks.push(`## ${cleanText(section.heading)}`);
    for(const paragraph of section.paragraphs||[]){
      const text=cleanText(paragraph?.text||paragraph);
      if(!text)continue;
      chunks.push(text); claimMap.push({text,claimIds:paragraph?.claimIds||[]});
    }
  }
  return {blog:chunks.join('\n\n').trim(),claimMap};
}

export function buildVerifiedFallback(topicTitle, ledger={}, sourceWindowHours=36, contentTier='standard') {
  const profileFacts=distinctFacts(accurateFacts(ledger,{scope:'profile',limit:10,allowSingleTrusted:true}),10);
  const issueFacts=distinctFacts(accurateFacts(ledger,{scope:'issue',limit:14,allowSingleTrusted:true}),14);
  const identityOnly=issueFacts.length===0&&profileFacts.length>0;
  const selectedFacts=identityOnly?profileFacts:issueFacts;
  if(!selectedFacts.length){
    return {
      visualQuery:'',shortTitle:'확인 자료 부족',feedTitle:topicTitle,detailTitle:topicTitle,
      summary:'',why:'',points:[],intro:null,sections:[],qa:[],instagramCards:[],uncertainties:['공개 문안을 만들 수 있는 구체적인 확인 사실이 없습니다.'],
      blog:'',claimMap:[],topKeyword:topicTitle,topTopic:'',topTitle:topicTitle,displayTitle:topicTitle,
      titleStatus:'not_ready',titleReady:false,titleSource:'accuracy_gate',titleValidationReasons:['구체적인 확인 사실 부족'],keywordSource:'fixed_top20_keyword',
      aiStatus:'verified_fallback_rejected',aiError:'NO_ACCURATE_FACTS',contentTier,
    };
  }

  const role=inferEntityRole(topicTitle,[...profileFacts,...issueFacts]);
  const identityTitle=(()=>{
    if(['가수','배우','방송인','선수','감독'].includes(role))return `${role} 활동과 주요 정보`;
    if(['제품','서비스','프로그램','브랜드'].includes(role))return '주요 특징과 기본정보';
    if(['기업','회사','기관'].includes(role))return '사업과 주요 정보';
    if(['그룹','팀'].includes(role))return '활동과 주요 정보';
    if(['도시','지역'].includes(role))return '지역 특징과 주요 정보';
    return '확인된 기본정보';
  })();

  const exactFactSentence=fact=>sanitizePublicText(politeFactSentence(fact,topicTitle,'')).slice(0,260);

  const topicFromFacts=()=>{
    const titleLedger={...ledger,facts:selectedFacts};
    const derived=derivePostResearchTitle(topicTitle,{},titleLedger,[]);
    if(derived?.titleReady===true&&String(derived?.topTopic||derived?.shortTitle||'').trim().length>=4){
      return {derived,shortTitle:String(derived.topTopic||derived.shortTitle).slice(0,18)};
    }
    const stop=new Set([
      topicTitle,'관련','대한','해당','이번','현재','최근','사실','내용','정보','국회','정부','기관','회사','의원','대표','위원','후보','선수','감독','배우','가수','씨','측','입장','말','설명',
      '밝혔습니다','밝혔다','말했습니다','말했다','했습니다','했다','됩니다','됐다','있습니다','있다','공개했습니다','발표했습니다','발표했다','주장했습니다','주장했다',
    ]);
    const strip=value=>String(value||'')
      .replace(/["'“”‘’()[\]{}]/g,'')
      .replace(/(?:은|는|이|가|을|를|의|에|에서|에게|으로|로|와|과|도|만|까지|부터|께서|라고|이라는|인)$/,'')
      .trim();
    const first=cleanText(selectedFacts[0]?.text||selectedFacts[0]?.claim||'')
      .replace(new RegExp(String(topicTitle||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'),' ');
    const tokens=(first.match(/[0-9A-Za-z가-힣+._-]{2,}/g)||[])
      .map(strip)
      .filter(token=>token&&token.length>=2&&!/^\d+(?:[.,]\d+)?$/.test(token)&&!stop.has(token));
    const priority=tokens.filter(token=>/(?:정책|법안|입장|발언|선임|출마|발표|공개|출시|복귀|합류|수상|경기|승리|패배|결정|합의|판결|조사|징계|요청|제안|계획|활동|공연|방송|출연|개최|도입|손해배상)$/.test(token));
    const seed=(priority.length?tokens.slice(Math.max(0,tokens.indexOf(priority[0])-2),tokens.indexOf(priority[0])+1):tokens.slice(0,3))
      .filter(Boolean);
    let shortTitle=seed.join(' ').replace(/\s+/g,' ').trim();
    if(shortTitle.length>18)shortTitle=shortTitle.slice(0,18).trim();
    if(shortTitle.length<4)shortTitle=identityOnly?identityTitle:'주요 활동 정보';
    const safe={
      ...(derived||{}),topKeyword:topicTitle,topTopic:shortTitle,topTitle:`${topicTitle} · ${shortTitle}`,displayTitle:topicTitle,shortTitle,
      titleStatus:'ready',titleReady:true,titleSource:'literal_fact_projection',titleValidationReasons:[],keywordSource:'fixed_top20_keyword',
    };
    return {derived:safe,shortTitle};
  };

  const {derived,shortTitle:factShortTitle}=topicFromFacts();
  const shortTitle=identityOnly?identityTitle:factShortTitle;
  const editorialTitle=identityOnly?{
    ...derived,topKeyword:topicTitle,topTopic:shortTitle,topTitle:`${topicTitle} · ${shortTitle}`,displayTitle:topicTitle,shortTitle,
    titleStatus:'ready',titleReady:true,titleSource:'keyword_identity_fallback',titleValidationReasons:[],keywordSource:'fixed_top20_keyword',
  }:{...derived,topKeyword:topicTitle,topTopic:shortTitle,topTitle:`${topicTitle} · ${shortTitle}`,displayTitle:topicTitle,shortTitle,titleStatus:'ready',titleReady:true,titleSource:derived?.titleSource||'literal_fact_projection',titleValidationReasons:[],keywordSource:'fixed_top20_keyword'};

  const toEditorialRow=fact=>({...fact,editorialText:exactFactSentence(fact)});
  const profileRows=profileFacts.map(toEditorialRow).filter(row=>row.editorialText);
  const issueRows=issueFacts.map(toEditorialRow).filter(row=>row.editorialText);
  const keyRows=(identityOnly?profileRows:issueRows).slice(0,5);
  const topicParticle=particle(topicTitle,'은','는');

  const usedFactIds=new Set();
  const takeRows=(rows=[],count=2)=>{
    const selected=[];
    for(const row of rows){
      if(!row?.id||usedFactIds.has(row.id))continue;
      usedFactIds.add(row.id);selected.push(row);
      if(selected.length>=count)break;
    }
    return selected;
  };
  const sourceContextSentence=(row,index=0)=>{
    const sourceLabel=sourceLabelForFact(row,ledger);
    const scope=String(row?.scope||row?.type||'issue')==='profile'?'기본정보':'현재 이슈';
    const variants=[
      `${sourceLabel}의 공개 자료와 연결된 ${scope}입니다. 본문은 주체·행동·대상·조건을 이 자료에서 확인되는 범위로만 정리했으며, 자료에 없는 원인이나 전망은 덧붙이지 않았습니다. 세부 조건이 필요한 경우 같은 출처의 원문과 후속 공지를 함께 확인할 수 있습니다.`,
      `${sourceLabel}에서 확인할 수 있는 내용을 기준으로 정리했습니다. 다른 사건이나 동명이인 정보와 섞이지 않도록 주체와 대상을 구분했고, 공개 자료에 없는 평가나 결과는 확정하지 않았습니다. 세부 일정이나 적용 범위는 해당 출처의 최신 안내에서 다시 확인할 수 있습니다.`,
      `${sourceLabel} 자료에 나타난 행동·대상·조건을 중심으로 설명했습니다. 표현이 다른 자료가 있더라도 공통으로 확인되는 내용만 반영하고, 확인되지 않은 해석은 사실처럼 쓰지 않았습니다. 독자가 행동해야 하는 내용은 출처에 제시된 일정과 조건이 있을 때만 반영했습니다.`,
    ];
    return variants[index%variants.length];
  };
  const paragraphFromRows=(rows=[],sectionKind='context')=>{
    if(!rows.length)return null;
    const texts=[];
    rows.forEach((row,index)=>{
      if(row.editorialText)texts.push(row.editorialText);
      texts.push(sourceContextSentence(row,index+(sectionKind==='issue'?1:sectionKind==='checkpoint'?2:0)));
    });
    if(sectionKind==='profile')texts.push('기본정보는 현재 이슈와 섞지 않고 대상의 정체를 확인하는 데 필요한 범위로만 정리했습니다.');
    if(sectionKind==='issue')texts.push('현재 이슈는 공개 자료에서 확인되는 사건의 주체와 행동을 중심으로 정리하고, 별도 근거가 없는 배경 설명은 추가하지 않았습니다.');
    if(sectionKind==='context')texts.push('여러 확인 자료의 표현이 다를 수 있어 공통으로 확인되는 사실만 남겼으며, 본문에 없는 인과관계나 향후 결과를 새로 만들지 않았습니다.');
    if(sectionKind==='checkpoint')texts.push('독자가 확인할 내용은 공개된 일정·수치·조건처럼 근거가 있는 항목으로 제한했으며, 추가 발표가 없는 부분은 확정하지 않았습니다.');
    const joined=texts.join(' ').replace(/\s+/g,' ').trim();
    return {text:joined.slice(0,1200),claimIds:rows.map(row=>row.id).filter(Boolean)};
  };

  const identitySeed=(!profileRows.length&&role&&issueRows[0])
    ? [{...issueRows[0],editorialText:`${topicTitle}${topicParticle} ${role}입니다.`}]
    : [];
  const profileSectionRows=profileRows.length?takeRows(profileRows,3):identitySeed;
  const issueSectionRows=takeRows(issueRows,3);
  const contextSectionRows=takeRows([...issueRows,...profileRows],3);
  const checkpointRows=takeRows([...issueRows,...profileRows],2);
  const sections=[];
  if(profileSectionRows.length){
    sections.push({
      heading:naturalBasicHeading(topicTitle,role),
      paragraphs:[paragraphFromRows(profileSectionRows,'profile')].filter(Boolean),
    });
  }
  if(issueSectionRows.length){
    sections.push({
      heading:shortTitle,
      paragraphs:[paragraphFromRows(issueSectionRows,'issue')].filter(Boolean),
    });
  }
  if(contextSectionRows.length){
    sections.push({
      heading:editorialContextHeading(contextSectionRows),
      paragraphs:[paragraphFromRows(contextSectionRows,'context')].filter(Boolean),
    });
  }
  if(checkpointRows.length){
    const checkpointHeading=editorialContextHeading(checkpointRows);
    const uniqueHeading=sections.some(section=>section.heading===checkpointHeading)?'추가로 확인할 사실':checkpointHeading;
    sections.push({heading:uniqueHeading,paragraphs:[paragraphFromRows(checkpointRows,'checkpoint')].filter(Boolean)});
  }
  if(!sections.length){
    const emergencyRows=takeRows(keyRows,2);
    if(emergencyRows.length)sections.push({heading:`${topicTitle} 관련 확인 정보`,paragraphs:[paragraphFromRows(emergencyRows,'context')].filter(Boolean)});
  }

  const summarySource=(issueRows.length?issueRows:keyRows).slice(0,2);
  const contextSource=[...issueRows.slice(2),...profileRows].filter(row=>!summarySource.some(item=>item.id===row.id)).slice(0,2);
  const summary=summarySource.map(row=>row.editorialText).filter(Boolean).join(' ').slice(0,300);
  const why=contextSource.map(row=>row.editorialText).filter(Boolean).join(' ').slice(0,300);
  const pointRows=distinctFacts([...issueRows,...profileRows],5).map(row=>toEditorialRow(row));
  const pkg={
    visualQuery:'',shortTitle,feedTitle:editorialTitle.topTitle,detailTitle:editorialTitle.topTitle,
    summary,why,points:pointRows.slice(0,5).map(row=>row.editorialText.slice(0,140)),
    intro:summarySource[0]?{text:summarySource[0].editorialText,claimIds:[summarySource[0].id]}:null,
    sections,
    qa:(()=>{
      const rows=[];
      const first=profileRows[0]||issueRows[0];
      const second=issueRows.find(row=>row.id!==first?.id)||profileRows.find(row=>row.id!==first?.id);
      const third=[...issueRows,...profileRows].find(row=>row.id!==first?.id&&row.id!==second?.id&&/예매|예약|신청|접수|일정|예정|계획|출시|공개|방송|경기|공연|행사|\d{1,2}월|\d{1,2}일/.test(row.editorialText));
      for(const [index,row] of [first,second,third].filter(Boolean).entries())rows.push({q:qaQuestion(topicTitle,role,index),a:row.editorialText,claimIds:[row.id]});
      return rows.slice(0,3);
    })(),
    instagramCards:pointRows.slice(0,5).map((row,index)=>({type:index===0?'cover':index===1?'issue':'detail',headline:index===0?editorialTitle.topTitle:index===1?shortTitle:'확인된 핵심',body:row.editorialText.slice(0,170),claimIds:[row.id]})),
    uncertainties:Array.isArray(ledger.uncertainties)?ledger.uncertainties.slice(0,3):[],identityOnly,
    accuracyProjection:'fact_ledger_literal_v4_precise_editorial',
  };
  const rendered=renderPackage(pkg);
  return {
    ...pkg,...rendered,blog:sanitizePublicText(rendered.blog),summary:sanitizePublicText(summary),why:sanitizePublicText(why),
    points:pkg.points.map(sanitizePublicText),qa:pkg.qa.map(row=>({...row,q:sanitizePublicText(row.q),a:sanitizePublicText(row.a)})),
    instagramCards:pkg.instagramCards.map(row=>({...row,headline:sanitizePublicText(row.headline),body:sanitizePublicText(row.body)})),
    ...editorialTitle,aiStatus:identityOnly?'verified_identity_fallback':'verified_fallback',aiError:null,contentTier,
  };
}

