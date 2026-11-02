import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import { getSetting } from './db.js';
import { PARTS, interpolate, BUILTIN_TEMPLATES } from './templates.js';

const INPUT_KEYS = {
  company: '기업명', ceo: '대표자', biz_no: '사업자등록번호', phone: '휴대전화', biz_phone: '사업장 전화',
  industry: '업종', item: '아이템', open_date: '개업일', session_date: '일자', start_time: '시작시간',
  end_time: '종료시간', place: '장소', method: '진행방법', round: '회차', mentor: '멘토명',
  mentor_org: '소속기관', field: '분야', mentee_position: '멘티 직위', period: '수행기간', gubun: '구분',
  address: '사업장 주소',
};
export { INPUT_KEYS };

// AI 엔진: 설정의 ai_provider ('gemini' | 'anthropic'). 기본은 무료 등급이 있는 Gemini.
export const provider = () => getSetting('ai_provider') || 'gemini';
const keyError = (name) => Object.assign(new Error(`설정 화면에서 ${name} API 키를 먼저 입력해 주세요.`), { status: 400 });

function client() {
  const apiKey = getSetting('anthropic_api_key') || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw keyError('Anthropic');
  return new Anthropic({ apiKey });
}
const model = () => getSetting('model') || 'claude-opus-5-5';

function gemini() {
  const apiKey = getSetting('gemini_api_key') || process.env.GEMINI_API_KEY;
  if (!apiKey) throw keyError('Google Gemini');
  return new GoogleGenAI({ apiKey });
}
const geminiModel = () => getSetting('gemini_model') || 'gemini-flash-latest';
// 짧은 정보 읽기용·과부하 시 대체용 가벼운 모델 (응답이 훨씬 빠름)
const GEMINI_LITE = 'gemini-flash-lite-latest';
const isBusy = (e) => [500, 503].includes(e.status || e.code);

// 이 파일의 내용 블록(Claude 형식)을 Gemini parts로 변환
function toGeminiParts(content) {
  return content.map((b) => {
    if (b.type === 'text') return { text: b.text };
    if ((b.type === 'document' || b.type === 'image') && b.source?.type === 'base64') {
      return { inlineData: { mimeType: b.source.media_type, data: b.source.data } };
    }
    throw new Error(`Gemini로 보낼 수 없는 내용 형식: ${b.type}`);
  });
}

// 구글 서버 과부하(503)·일시 오류(500)는 잠시 기다렸다가 몇 번 다시 시도한다
async function withRetry(fn, tries = 4) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      const s = e.status || e.code;
      if (![500, 503].includes(s) || i >= tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** i)); // 2초, 4초, 8초
    }
  }
}

// Gemini 오류를 사용자가 바로 조치할 수 있는 한글 안내로 바꾼다
function geminiError(e) {
  const s = e.status || e.code;
  const msg = (text, status = 400) => Object.assign(new Error(text), { status });
  if (s === 400 && /API key/i.test(e.message)) return msg('Gemini API 키가 올바르지 않습니다. 설정에서 다시 확인해 주세요.');
  if (s === 402 || /prepayment credits|billing/i.test(e.message)) {
    return msg('이 Gemini 키의 구글 프로젝트는 결제(선불) 프로젝트인데 충전 잔액이 없습니다. 무료로 쓰려면 AI Studio에서 결제가 연결되지 않은 새 프로젝트로 키를 다시 만들거나, 해당 프로젝트에 크레딧을 충전해 주세요.', 402);
  }
  if (s === 429) return msg('Gemini 무료 사용량 한도에 도달했습니다. 잠시 후(또는 내일) 다시 시도해 주세요.', 429);
  if (s === 503 || s === 500) return msg('지금 구글 Gemini 서버에 사용자가 몰려 응답하지 못했습니다(구글 쪽 일시적 문제). 몇 번 자동으로 다시 시도했지만 실패했으니, 1~2분 뒤에 다시 눌러 주세요.', 503);
  if (s === 404) return msg(`Gemini 모델 '${geminiModel()}'을(를) 찾을 수 없습니다. 설정의 모델 이름을 확인해 주세요.`);
  return e;
}

