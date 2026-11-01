// 보고서 양식 정의
// - fields: 양식에 들어가는 칸. kind 'info'(기본정보) | 'content'(AI가 작성하는 본문)
//   part: 기본 3단 구성과의 대응 (1 기업정보 및 진단, 2 컨설팅 진행내용, 3 실행과제 및 개선방향)
//   from: 기본데이터에서 자동으로 채우는 규칙 ('{company}' 같은 치환). 비어 있으면 AI가 원자료에서 채운다.
//   type: text | longtext | check(options 중 선택, 값은 배열)
// - layout: DOCX 출력과 화면 미리보기용 배치. table.rows의 각 칸은 {label} | {field} | {text}, span(가로 병합)
//
// 기본데이터(input) 키: company, ceo, biz_no, phone, biz_phone, industry, item, open_date, session_date,
//   start_time, end_time, place, method, round, mentor, mentor_org, field, mentee_position, period, gubun

export const PARTS = {
  1: '기업정보 및 진단',
  2: '컨설팅 진행내용',
  3: '실행과제 및 개선방향',
};

const PHOTO_NOTE = '※날짜, 시간, 장소 인증 가능한 앱을 활용하여 사진 촬영 必 (날짜, 장소 확인 불가능한 사진의 경우, 불인정)';

export const BUILTIN_TEMPLATES = [
  {
    id: 'standard',
    name: '기본 컨설팅 보고서',
    org: '공통',
    description: '기업정보 및 진단 → 컨설팅 진행내용 → 실행과제 및 개선방향의 기본 3단 구성',
    guide: '기관 양식이 정해지지 않았을 때 쓰는 표준 보고서. 각 단락은 소제목(■)과 개조식 문장으로 구조화한다.',
    fields: [
      { key: 'company', label: '기업명', kind: 'info', from: '{company}' },
      { key: 'ceo', label: '대표자', kind: 'info', from: '{ceo}' },
      { key: 'item', label: '업종/아이템', kind: 'info', from: '{industry} {item}' },
      { key: 'when', label: '컨설팅 일시', kind: 'info', from: '{session_date} {start_time}~{end_time}' },
      { key: 'place', label: '장소/방법', kind: 'info', from: '{place} {method}' },
      { key: 'consultant', label: '컨설턴트', kind: 'info', from: '{mentor} {mentor_org}' },
      { key: 'overview', label: '기업 개요', kind: 'content', type: 'longtext', part: 1, hint: '사업 내용, 제품/서비스, 고객, 현재 단계' },
      { key: 'diagnosis', label: '현황 진단 및 문제점', kind: 'content', type: 'longtext', part: 1, hint: '강점·약점·핵심 문제와 그 원인' },
      { key: 'progress', label: '컨설팅 진행내용', kind: 'content', type: 'longtext', part: 2, hint: '주제별로 무엇을 논의·제안·실습했는지', min: 600 },
      { key: 'actions', label: '실행과제', kind: 'content', type: 'longtext', part: 3, hint: '우선순위·기한이 있는 실행과제 목록' },
      { key: 'improvement', label: '개선방향 및 컨설턴트 의견', kind: 'content', type: 'longtext', part: 3, hint: '중장기 방향과 후속 지원 제안' },
    ],
    layout: [
      { type: 'title', text: '컨설팅 결과보고서' },
      { type: 'table', rows: [
        [{ label: '기업명' }, { field: 'company' }, { label: '대표자' }, { field: 'ceo' }],
        [{ label: '업종/아이템' }, { field: 'item', span: 3 }],
        [{ label: '컨설팅 일시' }, { field: 'when' }, { label: '장소/방법' }, { field: 'place' }],
        [{ label: '컨설턴트' }, { field: 'consultant', span: 3 }],
      ] },
      { type: 'heading', text: '1. 기업정보 및 진단' },
      { type: 'table', rows: [[{ label: '기업 개요' }, { field: 'overview' }], [{ label: '현황 진단' }, { field: 'diagnosis' }]] },
      { type: 'heading', text: '2. 컨설팅 진행내용' },
      { type: 'table', rows: [[{ field: 'progress' }]] },
      { type: 'heading', text: '3. 실행과제 및 개선방향' },
      { type: 'table', rows: [[{ label: '실행과제' }, { field: 'actions' }], [{ label: '개선방향' }, { field: 'improvement' }]] },
    ],
  },

  {
    id: 'gangnam_hub',
    name: '강남취창업허브센터 상담일지',
    org: '강남취창업허브센터',
    description: '창업상담소 상담일지 — 문제원인 분석 / 상담 및 멘토링 내용 / 멘토 의견',
    guide: '상담일지 형식이므로 각 칸은 개조식으로 간결하되 구체적으로 쓴다. 처리사항은 상담 결과에 맞는 항목을 고른다.',
    fields: [
      { key: 'gubun', label: '구분', kind: 'info', from: '{gubun}', hint: '예: 예비창업자 정부지원사업 컨설팅' },
      { key: 'date', label: '일자', kind: 'info', from: '{session_date}' },
      { key: 'time', label: '시간', kind: 'info', from: '{start_time}~{end_time}' },
      { key: 'place', label: '장소', kind: 'info', from: '{place}' },
      { key: 'field', label: '분야', kind: 'info', from: '{field}' },
      { key: 'mentor_info', label: '멘토 정보', kind: 'info', from: '{mentor} ({mentor_org})' },
      { key: 'mentee_info', label: '멘티 정보', kind: 'info', from: '{ceo} / {company} / {item}' },
      { key: 'problem', label: '문제원인 분석', kind: 'content', type: 'longtext', part: 1, hint: '멘티의 현황과 문제의 원인' },
      { key: 'content', label: '상담 및 멘토링 내용', kind: 'content', type: 'longtext', part: 2, min: 500 },
      { key: 'opinion', label: '멘토 의견 (향후 권고사항)', kind: 'content', type: 'longtext', part: 3 },
      { key: 'result', label: '처리사항', kind: 'content', type: 'check', part: 3,
        options: ['문제 해결', '문제 일부 해결', '추가 멘토링 진행 필요', '타분야 전문가 연계 필요'] },
      { key: 'other_field', label: '연계 필요 타 분야', kind: 'content', type: 'text', part: 3, hint: '타분야 연계가 필요할 때만 (예: 세무, 특허)' },
    ],
    layout: [
      { type: 'title', text: '강남취창업허브센터 창업상담소 상담일지' },
      { type: 'table', rows: [
        [{ label: '구 분' }, { field: 'gubun', span: 3 }],
        [{ label: '일 자' }, { field: 'date' }, { label: '시 간' }, { field: 'time' }],
        [{ label: '장 소' }, { field: 'place' }, { label: '분 야' }, { field: 'field' }],
        [{ label: '멘토 정보' }, { field: 'mentor_info', span: 3 }],
        [{ label: '멘티 정보' }, { field: 'mentee_info', span: 3 }],
        [{ label: '문제원인 분석' }, { field: 'problem', span: 3 }],
        [{ label: '상담 및\n멘토링 내용' }, { field: 'content', span: 3 }],
        [{ label: '멘토 의견\n(향후 권고사항)' }, { field: 'opinion', span: 3 }],
        [{ label: '처리사항' }, { field: 'result', span: 3, suffixField: 'other_field', suffixLabel: '타 분야' }],
      ] },
      { type: 'signature', text: '상기와 같이 멘토링을 실시하였음을 확인합니다.', sign: '멘토명 : {mentor} (서명)' },
      { type: 'photos', title: '붙임 1  증빙사진', labels: ['사진 1', '사진 2'] },
    ],
  },

  {
    id: 'yellow_umbrella',
    name: '노란우산 경영지원단 상담일지',
    org: '중소기업중앙회',
    description: '[별지 제1호 서식] 질의 / 답변 / 조치 필요사항 / 건의·애로사항',
    guide: '질의는 상담신청인의 질문을 요약하고, 답변은 자문위원의 구체적 답변과 근거(제도·절차·수치)를 쓴다.',
    fields: [
      { key: 'date', label: '상담일자', kind: 'info', from: '{session_date}' },
      { key: 'advisor', label: '상담자문위원(분야)', kind: 'info', from: '{mentor} ({field})' },
      { key: 'applicant', label: '상담신청인 성명', kind: 'info', from: '{ceo}' },
      { key: 'position', label: '상담신청인 직위', kind: 'info', from: '{mentee_position}' },
      { key: 'method', label: '상담방법', kind: 'content', type: 'check', options: ['전화상담', '대면상담'] },
      { key: 'question', label: '질의', kind: 'content', type: 'longtext', part: 1, hint: '신청인의 상황과 질의 요지' },
      { key: 'answer', label: '답변', kind: 'content', type: 'longtext', part: 2, min: 500 },
      { key: 'actions', label: '조치 필요사항', kind: 'content', type: 'longtext', part: 3 },
      { key: 'suggestions', label: '건의사항 및 애로사항', kind: 'content', type: 'longtext', part: 3 },
    ],
    layout: [
      { type: 'note', text: '[별지 제1호 서식]' },
      { type: 'title', text: '노란우산 경영지원단 상담일지' },
      { type: 'table', rows: [
        [{ label: '상담일자' }, { field: 'date' }, { label: '상담자문위원\n(분야)' }, { field: 'advisor' }],
        [{ label: '상담신청인' }, { field: 'applicant', prefix: '(성명) ' }, { label: '직위' }, { field: 'position' }],
        [{ label: '상담방법' }, { field: 'method', span: 3 }],
        [{ label: '상담내용 · 질의' }, { field: 'question', span: 3 }],
        [{ label: '상담내용 · 답변' }, { field: 'answer', span: 3 }],
        [{ label: '조치 필요사항' }, { field: 'actions', span: 3 }],
        [{ label: '건의사항 및\n애로사항' }, { field: 'suggestions', span: 3 }],
      ] },
      { type: 'note', text: '[2020.11.17. 개정]' },
    ],
  },

  {
    id: 'modoo_startup',
    name: '모두의 창업 책임멘토 멘토링 보고서',
    org: '선문대학교 산학협력단',
    description: '「모두의 창업 프로젝트」 — 주요멘토링 내용 1,000자 이상, 개선사항·향후계획 각 1,000자 이하',
    guide: '주요멘토링 내용은 반드시 공백 포함 1,000자 이상으로, 진단 결과와 회차 중 다룬 내용을 함께 쓴다. 개선사항과 향후계획은 각 1,000자 이하.',
    fields: [
      { key: 'mentee', label: '진출자 이름', kind: 'info', from: '{ceo}' },
      { key: 'round', label: '멘토링 회차', kind: 'info', from: '{round}' },
      { key: 'mentor', label: '멘토명', kind: 'info', from: '{mentor}' },
      { key: 'mentor_org', label: '소속멘토기관', kind: 'info', from: '{mentor_org}' },
      { key: 'method', label: '진행방법', kind: 'info', from: '{method}' },
      { key: 'date', label: '멘토링 일자', kind: 'info', from: '{session_date}' },
      { key: 'start', label: '시작시간', kind: 'info', from: '{start_time}' },
      { key: 'end', label: '종료시간', kind: 'info', from: '{end_time}' },
      { key: 'topic', label: '멘토링 주제', kind: 'content', type: 'text', part: 2 },
      { key: 'main', label: '주요멘토링 내용', kind: 'content', type: 'longtext', part: 2, min: 1000, hint: '진단(1)과 진행내용(2)을 함께' },
      { key: 'improve', label: '개선사항', kind: 'content', type: 'longtext', part: 3, max: 1000 },
      { key: 'plan', label: '향후계획', kind: 'content', type: 'longtext', part: 3, max: 1000 },
    ],
    layout: [
      { type: 'note', text: '붙임 1  책임멘토 멘토링 보고서양식' },
      { type: 'title', text: '「모두의 창업 프로젝트」\n책임멘토 멘토링 보고서' },
      { type: 'table', rows: [
        [{ label: '진출자 이름' }, { field: 'mentee' }, { label: '멘토링 회차' }, { field: 'round', suffix: ' 차' }],
        [{ label: '멘토명' }, { field: 'mentor' }, { label: '소속멘토기관' }, { field: 'mentor_org' }],
        [{ label: '진행방법' }, { field: 'method' }, { label: '멘토링 일자' }, { field: 'date' }],
        [{ label: '시작시간' }, { field: 'start' }, { label: '종료시간' }, { field: 'end' }],
      ] },
      { type: 'heading', text: '멘토링 내용 (1,000자 이상)' },
      { type: 'table', rows: [
        [{ label: '멘토링주제' }, { field: 'topic' }],
        [{ label: '주요멘토링 내용' }, { field: 'main' }],
        [{ label: '개선사항' }, { field: 'improve' }],
        [{ label: '향후계획' }, { field: 'plan' }],
      ] },
      { type: 'photos', title: '사진', labels: ['사진', '사진'] },
      { type: 'signature', text: '위와 같이 모두의 창업 프로젝트 책임멘토 멘토링을 진행하였음을 확인합니다.', to: '선문대학교 산학협력단장 귀하' },
    ],
  },

  {
    id: 'hyupsung_mba',
    name: '화성시 MINI MBA 멘토링 보고서',
    org: '협성대학교 산학협력단',
    description: '『화성시 소상공인 전문경영인 양성(MINI MBA) 과정』 — 멘토링 결과 한 칸에 진단·진행·실행과제를 정리',
    guide: '멘토링 결과 칸 하나에 "1. 기업현황 및 진단 / 2. 멘토링 진행내용 / 3. 실행과제 및 개선방향" 소제목을 달아 3단 구성을 모두 담는다.',
    fields: [
      { key: 'company', label: '기업명', kind: 'info', from: '{company}' },
      { key: 'ceo', label: '대표자명', kind: 'info', from: '{ceo}' },
      { key: 'item', label: '아이템명', kind: 'info', from: '{item}' },
      { key: 'when', label: '멘토링 일시', kind: 'info', from: '{session_date} {start_time}~{end_time}' },
      { key: 'place', label: '장소', kind: 'info', from: '{place}' },
      { key: 'result', label: '멘토링 결과', kind: 'content', type: 'longtext', part: 2, min: 1200, hint: '1·2·3 소제목으로 구성' },
    ],
    layout: [
      { type: 'title', text: '『화성시 소상공인 전문경영인 양성(MINI MBA) 과정』\n멘토링 보고서' },
      { type: 'table', rows: [
        [{ label: '기 업 명' }, { field: 'company' }, { label: '대표자명' }, { field: 'ceo' }],
        [{ label: '아이템명' }, { field: 'item', span: 3 }],
        [{ label: '멘토링 일시' }, { field: 'when' }, { label: '장 소' }, { field: 'place' }],
        [{ label: '멘토링 결과' }, { field: 'result', span: 3 }],
      ] },
      { type: 'signature', text: '『화성시 소상공인 전문경영인 양성(MINI MBA) 과정』과 관련하여\n상기와 같이 멘토링을 진행하였음을 확인합니다.', date: true, sign: '멘  토 : {mentor} (인)', to: '협성대학교 산학협력단 귀중' },
    ],
  },

  {
    id: 'hope_plan',
    name: '희망리턴패키지 채움 멘토링 수행계획서',
    org: '오렌지나무 (희망리턴패키지)',
    description: '[서식18] 업체정보·수행목표·일정 / 2. 수행계획 / 3. 사업화 성과 확장 기대효과',
    guide: '수행계획서는 진단(1)을 바탕으로 수행목표와 회차별 계획(3)을 세운다. 수행목표는 측정 가능한 성과지표로 쓴다.',
    fields: [
      { key: 'mentor', label: '채움 멘토', kind: 'info', from: '{mentor}' },
      { key: 'ceo', label: '대표자', kind: 'info', from: '{ceo}' },
      { key: 'company', label: '업체명', kind: 'info', from: '{company}' },
      { key: 'phone', label: '휴대전화', kind: 'info', from: '{phone}' },
      { key: 'biz_no', label: '사업자등록번호', kind: 'info', from: '{biz_no}' },
      { key: 'biz_phone', label: '사업장 전화', kind: 'info', from: '{biz_phone}' },
      { key: 'industry', label: '업종', kind: 'info', from: '{industry}' },
      { key: 'open_date', label: '개업일', kind: 'info', from: '{open_date}' },
      { key: 'period', label: '수행 기간', kind: 'info', from: '{period}' },
      { key: 'count', label: '멘토링 횟수', kind: 'info', from: '{round}' },
      { key: 'field', label: '멘토링 수행 분야', kind: 'content', type: 'text', part: 1, hint: '예) 음식 레시피 전수, 해외진출 판로개척' },
      { key: 'goal', label: '수행목표(성과목표)', kind: 'content', type: 'longtext', part: 3 },
      { key: 'schedule', label: '멘토링 일정', kind: 'content', type: 'longtext', part: 3, hint: '한 줄에 한 회차: "월 일 | 시간 | 수행 내용 | 수행자"' },
      { key: 'plan', label: '2. 멘토링 수행 계획', kind: 'content', type: 'longtext', part: 2, min: 600 },
      { key: 'effect', label: '3. 사업화 성과 확장 기대효과', kind: 'content', type: 'longtext', part: 3 },
    ],
    layout: [
      { type: 'note', text: '[서식18] 채움 멘토링 수행 계획서' },
      { type: 'title', text: '채움 멘토링 수행 계획서' },
      { type: 'table', rows: [
        [{ label: '채움 멘토' }, { field: 'mentor', suffix: '  (서명)', span: 3 }],
        [{ label: '대표자' }, { field: 'ceo' }, { label: '업체명' }, { field: 'company' }],
        [{ label: '휴대전화' }, { field: 'phone' }, { label: '사업자 등록 번호' }, { field: 'biz_no' }],
        [{ label: '사업장 전화' }, { field: 'biz_phone' }, { label: '업종' }, { field: 'industry' }],
        [{ label: '개업일' }, { field: 'open_date' }, { label: '수행 기간' }, { field: 'period' }],
        [{ label: '멘토링 횟수' }, { field: 'count' }, { label: '멘토링 수행 분야' }, { field: 'field' }],
        [{ label: '수행목표\n(성과목표)' }, { field: 'goal', span: 3 }],
        [{ label: '멘토링 일정\n(수행일자 | 시간 | 내용 | 수행자)' }, { field: 'schedule', span: 3 }],
      ] },
      { type: 'photos', title: '사업장 사진', labels: ['사업장 외부', '사업장 내부'], note: PHOTO_NOTE },
      { type: 'heading', text: '2. 멘토링 수행 계획' },
      { type: 'block', field: 'plan' },
      { type: 'heading', text: '3. 사업화 성과 확장 기대효과' },
      { type: 'block', field: 'effect' },
    ],
  },

  {
    id: 'hope_log',
    name: '희망리턴패키지 채움 멘토링 수행일지',
    org: '오렌지나무 (희망리턴패키지)',
    description: '[서식24] 회차별 수행일지 — 수행목적 및 범위 / 수행내용 및 결과 / 차기 수행과제',
    guide: '회차별 일지. "◈ 수행목적 및 범위", "◈ 수행내용 및 결과", "◈ 차기 수행과제" 세 칸을 각각 채운다. 이전 회차 과제의 이행사항 점검을 수행내용 앞부분에 포함한다.',
    fields: [
      { key: 'round', label: '회차', kind: 'info', from: '{round}' },
      { key: 'mentor', label: '채움 멘토', kind: 'info', from: '{mentor}' },
      { key: 'company', label: '업체명', kind: 'info', from: '{company}' },
      { key: 'date', label: '수행일자', kind: 'info', from: '{session_date}' },
      { key: 'time', label: '수행시간', kind: 'info', from: '{start_time} ~ {end_time}' },
      { key: 'task', label: '수행과제', kind: 'content', type: 'text', part: 2 },
      { key: 'purpose', label: '수행목적 및 범위', kind: 'content', type: 'longtext', part: 1 },
      { key: 'result', label: '수행내용 및 결과', kind: 'content', type: 'longtext', part: 2, min: 600 },
      { key: 'next', label: '차기 수행과제', kind: 'content', type: 'longtext', part: 3 },
    ],
    layout: [
      { type: 'note', text: '[서식24] 채움 멘토링 수행일지' },
      { type: 'title', text: '채움 멘토링 수행일지({round}회차)' },
      { type: 'table', rows: [
        [{ label: '채움 멘토' }, { field: 'mentor', suffix: '  (서 명)' }, { label: '업체명' }, { field: 'company' }],
        [{ label: '수행일자' }, { field: 'date' }, { label: '수행시간' }, { field: 'time' }],
        [{ label: '수행과제' }, { field: 'task', span: 3 }],
        [{ label: '멘토링 수행내용\n(이행사항 점검)\n◈ 수행목적 및 범위' }, { field: 'purpose', span: 3 }],
        [{ label: '◈ 수행내용 및 결과' }, { field: 'result', span: 3 }],
        [{ label: '◈ 차기 수행과제' }, { field: 'next', span: 3 }],
      ] },
      { type: 'photos', title: '멘토링 수행 사진', labels: ['사진 1', '사진 2'], note: PHOTO_NOTE },
    ],
  },

  {
    id: 'hope_result',
    name: '희망리턴패키지 채움 멘토링 결과보고서',
    org: '오렌지나무 (희망리턴패키지)',
    description: '[서식25] 수행내용 / 연계지원 방안 / 멘토링 완료사항(개선 전·후)',
    guide: '전체 회차를 종합한 결과보고서. 개선 전·후는 구체적 수치나 산출물로 대비한다. 연계지원 방안은 "구분: 내용" 형식으로 한 줄씩.',
    fields: [
      { key: 'type', label: '재기사업화 구분', kind: 'content', type: 'check', options: ['경영개선', '재창업'] },
      { key: 'mentor', label: '채움멘토 명', kind: 'info', from: '{mentor}' },
      { key: 'company', label: '업체명', kind: 'info', from: '{company}' },
      { key: 'ceo', label: '대표자명', kind: 'info', from: '{ceo}' },
      { key: 'biz_no', label: '사업자등록번호', kind: 'info', from: '{biz_no}' },
      { key: 'phone', label: '연락처', kind: 'info', from: '{phone}' },
      { key: 'industry', label: '업태/종목', kind: 'info', from: '{industry}' },
      { key: 'open_date', label: '개업일', kind: 'info', from: '{open_date}' },
      { key: 'period', label: '수행 기간', kind: 'info', from: '{period}' },
      { key: 'content', label: '멘토링 수행 내용', kind: 'content', type: 'longtext', part: 2, min: 800, hint: '진단 결과와 회차별 수행 내용 종합' },
      { key: 'linkage', label: '2. 멘토링 이후 연계지원 방안', kind: 'content', type: 'longtext', part: 3, hint: '한 줄에 하나: "구분: 내용"' },
      { key: 'done_field', label: '멘토링 분야', kind: 'content', type: 'text', part: 3 },
      { key: 'done_content', label: '개선내용', kind: 'content', type: 'longtext', part: 3 },
      { key: 'before', label: '개선 전', kind: 'content', type: 'longtext', part: 1 },
      { key: 'after', label: '개선 후', kind: 'content', type: 'longtext', part: 3 },
    ],
    layout: [
      { type: 'note', text: '[서식25] 채움 멘토링 결과보고서' },
      { type: 'title', text: '재기사업화 채움 멘토링 결과보고서' },
      { type: 'heading', text: '1. 멘토링 결과보고서' },
      { type: 'table', rows: [
        [{ label: '구분' }, { field: 'type', span: 3 }],
        [{ label: '채움멘토 명' }, { field: 'mentor', suffix: '  (서 명)', span: 3 }],
        [{ label: '업체명' }, { field: 'company' }, { label: '대표자명' }, { field: 'ceo' }],
        [{ label: '사업자등록번호' }, { field: 'biz_no' }, { label: '연락처' }, { field: 'phone' }],
        [{ label: '업태/종목' }, { field: 'industry' }, { label: '개업일' }, { field: 'open_date' }],
        [{ label: '수행 기간' }, { field: 'period', span: 3 }],
        [{ label: '멘토링 수행 내용' }, { field: 'content', span: 3 }],
      ] },
      { type: 'photos', title: '멘토링 수행 결과 사진', labels: ['사진 1', '사진 2'], note: PHOTO_NOTE },
      { type: 'heading', text: '2. 멘토링 이후 연계지원 방안' },
      { type: 'table', rows: [[{ label: '구분 / 내용' }, { field: 'linkage' }]] },
      { type: 'heading', text: '3. 멘토링 완료 사항' },
      { type: 'table', rows: [
        [{ label: '멘토링 분야' }, { field: 'done_field', span: 3 }],
        [{ label: '개선내용' }, { field: 'done_content', span: 3 }],
        [{ label: '개선 전' }, { field: 'before' }, { label: '개선 후' }, { field: 'after' }],
      ] },
      { type: 'signature', text: '위와 같이 재기사업화 멘토링 결과보고서를 제출합니다.', date: true, to: '오렌지나무 주식회사 귀하' },
    ],
  },
];

// '{company} {item}' 같은 규칙을 기본데이터로 치환. 값이 하나도 없으면 빈 문자열.
export function interpolate(rule, input) {
  if (!rule) return '';
  let any = false;
  const out = rule.replace(/\{(\w+)\}/g, (_, k) => {
    const v = (input?.[k] ?? '').toString().trim();
    if (v) any = true;
    return v;
  });
  if (!any) return '';
  return out.replace(/\(\s*\)/g, '').replace(/\s*\/\s*(\/\s*)+/g, ' / ').replace(/^[\s/~]+|[\s/~]+$/g, '').replace(/\s{2,}/g, ' ').trim();
}
