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

const supportMap: Record<string, string[]> = {
  'html': ['value', 'row', 'rendered_value', 'filterable_value', 'link', 'linked_value', '_filters', '_user_attributes', '_model', '_view', '_explore', '_explore._dashboard_url', '_field', '_query', '_parameter_value', 'parameter'],
  'sql': ['link', 'date_start', 'date_end', 'condition', '_parameter_value', '_user_attributes', '_model', '_view', '_explore', '_explore._dashboard_url', '_field', '_query', '_in_query', '_is_selected', '_is_filtered', 'parameter'],
  'link': ['value', 'row', 'rendered_value', 'filterable_value', 'link', 'linked_value', '_filters', '_user_attributes', '_model', '_view', '_explore', '_explore._dashboard_url', '_field', '_query', '_in_query', '_is_selected', '_is_filtered', '_parameter_value', 'parameter'],
  'label': ['row', '_filters', '_user_attributes', '_model', '_view', '_explore', '_field', '_query', '_in_query', '_is_selected', '_is_filtered', '_parameter_value', 'parameter'],
  'action': ['value', 'rendered_value', 'filterable_value', 'link', 'linked_value', '_filters', '_user_attributes', '_model', '_view', '_explore', '_field', '_query'],
  'filters': ['_user_attributes', '_localization'],
  'default_value': ['_user_attributes', '_localization'],
  'description': ['_filters', '_user_attributes', '_model', '_view', '_explore', '_field', '_query', '_in_query', '_is_selected', '_is_filtered', '_parameter_value', 'parameter'],
  'sql_preamble': ['_user_attributes', '_model', '_view', '_explore', '_explore._dashboard_url', '_field', '_query', '_in_query', '_is_selected', '_is_filtered', 'parameter']
};

const allowedFilters = [
  'abs', 'append', 'at_least', 'at_most', 'capitalize', 'ceil', 'compact', 'concat', 'date', 'default', 'divided_by', 'downcase', 'escape', 'escape_once', 'first', 'floor', 'join', 'last', 'lstrip', 'map', 'minus', 'modulo', 'newline_to_br', 'plus', 'prepend', 'remove', 'remove_first', 'replace', 'replace_first', 'reverse', 'round', 'rstrip', 'size', 'slice', 'sort', 'sort_natural', 'split', 'strip', 'strip_html', 'strip_newlines', 'times', 'truncate', 'truncatewords', 'uniq', 'upcase', 'url_decode', 'url_encode', 'where', 'encode_uri'
];

export interface LintError {
  type: string;
  message: string;
  line: number | string;
  url?: string;
  range?: [number, number]; // Start and end index in the original text
}

export interface LintResult {
  status: 'ready' | 'success' | 'warning' | 'error';
  errors: LintError[];
}

