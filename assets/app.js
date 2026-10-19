'use strict';

/**
 * مراتب — GitHub Pages-ready static app.
 * Data is fetched from ./data/students.json. The PDF source has 301 rows.
 * No national ID values are shipped. Search uses a one-way digest.
 * Note: hashing does NOT protect against exhaustive guessing on a public static site.
 */
const $ = (selector) => document.querySelector(selector);
const state = { students: [], query: '', nationalSearchHash: null, grade: 'all', sort: 'rank', page: 1, pageSize: 25, filtered: [] };
let searchRevision = 0;
const collator = new Intl.Collator('ar', { sensitivity: 'base', numeric: true });
let toastTimer;

function normalize(text) {
  return String(text ?? '')
    .replace(/[٠-٩]/g, (n) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(n)))
    .replace(/[۰-۹]/g, (n) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(n)))
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[\u200C-\u200F\u202A-\u202E]/g, '')
    .replace(/[ـ.,،؛:()\-/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim().toLowerCase();
}

const escapeHTML = (input) => String(input ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const twoDecimals = (value) => Number(value).toFixed(2);
const gradeClass = (grade) => grade === 'امتياز' ? 'excellent' : grade === 'جيد جداً' ? 'very-good' : 'good';
const getInitials = (name) => String(name).trim().charAt(0) || 'ط';

// The public dataset contains only one-way digests, never plaintext national IDs.
// A full, exact ID can be matched locally; partial numeric lookup is intentionally disabled.
async function hashNationalId(number) {
  const payload = new TextEncoder().encode(`marateb-2025-2026-id-v1:${number}`);
  const bytes = await crypto.subtle.digest('SHA-256', payload);
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function matchQuery(student, input) {
  if (!input.trim()) return true;
  const cleaned = normalize(input);
  if (/^\d+$/.test(cleaned)) {
    return !!state.nationalSearchHash && student.idHash === state.nationalSearchHash;
  }
  const tokens = cleaned.split(' ').filter(Boolean);
  return tokens.every((token) => student._normalizedName.includes(token));
}

async function applySearch(value) {
  const revision = ++searchRevision;
  state.query = value;
  state.nationalSearchHash = null;
  state.page = 1;
  const cleaned = normalize(value);
  // Ignore incomplete numeric input. Lookup is supported only with 10- or 11-digit full IDs.
  if (/^\d{10,11}$/.test(cleaned)) {
    try {
      const digest = await hashNationalId(cleaned);
      if (revision !== searchRevision) return;
      state.nationalSearchHash = digest;
    } catch (error) {
      console.error('ID lookup is unavailable in this browser:', error);
      if (revision !== searchRevision) return;
      showToast('تعذّر التحقق من الرقم في هذا المتصفح');
    }
  }
  if (revision === searchRevision) render();
}

function getSortedFiltered() {
  const found = state.students.filter((student) =>
    (state.grade === 'all' || student.grade === state.grade) && matchQuery(student, state.query)
  );
  if (state.sort === 'lowest') found.sort((a,b) => a.average - b.average || a.originalIndex - b.originalIndex);
  else if (state.sort === 'name') found.sort((a,b) => collator.compare(a.name, b.name) || a.rank - b.rank);
  else if (state.sort === 'original') found.sort((a,b) => a.originalIndex - b.originalIndex);
  else found.sort((a,b) => a.rank - b.rank);
  return found;
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function setupCounts() {
  const all = state.students;
  const counts = { 'امتياز':0, 'جيد جداً':0, 'جيد':0 };
  for (const student of all) counts[student.grade] += 1;
  $('#headerCount').textContent = String(all.length);
  $('#statTotal').textContent = String(all.length);
  const highest = Math.max(...all.map((s) => s.average));
  const avg = all.reduce((sum, s) => sum+s.average, 0) / all.length;
  $('#statHighest').innerHTML = `${twoDecimals(highest)}<span class="stat-percent">%</span>`;
  $('#statAverage').innerHTML = `${twoDecimals(avg)}<span class="stat-percent">%</span>`;
  $('#statExcellent').textContent = counts['امتياز'];
  $('#countAll').textContent = all.length;
  $('#countExcellent').textContent = counts['امتياز'];
  $('#countVeryGood').textContent = counts['جيد جداً'];
  $('#countGood').textContent = counts['جيد'];
}

function renderPodium() {
  $('#podium').innerHTML = state.students.slice(0, 3).map((student, index) => `
    <button class="leader-row ${index === 0 ? 'first' : ''}" type="button" data-rank="${student.rank}" aria-label="تفاصيل ${escapeHTML(student.name)}، المركز ${student.rank}">
      <span class="leader-rank" aria-hidden="true">${index + 1}</span>
      <span class="leader-person"><strong>${escapeHTML(student.name)}</strong><small>المركز ${student.rank} على الدفعة</small></span>
      <span class="leader-score" dir="ltr">${twoDecimals(student.average)} <span>%</span></span>
    </button>
  `).join('');
}

function renderRow(student) {
  const avatarStyle = ['accent-a','accent-b','accent-c'][student.rank % 3];
  return `<tr>
    <td><span class="rank-pill ${student.rank <= 3 ? 'top-rank' : ''}" aria-label="الترتيب ${student.rank}">${student.rank}</span></td>
    <td><div class="name-cell"><div class="student-avatar ${avatarStyle}" aria-hidden="true">${escapeHTML(getInitials(student.name))}</div><div><div class="student-name">${escapeHTML(student.name)}</div><div class="student-sub">التسلسل الأصلي: ${student.originalIndex}</div></div></div></td>
    <td><div class="average-display"><strong>${twoDecimals(student.average)}</strong><span class="average-track" aria-hidden="true"><i style="width:${student.average}%"></i></span></div></td>
    <td><span class="grade-badge ${gradeClass(student.grade)}">${escapeHTML(student.grade)}</span></td>
    <td><button class="details-button" type="button" data-rank="${student.rank}" aria-label="عرض تفاصيل ${escapeHTML(student.name)}">عرض التفاصيل ↗</button></td>
  </tr>`;
}

function render() {
  if (!state.students.length) return;
  state.filtered = getSortedFiltered();
  const total = state.filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
  state.page = Math.min(Math.max(1, state.page), totalPages);
  const startIndex = (state.page-1) * state.pageSize;
  const shown = state.filtered.slice(startIndex, startIndex + state.pageSize);
  const endIndex = startIndex + shown.length;

  $('#studentsBody').innerHTML = shown.map(renderRow).join('');
  $('#tableScroll').hidden = total === 0;
  $('#emptyState').hidden = total !== 0;
  $('#resultSummary').innerHTML = total === state.students.length
    ? `عرض <strong>${startIndex+1}–${endIndex}</strong> من أصل <strong>${total}</strong> طالباً وطالبة`
    : `تم العثور على <strong>${total}</strong> من أصل <strong>${state.students.length}</strong> طالباً وطالبة`;
  $('#pagination').hidden = total === 0;
  $('#pageSummary').textContent = total ? `النتائج ${startIndex+1}–${endIndex} من ${total}` : '';
  $('#pageNumber').textContent = `${state.page} / ${totalPages}`;
  $('#prevPage').disabled = state.page <= 1;
  $('#nextPage').disabled = state.page >= totalPages;
  $('#exportBtn').disabled = total === 0;
  $('#clearSearch').hidden = !state.query;
  for (const button of document.querySelectorAll('.filter-tab')) {
    const active = button.dataset.grade === state.grade;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
}

function openStudent(rank) {
  const student = state.students.find((s) => s.rank === Number(rank));
  if (!student) return;
  $('#dialogAvatar').textContent = getInitials(student.name);
  $('#dialogName').textContent = student.name;
  $('#dialogSubtitle').textContent = `هندسة البرمجيات ونظم المعلومات · 2025–2026`;
  $('#dialogRank').textContent = `#${student.rank}`;
  $('#dialogAverage').textContent = `${twoDecimals(student.average)}%`;
  $('#dialogGrade').textContent = student.grade;
  $('#dialogOriginal').textContent = student.originalIndex;
  $('#dialogPage').textContent = `${student.sourcePage} من 14`;
  $('#copyDetailsBtn').onclick = () => copyText(`الاسم: ${student.name}\nالترتيب: ${student.rank}\nالمعدل: ${twoDecimals(student.average)}\nالتقدير: ${student.grade}\nالتسلسل في المصدر: ${student.originalIndex}`);
  const dialog = $('#studentDialog');
  if (!dialog.open) dialog.showModal();
}

async function copyText(text) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    showToast('تم النسخ بنجاح');
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.cssText = 'position:fixed;opacity:0';
    document.body.append(area);
    area.select();
    const success = document.execCommand('copy');
    area.remove();
    showToast(success ? 'تم النسخ بنجاح' : 'تعذّر النسخ، يرجى المحاولة يدوياً');
  }
}

function exportCSV() {
  if (!state.filtered.length) return;
  const heading = ['الترتيب', 'الاسم الكامل', 'المعدل', 'التقدير', 'التسلسل الأصلي', 'صفحة المصدر'];
  const escapeCSV = (item) => `"${String(item ?? '').replace(/"/g, '""')}"`;
  const rows = state.filtered.map((s) => [s.rank,s.name,twoDecimals(s.average),s.grade,s.originalIndex,s.sourcePage]);
  const content = '\ufeff' + [heading, ...rows].map((row) => row.map(escapeCSV).join(',')).join('\r\n');
  const blob = new Blob([content], { type:'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'graduates-rankings-2025-2026.csv';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast(`تم تجهيز ${state.filtered.length} سجل للتنزيل`);
}

function attachEvents() {
  $('#searchForm').addEventListener('submit', (event) => event.preventDefault());
  $('#searchInput').addEventListener('input', (event) => { void applySearch(event.target.value); });
  $('#clearSearch').addEventListener('click', () => { $('#searchInput').value=''; void applySearch(''); $('#searchInput').focus(); });
  $('#sortSelect').addEventListener('change', (event) => { state.sort=event.target.value; state.page=1; render(); });
  $('#pageSize').addEventListener('change', (event) => { state.pageSize=Number(event.target.value); state.page=1; render(); });
  $('#gradeFilters').addEventListener('click', (event) => {
    const tab = event.target.closest('[data-grade]');
    if (!tab) return;
    state.grade=tab.dataset.grade; state.page=1; render();
  });
  $('#resetFilters').addEventListener('click', () => {
    state.grade='all'; state.sort='rank'; state.page=1;
    $('#searchInput').value=''; $('#sortSelect').value='rank'; void applySearch(''); $('#searchInput').focus();
  });
  $('#prevPage').addEventListener('click', () => { if (state.page>1) { state.page--; render(); $('#students').scrollIntoView({block:'start'}); } });
  $('#nextPage').addEventListener('click', () => { if (state.page*state.pageSize<state.filtered.length) { state.page++; render(); $('#students').scrollIntoView({block:'start'}); } });
  $('#exportBtn').addEventListener('click', exportCSV);
  $('#studentsBody').addEventListener('click', (event) => { const button=event.target.closest('[data-rank]'); if (button) openStudent(button.dataset.rank); });
  $('#podium').addEventListener('click', (event) => { const button=event.target.closest('[data-rank]'); if (button) openStudent(button.dataset.rank); });
  $('#closeDialog').addEventListener('click', () => $('#studentDialog').close());
  $('#studentDialog').addEventListener('click', (event) => { if (event.target === $('#studentDialog')) $('#studentDialog').close(); });
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault(); $('#searchInput').focus(); $('#searchInput').select();
    }
  });
}

async function init() {
  attachEvents();
  try {
    const response = await fetch('./data/students.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const students = await response.json();
    if (!Array.isArray(students) || students.length !== 301) throw new Error('Student dataset failed integrity check');
    students.forEach((student) => {
      if (Object.hasOwn(student, 'nationalId')) throw new Error('Dataset must not contain plaintext national IDs');
      if (student.idHash !== null && !/^[a-f0-9]{64}$/.test(student.idHash)) throw new Error('Invalid ID lookup digest');
      student._normalizedName = normalize(student.name);
      if (!Number.isFinite(student.average)) throw new Error('Invalid average value');
    });
    state.students = students;
    setupCounts();
    renderPodium();
    render();
  } catch (error) {
    console.error('Could not load local data:', error);
    $('#studentsBody').innerHTML = '<tr><td colspan="5" class="loading-cell">تعذّر تحميل البيانات. شغّل الموقع عبر خادم محلي أو GitHub Pages، وتأكد من وجود data/students.json.</td></tr>';
    $('#podium').textContent = 'تعذّر تحميل قائمة المتصدرين';
    $('#resultSummary').textContent = 'تعذّر تحميل بيانات الطلاب';
    $('#pagination').hidden = true;
    $('#exportBtn').disabled = true;
  }
}

document.addEventListener('DOMContentLoaded', init);
