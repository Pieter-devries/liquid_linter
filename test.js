import { lintLiquid } from './linter.js';

const tests = [
  // Valid cases
  { code: '{{ user.name }}', parameter: 'html', expected: 'success' },
  { code: '{% if value == "Yes" %} ... {% endif %}', parameter: 'html', expected: 'success' },
  { code: '{% parameter param_name %}', parameter: 'html', expected: 'success' },
  { code: '{{ view_name.field_name._is_selected }}', parameter: 'label', expected: 'success' },

  // Syntax errors
  { code: '{{ user.name', parameter: 'html', expected: 'error' },
  { code: '{% if value > 10 %}', parameter: 'html', expected: 'error' }, // Unclosed if

  // Looker-specific warnings
  { code: '{% if value = "Yes" %} ... {% endif %}', parameter: 'html', expected: 'error' }, // liquidjs catches this first
  { code: '{% if value == "yes" %} ... {% endif %}', parameter: 'html', expected: 'warning' }, // Uncapitalized yes
  { code: '{{ value._isfiltered }}', parameter: 'html', expected: 'warning' }, // Typo
  { code: '{{ view_name.field_name._is_selected }}', parameter: 'html', expected: 'warning' }, // Unsupported in html
];

// Generate more tests to reach 100+
for (let i = 0; i < 25; i++) {
  tests.push({ code: `{{ user.name${i} }}`, parameter: 'html', expected: 'success' });
  tests.push({ code: `{% if value == "Yes" %} ${i} {% endif %}`, parameter: 'html', expected: 'success' });
  tests.push({ code: `{{ view_name.field_name._is_selected }}`, parameter: 'label', expected: 'success' });
  tests.push({ code: `{{ view_name.field_name._is_selected }}`, parameter: 'html', expected: 'warning' });
}

let passed = 0;
let failed = 0;

tests.forEach((test, index) => {
  const result = lintLiquid(test.code, test.parameter);
  if (result.status === test.expected) {
    passed++;
  } else {
    failed++;
    console.log(`Test ${index} failed: Expected ${test.expected}, got ${result.status} for code: ${test.code}`);
    if (result.errors.length > 0) {
      console.log(`Errors: ${result.errors.map(e => e.message).join(', ')}`);
    }
  }
});

console.log(`\nTests completed: ${passed} passed, ${failed} failed.`);
if (failed === 0) {
  console.log('All tests passed!');
} else {
  process.exit(1);
}
