# ConDesk (컨데스크) — Consult more, write less.

컨설팅·강의·심사·기타 업무 이력과 매출, 교육 이력, 자격증, 공고, 가입 사이트를 관리하고
상담 원자료(메모·녹음·줌 노트·첨부 문서·사진)로 기관별 컨설팅 보고서를 자동 작성하는 1인 컨설턴트용 웹앱입니다.

## 내 PC에서 실행

`start.bat`을 더블클릭하면 브라우저에서 http://localhost:5179 이 열립니다. (Node.js 22.13 이상 필요)

- 이 PC에서만 접속되며 로그인 없이 쓸 수 있습니다.
- 데이터는 `data/` 폴더(`app.db`, `uploads/`)에 저장됩니다.
- 한글(한컴오피스)이 설치되어 있으면 보고서를 **HWP·PDF**로도 내려받을 수 있습니다.
- 화면 코드를 고친 뒤에는 `npm run build`, 개발 중에는 `npm run dev`(http://localhost:5173).

## Vercel + Supabase 배포 (PC 없이 항상 접속)

화면과 API는 Vercel, 데이터(DB)와 업로드 파일은 Supabase에 저장합니다. `api/index.js`가 `server/app.js`(Express)를 Vercel Function으로 실행합니다.

Vercel 프로젝트 → Settings → Environment Variables 에 아래를 넣고 다시 배포합니다.

| 이름 | 값 |
|---|---|
| `APP_PASSWORD` | 로그인 비밀번호 (필수) |
| `DATABASE_URL` | Supabase → Connect → **Transaction pooler** 연결 문자열 (포트 6543, `[YOUR-PASSWORD]`를 DB 비밀번호로 바꿈) |
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → `service_role` (비밀 키) |
| `GEMINI_API_KEY` | (선택) 앱 설정 화면에서 넣어도 됨 |

- 테이블과 비공개 Storage 버킷(`uploads`)은 첫 접속 때 자동으로 만들어집니다.
- Vercel에서는 HWP/PDF 변환이 안 되어 보고서는 Word(.docx)로 받습니다.
- Vercel 요청 크기 제한(약 4.5MB) 때문에 큰 녹음 파일은 올릴 수 없습니다.
- `DATABASE_URL`이 없으면 이 PC의 SQLite(`data/app.db`)를 씁니다(로컬 실행).

## 고정 주소 모드 (무료 · 내 PC + Tailscale Funnel)

항상 같은 주소(`https://<기기이름>.<tailnet>.ts.net`)로 휴대폰·다른 PC에서 접속합니다.

1. Tailscale(https://tailscale.com/download)을 설치하고 로그인합니다.
2. 처음 한 번 Funnel을 허용합니다: `tailscale funnel 5179`를 실행하면 나오는 링크에서 허용.
3. `start-funnel.bat`을 더블클릭합니다. 처음 한 번 로그인 비밀번호를 정하고, 창에 고정 접속 주소가 표시됩니다.

참고
- 이 PC가 켜져 있고 실행 창이 열려 있는 동안 접속됩니다. PC 절전 모드를 꺼 두세요.
- Funnel이 켜져 있으면 비밀번호 없이는 앱이 시작되지 않습니다(정보 보호).
- 외부 공개를 완전히 끄려면 `tailscale funnel reset`.

## 외부 공개 모드 (무료 · 내 PC + Cloudflare 임시 터널)

내 PC에서 돌아가는 앱에 인터넷 주소를 붙여 휴대폰·다른 PC에서도 접속합니다. 비용이 없고 HWP·PDF 변환도 그대로 됩니다.

1. `tools/cloudflared.exe`가 필요합니다. 없으면 https://github.com/cloudflare/cloudflared/releases 에서 `cloudflared-windows-amd64.exe`를 받아 `tools/cloudflared.exe`로 저장합니다.
2. `start-public.bat`을 더블클릭합니다. 처음 한 번 로그인 비밀번호(8자 이상)를 정합니다(`data/app_password.txt`, 바꾸려면 이 파일을 지우고 다시 실행).
3. 창에 `외부 접속 주소: https://xxxx.trycloudflare.com`이 표시됩니다. 앱 **설정** 화면 맨 위에도 나옵니다.

참고
- 이 PC가 켜져 있고 실행 창이 열려 있는 동안만 접속됩니다. PC 절전 모드를 꺼 두세요.
- 주소는 실행할 때마다 바뀝니다.
- 비밀번호 파일이 생긴 뒤에는 `start.bat`으로 실행해도 로그인 화면이 나옵니다.

## 클라우드 배포 (Render, 유료)

1. Render(https://render.com)에 GitHub 계정으로 가입합니다.
2. `https://render.com/deploy?repo=<이 저장소 주소>` 를 열면 `render.yaml` 설정으로 서비스가 만들어집니다.
3. 입력 칸에 다음을 넣습니다.
   - `APP_PASSWORD`: 로그인 비밀번호 (필수, 길고 추측하기 어렵게)
   - `GEMINI_API_KEY`: Google AI Studio에서 받은 키 (선택, 나중에 앱 설정 화면에서 넣어도 됨)
4. 배포가 끝나면 `https://condesk-xxxx.onrender.com` 같은 주소가 생깁니다.

참고
- 데이터는 영구 디스크(`/var/data`)에 저장됩니다. 디스크는 Render 유료 플랜(Starter)에서만 쓸 수 있습니다. 무료 플랜으로 바꾸면 재시작할 때마다 데이터가 지워집니다.
- 클라우드 서버에는 한글이 없어서 보고서는 **Word(.docx)**로 내려받습니다(한글에서 열기 가능).
- `APP_PASSWORD` 없이 외부 접속으로 실행하면 서버가 시작되지 않습니다(정보 보호).

## 처음 설정

1. **설정 → AI 엔진**: Google Gemini(무료 등급) 또는 Claude 선택 후 API 키 입력
2. **설정 → 내 프로필**: 이름·소속·분야 (보고서 기본값)
3. 엑셀 데이터: **설정 → 엑셀에서 가져오기**

## 주요 기능

- **AI 보고서**: 기본 3단 구성(①기업정보 및 진단 ②컨설팅 진행내용 ③실행과제 및 개선방향) 원고를 쓴 뒤 기관 양식 칸에 맞게 재배치. 칸별 수정·AI 다시 쓰기·복사, 사진 첨부, HWP/PDF/Word 다운로드
- **기본 정보 자동 입력**: 명함·사업자등록증·신청서·엑셀 등 파일에서 회사명·대표자 등을 읽어 빈칸 채우기
- **업체 DB**: 보고서의 기본정보를 업체별로 모아 보기·엑셀 다운로드
- **관리 화면**: 업무 이력·매출·교육 이력·자격증·공고·가입 사이트 (각각 엑셀 다운로드, 설정에서 전체 내보내기)
- **보고서 양식**: 기본 8종, 기관 양식 파일을 올리면 AI가 분석해 추가

## 구조

- `server/` Express + SQLite(node:sqlite). `auth.js` 로그인, `schema.js` 관리 테이블, `templates.js` 보고서 양식, `ai.js` Gemini/Claude 호출, `docx.js` Word 출력, `hwp.js` 한글 변환, `extract.js` 문서 텍스트 추출, `importXlsx.js` 엑셀 가져오기
- `client/` React + Vite + Tailwind 화면

## 주의

- 계정 비밀번호·API 키는 DB에 암호화 없이 저장됩니다. `data/` 폴더와 내보낸 엑셀 파일은 공유하지 마세요.
