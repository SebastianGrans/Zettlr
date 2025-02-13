/* global CodeMirror $ define */
// This plugin renders MathJax parts in CodeMirror instances

(function (mod) {
  if (typeof exports === 'object' && typeof module === 'object') { // CommonJS
    mod(require('../../../node_modules/codemirror/lib/codemirror'))
  } else if (typeof define === 'function' && define.amd) { // AMD
    define(['../../../node_modules/codemirror/lib/codemirror'], mod)
  } else { // Plain browser env
    mod(CodeMirror)
  }
})(function (CodeMirror) {
  'use strict'

  // Matches all inlines and displays with non-escaped (double-)dollar-signs.
  // Alternatives:
  // 1. Inline Math Equation, beginning at char 0
  // 2. Inline Math Equation within a paragraph (preceeded by other chars)
  // 3. Display Math Equation, beginning at char 0
  // 4. Display Math Equation within a paragraph (preceeded by other chars)
  var mathRE = /^\$\$(.*?[^\\$]+?)\$\$|(?<=[^\\$])\$\$(.*?[^\\$]+?)\$\$|^\$(.*?[^\\$]+?)\$|(?<=[^\\])\$(.*?[^\\$]+?)\$/g
  var mathMarkers = []

  CodeMirror.commands.markdownRenderMath = function (cm) {
    let i = 0
    let match

    // First remove iFrames that don't exist anymore. As soon as someone
    // moves the cursor into the link, it will be automatically removed,
    // as well as if someone simply deletes the whole line.
    do {
      if (!mathMarkers[i]) {
        continue
      }
      if (mathMarkers[i] && mathMarkers[i].find() === undefined) {
        // Marker is no longer present, so splice it
        mathMarkers.splice(i, 1)
      } else {
        i++
      }
    } while (i < mathMarkers.length)

    // Now render all potential new Math elements
    let isMultiline = false // Are we inside a multiline?
    let eq = ''
    let fromLine = i

    for (let i = 0; i < cm.lineCount(); i++) {
      if (cm.getModeAt({ 'line': i, 'ch': 0 }).name !== 'markdown') continue
      // Reset the index of the expression everytime we enter a new line.
      mathRE.lastIndex = 0

      // This array holds all markers to be inserted (either one in case of the
      // final line of a multiline-equation or multiple in case of several
      // inline equations).
      let newMarkers = []

      let line = cm.getLine(i)
      if (!isMultiline && line === '$$') {
        isMultiline = true
        fromLine = i
        eq = ''
      } else if (isMultiline && line !== '$$') {
        // Simply add the line to the equation and continue
        eq += line + '\n'
        continue
      } else if (isMultiline && line === '$$') {
        // We have left the multiline equation and can render it now.
        isMultiline = false
        newMarkers.push({
          'curFrom': { 'ch': 0, 'line': fromLine },
          'curTo': { 'ch': 2, 'line': i },
          'eq': eq
        })
        eq = '' // Reset the equation
      } else {
        // Else: No multiline. Search for inlines.
        while ((match = mathRE.exec(line)) != null) {
          newMarkers.push({
            'curFrom': { 'ch': match.index, 'line': i },
            'curTo': { 'ch': match.index + match[0].length, 'line': i },
            // An equation may be found in any of the four capturing groups
            'eq': match[1] || match[2] || match[3] || match[4] || ''
          })
        }
      }

      // Now cycle through all new markers and insert them, if they weren't
      // already
      for (let myMarker of newMarkers) {
        let cur = cm.getCursor('from')
        let isMulti = myMarker.curFrom.line !== myMarker.curTo.line
        if (isMulti && cur.line >= myMarker.curFrom.line && cur.line <= myMarker.curTo.line) {
          // We're directly in the multiline equation, so don't render.
          continue
        } else if (!isMulti && cur.line === myMarker.curFrom.line && cur.ch >= myMarker.curFrom.ch && cur.ch <= myMarker.curTo.ch) {
          // Again, we're right in the middle of an inline-equation, so don't render.
          continue
        }

        let isRendered = false
        let marks = cm.findMarks(myMarker.curFrom, myMarker.curTo)
        for (let marx of marks) {
          if (mathMarkers.includes(marx)) {
            isRendered = true
            break
          }
        }

        // Also in this case simply skip.
        if (isRendered) continue

        // Use jQuery for simple creation of the DOM element
        let elem = $(`<span class="preview-math"></span>`)[0]

        let textMarker = cm.markText(
          myMarker.curFrom, myMarker.curTo,
          {
            'clearOnEnter': true,
            'replacedWith': elem,
            'inclusiveLeft': false,
            'inclusiveRight': false
          }
        )

        // Enable on-click closing of rendered Math elements.
        elem.onclick = (e) => { textMarker.clear() }

        require('katex').render(myMarker.eq, elem, { throwOnError: false })

        // Now the marker has obviously changed
        textMarker.changed()

        // Finally push the marker
        mathMarkers.push(textMarker)
      } // End for all markers
    } // End for lines
  } // End command
})
