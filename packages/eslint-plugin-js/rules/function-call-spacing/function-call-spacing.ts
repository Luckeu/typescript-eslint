/**
 * @fileoverview Rule to control spacing within function calls
 * @author Matt DuVall <http://www.mattduvall.com>
 */

import type { Token, Tree } from '@shared/types'
import { LINEBREAK_MATCHER, isNotQuestionDotToken, isOpeningParenToken } from '../../utils/ast-utils'
import { createRule } from '../../utils/createRule'
import type { MessageIds, RuleOptions } from './types'

export default createRule<MessageIds, RuleOptions>({
  meta: {
    type: 'layout',

    docs: {
      description: 'Require or disallow spacing between function identifiers and their invocations',
      url: 'https://eslint.style/rules/js/function-call-spacing',
    },

    fixable: 'whitespace',

    schema: {
      anyOf: [
        {
          type: 'array',
          items: [
            {
              type: 'string',
              enum: ['never'],
            },
          ],
          minItems: 0,
          maxItems: 1,
        },
        {
          type: 'array',
          items: [
            {
              type: 'string',
              enum: ['always'],
            },
            {
              type: 'object',
              properties: {
                allowNewlines: {
                  type: 'boolean',
                },
              },
              additionalProperties: false,
            },
          ],
          minItems: 0,
          maxItems: 2,
        },
      ],
    },

    messages: {
      unexpectedWhitespace: 'Unexpected whitespace between function name and paren.',
      unexpectedNewline: 'Unexpected newline between function name and paren.',
      missing: 'Missing space between function name and paren.',
    },
  },

  create(context) {
    const never = context.options[0] !== 'always'
    const allowNewlines = !never && context.options[1] && context.options[1].allowNewlines
    const sourceCode = context.sourceCode
    const text = sourceCode.getText()

    /**
     * Check if open space is present in a function name
     * @param node node to evaluate
     * @param leftToken The last token of the callee. This may be the closing parenthesis that encloses the callee.
     * @param rightToken Tha first token of the arguments. this is the opening parenthesis that encloses the arguments.
     * @private
     */
    function checkSpacing(node: Tree.CallExpression | Tree.NewExpression | Tree.ImportExpression, leftToken: Token, rightToken: Token) {
      const textBetweenTokens = text.slice(leftToken.range[1], rightToken.range[0]).replace(/\/\*.*?\*\//gu, '')
      const hasWhitespace = /\s/u.test(textBetweenTokens)
      const hasNewline = hasWhitespace && LINEBREAK_MATCHER.test(textBetweenTokens)

      /**
       * never allowNewlines hasWhitespace hasNewline message
       * F     F             F             F          Missing space between function name and paren.
       * F     F             F             T          (Invalid `!hasWhitespace && hasNewline`)
       * F     F             T             T          Unexpected newline between function name and paren.
       * F     F             T             F          (OK)
       * F     T             T             F          (OK)
       * F     T             T             T          (OK)
       * F     T             F             T          (Invalid `!hasWhitespace && hasNewline`)
       * F     T             F             F          Missing space between function name and paren.
       * T     T             F             F          (Invalid `never && allowNewlines`)
       * T     T             F             T          (Invalid `!hasWhitespace && hasNewline`)
       * T     T             T             T          (Invalid `never && allowNewlines`)
       * T     T             T             F          (Invalid `never && allowNewlines`)
       * T     F             T             F          Unexpected space between function name and paren.
       * T     F             T             T          Unexpected space between function name and paren.
       * T     F             F             T          (Invalid `!hasWhitespace && hasNewline`)
       * T     F             F             F          (OK)
       *
       * T                   T                        Unexpected space between function name and paren.
       * F                   F                        Missing space between function name and paren.
       * F     F                           T          Unexpected newline between function name and paren.
       */

      if (never && hasWhitespace) {
        context.report({
          node,
          loc: {
            start: leftToken.loc.end,
            end: {
              line: rightToken.loc.start.line,
              column: rightToken.loc.start.column - 1,
            },
          },
          messageId: 'unexpectedWhitespace',
          fix(fixer) {
            // Don't remove comments.
            if (sourceCode.commentsExistBetween(leftToken, rightToken))
              return null

            // If `?.` exists, it doesn't hide no-unexpected-multiline errors
            if ('optional' in node && node.optional)
              return fixer.replaceTextRange([leftToken.range[1], rightToken.range[0]], '?.')

            /**
             * Only autofix if there is no newline
             * https://github.com/eslint/eslint/issues/7787
             */
            if (hasNewline)
              return null

            return fixer.removeRange([leftToken.range[1], rightToken.range[0]])
          },
        })
      }
      else if (!never && !hasWhitespace) {
        context.report({
          node,
          loc: {
            start: {
              line: leftToken.loc.end.line,
              column: leftToken.loc.end.column - 1,
            },
            end: rightToken.loc.start,
          },
          messageId: 'missing',
          fix(fixer) {
            if ('optional' in node && node.optional)
              return null // Not sure if inserting a space to either before/after `?.` token.

            return fixer.insertTextBefore(rightToken, ' ')
          },
        })
      }
      else if (!never && !allowNewlines && hasNewline) {
        context.report({
          node,
          loc: {
            start: leftToken.loc.end,
            end: rightToken.loc.start,
          },
          messageId: 'unexpectedNewline',
          fix(fixer) {
            /**
             * Only autofix if there is no newline
             * https://github.com/eslint/eslint/issues/7787
             * But if `?.` exists, it doesn't hide no-unexpected-multiline errors
             */
            if (!('optional' in node) || !node.optional)
              return null

            // Don't remove comments.
            if (sourceCode.commentsExistBetween(leftToken, rightToken))
              return null

            const range = [leftToken.range[1], rightToken.range[0]] as const
            const qdToken = sourceCode.getTokenAfter(leftToken)!

            if (qdToken.range[0] === leftToken.range[1])
              return fixer.replaceTextRange(range, '?. ')

            if (qdToken.range[1] === rightToken.range[0])
              return fixer.replaceTextRange(range, ' ?.')

            return fixer.replaceTextRange(range, ' ?. ')
          },
        })
      }
    }

    return {
      'CallExpression, NewExpression': function (node: Tree.CallExpression | Tree.NewExpression) {
        const lastToken = sourceCode.getLastToken(node)!
        const lastCalleeToken = sourceCode.getLastToken(node.callee)!
        const parenToken = sourceCode.getFirstTokenBetween(lastCalleeToken, lastToken, isOpeningParenToken)!
        const prevToken = parenToken && sourceCode.getTokenBefore(parenToken, isNotQuestionDotToken)!

        // Parens in NewExpression are optional
        if (!(parenToken && parenToken.range[1] < node.range[1]))
          return

        checkSpacing(node, prevToken, parenToken)
      },

      ImportExpression(node) {
        const leftToken = sourceCode.getFirstToken(node)!
        const rightToken = sourceCode.getTokenAfter(leftToken)!

        checkSpacing(node, leftToken, rightToken)
      },
    }
  },
})
