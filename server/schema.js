// 관리 테이블 정의 — 서버(DB 생성·CRUD 검증)와 화면(목록·입력폼)이 함께 사용한다.
// type: text | longtext | date | number | money | select | url | secret
export const CATEGORIES = ['컨설팅', '강의', '심사', '기타'];
export const CERT_CATEGORIES = ['경영·컨설팅', '창업·사업화', '마케팅·디지털', 'AI·IT', '교육·강의', '기타'];

export const TABLES = {
  activities: {
    label: '업무 이력',
    desc: '컨설팅·강의·심사·기타 수행 실적',
    icon: 'briefcase',
    order: 'start_date DESC',
    columns: [
      { key: 'category', label: '구분', type: 'select', options: CATEGORIES, list: true, required: true },
      { key: 'start_date', label: '시작일', type: 'date', list: true },
      { key: 'end_date', label: '종료일', type: 'date' },
      { key: 'org', label: '기관/고객사', type: 'text', list: true, required: true },
      { key: 'title', label: '업무 내용', type: 'text', list: true, required: true },
      { key: 'count', label: '건수/업체수', type: 'number', list: true },
      { key: 'hours', label: '시간(H)', type: 'number', list: true },
      { key: 'status', label: '진행상태', type: 'select', options: ['예정', '진행중', '완료'], list: true },
      { key: 'note', label: '비고', type: 'longtext' },
    ],
  },
  revenues: {
    label: '매출',
    desc: '업무별 매출·정산 현황 (실수령 = 원천징수 3.3% 공제 후)',
    icon: 'wallet',
    order: 'date DESC',
    columns: [
      { key: 'date', label: '일자', type: 'date', list: true, required: true },
      { key: 'category', label: '구분', type: 'select', options: CATEGORIES, list: true, required: true },
      { key: 'org', label: '기관', type: 'text', list: true, required: true },
      { key: 'title', label: '프로젝트명', type: 'text', list: true },
      { key: 'amount', label: '금액(원)', type: 'money', list: true, required: true },
      { key: 'net_amount', label: '실수령(원)', type: 'money', list: true },
      { key: 'settle_status', label: '정산상태', type: 'select', options: ['예정', '청구', '정산완료'], list: true },
      { key: 'note', label: '비고', type: 'longtext' },
    ],
  },
  trainings: {
    label: '교육 이력',
    desc: '수강한 교육과정 (온라인·오프라인)',
    icon: 'graduation',
    order: 'date DESC',
    columns: [
      { key: 'date', label: '수강일자', type: 'date', list: true },
      { key: 'mode', label: '구분', type: 'select', options: ['온라인', '오프라인', '혼합'], list: true, required: true },
      { key: 'org', label: '교육기관', type: 'text', list: true },
      { key: 'title', label: '과정명', type: 'text', list: true, required: true },
      { key: 'hours', label: '교육시간(H)', type: 'number', list: true },
      { key: 'url', label: '학습사이트', type: 'url' },
      { key: 'login_id', label: '아이디', type: 'text' },
      { key: 'login_pw', label: '비밀번호', type: 'secret' },
      { key: 'cert_status', label: '수료증', type: 'select', options: ['미발급', '발급완료', '해당없음'], list: true },
      { key: 'note', label: '비고', type: 'longtext' },
    ],
  },
  certificates: {
    label: '자격증',
    desc: '보유 자격증 및 갱신 일정',
    icon: 'award',
    order: 'acquired_date DESC',
    columns: [
      { key: 'category', label: '카테고리', type: 'select', options: CERT_CATEGORIES, list: true, required: true },
      { key: 'name', label: '자격증명', type: 'text', list: true, required: true },
      { key: 'issuer', label: '발급기관', type: 'text', list: true },
      { key: 'cert_no', label: '자격번호', type: 'text', list: true },
      { key: 'acquired_date', label: '취득일', type: 'date', list: true },
      { key: 'expiry_date', label: '만료/갱신일', type: 'date', list: true },
      { key: 'status', label: '상태', type: 'select', options: ['유효', '갱신필요', '만료', '취득준비'], list: true },
      { key: 'note', label: '비고', type: 'longtext' },
    ],
  },
  notices: {
    label: '공고',
    desc: '모집·지원사업 공고 정리 및 지원 결과',
    icon: 'megaphone',
    order: 'deadline ASC',
    columns: [
      { key: 'category', label: '분야', type: 'select', options: CATEGORIES, list: true },
      { key: 'org', label: '기관', type: 'text', list: true, required: true },
      { key: 'title', label: '공고명', type: 'text', list: true, required: true },
      { key: 'posted_date', label: '공고일', type: 'date' },
      { key: 'deadline', label: '마감일', type: 'date', list: true },
      { key: 'status', label: '상태', type: 'select', options: ['관심', '지원예정', '지원완료', '선정', '탈락', '마감'], list: true },
      { key: 'url', label: '공고 URL', type: 'url' },
      { key: 'note', label: '요건·메모', type: 'longtext' },
    ],
  },
  accounts: {
    label: '가입 사이트',
    desc: '정부포털·교육·평가 플랫폼 계정',
    icon: 'key',
    order: 'category, site',
    columns: [
      { key: 'category', label: '분류', type: 'select', options: ['정부/공공', '교육', '평가/심사', '컨설팅', '업무도구', '기타'], list: true },
      { key: 'site', label: '사이트명', type: 'text', list: true, required: true },
      { key: 'url', label: 'URL', type: 'url', list: true },
      { key: 'login_id', label: '아이디', type: 'text', list: true },
      { key: 'login_pw', label: '비밀번호', type: 'secret', list: true },
      { key: 'updated_date', label: '등록/수정일', type: 'date', list: true },
      { key: 'note', label: '메모', type: 'longtext' },
    ],
  },
};

export function sqlType(col) {
  return col.type === 'number' || col.type === 'money' ? 'REAL' : 'TEXT';
}