export function lintLiquid(code: string, parameter: string): LintResult {
  if (!code || !code.trim()) {
    return { status: 'ready', errors: [] };
  }

  if (!code.includes('{{') && !code.includes('{%')) {
    return {
      status: 'warning',
      errors: [{
        type: 'Looker-specific',
        message: 'Add Brackets, {{ }} or {% %} to validate your liquid',
        line: 1,
        url: 'https://shopify.github.io/liquid/basics/introduction/'
      }]
    };
  }

  // Multi-parameter validation
  const lookmlParams = ['html', 'sql', 'sql_on', 'sql_table_name', 'link', 'label', 'view_label', 'group_label', 'action', 'filters', 'default_value', 'description', 'sql_preamble'];
  const detectedParams: { param: string, content: string, lineOffset: number, charOffset: number }[] = [];
  let allErrors: LintError[] = [];

  const lines = code.split('\n');
  let currentParam: string | null = null;
  let currentContent: string[] = [];
  let currentLineOffset = 0;
  let currentCharacterOffset = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Improved regex to handle nested parameters or parameters with indentation
    const match = line.match(/^\s*([a-z_]+)\s*:\s*(.*)/);

    if (match) {
      const paramName = match[1];
      const paramContent = match[2];

      // Check if we are inside a link parameter
      if (currentParam === 'link' && (paramName === 'url' || paramName === 'label')) {
        // This is a nested parameter within link. 
        // For now, we treat url and label within link as supported if they contain Liquid.
        // We don't change currentParam to 'url' because 'url' is not a top-level LookML parameter we track, 
        // but we want to lint its content.
        // Actually, 'label' is a top-level parameter too, but here it's inside 'link'.
        // The best approach is to lint this line specifically.
        if (paramContent.includes('{{') || paramContent.includes('{%')) {
          const result = lintLiquid(paramContent, paramName === 'url' ? 'link' : 'label');
          const adjustedErrors = result.errors.map(err => ({
            ...err,
            line: i + 1 // Line numbers are 1-based
          }));
          allErrors = allErrors.concat(adjustedErrors);
        }
        currentContent.push(line); // Add to parent content too
        continue;
      }

      if (lookmlParams.includes(paramName)) {
        // If we were already tracking a parameter, save it
        if (currentParam) {
          detectedParams.push({ param: currentParam, content: currentContent.join('\n'), lineOffset: currentLineOffset, charOffset: currentCharacterOffset });
        }
        // Start new parameter
        currentParam = paramName;
        // Map grouped parameters
        if (['sql', 'sql_on', 'sql_table_name'].includes(currentParam)) currentParam = 'sql';
        if (['label', 'view_label', 'group_label'].includes(currentParam)) currentParam = 'label';

        currentContent = [paramContent]; // Start with content after colon
        currentLineOffset = i;
        // Calculate character offset for this parameter's content
        // It's the sum of lengths of all previous lines plus newline characters
        let charOffset = 0;
        for (let j = 0; j < i; j++) {
          charOffset += lines[j].length + 1; // +1 for newline
        }
        // Add indentation and parameter name length and colon and space
        const paramStartMatch = line.match(/^(\s*[a-z_]+\s*:\s*)/);
        if (paramStartMatch) {
          charOffset += paramStartMatch[1].length;
        }
        currentCharacterOffset = charOffset;
      } else if (currentParam) {
        // If it's not a recognized top-level parameter but we are inside one, it might be part of the content (though usually it's nested LookML)
        // For now, continue adding to current content unless it looks like a new unrelated parameter
        currentContent.push(line);
      }
    } else if (currentParam) {
      // Continue current parameter
      currentContent.push(line);
      // Check for end of parameter (simplified: look for ;; or next parameter which is handled by match above)
      if (line.includes(';;')) {
        detectedParams.push({ param: currentParam, content: currentContent.join('\n'), lineOffset: currentLineOffset, charOffset: currentCharacterOffset });
        currentParam = null;
        currentContent = [];
      }
    }
  }
  // Catch last parameter if any
  if (currentParam) {
    detectedParams.push({ param: currentParam, content: currentContent.join('\n'), lineOffset: currentLineOffset, charOffset: currentCharacterOffset });
  }

  if (parameter === 'auto' && detectedParams.length > 0) {
    // Multi-parameter mode
    let allErrors: LintError[] = [];
    for (const { param, content, lineOffset, charOffset } of detectedParams) {
      // Only lint if content contains Liquid
      if (content.includes('{{') || content.includes('{%')) {
        const result = lintLiquid(content, param);
        // Adjust line numbers and ranges
        const adjustedErrors = result.errors.map(err => ({
          ...err,
          line: typeof err.line === 'number' ? err.line + lineOffset : err.line,
          range: err.range ? [err.range[0] + charOffset, err.range[1] + charOffset] as [number, number] : undefined
        }));
        allErrors = allErrors.concat(adjustedErrors);
      }
    }
    // Check for date_start/date_end pairs across all parameters if needed, 
    // but usually they are within the same SQL block. For now, we rely on individual linting.

    if (allErrors.length > 0) {
      const hasRealErrors = allErrors.some(e => e.type !== 'Success');
      if (hasRealErrors) {
        return { status: 'warning', errors: allErrors };
      }
      return { status: 'success', errors: allErrors };
    }
    return { status: 'success', errors: [] };
  } else if (parameter === 'auto' && detectedParams.length === 0) {
    // If auto is selected but no parameters detected, try to lint as 'html' or 'sql' as fallback?
    // For now, treat as single parameter with default 'html' or just lint as is.
    // Given the current logic, it falls through to single parameter validation.
  }

  // Fallback to single parameter validation (original logic)
  // Pre-process code to handle Looker-specific filter syntax like |filter(args)
  // Convert to standard Liquid | filter: args
  const preProcessedCode = code.replace(/\|(\s*[a-zA-Z0-9_]+\s*)\(([^|}]*)\)/g, '| $1: $2');

  const customErrors = runCustomChecks(preProcessedCode, parameter);
  try {
    engine.parse(preProcessedCode);
    if (customErrors.length > 0) {
      const hasRealErrors = customErrors.some(e => e.type !== 'Success');
      if (hasRealErrors) {
        return { status: 'warning', errors: customErrors };
      }
      return { status: 'success', errors: customErrors };
    }
    return { status: 'success', errors: [] };
  } catch (err: any) {
    if (customErrors.length > 0) {
      return { status: 'warning', errors: customErrors };
    }
    return {
      status: 'error',
      errors: [{
        type: 'Syntax',
        message: err.message,
        line: err.line || 1,
        url: 'https://shopify.github.io/liquid/basics/introduction/'
      }]
    };
  }
}

