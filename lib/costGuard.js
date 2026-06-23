function numberEnv(name,fallback){const value=Number(process.env[name]);return Number.isFinite(value)&&value>0?value:fallback;}
function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
export function estimateTokens(text=''){return Math.ceil(String(text||'').length/3.4);}
export function evaluateCostGuard({usage={},rank=99,grade='C',contentTier='standard',prompt='',requestedOutput=4200}={}){
  const dailyInputLimit=numberEnv('AI_DAILY_INPUT_TOKEN_LIMIT',500000);
  const dailyOutputLimit=numberEnv('AI_DAILY_OUTPUT_TOKEN_LIMIT',120000);
  const perItemInputLimit=numberEnv('AI_PER_CONTENT_INPUT_TOKEN_LIMIT',18000);
  const perItemOutputLimit=numberEnv('AI_PER_CONTENT_OUTPUT_TOKEN_LIMIT',4800);
  const inputUsed=Number(usage.input||0),outputUsed=Number(usage.output||0);
  const ratio=Math.max(inputUsed/dailyInputLimit,outputUsed/dailyOutputLimit);
  const estimatedInput=estimateTokens(prompt);
  const reasons=[];
  let allowed=true,allowRevision=true;
  if(estimatedInput>perItemInputLimit){allowed=false;reasons.push('콘텐츠 1건 입력 토큰 한도 초과');}
  if(ratio>=1){allowed=false;reasons.push('일일 AI 토큰 한도 도달');}
  else if(ratio>=0.9&&!(grade==='A'&&Number(rank||99)<=5)){allowed=false;reasons.push('일일 한도 90% 이상으로 TOP5 A등급만 생성');}
  else if(ratio>=0.7){allowRevision=false;reasons.push('일일 한도 70% 이상으로 자동 재작성 비활성화');}
  if(contentTier==='none'){allowed=false;reasons.push('목록 전용 후보는 콘텐츠를 생성하지 않음');}
  const maxOutput=Math.round(clamp(Math.min(requestedOutput,perItemOutputLimit),800,perItemOutputLimit));
  return {allowed,allowRevision,maxOutput,estimatedInput,inputUsed,outputUsed,dailyInputLimit,dailyOutputLimit,ratio:Number(ratio.toFixed(3)),reasons};
}
