const GENERIC_QUERY_WORDS = new Set([
  'news','current','trend','trends','breaking','latest','public','general','issue','issues','story','stories',
  'korea','korean','today','event','events','scene','image','photo','photography'
]);

export const CATEGORY_UNSPLASH_SPECS = Object.freeze({
  entertainment: Object.freeze([
    { query:'concert stage lights audience', avoid:['logo','celebrity portrait','movie poster','brand'], reason:'연예·문화 카테고리 이미지' },
    { query:'theater stage performance lights', avoid:['logo','celebrity portrait','movie poster','brand'], reason:'연예·문화 카테고리 이미지' },
    { query:'music festival crowd stage', avoid:['logo','celebrity portrait','movie poster','brand'], reason:'연예·문화 카테고리 이미지' },
    { query:'cinema theater seats screen', avoid:['logo','celebrity portrait','movie poster','brand'], reason:'연예·문화 카테고리 이미지' },
  ]),
  sports: Object.freeze([
    { query:'sports stadium competition field', avoid:['logo','team emblem','player portrait','broadcast'], reason:'스포츠 카테고리 이미지' },
    { query:'athlete training stadium track', avoid:['logo','team emblem','player portrait','broadcast'], reason:'스포츠 카테고리 이미지' },
    { query:'football field stadium lights', avoid:['logo','team emblem','player portrait','broadcast'], reason:'스포츠 카테고리 이미지' },
    { query:'baseball stadium empty field', avoid:['logo','team emblem','player portrait','broadcast'], reason:'스포츠 카테고리 이미지' },
  ]),
  tech: Object.freeze([
    { query:'modern data center servers', avoid:['logo','brand','product screen','person portrait'], reason:'IT·테크 카테고리 이미지' },
    { query:'computer circuit board technology', avoid:['logo','brand','product screen','person portrait'], reason:'IT·테크 카테고리 이미지' },
    { query:'smartphone technology workspace', avoid:['logo','brand','product screen','person portrait'], reason:'IT·테크 카테고리 이미지' },
    { query:'semiconductor chip laboratory', avoid:['logo','brand','product screen','person portrait'], reason:'IT·테크 카테고리 이미지' },
  ]),
  ai: Object.freeze([
    { query:'artificial intelligence data technology', avoid:['logo','brand','robot toy','person portrait'], reason:'AI 카테고리 이미지' },
    { query:'machine learning computer servers', avoid:['logo','brand','robot toy','person portrait'], reason:'AI 카테고리 이미지' },
    { query:'neural network abstract technology', avoid:['logo','brand','robot toy','person portrait'], reason:'AI 카테고리 이미지' },
    { query:'digital data visualization technology', avoid:['logo','brand','robot toy','person portrait'], reason:'AI 카테고리 이미지' },
  ]),
  economy: Object.freeze([
    { query:'financial district business buildings', avoid:['logo','brand','stock ticker logo','person portrait'], reason:'경제 카테고리 이미지' },
    { query:'business finance office charts', avoid:['logo','brand','stock ticker logo','person portrait'], reason:'경제 카테고리 이미지' },
    { query:'city economy commercial district', avoid:['logo','brand','stock ticker logo','person portrait'], reason:'경제 카테고리 이미지' },
    { query:'financial market desk screens', avoid:['logo','brand','stock ticker logo','person portrait'], reason:'경제 카테고리 이미지' },
  ]),
  travel: Object.freeze([
    { query:'travel destination city landscape', avoid:['logo','brand','tour company','person portrait'], reason:'여행 카테고리 이미지' },
    { query:'airport travel terminal architecture', avoid:['logo','brand','tour company','person portrait'], reason:'여행 카테고리 이미지' },
    { query:'coastal travel scenic landscape', avoid:['logo','brand','tour company','person portrait'], reason:'여행 카테고리 이미지' },
    { query:'historic city travel street', avoid:['logo','brand','tour company','person portrait'], reason:'여행 카테고리 이미지' },
  ]),
  life: Object.freeze([
    { query:'daily life healthy lifestyle', avoid:['logo','brand','medical procedure','person portrait'], reason:'생활 카테고리 이미지' },
    { query:'home living bright interior', avoid:['logo','brand','medical procedure','person portrait'], reason:'생활 카테고리 이미지' },
    { query:'city park everyday lifestyle', avoid:['logo','brand','medical procedure','person portrait'], reason:'생활 카테고리 이미지' },
    { query:'education study desk lifestyle', avoid:['logo','brand','medical procedure','person portrait'], reason:'생활 카테고리 이미지' },
  ]),
  politics: Object.freeze([
    { query:'government parliament institutional building', avoid:['logo','party banner','politician portrait','protest'], reason:'정치·사회 카테고리 이미지' },
    { query:'courthouse justice public building', avoid:['logo','party banner','politician portrait','protest'], reason:'정치·사회 카테고리 이미지' },
    { query:'city hall public administration building', avoid:['logo','party banner','politician portrait','protest'], reason:'정치·사회 카테고리 이미지' },
    { query:'public policy meeting room', avoid:['logo','party banner','politician portrait','protest'], reason:'정치·사회 카테고리 이미지' },
  ]),
  general: Object.freeze([
    { query:'modern city skyline public life', avoid:['logo','brand','person portrait','news screen'], reason:'트렌드 카테고리 이미지' },
    { query:'urban street everyday city', avoid:['logo','brand','person portrait','news screen'], reason:'트렌드 카테고리 이미지' },
    { query:'public square city architecture', avoid:['logo','brand','person portrait','news screen'], reason:'트렌드 카테고리 이미지' },
    { query:'creative workspace modern city', avoid:['logo','brand','person portrait','news screen'], reason:'트렌드 카테고리 이미지' },
  ]),
});