function runCustomChecks(code: string, parameter: string): LintError[] {
  const errors: LintError[] = [];

  // Single equals
  const singleEqualsRegex = /{%-?\s*(?:if|elsif)\s+[^%]*?[^=!<>]=\s*[^%=!<>]+?\s*-?%}/g;
  let match;
  while ((match = singleEqualsRegex.exec(code)) !== null) {
    errors.push({
      type: 'Looker-specific',
      message: 'Use double equals `==` for comparison, not single equals `=`',
      line: getLineNumber(code, match.index),
      url: 'https://cloud.google.com/looker/docs/liquid-variable-reference#using_liquid_in_lookml',
      range: [match.index, match.index + match[0].length]
    });
  }

  // Nested tags
  const nestedTagsRegex = /{%-?\s*[^%]*?{{[^%]*?}}-?\s*[^%]*?-?%}/g;
  while ((match = nestedTagsRegex.exec(code)) !== null) {
    errors.push({
      type: 'Looker-specific',
      message: 'Do not nest Liquid tags. Use variables directly within tags.',
      line: getLineNumber(code, match.index),
      url: 'https://cloud.google.com/looker/docs/liquid-variable-reference#nested_tags',
      range: [match.index, match.index + match[0].length]
    });
  }

  // Incorrect tag syntax
  const incorrectTagRegex = /{{\s*(?:if|elsif|else|endif|for|endfor|case|when|endcase|assign|capture|endcapture|increment|decrement|cycle|tablerow|endtablerow|include|layout|paginate|endpaginate|raw|endraw|comment|endcomment|unless|endunless)\s+[^}]*?}}/g;
  while ((match = incorrectTagRegex.exec(code)) !== null) {
    errors.push({
      type: 'Looker-specific',
      message: 'Use tag syntax `{% ... %}` for control flow, not output syntax `{{ ... }}`',
      line: getLineNumber(code, match.index),
      url: 'https://shopify.github.io/liquid/tags/control-flow/',
      range: [match.index, match.index + match[0].length]
    });
  }

  // Yes/No capitalization
  const yesNoRegex = /{%-?\s*(?:if|elsif)\s+[^%]*?==\s*["'](?:yes|no)["']\s*-?%}/g;
  while ((match = yesNoRegex.exec(code)) !== null) {
    errors.push({
      type: 'Looker-specific',
      message: 'Capitalize "Yes" and "No" when comparing with yesno fields.',
      line: getLineNumber(code, match.index),
      url: 'https://cloud.google.com/looker/docs/liquid-variable-reference#using_liquid_with_yesno_fields',
      range: [match.index, match.index + match[0].length]
    });
  }

  // Empty conditions or trailing operators
  const emptyConditionRegex = /{%-?\s*(?:if|elsif)\s*(?:-?%}|(?:[^%]*?(?:[><!=]=?|and|or)\s*-?%}))/g;
  while ((match = emptyConditionRegex.exec(code)) !== null) {
    errors.push({
      type: 'Looker-specific',
      message: 'Empty condition or trailing operator in `if` or `elsif` tag.',
      line: getLineNumber(code, match.index),
      url: 'https://shopify.github.io/liquid/tags/control-flow/',
      range: [match.index, match.index + match[0].length]
    });
  }

  // Parameter validation
  validateParameterUsage(code, parameter, errors);

  // Variable typos
  const allowedVariables = [
    '_value', '_rendered_value', '_linked_value', '_parameter_value',
    '_is_selected', '_is_filtered', '_in_query', '_filters', '_user_attributes',
    '_localization', '_model', '_view', '_explore', '_field', '_query'
  ];
  const variableRegex = /(?<!\.)\b(_[a-zA-Z0-9_]+)\b/g;
  while ((match = variableRegex.exec(code)) !== null) {
    const varName = match[1];
    if (varName.startsWith('_') && !allowedVariables.includes(varName)) {
      let suggestion = '';
      if (varName === '_isfiltered') suggestion = 'Did you mean `_is_filtered`?';
      else if (varName === '_inquery') suggestion = 'Did you mean `_in_query`?';
      else if (varName === '_renderedvalue') suggestion = 'Did you mean `_rendered_value`?';
      else if (varName === '_linkedvalue') suggestion = 'Did you mean `_linked_value`?';
      errors.push({
        type: 'Looker-specific',
        message: `Possible typo: \`${varName}\`. ${suggestion}`,
        line: getLineNumber(code, match.index),
        url: 'https://cloud.google.com/looker/docs/liquid-variable-reference',
        range: [match.index, match.index + match[0].length]
      });
    }
  }

  // Check for date_start/date_end pairs
  const dateStartRegex = /{%-?\s*date_start\s+([a-zA-Z0-9_.]+)\s*-?%}/g;
  const dateEndRegex = /{%-?\s*date_end\s+([a-zA-Z0-9_.]+)\s*-?%}/g;
  const starts = new Set<string>();
  const ends = new Set<string>();
  let dateMatch;
  while ((dateMatch = dateStartRegex.exec(code)) !== null) {
    starts.add(dateMatch[1]);
  }
  while ((dateMatch = dateEndRegex.exec(code)) !== null) {
    ends.add(dateMatch[1]);
  }

  for (const filter of starts) {
    if (!ends.has(filter)) {
      errors.push({
        type: 'Looker-specific',
        message: `Found \`date_start\` for filter \`${filter}\` but missing \`date_end\`.`,
        line: 1, // Simplified line number for now
        url: 'https://cloud.google.com/looker/docs/liquid-variable-reference#usage_of_date_start_and_date_end'
      });
    }
  }
  for (const filter of ends) {
    if (!starts.has(filter)) {
      errors.push({
        type: 'Looker-specific',
        message: `Found \`date_end\` for filter \`${filter}\` but missing \`date_start\`.`,
        line: 1, // Simplified line number for now
        url: 'https://cloud.google.com/looker/docs/liquid-variable-reference#usage_of_date_start_and_date_end'
      });
    }
  }

  return errors;
}

