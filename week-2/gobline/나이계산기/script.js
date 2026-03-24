const today = new Date();
today.setHours(0, 0, 0, 0);

// 선택된 날짜 상태 (초기값: 오늘)
let selected = { year: today.getFullYear(), month: today.getMonth() + 1, day: today.getDate() };
let calYear = today.getFullYear();
let calMonth = today.getMonth() + 1;
let activePanel = null; // 'year' | 'month' | null

// 요소
const dateBtn = document.getElementById('date-btn');
const dateDisplay = document.getElementById('date-display');
const calendarPopup = document.getElementById('calendar-popup');
const prevMonthBtn = document.getElementById('prev-month');
const nextMonthBtn = document.getElementById('next-month');
const yearBtn = document.getElementById('year-btn');
const monthBtn = document.getElementById('month-btn');
const yearPanel = document.getElementById('year-panel');
const monthPanel = document.getElementById('month-panel');
const dayPanel = document.getElementById('day-panel');
const yearGrid = document.getElementById('year-grid');
const monthGrid = document.getElementById('month-grid');
const calDays = document.getElementById('cal-days');
const calculateBtn = document.getElementById('calculate-btn');
const resultDiv = document.getElementById('result');

// 달력 열기/닫기
dateBtn.addEventListener('click', () => {
  const isHidden = calendarPopup.hidden;
  calendarPopup.hidden = !isHidden;
  if (!isHidden) return;
  activePanel = null;
  renderCalendar();
});

// 이전/다음 달
prevMonthBtn.addEventListener('click', () => {
  calMonth--;
  if (calMonth < 1) { calMonth = 12; calYear--; }
  renderCalendar();
});

nextMonthBtn.addEventListener('click', () => {
  calMonth++;
  if (calMonth > 12) { calMonth = 1; calYear++; }
  renderCalendar();
});

// 연도 버튼
yearBtn.addEventListener('click', () => {
  if (activePanel === 'year') {
    activePanel = null;
  } else {
    activePanel = 'year';
    renderYearPanel();
  }
  updatePanelVisibility();
});

// 월 버튼
monthBtn.addEventListener('click', () => {
  if (activePanel === 'month') {
    activePanel = null;
  } else {
    activePanel = 'month';
    renderMonthPanel();
  }
  updatePanelVisibility();
});

function updatePanelVisibility() {
  yearPanel.hidden = activePanel !== 'year';
  monthPanel.hidden = activePanel !== 'month';
  dayPanel.hidden = activePanel !== null;
}

function renderCalendar() {
  yearBtn.textContent = calYear;
  monthBtn.textContent = calMonth;
  updatePanelVisibility();
  renderDays();
}

function renderDays() {
  calDays.innerHTML = '';

  const firstDay = new Date(calYear, calMonth - 1, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth, 0).getDate();

  // 빈 칸 채우기
  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement('div');
    empty.className = 'day empty';
    calDays.appendChild(empty);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dayEl = document.createElement('div');
    dayEl.className = 'day';
    dayEl.textContent = d;

    const thisDate = new Date(calYear, calMonth - 1, d);
    const dow = thisDate.getDay();

    // 미래 날짜 비활성화
    if (thisDate > today) {
      dayEl.classList.add('disabled');
    } else {
      if (dow === 0) dayEl.classList.add('sunday');
      if (dow === 6) dayEl.classList.add('saturday');

      // 오늘 표시
      if (
        calYear === today.getFullYear() &&
        calMonth === today.getMonth() + 1 &&
        d === today.getDate()
      ) {
        dayEl.classList.add('today');
      }

      // 선택된 날짜 표시
      if (
        selected.year === calYear &&
        selected.month === calMonth &&
        selected.day === d
      ) {
        dayEl.classList.add('selected');
      }

      dayEl.addEventListener('click', () => {
        selected = { year: calYear, month: calMonth, day: d };
        updateDateBtn();
        calendarPopup.hidden = true;
        activePanel = null;
      });
    }

    calDays.appendChild(dayEl);
  }
}

function renderYearPanel() {
  yearGrid.innerHTML = '';
  const startYear = 1900;
  const endYear = today.getFullYear();

  for (let y = endYear; y >= startYear; y--) {
    const item = document.createElement('div');
    item.className = 'panel-item';
    item.textContent = y;
    if (y === calYear) item.classList.add('selected');

    item.addEventListener('click', () => {
      calYear = y;
      activePanel = null;
      renderCalendar();
    });

    yearGrid.appendChild(item);
  }

  // 현재 연도로 스크롤
  const selectedItem = yearGrid.querySelector('.selected');
  if (selectedItem) {
    setTimeout(() => selectedItem.scrollIntoView({ block: 'center' }), 0);
  }
}

function renderMonthPanel() {
  monthGrid.innerHTML = '';
  for (let m = 1; m <= 12; m++) {
    const item = document.createElement('div');
    item.className = 'panel-item';
    item.textContent = m + '월';
    if (m === calMonth) item.classList.add('selected');

    item.addEventListener('click', () => {
      calMonth = m;
      activePanel = null;
      renderCalendar();
    });

    monthGrid.appendChild(item);
  }
}

function updateDateBtn() {
  const { year, month, day } = selected;
  dateDisplay.textContent = `${year}년 ${month}월 ${day}일`;
  dateBtn.classList.add('selected');
}

// 계산하기
calculateBtn.addEventListener('click', () => {
  if (!dateBtn.classList.contains('selected')) {
    alert('날짜를 선택해주세요.');
    return;
  }

  const birth = new Date(selected.year, selected.month - 1, selected.day);

  const manAge = calculateManAge(birth);
  const yeonAge = today.getFullYear() - birth.getFullYear();
  const seAge = today.getFullYear() - birth.getFullYear() + 1;

  document.getElementById('age-man').textContent = manAge;
  document.getElementById('age-yeon').textContent = yeonAge;
  document.getElementById('age-se').textContent = seAge;

  const nextBirthday = getNextBirthday(birth);
  const daysUntil = getDaysUntil(nextBirthday);
  const desc = document.getElementById('age-man-desc');

  if (daysUntil === 0) {
    desc.textContent = '오늘이 생일이에요! 🎉';
  } else {
    desc.textContent = `다음 생일까지 ${daysUntil}일 남았어요`;
  }

  resultDiv.hidden = false;
});

function calculateManAge(birth) {
  let age = today.getFullYear() - birth.getFullYear();
  const birthdayPassed =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
  if (!birthdayPassed) age--;
  return age;
}

function getNextBirthday(birth) {
  const next = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());
  if (next < today) next.setFullYear(today.getFullYear() + 1);
  return next;
}

function getDaysUntil(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return Math.round((d - today) / (1000 * 60 * 60 * 24));
}

// 초기 달력 렌더링 (버튼 텍스트 설정)
updateDateBtn();