function stableSeed(value = '') {
  return [...String(value || '')].reduce((sum, char) => ((sum * 31) + char.codePointAt(0)) >>> 0, 2166136261);
}

export function buildCategoryImageSpec(category = 'general', seed = '') {
  const key = Object.prototype.hasOwnProperty.call(CATEGORY_UNSPLASH_SPECS, category) ? category : 'general';
  const rows = CATEGORY_UNSPLASH_SPECS[key];
  const index = rows.length ? stableSeed(`${key}:${seed}`) % rows.length : 0;
  const selected = rows[index] || CATEGORY_UNSPLASH_SPECS.general[0];
  return { ...selected, category:key, source:'category', minScore:38 };
}

export function isUnsplashImageUrl(value = '') {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && url.hostname === 'images.unsplash.com';
  } catch {
    return false;
  }
}

export function isUnsplashImageMeta(value = null) {
  if (!value || typeof value !== 'object') return false;
  const source = String(value.source || '').toLowerCase();
  const imageUrl = value.imageUrl || value.thumbUrl || value.url || value.urls?.regular || value.urls?.small || '';
  return source === 'unsplash' && isUnsplashImageUrl(imageUrl);
}


const VISUAL_RULES = [
  { re: /원전|원자력|핵발전|nuclear/i, query:'nuclear power plant reactor cooling towers', avoid:['protest','demonstration','activist','placard','banner'], reason:'원전 시설' },
  { re: /태풍|폭우|집중호우|홍수|침수|storm|flood/i, query:'severe rain flood emergency city', avoid:['beach','sunset','vacation'], reason:'기상 재난' },
  { re: /산불|화재|불길|fire/i, query:'firefighters emergency fire smoke', avoid:['campfire','fireplace','candle'], reason:'화재 대응' },
  { re: /지진|earthquake/i, query:'earthquake rescue damaged buildings', avoid:['abstract','map'], reason:'지진 피해' },
  { re: /장애|먹통|접속오류|서비스 중단|outage/i, query:'data center server network outage', avoid:['construction','power lines'], reason:'서비스 장애' },
  { re: /해킹|랜섬|침해|사이버|보안사고|cyber/i, query:'cybersecurity server computer network', avoid:['padlock toy'], reason:'사이버보안' },
  { re: /반도체|메모리칩|gpu|npu|semiconductor/i, query:'semiconductor microchip circuit board', avoid:['food','casino'], reason:'반도체' },
  { re: /아이폰|갤럭시|스마트폰|휴대폰|iphone|smartphone/i, query:'smartphone mobile device technology', avoid:['telephone booth','landline'], reason:'스마트폰' },
  { re: /인공지능|챗gpt|chatgpt|클로드|gemini|생성형 ai|\bai\b/i, query:'artificial intelligence server technology', avoid:['robot toy','science fiction'], reason:'인공지능' },
  { re: /코스피|코스닥|나스닥|주가|증시|금리|환율|실적|영업이익|stock|finance/i, query:'financial market stock chart business', avoid:['gambling','casino'], reason:'금융 시장' },
  { re: /축구|월드컵|epl|k리그|football|soccer/i, query:'football stadium match action', avoid:['american football'], reason:'축구' },
  { re: /야구|kbo|mlb|baseball/i, query:'baseball stadium game action', avoid:['cricket'], reason:'야구' },
  { re: /농구|nba|basketball/i, query:'basketball arena game action', avoid:['street fashion'], reason:'농구' },
  { re: /골프|golf/i, query:'golf course tournament action', avoid:['mini golf'], reason:'골프' },
  { re: /콘서트|공연|컴백|앨범|가수|아이돌|concert|music/i, query:'concert stage music performance', avoid:['empty theater','street protest'], reason:'음악 공연' },
  { re: /영화|드라마|예고편|시사회|cinema|film/i, query:'cinema film production set', avoid:['news camera','protest'], reason:'영화·영상' },
  { re: /날씨|폭염|무더위|heatwave/i, query:'summer heat city hot weather', avoid:['winter','snow'], reason:'폭염·날씨' },
  { re: /눈|폭설|한파|snow|blizzard/i, query:'heavy snow winter city weather', avoid:['summer','beach'], reason:'겨울 날씨' },
  { re: /국회|정부|정책|장관|대통령|parliament|government/i, query:'government parliament institutional building', avoid:['protest','demonstration','activist','placard','banner'], reason:'정부·정책' },
  { re: /법원|판결|재판|검찰|court|trial/i, query:'courthouse justice legal institution', avoid:['protest','prison bars'], reason:'사법' },
  { re: /선거|투표|election|vote/i, query:'election ballot voting booth', avoid:['protest','demonstration'], reason:'선거' },
  { re: /항공|공항|비행기|airline|airport/i, query:'passenger airplane airport runway', avoid:['military aircraft'], reason:'항공' },
  { re: /여행|관광|호텔|리조트|travel|tourism/i, query:'travel destination city landscape', avoid:['news','protest'], reason:'여행' },
  { re: /자동차|전기차|배터리|현대차|테슬라|vehicle|electric car/i, query:'electric vehicle automotive technology', avoid:['toy car','traffic accident'], reason:'자동차' },
  { re: /병원|의료|건강|백신|질병|health|medical/i, query:'medical healthcare hospital professional', avoid:['surgery blood','pills closeup'], reason:'의료·건강' },
];