// fast: 명함·문서 정보 읽기처럼 짧은 작업은 처음부터 가벼운 모델 사용
async function geminiCall({ system, content, schema, fast = false }) {
  let res;
  const ai = gemini();
  const parts = toGeminiParts(content);
  const ask = (model, tries) => withRetry(() => ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts }],
    config: {
      systemInstruction: system,
      maxOutputTokens: 32000,
      ...(schema ? { responseMimeType: 'application/json', responseJsonSchema: schema } : {}),
    },
  }), tries);
  try {
    const main = fast ? GEMINI_LITE : geminiModel();
    try {
      res = await ask(main, fast ? 4 : 2);
    } catch (e) {
      // 기본 모델이 붐비면 가벼운 모델로 한 번 더 시도
      if (!isBusy(e) || main === GEMINI_LITE) throw e;
      console.warn(`[gemini] ${main} 과부하 → ${GEMINI_LITE}로 대체`);
      res = await ask(GEMINI_LITE, 3);
    }
  } catch (e) {
    throw geminiError(e);
  }
  const reason = res.candidates?.[0]?.finishReason;
  if (reason === 'MAX_TOKENS') throw new Error('출력이 너무 길어 중단되었습니다. 원자료를 나누어 다시 시도해 주세요.');
  if (reason === 'SAFETY' || reason === 'PROHIBITED_CONTENT' || res.promptFeedback?.blockReason) throw new Error('AI가 이 요청의 처리를 거절했습니다. 원자료 내용을 확인해 주세요.');
  const text = res.text ?? '';
  return schema ? JSON.parse(text) : text.trim();
}

