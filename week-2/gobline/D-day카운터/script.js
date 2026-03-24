const today = new Date();
today.setHours(0, 0, 0, 0);

let selected = null;
let calYear = today.getFullYear();
let calMonth = today.getMonth() + 1;
let activePanel = null;

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
  activePanel = activePanel === 'year' ? null : 'year';
  if (activePanel === 'year') renderYearPanel();
  updatePanelVisibility();
});

// 월 버튼
monthBtn.addEventListener('click', () => {
  activePanel = activePanel === 'month' ? null : 'month';
  if (activePanel === 'month') renderMonthPanel();
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
      selected &&
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

    calDays.appendChild(dayEl);
  }
}

function renderYearPanel() {
  yearGrid.innerHTML = '';
  const startYear = today.getFullYear() - 10;
  const endYear = today.getFullYear() + 10;

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
  if (!selected) {
    alert('날짜를 선택해주세요.');
    return;
  }

  const target = new Date(selected.year, selected.month - 1, selected.day);
  const diffMs = target - today;
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  const eventName = document.getElementById('event-name').value.trim();
  const ddayMain = document.getElementById('dday-main');
  const ddayLabel = document.getElementById('dday-label');
  const ddayValue = document.getElementById('dday-value');
  const ddayDate = document.getElementById('dday-date');

  ddayMain.className = 'dday-main';

  const weekday = ['일', '월', '화', '수', '목', '금', '토'][target.getDay()];
  const dateStr = `${selected.year}년 ${selected.month}월 ${selected.day}일 (${weekday})`;

  ddayLabel.textContent = eventName || '목표일까지';
  ddayDate.textContent = dateStr;

  if (diffDays === 0) {
    ddayMain.classList.add('today');
    ddayValue.textContent = 'D-Day';
  } else if (diffDays > 0) {
    ddayValue.textContent = `D-${diffDays}`;
  } else {
    ddayMain.classList.add('past');
    ddayValue.textContent = `D+${Math.abs(diffDays)}`;
    ddayLabel.textContent = (eventName || '목표일') + '로부터';
  }

  document.getElementById('total-days').textContent = Math.abs(diffDays).toLocaleString();
  document.getElementById('total-weeks').textContent = Math.floor(Math.abs(diffDays) / 7).toLocaleString();
  document.getElementById('total-months').textContent = (Math.abs(diffDays) / 30.44).toFixed(1);

  resultDiv.hidden = false;
});

// 초기 달력 렌더링
renderCalendar();