function normalizeText(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-z0-9가-힣\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function queryTokens(value = '') {
  return normalizeText(value).split(' ').filter(token => token.length > 1 && !GENERIC_QUERY_WORDS.has(token));
}

export function optimizeImageUrl(value, width = 900, quality = 78) {
  if (!value) return value;
  try {
    const url = new URL(value);
    if (url.hostname === 'images.unsplash.com') {
      url.searchParams.set('auto', 'format');
      url.searchParams.set('fit', 'crop');
      url.searchParams.set('w', String(width));
      url.searchParams.set('q', String(quality));
      return url.toString();
    }
    return value;
  } catch {
    return value;
  }
}

export function sanitizeVisualQuery(value = '') {
  const query = normalizeText(value)
    .split(' ')
    .filter(token => !GENERIC_QUERY_WORDS.has(token))
    .slice(0, 6)
    .join(' ');
  if (!query || queryTokens(query).length < 2) return '';
  if (/^(news|current trends?|breaking news|latest news)$/i.test(query)) return '';
  return query;
}

export function buildDeterministicImageQuery({ keyword = '', topic = '', category = '', context = '' } = {}) {
  const haystack = `${keyword} ${topic} ${context}`.trim();
  const matched = VISUAL_RULES.find(rule => rule.re.test(haystack));
  if (matched) return { query: matched.query, avoid: matched.avoid || [], reason: matched.reason, source:'rule', minScore:44 };

  // 관련 사건을 특정할 수 없는 범용 뉴스·정치·트렌드 이미지는 사용하지 않는다.
  if (category === 'general' || category === 'politics') return null;

  // 특정 사건을 규칙으로 식별하지 못하면 관련성이 낮은 카테고리 공통 사진을 강제하지 않는다.
  return null;
}

export function scoreUnsplashCandidate(photo = {}, query = '', avoidTerms = [], rank = 0) {
  const tags = Array.isArray(photo.tags) ? photo.tags.map(tag => tag?.title || tag?.name || '').join(' ') : '';
  const metadata = normalizeText(`${photo.alt_description || ''} ${photo.description || ''} ${tags}`);
  const tokens = queryTokens(query);
  const avoid = (Array.isArray(avoidTerms) ? avoidTerms : []).map(normalizeText).filter(Boolean);
  if (avoid.some(term => term && metadata.includes(term))) return { score:-100, overlap:0, rejected:'avoid_term' };

  const matched = tokens.filter(token => metadata.includes(token));
  const overlap = tokens.length ? matched.length / tokens.length : 0;
  const positionScore = Math.max(0, 34 - Number(rank || 0) * 3);
  const overlapScore = Math.round(overlap * 58);
  const metadataBonus = metadata.length > 20 ? 5 : 0;
  const score = positionScore + overlapScore + metadataBonus;
  return { score, overlap:Number(overlap.toFixed(3)), matched };
}

export function imageCandidateId(photo = {}) {
  return String(photo.id || photo.imageUrl || photo.urls?.regular || photo.urls?.small || '').trim();
}
