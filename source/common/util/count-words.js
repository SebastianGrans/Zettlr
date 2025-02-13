/**
 * BEGIN HEADER
 *
 * Contains:        Utility function
 * CVM-Role:        <none>
 * Maintainer:      Hendrik Erz
 * License:         GNU GPL v3
 *
 * Description:     This file contains a utility function to count words.
 *
 * END HEADER
 */

// An array of Markdown block elements
const BLOCK_ELEMENTS = require('../data.json').block_elements

/**
 * Returns an accurate word count.
 * @param  {String} words The Markdown text to count
 * @param {Boolean} countChars Whether to count chars instead
 * @return {Number}       The number of words in the file.
 */
module.exports = function (words, countChars = false) {
  if (!words || typeof words !== 'string') return 0

  words = words.split(/[\s ]+/)

  let i = 0

  // Remove block elements from word count to get a more accurate count.
  while (i < words.length) {
    if (BLOCK_ELEMENTS.includes(words[i])) {
      words.splice(i, 1)
    } else {
      i++
    }
  }

  if (countChars) words = [...words.join('')]

  return words.length
}