// JSON 스키마 구조화 출력으로 한 번 호출. 긴 출력이므로 스트리밍 후 최종 메시지만 사용.
async function callJson({ system, content, schema, effort = 'high' }) {
  if (provider() === 'gemini') return geminiCall({ system, content, schema, fast: effort === 'low' });
  const stream = client().beta.messages.stream({
    model: model(),
    max_tokens: 32000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system,
    messages: [{ role: 'user', content }],
    output_config: { effort, format: { type: 'json_schema', schema } },
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') throw new Error('AI가 이 요청의 처리를 거절했습니다. 원자료 내용을 확인해 주세요.');
  if (msg.stop_reason === 'max_tokens') throw new Error('출력이 너무 길어 중단되었습니다. 원자료를 나누어 다시 시도해 주세요.');
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return JSON.parse(text);
}

async function callText({ system, content, effort = 'medium' }) {
  if (provider() === 'gemini') return geminiCall({ system, content });
  const stream = client().beta.messages.stream({
    model: model(),
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system,
    messages: [{ role: 'user', content }],
    output_config: { effort },
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') throw new Error('AI가 이 요청의 처리를 거절했습니다.');
  return msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}

const SYSTEM_REPORT = `당신은 중소기업·소상공인·예비창업자 대상 경영컨설턴트의 보고서 작성 보조자입니다.
컨설턴트가 준 기본정보와 원자료(상담 메모, 음성 녹취록, 줌 회의 노트, 첨부 문서)를 바탕으로 기관 제출용 컨설팅 보고서를 작성합니다.

작성 원칙
- 모든 보고서는 기본 3단 구성을 뼈대로 합니다: 1) 기업정보 및 진단 2) 컨설팅 진행내용 3) 실행과제 및 개선방향. 먼저 core에 3단 구성 원고를 쓰고, 이를 해당 기관 양식의 칸(fields)에 맞게 재배치·분량 조정합니다.
- 원자료에 근거한 사실만 씁니다. 수치·고유명사·일정을 지어내지 않습니다. 꼭 필요하지만 원자료에 없는 정보는 "[확인필요: 무엇]"으로 표시합니다.
- 녹취록의 구어체·잡담·반복은 걸러내고, 공공기관 보고서 문체(~함, ~임, ~필요 등 개조식 또는 간결한 서술체)로 씁니다.
- 긴 칸은 "■ 소제목"과 "- 항목" 형태로 구조화하고, 줄바꿈은 \\n을 사용합니다. 마크다운 굵게(**)·표·#은 쓰지 않습니다.
- 칸별 글자수 조건(min/max, 공백 포함)을 반드시 지킵니다.
- info 칸(기본정보)은 제공된 값을 그대로 쓰고, 값이 비어 있으면 원자료에서 찾아 채우며, 없으면 빈 문자열로 둡니다.
- check 칸은 제시된 선택지 중 해당하는 것만 배열로 고릅니다.`;

function fieldSpec(f) {
  const bits = [`- ${f.key} | ${f.label} | ${f.kind === 'info' ? 'info' : f.type || 'longtext'}`];
  if (f.part) bits.push(`3단 구성 ${f.part}(${PARTS[f.part]})에 대응`);
  if (f.hint) bits.push(`안내: ${f.hint}`);
  if (f.min) bits.push(`최소 ${f.min}자`);
  if (f.max) bits.push(`최대 ${f.max}자`);
  if (f.options) bits.push(`선택지: ${f.options.join(', ')}`);
  return bits.join(' | ');
}

function reportSchema(tpl) {
  const props = {};
  for (const f of tpl.fields) {
    props[f.key] = f.type === 'check'
      ? { type: 'array', items: { type: 'string', enum: f.options } }
      : { type: 'string' };
  }
  return {
    type: 'object',
    properties: {
      core: {
        type: 'object',
        properties: { part1: { type: 'string' }, part2: { type: 'string' }, part3: { type: 'string' } },
        required: ['part1', 'part2', 'part3'],
        additionalProperties: false,
      },
      fields: { type: 'object', properties: props, required: tpl.fields.map((f) => f.key), additionalProperties: false },
    },
    required: ['core', 'fields'],
    additionalProperties: false,
  };
}

function sourceBlocks(sources) {
  const blocks = [];
  sources.forEach((s, i) => {
    if (s.type === 'pdf' && s.buf) {
      blocks.push({ type: 'text', text: `<원자료 ${i + 1} 종류="첨부 PDF" 이름="${s.name}">` });
      blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: s.buf.toString('base64') } });
      blocks.push({ type: 'text', text: '</원자료>' });
    } else if (s.text?.trim()) {
      const label = { text: '컨설턴트 메모', zoom: '줌 회의 노트', audio: '음성 녹취록', doc: '첨부 문서' }[s.type] || s.type;
      blocks.push({ type: 'text', text: `<원자료 ${i + 1} 종류="${label}" 이름="${s.name || ''}">\n${s.text.trim()}\n</원자료>` });
    }
  });
  return blocks;
}

export async function generateReport({ tpl, input, sources }) {
  const infoVals = {};
  for (const f of tpl.fields) if (f.kind === 'info') infoVals[f.key] = interpolate(f.from, input);

  const inputLines = Object.entries(INPUT_KEYS)
    .filter(([k]) => input?.[k])
    .map(([k, label]) => `- ${label}: ${input[k]}`)
    .join('\n');
  const srcBlocks = sourceBlocks(sources);
  if (!srcBlocks.length && !input?.notes) throw Object.assign(new Error('원자료(메모·녹취·노트·첨부)를 하나 이상 넣어 주세요.'), { status: 400 });

  const content = [
    { type: 'text', text: `# 기관 양식\n이름: ${tpl.name} (${tpl.org})\n설명: ${tpl.description}\n양식 작성 지침: ${tpl.guide || '없음'}\n\n# 양식 칸 목록 (key | 칸 이름 | 형식 | 조건)\n${tpl.fields.map(fieldSpec).join('\n')}\n\n# info 칸에 미리 채워진 값\n${JSON.stringify(infoVals, null, 1)}\n\n# 기본정보\n${inputLines || '(없음)'}` },
    ...srcBlocks,
    { type: 'text', text: `${input?.notes ? `# 컨설턴트 추가 지시\n${input.notes}\n\n` : ''}위 자료로 core(3단 구성 원고)와 fields(양식 칸별 내용)를 작성하세요.` },
  ];
  const out = await callJson({ system: SYSTEM_REPORT, content, schema: reportSchema(tpl) });
  // 기본정보로 확정된 info 값은 AI 결과보다 우선
  for (const [k, v] of Object.entries(infoVals)) if (v) out.fields[k] = v;
  return out;
}

export async function rewriteField({ tpl, field, current, instruction, core, sources }) {
  const f = tpl.fields.find((x) => x.key === field);
  if (!f) throw new Error('알 수 없는 칸입니다.');
  const content = [
    { type: 'text', text: `양식: ${tpl.name}\n칸: ${fieldSpec(f)}\n\n# 3단 구성 원고\n1) ${core?.part1 || ''}\n2) ${core?.part2 || ''}\n3) ${core?.part3 || ''}` },
    ...sourceBlocks(sources || []),
    { type: 'text', text: `# 현재 내용\n${current || '(비어 있음)'}\n\n# 요청\n${instruction || '더 완성도 있게 다시 써 주세요.'}\n\n수정된 칸 내용만 출력하세요. 설명이나 머리말 없이 본문만.` },
  ];
  return callText({ system: SYSTEM_REPORT, content });
}

// 새 기관 양식(HWP/DOCX/PDF 등)을 분석해 양식 정의(JSON)를 만든다
const NULLABLE_STR = { type: 'string' };
const TEMPLATE_SCHEMA = {
  type: 'object',
  properties: {
    name: NULLABLE_STR, org: NULLABLE_STR, description: NULLABLE_STR, guide: NULLABLE_STR,
    fields: { type: 'array', items: {
      type: 'object',
      properties: {
        key: NULLABLE_STR, label: NULLABLE_STR,
        kind: { type: 'string', enum: ['info', 'content'] },
        type: { type: 'string', enum: ['text', 'longtext', 'check'] },
        part: { type: 'integer', enum: [0, 1, 2, 3] },
        from: NULLABLE_STR, hint: NULLABLE_STR,
        min: { type: 'integer' }, max: { type: 'integer' },
        options: { type: 'array', items: { type: 'string' } },
      },
      required: ['key', 'label', 'kind', 'type', 'part', 'from', 'hint', 'min', 'max', 'options'],
      additionalProperties: false,
    } },
    layout: { type: 'array', items: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['title', 'note', 'heading', 'table', 'block', 'signature', 'photos'] },
        text: NULLABLE_STR, field: NULLABLE_STR, to: NULLABLE_STR, sign: NULLABLE_STR,
        rows: { type: 'array', items: { type: 'array', items: {
          type: 'object',
          properties: { label: NULLABLE_STR, field: NULLABLE_STR, span: { type: 'integer' } },
          required: ['label', 'field', 'span'], additionalProperties: false,
        } } },
        labels: { type: 'array', items: { type: 'string' } },
      },
      required: ['type', 'text', 'field', 'to', 'sign', 'rows', 'labels'],
      additionalProperties: false,
    } },
  },
  required: ['name', 'org', 'description', 'guide', 'fields', 'layout'],
  additionalProperties: false,
};

