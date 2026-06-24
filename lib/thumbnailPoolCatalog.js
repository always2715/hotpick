export const THUMBNAIL_POOL_VERSION = 'v1-100-curated';
export const THUMBNAIL_POOL_TARGET_SIZE = 100;
export const RECENT_THUMBNAIL_REUSE_WINDOW = 20;

const rows = {
  finance: {
    label:'경제·금융', query:'finance market business economy investment city', appCategories:['economy'],
    slots:[
      ['새벽을 여는 금융가',['분석','전망'],['금융가','시장'],'neutral'],
      ['상승을 기다리는 시장',['성장','상승'],['증권시장','투자'],'positive'],
      ['흔들리는 투자 심리',['하락','위기'],['투자','시장'],'negative'],
      ['불확실성 속의 금융시장',['불안','변동'],['환율','금리','시장'],'negative'],
      ['숫자로 읽는 경제 흐름',['분석','전망'],['금융 데이터','계산기'],'neutral'],
      ['금리의 방향을 살피는 시간',['변화','정책'],['금리','금융'],'neutral'],
      ['환율이 움직이는 순간',['변동','상승'],['환율','시장'],'negative'],
      ['자금이 흐르는 도시',['성장','전환'],['화폐','금융가'],'positive'],
      ['시장 데이터를 읽는 시선',['분석','전망'],['시장 분석','금융 데이터'],'neutral'],
      ['경제 전망을 그리는 화면',['전망','변화'],['경제 전망','데이터'],'neutral'],
    ],
  },
  corporate: {
    label:'기업·산업', query:'industry manufacturing factory business office logistics semiconductor', appCategories:['economy','tech'],
    slots:[
      ['조용한 기업 회의실',['발표','의사결정'],['회의실','기업'],'neutral'],
      ['성장을 준비하는 기업',['성장','상승'],['기업 빌딩','기업 성장'],'positive'],
      ['멈추지 않는 생산라인',['생산','성장'],['생산라인','제조업'],'positive'],
      ['산업을 움직이는 물류',['이동','전환'],['물류','산업시설'],'neutral'],
      ['반도체 도시의 불빛',['기술','성장'],['반도체','산업시설'],'positive'],
      ['새로운 전략을 논의하는 자리',['발표','전환'],['회의실','사무실'],'neutral'],
      ['공장을 밝히는 새벽',['생산','회복'],['공장','제조업'],'positive'],
      ['기업 현장의 긴장감',['위기','변화'],['사무실','기업'],'negative'],
      ['산업 시설의 거대한 흐름',['분석','전망'],['산업시설','생산라인'],'neutral'],
      ['성장 곡선을 준비하는 조직',['성장','전망'],['기업 성장','사무실'],'positive'],
    ],
  },
  tech_ai: {
    label:'IT·AI', query:'artificial intelligence data center coding cloud server robot cybersecurity technology', appCategories:['tech','ai'],
    slots:[
      ['연결되는 디지털 세계',['변화','전환'],['디지털 네트워크','클라우드'],'positive'],
      ['데이터가 흐르는 공간',['분석','운영'],['데이터센터','서버'],'neutral'],
      ['인공지능의 새로운 시선',['발표','출시'],['인공지능','미래 기술'],'positive'],
      ['미래를 설계하는 코드',['개발','변화'],['코딩','소프트웨어'],'positive'],
      ['긴급 경고가 켜진 순간',['긴급','경고'],['사이버보안','서버'],'negative'],
      ['클라우드 위의 새로운 서비스',['발표','출시'],['클라우드','디지털 네트워크'],'positive'],
      ['서버실의 조용한 긴장',['장애','위기'],['서버','데이터센터'],'negative'],
      ['로봇과 사람이 만나는 기술',['혁신','전환'],['로봇','미래 기술'],'positive'],
      ['반도체 기술의 정밀한 세계',['기술','분석'],['반도체 기술','칩'],'neutral'],
      ['보이지 않는 네트워크의 흐름',['분석','운영'],['디지털 네트워크','사이버보안'],'neutral'],
    ],
  },
  society: {
    label:'사회·생활', query:'urban daily life city street commute housing public transport people', appCategories:['life','politics','general'],
    slots:[
      ['변화가 시작된 거리',['변화','전환'],['도시 거리','시민'],'neutral'],
      ['바쁜 도시의 하루',['일상','이동'],['출퇴근','교통'],'neutral'],
      ['일상을 바꾸는 선택',['변화','소비'],['소비생활','일상'],'positive'],
      ['도시와 사람이 만나는 시간',['일상','사회'],['시민','도시 거리'],'neutral'],
      ['주거 공간의 새로운 기준',['변화','정책'],['주거','생활 변화'],'neutral'],
      ['출근길의 복잡한 흐름',['혼잡','변화'],['출퇴근','교통'],'negative'],
      ['공공시설을 찾는 시민들',['정책','이용'],['공공시설','시민'],'neutral'],
      ['소비가 움직이는 거리',['소비','상승'],['소비생활','도시 거리'],'positive'],
      ['도시 인구의 새로운 흐름',['분석','전망'],['인구','도시'],'neutral'],
      ['평범한 하루의 작은 변화',['일상','변화'],['일상','생활 변화'],'neutral'],
    ],
  },
  politics: {
    label:'정치·행정', query:'government administration parliament meeting policy briefing voting diplomacy', appCategories:['politics'],
    slots:[
      ['발표를 앞둔 회의장',['발표','정책'],['회의장','브리핑'],'neutral'],
      ['정책이 결정되는 순간',['정책','의사결정'],['정책','공공기관'],'neutral'],
      ['행정 문서 위의 선택',['규제','정책'],['행정 문서','의사결정'],'neutral'],
      ['정부청사의 조용한 아침',['행정','일반'],['정부청사','공공기관'],'neutral'],
      ['공식 브리핑을 기다리는 자리',['발표','브리핑'],['브리핑','공식 발표'],'neutral'],
      ['표결을 앞둔 긴장감',['투표','갈등'],['투표','회의장'],'negative'],
      ['공공정책을 논의하는 시간',['정책','분석'],['정책','회의장'],'neutral'],
      ['외교 테이블의 신중한 대화',['외교','협상'],['외교 회의','회의장'],'neutral'],
      ['새 규제가 시작되는 문서',['규제','변화'],['행정 문서','정책'],'negative'],
      ['의사결정의 마지막 순간',['의사결정','전환'],['회의장','공공기관'],'neutral'],
    ],
  },
  global: {
    label:'국제·글로벌', query:'global trade airport world city logistics international conference map', appCategories:['travel','economy','politics','general'],
    slots:[
      ['국경을 넘는 흐름',['이동','전환'],['국경','국제 교류'],'neutral'],
      ['세계를 연결하는 이동',['이동','성장'],['공항','글로벌 도시'],'positive'],
      ['무역이 오가는 항구',['무역','성장'],['무역','물류 이동'],'positive'],
      ['세계 경제를 바라보는 지도',['분석','전망'],['세계지도','세계 경제'],'neutral'],
      ['국제회의를 앞둔 공간',['회의','외교'],['국제회의','국제 교류'],'neutral'],
      ['해외 시장의 새로운 신호',['분석','변화'],['해외 시장','세계 경제'],'neutral'],
      ['글로벌 도시의 밤',['성장','이동'],['글로벌 도시','국제 교류'],'positive'],
      ['공항에서 시작되는 변화',['이동','전환'],['공항','국경'],'neutral'],
      ['세계 물류의 긴 여정',['물류','변동'],['물류 이동','무역'],'neutral'],
      ['국경 앞의 신중한 선택',['갈등','규제'],['국경','외교 회의'],'negative'],
    ],
  },
  culture: {
    label:'문화·연예', query:'concert stage theater cinema camera music audience content production', appCategories:['entertainment'],
    slots:[
      ['무대 위 새로운 주인공',['발표','흥행'],['무대','공연장'],'positive'],
      ['공연을 기다리는 객석',['기대','흥행'],['관객','공연장'],'positive'],
      ['카메라가 켜지는 순간',['발표','제작'],['카메라','방송'],'neutral'],
      ['조명 아래 시작되는 이야기',['공연','출시'],['조명','무대'],'positive'],
      ['영화관의 조용한 기대',['흥행','공개'],['영화관','관객'],'positive'],
      ['음악이 시작되기 전',['컴백','발표'],['음악','무대'],'positive'],
      ['콘텐츠를 만드는 현장',['제작','변화'],['콘텐츠 제작','카메라'],'neutral'],
      ['방송을 준비하는 스튜디오',['방송','발표'],['방송','조명'],'neutral'],
      ['관객과 무대가 만나는 밤',['흥행','축하'],['관객','공연장'],'positive'],
      ['문화 공간의 새로운 장면',['변화','공개'],['문화 공간','영화관'],'neutral'],
    ],
  },
  sports: {
    label:'스포츠', query:'sports stadium running football basketball training trophy competition', appCategories:['sports'],
    slots:[
      ['승부를 앞둔 경기장',['경기','긴장'],['경기장','관중석'],'neutral'],
      ['마지막 순간의 집중',['승부','집중'],['선수 실루엣','경기장'],'positive'],
      ['트랙 위의 새로운 기록',['성장','기록'],['달리기','운동'],'positive'],
      ['축구공이 멈춘 순간',['경기','결과'],['축구공','경기장'],'neutral'],
      ['농구 코트의 뜨거운 승부',['경기','승부'],['농구공','경기장'],'positive'],
      ['훈련이 만드는 차이',['훈련','성장'],['훈련','운동'],'positive'],
      ['관중석을 채운 기대',['흥행','기대'],['관중석','경기장'],'positive'],
      ['트로피를 향한 마지막 길',['우승','집중'],['트로피','승부'],'positive'],
      ['비어 있는 경기장의 긴장',['경기','대기'],['경기장','관중석'],'neutral'],
      ['운동장에서 시작되는 도전',['훈련','도전'],['운동','달리기'],'positive'],
    ],
  },
  health_education: {
    label:'건강·교육', query:'hospital medical research laboratory education classroom study science health', appCategories:['life','general'],
    slots:[
      ['일상을 바꾸는 연구',['연구','변화'],['의료 연구','연구실'],'positive'],
      ['배움이 시작되는 공간',['교육','시작'],['강의실','학습'],'positive'],
      ['병원의 조용한 아침',['의료','일반'],['병원','건강관리'],'neutral'],
      ['과학 연구의 집중된 순간',['연구','분석'],['과학 연구','연구실'],'neutral'],
      ['건강을 지키는 새로운 습관',['건강','변화'],['건강관리','운동'],'positive'],
      ['책상 위에 쌓이는 배움',['학습','성장'],['책상','학습'],'positive'],
      ['학교에서 시작되는 하루',['교육','일상'],['학교','강의실'],'neutral'],
      ['의료진이 확인하는 데이터',['의료','분석'],['병원','의료 연구'],'neutral'],
      ['연구실의 새로운 발견',['연구','발표'],['연구실','과학 연구'],'positive'],
      ['교육 현장의 새로운 변화',['교육','정책'],['학교','학습'],'neutral'],
    ],
  },
  environment: {
    label:'환경·재난', query:'storm rain wildfire climate renewable energy disaster response environment', appCategories:['life','politics','general'],
    slots:[
      ['폭풍이 다가오는 도시',['사고','재난'],['폭우','도시'],'negative'],
      ['기후 변화의 신호',['기후','경고'],['기후','자연환경'],'negative'],
      ['산불 연기 속의 긴급 대응',['긴급','재난'],['산불','재난 대응'],'negative'],
      ['폭염이 덮친 거리',['폭염','경고'],['폭염','도시'],'negative'],
      ['태풍을 앞둔 하늘',['태풍','긴급'],['태풍','구름'],'negative'],
      ['재생에너지가 만드는 풍경',['에너지','전환'],['재생에너지','자연환경'],'positive'],
      ['비가 멈추지 않는 도시',['폭우','재난'],['폭우','교통'],'negative'],
      ['재난 대응이 시작된 현장',['대응','긴급'],['재난 대응','에너지 시설'],'neutral'],
      ['자연환경의 조용한 변화',['기후','변화'],['자연환경','기후'],'neutral'],
      ['에너지 시설의 새로운 전환',['에너지','정책'],['에너지 시설','재생에너지'],'positive'],
    ],
  },
};

export const THUMBNAIL_POOL_CATEGORIES = Object.freeze(Object.fromEntries(
  Object.entries(rows).map(([key,value])=>[key,Object.freeze({...value,slots:Object.freeze(value.slots.map(slot=>Object.freeze(slot)))})])
));

export function buildThumbnailPoolSeeds(){
  const result=[];
  for(const [category,config] of Object.entries(THUMBNAIL_POOL_CATEGORIES)){
    config.slots.forEach((slot,index)=>{
      const [moodTitle,moods,subjects,tone]=slot;
      result.push({
        id:`${category}_${String(index+1).padStart(3,'0')}`,
        category,
        categoryLabel:config.label,
        query:config.query,
        moodTitle,
        moods:[...moods],
        subjects:[...subjects],
        tone,
        usableFor:[...new Set([...moods,...subjects])],
        avoidFor:category==='culture'?['정치','재난','금융']:category==='sports'?['정치','금융','의료']:category==='environment'?['연예','스포츠','신제품 출시']:[],
        enabled:true,
      });
    });
  }
  return result;
}
