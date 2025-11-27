import { lintLiquid, LintError } from './linter';

const input = document.getElementById('liquid-input') as HTMLTextAreaElement;
const parameterSelect = document.getElementById('lookml-parameter') as HTMLSelectElement;
const statusIcon = document.getElementById('status-icon') as HTMLSpanElement;
const statusMessage = document.getElementById('status-message') as HTMLSpanElement;
const errorList = document.getElementById('error-list') as HTMLDivElement;

// Sort options alphabetically
const options = Array.from(parameterSelect.options);
options.sort((a, b) => a.text.localeCompare(b.text));
parameterSelect.innerHTML = '';
options.forEach(opt => parameterSelect.add(opt));

function handleLint() {
  const code = input.value;
  let parameter = parameterSelect.value;

  // Auto-detect parameter if LookML is pasted
  const lines = code.split('\n');
  const detectedParameters: string[] = [];
  const lookmlParams = ['html', 'sql', 'link', 'label', 'view_label', 'group_label', 'action', 'filters', 'default_value', 'description', 'sql_preamble', 'url'];

  for (const line of lines) {
    const match = line.match(/^\s*([a-z_]+)\s*:/);
    if (match) {
      const param = match[1];
      if (lookmlParams.includes(param) && (line.includes('{{') || line.includes('{%'))) {
        detectedParameters.push(param);
      }
    }
  }

  // If exactly one parameter is detected and it's different from current, update dropdown
  // Only if user hasn't manually selected a parameter, or if the input is empty (reset)
  if (code.trim() === '') {
    manualParameterSelection = false;
  }

  if (!manualParameterSelection && detectedParameters.length === 1) {
    const detected = detectedParameters[0];
    let optionValue = detected;
    // Handle grouped options
    if (['sql', 'sql_on', 'sql_table_name'].includes(detected)) optionValue = 'sql';
    if (['label', 'view_label', 'group_label'].includes(detected)) optionValue = 'label';
    if (detected === 'url') optionValue = 'link';

    if (parameterSelect.value !== optionValue && parameterSelect.value === 'auto') {
      // We don't change the dropdown value anymore, just use the detected parameter for linting
      // Wait, actually the requirement was to update the dropdown if it's in auto-mode?
      // "If exactly one parameter is detected and it's different from current, update dropdown"
      // But if we update the dropdown, it's no longer 'auto'.
      // Let's keep it as 'auto' in the dropdown, but lint with the detected parameter.
      // Actually, the user might want to see what was detected.
      // If we change it from 'auto' to 'link', then manualParameterSelection becomes true? No, we didn't set it.
      // Let's stick to the plan: if 'auto' is selected, we use detected. We don't necessarily need to change the dropdown, 
      // but it's nice feedback.
      // If we change it, next time it won't be 'auto'. That's probably not what we want if they paste another block.
      // Better to keep it 'auto' and just lint correctly.
    }
    if (parameterSelect.value === 'auto') {
      parameter = 'auto'; // linter.ts handles 'auto' by using detectedParams
    }
  }

  const result = lintLiquid(code, parameter);

  if (result.status === 'ready') {
    setReady();
  } else if (result.status === 'success') {
    if (code.includes('{{') || code.includes('{%')) {
      setSuccess(result.errors);
    } else {
      setReady(); // Or a new state "No Liquid detected"
    }
  } else if (result.status === 'warning') {
    setWarning(result.errors);
  } else if (result.status === 'error') {
    setError(result.errors[0], result.errors.slice(1));
  }
}

function setReady() {
  statusIcon.className = '';
  statusIcon.style.backgroundColor = '#888';
  statusMessage.textContent = 'Ready';
  errorList.innerHTML = '';
}

function setSuccess(messages: LintError[] = []) {
  statusIcon.className = 'success';
  statusIcon.style.backgroundColor = ''; // use CSS
  statusMessage.textContent = 'Valid Liquid';
  renderMessages(messages);
}

function setWarning(errors: LintError[]) {
  statusIcon.className = 'warning';
  statusIcon.style.backgroundColor = '#ff9800';
  statusMessage.textContent = 'Looker-specific Issues';
  renderMessages(errors);
}

function setError(err: LintError, otherMessages: LintError[] = []) {
  statusIcon.className = 'error';
  statusIcon.style.backgroundColor = ''; // use CSS
  statusMessage.textContent = 'Syntax Error';
  renderMessages([err, ...otherMessages]);
}