function cleanTemplate(t) {
  const strip = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v !== 0 && !(Array.isArray(v) && !v.length)));
  return {
    ...t,
    fields: t.fields.map((f) => ({ ...strip(f), kind: f.kind })),
    layout: t.layout.map((b) => {
      const c = strip(b);
      if (c.rows) c.rows = c.rows.map((r) => r.map((cell) => {
        const x = strip(cell);
        if (x.span === 1) delete x.span;
        return x;
      }));
      return c;
    }),
  };
}

export async function analyzeTemplate({ text, pdfBuf, fileName }) {
  const example = BUILTIN_TEMPLATES.find((t) => t.id === 'gangnam_hub');
  const content = [
    { type: 'text', text: `아래는 한 기관의 컨설팅(멘토링) 보고서 빈 양식입니다. 파일명: ${fileName}\n이 양식을 앱에서 쓸 양식 정의 JSON으로 바꿔 주세요.

규칙
- fields: 양식의 모든 입력 칸. key는 영문 snake_case.
  · 기업명·대표자·일자·시간·장소·멘토명처럼 기본정보로 채우는 칸은 kind=info, from에 치환 규칙을 씁니다. 쓸 수 있는 기본정보 키: ${Object.entries(INPUT_KEYS).map(([k, v]) => `${k}(${v})`).join(', ')}. 예: "{session_date} {start_time}~{end_time}"
  · 서술형 본문 칸은 kind=content, type=longtext, part에 기본 3단 구성(1 기업정보 및 진단, 2 컨설팅 진행내용, 3 실행과제 및 개선방향) 중 가장 가까운 번호를 넣습니다.
  · 체크박스(☐) 칸은 type=check, options에 선택지를 넣습니다.
  · 양식에 "1,000자 이상" 같은 분량 조건이 있으면 min/max에 넣습니다. 해당 없으면 0.
- layout: 양식의 배치를 위에서 아래로. 표는 type=table, rows의 각 칸은 label(제목 칸) 또는 field(입력 칸 key) 중 하나만 채우고 span은 가로 병합 칸 수(기본 1).
  서명·확인 문구는 type=signature(text=확인 문구, sign=서명줄, to=수신처), 사진 칸은 type=photos(labels).
- guide: 이 양식을 채울 때 AI가 지켜야 할 작성 지침 한두 문장.
- 쓰지 않는 문자열 속성은 "", 정수는 0, 배열은 []로 둡니다.

참고 예시(다른 기관 양식을 변환한 결과):
${JSON.stringify(example)}` },
  ];
  if (pdfBuf) content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBuf.toString('base64') } });
  else content.push({ type: 'text', text: `<양식 원문>\n${text}\n</양식 원문>` });
  const t = await callJson({ system: '당신은 한국 공공기관 보고서 양식을 구조화하는 도우미입니다.', content, schema: TEMPLATE_SCHEMA, effort: 'high' });
  return cleanTemplate(t);
}

