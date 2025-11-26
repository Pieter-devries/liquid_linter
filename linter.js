import { Liquid } from 'liquidjs';

const engine = new Liquid();

// Register Looker-specific tags
engine.registerTag('parameter', {
  parse: function (token) { this.args = token.args; },
  render: function (ctx, hash) { return `[parameter: ${this.args}]`; }
});
engine.registerTag('condition', {
  parse: function (token) { this.args = token.args; },
  render: function (ctx, hash) { return `[condition: ${this.args}]`; }
});
engine.registerTag('endcondition', {
  parse: function () { },
  render: function () { return ''; }
});
engine.registerTag('date_start', {
  parse: function (token) { this.args = token.args; },
  render: function (ctx, hash) { return `[date_start: ${this.args}]`; }
});
engine.registerTag('date_end', {
  parse: function (token) { this.args = token.args; },
  render: function (ctx, hash) { return `[date_end: ${this.args}]`; }
});

const supportMap = {
  'html': ['value', 'rendered_value', 'filterable_value', 'link', 'linked_value', '_filters', '_user_attributes', '_localization', '_model', '_view', '_explore', '_explore._dashboard_url', '_field', '_query', '_parameter_value'],
  'sql': ['link', 'date_start', 'date_end', 'condition', '_parameter_value', '_user_attributes', '_model', '_view', '_explore', '_explore._dashboard_url', '_field', '_query', '_in_query', '_is_selected', '_is_filtered'],
  'link': ['value', 'rendered_value', 'filterable_value', 'link', 'linked_value', '_filters', '_user_attributes', '_model', '_view', '_explore', '_explore._dashboard_url', '_field', '_query', '_in_query', '_is_selected', '_is_filtered', '_parameter_value'],
  'label': ['_filters', '_user_attributes', '_model', '_view', '_explore', '_field', '_query', '_in_query', '_is_selected', '_is_filtered', '_parameter_value'],
  'action': ['value', 'rendered_value', 'filterable_value', 'link', '_filters', '_user_attributes', '_model', '_view', '_explore', '_field', '_query'],
  'filters': ['_user_attributes', '_localization'],
  'default_value': ['_user_attributes', '_localization'],
  'description': ['_filters', '_user_attributes', '_model', '_view', '_explore', '_field', '_query', '_in_query', '_is_selected', '_is_filtered', '_parameter_value']
};

export function lintLiquid(code, parameter) {
  if (!code || !code.trim()) {
    return { status: 'ready', errors: [] };
  }

  try {
    engine.parse(code);
    const customErrors = runCustomChecks(code, parameter);
    if (customErrors.length > 0) {
      return { status: 'warning', errors: customErrors };
    } else {
      return { status: 'success', errors: [] };
    }
  } catch (err) {
    return { status: 'error', errors: [formatError(err)] };
  }
}

