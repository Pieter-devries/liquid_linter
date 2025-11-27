import { lintLiquid, LintError } from './linter';

const input = document.getElementById('liquid-input') as HTMLTextAreaElement;
const parameterSelect = document.getElementById('lookml-parameter') as HTMLSelectElement;
const statusIcon = document.getElementById('status-icon') as HTMLSpanElement;
const statusMessage = document.getElementById('status-message') as HTMLSpanElement;
const errorList = document.getElementById('error-list') as HTMLDivElement;

function handleLint() {
  const code = input.value;
  const parameter = parameterSelect.value;
  const result = lintLiquid(code, parameter);

  if (result.status === 'ready') {
    setReady();
  } else if (result.status === 'success') {
    setSuccess();
  } else if (result.status === 'warning') {
    setWarning(result.errors);
  } else if (result.status === 'error') {
    setError(result.errors[0]);
  }
}

function setReady() {
  statusIcon.className = '';
  statusIcon.style.backgroundColor = '#888';
  statusMessage.textContent = 'Ready';
  errorList.innerHTML = '';
}

function setSuccess() {
  statusIcon.className = 'success';
  statusIcon.style.backgroundColor = ''; // use CSS
  statusMessage.textContent = 'Valid Liquid';
  errorList.innerHTML = '';
}

function setWarning(errors: LintError[]) {
  statusIcon.className = 'warning';
  statusIcon.style.backgroundColor = '#ff9800';
  statusMessage.textContent = 'Looker-specific Issues';

  errorList.innerHTML = errors.map(err => `
    <div class="error-item warning">
      <div class="error-line">Line ${err.line} (${err.type})</div>
      <div class="error-message">${err.message}</div>
      ${err.url ? `<div class="error-doc"><a href="${err.url}" target="_blank">View Documentation</a></div>` : ''}
    </div>
  `).join('');
}

function setError(err: LintError) {
  statusIcon.className = 'error';
  statusIcon.style.backgroundColor = ''; // use CSS
  statusMessage.textContent = 'Syntax Error';

  errorList.innerHTML = `
    <div class="error-item">
      <div class="error-line">Line ${err.line} (${err.type})</div>
      <div class="error-message">${err.message}</div>
      ${err.url ? `<div class="error-doc"><a href="${err.url}" target="_blank">View Documentation</a></div>` : ''}
    </div>
  `;
}

function debounce(func: Function, wait: number) {
  let timeout: any;
  return function executedFunction(...args: any[]) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

input.addEventListener('input', debounce(handleLint, 300));
parameterSelect.addEventListener('change', handleLint);