// 명함·사업자등록증·각종 문서(신청서, 사업계획서, 엑셀 명단, 기존 보고서 등)에서 보고서 기본정보 추출
const INFO_FIELDS = {
  company: '상호·회사명(법인명)', ceo: '대표자 성명(명함은 명함 주인 이름)', mentee_position: '대표자·상담자의 직위',
  biz_no: '사업자등록번호(000-00-00000)', phone: '휴대전화', biz_phone: '사무실·대표 전화',
  industry: '업태와 종목을 "업태 / 종목"으로(없으면 업종)', item: '주력 아이템·제품·서비스', open_date: '개업일 YYYY-MM-DD',
  address: '사업장 소재지', session_date: '상담·멘토링 일자 YYYY-MM-DD', start_time: '시작 시각 HH:MM(24시간)', end_time: '종료 시각 HH:MM(24시간)',
  place: '상담 장소', method: '진행방법(대면/비대면/전화 등)', round: '멘토링 회차(숫자만)', period: '수행기간(예: 2026.10.01 ~ 2026.11.30)',
  field: '상담·멘토링 분야', gubun: '상담 구분(예: 예비창업자 정부지원사업 컨설팅)',
};
const INFO_SCHEMA = {
  type: 'object',
  properties: {
    doc_type: { type: 'string', enum: ['명함', '사업자등록증', '신청서·참가서', '사업계획서', '보고서·일지', '명단·표', '기타'] },
    ...Object.fromEntries(Object.keys(INFO_FIELDS).map((k) => [k, { type: 'string' }])),
  },
  required: ['doc_type', ...Object.keys(INFO_FIELDS)],
  additionalProperties: false,
};
// type: 'pdf' | 'png' | 'jpg' (파일을 그대로 보냄) | 'text' (서버에서 뽑은 글자)
export async function extractBasicInfo({ buf, type, kind, text, fileName = '' }) {
  let block;
  if (type === 'text') block = { type: 'text', text: `<문서 이름="${fileName}">\n${text.slice(0, 60000)}\n</문서>` };
  else {
    const data = buf.toString('base64');
    block = type === 'pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
      : { type: 'image', source: { type: 'base64', media_type: type === 'png' ? 'image/png' : 'image/jpeg', data } };
  }
  const what = { card: '명함', bizreg: '사업자등록증' }[kind] || '컨설팅 대상 기업과 관련된 문서';
  return callJson({
    system: '당신은 한국 기업 문서에서 컨설팅 보고서의 기본정보를 정확히 옮겨 적는 도우미입니다. 문서에 적힌 내용만 옮기고 추측하지 않습니다.',
    content: [block, { type: 'text', text: `위는 ${what}입니다. 컨설팅을 받는 기업(멘티)의 정보를 아래 항목에 채우세요. 문서에 없는 항목은 빈 문자열로 둡니다.
컨설턴트(멘토) 본인의 이름·연락처는 채우지 마세요. 여러 기업이 나오면 첫 번째 기업만 씁니다.
${Object.entries(INFO_FIELDS).map(([k, v]) => `- ${k}: ${v}`).join('\n')}` }],
    schema: INFO_SCHEMA,
    effort: 'low',
  });
}

