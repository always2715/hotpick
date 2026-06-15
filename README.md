# HotPick 🔥
실시간 트렌드 키워드 TOP 30 + AI 콘텐츠 자동 생성 웹앱

## 배포 가이드

### 1. GitHub에 코드 올리기
```bash
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/[깃헙아이디]/hotpick.git
git push -u origin main
```

### 2. Vercel 배포
1. vercel.com 접속
2. New Project → GitHub 연동 → hotpick 선택
3. Environment Variables 추가:
   - ANTHROPIC_API_KEY = [Claude API 키]
   - YOUTUBE_API_KEY = [유튜브 API 키]
   - UNSPLASH_ACCESS_KEY = [Unsplash 키] (선택)
4. Deploy 클릭

### 3. 완료
배포 후 [프로젝트명].vercel.app 으로 접속 가능

## API 키 발급처
| 키 | 발급처 |
|----|--------|
| ANTHROPIC_API_KEY | console.claude.com |
| YOUTUBE_API_KEY | console.cloud.google.com |
| UNSPLASH_ACCESS_KEY | unsplash.com/developers |