function runCustomChecks(code, parameter) {
  const errors = [];

  // Single equals
  const singleEqualsRegex = /{%-?\s*(?:if|elsif)\s+[^%]*?[^=!<>]=\s*[^%=!<>]+?\s*-?%}/g;
  let match;
  while ((match = singleEqualsRegex.exec(code)) !== null) {
    errors.push({ type: 'Looker-specific', message: 'Use double equals `==` for comparison, not single equals `=`', line: getLineNumber(code, match.index) });
  }

  // Nested tags
  const nestedTagsRegex = /{%-?\s*[^%]*?{{[^%]*?}}-?\s*[^%]*?-?%}/g;
  while ((match = nestedTagsRegex.exec(code)) !== null) {
    errors.push({ type: 'Looker-specific', message: 'Do not nest Liquid tags. Use variables directly within tags.', line: getLineNumber(code, match.index) });
  }

  // Incorrect tag syntax
  const incorrectTagRegex = /{{\s*(?:if|elsif|else|endif|for|endfor|case|when|endcase|assign|capture|endcapture|increment|decrement|cycle|tablerow|endtablerow|include|layout|paginate|endpaginate|raw|endraw|comment|endcomment|unless|endunless)\s+[^}]*?}}/g;
  while ((match = incorrectTagRegex.exec(code)) !== null) {
    errors.push({ type: 'Looker-specific', message: 'Use tag syntax `{% ... %}` for control flow, not output syntax `{{ ... }}`', line: getLineNumber(code, match.index) });
  }

  // Yes/No capitalization
  const yesNoRegex = /{%-?\s*(?:if|elsif)\s+[^%]*?==\s*["'](?:yes|no)["']\s*-?%}/g;
  while ((match = yesNoRegex.exec(code)) !== null) {
    errors.push({ type: 'Looker-specific', message: 'Capitalize "Yes" and "No" when comparing with yesno fields.', line: getLineNumber(code, match.index) });
  }

  // Parameter validation
  validateParameterUsage(code, parameter, errors);

  // Variable typos
  const allowedVariables = [
    '_value', '_rendered_value', '_linked_value', '_parameter_value',
    '_is_selected', '_is_filtered', '_in_query', '_filters', '_user_attributes',
    '_localization', '_model', '_view', '_explore', '_field', '_query'
  ];
  const variableRegex = /({{|{%)[^%}]*?(\.\s*|\s+)(_[a-zA-Z0-9_]+)/g;
  while ((match = variableRegex.exec(code)) !== null) {
    const varName = match[3];
    if (varName.startsWith('_') && !allowedVariables.includes(varName)) {
      let suggestion = '';
      if (varName === '_isfiltered') suggestion = 'Did you mean `_is_filtered`?';
      else if (varName === '_inquery') suggestion = 'Did you mean `_in_query`?';
      else if (varName === '_renderedvalue') suggestion = 'Did you mean `_rendered_value`?';
      else if (varName === '_linkedvalue') suggestion = 'Did you mean `_linked_value`?';

      errors.push({ type: 'Looker-specific', message: `Potentially incorrect Looker variable: \`${varName}\`. ${suggestion}`, line: getLineNumber(code, match.index) });
    }
  }

  return errors;
}

function validateParameterUsage(code, parameter, errors) {
  const supported = supportMap[parameter] || [];
  if (!supported.length && parameter) return; // If parameter is unknown, skip validation

  const variableRegex = /({{|{%)[^%}]*?(\.\s*|\s+)(_[a-zA-Z0-9_]+)/g;
  let match;
  while ((match = variableRegex.exec(code)) !== null) {
    const varName = match[3];
    if (varName.startsWith('_') && !supported.includes(varName)) {
      if (varName === '_filters' || varName === '_user_attributes' || varName === '_localization') continue;
      if (!supported.includes(varName)) {
        errors.push({ type: 'Looker-specific', message: `Variable \`${varName}\` is not supported in the \`${parameter}\` parameter.`, line: getLineNumber(code, match.index) });
      }
    }
  }

  const standardVars = ['value', 'rendered_value', 'filterable_value', 'link', 'linked_value'];
  standardVars.forEach(varName => {
    const regex = new RegExp(`({{|{%)[^%}]*?\\b${varName}\\b`, 'g');
    let varMatch;
    while ((varMatch = regex.exec(code)) !== null) {
      if (!supported.includes(varName)) {
        errors.push({ type: 'Looker-specific', message: `Variable \`${varName}\` is not supported in the \`${parameter}\` parameter.`, line: getLineNumber(code, varMatch.index) });
      }
    }
  });
}

function getLineNumber(code, index) {
  return code.substring(0, index).split('\n').length;
}

function formatError(err) {
  let message = err.message;
  let line = err.line || 'unknown';
  if (message.includes('not closed')) {
    const tagMatch = message.match(/tag (.*) not closed/);
    if (tagMatch) {
      const tagName = tagMatch[1].split(/\s+/)[1];
      message = `Tag \`${tagName}\` is not closed. Did you forget \`{% end${tagName} %}\`?`;
    }
  }
  return { type: 'Syntax', message, line };
}
