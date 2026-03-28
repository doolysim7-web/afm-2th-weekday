// 한글 색상 이름 → HSL 기준값 매핑
const COLOR_MAP = {
  // 빨강 계열
  '빨강': [0, 80, 50], '빨간색': [0, 80, 50], '레드': [0, 80, 50],
  '진빨강': [0, 90, 35], '다홍': [5, 85, 52], '주홍': [15, 85, 52],
  // 주황 계열
  '주황': [25, 90, 55], '주황색': [25, 90, 55], '오렌지': [25, 90, 55],
  '살구': [30, 80, 70], '살색': [28, 70, 72],
  // 노랑 계열
  '노랑': [50, 95, 55], '노란색': [50, 95, 55], '옐로': [50, 95, 55],
  '황금': [45, 90, 50], '금색': [45, 90, 50], '크림': [55, 70, 85],
  // 연두/초록 계열
  '연두': [80, 70, 55], '연두색': [80, 70, 55],
  '초록': [130, 60, 40], '초록색': [130, 60, 40], '그린': [130, 60, 40],
  '풀색': [120, 55, 38], '올리브': [80, 45, 38],
  '민트': [160, 55, 65], '민트색': [160, 55, 65],
  '에메랄드': [150, 70, 45],
  // 하늘/파랑 계열
  '하늘': [200, 75, 70], '하늘색': [200, 75, 70], '스카이': [200, 75, 70],
  '파랑': [210, 80, 50], '파란색': [210, 80, 50], '블루': [210, 80, 50],
  '코발트': [215, 85, 45], '청색': [210, 75, 42],
  '네이비': [225, 70, 30], '남색': [225, 70, 30],
  '아쿠아': [185, 70, 55], '청록': [180, 65, 40],
  // 보라 계열
  '보라': [270, 65, 55], '보라색': [270, 65, 55], '퍼플': [270, 65, 55],
  '라벤더': [260, 55, 75], '자주': [300, 65, 40], '마젠타': [305, 75, 50],
  '인디고': [240, 65, 45],
  // 분홍 계열
  '분홍': [340, 75, 72], '분홍색': [340, 75, 72], '핑크': [340, 75, 72],
  '연분홍': [345, 65, 82], '핫핑크': [330, 85, 58], '로즈': [350, 70, 60],
  // 갈색 계열
  '갈색': [25, 55, 35], '브라운': [25, 55, 35],
  '베이지': [35, 45, 75], '카키': [70, 35, 45], '카멜': [30, 60, 50],
  '초콜릿': [20, 65, 28],
  // 무채색 계열
  '회색': [0, 0, 60], '회색색': [0, 0, 60], '그레이': [0, 0, 60],
  '검정': [0, 0, 10], '검은색': [0, 0, 10], '블랙': [0, 0, 10],
  '흰색': [0, 0, 95], '하얀색': [0, 0, 95], '화이트': [0, 0, 95],
  '은색': [0, 0, 78], '실버': [0, 0, 78],
};

// 채도 단계 이름
const SHADE_NAMES = ['밝은', '연한', '기본', '진한', '어두운'];

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// 밝기 기반으로 텍스트 색상 결정
function getTextColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.55 ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.9)';
}

// 채도 5단계 생성
function generatePalette(h, s, l) {
  // 밝기를 기준으로 5단계: 매우 밝음 → 매우 어두움
  const lightnesses = [l + 28, l + 14, l, l - 14, l - 28];
  return lightnesses.map(lv => {
    const clampedL = Math.min(95, Math.max(8, lv));
    // 무채색(s가 0에 가까운 경우) 채도 유지
    const adjustedS = s < 5 ? s : Math.min(100, s);
    return hslToHex(h, adjustedS, clampedL);
  });
}

function normalize(input) {
  return input.trim().replace(/\s+/g, '');
}

function findColor(input) {
  const key = normalize(input);
  // 완전 일치
  if (COLOR_MAP[key]) return COLOR_MAP[key];
  // 부분 일치 (입력값이 키에 포함되거나 키가 입력값에 포함)
  for (const [k, v] of Object.entries(COLOR_MAP)) {
    if (k.includes(key) || key.includes(k)) return v;
  }
  return null;
}

function generate(inputText) {
  const text = inputText.trim();
  if (!text) {
    alert('색상 이름을 입력해주세요.');
    return;
  }

  const hsl = findColor(text);
  if (!hsl) {
    alert(`"${text}"은(는) 알 수 없는 색상이에요.\n예: 빨강, 하늘색, 민트, 연두, 보라`);
    return;
  }

  const [h, s, l] = hsl;
  const hexColors = generatePalette(h, s, l);

  const paletteArea = document.getElementById('palette-area');
  const paletteTitle = document.getElementById('palette-title');
  const swatchesEl = document.getElementById('swatches');

  paletteTitle.textContent = `"${text}" 팔레트`;
  swatchesEl.innerHTML = '';

  hexColors.forEach((hex, i) => {
    const swatch = document.createElement('div');
    swatch.className = 'swatch';

    const colorBlock = document.createElement('div');
    colorBlock.className = 'swatch-color';
    colorBlock.style.background = hex;

    const info = document.createElement('div');
    info.className = 'swatch-info';

    const name = document.createElement('div');
    name.className = 'swatch-name';
    name.textContent = SHADE_NAMES[i];

    const label = document.createElement('div');
    label.className = 'swatch-label';
    label.textContent = hex.toUpperCase();

    info.appendChild(name);
    info.appendChild(label);

    // 클릭 시 HEX 복사
    swatch.addEventListener('click', () => {
      navigator.clipboard.writeText(hex.toUpperCase()).then(() => showToast(`${hex.toUpperCase()} 복사됨`));
    });

    swatch.appendChild(colorBlock);
    swatch.appendChild(info);
    swatchesEl.appendChild(swatch);
  });

  paletteArea.hidden = false;
}

// 생성 버튼
document.getElementById('generate-btn').addEventListener('click', () => {
  generate(document.getElementById('color-input').value);
});

// 엔터키
document.getElementById('color-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') generate(e.target.value);
});

// 태그 클릭
document.querySelectorAll('.tag').forEach(tag => {
  tag.addEventListener('click', () => {
    const color = tag.dataset.color;
    document.getElementById('color-input').value = color;
    generate(color);
  });
});

// 토스트
function showToast(msg) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 1800);
}
