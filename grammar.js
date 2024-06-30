/// <reference types="tree-sitter-cli/dsl" />
// @ts-check
module.exports = grammar({
  name: "htmlaskama",

  externals: ($) => [
    $._expression_content,
    $._expression_filters_start, // FIX: not really working yet :(
    $._statement_content,
    $._html_comment,
    $._template_comment,
    $._argument_end,
  ],

  extras: () => [/\s+/],

  conflicts: ($) => [[$._filter_function, $._filter]],

  rules: {
    document: ($) => repeat($._node),

    identifier: () => /\w+/,
    _tag_name: ($) => alias($.identifier, $.tag_name),
    content: ($) => alias($.identifier, $.content),
    string: () => /"[^"]*"/,
    // text: () => /[^<>&\s{%]([^<>&\s{%]*[^<>&\s{%])?/,
    // TODO: come up with a more permissive match for text content
    text: ($) => $.content,

    _node: ($) =>
      choice(
        $.element,
        $.expression,
        $.statement,
        $.comment,
        alias($.identifier, $.text),
      ),

    operator: () => token(seq(choice("="))),
    // TODO: Test some edge cases for whitespace control (seems to be working fine)
    whitespace_control_operator: () => token(seq(choice("-", "~", "+"))),

    element: ($) =>
      choice(seq($.start_tag, repeat($._node), $.end_tag), $.self_closing_tag),

    start_tag: ($) =>
      seq("<", $._tag_name, repeat(choice($.attribute, $.statement)), ">"),
    end_tag: ($) => seq("</", $._tag_name, ">"),
    self_closing_tag: ($) =>
      seq("<", $._tag_name, repeat(choice($.attribute, $.statement)), "/>"),

    comment: ($) =>
      alias(
        choice(seq("{", $._template_comment), seq("<", $._html_comment)),
        $.comment,
      ),

    attribute: ($) =>
      seq(
        $.attribute_name,
        optional(seq("=", choice($.attribute_value, $.quoted_attribute_value))),
      ),

    attribute_name: () => /[^<>"'/=\s]+/,
    attribute_value: () => /[^<>"'=\s]+/,

    quoted_attribute_value: ($) =>
      choice(
        seq("'", optional(alias(/[^']+/, $.attribute_value)), "'"),
        seq('"', optional(alias(/[^"]+/, $.attribute_value)), '"'),
      ),

    expression: ($) =>
      seq(
        $.start_expression,
        alias($._expression_content, $.expression_content),
        $.end_expression,
      ),

    start_expression: ($) => seq("{{", optional($.whitespace_control_operator)),
    end_expression: ($) =>
      seq(
        // optional(seq($._expression_filters_start, $.filter)), // FIX:
        optional($.whitespace_control_operator),
        "}}",
      ),

    statement: ($) => choice($.unpaired_statement, $.paired_statement),

    unpaired_statement: ($) =>
      choice(
        $.extends_statement,
        $.include_statement,
        $.import_statement,
        $.call_statement,
        $.let_statement,
      ),

    paired_statement: ($) =>
      choice(
        $.for_statement,
        $.macro_statement,
        $.block_statement,
        $.match_statement,
        $.filter_block_statement,
        $.if_statement,
      ),

    let_statement: ($) =>
      seq(
        $.start_statement,
        alias(choice("let", "set"), $.keyword),
        $.identifier,
        $.operator,
        alias($._statement_content, $.statement_content),
        $.end_statement,
      ),

    start_statement: ($) => seq("{%", optional($.whitespace_control_operator)),
    end_statement: ($) => seq(optional($.whitespace_control_operator), "%}"),

    block_statement: ($) =>
      seq($.block_start_statement, repeat($._node), $.block_end_statement),

    block_start_statement: ($) =>
      seq(
        $.start_statement,
        alias("block", $.tag_name),
        $.identifier,
        $.end_statement,
      ),

    block_end_statement: ($) =>
      seq($.start_statement, alias("endblock", $.tag_name), $.end_statement),

    // TODO: Look at rust grammar for loop statements
    for_statement: ($) =>
      seq(
        $.start_statement,
        alias("for", $.tag_name),
        alias($._statement_content, $.statement_content),
        $.end_statement,
        repeat(choice($._node, $.attribute)),
        $.endfor_statement,
      ),

    endfor_statement: ($) =>
      seq($.start_statement, alias("endfor", $.tag_name), $.end_statement),

    call_statement: ($) =>
      seq(
        $.start_statement,
        alias("call", $.keyword),
        // $.identifier,
        // $.open_parent,
        // repeat($.argument),
        // $.close_parent,
        alias($._statement_content, $.statement_content),
        $.end_statement,
      ),

    include_statement: ($) =>
      seq(
        $.start_statement,
        alias("include", $.tag_name),
        alias($.string, $.path),
        $.end_statement,
      ),

    import_statement: ($) =>
      seq(
        $.start_statement,
        alias("import", $.tag_name),
        alias($.string, $.path),
        optional(seq(alias("as", $.keyword), $.identifier)),
        $.end_statement,
      ),

    argument: ($) => choice($.identifier, ","),

    open_parent: () => "(",
    close_parent: () => ")",

    macro_statement: ($) =>
      seq(
        $.macro_start_statement,
        $._node, // I have no idea why this works, i would imagine a repeat($._node) would be required here,
        // but that breaks everything, This does match multiple nodes (even though it's not repeated???)
        // FIX: very flaky behaviour here
        $.macro_end_statement,
      ),

    macro_start_statement: ($) =>
      seq(
        $.start_statement,
        alias("macro", $.tag_name),
        seq(
          $.identifier,
          $.open_parent,
          // FIX: also captures commas as `argument`
          alias(repeat($.argument), $.arguments),
          $.close_parent,
        ),
        $.end_statement,
      ),

    macro_end_statement: ($) =>
      seq($.start_statement, alias("endmacro", $.tag_name), $.end_statement),

    match_statement: ($) =>
      seq(
        prec.left($.match_start_statement),
        // optional($._node),
        repeat($.match_statement_branch),
        prec.right($.match_end_statement),
      ),

    // Janky but good enough.
    // TODO: add else block case (https://djc.github.io/askama/template_syntax.html#match)
    match_statement_branch: ($) =>
      prec.left(
        seq(
          $.start_statement,
          alias("when", $.keyword),
          alias($._statement_content, $.statement_content),
          $.end_statement,
          optional($._node),
        ),
      ),

    match_start_statement: ($) =>
      seq(
        $.start_statement,
        alias("match", $.tag_name),
        alias($._statement_content, $.statement_content),
        $.end_statement,
      ),

    // FIX: Tree is still messy here but it works for now
    _filter: ($) => seq($.identifier, optional(alias("|", $.operator))),
    filter: ($) => choice(alias($._filter_function, $.filter_call), $._filter),
    _filter_function: ($) =>
      seq(
        $.identifier,
        optional(
          seq(
            $.open_parent,
            choice($._filter_function, $._filter),
            $.close_parent,
          ),
        ),
        optional(alias("|", $.operator)),
      ),

    filter_block_statement: ($) =>
      seq(
        $.start_statement,
        alias("filter", $.tag_name),
        repeat($.filter),
        $.end_statement,
        optional(repeat($._node)),
        $.endfilter_statement,
      ),

    endfilter_statement: ($) =>
      seq($.start_statement, alias("endfilter", $.tag_name), $.end_statement),

    match_end_statement: ($) =>
      seq($.start_statement, alias("endmatch", $.tag_name), $.end_statement),

    extends_statement: ($) =>
      seq(
        $.start_statement,
        alias("extends", $.tag_name),
        alias($.string, $.path),
        $.end_statement,
      ),

    if_statement: ($) =>
      prec.left(
        seq(
          $.start_statement,
          alias("if", $.tag_name),
          alias($._statement_content, $.statement_content),
          $.end_statement,
          optional(repeat(choice($._node, $.attribute))),
          repeat(
            prec.left(
              seq(
                alias($.elif_statement, $.branch_statement),
                optional($._node),
              ),
            ),
          ),
          optional(
            seq(
              alias($.else_statement, $.branch_statement),
              optional(repeat(choice($._node, $.attribute))),
            ),
          ),
          $.endif_statement,
        ),
      ),
    else_statement: ($) =>
      seq($.start_statement, alias("else", $.tag_name), $.end_statement),
    elif_statement: ($) =>
      seq(
        $.start_statement,
        alias("elif", $.tag_name),
        alias($._statement_content, $.statement_content),
        $.end_statement,
      ),
    endif_statement: ($) => seq("{%", alias("endif", $.tag_name), "%}"),
  },
});
