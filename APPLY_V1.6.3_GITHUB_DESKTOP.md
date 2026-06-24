# v1.6.3 적용 안내 — GitHub Desktop

## 적용 전

- 현재 저장소 기준이 v1.6.2인지 확인
- `.env.local`, Vercel 환경변수, Supabase 데이터는 삭제하거나 변경하지 않음
- 실행 중인 v1.6.2 백필 PowerShell이 있다면 종료된 상태인지 확인

## 적용

1. `secufocus-now-web-v1.6.2-to-v1.6.3-patch.zip` 압축 해제
2. 압축 안의 파일과 폴더를 GitHub 저장소 루트에 덮어쓰기
3. GitHub Desktop에서 변경 파일 확인
4. Commit summary:

```text
v1.6.3 handle Supabase Cloudflare WAF during NVD enrichment
```

5. `Push origin`
6. Vercel Production 배포가 `Ready`인지 확인

## 배포 후 백필 재개

```powershell
.\scripts\backfill-nvd-details.ps1 `
  -BaseUrl "https://secufocus-now-web.vercel.app" `
  -Batch 1 `
  -MaxRounds 300 `
  -MaxTransportRetries 5 `
  -RequestTimeoutSec 180
```

## 정상 출력 예시

```text
Candidates before : 211
Selected          : 1
Attempted         : 1
Enriched          : 1
Partial           : 1
WAF fallback      : 1
Missing in NVD    : 0
Failed            : 0
Remaining         : 210
```

`Partial=1`은 해당 CVE의 일부 선택 필드만 Cloudflare 차단으로 보류됐다는 의미다. `Enriched=1`과 `Remaining` 감소가 더 중요한 완료 판단 기준이다.

## 최종 검증 SQL

```sql
select count(*) as remaining_nvd_enrichment
from public.vulnerabilities
where is_kev = true
  and published_at is null
  and is_sample = false;
```

정상: `0`

```sql
select cve_id, count(*)
from public.vulnerabilities
where is_sample = false
group by cve_id
having count(*) > 1;
```

정상: 결과 0건

## 롤백

1. GitHub Desktop에서 v1.6.3 커밋 선택
2. `Revert Changes in Commit`
3. Push origin
4. Vercel에서 v1.6.2 배포가 활성화되는지 확인

롤백해도 v1.6.3이 이미 저장한 정상 NVD 상세, KEV, EPSS 데이터는 삭제하지 않는다. 전체 DB 초기화나 vulnerabilities 삭제는 금지한다.