// 음성 → 텍스트. Claude는 오디오 입력을 받지 않으므로 OpenAI 호환 전사 API를 사용한다.
// 음성인식 키가 없고 Gemini 키가 있으면 Gemini로 받아쓴다.
const AUDIO_MIME = { mp3: 'audio/mpeg', mpga: 'audio/mpeg', mpeg: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'audio/mp4', wav: 'audio/wav', webm: 'audio/webm', ogg: 'audio/ogg', flac: 'audio/flac', aac: 'audio/aac' };
export const sttLimitMb = () => (getSetting('stt_api_key') ? 25 : 200);

async function geminiTranscribe(buf, name) {
  const ai = gemini();
  const mimeType = AUDIO_MIME[name.split('.').pop().toLowerCase()] || 'audio/mpeg';
  // 요청 한 번에 20MB까지 직접 보낼 수 있고, 그보다 크면 Files API로 먼저 올린다
  try {
    let audio;
    if (buf.length < 18 * 1024 * 1024) {
      audio = { inlineData: { mimeType, data: buf.toString('base64') } };
    } else {
      const f = await ai.files.upload({ file: new Blob([buf], { type: mimeType }), config: { mimeType } });
      audio = { fileData: { fileUri: f.uri, mimeType: f.mimeType || mimeType } };
    }
    const ask = (model, tries) => withRetry(() => ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [audio, { text: '이 녹음은 경영컨설팅 상담 내용입니다. 들리는 말을 한국어로 빠짐없이 받아쓰세요. 화자가 바뀌면 줄을 바꾸고 "화자1:", "화자2:"처럼 표시하세요. 요약하거나 설명을 덧붙이지 말고 받아쓴 내용만 출력하세요.' }] }],
      config: { maxOutputTokens: 65000 },
    }), tries);
    let res;
    try { res = await ask(geminiModel(), 2); } catch (e) {
      if (!isBusy(e)) throw e;
      res = await ask(GEMINI_LITE, 3);
    }
    return (res.text ?? '').trim();
  } catch (e) {
    throw geminiError(e);
  }
}

export async function transcribe(buf, name, mime) {
  const key = getSetting('stt_api_key');
  if (!key && (getSetting('gemini_api_key') || process.env.GEMINI_API_KEY)) return geminiTranscribe(buf, name);
  if (!key) throw Object.assign(new Error('음성 변환을 쓰려면 설정 화면에서 Google Gemini API 키(무료)나 음성인식(STT) API 키를 입력해 주세요. 또는 클로바노트 등의 녹취록 텍스트를 붙여넣어도 됩니다.'), { status: 400 });
  const base = getSetting('stt_base_url') || 'https://api.openai.com/v1';
  const form = new FormData();
  form.append('file', new Blob([buf], { type: mime || 'application/octet-stream' }), name);
  form.append('model', getSetting('stt_model') || 'whisper-1');
  form.append('language', 'ko');
  const res = await fetch(`${base.replace(/\/$/, '')}/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form });
  if (!res.ok) throw new Error(`음성 변환 실패 (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).text;
}