function validateParameterUsage(code: string, parameter: string, errors: LintError[]): void {
  const supported = supportMap[parameter] || [];
  if (!supported.length && parameter) return;

  const validTagRegex = /{{[\s\S]*?}}|{%[\s\S]*?%}/g;
  let validMatch;
  const processedRanges: [number, number][] = [];
  while ((validMatch = validTagRegex.exec(code)) !== null) {
    processedRanges.push([validMatch.index, validMatch.index + validMatch[0].length]);
    const content = validMatch[0].substring(2, validMatch[0].length - 2); // Remove {{ or {% and }} or %}
    const isTag = validMatch[0].startsWith('{%');

    if (isTag) {
      const tagMatch = content.trim().match(/^(\w+)/);
      if (tagMatch) {
        const tagName = tagMatch[1];
        if ((tagName === 'date_start' || tagName === 'date_end' || tagName === 'condition' || tagName === 'endcondition' || tagName === 'parameter') && !supported.includes(tagName)) {
          // Special case for endcondition, it's allowed if condition is allowed
          if (tagName === 'endcondition' && supported.includes('condition')) {
            // Allowed
          } else {
            errors.push({
              type: 'Looker-specific',
              message: `Tag \`${tagName}\` is not supported in the \`${parameter}\` parameter.`,
              line: getLineNumber(code, validMatch.index),
              url: 'https://cloud.google.com/looker/docs/liquid-variable-reference',
              range: [validMatch.index, validMatch.index + validMatch[0].length]
            });
          }
        }
      }
    }

    // Regex to find variables starting with '_' or standard variables like 'value', 'row'
    // It looks for a word boundary or non-alphanumeric char before the variable name
    const varRegex = /(?:\b|[^a-zA-Z0-9_])(_[a-zA-Z0-9_]+|\bvalue\b|\brow\b|\brendered_value\b|\bfilterable_value\b|\blink\b|\blinked_value\b)/g;

    // Create a version of content without string literals to avoid false positives
    const contentWithoutStrings = content.replace(/'[^']*'|"[^"]*"/g, (match) => ' '.repeat(match.length));

    let varMatch;
    while ((varMatch = varRegex.exec(contentWithoutStrings)) !== null) {
      const fullMatch = varMatch[0];
      const varName = varMatch[1];

      // Check if it's a property access (e.g., `field._value`)
      const isPropertyAccess = fullMatch.trim().startsWith('.');

      if (isPropertyAccess) {
        const allowedProperties = ['_value', '_rendered_value', '_linked_value', '_label', '_series', '_group_label', '_link', '_parameter_value', '_name', '_dashboard_url', '_query_timezone', '_is_selected', '_in_query', '_is_filtered'];
        const varStart = validMatch.index + 2 + varMatch.index + varMatch[0].indexOf(varName);
        const varEnd = varStart + varName.length;

        if (varName.startsWith('_') && !allowedProperties.includes(varName)) {
          errors.push({
            type: 'Looker-specific',
            message: `Property \`${varName}\` is not a valid field property.`,
            line: getLineNumber(code, validMatch.index), // Line number of the tag start
            url: 'https://cloud.google.com/looker/docs/liquid-variable-reference#accessing_variables_from_other_fields',
            range: [varStart, varEnd]
          });
        } else if ((varName === '_parameter_value' || varName === '_is_selected' || varName === '_in_query' || varName === '_is_filtered' || (varName === '_dashboard_url' && parameter === 'action')) && !supported.includes(varName)) {
          errors.push({
            type: 'Looker-specific',
            message: `Variable \`${varName}\` is not supported in the \`${parameter}\` parameter.`,
            line: getLineNumber(code, validMatch.index),
            url: 'https://cloud.google.com/looker/docs/liquid-variable-reference',
            range: [varStart, varEnd]
          });
        } else if (parameter === 'default_value' || parameter === 'filters') {
          // In default_value and filters, field references are not allowed.
          // If we see a property access to a standard field property, it's invalid.
          const fieldProperties = ['_value', '_rendered_value', '_linked_value', '_label', '_series', '_group_label', '_link', '_parameter_value', '_name', '_is_selected', '_in_query', '_is_filtered'];
          if (fieldProperties.includes(varName)) {
            errors.push({
              type: 'Looker-specific',
              message: `Field references are not supported in the \`${parameter}\` parameter.`,
              line: getLineNumber(code, validMatch.index),
              url: 'https://cloud.google.com/looker/docs/liquid-variable-reference',
              range: [varStart, varEnd]
            });
          }
        } else if (varName.startsWith('_')) {
          errors.push({
            type: 'Success',
            message: `Property \`${varName}\` is acceptable to use in the \`${parameter}\` parameter.`,
            line: getLineNumber(code, validMatch.index),
            url: 'https://cloud.google.com/looker/docs/liquid-variable-reference#accessing_variables_from_other_fields',
            range: [varStart, varEnd]
          });
        }
      } else {
        // Check for general variable support
        const varStart = validMatch.index + 2 + varMatch.index + varMatch[0].indexOf(varName);
        const varEnd = varStart + varName.length;

        if (varName.startsWith('_') && !supported.includes(varName)) {
          let suggestion = '';
          if (varName === '_isfiltered') suggestion = 'Did you mean `_is_filtered`?';
          else if (varName === '_inquery') suggestion = 'Did you mean `_in_query`?';
          else if (varName === '_renderedvalue') suggestion = 'Did you mean `_rendered_value`?';
          else if (varName === '_linkedvalue') suggestion = 'Did you mean `_linked_value`?';
          else if (varName === '_param_value') suggestion = 'Did you mean `_parameter_value`?';

          errors.push({
            type: 'Looker-specific',
            message: `Variable \`${varName}\` is not supported in the \`${parameter}\` parameter. ${suggestion}`,
            line: getLineNumber(code, validMatch.index), // Line number of the tag start
            url: 'https://cloud.google.com/looker/docs/liquid-variable-reference',
            range: [varStart, varEnd]
          });
        } else if (varName.startsWith('_') && supported.includes(varName)) {
          errors.push({
            type: 'Success',
            message: `Variable \`${varName}\` is acceptable to use in the \`${parameter}\` parameter.`,
            line: getLineNumber(code, validMatch.index),
            url: 'https://cloud.google.com/looker/docs/liquid-variable-reference',
            range: [varStart, varEnd]
          });
        } else if (!varName.startsWith('_') && !supported.includes(varName)) {
          // For standard variables like 'value', 'link', etc.
          errors.push({
            type: 'Looker-specific',
            message: `Variable \`${varName}\` is not supported in the \`${parameter}\` parameter.`,
            line: getLineNumber(code, validMatch.index),
            url: 'https://cloud.google.com/looker/docs/liquid-variable-reference',
            range: [varStart, varEnd]
          });
        } else if (!varName.startsWith('_') && supported.includes(varName)) {
          errors.push({
            type: 'Success',
            message: `Variable \`${varName}\` is acceptable to use in the \`${parameter}\` parameter.`,
            line: getLineNumber(code, validMatch.index),
            url: 'https://cloud.google.com/looker/docs/liquid-variable-reference',
            range: [varStart, varEnd]
          });
        }
      }
    }

    // Validate filters
    const filterRegex = /\|\s*([a-zA-Z0-9_]+)/g;
    let filterMatch;
    while ((filterMatch = filterRegex.exec(content)) !== null) {
      const filterName = filterMatch[1];
      if (!allowedFilters.includes(filterName)) {
        errors.push({
          type: 'Looker-specific',
          message: `Filter \`${filterName}\` is not a standard Liquid filter.`,
          line: getLineNumber(code, validMatch.index),
          url: 'https://shopify.dev/docs/api/liquid/filters',
          range: [validMatch.index + filterMatch.index, validMatch.index + filterMatch.index + filterMatch[0].length]
        });
      }
    }
  }

  // Check for suspicious single braces containing Looker variables
  // This regex looks for a single brace block containing a word that starts with '_'
  // Improved regex to avoid matching valid LookML braces or Liquid tag openings
  // Look for a single { followed by a Looker variable start, but not followed by % or {
  const singleBraceRegex = /(?<!\{)\{([ \t]*[_a-zA-Z][a-zA-Z0-9_.]*)/g;
  let match;
  while ((match = singleBraceRegex.exec(code)) !== null) {
    const fullMatch = match[0];
    const content = match[1];

    // If it's followed by a newline or significant whitespace before other content, it might be a LookML block, so skip
    if (content.includes('\n') || content.trim() === '') {
      continue;
    }

    // Check if it's likely a variable usage missing a brace
    if (content.trim().startsWith('_') || ['value', 'rendered_value', 'filterable_value', 'link', 'linked_value'].some(v => content.trim().startsWith(v))) {
      errors.push({
        type: 'Looker-specific',
        message: `Suspicious single brace usage: \`${fullMatch}\`. Did you mean to use double braces \`{{ ... }}\`?`,
        line: getLineNumber(code, match.index),
        url: 'https://cloud.google.com/looker/docs/liquid-variable-reference',
        range: [match.index, match.index + match[0].length]
      });
    }
  }
}

function getLineNumber(code: string, index: number): number {
  return code.substring(0, index).split('\n').length;
}

function formatError(err: any): LintError {
  let message = err.message;
  let line = err.line || 'unknown';
  let url = 'https://shopify.github.io/liquid/';

  if (message.includes('not closed')) {
    const tagMatch = message.match(/tag (.*) not closed/);
    if (tagMatch) {
      const tagName = tagMatch[1].split(/\s+/)[1];
      message = `Tag \`${tagName}\` is not closed. Did you forget \`{% end${tagName} %}\`?`;
      url = 'https://shopify.github.io/liquid/tags/control-flow/';
    }
  } else if (message.includes('invalid value expression')) {
    url = 'https://shopify.github.io/liquid/tags/control-flow/#elsif';
  }
  return { type: 'Syntax', message, line, url };
}
