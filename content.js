(() => {
  const DAY_SEQUENCE = (() => {
    const days = [];
    for (let d = 21; d <= 31; d += 1) days.push(d);
    for (let d = 1; d <= 20; d += 1) days.push(d);
    return days;
  })();

  const highlightedDays = new Map();
  let listenersInstalled = false;

  const TURBOLINKS_EVENTS = ['turbolinks:load', 'turbolinks:render', 'page:load', 'page:change'];

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  TURBOLINKS_EVENTS.forEach(evt => {
    document.addEventListener(evt, () => init());
  });

  function init() {
    if (!document.querySelector('.table-head')) {
      waitForTable();
      return;
    }
    if (!init.completedOnce) {
      init.completedOnce = true;
    }
    scheduleRetry.attempts = 0;
    evaluateAllDays();
    installListeners();
  }

  function installListeners() {
    if (listenersInstalled) {
      return;
    }
    listenersInstalled = true;
    const triggerEvaluation = debounce(() => evaluateAllDays(), 150);
    document.addEventListener(
      'change',
      () => {
        // jQuery側のchange処理が走った後に値が確定するよう少し遅らせる
        setTimeout(triggerEvaluation, 10);
      },
      true
    );

  }

  function evaluateAllDays() {
    const context = getDisplayedContext();
    if (!context) {
      return;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() - 1);

    DAY_SEQUENCE.forEach(dayNumber => {
      const dayDate = buildDateForDay(dayNumber, context.year, context.month);
      if (!dayDate || dayDate > cutoff) {
        clearHighlight(dayNumber);
        return;
      }
      const reasons = collectReasons(dayNumber, isRestDay(dayNumber));
      if (reasons.length === 0) {
        clearHighlight(dayNumber);
        return;
      }
      applyHighlight(dayNumber, reasons);
    });
  }

  function collectReasons(dayNumber, isRest) {
    const metrics = collectDayMetrics(dayNumber);
    const reasons = [];
    if (!isRest && !metrics.hasAnyEntry) {
      reasons.push('未入力');
    }
    if (metrics.totalHours > 0 && metrics.totalHours < 8) {
      reasons.push('合計時間が8時間未満');
    }
    if (metrics.regularHours > 8 && metrics.overtimeHours === 0) {
      reasons.push('出勤8時間超で残業が未入力');
    }
    return reasons;
  }

  function collectDayMetrics(dayNumber) {
    const totalHours = getTotalHours(dayNumber);
    const regularHours = sumInputs(buildNameSelector('w', dayNumber));
    const overtimeHours = sumInputs(buildNameSelector('ow', dayNumber));
    const midnightHours = sumInputs(buildNameSelector('nw', dayNumber));
    const holidayHours =
      sumInputs(buildNameSelector('st', dayNumber)) +
      sumInputs(buildNameSelector('rt', dayNumber)) +
      sumInputs(buildNameSelector('pt', dayNumber)) +
      sumInputs(buildNameSelector('at', dayNumber));

    const hasAnyEntry =
      regularHours > 0 ||
      overtimeHours > 0 ||
      midnightHours > 0 ||
      holidayHours > 0;

    return {
      totalHours,
      regularHours,
      overtimeHours,
      hasAnyEntry
    };
  }

  function getTotalHours(dayNumber) {
    const element = document.getElementById(`sum${dayNumber}`);
    if (!element) {
      return 0;
    }
    const raw = element.textContent || '';
    const value = parseFloat(raw.replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(value) ? value : 0;
  }

  function buildNameSelector(prefix, dayNumber) {
    return '[name$="[' + prefix + dayNumber + ']"]';
  }

  function sumInputs(selector) {
    if (!selector) {
      return 0;
    }
    const nodes = document.querySelectorAll(selector);
    if (!nodes.length) {
      return 0;
    }
    let total = 0;
    nodes.forEach(node => {
      const value = parseFloat(node.value);
      if (Number.isFinite(value)) {
        total += value;
      }
    });
    return total;
  }

  function buildDateForDay(dayNumber, displayedYear, displayedMonth) {
    if (!displayedYear || !displayedMonth) {
      return null;
    }
    let year = displayedYear;
    let month = displayedMonth;
    if (dayNumber >= 21) {
      month -= 1;
      if (month === 0) {
        month = 12;
        year -= 1;
      }
    }
    const date = new Date(year, month - 1, dayNumber);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function getDisplayedContext() {
    const year = readInt('#date_page__1i');
    const month = readInt('#date_page__2i');
    if (!year || !month) {
      return null;
    }
    return { year, month };
  }

  function readInt(selector) {
    const el = document.querySelector(selector);
    if (!el) {
      return NaN;
    }
    const value = parseInt(el.value, 10);
    return Number.isFinite(value) ? value : NaN;
  }

  function applyHighlight(dayNumber, reasons) {
    const reasonText = reasons.join('\n');
    const elements = gatherDayElements(dayNumber);
    elements.forEach(el => {
      if (!el) return;
      el.classList.add('daily-check-warning');
      if (el.dataset.originalTitle === undefined) {
        el.dataset.originalTitle = el.getAttribute('title') || '';
      }
      el.setAttribute('title', reasonText);
      el.setAttribute('data-daily-check-reason', reasonText);
    });
    highlightedDays.set(dayNumber, elements);
  }

  function clearHighlight(dayNumber) {
    const elements = highlightedDays.get(dayNumber);
    if (!elements) {
      return;
    }
    elements.forEach(el => {
      if (!el) return;
      el.classList.remove('daily-check-warning');
      if (el.dataset.originalTitle !== undefined) {
        if (el.dataset.originalTitle) {
          el.setAttribute('title', el.dataset.originalTitle);
        } else {
          el.removeAttribute('title');
        }
        delete el.dataset.originalTitle;
      }
      el.removeAttribute('data-daily-check-reason');
    });
    highlightedDays.delete(dayNumber);
  }

  function gatherDayElements(dayNumber) {
    const set = new Set();
    const dayText = String(dayNumber);

    document.querySelectorAll('.table-head th').forEach(th => {
      if (th.textContent && th.textContent.trim() === dayText) {
        set.add(th);
      }
    });

    const sumCell = document.getElementById(`sum${dayNumber}`);
    if (sumCell) set.add(sumCell);

    const contentCell = document.getElementById(`content${dayNumber}`);
    if (contentCell) set.add(contentCell);

    const inputSelectors = [
      buildNameSelector('w', dayNumber),
      buildNameSelector('ow', dayNumber),
      buildNameSelector('nw', dayNumber),
      buildNameSelector('st', dayNumber),
      buildNameSelector('rt', dayNumber),
      buildNameSelector('pt', dayNumber),
      buildNameSelector('at', dayNumber)
    ].filter(Boolean);

    if (inputSelectors.length) {
      document.querySelectorAll(inputSelectors.join(', ')).forEach(input => {
        const cell = input.closest('td');
        if (cell) {
          set.add(cell);
        }
      });
    }

    return set;
  }

  function debounce(fn, wait) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(null, args), wait);
    };
  }

  function scheduleRetry() {
    if (scheduleRetry.attempts && scheduleRetry.attempts > 10) {
      return;
    }
    scheduleRetry.attempts = (scheduleRetry.attempts || 0) + 1;
    setTimeout(() => {
      init();
    }, 200);
  }

  function waitForTable() {
    if (waitForTable.observer) {
      return;
    }
    scheduleRetry();
    const observer = new MutationObserver(() => {
      if (document.querySelector('.table-head')) {
        observer.disconnect();
        waitForTable.observer = null;
        init();
      }
    });
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });
    waitForTable.observer = observer;
  }

  function isRestDay(dayNumber) {
    const dayText = String(dayNumber);
    const headers = Array.from(document.querySelectorAll('.table-head th')).filter(
      th => th.textContent && th.textContent.trim() === dayText
    );
    return headers.some(header => {
      const inlineColor = header.style && header.style.color;
      if (inlineColor && isRedColor(inlineColor)) {
        return true;
      }
      const computed = window.getComputedStyle(header);
      return isRedColor(computed.color);
    });
  }

  function isRedColor(colorString) {
    if (!colorString) return false;
    const normalized = colorString.trim().toLowerCase();
    if (normalized === '#ff0000') {
      return true;
    }
    if (/^rgba?\(/.test(normalized)) {
      return /rgba?\(\s*255\s*,\s*0\s*,\s*0(?:\s*,\s*(?:1|1\.0+|0?\.\d+))?\s*\)/.test(normalized);
    }
    return false;
  }
})();