function renderMessages(messages: LintError[]) {
  errorList.innerHTML = messages.map(msg => {
    const isSuccess = msg.type === 'Success';
    const isWarning = msg.type === 'Looker-specific';
    const isError = msg.type === 'Syntax';

    let className = 'error-item';
    if (isSuccess) className += ' success';
    if (isWarning) className += ' warning';

    return `
      <div class="${className}">
        <div class="error-line">Line ${msg.line} (${msg.type})</div>
        <div class="error-message">${msg.message}</div>
        ${msg.url ? `<div class="error-doc"><a href="${msg.url}" target="_blank">View Documentation</a></div>` : ''}
      </div>
    `;
  }).join('');
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

const lineNumbers = document.getElementById('line-numbers') as HTMLDivElement;
const highlightLayer = document.getElementById('highlight-layer') as HTMLDivElement;
let manualParameterSelection = false;

function updateLineNumbers() {
  const lines = input.value.split('\n').length;
  lineNumbers.innerHTML = Array(lines).fill(0).map((_, i) => `<div>${i + 1}</div>`).join('');
}

function syncScroll() {
  lineNumbers.scrollTop = input.scrollTop;
  highlightLayer.scrollTop = input.scrollTop;
  highlightLayer.scrollLeft = input.scrollLeft;
}

function escapeHtml(unsafe: string) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function updateHighlights(code: string, parameter: string) {
  const result = lintLiquid(code, parameter);
  let html = '';
  let lastIndex = 0;

  // Sort errors by range start to handle them sequentially
  const sortedErrors = result.errors
    .filter(err => err.range)
    .sort((a, b) => a.range![0] - b.range![0]);

  // Find all Liquid blocks for valid highlighting
  const liquidRegex = /({[{%][\s\S]*?[}%]})/g;
  let liquidMatch;
  const liquidBlocks: [number, number][] = [];
  while ((liquidMatch = liquidRegex.exec(code)) !== null) {
    liquidBlocks.push([liquidMatch.index, liquidMatch.index + liquidMatch[0].length]);
  }

  let currentPos = 0;
  while (currentPos < code.length) {
    // Find next error or liquid block
    const nextError = sortedErrors.find(e => e.range![0] >= currentPos);
    const nextLiquid = liquidBlocks.find(b => b[0] >= currentPos);

    const nextErrorStart = nextError ? nextError.range![0] : Infinity;
    const nextLiquidStart = nextLiquid ? nextLiquid[0] : Infinity;

    if (nextErrorStart === Infinity && nextLiquidStart === Infinity) {
      // No more interesting things, add rest of text
      html += escapeHtml(code.substring(currentPos));
      break;
    }

    if (nextErrorStart <= nextLiquidStart) {
      // Handle error
      const [start, end] = nextError!.range!;
      html += escapeHtml(code.substring(currentPos, start));
      const errorText = code.substring(start, end);
      let className = 'highlight-warning';
      if (nextError!.type === 'Syntax') className = 'highlight-invalid';
      if (nextError!.type === 'Success') className = 'highlight-success';
      html += `<span class="${className}" title="${escapeHtml(nextError!.message)}">${escapeHtml(errorText)}</span>`;
      currentPos = end;
      // Remove handled error
      sortedErrors.shift();
    } else {
      // Handle valid liquid block (or part of it before an error)
      const [start, end] = nextLiquid!;
      html += escapeHtml(code.substring(currentPos, start));
      const blockText = code.substring(start, end);
      const errorsInBlock = sortedErrors.filter(e => e.range![0] >= start && e.range![1] <= end);

      if (errorsInBlock.length > 0) {
        // Handle block with errors
        let blockPos = start;
        for (const err of errorsInBlock) {
          const [errStart, errEnd] = err.range!;
          if (errStart > blockPos) {
            html += `<span class="highlight-valid">${escapeHtml(code.substring(blockPos, errStart))}</span>`;
          }
          let className = 'highlight-warning';
          if (err.type === 'Syntax') className = 'highlight-invalid';
          if (err.type === 'Success') className = 'highlight-success';
          html += `<span class="${className}" title="${escapeHtml(err.message)}">${escapeHtml(code.substring(errStart, errEnd))}</span>`;
          blockPos = errEnd;
          // Remove from sortedErrors
          const errIndex = sortedErrors.indexOf(err);
          if (errIndex > -1) sortedErrors.splice(errIndex, 1);
        }
        if (end > blockPos) {
          html += `<span class="highlight-valid">${escapeHtml(code.substring(blockPos, end))}</span>`;
        }
      } else {
        // Valid block
        html += `<span class="highlight-valid" title="Valid Liquid">${escapeHtml(blockText)}</span>`;
      }
      currentPos = end;
    }
  }
  highlightLayer.innerHTML = html + (code.endsWith('\n') ? ' ' : '');
}

input.addEventListener('input', () => {
  updateLineNumbers();
  debounce(() => {
    handleLint();
    updateHighlights(input.value, parameterSelect.value);
  }, 300)();
});
input.addEventListener('scroll', syncScroll);

// Initial line numbers and highlights
updateLineNumbers();
updateHighlights(input.value, parameterSelect.value);

parameterSelect.addEventListener('change', () => {
  manualParameterSelection = true;
  handleLint();
  updateHighlights(input.value, parameterSelect.value);
});

// Navigation
const openLinterBtn = document.getElementById('open-linter');
const backToSplashBtn = document.getElementById('back-to-splash');
const splashPage = document.getElementById('splash-page');
const linterPage = document.getElementById('linter-page');

function handleRouting() {
  const hash = window.location.hash;
  if (hash === '#/linter') {
    splashPage?.classList.remove('active');
    linterPage?.classList.add('active');
    // Trigger linting and highlighting on load
    handleLint();
    updateHighlights(input.value, parameterSelect.value);
  } else {
    linterPage?.classList.remove('active');
    splashPage?.classList.add('active');
  }
}

window.addEventListener('hashchange', handleRouting);
window.addEventListener('load', handleRouting);

openLinterBtn?.addEventListener('click', () => {
  window.location.hash = '#/linter';
});

backToSplashBtn?.addEventListener('click', () => {
  window.location.hash = '#/';
});
